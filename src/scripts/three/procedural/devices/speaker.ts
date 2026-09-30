/**
 * The in-ceiling speaker, modelled after the catalogue unit (p. 8, the SP-BT52 / BT54 pair) and its maker's sheets: a round
 * ABS bezel with a softly rolled edge, a magnetic grille of perforated aluminium, white, very slightly domed, a small black
 * badge in its centre. Dimensioned in millimetres for the villa's 240 mm unit and scaled once (`r` units = the bezel radius).
 *
 *   ceiling │ baffle + driver (dark, faintly there) │ grille (perforated, 34 % open) │ bezel ring
 *
 * What makes it read as the product and not as a white disc with dots:
 *   – the perforation is real: an alpha lattice over the dark baffle and the driver 1–3 mm behind it, so the holes show depth and
 *     parallax, and the mesh greys a little against the solid bezel, as the photographs do;
 *   – a hexagonal lattice of ~2.8 mm pitch in a mip-mapped, anisotropic tile: 76 holes across that hold at half a metre and
 *     average to an even grey further off, never beating into moiré as the lens moves;
 *   – a hairline shadow gap between the grille's rolled flange and the bezel's inner wall;
 *   – the driver's surround and dust cap faintly perceptible through the holes when the light rakes them.
 */
import * as THREE from 'three';
import { num, off, canvasTex, microNormal, roughVar, mesh, rbox, type Ctx } from '../kit';

const D = 240, RB = D / 2;           // bezel Ø
const RI = 106.4;                    // the bezel's inner wall: a 13.6 mm ring, like the catalogue unit's
const RG = 105.6, RP = 102.4;        // the grille's flange edge (0.8 mm shy of the bezel: the shadow gap) and its perforated field
const PITCH = 2.8, HOLE = 0.86;      // hole pitch and radius
const Z_BEZEL = 4.2, Z_FIELD = 2.9, DOME = 1.5, Z_BAFFLE = 0.45;

/** a lathe profile [r, z] (mm) turned about the unit's axis (+Z faces the room); faces lie to the right of the profile's travel */
const lathe = (pts: [number, number][], seg = 160) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
const arc = (cr: number, cz: number, rad: number, a0: number, a1: number, n = 8): [number, number][] => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cr + Math.cos(a) * rad, cz + Math.sin(a) * rad] as [number, number]; });

/* ---------- the perforation: one tile of a hexagonal lattice, as opacity and as the punched rims' relief ---------- */
const COLS = 8, ROWS = 10, TN = 512; // 8 × 10 holes per tile (an even row count: the half-pitch offset repeats)
let _perf: { alpha: THREE.DataTexture; normal: THREE.DataTexture; w: number; h: number } | null = null;
/**
 * The tile is stored square and stretched back by the UVs (its world size is 8 a × 10 · a√3/2), so the holes are drawn as the
 * matching ellipses and come out round. Analytic coverage (no canvas anti-aliasing to guess at), mip-mapped on the GPU.
 */
function perforation() {
  if (_perf) return _perf;
  const a = PITCH, rs = a * Math.sqrt(3) / 2, w = COLS * a, h = ROWS * rs, px = w / TN, rim = a * 0.16;
  const al = new Uint8Array(TN * TN * 4), nm = new Uint8Array(TN * TN * 4);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const x = (i + 0.5) / TN * w, y = (j + 0.5) / TN * h; // DataTexture rows run up the v axis: y is up
    let best = 1e9, bx = 0, by = 0;
    for (let row = Math.floor(y / rs) - 1; row <= Math.floor(y / rs) + 1; row++) {
      const o = (((row % 2) + 2) % 2) * a / 2, cy = (row + 0.5) * rs, c0 = Math.round((x - o - a / 2) / a);
      for (let c = c0 - 1; c <= c0 + 1; c++) { const cx = c * a + o + a / 2, dd = Math.hypot(x - cx, y - cy); if (dd < best) { best = dd; bx = x - cx; by = y - cy; } }
    }
    const d = best - HOLE, k = (j * TN + i) * 4;                                   // d > 0 on the metal
    const cov = Math.min(1, Math.max(0, d / (px * 1.2) + 0.5)); al[k] = al[k + 1] = al[k + 2] = Math.round(cov * 255); al[k + 3] = 255;
    const t = Math.min(1, Math.max(0, d / rim)), slope = d > 0 && d < rim ? 6 * t * (1 - t) / rim * 0.09 : 0; // the punch rounds each rim: a smoothstep of 0.09 mm
    const ux = best > 1e-6 ? bx / best : 0, uy = best > 1e-6 ? by / best : 0, nx = -slope * ux, ny = -slope * uy, l = Math.hypot(nx, ny, 1);
    nm[k] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); nm[k + 3] = 255;
  }
  const tex = (data: Uint8Array) => { const t = new THREE.DataTexture(data, TN, TN); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 16; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; };
  _perf = { alpha: tex(al), normal: tex(nm), w, h };
  return _perf;
}
const tiled = (t: THREE.Texture, rx: number, ry: number) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };

/** the badge: a black epoxy plate with a thin bright border and the logotype, as on the catalogue unit */
function badgeTex() {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#0c0d0f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,203,208,0.55)'; g.lineWidth = 3; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#c9ccd1'; g.font = `500 ${Math.round(h * 0.38)}px "Jost", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '10px'; g.fillText('AL RAWI', w / 2 + 5, h / 2 + 2);
  });
}

/** The in-ceiling speaker. Returns null for parameter sets it does not cover (no other product is a disc today). */
export function ceilingSpeaker({ p }: Ctx): THREE.Group | null {
  if (typeof p.r === 'number' && (p.r as number) <= 0) return null;
  const r = num(p, 'r', 0.75), g = new THREE.Group(), mm = new THREE.Group(); mm.scale.setScalar((2 * r) / D); g.add(mm);

  // materials: moulded ABS for the bezel, powder-coated aluminium for the grille (a touch flatter), dark parts behind it
  const abs = new THREE.MeshPhysicalMaterial({ color: '#f3f2ee', roughness: 0.46, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 1, normalMap: microNormal(), normalScale: new THREE.Vector2(0.03, 0.03), roughnessMap: roughVar() });
  const perf = perforation(), rx = (2 * RP) / perf.w, ry = (2 * RP) / perf.h;
  const paint = { color: '#eeeeea', roughness: 0.58, metalness: 0, envMapIntensity: 0.95 };
  const grilleMat = new THREE.MeshStandardMaterial({ ...paint, alphaMap: tiled(perf.alpha, rx, ry), transparent: true, normalMap: tiled(perf.normal, rx, ry), normalScale: new THREE.Vector2(1, 1) });
  const flangeMat = new THREE.MeshStandardMaterial({ ...paint });
  const matte = (c: string, ro: number) => new THREE.MeshStandardMaterial({ color: c, roughness: ro, metalness: 0, envMapIntensity: 0.6 });

  // the bezel: flat face 4.2 mm proud of the ceiling, a 3.2 mm roll at the outer edge, a crisp inner wall down to the baffle
  mm.add(mesh(lathe([[RB - 0.3, 0], [RB, 0.5], ...arc(RB - 3.2, 1.0, 3.2, 0, Math.PI / 2), [RI + 0.6, Z_BEZEL], ...arc(RI + 0.6, Z_BEZEL - 0.6, 0.6, Math.PI / 2, Math.PI, 4), [RI, Z_BAFFLE + 0.1], [RI + 1, 0], [RB - 0.3, 0]]), abs));

  // behind the grille (outside in, so the faces look at the room): the baffle, the driver's rubber surround, its cone and dust cap
  mm.add(mesh(lathe([[RI + 0.2, Z_BAFFLE], [84, Z_BAFFLE]]), matte('#121212', 0.85)));
  mm.add(mesh(lathe(arc(77, Z_BAFFLE, 7, 0, Math.PI, 12).map(([x, z]) => [x, Z_BAFFLE + (z - Z_BAFFLE) * 0.23] as [number, number])), matte('#0a0a0a', 0.5)));
  mm.add(mesh(lathe([[70, Z_BAFFLE + 0.45], [47, Z_BAFFLE + 0.2], [24, Z_BAFFLE]]), matte('#2a2a29', 0.82)));
  mm.add(mesh(lathe(Array.from({ length: 11 }, (_, i) => { const q = 24 * (1 - i / 10); return [q, Z_BAFFLE + 1.5 * (1 - (q / 24) ** 2)] as [number, number]; })), matte('#202020', 0.38))); // a shallow dust cap

  // the grille: a rolled flange (solid) round a gently domed perforated field
  mm.add(mesh(lathe([[RG, 1.0], ...arc(RG - 1.7, 1.0, 1.7, 0, Math.PI / 2, 6), [RP, Z_FIELD]]), flangeMat));
  const field = new THREE.RingGeometry(0, RP, 180, 28); // planar UVs across the disc: the tile's repeat is set in world millimetres
  { const pos = field.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) { const q = (pos.getX(i) ** 2 + pos.getY(i) ** 2) / (RP * RP); pos.setZ(i, Z_FIELD + DOME * (1 - q)); } field.computeVertexNormals(); }
  const grille = mesh(field, grilleMat); grille.name = 'grille'; grille.renderOrder = 0; mm.add(grille); // `grille`: the landing's sound rings are pinned on its square

  // the badge, sitting on the crown. Satin, no coat, a low reflection weight: looking up at it, a glossy black mirrors the lit
  // room below and rendered slate blue (sRGB 64, 70, 84 at stop 4); the catalogue's badge reads black
  const top = Z_FIELD + DOME;
  mm.add(mesh(rbox(29, 7.4, 1.0, 0.5, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', map: badgeTex(), roughness: 0.55, metalness: 0, envMapIntensity: 0.25 }), 0, 0, top + 0.45));

  // status: a pinhole lens at six o'clock on the bezel, a faint cool standby glow
  const lens = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.15, metalness: 0, emissive: '#cfe6ff', emissiveIntensity: 0.35 }), 0, -(RI + 4.2), Z_BEZEL + 0.1);
  lens.name = 'led_0'; mm.add(lens);

  if (!off(p, 'can')) { // behind the ceiling (product viewer only; mounted flush in the walkthrough): the back can, its spring clamps, the terminals
    const can = new THREE.MeshStandardMaterial({ color: '#e7e7e3', roughness: 0.6, metalness: 0, envMapIntensity: 0.9 }), zinc = new THREE.MeshStandardMaterial({ color: '#b8bbbf', roughness: 0.35, metalness: 0.9 });
    mm.add(mesh(lathe([[97, 0], [97, -60], ...arc(85, -60, 12, 0, -Math.PI / 2, 6), [0, -72]].reverse() as [number, number][]), can));
    for (const s of [-1, 1]) { const clamp = mesh(rbox(10, 34, 40, 1.2, 2), zinc, s * 101, 0, -24); mm.add(clamp); mm.add(mesh(new THREE.TorusGeometry(5, 1.3, 8, 24).rotateY(Math.PI / 2), zinc, s * 104, 0, -14)); }
    mm.add(mesh(rbox(22, 12, 10, 1, 2), matte('#2f8f4e', 0.5), 0, 60, -74));
  }

  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, 0, top + 1); mm.add(hs);
  return g;
}
