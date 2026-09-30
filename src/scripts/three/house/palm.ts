/**
 * The date palm (Phoenix dactylifera) as it grows in a Muscat garden, built leaf by leaf.
 *
 * Crown: 60–130 fronds set by the golden angle, from the spear of closed young leaves standing in the heart through fronds
 * arching out and up to old ones hanging below the horizontal. Each frond is a curved rachis (it leaves the trunk at its
 * own angle and gravity takes more of it toward the tip, the old ones most), a bare petiole armed with yellow spines, then
 * lanceolate leaflets folded along their midribs (a V, two triangles each), set in three planes on each side — the fluffy,
 * many-angled look of a Phoenix frond, not a comb — longest a third of the way out, short and stiff at both ends. The leaf
 * is glaucous: a grey-green bloom, bluer in the young heart, yellowing in the old skirt, some tips burnt, a few fronds dying.
 * Leaf normals lean out of the crown (foliage.ts keeps them on both faces) so the crown shades as a volume.
 * Trunk: displaced by a lattice of cut leaf bases ("boots") in two crossing spirals with fibre between them, the same
 * height field painting its colour and normal maps; it flares at the root, swells under the crown and wanders a little.
 * Dates: an orange stalk arching out from between the fronds, a cascade of strands, a few hundred fruits.
 * Wind (wind.ts): every frond vertex carries its root and a phase (aFrond) and its arc fraction (aArc).
 */
import * as THREE from 'three';

export function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** One palm's character. Lengths in metres. */
export interface PalmSpec {
  h: number; /** how far the crown stands off the foot */ lean: number; fronds: number; len: [number, number];
  /** 1 = a palm in its prime; more hangs, less stands */ droop: number; girth: number;
  /** dead fronds left hanging under the crown */ dry: number; dates: number;
}
/** Level of detail: the near palms carry every leaflet, the oasis a sketch that still covers like a crown. */
export interface PalmLod { pairs: number; /** leaflet width (m) */ leafW: number; /** share of the fronds kept */ fronds: number; sides: number; /** trunk rings per metre */ rings: number; fine: boolean }
export const LOD = {
  near: { pairs: 64, leafW: 0.026, fronds: 1, sides: 40, rings: 26, fine: true },
  mid: { pairs: 38, leafW: 0.036, fronds: 0.75, sides: 20, rings: 11, fine: false },
  low: { pairs: 30, leafW: 0.055, fronds: 0.7, sides: 12, rings: 4, fine: false },
  far: { pairs: 16, leafW: 0.085, fronds: 0.4, sides: 7, rings: 1.2, fine: false },
  farLow: { pairs: 12, leafW: 0.1, fronds: 0.3, sides: 6, rings: 1, fine: false },
} satisfies Record<string, PalmLod>;

/* ------------------------------------------------------------ the trunk's leaf bases */
const C = 7, RW = 9, TILE_H = 1.3; // boots around the trunk, rows per texture tile, tile height (m)
const TAU = Math.PI * 2;
/** Height (0 … 1) of the boot lattice at (u around, v up the tile), periodic in both; also where in its boot the point is. */
function boot(u: number, v: number) {
  // the lattice wanders a little (periodic warps), so the boots are not a quilt
  const wu = 0.1 * Math.sin(TAU * (2 * u + 3 * v)) + 0.06 * Math.sin(TAU * (5 * u - 2 * v) + 1.3), wv = 0.08 * Math.sin(TAU * (3 * u + 2 * v) + 0.7);
  const a = u * C + v * RW + wu + wv, b = u * C - v * RW + wu - wv, i = Math.floor(a), j = Math.floor(b), fa = a - i, fb = b - j;
  const su = fa + fb - 1, sv = fa - fb, e = 1 - (Math.abs(su) + Math.abs(sv)); // across, up the diamond; distance from its rim
  const p = (((i - j) % (2 * RW)) + 2 * RW) % (2 * RW), q = (((i + j) % (2 * C)) + 2 * C) % (2 * C);
  let hs = Math.imul(p * 73856093 ^ q * 19349663, 0x9e3779b1) >>> 0; const rnd = () => { hs = Math.imul(hs ^ (hs >>> 15), 0x2c1b3c6d) >>> 0; return hs / 4294967296; };
  const lip = 0.04 + 0.08 * rnd(), broken = rnd() < 0.15 ? 0.4 + 0.3 * rnd() : 1, tone = rnd(), tilt = (rnd() - 0.5) * 0.5;
  // a shingle: flush with the trunk at its foot, standing proud toward the cut at its top, where it drops into the dark gap
  // under the boots above; its sides blend into the fibre
  const up = (sv + 1) / 2, ramp = Math.pow(up, 0.9) * (1 + tilt * su);
  const side = THREE.MathUtils.smoothstep(e, 0, 0.16), top = sv > 0 ? THREE.MathUtils.smoothstep(e, 0, lip) : 1;
  const body = Math.max(0, ramp * side * top * broken * (1 - 0.12 * su * su));
  return { h: body, e, sv, su, tone, gap: sv > 0 ? 1 - THREE.MathUtils.smoothstep(e, 0, lip * 0.8) : 0 };
}
let bootTex: { map: THREE.Texture; normalMap: THREE.Texture } | null = null;
/** Colour and normal of the boot lattice (one tile = the whole circumference × TILE_H). */
export function bootTextures() {
  if (bootTex) return bootTex;
  const S = 512, rnd = mulberry32(5), hgt = new Float32Array(S * S), col = new Uint8ClampedArray(S * S * 4);
  const fib = new Float32Array(S * 4); for (let i = 0; i < fib.length; i++) fib[i] = rnd();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, bt = boot(u, v);
    // fibre: coarse brown threads in the crevices, running diagonally (the leaf sheath's net)
    const f1 = fib[(x * 3 + y * 2) % fib.length], f2 = fib[(x * 5 - y * 3 + 4 * S) % fib.length], fibre = 0.55 * f1 + 0.45 * f2;
    const streak = fib[(x * 11 + (y >> 3)) % fib.length] * 0.6 + fib[(x * 7 + (y >> 1) * 13) % fib.length] * 0.4; // weathered grain along the boots
    const crev = Math.max(bt.gap, 0.45 * (1 - THREE.MathUtils.smoothstep(bt.e, 0.0, 0.07))); // dark only in the gap under each cut; the sides are fibre
    const h = bt.h * 0.8 + crev * fibre * 0.18 + streak * 0.07 * (1 - crev);
    hgt[y * S + x] = h;
    // boots: weathered grey-brown, paler along the cut, darker toward their foot; the gaps: dark fibre
    const cut = THREE.MathUtils.smoothstep(bt.sv, 0.5, 0.8) * (1 - crev), shade = 0.7 + 0.3 * Math.pow((bt.sv + 1) / 2, 0.8);
    const t = (0.84 + 0.3 * bt.tone) * (0.9 + 0.2 * streak);
    let r = 142 * t * shade, g = 128 * t * shade, b = 111 * t * shade; // sun-bleached: a grey-brown, not a painted brown
    r += cut * 30; g += cut * 27; b += cut * 22;
    const fr = 70 + 70 * fibre, fg = 57 + 55 * fibre, fb = 43 + 38 * fibre; // the sheath fibre: a matted mid brown
    r = r * (1 - crev) + fr * crev; g = g * (1 - crev) + fg * crev; b = b * (1 - crev) + fb * crev;
    const k = y * S * 4 + x * 4; col[k] = r; col[k + 1] = g; col[k + 2] = b; col[k + 3] = 255;
  }
  const nor = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)], hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    const nx = -hx * 4, ny = -hy * 4, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * S + x) * 4;
    nor[i] = (nx / l * 0.5 + 0.5) * 255; nor[i + 1] = (ny / l * 0.5 + 0.5) * 255; nor[i + 2] = (nz / l * 0.5 + 0.5) * 255; nor[i + 3] = 255;
  }
  const tex = (data: Uint8ClampedArray, srgb: boolean) => { const t = new THREE.DataTexture(data, S, S); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.needsUpdate = true; return t; };
  bootTex = { map: tex(col, true), normalMap: tex(nor, false) };
  return bootTex;
}

function trunkGeo(o: PalmSpec, lod: PalmLod, rnd: () => number, bend: number) {
  const h = o.h, S = lod.sides, rings = Math.max(4, Math.round(h * lod.rings)), wob = (rnd() - 0.5) * 0.16, wobAz = bend + Math.PI / 2, ph = rnd() * 6;
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const crown0 = h - 1.1;
  const centre = (y: number) => { const t = y / h; const s = o.lean * t * t, w = wob * Math.sin(Math.PI * t); return [Math.cos(bend) * s + Math.cos(wobAz) * w, Math.sin(bend) * s + Math.sin(wobAz) * w]; };
  for (let j = 0; j <= rings; j++) {
    const y = -0.05 + (h + 0.25) * (j / rings), t = y / h, [cx, cz] = centre(Math.min(y, h));
    const flare = 1 + 0.45 * Math.pow(Math.max(0, 1 - y / 0.7), 2);
    const swell = 1 + 0.5 * THREE.MathUtils.smoothstep(y, crown0, h - 0.25) - 0.55 * THREE.MathUtils.smoothstep(y, h, h + 0.2);
    const r = 0.19 * o.girth * flare * swell * (1 + 0.05 * Math.sin(y * 1.1 + ph) + 0.03 * Math.sin(y * 2.9 + ph * 2)) * (1 - 0.08 * t);
    const amp = (y < 0.5 ? 0.01 + 0.05 * y : 0.035) * (y > crown0 ? 1.7 : 1) * o.girth;
    const grey = 1 - THREE.MathUtils.smoothstep(t, 0, 0.5); // weathered grey low down, browner under the crown
    for (let i = 0; i <= S; i++) {
      const u = i / S, th = u * Math.PI * 2, bt = lod.sides >= 12 ? boot(u, y / TILE_H) : { h: 0.5 };
      const rr = r + amp * (bt.h - 0.4);
      pos.push(cx + Math.cos(th) * rr, y, cz + Math.sin(th) * rr); uv.push(u, y / TILE_H);
      const k = 0.96 + 0.08 * Math.sin(y * 3.7 + ph) ;
      col.push(k * (1.0 + 0.05 * grey), k * (1.0 + 0.07 * grey), k * (1.0 + 0.14 * grey) * (y > crown0 ? 0.9 : 1));
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < S; i++) { const a = j * (S + 1) + i, b = a + S + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // the seam: the first and last columns are the same points, give them the same normal
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let j = 0; j <= rings; j++) { const a = j * (S + 1), b = a + S; const x = n.getX(a) + n.getX(b), yv = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, yv, z) || 1; n.setXYZ(a, x / l, yv / l, z / l); n.setXYZ(b, x / l, yv / l, z / l); }
  const [tx, tz] = centre(h);
  return { geo: g, top: new THREE.Vector3(tx, h, tz), r: 0.19 * o.girth * 1.5 };
}

/* ------------------------------------------------------------ the crown */
class Buf {
  pos: number[] = []; nor: number[] = []; col: number[] = []; fr: number[] = []; arc: number[] = [];
  root = new THREE.Vector3(); phase = 0; centre = new THREE.Vector3();
  private n = new THREE.Vector3(); private e1 = new THREE.Vector3(); private e2 = new THREE.Vector3(); private rad = new THREE.Vector3();
  /** a triangle; its normal is turned to the outside of the crown and bent toward it by `lean` (0 = the facet's own) */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, col: THREE.Color, arcA: number, arcB: number, arcC: number, lean = 0.5, cB?: THREE.Color, cC?: THREE.Color) {
    this.n.crossVectors(this.e1.subVectors(b, a), this.e2.subVectors(c, a)); if (this.n.lengthSq() < 1e-14) return; this.n.normalize();
    this.rad.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(this.centre); this.rad.y *= 0.7; this.rad.normalize();
    if (this.n.dot(this.rad) < 0) this.n.negate();
    this.n.multiplyScalar(1 - lean).addScaledVector(this.rad, lean).normalize();
    const cs = [col, cB ?? col, cC ?? col], arcs = [arcA, arcB, arcC];
    [a, b, c].forEach((p, k) => { this.pos.push(p.x, p.y, p.z); this.nor.push(this.n.x, this.n.y, this.n.z); this.col.push(cs[k].r, cs[k].g, cs[k].b); this.fr.push(this.root.x, this.root.y, this.root.z, this.phase); this.arc.push(arcs[k]); });
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFrond', new THREE.Float32BufferAttribute(this.fr, 4)); g.setAttribute('aArc', new THREE.Float32BufferAttribute(this.arc, 1));
    return g;
  }
}

interface FrondLook { base: THREE.Color; tip: THREE.Color; burnt: number; dead: boolean }
/**
 * One frond from `root` along azimuth `az`, leaving at elevation `el` (rad) and losing `bend` rad of it by the tip.
 * `age` 0 = the spear in the heart … 1 = the oldest living frond; `closed` folds the leaflets up against the rachis.
 */
function frond(B: Buf, lod: PalmLod, rnd: () => number, root: THREE.Vector3, az: number, el: number, L: number, bend: number, age: number, look: FrondLook, closed = 0) {
  const R = (a: number, b: number) => a + rnd() * (b - a);
  B.root.copy(root); B.phase = rnd() * Math.PI * 2;
  // the rachis: integrate the falling angle, a little yaw drift and a roll of the blade
  const N = 18, pts: THREE.Vector3[] = [root.clone()], yawDrift = R(-0.12, 0.12), roll = R(-0.45, 0.45) * (0.4 + age);
  const p = root.clone(), stiff = 1.3 + 0.6 * (1 - age);
  for (let k = 1; k <= N; k++) { const s = (k - 0.5) / N, th = el - bend * Math.pow(s, stiff), yaw = az + yawDrift * s; p.add(new THREE.Vector3(Math.cos(th) * Math.cos(yaw), Math.sin(th), Math.cos(th) * Math.sin(yaw)).multiplyScalar(L / N)); pts.push(p.clone()); }
  const at = (s: number) => { const f = Math.min(N - 1e-6, Math.max(0, s * N)), k = Math.floor(f), t = f - k; return pts[k].clone().lerp(pts[k + 1], t); };
  const frame = (s: number) => {
    const T = at(Math.min(1, s + 0.02)).sub(at(Math.max(0, s - 0.02))).normalize(), yaw = az + yawDrift * s;
    const Lat0 = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw)); Lat0.addScaledVector(T, -Lat0.dot(T)).normalize();
    const Nu0 = new THREE.Vector3().crossVectors(Lat0, T).normalize(); // the upper (adaxial) side: up for a level frond, toward the heart for a standing one
    const r = roll * s, cr = Math.cos(r), sr = Math.sin(r); // the blade rolls a little about its rachis toward the tip
    return { T, Lat: Lat0.clone().multiplyScalar(cr).addScaledVector(Nu0, sr), Nu: Nu0.clone().multiplyScalar(cr).addScaledVector(Lat0, -sr) };
  };
  const rachisC = look.dead ? look.base.clone().multiplyScalar(0.9) : new THREE.Color('#8b8c6a').lerp(look.base, 0.3);
  // rachis: a flat top and a keel below; stout at the root, a wire at the tip
  const SEG = lod.fine ? 14 : 8;
  let prev: { l: THREE.Vector3; r: THREE.Vector3; k: THREE.Vector3; s: number } | null = null;
  for (let i = 0; i <= SEG; i++) {
    const s = i / SEG, c = at(s), { Lat, Nu } = frame(s), w = (0.085 * Math.pow(1 - s, 1.3) + 0.01) * (L / 4.2);
    const cur = { l: c.clone().addScaledVector(Lat, -w / 2).addScaledVector(Nu, w * 0.12), r: c.clone().addScaledVector(Lat, w / 2).addScaledVector(Nu, w * 0.12), k: c.clone().addScaledVector(Nu, -w * 0.45), s };
    if (prev) {
      B.tri(prev.l, prev.r, cur.r, rachisC, prev.s, prev.s, s, 0.3); B.tri(prev.l, cur.r, cur.l, rachisC, prev.s, s, s, 0.3);
      if (lod.fine) { const kc = rachisC.clone().multiplyScalar(0.8); B.tri(prev.l, prev.k, cur.k, kc, prev.s, prev.s, s, 0.3); B.tri(prev.l, cur.k, cur.l, kc, prev.s, s, s, 0.3); B.tri(prev.r, cur.r, cur.k, kc, prev.s, s, s, 0.3); B.tri(prev.r, cur.k, prev.k, kc, prev.s, s, prev.s, 0.3); }
    }
    prev = cur;
  }
  const s0 = 0.26 + R(-0.03, 0.03);
  // spines: the lowest leaflets turned to stiff yellow needles along the petiole
  if (lod.fine && !look.dead) {
    const spineC = new THREE.Color('#b8a66c');
    for (let s = 0.1; s < s0; s += R(0.012, 0.022)) for (const side of [-1, 1]) {
      if (rnd() < 0.25) continue;
      const c = at(s), { T, Lat, Nu } = frame(s), D = Lat.clone().multiplyScalar(side).addScaledVector(Nu, R(0.2, 0.9)).addScaledVector(T, R(0.6, 1.1)).normalize(), l = R(0.06, 0.14) * (0.5 + (s - 0.1) / (s0 - 0.1));
      const b = c.clone().addScaledVector(Lat, side * 0.02), x = new THREE.Vector3().crossVectors(D, Nu).normalize().multiplyScalar(0.006);
      B.tri(b.clone().sub(x), b.clone().add(x), b.clone().addScaledVector(D, l), spineC, s, s, s, 0.4);
    }
  }
  // leaflets: V-folded lanceolate blades in three planes each side
  const P = Math.max(6, Math.round(lod.pairs * (0.75 + 0.25 * L / 4.2))), lmax = 0.44 * (L / 4.2) * R(0.9, 1.1), c = new THREE.Color(), tipC = new THREE.Color();
  const planes = look.dead ? [-0.9, -1.2, -0.6] : closed > 0 ? [1.1, 1.25, 1.35] : [-0.28, 0.2, 0.62], sweep0 = closed > 0 ? 1.15 : R(0.62, 0.8);
  for (let i = 0; i < P; i++) {
    for (const side of [-1, 1]) {
      const s = s0 + (1 - s0) * Math.min(0.995, (i + R(-0.35, 0.35) + (side > 0 ? 0.5 : 0)) / P), t = (s - s0) / (1 - s0);
      if (look.dead && rnd() < 0.35) continue;
      const cpt = at(s), { T, Lat, Nu } = frame(s);
      const prof = t < 0.3 ? 0.42 + 0.58 * THREE.MathUtils.smootherstep(t, 0, 0.3) : 1 - 0.68 * Math.pow((t - 0.3) / 0.7, 1.5);
      const ll = lmax * prof * R(0.82, 1.12), plane = planes[(i + (side > 0 ? 1 : 0)) % 3] + R(-0.22, 0.22), sw = sweep0 + R(-0.12, 0.12) + 0.25 * t;
      const D = Lat.clone().multiplyScalar(side * Math.cos(plane)).addScaledVector(Nu, Math.sin(plane)).multiplyScalar(Math.cos(sw)).addScaledVector(T, Math.sin(sw)).normalize();
      const base = cpt.clone().addScaledVector(D, 0.012);
      const tip = base.clone().addScaledVector(D, ll); tip.y -= ll * (look.dead ? 0.35 : 0.07 + 0.2 * age * (1 - Math.abs(D.y)));
      const Dm = tip.clone().sub(base).normalize(), Nl = Nu.clone().addScaledVector(Dm, -Nu.dot(Dm)).normalize(), X = new THREE.Vector3().crossVectors(Dm, Nl).normalize();
      const w = lod.leafW * R(0.8, 1.2) * (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3))), mid = base.clone().addScaledVector(Dm, ll * 0.32);
      const ml = mid.clone().addScaledVector(X, -w / 2).addScaledVector(Nl, w * 0.38), mr = mid.clone().addScaledVector(X, w / 2).addScaledVector(Nl, w * 0.38);
      // colour: the frond's own hue toward its tip, burnt tips on some, the crown's shade on the inner leaflets
      c.copy(look.base).lerp(look.tip, t * 0.7).offsetHSL(R(-0.012, 0.012), R(-0.03, 0.03), R(-0.035, 0.035));
      if (look.burnt > 0 && t > 1 - look.burnt) c.lerp(new THREE.Color('#9c8356'), THREE.MathUtils.smoothstep(t, 1 - look.burnt, 1 - look.burnt * 0.4));
      c.multiplyScalar(0.58 + 0.42 * THREE.MathUtils.smoothstep(s, 0.18, 0.6));
      tipC.copy(c).multiplyScalar(1.12);
      B.tri(base, mr, tip, c, s, s, s, 0.5, c, tipC); B.tri(base, tip, ml, c, s, s, s, 0.5, tipC, c);
    }
  }
}

/** A bunch of dates: an orange stalk arching out from the crown and down, a cascade of strands, fruits along them. */
function dateBunch(B: Buf, rnd: () => number, from: THREE.Vector3, az: number, fine: boolean) {
  const R = (a: number, b: number) => a + rnd() * (b - a);
  B.root.copy(from); B.phase = rnd() * Math.PI * 2;
  const F = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), Lat = new THREE.Vector3(-F.z, 0, F.x);
  const stalkC = new THREE.Color('#c98a36'), fruitC = new THREE.Color(rnd() < 0.55 ? '#d9a126' : '#b0561f'), c = new THREE.Color();
  const P0 = from.clone(), P1 = from.clone().addScaledVector(F, 0.55).add(new THREE.Vector3(0, 0.1, 0)), P2 = from.clone().addScaledVector(F, 0.85).add(new THREE.Vector3(0, -0.55, 0));
  const q = (t: number) => { const u = 1 - t; return P0.clone().multiplyScalar(u * u).addScaledVector(P1, 2 * u * t).addScaledVector(P2, t * t); };
  for (let k = 0; k < 6; k++) { const a = q(k / 6), b = q((k + 1) / 6), w = 0.028; B.tri(a.clone().addScaledVector(Lat, -w), a.clone().addScaledVector(Lat, w), b.clone().addScaledVector(Lat, w), stalkC, 0.15, 0.15, 0.15, 0.3); B.tri(a.clone().addScaledVector(Lat, -w), b.clone().addScaledVector(Lat, w), b.clone().addScaledVector(Lat, -w), stalkC, 0.15, 0.15, 0.15, 0.3); }
  const strands = fine ? 34 : 14, per = fine ? 9 : 5, oct = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => new THREE.Vector3(...v));
  const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  for (let sI = 0; sI < strands; sI++) {
    const a = q(R(0.6, 1)), spread = R(0, Math.PI * 2), rr = R(0.03, 0.2), end = a.clone().add(new THREE.Vector3(Math.cos(spread) * rr, -R(0.3, 0.6), Math.sin(spread) * rr));
    const x = new THREE.Vector3(Math.cos(spread + 1.57), 0, Math.sin(spread + 1.57)).multiplyScalar(0.004);
    B.tri(a.clone().sub(x), a.clone().add(x), end, stalkC, 0.15, 0.15, 0.15, 0.3);
    for (let f = 0; f < per; f++) {
      const t = R(0.25, 1), ctr = a.clone().lerp(end, t).add(new THREE.Vector3(R(-0.025, 0.025), -0.02, R(-0.025, 0.025)));
      c.copy(fruitC).offsetHSL(R(-0.02, 0.02), 0, R(-0.06, 0.05));
      const sc = new THREE.Vector3(0.012, 0.02, 0.012), v = oct.map((o) => o.clone().multiply(sc).add(ctr));
      for (const [i0, i1, i2] of faces) B.tri(v[i0], v[i1], v[i2], c, 0.15, 0.15, 0.15, 0.2);
    }
  }
}

export interface PalmKit { wood: THREE.BufferGeometry; leaf: THREE.BufferGeometry }
export function datePalm(seed: number, o: PalmSpec, lod: PalmLod): PalmKit {
  const rnd = mulberry32(seed), R = (a: number, b: number) => a + rnd() * (b - a);
  const bend = R(0, Math.PI * 2);
  const tr = trunkGeo(o, lod, rnd, bend), top = tr.top;
  const B = new Buf(); B.centre.copy(top).add(new THREE.Vector3(0, 0.2, 0));
  const n = Math.max(8, Math.round(o.fronds * lod.fronds));
  const glaucous = [new THREE.Color('#4d5e50'), new THREE.Color('#566852'), new THREE.Color('#617050'), new THREE.Color('#6d714c')]; // heart … skirt: a blue-grey bloom yellowing with age
  const lowEl = -0.2 - 0.5 * (o.droop - 0.8);
  for (let i = 0; i < n; i++) {
    const age = i / (n - 1), az = i * 2.39996 + R(-0.18, 0.18);
    const spear = age < 0.06, young = age < 0.16;
    const el = spear ? R(1.15, 1.35) : THREE.MathUtils.lerp(1.15, lowEl, Math.pow(age, 0.8)) + R(-0.14, 0.14);
    const L = R(...o.len) * (spear ? R(0.55, 0.75) : young ? 0.8 + age : 1) * (1 - 0.08 * age);
    const bendA = (spear ? 0.05 : (0.2 + 1.0 * Math.pow(age, 1.25)) * o.droop) * R(0.75, 1.25);
    const root = top.clone().add(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(tr.r * (0.25 + 0.6 * age))).add(new THREE.Vector3(0, 0.3 - age * 0.95, 0));
    const gi = THREE.MathUtils.clamp(Math.floor(age * 3.2 + R(-0.3, 0.3)), 0, 3);
    const base = glaucous[gi].clone().offsetHSL(R(-0.015, 0.015), R(-0.04, 0.04), R(-0.03, 0.03));
    const dying = age > 0.8 && rnd() < 0.12;
    if (dying) base.lerp(new THREE.Color('#9b8a5a'), R(0.5, 0.85));
    const look: FrondLook = { base, tip: base.clone().lerp(new THREE.Color('#6f7a60'), 0.4), burnt: rnd() < 0.18 + 0.2 * age ? R(0.06, 0.2) : 0, dead: false };
    frond(B, lod, rnd, root, az, el, L, bendA, age, look, spear ? 1 : 0);
  }
  // the skirt: dead fronds hanging against the trunk under the crown
  for (let i = 0; i < Math.round(o.dry * (lod.fronds < 0.5 ? 0.5 : 1)); i++) {
    const az = R(0, Math.PI * 2), root = top.clone().add(new THREE.Vector3(Math.cos(az) * tr.r * 0.8, -R(0.75, 1.1), Math.sin(az) * tr.r * 0.8));
    const base = new THREE.Color(rnd() < 0.5 ? '#8a6c47' : '#9a7d55').offsetHSL(0, 0, R(-0.05, 0.03));
    frond(B, lod, rnd, root, az, R(-1.25, -1.05), R(2.0, 2.8), 0.15, 1, { base, tip: base.clone().multiplyScalar(1.1), burnt: 0, dead: true });
  }
  if (lod.pairs > 20) for (let i = 0; i < o.dates; i++) { const az = R(0, Math.PI * 2); dateBunch(B, rnd, top.clone().add(new THREE.Vector3(Math.cos(az) * tr.r * 0.7, -R(0.35, 0.6), Math.sin(az) * tr.r * 0.7)), az, lod.fine); }
  return { wood: tr.geo, leaf: B.geometry() };
}
