/**
 * The entrance court, built in code where the Tripo shell was melted (villa.json cuts `court-*`): the garden wall either side of
 * the steel gate, its two gate piers (the lanterns of interior.ts stand on their caps), the end pier where the east wall meets the
 * porch pier, the facade fin behind the east gate pier up to the porch canopy, a stone sill under the gate, planting beds at the
 * wall's foot, the video intercom and the house number.
 *
 * What makes it read as built rather than modelled: every block is a rounded box (a 4 mm eased arris catches a hairline of light,
 * as a floated render corner does: never razor-sharp, never melted); the render and the stone are mapped by world position, so
 * nothing stretches and the grain runs on round a corner; the render carries a broad trowel mottle, a dusty splash zone at the
 * foot and faint runs under the coping; the coping and the caps are separate honed stones with real 4 mm joints, each cut from
 * its own part of the slab and a shade of its own; the piers stand 4 cm proud of the wall behind a recessed joint.
 *
 * Heights: the shell's own tops (the west planter mass behind the wall, the east wing) are at y 1.60; the coping and the caps
 * finish at 1.61 so they lap the torn edges the cuts leave in those tops.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tier } from '../common';
import { bush, leafCard } from './vegetation';
import { windify, WORLD_TIME, WIND } from './wind';

export interface Court { group: THREE.Group; dispose(): void }

const TOP = 1.61, COPE = 0.05, CAP = 0.08, OVER = 0.03, EASE = 0.004, JOINT = 0.004;
const FACE = 3.52;                   // the walls' street face (the shell's was 3.50)
const PF = 3.56, PB = 3.06;          // the piers' front (4 cm proud of the wall) and back: the open gate leaves (hinged at z 3.1) swing clear behind it
// the gate's clear opening (house.json gate: x −0.35, 1.8 wide); the piers' inner faces stand 3 mm into it, so the gate's jambs hide
// wholly inside them (face to face on one plane, the jamb flickered through the pier's edge as a column of bright dashes)
const GL = -1.247, GR = 0.547;
const LUM = 'vec3(0.2126, 0.7152, 0.0722)';

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
/** A box from corner to corner with every edge eased (radius r), non-indexed so it merges with anything. */
const rb = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = EASE) => {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  return ni(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2))).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
};
const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list, false)!;
/** A stone: its own shade (vertex colour) and its own place in the slab (aSeed shifts its texture). */
function stone(g: THREE.BufferGeometry, rnd: () => number) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3), seed = new Float32Array(n).fill(rnd());
  const k = 0.95 + 0.08 * rnd(), warm = (rnd() - 0.5) * 0.03;
  for (let i = 0; i < n; i++) col.set([k * (1 + warm), k, k * (1 - warm)], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); return g;
}
/** A run of coping stones along x from a0 to a1 (joints JOINT wide), each about `len` long. */
function copingRun(a0: number, a1: number, z0: number, z1: number, len: number, rnd: () => number) {
  const n = Math.max(1, Math.round((a1 - a0) / len)), L = (a1 - a0 - JOINT * (n - 1)) / n, out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) { const x = a0 + i * (L + JOINT); out.push(stone(rb(x, x + L, TOP - COPE, TOP, z0, z1, 0.005), rnd)); }
  return out;
}

const tl = new THREE.TextureLoader();
function tex(url: string, srgb = false) { const t = tl.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }

/**
 * World-position mapping (metres per tile; the dominant axis of the world normal picks the plane), shared by the render and
 * the stone. `seeded`: the geometry's aSeed shifts each stone's patch of the texture. `frag` runs on diffuseColor after the map.
 */
function worldMap<T extends THREE.MeshStandardMaterial>(mat: T, o: { tile: number; key: string; seeded?: boolean; /** replaces the plain colour × map */ frag?: string; uniforms?: Record<string, THREE.IUniform>; normal2?: boolean }): T {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, o.uniforms ?? {});
    sh.vertexShader = `varying vec3 vCw; varying vec3 vCn;\n${o.seeded ? 'attribute float aSeed;\n' : ''}` + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      { vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; vec3 wn = normalize(mat3(modelMatrix) * normal); vec3 an = abs(wn); vCw = wp; vCn = wn;
        vec2 wuv = (an.y > 0.5 ? wp.xz : an.x > an.z ? vec2(wp.z, wp.y) : wp.xy) / ${o.tile.toFixed(3)}${o.seeded ? ' + vec2(fract(aSeed * 7.13), fract(aSeed * 3.71)) * 4.0' : ''};
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wuv;
        #endif
      }`);
    sh.fragmentShader = 'varying vec3 vCw; varying vec3 vCn;\n' + Object.keys(o.uniforms ?? {}).map((k) => `uniform sampler2D ${k};`).join('\n') + '\n' + sh.fragmentShader;
    if (o.frag) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP\n${o.frag}\n#endif`);
    // a second, larger read of the normal map blended in: the tile never repeats visibly
    if (o.normal2) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0, mapN2 = texture2D(normalMap, vNormalMapUv * 0.37 + vec2(0.31, 0.57)).xyz * 2.0 - 1.0;
        mapN = normalize(mix(mapN, mapN2, 0.45)); mapN.xy *= normalScale; normal = normalize(tbn * mapN);
      #endif`);
  };
  mat.customProgramCacheKey = () => o.key;
  return mat;
}

/** The house number, Arabic-Indic and Latin either side of a hairline: white on black, read as the alpha of the brass. */
function numberTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 224; const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '300 150px Jost, "Helvetica Neue", Arial, sans-serif'; g.fillText('27', 146, 120);
  g.font = '500 150px Cairo, "Geeza Pro", "Noto Naskh Arabic", sans-serif'; g.fillText('٢٧', 372, 104);
  g.fillRect(257, 52, 3, 124);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}

export function buildCourt(tier: Tier): Court {
  const group = new THREE.Group(); group.name = 'court';
  const high = tier === 'high', rnd = mulberry32(2711);
  const textures: THREE.Texture[] = [];
  const T = (url: string, srgb = false) => { const t = tex(url, srgb); textures.push(t); return t; };

  /* ---------- materials ---------- */
  // sand-float render over blockwork, matched to what the shell's baked albedo gives where the two meet (#a3–#bd warm beige): the
  // plaster scan's luminance modulates the colour a little, the limewash mottle lays broad trowel clouds over it, dust at the foot;
  // the exterior render scan gives the fine sand grain (the limewash normal, tried first, read as diagonal brush strokes in the sun)
  const mottle = T('/textures/interior/limewash_mottle.webp');
  const render = worldMap(new THREE.MeshStandardMaterial({ color: '#bcab90', roughness: 0.92, map: T('/textures/env/plaster_diff.webp', true), normalMap: T('/textures/env/render_nor.webp'), normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.85 }), {
    tile: 1.2, key: 'court-render', normal2: true, uniforms: { uMottle: { value: mottle } }, frag: `{
      float l = dot(texture2D(map, vMapUv).rgb, ${LUM}) / 0.375, big = dot(texture2D(map, vMapUv * 0.13 + 0.37).rgb, vec3(0.3333)) / 0.375;
      vec2 mw = abs(vCn.y) > 0.5 ? vCw.xz : vec2(vCw.x + vCw.z, vCw.y);
      float mot = texture2D(uMottle, mw / 3.1).r * 2.0 - 1.0, n = texture2D(uMottle, mw / 0.83 + 0.3).r * 2.0;
      diffuseColor.rgb *= mix(1.0, l, 0.3) * mix(1.0, big, 0.25) * (1.0 + 0.14 * mot);
      float up = 1.0 - abs(vCn.y);
      float foot = (1.0 - smoothstep(0.0, 0.2 + 0.22 * n, vCw.y)) * up;                                  // dust and rain splash at the foot
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.27, 0.2) * (0.85 + 0.2 * n), foot * 0.42);
      diffuseColor.rgb *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.05, vCw.y)) * up;                           // the damp line on the ground
      float run = smoothstep(0.62, 1.0, texture2D(map, vec2((vCw.x + vCw.z) * 0.9, vCw.y * 0.035)).g / 0.375 * 0.8) * up * smoothstep(0.5, 1.4, vCw.y);
      diffuseColor.rgb *= 1.0 - run * 0.07;                                                                 // faint runs under the coping
    }` });
  // honed limestone (the travertine scan, veins along the run): coping, caps, sill, bed edging; each stone its own shade
  const stoneMat = worldMap(new THREE.MeshStandardMaterial({ color: '#e2dacb', vertexColors: true, roughness: 1, map: T('/textures/interior/travertine_diff.webp', true), normalMap: T('/textures/interior/travertine_nor.webp'), normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: T('/textures/interior/travertine_rough.webp'), envMapIntensity: 0.75 }), { tile: 1.3, key: 'court-stone', seeded: true });
  // bark mulch over the beds' soil
  const soil = worldMap(new THREE.MeshStandardMaterial({ color: '#c9b9a6', roughness: 1, map: T('/textures/env/gravel_diff.webp', true), normalMap: T('/textures/env/gravel_nor.webp'), normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 0.5 }), { tile: 0.8, key: 'court-soil' });
  // the metal of the gate and the front door: satin dark-bronze anodised aluminium (door.ts)
  const bronze = new THREE.MeshPhysicalMaterial({ color: '#463c32', metalness: 1, roughness: 0.35, envMapIntensity: 1.1 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c9c7c2', metalness: 1, roughness: 0.28, envMapIntensity: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#07080a', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1 });
  const led = new THREE.MeshStandardMaterial({ color: '#10141a', emissive: '#bcdcff', emissiveIntensity: 2.2, roughness: 0.4 });     // the call button's ring
  const label = new THREE.MeshStandardMaterial({ color: '#1a1712', emissive: '#fff1d6', emissiveIntensity: 0.55, roughness: 0.5 });  // the backlit name strip
  const numerals = new THREE.MeshStandardMaterial({ color: '#b08d5a', metalness: 1, roughness: 0.42, alphaMap: numberTexture(), alphaTest: 0.5, envMapIntensity: 0.8 });
  textures.push(numerals.alphaMap!);
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.7, map: leafCard(), alphaTest: 0.5 });
  const mats: THREE.Material[] = [render, stoneMat, soil, bronze, steel, glass, led, label, numerals, leafMat];

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast && high; m.receiveShadow = true; group.add(m); return m; };

  /* ---------- masonry ---------- */
  const R: THREE.BufferGeometry[] = [], S: THREE.BufferGeometry[] = [];
  const Y0 = -0.05, WT = TOP - COPE; // the render runs from under the ground to the coping's bed
  // WEST: the front of the planter mass (the shell's mass carries on behind z 2.62 at the same height), the gate pier, the recessed joint between them
  R.push(rb(-3.48, -1.77, Y0, WT, 2.6, FACE));
  R.push(rb(GL - 0.5, GL, Y0, TOP - CAP, PB, PF));
  R.push(rb(-1.775, -1.745, Y0, WT, PB + 0.01, FACE - 0.015));
  S.push(...copingRun(-3.51, -1.785, 2.58, FACE + OVER, 0.9, rnd));
  S.push(stone(rb(GL - 0.5 - OVER, GL + OVER, TOP - CAP, TOP, PB - OVER, PF + OVER, 0.005), rnd));
  // EAST: the gate pier, the wall, the end pier against interior.ts's porch pier (x 3.84…4.24, front z 2.78) and the east wing (front z 3.22)
  R.push(rb(GR, GR + 0.5, Y0, TOP - CAP, PB, PF));
  R.push(rb(GR + 0.52, 3.82, Y0, WT, 3.2, FACE));
  R.push(rb(GR + 0.495, GR + 0.525, Y0, WT, 3.215, FACE - 0.015), rb(3.815, 3.845, Y0, WT, 3.215, FACE - 0.015));
  R.push(rb(3.84, 4.24, Y0, TOP - CAP, 2.77, PF));
  S.push(...copingRun(GR + 0.535, 3.805, 3.2 - OVER, FACE + OVER, 0.9, rnd));
  S.push(stone(rb(GR - OVER, GR + 0.5 + OVER, TOP - CAP, TOP, PB - OVER, PF + OVER, 0.005), rnd));
  S.push(stone(rb(3.81, 4.27, TOP - CAP, TOP, 2.77, PF + OVER, 0.005), rnd));
  // the facade fin behind the east gate pier, from the ground up into the shell's own fin (x 0.56…0.945, z 2.64…2.87 above y 3.4)
  R.push(rb(0.555, 0.95, Y0, 3.46, 2.6, 2.875));
  // the sill under the gate: one honed stone between the piers, 2 mm proud of the path slabs (top 0.03)
  S.push(stone(rb(GL, GR, -0.03, 0.032, PB, PF, 0.004), rnd));
  // up on the west planter mass, past the west porch pier: a rendered planter round the foot of the shell's column (its baked bush was cut)
  const WP = { x0: -3.3, x1: -2.15, z0: -0.12, z1: 0.74, y0: 1.58, y1: 1.86 }, ec = 0.06;
  R.push(rb(WP.x0, WP.x1, WP.y0, WP.y1, WP.z0, WP.z1));
  S.push(stone(rb(WP.x0 - 0.02, WP.x1 + 0.02, WP.y1, WP.y1 + 0.04, WP.z1 - ec, WP.z1 + 0.02, 0.004), rnd), stone(rb(WP.x0 - 0.02, WP.x1 + 0.02, WP.y1, WP.y1 + 0.04, WP.z0 - 0.02, WP.z0 + ec, 0.004), rnd),
    stone(rb(WP.x0 - 0.02, WP.x0 + ec, WP.y1, WP.y1 + 0.04, WP.z0 + ec + JOINT, WP.z1 - ec - JOINT, 0.004), rnd), stone(rb(WP.x1 - ec, WP.x1 + 0.02, WP.y1, WP.y1 + 0.04, WP.z0 + ec + JOINT, WP.z1 - ec - JOINT, 0.004), rnd));

  /* ---------- planting beds: stone edging, mulch, clipped box balls and low cover ---------- */
  // street side, at the wall's foot either side of the paving (street.ts paves x −2.5…1.3 from the gate to the street); court side, behind the east wall
  const beds = [{ x0: -3.46, x1: -2.52, z0: FACE, z1: 3.96, out: 1 }, { x0: 1.32, x1: 3.8, z0: FACE, z1: 3.96, out: 1 }, { x0: 1.1, x1: 3.8, z0: 2.8, z1: 3.2, out: -1 }];
  const soilG: THREE.BufferGeometry[] = [], balls: THREE.Matrix4[] = [], covers: THREE.Matrix4[] = [];
  const m4 = (x: number, z: number, s: number, ry: number, y = 0.05) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s * (0.92 + 0.16 * rnd()), s));
  for (const b of beds) {
    const e = 0.05, zo = b.out > 0 ? b.z1 : b.z0, zi = b.out > 0 ? b.z0 : b.z1; // edging on the open side and the ends; the wall closes the fourth
    S.push(stone(rb(b.x0, b.x1, -0.04, 0.09, Math.min(zo, zo - b.out * e), Math.max(zo, zo - b.out * e), 0.004), rnd));
    for (const x of [b.x0, b.x1 - e]) S.push(stone(rb(x, x + e, -0.04, 0.09, Math.min(zi, zo - b.out * e), Math.max(zi, zo - b.out * e), 0.004), rnd));
    soilG.push(ni(new THREE.BoxGeometry(b.x1 - b.x0 - 2 * e, 0.09, Math.abs(b.z1 - b.z0) - e)).translate((b.x0 + b.x1) / 2, 0.02, (b.z0 + b.z1) / 2 - b.out * e / 2));
    const zc = (b.z0 + b.z1) / 2 - b.out * e / 2, n = Math.max(1, Math.round((b.x1 - b.x0 - 0.2) / 0.62));
    for (let i = 0; i < n; i++) {
      const x = b.x0 + 0.1 + (b.x1 - b.x0 - 0.2) * (i + 0.5) / n;
      balls.push(m4(x + (rnd() - 0.5) * 0.04, zc + (rnd() - 0.5) * 0.04, b.out > 0 ? 0.9 + 0.2 * rnd() : 0.7 + 0.15 * rnd(), rnd() * 6.28));
      if (i < n - 1) covers.push(m4(x + (b.x1 - b.x0 - 0.2) / n / 2, zc + (rnd() - 0.5) * 0.06, 0.6 + 0.25 * rnd(), rnd() * 6.28, 0.04));
    }
  }
  soilG.push(ni(new THREE.BoxGeometry(WP.x1 - WP.x0 - 2 * ec, 0.03, WP.z1 - WP.z0 - 2 * ec)).translate((WP.x0 + WP.x1) / 2, WP.y1 + 0.012, (WP.z0 + WP.z1) / 2));
  add(merge(soilG), soil, false);
  const plant = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], height: number) => {
    const im = new THREE.InstancedMesh(geo, leafMat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = high; im.receiveShadow = true; im.frustumCulled = false; group.add(im);
    windify(im, WORLD_TIME, WIND, { base: 0.05, height, amp: 0.018, flutter: 0.7 }); // clipped: they barely lean, the leaves shiver
  };
  const dark = ['#2f4a27', '#3a5a2c', '#466a33', '#2a4424'];
  plant(bush(81, 0.2, 0.46, high ? 2400 : 800, false, dark, { size: 0.55, aspect: 0.7 }), balls, 0.55);
  plant(bush(83, 0.26, 0.16, high ? 900 : 350, false, ['#4f7036', '#5d8040', '#6b8e48', '#42602f'], { size: 0.6, aspect: 0.7 }), covers, 0.2);
  plant(bush(85, 0.52, 0.62, high ? 5200 : 1800, false, ['#2f4a27', '#3a5a2c', '#4a6d34', '#35502a'], { size: 0.85, aspect: 0.6 }), [m4((WP.x0 + WP.x1) / 2, (WP.z0 + WP.z1) / 2, 1, 0.7, WP.y1 + 0.02)], 0.6); // the column rises out of it

  /* ---------- on the east gate pier's face: the video intercom, the house number under it ---------- */
  const px = GR + 0.25, pz = PF;
  const B: THREE.BufferGeometry[] = [rb(px - 0.0575, px + 0.0575, 1.16, 1.45, pz - 0.002, pz + 0.02, 0.005), rb(px - 0.11, px + 0.11, 0.955, 1.055, pz - 0.002, pz + 0.008, 0.003)];
  const G: THREE.BufferGeometry[] = [ni(new THREE.CylinderGeometry(0.0095, 0.0095, 0.002, 28).rotateX(Math.PI / 2)).translate(px, 1.415, pz + 0.0205), // the camera behind its dark glass
    ...Array.from({ length: 6 }, (_, i) => rb(px - 0.028, px + 0.028, 1.358 + i * 0.0055, 1.3605 + i * 0.0055, pz + 0.0195, pz + 0.0205, 0.0008))]; // the speaker's slots
  add(merge(B), bronze); add(merge(G), glass, false);
  add(new THREE.CylinderGeometry(0.0125, 0.0125, 0.005, 32).rotateX(Math.PI / 2).translate(px, 1.225, pz + 0.0215), steel, false);            // the call button
  add(new THREE.TorusGeometry(0.0142, 0.0011, 8, 40).translate(px, 1.225, pz + 0.0205), led, false);
  add(new THREE.BoxGeometry(0.072, 0.02, 0.001).translate(px, 1.3, pz + 0.0205), label, false);
  add(new THREE.PlaneGeometry(0.2, 0.0875).translate(px, 1.005, pz + 0.0085), numerals, false);

  add(merge(R), render); add(merge(S), stoneMat);

  return {
    group,
    dispose() { group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); for (const m of mats) m.dispose(); for (const t of textures) t.dispose(); },
  };
}
