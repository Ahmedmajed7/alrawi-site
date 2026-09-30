/**
 * What is laid out in the rooms by hand: the things on the coffee table (books, a brass tray with the dallah and its cups, a
 * bowl of dates, the mabkhara), the jar of dry branches, the olive tree, lamps and small tables. Each builder returns plain
 * geometry standing on y = 0 about its own axis; interior.ts places it and gives it a material. Nothing here is a perfect
 * solid of revolution: what is thrown on a wheel or beaten from sheet is a little out of round (`wobble`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise2 } from './interior-soft';

type Geo = THREE.BufferGeometry;
const seeded = (a: number) => () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
const merge = (list: Geo[]) => mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; }), false)!;

/** A solid of revolution from (radius, height) pairs, a little out of round. */
export function turned(profile: [number, number][], o: { seg?: number; wobble?: number; seed?: number } = {}): Geo {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), o.seg ?? 40), p = g.attributes.position as THREE.BufferAttribute, w = o.wobble ?? 0, seed = o.seed ?? 1;
  if (w > 0) { for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + w * (Math.sin(a * 2 + seed) * 0.6 + noise2(Math.cos(a) * 1.5 + 5, y * 9 + Math.sin(a) * 1.5, seed) * 0.7); p.setXYZ(i, x * k, y, z * k); } g.computeVertexNormals(); }
  return g;
}
/** A tube that thins along a curve (a branch, a spout, a handle); `flat` squeezes its section. */
export function taper(curve: THREE.Curve<THREE.Vector3>, seg: number, r0: number, r1: number, sides = 6, flat = 1): Geo {
  const fr = curve.computeFrenetFrames(seg, false), pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= seg; j++) { const t = j / seg, P = curve.getPointAt(t), r = r0 + (r1 - r0) * t, N = fr.normals[j], B = fr.binormals[j];
    for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r * flat; pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s); } }
  for (let j = 0; j < seg; j++) for (let k = 0; k < sides; k++) { const a = j * sides + k, b = j * sides + ((k + 1) % sides), c = a + sides, d = b + sides; idx.push(a, c, b, b, c, d); }
  const tip = pos.length / 3, E = curve.getPointAt(1); pos.push(E.x, E.y, E.z); for (let k = 0; k < sides; k++) idx.push(seg * sides + k, tip, seg * sides + ((k + 1) % sides));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** The dallah: a belly on a foot, a drawn-in waist, a flared collar, a domed lid with its spire, the long beak and the handle. */
export function dallah(h = 0.3): Geo {
  const P = (pts: [number, number][]) => pts.map(([r, y]) => [r * h, y * h] as [number, number]);
  const body = turned(P([[0, 0], [0.17, 0], [0.185, 0.012], [0.18, 0.03], [0.2, 0.07], [0.235, 0.14], [0.24, 0.2], [0.215, 0.28], [0.16, 0.36], [0.122, 0.43], [0.112, 0.48], [0.124, 0.54], [0.15, 0.6], [0.168, 0.645], [0.172, 0.66],
    [0.16, 0.672], [0.15, 0.7], [0.115, 0.745], [0.06, 0.785], [0.024, 0.805], [0.02, 0.83], [0.034, 0.85], [0.03, 0.87], [0.014, 0.89], [0.022, 0.915], [0.018, 0.935], [0.006, 0.97], [0, 1]]), { seg: 36, wobble: 0.006 });
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x * h, y * h, z * h);
  const beak = taper(new THREE.QuadraticBezierCurve3(v(0.08, 0.5), v(0.3, 0.5), v(0.46, 0.76)), 14, 0.062 * h, 0.006 * h, 8, 1.45);
  const handle = taper(new THREE.CatmullRomCurve3([v(-0.13, 0.63), v(-0.27, 0.68), v(-0.38, 0.58), v(-0.4, 0.4), v(-0.32, 0.24), v(-0.2, 0.17)]), 22, 0.017 * h, 0.013 * h, 7, 0.7);
  return merge([body, beak, handle]);
}
/** A finjan: the small cup without a handle the coffee is drunk from. */
export const finjan = (h = 0.048): Geo => turned([[0, 0], [0.4 * h, 0], [0.42 * h, 0.06 * h], [0.5 * h, 0.4 * h], [0.62 * h, 0.85 * h], [0.66 * h, h], [0.6 * h, h], [0.55 * h, 0.8 * h], [0.42 * h, 0.35 * h], [0.3 * h, 0.16 * h], [0, 0.14 * h]], { seg: 24 });
/** The mabkhara: a square burner on a flaring foot, four horns at the corners of its bowl. `wood` is the body, `metal` its mounts. */
export function mabkhara(h = 0.2): { wood: Geo; metal: Geo } {
  const sq = (pts: [number, number][]) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r * h, 1e-4), y * h)), 4); g.rotateY(Math.PI / 4); return g.toNonIndexed(); };
  const wood = sq([[0, 0], [0.3, 0], [0.3, 0.05], [0.2, 0.12], [0.13, 0.3], [0.12, 0.42], [0.17, 0.5], [0.3, 0.58], [0.33, 0.62], [0.33, 0.86], [0.27, 0.86], [0.27, 0.66], [0, 0.64]]); wood.computeVertexNormals();
  const metal: Geo[] = [], a = 0.33 * h * Math.SQRT1_2;
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) metal.push(new THREE.ConeGeometry(0.035 * h, 0.2 * h, 4).rotateY(Math.PI / 4).translate(sx * a * 0.93, 0.95 * h, sz * a * 0.93));
  for (const y of [0.05, 0.6, 0.85]) { const r = (y < 0.1 ? 0.305 : 0.335) * h * Math.SQRT1_2; metal.push(new THREE.BoxGeometry(r * 2 + 0.001, 0.014 * h, r * 2 + 0.001).translate(0, y * h, 0)); }
  metal.push(new THREE.CylinderGeometry(0.2 * h, 0.16 * h, 0.03 * h, 20).translate(0, 0.665 * h, 0)); // the dish the coals lie in
  return { wood, metal: merge(metal) };
}
/** A round tray with a rolled rim. */
export const tray = (r: number): Geo => turned([[0, 0], [r - 0.012, 0], [r, 0.004], [r + 0.005, 0.016], [r + 0.002, 0.022], [r - 0.003, 0.02], [r - 0.006, 0.01], [r - 0.014, 0.006], [0, 0.006]], { seg: 56, wobble: 0.003 });
/** A bowl, thrown thick. */
export const bowl = (r: number, h: number, seed = 1): Geo => turned([[0, 0], [r * 0.42, 0], [r * 0.46, h * 0.06], [r * 0.7, h * 0.35], [r * 0.93, h * 0.8], [r, h], [r * 0.95, h], [r * 0.86, h * 0.78], [r * 0.62, h * 0.36], [r * 0.3, h * 0.2], [0, h * 0.18]], { seg: 40, wobble: 0.012, seed });
/** Dates heaped in a bowl of inner radius `r`, their heap `h` high over y = 0. */
export function dates(r: number, h: number, n = 26, seed = 3): Geo {
  const rnd = seeded(seed), out: Geo[] = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.82, g = new THREE.SphereGeometry(1, 10, 7).scale(0.021 + rnd() * 0.004, 0.0105, 0.0115), p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), w = 1 + 0.12 * noise2(x * 160 + i, (y + z) * 160, seed); p.setXYZ(k, x, y * w, z * w); } // wrinkled skin
    g.computeVertexNormals(); g.rotateZ((rnd() - 0.5) * 0.9).rotateY(rnd() * Math.PI).translate(Math.cos(a) * d, h * (1 - (d / r) ** 2) * (0.55 + rnd() * 0.45) + 0.008, Math.sin(a) * d); out.push(g);
  }
  return merge(out);
}
/** A book lying flat, its spine along x toward −z: the boards and spine, and the block of pages between them. */
export function book(w: number, d: number, t: number): { cover: Geo; pages: Geo } {
  const b = 0.0025, cover = merge([new THREE.BoxGeometry(w, b, d).translate(0, b / 2, 0), new THREE.BoxGeometry(w, b, d).translate(0, t - b / 2, 0), new RoundedBoxGeometry(w, t, 0.006, 2, 0.0028).translate(0, t / 2, -d / 2 + 0.003)]);
  return { cover, pages: new THREE.BoxGeometry(w - 0.008, t - 2 * b, d - 0.008).translate(0, t / 2, 0.001) };
}

export interface TreeOpts {
  height: number; seed: number; /** stems that rise from the foot */ stems: number; /** radius at the foot of a stem */ girth: number; /** how far a stem leans out (rad) */ lean: number;
  /** branchings after the stem */ levels: number; /** children per limb */ kids: number; /** how much a limb turns as it grows */ bend: number; /** how a child leaves its parent (rad) */ spread: number;
  /** leaf length (0 = bare wood) */ leaf?: number; /** leaf pairs per metre of twig */ density?: number; sides?: number; /** no twig is thinner than this (a hair of a twig shimmers in the film) */ thin?: number;
}
/** Wood that grew: stems that lean and turn, limbs that leave them and thin toward their tips; with `leaf`, narrow leaves in pairs
 *  along the last twigs (vertex colours: grey-green, every fourth one turned to its silver underside). */
export function tree(o: TreeOpts): { wood: Geo; leaves: Geo | null } {
  const rnd = seeded(o.seed), wood: Geo[] = [], lp: number[] = [], ln: number[] = [], lc: number[] = [], up = new THREE.Vector3(0, 1, 0);
  const greens = ['#59664b', '#687657', '#4c5840', '#77846a'].map((c) => new THREE.Color(c)), silver = new THREE.Color('#a9b3a0');
  const perp = (d: THREE.Vector3) => { const a = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(d); return a.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : a.normalize(); };
  const limb = (start: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, level: number) => {
    const n = level === 0 ? 7 : 5, pts = [start.clone()], d = dir.clone().normalize(), p = start.clone();
    for (let k = 0; k < n; k++) { d.addScaledVector(perp(d), o.bend * (0.4 + rnd())).addScaledVector(up, 0.12 * (level ? 1 : 0.4)).normalize(); p.addScaledVector(d, len / n); pts.push(p.clone()); }
    const thin = o.thin ?? 0.0012, curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), r1 = Math.max(thin, r0 * (level >= o.levels ? 0.3 : 0.5));
    wood.push(taper(curve, n * 2, Math.max(thin, r0), r1, Math.max(4, (o.sides ?? 7) - level * 2)));
    if (level < o.levels) for (let c = 0; c < o.kids; c++) { const s = 0.3 + (0.62 * (c + rnd())) / o.kids, T = curve.getTangentAt(s), ax = perp(T);
      limb(curve.getPointAt(s), T.clone().applyAxisAngle(ax, o.spread * (0.7 + 0.6 * rnd())), len * (0.42 + 0.3 * rnd()) * (1.1 - 0.4 * s), (r0 + (r1 - r0) * s) * 0.72, level + 1); }
    if (o.leaf && level >= o.levels - 1) { const step = 1 / ((o.density ?? 45) * len); let roll = rnd() * Math.PI; // the last two orders of twig carry the leaves
      for (let s = level >= o.levels ? 0.1 : 0.35; s <= 1; s += step) { const P = curve.getPointAt(Math.min(1, s)), T = curve.getTangentAt(Math.min(1, s)), side = perp(T); roll += 1.9;
        for (const sg of [1, -1]) { const ax = side.clone().applyAxisAngle(T, roll + (sg > 0 ? 0 : Math.PI)), dirL = T.clone().applyAxisAngle(ax.clone().cross(T).normalize(), 0.75 + rnd() * 0.5), L = o.leaf * (0.75 + rnd() * 0.5), W = L * 0.11;
          const wv = new THREE.Vector3().crossVectors(dirL, ax).normalize(), nn = new THREE.Vector3().crossVectors(wv, dirL).normalize(), mid = P.clone().addScaledVector(dirL, L * 0.45), tip = P.clone().addScaledVector(dirL, L);
          const a = mid.clone().addScaledVector(wv, W), b = mid.clone().addScaledVector(wv, -W), col = (rnd() < 0.25 ? silver : greens[Math.floor(rnd() * 4)]).clone().multiplyScalar(0.8 + rnd() * 0.35);
          for (const q of [P, a, tip, P, tip, b]) { lp.push(q.x, q.y, q.z); ln.push(nn.x, nn.y, nn.z); lc.push(col.r, col.g, col.b); } } } }
  };
  for (let i = 0; i < o.stems; i++) { const a = (i / o.stems) * Math.PI * 2 + rnd() * 1.2, l = o.lean * (0.35 + rnd() * 0.65), d = new THREE.Vector3(Math.cos(a) * Math.sin(l), Math.cos(l), Math.sin(a) * Math.sin(l));
    limb(new THREE.Vector3(Math.cos(a) * o.girth * 0.8, 0, Math.sin(a) * o.girth * 0.8), d, o.height * (0.72 + rnd() * 0.28) * (o.levels ? 0.62 : 1), o.girth * (0.75 + rnd() * 0.25), 0); }
  let leaves: Geo | null = null;
  if (lp.length) { leaves = new THREE.BufferGeometry(); leaves.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); leaves.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3)); leaves.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3)); }
  return { wood: merge(wood), leaves };
}

/** A table lamp: a thrown foot, a brass neck, a drum shade (open, uv: v up the shade) and the opal discs that close it. */
export function tableLamp(h = 0.62, seed = 2): { foot: Geo; metal: Geo; shade: Geo; glow: Geo } {
  const fh = h * 0.52, sh = h * 0.4, r0 = h * 0.29, r1 = h * 0.25, y0 = h - sh;
  const foot = turned([[0, 0], [0.11, 0], [0.12, 0.01], [0.125, 0.06], [0.15, 0.16], [0.155, 0.24], [0.13, 0.36], [0.07, 0.46], [0.045, 0.5], [0.04, 0.52], [0, 0.52]].map(([r, y]) => [(r / 0.52) * fh * 0.9, (y / 0.52) * fh] as [number, number]), { seg: 40, wobble: 0.01, seed });
  const metal = merge([new THREE.CylinderGeometry(0.009, 0.011, y0 - fh + sh * 0.35, 12).translate(0, fh + (y0 - fh + sh * 0.35) / 2, 0), new THREE.CylinderGeometry(0.024, 0.03, 0.012, 20).translate(0, fh + 0.006, 0), new THREE.TorusGeometry(r0 - 0.001, 0.0025, 6, 48).rotateX(Math.PI / 2).translate(0, y0 + 0.002, 0), new THREE.TorusGeometry(r1 - 0.001, 0.0025, 6, 48).rotateX(Math.PI / 2).translate(0, h - 0.002, 0)]);
  const shade = new THREE.CylinderGeometry(r1, r0, sh, 48, 6, true).translate(0, y0 + sh / 2, 0);
  const glow = merge([new THREE.CircleGeometry(r0 - 0.012, 32).rotateX(Math.PI / 2).translate(0, y0 + 0.03, 0), new THREE.CircleGeometry(r1 - 0.012, 32).rotateX(-Math.PI / 2).translate(0, h - 0.03, 0)]);
  return { foot, metal, shade, glow };
}
/** A jar thrown tall for the floor: a narrow foot, a full shoulder, a short neck. */
export const jar = (h: number, seed = 5): Geo => turned(([[0, 0], [0.19, 0], [0.2, 0.015], [0.25, 0.12], [0.33, 0.3], [0.37, 0.48], [0.36, 0.62], [0.29, 0.78], [0.19, 0.88], [0.15, 0.93], [0.16, 0.985], [0.175, 1], [0.15, 1], [0.13, 0.96], [0.13, 0.9], [0, 0.88]] as [number, number][]).map(([r, y]) => [r * h * 0.78, y * h] as [number, number]), { seg: 48, wobble: 0.014, seed });
