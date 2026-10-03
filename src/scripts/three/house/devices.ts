import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { buildProduct } from '../procedural';
import type { StopConfig } from './types';
import products from '@/data/products.json';

/**
 * A soft contact shade on the surface behind a device. Where a device sits on a wall the room light never quite reaches right
 * round it; this grounding shade is what makes it read as mounted, not pasted on.
 *  – analytic: the shade is a function of the distance (in metres) to the device's footprint, a rounded rectangle or a circle,
 *    so it is exact at any size and aspect (a baked texture stretched over a long panel or a door lock went blotchy);
 *  – it only darkens (black at an alpha), and the alpha reaches exactly zero, with a zero slope, well inside the quad: no edge;
 *  – the post passes never see it. GTAO (normals + depth) and the lens (depth) draw the scene with an override material; the
 *    quad 0.4 mm off the wall then stood in their buffers as a surface of its own, and the occlusion drew its outline as a
 *    lighter rectangle with a dark rim round every device. It draws only with its own material, so those passes see the wall.
 */
const shadeVert = /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const shadeFrag = /* glsl */ `
uniform vec2 uHalf; uniform float uR, uM, uK; varying vec2 vP;
void main() {
  vec2 q = abs(vP) - uHalf + uR;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;          // signed distance to the footprint (m), < 0 under the device
  float t = 1.0 - smoothstep(-0.3 * uM, uM, d);                            // full just inside the edge, exactly 0 (and flat) at uM
  gl_FragColor = vec4(0.0, 0.0, 0.0, uK * t * t);
}`;
/**
 * @param w,h  the footprint (m) · @param r its corner radius (a circle: r = w / 2 = h / 2) · @param m the reach beyond the edge (m)
 * @param down how far the shade sits below the footprint (m): the room's light comes from the ceiling, so it falls a little low
 */
function contactShade(cx: number, cy: number, w: number, h: number, r: number, m: number, down: number, strength: number) {
  const mat = new THREE.ShaderMaterial({ uniforms: { uHalf: { value: new THREE.Vector2(w / 2, h / 2) }, uR: { value: Math.min(r, w / 2, h / 2) }, uM: { value: m }, uK: { value: strength } }, vertexShader: shadeVert, fragmentShader: shadeFrag, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pad = m * 1.15 + down; // the quad reaches past the zero line: nothing of it is left to show
  const geo = new THREE.PlaneGeometry(w + pad * 2, h + pad * 2);
  const q = new THREE.Mesh(geo, mat); q.position.set(cx, cy - down, -0.0036); q.renderOrder = 1; q.name = 'contact-shadow'; q.castShadow = false; q.receiveShadow = false;
  q.onBeforeRender = (_r, _s, _c, g, used) => { g.setDrawRange(0, used === mat ? Infinity : 0); }; // override passes (AO, depth) skip it
  return q;
}

/**
 * A reflection probe for a device outdoors (the lock on the front door). The sky's environment map knows nothing of the porch round
 * it: a gloss-black lock mirrored one flat, even sky and read as a milky plastic. Real piano black is black where it faces the porch
 * soffit and the door, and draws the bright court, the gate and the sky as crisp shapes. So, once, the scene is captured from just in
 * front of the device into a cube map (HDR, linear), prefiltered, and handed to the device's materials as their reflection map.
 * The capture runs the first time the device is drawn with the camera near it (the warm-up visits every stop, after the textures
 * have loaded), between frames: the door is set closed for it and the device hidden, the photographed sky stands in as background.
 */
function outdoorProbe(holder: THREE.Object3D, near = 3) {
  const first = holder.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined; if (!first) return;
  let done = false; const at = new THREE.Vector3();
  const prev = first.onBeforeRender;
  first.onBeforeRender = function (renderer, scene, camera, ...rest) {
    prev.call(this, renderer, scene, camera, ...rest);
    if (done || !(scene as THREE.Scene).isScene || !(scene as THREE.Scene).environment) return;
    if (camera.getWorldPosition(at).distanceTo(holder.getWorldPosition(new THREE.Vector3())) > near) return;
    done = true; setTimeout(() => capture(renderer, scene as THREE.Scene), 0);
  };
  const capture = (renderer: THREE.WebGLRenderer, scene: THREE.Scene) => {
    // the door closed (the lock's hinge is three levels up: mount → leaf → hinge), the device out of its own reflection
    const hinge = holder.parent?.parent?.parent, yaw = hinge ? hinge.rotation.y : 0;
    if (hinge) { hinge.rotation.y = 0; hinge.updateMatrixWorld(true); }
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3());
    const n = new THREE.Vector3(0, 0, 1).transformDirection(holder.matrixWorld);
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cam = new THREE.CubeCamera(0.03, 600, rt); cam.position.copy(c).addScaledVector(n, 0.09); scene.add(cam); cam.updateMatrixWorld(true);
    const bg = scene.background, bi = scene.backgroundIntensity, bb = scene.backgroundBlurriness, vis = holder.visible, ov = scene.overrideMaterial, ac = renderer.autoClear;
    scene.overrideMaterial = null; renderer.autoClear = true; scene.background = scene.environment; scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0; holder.visible = false;
    try {
      cam.update(renderer, scene);
      const pm = new THREE.PMREMGenerator(renderer), env = pm.fromCubemap(rt.texture).texture; pm.dispose();
      holder.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh || o.name === 'contact-shadow') return; for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) if (mt.isMeshStandardMaterial) { mt.envMap = env; mt.needsUpdate = true; } });
    } catch (e) { console.warn('[devices] reflection probe failed', e); }
    finally {
      scene.background = bg; scene.backgroundIntensity = bi; scene.backgroundBlurriness = bb; holder.visible = vis; scene.overrideMaterial = ov; renderer.autoClear = ac; scene.remove(cam); rt.dispose();
      if (hinge) { hinge.rotation.y = yaw; hinge.updateMatrixWorld(true); }
    }
  };
}

/**
 * Mount one device per stop. Precedence: a named `anchor_<id>` node in the model, then an
 * explicit mount object (e.g. the door leaf), then the JSON pos/rot. The recipe's -Z face is the
 * mounting face; the holder's +Z is the surface normal. The device's box centre lands on the point, unless the recipe names
 * an `origin` (the curtain track: its motor hangs below one end, and the track, not the box, belongs at the authored height).
 * A recipe that stands off its surface on feet (the track's brackets) names each foot `contact` (userData w, h in the node's own
 * units) and is shaded there only.
 */
export async function mountDevices(stops: StopConfig[], anchors: Map<string, THREE.Object3D>, parent: THREE.Object3D, mounts: Map<string, THREE.Object3D> = new Map(), roomEnv?: THREE.Texture) {
  const out = new Map<string, THREE.Object3D>();
  for (const s of stops) {
    const product = (products as { slug: string; shape: string; shapeParams: Record<string, unknown>; accent: string; model: boolean }[]).find((p) => p.slug === s.product);
    if (!product || !s.device) continue; // the app stop is a view of the room, with no device of its own
    const stop = { ...s, device: s.device };
    let obj: THREE.Object3D | null = null;
    if (stop.device.source === 'glb' || product.model) {
      try { const l = new GLTFLoader(); const d = new DRACOLoader(); d.setDecoderPath('/draco/'); l.setDRACOLoader(d); obj = (await l.loadAsync(`/models/${product.slug}.glb`)).scene; } catch { obj = null; }
    }
    if (!obj) obj = buildProduct(product.shape, { ...product.shapeParams, ...(stop.device.params ?? {}) }, product.accent);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const k = stop.device.scale / Math.max(size.x, size.y, size.z);
    const holder = new THREE.Group(); holder.name = `device_${stop.id}`;
    obj.scale.setScalar(k); holder.add(obj); obj.updateMatrixWorld(true); // holder not placed yet: world space is holder space
    const origin = obj.getObjectByName('origin');
    if (origin) { const o = origin.getWorldPosition(new THREE.Vector3()); obj.position.x -= o.x; obj.position.y -= o.y; obj.updateMatrixWorld(true); }
    const sb = new THREE.Box3().setFromObject(obj); obj.position.z -= sb.min.z; obj.updateMatrixWorld(true);
    const feet: THREE.Object3D[] = []; obj.traverse((o) => { if (o.name === 'contact') feet.push(o); });
    const anchor = anchors.get(`anchor_${stop.id}`), mount = stop.device.mount ? mounts.get(stop.device.mount) : undefined;
    // grounding shade on the surface behind it, reaching about as far as the device stands proud: low on walls (the room light
    // comes from the ceiling), centred on ceilings and on the door leaf (the lock stands in the open, lit from all round)
    const onCeiling = Math.abs((stop.device.rot ?? [0, 0, 0])[0]) > 1, round = product.shape === 'disc' || product.shape === 'puck';
    const strength = onCeiling ? 0.24 : 0.34;
    if (feet.length) {
      for (const f of feet) { const p = f.getWorldPosition(new THREE.Vector3()), u = f.getWorldScale(new THREE.Vector3()).x, w = (f.userData.w ?? 1) * u, h = (f.userData.h ?? 1) * u, m = Math.min(w, h) * 0.45; holder.add(contactShade(p.x, p.y, w, h, Math.min(w, h) * 0.15, m, onCeiling ? 0 : m * 0.25, strength)); }
    } else {
      const s = sb.getSize(new THREE.Vector3()), c = sb.getCenter(new THREE.Vector3()), m = THREE.MathUtils.clamp(s.z * 1.2 + 0.004, 0.008, 0.05);
      holder.add(contactShade(c.x, c.y, s.x, s.y, round ? Math.min(s.x, s.y) / 2 : Math.min(s.x, s.y) * 0.06, m, onCeiling || stop.device.mount ? 0 : m * 0.3, strength));
    }
    if (anchor) { anchor.getWorldPosition(holder.position); anchor.getWorldQuaternion(holder.quaternion); parent.add(holder); }
    else if (mount) { mount.add(holder); }
    else { holder.position.set(...(stop.device.pos ?? [0, 0, 0])); holder.rotation.set(...(stop.device.rot ?? [0, 0, 0])); parent.add(holder); }
    holder.translateZ(0.004);
    holder.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && o.name !== 'contact-shadow') { m.castShadow = true; m.receiveShadow = false; if (roomEnv && !stop.device.mount) { const mat = m.material as THREE.MeshStandardMaterial; if (mat.isMeshStandardMaterial) mat.envMap = roomEnv; } } }); // indoor devices reflect the room, the lock on the door reflects the sky
    if (stop.device.mount) outdoorProbe(holder);
    out.set(stop.id, holder);
  }
  return out;
}
