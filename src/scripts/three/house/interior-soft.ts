/**
 * Soft goods for the rooms: upholstery, scatter cushions, throws, curtains and lamp shades, built the way they are made so that
 * none of them reads as a block of foam or a sheet of card:
 *  - a cushion is a filled cover: its edges are round, its faces rise toward the middle (crown), the cover is slack here and
 *    there, and a welt runs along the seams. No two are the same (every one takes a seed);
 *  - a scatter cushion is fattest in its belly (which slumps), pinched to a knife edge all round, its sides drawn in between
 *    the corners;
 *  - a curtain hangs from a heading that holds every fold in its place; further down the folds open, wander and lean, and the
 *    hem follows them;
 *  - a throw is a band of cloth folded in layers, laid over an arm along a path.
 * Upholstery has no seams to unwrap: its cloth is mapped from three sides and blended (`triplanar`), so the weave keeps its
 * scale and never smears round a cushion's edge.
 * The material helpers at the end give thin cloth and glass their optics: voile shows more cloth where a fold turns away and
 * lets the sun through, a lamp shade is brightest in front of its lamp, window glass throws no lamp's glint back into the room.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Smooth value noise, −1 … 1. */
export function noise2(x: number, y: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (i: number, j: number) => hash(i * 57.31 + j * 131.7 + seed * 17.17);
  return ((h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v) * 2 - 1;
}
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
/** One smooth skin: the box's faces share their edges' vertices, the normals run round them. */
function skin(g: THREE.BufferGeometry) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVertices(g, 1e-5); m.computeVertexNormals(); g.dispose(); return m; }
/** A closed tube along a loop of points (a welt, a rim). */
function loop(pts: THREE.Vector3[], radius: number, sides = 6) {
  const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const g = new THREE.TubeGeometry(c, Math.max(24, pts.length * 2), radius, sides, true); g.deleteAttribute('uv'); return g;
}

export interface CushionOpts {
  /** edge radius */ r?: number; /** how far the top rises in the middle */ crown?: number; /** … and the front (+z) */ belly?: number;
  /** depth of the dents in a slack cover */ slack?: number; /** how far the top has sunk where one sits (front middle) */ sag?: number; seed?: number; /** segments along the longest side */ seg?: number; /** the welt's radius (0 = a plain seam) */ welt?: number;
}
/** A boxed cushion, w × h × d about its centre, lying flat (y up, its front toward +z). Returns the cover and its welts. */
export function cushion(w: number, h: number, d: number, o: CushionOpts = {}): { body: THREE.BufferGeometry; welt: THREE.BufferGeometry | null } {
  const hw = w / 2, hh = h / 2, hd = d / 2, r = Math.min(o.r ?? 0.05, Math.min(hw, hh, hd) - 0.002), seed = o.seed ?? 1;
  const crown = o.crown ?? 0.025, belly = o.belly ?? 0.012, slack = o.slack ?? 0.004, sag = o.sag ?? 0, seg = o.seg ?? 26, L = Math.max(w, h, d);
  const n = (s: number) => Math.max(6, Math.round(seg * Math.pow(s / L, 0.55)));
  const g = new THREE.BoxGeometry(2, 2, 2, n(w), n(h), n(d)), p = g.attributes.position as THREE.BufferAttribute;
  const gather = (s: number) => Math.sign(s) * (1 - Math.pow(1 - Math.abs(s), 1.7)); // the grid is drawn toward the edges, where the surface turns
  for (let i = 0; i < p.count; i++) {
    let x = gather(p.getX(i)) * hw, y = gather(p.getY(i)) * hh, z = gather(p.getZ(i)) * hd;
    const cx = clamp(x, r - hw, hw - r), cy = clamp(y, r - hh, hh - r), cz = clamp(z, r - hd, hd - r), dx = x - cx, dy = y - cy, dz = z - cz, len = Math.hypot(dx, dy, dz);
    if (len > 1e-9) { x = cx + (dx / len) * r; y = cy + (dy / len) * r; z = cz + (dz / len) * r; }
    const u = x / hw, v = z / hd, t = (y + hh) / h, tz = (z + hd) / d;
    const dome = Math.pow(Math.max(0, Math.cos((u * Math.PI) / 2)), 0.7) * Math.pow(Math.max(0, Math.cos((v * Math.PI) / 2)), 0.7);
    const face = Math.pow(Math.max(0, Math.cos((u * Math.PI) / 2)), 0.7) * Math.pow(Math.max(0, Math.cos(((2 * t - 1) * Math.PI) / 2)), 0.7);
    const edge = 1 - smooth(Math.max(Math.abs(u), Math.abs(v)), 0.7, 1);
    y += crown * dome * t * t + slack * t * edge * (noise2(x * 4.3 + 3, z * 4.3, seed) + 0.5 * noise2(x * 11, z * 11 + 5, seed + 2));
    y -= sag * t * t * Math.exp(-(u * u) / 0.3 - ((v - 0.25) ** 2) / 0.35) * (1 + 0.3 * noise2(u * 2 + 1, v * 2, seed + 4)); // the filling has given where one sits
    z += belly * face * tz * tz; x += Math.sign(u) * belly * 0.5 * Math.pow(Math.max(0, Math.cos((v * Math.PI) / 2)), 0.7) * Math.pow(Math.max(0, Math.cos(((2 * t - 1) * Math.PI) / 2)), 0.7) * u * u;
    p.setXYZ(i, x, y, z);
  }
  const body = skin(g), wr = o.welt ?? 0.0035;
  if (wr <= 0) return { body, welt: null };
  // the welts sit where the faces meet the border: halfway round the edge, top and bottom
  const k = r * (1 - Math.SQRT1_2), q = r * Math.SQRT1_2, ring = (y: number) => { const pts: THREE.Vector3[] = [], ix = hw - r, iz = hd - r;
    for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, (3 * Math.PI) / 2]] as const) for (let j = 0; j <= 4; j++) { const a = a0 + (j / 4) * (Math.PI / 2); pts.push(new THREE.Vector3(sx * ix + Math.cos(a) * q, y, sz * iz + Math.sin(a) * q)); }
    // the long sides take the belly with them
    const out: THREE.Vector3[] = []; for (let j = 0; j < pts.length; j++) { const a = pts[j], b = pts[(j + 1) % pts.length]; out.push(a); if (a.distanceTo(b) > 0.12) for (let m = 1; m < 6; m++) out.push(a.clone().lerp(b, m / 6)); }
    return loop(out, wr); };
  return { body, welt: mergeGeometries([ring(hh - k + 0.001), ring(k - hh - 0.001)]) };
}

export interface PillowOpts { seed?: number; /** the dent a hand leaves in the top edge, 0 … 1 */ chop?: number; seg?: number; welt?: number; /** give the cover a uv (0 … 1 across its face): a woven pattern runs over it */ uv?: boolean }
/** A scatter cushion standing in the xy plane, w × h, d thick in its belly. Returns the cover and the welt round its edge. */
export function pillow(w: number, h: number, d: number, o: PillowOpts = {}): { body: THREE.BufferGeometry; welt: THREE.BufferGeometry | null } {
  const seed = o.seed ?? 1, nseg = o.seg ?? 20, chop = o.chop ?? 0, hw = w / 2, hh = h / 2;
  const g = new THREE.BoxGeometry(2, 2, 2, nseg, nseg, 2), p = g.attributes.position as THREE.BufferAttribute;
  const outline = (u: number, v: number): [number, number] => {
    const x = u * hw * (1 - 0.075 * (1 - v * v)) + 0.006 * noise2(v * 2.1, 1.3, seed), dent = chop * 0.16 * hh * Math.exp(-((u / 0.42) ** 2)) * smooth(v, -0.2, 1);
    return [x, v * hh * (1 - 0.075 * (1 - u * u)) - dent + 0.006 * noise2(u * 2.1, 7.7, seed)];
  };
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i), s = p.getZ(i), [x, y] = outline(u, v);
    const fill = Math.sqrt(Math.max(0, (1 - u ** 4) * (1 - v ** 4))) * (1 - 0.16 * v) * (1 + 0.1 * chop * Math.exp(-((u / 0.5) ** 2)) * v); // the filling slumps: the belly sits low
    const wr = 0.0035 * (noise2(u * 5 + 1, v * 5, seed + 4) + 0.6 * noise2(u * 12, v * 12 + 3, seed + 5)) * Math.min(1, fill * 3);
    p.setXYZ(i, x, y, s * (d / 2) * (0.03 + 0.97 * fill) + Math.sign(s) * wr);
  }
  const body = skin(g), wr = o.welt ?? 0.003;
  if (o.uv) { const q = body.attributes.position as THREE.BufferAttribute, uv = new Float32Array(q.count * 2); for (let i = 0; i < q.count; i++) { uv[i * 2] = q.getX(i) / w + 0.5; uv[i * 2 + 1] = q.getY(i) / h + 0.5; } body.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  if (wr <= 0) return { body, welt: null };
  const pts: THREE.Vector3[] = [], m = 14;
  for (let j = 0; j < m; j++) pts.push(new THREE.Vector3(...outline(1, -1 + (2 * j) / m), 0)); for (let j = 0; j < m; j++) pts.push(new THREE.Vector3(...outline(1 - (2 * j) / m, 1), 0));
  for (let j = 0; j < m; j++) pts.push(new THREE.Vector3(...outline(-1, 1 - (2 * j) / m), 0)); for (let j = 0; j < m; j++) pts.push(new THREE.Vector3(...outline(-1 + (2 * j) / m, -1), 0));
  return { body, welt: loop(pts, wr, 5) };
}

export interface DrapeOpts {
  folds: number; /** the furthest a fold may stand off the track's line under the heading (m): the room between the tracks */ depth: number;
  seed?: number; /** how far the folds leave their places toward the hem, 0 … 1 */ wander?: number; segY?: number;
  /** cloth ÷ track when drawn: 2 … 2.5 for a wave heading */ fullness?: number; /** how much wider a gathered stack is at its hem than under its heading */ flare?: number;
  /** the edge that stays put when the stack flares: −1 = the −x edge (its return to the wall), 1 = the +x edge, 0 = both spread */ pin?: -1 | 0 | 1;
}
/** A leaf and the way it hangs: `set(span)` lays its cloth over `span` metres of track (w, drawn, … a quarter of it, parted). */
export interface Drape { geo: THREE.BufferGeometry; set(span: number): void }
/**
 * A curtain leaf, `w` wide on its track when drawn and H long, hanging from y = 0 in the xy plane; the folds stand out along z
 * (+z = the room). uv: u across the cloth, v = 1 at the heading, 0 at the hem. Colour: how much light reaches the cloth (its
 * pockets, the hem's turn-up, the heading under the track), for a material with vertexColors.
 * The cloth is fixed and the track it hangs on is not: each fold keeps its length of cloth (a wave of pitch p and depth 2A holds
 * about √(p² + 16A²)), so a drawn leaf lies in shallow waves and a parted one stands in deep folds, and never at the depth a
 * scaled mesh would give it (a squeezed accordion reads as a vertical blind). The folds turn round at their crests (cloth has a
 * bend it will not go under) and run straight between; under the heading they keep the runners' spacing, lower down they wander,
 * lean and open out, and a parted stack is wider at its hem than at its heading.
 */
export function drape(w: number, H: number, o: DrapeOpts): Drape {
  const seed = o.seed ?? 1, F = o.folds, per = 18, nx = Math.max(12, Math.round(F * per)), ny = o.segY ?? 22, wander = o.wander ?? 0.5;
  const full = o.fullness ?? 2.2, flare = o.flare ?? 0.3, pin = o.pin ?? 0, L = (w * full) / F; // L: the cloth in one fold
  const n = (nx + 1) * (ny + 1), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx: number[] = [];
  // (the rows are spaced closer toward the hem, where the folds wander and the hem turns)
  const rowT = (j: number) => { const u = j / ny; return 0.35 * u + 0.65 * (1 - Math.pow(1 - u, 1.35)); };
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const k = j * (nx + 1) + i; uv[k * 2] = i / nx; uv[k * 2 + 1] = 1 - rowT(j); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const set = (span: number) => {
    const gath = THREE.MathUtils.clamp(1 - span / w, 0, 1);
    for (let j = 0; j <= ny; j++) {
      const t = rowT(j), y = -H * t, fromHem = H * (1 - t);
      const spanT = span * (1 + flare * gath * Math.pow(t, 1.3)), p = spanT / F;                        // the stack opens out toward the hem
      const room = o.depth * (1 + 0.6 * t * gath), A0 = Math.min(room, Math.sqrt(Math.max(0, L * L - p * p)) / 4);
      const x0 = pin < 0 ? -span / 2 : pin > 0 ? span / 2 - spanT : -spanT / 2;                           // where the leaf's −x edge hangs at this height
      const hold = smooth(t * H, 0.02, 0.5);                                                               // under the heading the runners hold every fold
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i, s = i / nx, f = s * F;
        // (below the heading no two folds take the same width: the fold count is warped a little, and more the lower they hang)
        const ph = Math.PI * 2 * (f + hold * (0.16 + 0.1 * t) * noise2(f * 0.45 + 2, 0.5, seed + 3)) + hold * wander * t * (1.6 * noise2(f * 0.35, t * 1.7, seed) + 0.8 * noise2(f * 0.9 + 4, t * 3.1, seed + 1));
        const A = A0 * (1 + hold * 0.35 * noise2(f * 0.6 + 9, t * 1.3, seed + 2)) * (1 - 0.08 * smooth(t, 0.94, 1)); // the doubled hem is stiffer: its folds a shade flatter
        const edge = smooth(Math.min(s, 1 - s) * F, 0, 0.35);                                              // the leading edge and the return are turned back flat
        const wave = Math.sin(ph), round = 0.45 * p / (Math.PI * 2);                                        // round crests, near-upright walls between them
        const x = x0 + s * spanT - round * Math.sin(2 * ph) * edge + 0.004 * hold * noise2(s * 3.7, t * 2.1, seed + 5);
        const z = A * wave * edge + (room - o.depth) * 0.9 + 0.012 * hold * t * noise2(s * 2.3, t * 1.4, seed + 7);  // a stack leans out into the room toward its hem
        pos[k * 3] = x; pos[k * 3 + 1] = y - 0.006 * wave * smooth(t, 0.9, 1) * (A / Math.max(o.depth, 1e-3)); pos[k * 3 + 2] = z;
        // light: a pocket between two folds sees little of the room (the deeper and narrower, the less), the turn-up of the hem throws
        // a line of shade, the track shades the heading
        const pocket = Math.pow(0.5 - 0.5 * wave * edge, 1.6), occ = 1 - pocket * Math.min(0.32, 0.14 * (A / Math.max(p, 1e-3)));
        const c = occ * (1 - 0.14 * Math.exp(-(((fromHem - 0.09) / 0.006) ** 2))) * (0.8 + 0.2 * smooth(t * H, 0, 0.07));
        col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = c;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
  };
  set(w);
  return { geo: g, set };
}

export interface BandOpts { /** layers of cloth in the fold */ layers?: number; seed?: number; seg?: number; /** how much the edges meander (m) */ wave?: number }
/** A folded throw: a band `width` wide and `thick` deep (all its layers), laid along `path` with `across` as its width's direction.
 *  The path lies on what carries it; the band is built on the side `across × tangent` points to. */
export function band(path: THREE.Vector3[], across: THREE.Vector3, width: number, thick: number, o: BandOpts = {}): THREE.BufferGeometry {
  const layers = o.layers ?? 3, seed = o.seed ?? 1, M = o.seg ?? 48, wave = o.wave ?? 0.012, A = across.clone().normalize();
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal'), each = thick / layers, K = 10, pos: number[] = [], idx: number[] = [];
  for (let l = 0; l < layers; l++) {
    const base = pos.length / 3, shift = (hash(seed * 3.1 + l) - 0.5) * 0.03, wl = width - l * 0.012; // no layer lies square on the one below
    for (let j = 0; j <= M; j++) {
      const s = j / M, P = curve.getPointAt(s), T = curve.getTangentAt(s), N = new THREE.Vector3().crossVectors(A, T).normalize();
      const lo = -wl / 2 + shift + wave * noise2(s * 3.1, l * 3.7, seed), hi = wl / 2 + shift + wave * noise2(s * 3.1 + 8, l * 3.7, seed + 1);
      for (let k = 0; k < K; k++) { // one layer's section: a flat ring with round edges
        const a = (k / K) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), rr = each / 2;
        const ax = c > 0 ? hi - rr + c * rr : lo + rr + c * rr, n = l * each + rr + sn * rr + 0.0015 * noise2(s * 9 + k, l * 2.2, seed + 3);
        pos.push(P.x + A.x * ax + N.x * n, P.y + A.y * ax + N.y * n, P.z + A.z * ax + N.z * n);
      }
    }
    for (let j = 0; j < M; j++) for (let k = 0; k < K; k++) { const a = base + j * K + k, b = base + j * K + ((k + 1) % K), c = a + K, d = b + K; idx.push(a, b, c, b, d, c); }
    for (const end of [0, M]) { const c0 = pos.length / 3; let x = 0, y = 0, z = 0; for (let k = 0; k < K; k++) { const i = (base + end * K + k) * 3; x += pos[i]; y += pos[i + 1]; z += pos[i + 2]; } pos.push(x / K, y / K, z / K);
      for (let k = 0; k < K; k++) { const a = base + end * K + k, b = base + end * K + ((k + 1) % K); if (end) idx.push(a, b, c0); else idx.push(b, a, c0); } }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ materials */
type Patch = (sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => void;
function chain<T extends THREE.Material>(m: T, key: string, fn: Patch, uv = false): T {
  const prev = m.onBeforeCompile, k = m.customProgramCacheKey;
  if (uv) m.defines = { ...(m.defines ?? {}), USE_UV: '' }; // the patch reads the geometry's own uv
  m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); fn(sh, r); };
  m.customProgramCacheKey = () => (k ? k.call(m) : '') + key;
  return m;
}

/** Cloth on a body without seams: colour, relief and sheen are read from three sides by world position (one tile = `metres`)
 *  and blended by the way the surface faces. Apply before the room shading. */
export function triplanar<T extends THREE.MeshStandardMaterial>(m: T, metres: number): T {
  const k = (1 / metres).toFixed(4);
  return chain(m, `-tri${k}`, (sh) => {
    sh.vertexShader = 'varying vec3 vTP;\nvarying vec3 vTN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vTP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vTN = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = 'varying vec3 vTP;\nvarying vec3 vTN;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `vec3 triN = normalize( vTN ), triW = pow( abs( triN ), vec3( 4.0 ) ); triW /= triW.x + triW.y + triW.z;
      vec2 triX = vTP.zy * ${k}, triY = vTP.xz * ${k}, triZ = vTP.xy * ${k};
      #ifdef USE_MAP
        diffuseColor *= texture2D( map, triX ) * triW.x + texture2D( map, triY ) * triW.y + texture2D( map, triZ ) * triW.z;
      #endif`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= texture2D( roughnessMap, triX ).g * triW.x + texture2D( roughnessMap, triY ).g * triW.y + texture2D( roughnessMap, triZ ).g * triW.z;
      #endif`)
      .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP
        { vec3 tx = texture2D( normalMap, triX ).xyz * 2.0 - 1.0, ty = texture2D( normalMap, triY ).xyz * 2.0 - 1.0, tz = texture2D( normalMap, triZ ).xyz * 2.0 - 1.0;
          tx = vec3( tx.xy * normalScale + triN.zy, abs( tx.z ) * triN.x ); ty = vec3( ty.xy * normalScale + triN.xz, abs( ty.z ) * triN.y ); tz = vec3( tz.xy * normalScale + triN.xy, abs( tz.z ) * triN.z );
          normal = normalize( ( viewMatrix * vec4( normalize( tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z ), 0.0 ) ).xyz ); }
      #endif`);
  });
}

/** Voile: the eye crosses more cloth where a fold turns away from it (so the folds draw themselves), the hem and the heading are
 *  doubled, and the low sun comes through from behind. Apply after the room shading (it uses its sun gate). */
export function voile<T extends THREE.MeshStandardMaterial>(m: T, through = 0.5): T {
  return chain(m, '-voile', (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      { vec3 Lv = directionalLights[ 0 ].direction; float back = max( dot( - normal, Lv ), 0.0 ) * roomSun( vRW, roomDirW( Lv ) );
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          back *= getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias - 0.0004, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
        #endif
        reflectedLight.directDiffuse += BRDF_Lambert( diffuseColor.rgb ) * directionalLights[ 0 ].color * back * ROOM_SUN * ${through.toFixed(3)}; }
      #endif`)
      .replace('#include <opaque_fragment>', `{ float across = max( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.3 ), cloth = diffuseColor.a; // (floored: a fold seen edge-on would otherwise be an opaque line, and a row of them a blind)
        #ifdef USE_UV
          cloth = mix( cloth, min( 1.0, cloth * 2.0 ), max( 1.0 - smoothstep( 0.03, 0.036, vUv.y ), smoothstep( 0.972, 0.978, vUv.y ) ) );
        #endif
        diffuseColor.a = 1.0 - pow( 1.0 - cloth, 1.0 / across ); }
      #include <opaque_fragment>`);
  }, true);
}

/** A lamp shade with its lamp on: brightest in front of the lamp and where the cloth faces the eye, falling off to the rims (a
 *  shade that glows evenly is a white blob). The material's emissive is the light at the hot spot. */
export function lampShade<T extends THREE.MeshStandardMaterial>(m: T, hot = 0.42): T {
  return chain(m, `-shade${hot}`, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float up = vUv.y, body = smoothstep( -0.25, ${hot.toFixed(3)}, up ) * ( 1.0 - 0.72 * smoothstep( ${hot.toFixed(3)}, 1.05, up ) );
        float facing = abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
        totalEmissiveRadiance *= body * mix( 0.5, 1.0, facing * facing ) * mix( 0.78, 1.0, smoothstep( 0.0, 0.03, min( up, 1.0 - up ) ) ); }`);
  }, true);
}

/** Window glass that does not answer the room's lamps with a glint (a point light has no size: its mirror image in a pane is a
 *  white dot with a halo). What the glass reflects of the room comes from the room's map. */
export function noGlint<T extends THREE.MeshStandardMaterial>(m: T): T {
  return chain(m, '-noglint', (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular = vec3( 0.0 );\n  #ifdef USE_CLEARCOAT\n  clearcoatSpecularDirect = vec3( 0.0 );\n  #endif'); });
}
