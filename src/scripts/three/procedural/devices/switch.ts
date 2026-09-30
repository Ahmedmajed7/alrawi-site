/**
 * The multi-gang key switch, modelled after the catalogue unit (p. 19, the graphite 3-gang) and its maker's sheets
 * ("anti-glare glass, plastic, aluminium"): an 86 × 86 mm unit about 10 mm proud of the wall.
 *
 *   wall │ foot (recessed: the shadow line) │ frame │ dark core │ keys
 *
 * What makes it read as the product and not as a grey tile:
 *   – separate keys, each its own chamfered slab with a hairline slot between them (a dark floor shows through);
 *   – a fine diamond-cut chamfer round every key that catches a line of light;
 *   – a satin, faintly crowned face: every key carries its own soft gradient of the room;
 *   – the catalogue's line bulb printed low on each key, softly backlit;
 *   – a cool-neutral graphite that stays grey in a warm room.
 * Everything is dimensioned in millimetres and scaled once (`size` units = 86 mm).
 */
import * as THREE from 'three';
import { num, str, bool, off, canvasTex, prng, mesh, type Ctx } from '../kit';

const MM = 86;          // the unit's side
const FLOAT = 4.6;      // the foot reaches this far behind the mounting plane (the walkthrough holds devices 4 mm off the wall)
const FOOT_IN = 1.4;    // … and is this much smaller all round: the shadow line against the wall
const FRAME_T = 2.4, FRAME_IN = 0.3, CORE_T = 0.5, CORE_IN = 1.1;
const KEY_T = 3.1, GAP = 0.55, CHAMFER = 0.45, RADIUS = 1.0, CROWN = 0.2;
const GRAD = 0.55;      // the face is lighter at the top than at the foot: the catalogue's soft light from above, carried in the finish
const ICON_H = 9, ICON_UP = 0.15, ICON_BOX = 12.8; // icon height, its centre's height up the key (share), and the square its texture covers

// cool-neutral bases: the room's light is warm, and a neutral grey would go brown in it
const FINISH: Record<string, string> = { graphite: '#464a51', grey: '#3b3f45', black: '#1c1d20', white: '#f1f0ec', champagne: '#c8b28d' };

/* ---------- geometry: a chamfered, faintly crowned slab with a rounded outline ---------- */
type Ring = { x: number; y: number; nx: number; ny: number }[];
/** a rounded rectangle's outline, counter-clockwise; the same point count at any inset, so rings stitch one to one */
function ring(hx: number, hy: number, r: number, seg: number): Ring {
  const out: Ring = []; r = Math.max(1e-4, Math.min(r, hx, hy));
  for (const [sx, sy, q] of [[1, 1, 0], [-1, 1, 1], [-1, -1, 2], [1, -1, 3]]) for (let i = 0; i <= seg; i++) { const a = (q + i / seg) * Math.PI / 2, nx = Math.cos(a), ny = Math.sin(a); out.push({ x: sx * (hx - r) + nx * r, y: sy * (hy - r) + ny * r, nx, ny }); }
  return out;
}
interface SlabOpts { w: number; h: number; t: number; r: number; c?: number; crown?: number; seg?: number; rings?: number; /** the face's colour runs from 1 + grad at the top to 1 − grad at the foot */ grad?: number; /** baked shade of the side walls: outward normal, 0 at the back … 1 at the front */ shade?: (nx: number, ny: number, up: number) => number }
/**
 * Back at z = 0, face at z = t (+ crown). Material groups: 0 the face, 1 the chamfer, 2 the side walls and the back.
 * The bands do not share vertices, so the chamfer stays a crisp facet; the face's normals follow the crown analytically.
 */
function slab({ w, h, t, r, c = 0, crown = 0, seg = 6, rings = 1, grad = 0, shade = () => 1 }: SlabOpts) {
  const hx = w / 2, hy = h / 2, A = ring(hx, hy, r, seg), F = ring(hx - c, hy - c, r - c, seg), n = A.length;
  const pos: number[] = [], nor: number[] = [], tan: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number, tx: number, ty: number, s = 1) => { pos.push(x, y, z); nor.push(nx, ny, nz); tan.push(tx, ty, 0, 1); uv.push(x / w + 0.5, y / h + 0.5); col.push(s, s, s); return pos.length / 3 - 1; };
  const fx = hx - c, fy = hy - c;
  const zf = (x: number, y: number) => t + crown * (1 - (x / fx) ** 2) * (1 - (y / fy) ** 6); // crowned across the key, flat along it until the ends
  const nf = (x: number, y: number) => { const dx = crown * (-2 * x / (fx * fx)) * (1 - (y / fy) ** 6), dy = crown * (1 - (x / fx) ** 2) * (-6 * (y / fy) ** 5 / fy), l = Math.hypot(dx, dy, 1); return [-dx / l, -dy / l, 1 / l]; };
  const geo = new THREE.BufferGeometry(); let from = 0;
  const group = (m: number) => { geo.addGroup(from, idx.length - from, m); from = idx.length; };
  const stitch = (a: number, b: number) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(a + i, a + j, b + j, a + i, b + j, b + i); } }; // a: the outer / lower ring, b: the inner / upper one
  // face: rings shrinking to the centre
  const first: number[] = [];
  for (let k = 0; k < rings; k++) { const s = 1 - k / rings; first.push(pos.length / 3); for (const q of F) { const x = q.x * s, y = q.y * s, [a, b, d] = nf(x, y); v(x, y, zf(x, y), a, b, d, 1, 0, 1 + grad * y / fy); } }
  const mid = v(0, 0, zf(0, 0), 0, 0, 1, 1, 0);
  for (let k = 0; k < rings - 1; k++) stitch(first[k], first[k + 1]);
  for (let i = 0; i < n; i++) idx.push(first[rings - 1] + i, first[rings - 1] + (i + 1) % n, mid);
  group(0);
  // chamfer: 45° between the side wall and the face
  if (c > 0) { const a = pos.length / 3; for (const q of A) v(q.x, q.y, t - c, q.nx * Math.SQRT1_2, q.ny * Math.SQRT1_2, Math.SQRT1_2, -q.ny, q.nx); const b = pos.length / 3; for (const q of F) v(q.x, q.y, zf(q.x, q.y), q.nx * Math.SQRT1_2, q.ny * Math.SQRT1_2, Math.SQRT1_2, -q.ny, q.nx); stitch(a, b); }
  group(1);
  // side walls and the back
  { const a = pos.length / 3; for (const q of A) v(q.x, q.y, 0, q.nx, q.ny, 0, -q.ny, q.nx, shade(q.nx, q.ny, 0)); const b = pos.length / 3; for (const q of A) v(q.x, q.y, t - c, q.nx, q.ny, 0, -q.ny, q.nx, shade(q.nx, q.ny, 1)); stitch(a, b);
    const e = pos.length / 3; for (const q of A) v(q.x, q.y, 0, 0, 0, -1, 1, 0, 0.5); const o = v(0, 0, 0, 0, 0, -1, 1, 0, 0.5); for (let i = 0; i < n; i++) idx.push(e + (i + 1) % n, e + i, o); }
  group(2);
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('tangent', new THREE.Float32BufferAttribute(tan, 4)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/** one band of a slab as a geometry of its own (the vertices are shared): the walkthrough hands its room reflection map to
 *  single-material meshes only, so the face, the chamfer and the walls are three meshes and not one mesh with three materials */
function band(geo: THREE.BufferGeometry, m: number) {
  const out = new THREE.BufferGeometry(), gr = geo.groups[m], idx = geo.index!;
  for (const k of Object.keys(geo.attributes)) out.setAttribute(k, geo.attributes[k]);
  out.setIndex(Array.from(idx.array as ArrayLike<number>).slice(gr.start, gr.start + gr.count)); return out;
}

/* ---------- surface: satin grain, a whisper of unevenness in the sheen ---------- */
let _grain: THREE.Texture | null = null, _mottle: THREE.Texture | null = null;
/** satin tooth as a normal map: a fine even grain with faint lengthwise drawing marks (the keys are finished along their length) */
function grain() {
  if (_grain) return _grain;
  _grain = canvasTex(512, 512, (g, N) => {
    const rnd = prng(101), a = new Float32Array(N * N), h = new Float32Array(N * N), img = g.createImageData(N, N);
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    const at = (f: Float32Array, x: number, y: number) => f[((y + N) % N) * N + ((x + N) % N)];
    const line = new Float32Array(N); for (let x = 0; x < N; x++) line[x] = rnd();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = (at(a, x, y) * 4 + at(a, x + 1, y) + at(a, x - 1, y) + at(a, x, y + 1) + at(a, x, y - 1)) / 8 * 0.7 + (line[x] * 2 + line[(x + 1) % N] + line[(x + N - 1) % N]) / 4 * 0.3;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = at(h, x + 1, y) - at(h, x - 1, y), dy = at(h, x, y + 1) - at(h, x, y - 1), i = (y * N + x) * 4; img.data[i] = 128 + dx * 150; img.data[i + 1] = 128 + dy * 150; img.data[i + 2] = 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, false);
  _grain.wrapS = _grain.wrapT = THREE.RepeatWrapping; return _grain;
}
/** the sheen is never perfectly even: slow, faint roughness variation (tileable value noise, two octaves) */
function mottle() {
  if (_mottle) return _mottle;
  _mottle = canvasTex(256, 256, (g, N) => {
    const rnd = prng(57), img = g.createImageData(N, N);
    const oct = (L: number) => { const lat = new Float32Array(L * L); for (let i = 0; i < lat.length; i++) lat[i] = rnd(); return (x: number, y: number) => { const fx = x / N * L, fy = y / N * L, x0 = Math.floor(fx), y0 = Math.floor(fy), sx = fx - x0, sy = fy - y0, ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy), q = (i: number, j: number) => lat[(j % L) * L + (i % L)]; return (q(x0, y0) * (1 - ux) + q(x0 + 1, y0) * ux) * (1 - uy) + (q(x0, y0 + 1) * (1 - ux) + q(x0 + 1, y0 + 1) * ux) * uy; }; };
    const o1 = oct(4), o2 = oct(11);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const q = 255 * (0.88 + 0.12 * (o1(x, y) * 0.65 + o2(x, y) * 0.35)), i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = q; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, false);
  _mottle.wrapS = _mottle.wrapT = THREE.RepeatWrapping; return _mottle;
}
/** one image, another placement: clones share the pixels on the GPU */
function placed(t: THREE.Texture, rx: number, ry: number, ox: number, oy: number) { const c = t.clone(); c.repeat.set(rx, ry); c.offset.set(ox, oy); c.needsUpdate = true; return c; }

/* ---------- the icon ---------- */
/**
 * The catalogue's line bulb, one pen weight throughout: a round globe left open at the lower right, a glint inside it, five
 * rays above and a coiled base below. Design space: globe radius 1, y up; it spans y −2.45 … 1.8 (the caps included).
 */
const ICON_SPAN = 4.25, ICON_MID = -0.325;
function bulb(g: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  const rad = (d: number) => d * Math.PI / 180, X = (x: number) => cx + x * R, Y = (y: number) => cy - y * R;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = R * 0.17;
  g.beginPath(); g.arc(cx, cy, R, rad(58), rad(398)); g.stroke();                    // the globe, open between 4 and 5 o'clock
  g.beginPath(); g.arc(cx, cy, R * 0.62, rad(-162), rad(-116)); g.stroke();          // the glint
  for (const a of [26, 58, 90, 122, 154]) { g.beginPath(); g.moveTo(X(Math.cos(rad(a)) * 1.3), Y(Math.sin(rad(a)) * 1.3)); g.lineTo(X(Math.cos(rad(a)) * 1.72), Y(Math.sin(rad(a)) * 1.72)); g.stroke(); } // the rays
  g.beginPath(); g.moveTo(X(-0.56), Y(-1.24));                                        // the coil: three turns, drawn left to right and back
  g.quadraticCurveTo(X(1.05), Y(-1.36), X(0), Y(-1.58)); g.quadraticCurveTo(X(-1.05), Y(-1.78), X(0), Y(-1.86));
  g.quadraticCurveTo(X(1.05), Y(-1.96), X(0), Y(-2.12)); g.quadraticCurveTo(X(-1.0), Y(-2.3), X(0.34), Y(-2.36)); g.stroke();
}
const _icons = new Map<string, THREE.Texture>();
/** the key's colour with the icon printed on it (the face's colour map), or the icon alone with its halo (the backlight) */
function iconTex(kind: 'print' | 'glow', bg: string, ink: string) {
  const key = `${kind}${bg}${ink}`; if (_icons.has(key)) return _icons.get(key)!;
  const t = canvasTex(1024, 1024, (g, w, h) => {
    const R = (ICON_H / ICON_SPAN) * (w / ICON_BOX), cy = h / 2 + ICON_MID * R; // the icon's extent is centred in the square
    g.fillStyle = kind === 'print' ? bg : '#000'; g.fillRect(0, 0, w, h);
    if (kind === 'glow') { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.shadowColor = '#ffffff'; g.shadowBlur = R * 0.55; bulb(g, w / 2, cy, R); g.shadowBlur = 0; } // the light guide bleeds a little round the strokes
    g.strokeStyle = kind === 'print' ? ink : '#fff'; bulb(g, w / 2, cy, R);
  });
  t.anisotropy = 16; _icons.set(key, t); return t;
}

/* ---------- the unit ---------- */
/** keep a part out of `Box3.setFromObject`: the walkthrough takes the recipe's −Z extreme as the mounting plane and the viewer
 *  centres on the box, so what belongs inside (or against) the wall must not move either. `at`: a point inside the body. */
function unbounded<T extends THREE.Mesh>(m: T, at = new THREE.Vector3(0, 0, 1)) { m.updateMatrix(); const q = at.clone().applyMatrix4(m.matrix.clone().invert()); m.geometry.boundingBox = new THREE.Box3(q, q.clone()); return m; }

/**
 * Two dressings of the same unit. In the studio (the product viewer: neutral light) it wears its catalogue colour. In the
 * villa every lamp is warm (golden hour, 2700 K), and under warm light a neutral grey photographs brown: there the finish is
 * white-balanced against the lamps that reach it (`balance`: 1 = fully neutral), so that on film it is the catalogue's graphite.
 * Measured at stop 2 (sRGB, key centre): 94 at the top of the face, 74 mid, 56 at the foot, R = G = B within 1 (the catalogue
 * photograph: 120 / 92 / 60). The full balance overshot to blue: the room's reflection and bounce are warm too, and they are
 * not in the lamp sum; 0.6 with a 4 % green lift lands neutral. `albedo` darkens the swatch for the villa's light.
 */
interface Look { specular: number; coat: number; env: number; glow: number; edgeEnv: number; balance: number; /** the finish's reflectance against the catalogue swatch */ albedo: number; /** a green lift after the balance (its residue is magenta) */ green: number; /** a fixed white balance where no lamp sum is taken (linear rgb) */ tint?: [number, number, number] }
// the product viewer's light is near neutral, so the cool swatch (made for the warm villa) read blue there (B − R ≈ 10 at 125):
// a fixed tint takes it back to the catalogue's neutral graphite (B a hair over R) and the albedo to its key (top 121, mid 97)
const STUDIO: Look = { specular: 1, coat: 0.3, env: 1, glow: 1, edgeEnv: 1.25, balance: 0, albedo: 0.7, green: 1, tint: [1.04, 1, 0.925] };
const VILLA: Look = { specular: 0.9, coat: 0.04, env: 0.6, glow: 0.8, edgeEnv: 0.9, balance: 0.6, albedo: 0.46, green: 1.04 };

/**
 * The colour of the lamp light that reaches a wall-mounted unit: every point, spot and area lamp by what arrives (inverse
 * square, facing, cone) and the sky fill. The sun is left out: indoors the walls shade it, and no lamp is tested for shadow.
 */
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Color();
const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function lampLight(lamps: THREE.Light[], at: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) {
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
      if (ra.isRectAreaLight) k *= ra.width * ra.height * Math.max(0, _t.set(0, 0, -1).transformDirection(l.matrixWorld).dot(_d.negate())); // a lamp's -Z is where it shines
    }
    out.add(_c.copy(l.color).multiplyScalar(l.intensity * k));
  }
  return out;
}

/** The multi-gang key switch. Returns null for parameter sets it does not cover (dial, wireless, plain rockers). */
export function keySwitch({ p }: Ctx): THREE.Group | null {
  const finish = str(p, 'finish', ''), icons = bool(p, 'icons'), gangs = num(p, 'gangs', 3);
  if (bool(p, 'dial') || bool(p, 'wireless') || (finish !== 'graphite' && !icons) || (gangs === 4 && !icons)) return null;
  const size = num(p, 'size', 1.1), n = Math.min(4, Math.max(1, Math.round(gangs)));
  const base = new THREE.Color(FINISH[finish] ?? str(p, 'color', FINISH.graphite)), hex = '#' + base.getHexString(), dark = base.getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
  const g = new THREE.Group(), mm = new THREE.Group(); mm.scale.setScalar(size / MM); g.add(mm);

  // materials. A low environment weight on the dark parts: the room's reflection map is bright and even, and at full weight it greys them out
  const bodyC = base.clone().multiplyScalar(dark ? 0.42 : 0.8), wallC = base.clone().multiplyScalar(0.8), edgeC = base.clone().lerp(new THREE.Color('#ffffff'), dark ? 0.42 : 0.6);
  const body = new THREE.MeshStandardMaterial({ color: bodyC, roughness: 0.62, metalness: 0, envMapIntensity: 0.5, vertexColors: true });
  const pit = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(dark ? 0.06 : 0.12), roughness: 0.95, metalness: 0, envMapIntensity: 0.05 });
  const wall = new THREE.MeshStandardMaterial({ color: wallC, roughness: 0.55, metalness: 0, envMapIntensity: 0.5, vertexColors: true });
  // the chamfer is cut after the finish: brighter and smoother than the face, it draws each key's outline in light
  const edge = new THREE.MeshPhysicalMaterial({ color: edgeC, roughness: 0.26, metalness: 0.65, envMapIntensity: 1.25 });
  const faces: THREE.MeshPhysicalMaterial[] = [];

  // chassis
  mm.add(unbounded(mesh(slab({ w: MM - FOOT_IN * 2, h: MM - FOOT_IN * 2, t: FLOAT, r: RADIUS }), pit, 0, 0, -FLOAT))); // the foot, in shadow
  mm.add(mesh(slab({ w: MM - FRAME_IN * 2, h: MM - FRAME_IN * 2, t: FRAME_T, r: RADIUS, c: 0.25, shade: (_x, _y, up) => 0.55 + 0.45 * up }), body));
  mm.add(mesh(slab({ w: MM - CORE_IN * 2, h: MM - CORE_IN * 2, t: CORE_T, r: RADIUS }), pit, 0, 0, FRAME_T));          // the floor of the slots

  // keys
  const kw = (MM - GAP * (n - 1)) / n, z0 = FRAME_T + CORE_T, top = z0 + KEY_T, yIcon = -MM / 2 + MM * ICON_UP;
  const su = ICON_BOX / kw, sv = ICON_BOX / MM, print = placed(iconTex('print', hex, dark ? '#dcdee2' : '#55585d'), 1 / su, 1 / sv, -(0.5 - su / 2) / su, -(ICON_UP - sv / 2) / sv), glow = placed(iconTex('glow', hex, '#fff'), 1 / su, 1 / sv, -(0.5 - su / 2) / su, -(ICON_UP - sv / 2) / sv);
  const rnd = prng(n * 31 + 7);
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) / 2) * (kw + GAP) + i * (kw + GAP);
    const face = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', map: print, roughness: 0.36, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 1.0,
      normalMap: placed(grain(), kw / 12, MM / 12, rnd(), rnd()), normalScale: new THREE.Vector2(0.1, 0.1), roughnessMap: placed(mottle(), kw / 40, MM / 40, rnd(), rnd()), anisotropy: 0.2,
      emissive: '#fff0de', emissiveMap: glow, emissiveIntensity: 1, vertexColors: true,
    });
    faces.push(face);
    const geo = slab({ w: kw, h: MM, t: KEY_T, r: RADIUS, c: CHAMFER, crown: CROWN, rings: 8, grad: GRAD, shade: (nx, _y, up) => ((nx > 0.7 && i < n - 1) || (nx < -0.7 && i > 0) ? 0.12 + 0.4 * up : 0.7 + 0.3 * up) }); // walls that face a neighbour stand in the slot's shade
    const key = mesh(band(geo, 0), face, x, 0, z0); key.name = `key_${i}`; mm.add(key, mesh(band(geo, 1), edge, x, 0, z0), mesh(band(geo, 2), wall, x, 0, z0));
    const f = new THREE.Object3D(); f.name = `led_${i}`; f.position.set(x, yIcon + (-ICON_MID) * (ICON_H / ICON_SPAN), top + 0.15); mm.add(f); // the globe's centre: the landing pins its tappable glow here
  }

  // which dressing: the walkthrough gives indoor devices its room reflection map (house/devices.ts), the viewer lights by the scene's.
  // Asked before every draw (a handful of lamps to add up): the lamps may fade or flicker, and the finish follows them
  let villa: boolean | null = null, lamps: THREE.Light[] | null = null, seen = -1, age = 0;
  const at = new THREE.Vector3(), nrm = new THREE.Vector3(), light = new THREE.Color(), wb = new THREE.Color(1, 1, 1), one = new THREE.Color(1, 1, 1);
  const dress = (renderer: THREE.WebGLRenderer, scene: THREE.Object3D) => {
    const on = !!faces[0].envMap, L = on ? VILLA : STUDIO, frame = renderer.info.render.frame;
    if (on === villa && (!on || frame === seen)) return;
    villa = on; seen = frame;
    if (on) {
      if (!lamps || age++ % 240 === 0) { lamps = []; scene.traverse((o) => { const l = o as THREE.Light; if (l.isLight && !(l as THREE.DirectionalLight).isDirectionalLight) lamps!.push(l); }); }
      mm.getWorldPosition(at); nrm.set(0, 0, 1).transformDirection(mm.matrixWorld); lampLight(lamps, at, nrm, light);
      const y = 0.2126 * light.r + 0.7152 * light.g + 0.0722 * light.b, c = (v: number) => (y > 1e-5 ? Math.min(2.5, Math.max(0.4, y / Math.max(v, 1e-5))) : 1);
      wb.setRGB(c(light.r), c(light.g), c(light.b)).lerp(one, 1 - L.balance); wb.g *= L.green;
    } else wb.setRGB(...(L.tint ?? [1, 1, 1]));
    const top = Math.max(wb.r, wb.g, wb.b);
    faces.forEach((f, i) => { f.color.copy(wb).multiplyScalar(L.albedo); f.specularColor.copy(wb).multiplyScalar(1 / top); f.specularIntensity = Math.min(1, L.specular * top); f.clearcoat = L.coat; f.envMapIntensity = L.env; f.emissiveIntensity = L.glow * (i === 0 ? 1.5 : 1); }); // the first key is on: its backlight a little brighter
    edge.color.copy(edgeC).multiply(wb); edge.envMapIntensity = L.edgeEnv; wall.color.copy(wallC).multiply(wb).multiplyScalar(L.albedo); body.color.copy(bodyC).multiply(wb).multiplyScalar(L.albedo);
  };
  mm.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.onBeforeRender = (renderer, scene) => dress(renderer, scene); });

  // behind the wall (product viewer): the steel fixing plate and the relay module that sits in the wall box
  if (!off(p, 'back')) {
    const steel = new THREE.MeshStandardMaterial({ color: '#a4a7ab', roughness: 0.42, metalness: 0.9, envMapIntensity: 0.9 }), shell = new THREE.MeshStandardMaterial({ color: '#26272a', roughness: 0.6, metalness: 0, vertexColors: true }), brass = new THREE.MeshStandardMaterial({ color: '#c9a65a', roughness: 0.35, metalness: 1 });
    const back = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = mesh(geo, mat, x, y, z); m.rotation.y = Math.PI; return unbounded(m); }; // slabs turned round: their face looks at the wall
    mm.add(back(slab({ w: 72, h: 72, t: 1, r: 2.5, c: 0.2 }), steel, 0, 0, -FLOAT));
    for (const sx of [-1, 1]) mm.add(back(slab({ w: 7.5, h: 3.6, t: 0.3, r: 1.8 }), pit, sx * 30.15, 0, -FLOAT - 0.8));        // the fixing slots, 60.3 mm apart
    mm.add(back(slab({ w: 50, h: 53, t: 22, r: 3, c: 0.7, shade: (_x, _y, up) => 0.6 + 0.4 * up }), shell, 0, 0, -FLOAT - 1));
    mm.add(back(slab({ w: 41, h: 8.5, t: 0.4, r: 1 }), pit, 0, 19, -FLOAT - 23));                                             // the terminal strip
    for (let i = 0; i < 5; i++) mm.add(unbounded(mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.8, 24).rotateX(Math.PI / 2), brass, (i - 2) * 8, 19, -FLOAT - 23.5)));
    for (let i = 0; i < 6; i++) mm.add(back(slab({ w: 30, h: 1.3, t: 0.3, r: 0.6 }), pit, 0, -18 + i * 3.6, -FLOAT - 23));   // vents
  }

  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, 0, top + CROWN + 0.4); mm.add(hs); // centre of the face, just proud of it
  return g;
}
