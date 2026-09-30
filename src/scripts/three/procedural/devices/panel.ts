/**
 * The 10-inch wall control panel, modelled after the catalogue unit (p. 5: the landscape panel on the living-room wall) and its
 * maker's sheets (NS-T5E / TPA): a 240 × 146 mm unit 12.5 mm proud of the wall.
 *
 *   wall │ foot (recessed: the shadow line) │ anodised frame, diamond-cut lip │ cover glass over an inset display │ key strip
 *
 * What makes it read as the product and not as a black tile:
 *   – a machined frame: satin anodised sides and a bright 45° lip that draws the outline in light;
 *   – edge-to-edge cover glass whose reflection is ADDED over the pixels (the display lies 1.5 mm under it: parallax at the edges),
 *     a black print border with the camera, the light sensor and the status LED under the glass;
 *   – the right-hand strip: three separate keys in vertically brushed silver anodising, hairline gaps, a backlit dash on each;
 *   – in the villa the metal is white-balanced against the lamps that reach it: on film it is silver, never cream.
 * Everything is dimensioned in millimetres and scaled once (`w` units = 240 mm). The geometry helpers are shared with lock.ts.
 */
import * as THREE from 'three';
import { num, bool, brushNormal, screenMat, screenTexture, mesh, type Ctx } from '../kit';
import { PW, PH } from '@/data/panel-ui';

/* ---------- geometry: rounded rectangles swept through a profile ---------- */
/** corner radii: top-right, top-left, bottom-left, bottom-right (one number: all four) */
export type Radii = number | readonly [number, number, number, number];
/**
 * One step of a profile. `i` inset from the outline, `z` height, `a` the surface normal's angle above the outward horizontal in
 * degrees (0 a side wall, 45 a chamfer, 90 facing front, 180 an inner wall facing the middle), `m` the material of the band that
 * starts here. Two steps at one place with different angles make a crease; an angle carried on is smooth.
 */
export interface Step { i: number; z: number; a: number; m?: number }
interface Pt { x: number; y: number; nx: number; ny: number }
/** counter-clockwise, the same point count at any inset (rings stitch one to one) */
function outline(hx: number, hy: number, r: readonly number[], seg: number): Pt[] {
  const out: Pt[] = [];
  ([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).forEach(([sx, sy], q) => {
    const rq = Math.max(1e-4, Math.min(r[q], hx, hy));
    for (let k = 0; k <= seg; k++) { const a = (q + k / seg) * Math.PI / 2, nx = Math.cos(a), ny = Math.sin(a); out.push({ x: sx * (hx - rq) + nx * rq, y: sy * (hy - rq) + ny * rq, nx, ny }); }
  });
  return out;
}
/**
 * A rounded rectangle `w` × `h` swept through `steps`: side walls, chamfers, roundovers, a ring-shaped top, walls down into a pocket.
 * One geometry per material index (the walkthrough hands its room reflection map to single-material meshes only). `cap`: the
 * material of the flat face that closes the last step (-1: open); `back`: of the face behind the first one. UVs are planar.
 */
export function loft(w: number, h: number, r: Radii, steps: Step[], { cap = 0, back = -1, seg = 8, cx = 0, cy = 0 }: { cap?: number; back?: number; seg?: number; cx?: number; cy?: number } = {}) {
  const R = typeof r === 'number' ? [r, r, r, r] : r, n = 4 * (seg + 1);
  type Part = { pos: number[]; nor: number[]; uv: number[]; idx: number[] };
  const parts = new Map<number, Part>();
  const part = (m: number) => { let p = parts.get(m); if (!p) parts.set(m, (p = { pos: [], nor: [], uv: [], idx: [] })); return p; };
  const ring = (P: Part, s: Step, nz?: number) => {
    const base = P.pos.length / 3, a = s.a * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    for (const q of outline(w / 2 - s.i, h / 2 - s.i, R.map((v) => v - s.i), seg)) { P.pos.push(cx + q.x, cy + q.y, s.z); if (nz === undefined) P.nor.push(q.nx * c, q.ny * c, sn); else P.nor.push(0, 0, nz); P.uv.push(q.x / w + 0.5, q.y / h + 0.5); }
    return base;
  };
  let m = steps[0].m ?? 0;
  for (let k = 0; k < steps.length - 1; k++) {
    const s = steps[k], t = steps[k + 1]; if (s.m !== undefined) m = s.m;
    if (Math.abs(s.i - t.i) < 1e-7 && Math.abs(s.z - t.z) < 1e-7) continue; // a crease: no band
    const P = part(m), a = ring(P, s), b = ring(P, t);
    for (let q = 0; q < n; q++) { const j = (q + 1) % n; P.idx.push(a + q, a + j, b + j, a + q, b + j, b + q); }
  }
  const fan = (mat: number, s: Step, dir: 1 | -1) => {
    const P = part(mat), a = ring(P, s, dir), o = P.pos.length / 3; P.pos.push(cx, cy, s.z); P.nor.push(0, 0, dir); P.uv.push(0.5, 0.5);
    for (let q = 0; q < n; q++) { const j = (q + 1) % n; if (dir > 0) P.idx.push(a + q, a + j, o); else P.idx.push(a + j, a + q, o); }
  };
  if (cap >= 0) fan(cap, steps[steps.length - 1], 1);
  if (back >= 0) fan(back, steps[0], -1);
  const out = new Map<number, THREE.BufferGeometry>();
  for (const [k, P] of parts) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2)); g.setIndex(P.idx); out.set(k, g); }
  return out;
}
/** the meshes of a loft, one per material, into `parent` */
export function addLoft(parent: THREE.Object3D, geos: Map<number, THREE.BufferGeometry>, mats: THREE.Material[], x = 0, y = 0, z = 0) {
  const out: THREE.Mesh[] = []; for (const [k, g] of geos) { const m = mesh(g, mats[k], x, y, z); parent.add(m); out.push(m); } return out;
}
/** a profile that rises straight from `z0` and closes with a 45° chamfer `c` at `z1` (the machined edge) */
export const chamfered = (z0: number, z1: number, c: number, wall = 0, edge = 1): Step[] => [{ i: 0, z: z0, a: 0, m: wall }, { i: 0, z: z1 - c, a: 0 }, { i: 0, z: z1 - c, a: 45, m: edge }, { i: c, z: z1, a: 45 }];
/** … or with a quarter-round `r` (the moulded edge of a gloss part) */
export const rounded = (z0: number, z1: number, r: number, wall = 0, steps = 5): Step[] => {
  const s: Step[] = [{ i: 0, z: z0, a: 0, m: wall }]; for (let k = 0; k <= steps; k++) { const a = (k / steps) * Math.PI / 2; s.push({ i: r * (1 - Math.cos(a)), z: z1 - r + r * Math.sin(a), a: (a * 180) / Math.PI }); } return s;
};

/** keep a part out of `Box3.setFromObject`: the walkthrough takes the recipe's −Z extreme as the mounting plane and the viewer
 *  centres on the box, so what sits behind the mounting plane must not move either. `at`: a point inside the body. */
export function unbounded<T extends THREE.Mesh>(m: T, at = new THREE.Vector3(0, 0, 1)) { m.updateMatrix(); const q = at.clone().applyMatrix4(m.matrix.clone().invert()); m.geometry.boundingBox = new THREE.Box3(q, q.clone()); return m; }

/* ---------- the villa's light: warm lamps, white-balanced out of the metal ---------- */
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Color();
const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
/** The colour of the lamp light that reaches a wall-mounted unit (inverse square, facing, cone; the sun left out: the walls shade it). */
export function lampLight(lamps: THREE.Light[], at: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) {
  out.setRGB(0, 0, 0);
  for (const l of lamps) {
    if (!shown(l) || l.intensity <= 0) continue;
    const pt = l as THREE.PointLight, sp = l as THREE.SpotLight, ra = l as THREE.RectAreaLight, he = l as THREE.HemisphereLight; let k = 0;
    if (he.isHemisphereLight) { out.add(_c.copy(he.groundColor).lerp(he.color, 0.5 * n.y + 0.5).multiplyScalar(he.intensity)); continue; }
    if ((l as THREE.AmbientLight).isAmbientLight) k = 1;
    else if (pt.isPointLight || sp.isSpotLight || ra.isRectAreaLight) {
      l.getWorldPosition(_p); _d.subVectors(_p, at); const r = Math.max(0.1, _d.length()); _d.divideScalar(r);
      k = Math.max(0, _d.dot(n)) / (r * r);
      if (!ra.isRectAreaLight && pt.distance > 0) k *= Math.max(0, 1 - (r / pt.distance) ** 4) ** 2;
      if (sp.isSpotLight) { sp.target.getWorldPosition(_t).sub(_p).normalize(); const c = -_d.dot(_t), c0 = Math.cos(sp.angle), c1 = Math.cos(sp.angle * (1 - sp.penumbra)); k *= THREE.MathUtils.smoothstep(c, c0, Math.max(c1, c0 + 1e-4)); }
      if (ra.isRectAreaLight) k *= ra.width * ra.height * Math.max(0, _t.set(0, 0, -1).transformDirection(l.matrixWorld).dot(_d.negate()));
    }
    out.add(_c.copy(l.color).multiplyScalar(l.intensity * k));
  }
  return out;
}
/**
 * Two dressings of one unit. In the studio (the product viewer) it wears its catalogue colours. In the villa (the walkthrough gives
 * indoor devices its room reflection map: `probe.envMap` is set) every lamp is warm, and under warm light silver photographs cream:
 * there `apply` gets the white balance of the lamps that reach the unit (`balance` 1 = fully neutral), asked again every draw
 * (a handful of lamps to add up; they may fade or flicker, and the finish follows them).
 */
export function dressing(root: THREE.Object3D, probe: THREE.MeshStandardMaterial, apply: (villa: boolean, wb: THREE.Color) => void, balance = 0.9) {
  let villa: boolean | null = null, lamps: THREE.Light[] | null = null, seen = -1, age = 0;
  const at = new THREE.Vector3(), nrm = new THREE.Vector3(), light = new THREE.Color(), wb = new THREE.Color(1, 1, 1), one = new THREE.Color(1, 1, 1);
  const dress = (renderer: THREE.WebGLRenderer, scene: THREE.Object3D) => {
    const on = !!probe.envMap, frame = renderer.info.render.frame;
    if (on === villa && (!on || frame === seen)) return;
    villa = on; seen = frame;
    if (on) {
      if (!lamps || age++ % 240 === 0) { lamps = []; scene.traverse((o) => { const l = o as THREE.Light; if (l.isLight && !(l as THREE.DirectionalLight).isDirectionalLight) lamps!.push(l); }); }
      root.getWorldPosition(at); nrm.set(0, 0, 1).transformDirection(root.matrixWorld); lampLight(lamps, at, nrm, light);
      const y = 0.2126 * light.r + 0.7152 * light.g + 0.0722 * light.b, c = (v: number) => (y > 1e-5 ? Math.min(2.5, Math.max(0.4, y / Math.max(v, 1e-5))) : 1);
      wb.setRGB(c(light.r), c(light.g), c(light.b)).lerp(one, 1 - balance);
    } else wb.setRGB(1, 1, 1);
    apply(on, wb);
  };
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.onBeforeRender = (renderer, scene) => dress(renderer, scene); });
}

/* ---------- the unit ---------- */
const W = 240, H = 146;                  // the unit
const FLOAT = 4, FOOT_IN = 1.6;          // the foot fills the 4 mm the walkthrough holds devices off the wall, this much smaller all round: the shadow line
const T = 8.2, LIP = 1.2, CH = 0.7;      // the frame: rim height over the mounting plane, the rim's width seen from the front, its diamond-cut chamfer
const FLOOR = 6.4;                        // the pocket inside the rim (the glass and the keys stand in it)
const SW = 25, SEAM = 0.7;               // the key strip and the hairline between it and the glass
const G0 = FLOOR + 0.5, G1 = T + 0.3;    // cover glass: underside, face (0.3 mm proud of the rim)
const BORDER = { top: 9, bottom: 6.5 };  // the black print above and below the display
const KG = 0.8, KC = 0.45;               // gaps between the keys, their chamfer

/** vertical brushing (the keys are finished along their length): the kit's brushed normal turned a quarter, a copy per placement */
function brushUp(rx: number, ry: number) { const t = brushNormal()!.clone(); t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; t.repeat.set(ry, rx); t.needsUpdate = true; return t; }

/** The landscape wall panel. Returns null for the other products that share the shape (the square dark audio panel). */
export function wallPanel({ accent, p }: Ctx): THREE.Group | null {
  const w = num(p, 'w', 1.7), h = num(p, 'h', 1.05);
  if (bool(p, 'dark') || p.screen === false || w / h < 1.3) return null;
  const g = new THREE.Group(), mm = new THREE.Group(); mm.scale.setScalar(w / W); g.add(mm);

  // materials (catalogue colours; the villa dressing below white-balances the metal and dims its reflection of the bright room map)
  const SILVER = new THREE.Color('#b1b5ba'), ANOD = new THREE.Color('#8b8f95'), LIPC = new THREE.Color('#eceef1'), KEYWALL = new THREE.Color('#7d8187');
  const frame = new THREE.MeshPhysicalMaterial({ color: ANOD, metalness: 1, roughness: 0.4, normalMap: brushNormal(), normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 1 });
  const lip = new THREE.MeshStandardMaterial({ color: LIPC, metalness: 1, roughness: 0.16, envMapIntensity: 1.2 });
  const pit = new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.92, metalness: 0, envMapIntensity: 0.05 });
  const keyFace = new THREE.MeshPhysicalMaterial({ color: SILVER, metalness: 1, roughness: 0.32, normalMap: brushUp(1, 2), normalScale: new THREE.Vector2(0.28, 0.28), anisotropy: 0.45, anisotropyRotation: Math.PI / 2, envMapIntensity: 1 });
  const keyWall = new THREE.MeshStandardMaterial({ color: KEYWALL, metalness: 1, roughness: 0.42, envMapIntensity: 0.8 });
  const glassEdge = new THREE.MeshPhysicalMaterial({ color: '#0a0d0d', roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1 });
  const print = new THREE.MeshStandardMaterial({ color: '#030304', roughness: 0.55, metalness: 0, envMapIntensity: 0.15 }); // the black print on the glass's underside
  // the cover glass is only its reflection, added over what lies beneath (pixels, print): a real cover reflects ~4 % head-on, more
  // at a glance, and never darkens the display. Roughness softens the room's lamps into glows instead of a mirror image
  const cover = new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.11, metalness: 0, ior: 1.52, specularIntensity: 1, envMapIntensity: 1.4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const decal = (color: string, rough: number, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });

  // the foot, in shadow behind the mounting plane
  addLoft(mm, loft(W - FOOT_IN * 2, H - FOOT_IN * 2, 2, [{ i: 0, z: -FLOAT, a: 0 }, { i: 0, z: 0, a: 0 }], { cap: -1 }), [pit]).forEach((m) => unbounded(m));
  // the frame: anodised sides, the diamond-cut lip, a narrow satin rim, then the pocket the glass and the keys stand in
  addLoft(mm, loft(W, H, 3, [...chamfered(0, T, CH, 0, 1), { i: CH, z: T, a: 90, m: 0 }, { i: LIP, z: T, a: 90 }, { i: LIP, z: T, a: 180, m: 2 }, { i: LIP, z: FLOOR, a: 180 }, { i: LIP, z: FLOOR, a: 90 }], { cap: 2, back: 2 }), [frame, lip, pit]);

  // cover glass (left of the strip) and the display under it
  const iw = W - LIP * 2, ih = H - LIP * 2, gw = iw - SW - SEAM, gx = -iw / 2 + gw / 2;
  addLoft(mm, loft(gw, ih, 2, [{ i: 0, z: G0, a: 0 }, { i: 0, z: G1 - 0.3, a: 0 }, { i: 0.09, z: G1 - 0.09, a: 45 }, { i: 0.3, z: G1, a: 90 }], { cap: -1 }), [glassEdge], gx);
  const dh = ih - BORDER.top - BORDER.bottom, dw = dh * (PW / PH), dy = (BORDER.bottom - BORDER.top) / 2;
  { // the print: the glass less the display window
    const s = roundedRectShape(gw - 0.6, ih - 0.6, 1.7), hole = new THREE.Path();
    hole.moveTo(-dw / 2, dy - dh / 2); hole.lineTo(-dw / 2, dy + dh / 2); hole.lineTo(dw / 2, dy + dh / 2); hole.lineTo(dw / 2, dy - dh / 2); hole.closePath(); s.holes.push(hole);
    mm.add(mesh(new THREE.ShapeGeometry(s, 6), print, gx, 0, G1 - 0.12));
  }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), screenMat(screenTexture(), 1.15)); // always on, bright like the real unit
  { const sm = screen.material as THREE.MeshStandardMaterial; sm.roughness = 1; sm.envMapIntensity = 0; } // the pixels do not reflect: the cover over them does
  screen.name = 'screen'; screen.position.set(gx, dy, G0 + 0.05); mm.add(screen); // `screen`: the landing pins its live HTML dashboard onto these corners
  { const c = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(gw - 0.6, ih - 0.6, 1.7), 6), cover); c.position.set(gx, 0, G1); c.renderOrder = 3; mm.add(c); }
  // under the glass, centred in the top border: the camera (a dark ring round a violet-coated lens), the light sensor, the status LED
  const ty = ih / 2 - BORDER.top / 2, tz = G1 - 0.08;
  mm.add(mesh(new THREE.RingGeometry(0.95, 1.55, 40), decal('#34363b', 0.3, 1), gx, ty, tz));
  mm.add(mesh(new THREE.CircleGeometry(0.95, 40), decal('#120c22', 0.12), gx, ty, tz));
  mm.add(mesh(new THREE.CircleGeometry(0.34, 20), decal('#6e6a86', 0.1), gx - 0.3, ty + 0.3, tz + 0.01)); // the lens's own glint
  mm.add(mesh(new THREE.CircleGeometry(0.75, 28), decal('#17181b', 0.5), gx - 16, ty, tz));
  { const l = mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshStandardMaterial({ color: '#000', emissive: accent, emissiveIntensity: 0.9, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), gx + 16, ty, tz); l.name = 'status'; mm.add(l); }

  // the key strip: three keys in the pocket, a hairline gap round each (the dark floor shows), a backlit dash on each
  const kx = iw / 2 - SW / 2, kw = SW - 0.8, kh = (ih - 0.8 - KG * 2) / 3;
  const glow = new THREE.MeshStandardMaterial({ color: '#0d0e10', emissive: '#f2f6ff', emissiveIntensity: 0.75, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  for (let k = -1; k <= 1; k++) {
    const ky = k * (kh + KG);
    addLoft(mm, loft(kw, kh, 1, [...chamfered(FLOOR, T + 0.2, KC, 2, 1)], { cap: 0 }), [keyFace, lip, keyWall], kx, ky).forEach((m) => (m.name = m.material === keyFace ? `key_${k + 1}` : m.name));
    mm.add(mesh(new THREE.PlaneGeometry(5.2, 0.7), glow, kx, ky, T + 0.24));
  }

  // the villa: the metal white-balanced against the lamps, its reflection of the bright, even room map held down so the strip
  // stays silver-grey; the cover's reflection a little stronger than in the studio (the room map is dimmer than the viewer's)
  // The lamp balance alone left the strip champagne and brighter than the wall at stop 1 (sRGB (215,193,168) on a (184,171,158)
  // wall): the room's reflection is warm too and not in the lamp sum, and the grade warms whatever reaches the highlights. The
  // catalogue's strip is a satin grey clearly darker than its wall, its hue near the wall's: a fixed trim takes the metal down
  // into the mid-tones, where the hue trim holds (the villa only)
  const HUE = new THREE.Color(0.72, 0.83, 1), KEY = 0.4;
  dressing(mm, keyFace, (villa, wb) => {
    keyFace.color.copy(SILVER).multiply(wb); frame.color.copy(ANOD).multiply(wb); lip.color.copy(LIPC).multiply(wb); keyWall.color.copy(KEYWALL).multiply(wb);
    if (villa) { keyFace.color.multiply(HUE).multiplyScalar(KEY); frame.color.multiply(HUE); lip.color.multiply(HUE); keyWall.color.multiply(HUE); }
    keyFace.envMapIntensity = villa ? 0.62 : 1; frame.envMapIntensity = villa ? 0.55 : 1; lip.envMapIntensity = villa ? 0.9 : 1.2; keyWall.envMapIntensity = villa ? 0.5 : 0.8;
    cover.envMapIntensity = villa ? 3.2 : 1.1;
  });

  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(kx, kh + KG, T + 0.6); mm.add(hs); // the leader lands on the top key (the screen itself is live)
  return g;
}

/** a rounded rectangle as a 2D shape, centred */
export function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape(), hx = w / 2, hy = h / 2;
  s.moveTo(-hx + r, -hy); s.lineTo(hx - r, -hy); s.absarc(hx - r, -hy + r, r, -Math.PI / 2, 0, false); s.lineTo(hx, hy - r); s.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hy); s.absarc(-hx + r, hy - r, r, Math.PI / 2, Math.PI, false); s.lineTo(-hx, -hy + r); s.absarc(-hx + r, -hy + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
