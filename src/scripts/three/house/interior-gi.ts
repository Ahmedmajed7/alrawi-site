/**
 * Bounced light for the ground floor. A lattice of irradiance probes (three's LightProbeGridWebGL: L2 spherical harmonics in
 * a 3D texture that every lit material reads) is baked once, on the GPU, from the finished scene: what each probe sees — the
 * sun patches, the pools under the downlights, the glowing coves, the sky through the windows — becomes the light the rooms
 * give back. That is what a flat ambient term can never do: a wall beside a sun patch warms up, a corner far from any lamp
 * goes quiet, the ceiling over a lit floor lifts.
 *
 * The lattice is laid so that no probe sits inside a wall and its planes straddle every wall (half a step either side), and
 * its outer shell is never baked (black): with a second, empty volume in the scene the renderer picks a volume by
 * containment, so the villa shell, the garden and the street never read ours, and whatever is clamped to the shell gets nothing.
 */
import * as THREE from 'three';
import { LightProbeGridWebGL } from 'three/examples/jsm/lighting/LightProbeGridWebGL.js';

/** The lattice (metres). `safe*` = the baked probes; interior-surface.ts keeps every lookup of a large surface inside them. */
export const GI = {
  min: [-3.65, 0.15, -7.48] as const, step: [0.7, 0.8, 0.7] as const, res: [13, 5, 12] as const,
  safeMin: [-2.95, 0.95, -6.78] as const, safeMax: [4.05, 2.55, -0.48] as const,
  /** the entrance wing's own probes (x), the last plane of the main room (z), and the wall plane between the two (z) */
  wingX: [-0.15, 3.35] as const, mainZ: -1.88, split: -1.53,
};

export interface RoomGI { group: THREE.Group; /** 'wait' until the first frame is drawn with every texture in */ readonly state: 'wait' | 'baking' | 'done' | 'failed'; dispose(): void }

/**
 * `uGI` is the surfaces' switch from their stand-in ambient to the probes (set to 1 when the bake is in); `ready` says when the
 * interior's textures are loaded (a probe that sees an unloaded texture sees black); `hide` = what must not be in a probe's
 * view (glass: a probe looks through a window, it does not render its transmission pass 2,000 times).
 */
export function createRoomGI(o: { record: boolean; uGI: { value: number }; ready: () => boolean; hide: THREE.Object3D[]; /** puts what moves (the drapes) where the probes shall see it; returns what puts it back */ pose?: () => () => void }): RoomGI {
  const group = new THREE.Group(); group.name = 'room-gi';
  const [nx, ny, nz] = GI.res, size = GI.res.map((n, i) => (n - 1) * GI.step[i]);
  const grid = new LightProbeGridWebGL(size[0], size[1], size[2], nx, ny, nz);
  grid.position.set(GI.min[0] + size[0] / 2, GI.min[1] + size[1] / 2, GI.min[2] + size[2] / 2); grid.updateBoundingBox();
  const spare = new LightProbeGridWebGL(1, 1, 1, 2, 2, 2); spare.position.set(0, -400, 0); spare.updateBoundingBox(); // never baked: its only job is to be the second volume
  // the renderer hands itself over in onBeforeRender: a speck under the floor that is always drawn, and drawn first
  const speck = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, -3, 0, 0.001, -3, 0, 0, -3, 0.001], 3)), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  speck.frustumCulled = false; speck.renderOrder = -1000; speck.castShadow = false; speck.name = 'room-gi-speck';
  group.add(grid, spare, speck);
  let state: RoomGI['state'] = 'wait';

  const bake = (renderer: THREE.WebGLRenderer, scene: THREE.Scene) => {
    const t0 = performance.now(), undo: (() => void)[] = [];
    const hide = (ob?: THREE.Object3D | null) => { if (ob && ob.visible) { ob.visible = false; undo.push(() => { ob.visible = true; }); } };
    // the garden and the street are 40,000 instances a probe would draw 2,000 times for a sliver of window: the sky map stands in for
    // them (its lower half is the sand's bounce); the front door is open whenever the camera is indoors, so the probes see it open
    for (const name of ['environment', 'door_walnut', 'door_steel']) hide(scene.getObjectByName(name));
    for (const ob of o.hide) hide(ob);
    if (o.pose) { undo.push(o.pose()); scene.updateMatrixWorld(true); }
    scene.traverse((ob) => { const m = ob as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return; const mt = m.material as THREE.MeshPhysicalMaterial; if (mt && mt.isMeshPhysicalMaterial && mt.transmission > 0) hide(m); });
    const bg = scene.background, bi = scene.backgroundIntensity, bb = scene.backgroundBlurriness;
    scene.background = scene.environment; scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0.25;
    try {
      const cubemapSize = o.record ? 16 : 8, passes = o.record ? 3 : 2; // the first pass is the direct light, each further pass one bounce
      for (let pass = 0; pass < passes; pass++) {
        grid.bake(renderer, scene, { cubemapSize, near: 0.04, far: 60, start: 0, count: 1, pass }); // probe 0 opens a pass (it snapshots the last one)
        for (let iy = 1; iy < ny - 1; iy++) for (let iz = 1; iz < nz - 1; iz++) grid.bake(renderer, scene, { cubemapSize, near: 0.04, far: 60, start: 1 + iz * nx + iy * nx * nz, count: nx - 2, pass });
      }
    } finally {
      scene.background = bg; scene.backgroundIntensity = bi; scene.backgroundBlurriness = bb;
      for (const u of undo) u();
      renderer.shadowMap.needsUpdate = true; // the probes' shadow maps were drawn without the garden
    }
    o.uGI.value = 1;
    console.warn(`[interior] probe grid: ${(nx - 2) * (ny - 2) * (nz - 2)} probes baked in ${Math.round(performance.now() - t0)} ms`);
  };
  speck.onBeforeRender = (renderer, scene) => {
    if (state !== 'wait' || !(scene as THREE.Scene).isScene || (scene as THREE.Scene).overrideMaterial || !o.ready()) return;
    state = 'baking';
    try { bake(renderer, scene as THREE.Scene); state = 'done'; }
    catch (e) { console.warn('[interior] probe grid unavailable, keeping the stand-in ambient', e); state = 'failed'; o.uGI.value = 0; group.remove(grid, spare); grid.dispose(); }
  };
  return { group, get state() { return state; }, dispose() { grid.dispose(); spare.dispose(); speck.geometry.dispose(); (speck.material as THREE.Material).dispose(); } };
}
