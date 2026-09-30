/**
 * The smoke detector, modelled after the catalogue unit (p. 11, the Zemismart Zigbee photoelectric alarm; p. 12 is its gas-sensor
 * sibling in the same housing): an 86 mm disc about 32 mm deep in two mouldings.
 *
 *   ceiling │ back body (Ø82, tall vent slots round its side, the dark labyrinth behind) │ hairline seam │
 *   front cover (Ø86): a straight wall, a soft roll up to a thin raised lip, the softly domed face inside it │
 *   the sounder's sunburst of holes round a plain centre │ the vertical pill of the test button below it, a printed mark either side
 *
 * What makes it read as the product: the openings are real (the face holes are cut through over a dark chamber, with the faint shade
 * a moulded hole leaves round its lip; the vent slots are gaps between moulded louvres with the labyrinth a few millimetres behind),
 * the sunburst is laid out as on the moulding (radial rows, alternate rows set out further, each hole a touch larger mid-row), the
 * two mouldings meet at a visible seam with the back body a shade smaller, and the plastic is a matt satin, never glossy.
 * Dimensioned in millimetres and scaled once (`r` units = its radius).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { num, bool, off, canvasTex, roundRect, microNormal, roughVar, mesh, rbox, type Ctx } from '../kit';

const D = 86, R = D / 2;                  // the front cover
const RK = 41;                            // the back body, a shade smaller
const Z_SEAM = 15.2;                      // back body 0 … 15.2, the seam, the front cover from 15.8
const Z_LIP = 29.2, RL = 40.2, LIPW = 1.1; // the thin raised lip round the face: its top, its outer radius, its width
const RF = RL - LIPW - 0.25;              // the face inside the lip (38.85)
const Z_FACE = Z_LIP - 0.45, DOME = 2.6;  // the face starts a hair under the lip and domes 2.6 mm to its centre (31.85)
const N_SLOTS = 40;
const BTN_Y = -27.5, BTN_W = 3.3, BTN_H = 8.6; // the test button: a vertical pill low on the face (catalogue: 0.64 of the radius)

const lathe = (pts: [number, number][], seg = 144) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
const arc = (cr: number, cz: number, rad: number, a0: number, a1: number, n = 8): [number, number][] => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cr + Math.cos(a) * rad, cz + Math.sin(a) * rad] as [number, number]; });
const faceZ = (x: number, y: number) => Z_FACE + DOME * (1 - Math.min(1, (x * x + y * y) / (RF * RF)));

/**
 * The sounder's holes, a sunburst as moulded: 32 radial rows of five round a plain centre (Ø ≈ 0.19 of the face), alternate rows set
 * out by half a pitch, so the field's outline is a soft star; along each row the holes swell from 0.9 to 1.3 mm across and shrink
 * again toward its end (the catalogue unit's field reads densest in its middle band). 160 holes, cut by one alpha map.
 */
const HOLES: [number, number, number][] = [];
{ const RAYS = 32, PITCH = 2.3;
  for (let i = 0; i < RAYS; i++) {
    const odd = i % 2, a = (i / RAYS) * Math.PI * 2 + Math.PI / 2, n = 5, r0 = 8.2 + odd * PITCH * 0.5;
    for (let k = 0; k < n; k++) { const t = k / (n - 1), rr = r0 + k * PITCH, hr = 0.44 + 0.2 * Math.sin(Math.PI * (0.2 + t * 0.7)); HOLES.push([Math.cos(a) * rr, Math.sin(a) * rr, hr]); }
  }
}
/** face maps over the face's disc (1024 px across 2·RF): `cut` = the openings (alpha), `paint` = the plastic with the lips' faint shade and the printed marks */
function faceTex(kind: 'cut' | 'paint') {
  return canvasTex(1024, 1024, (g, w) => {
    const s = w / (2 * RF), X = (x: number) => w / 2 + x * s, Y = (y: number) => w / 2 - y * s;
    g.fillStyle = kind === 'cut' ? '#fff' : '#f5f5f2'; g.fillRect(0, 0, w, w);
    for (const [x, y, hr] of HOLES) {
      if (kind === 'cut') { g.fillStyle = '#000'; g.beginPath(); g.arc(X(x), Y(y), hr * s, 0, Math.PI * 2); g.fill(); continue; }
      const grd = g.createRadialGradient(X(x), Y(y), hr * s, X(x), Y(y), hr * s * 2.1); grd.addColorStop(0, 'rgba(58,56,52,0.34)'); grd.addColorStop(1, 'rgba(58,56,52,0)'); // the lip's shade
      g.fillStyle = grd; g.beginPath(); g.arc(X(x), Y(y), hr * s * 2.1, 0, Math.PI * 2); g.fill();
    }
    // the button's opening: a 0.3 mm gap round the pill
    if (kind === 'cut') { g.fillStyle = '#000'; roundRect(g, X(-(BTN_W / 2 + 0.3)), Y(BTN_Y + BTN_H / 2 + 0.3), (BTN_W + 0.6) * s, (BTN_H + 0.6) * s, (BTN_W / 2 + 0.3) * s); g.fill(); }
    if (kind === 'paint') {
      // the gap's shade on the face round the button
      g.strokeStyle = 'rgba(70,70,68,0.28)'; g.lineWidth = 0.5 * s; roundRect(g, X(-(BTN_W / 2 + 0.45)), Y(BTN_Y + BTN_H / 2 + 0.45), (BTN_W + 0.9) * s, (BTN_H + 0.9) * s, (BTN_W / 2 + 0.45) * s); g.stroke();
      // the two printed marks beside the button (the catalogue unit prints its two functions there): mute on the left, test on the right,
      // pad-printed in a warm grey, 2.4 mm tall
      g.save(); g.strokeStyle = g.fillStyle = 'rgba(112,112,110,0.9)'; g.lineWidth = 0.28 * s; g.lineCap = g.lineJoin = 'round';
      { const cx = X(-5.3), cy = Y(BTN_Y), u = s * 0.55; // a speaker with a cross
        g.beginPath(); g.moveTo(cx - 1.9 * u, cy - 0.7 * u); g.lineTo(cx - 1.1 * u, cy - 0.7 * u); g.lineTo(cx - 0.1 * u, cy - 1.7 * u); g.lineTo(cx - 0.1 * u, cy + 1.7 * u); g.lineTo(cx - 1.1 * u, cy + 0.7 * u); g.lineTo(cx - 1.9 * u, cy + 0.7 * u); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(cx + 0.6 * u, cy - 0.8 * u); g.lineTo(cx + 2.1 * u, cy + 0.8 * u); g.moveTo(cx + 2.1 * u, cy - 0.8 * u); g.lineTo(cx + 0.6 * u, cy + 0.8 * u); g.stroke(); }
      { const cx = X(5.3), cy = Y(BTN_Y), u = s * 0.55; // a ring with a tick: self-test
        g.beginPath(); g.arc(cx, cy, 1.7 * u, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx - 0.8 * u, cy + 0.05 * u); g.lineTo(cx - 0.2 * u, cy + 0.7 * u); g.lineTo(cx + 0.9 * u, cy - 0.7 * u); g.stroke(); }
      g.restore();
      // a whisper of shade at the face's rim where it tucks under the lip
      const grd = g.createRadialGradient(w / 2, w / 2, (RF - 1.6) * s, w / 2, w / 2, RF * s); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(40,38,34,0.10)');
      g.fillStyle = grd; g.fillRect(0, 0, w, w);
    }
  }, kind === 'paint');
}

/** The smoke detector. Returns null for parameter sets it does not cover (the gas sensor, siren, climate, presence and IR pucks). */
export function smokeDetector({ p }: Ctx): THREE.Group | null {
  const r = num(p, 'r', 0.5), h = num(p, 'h', 0.22);
  if (!bool(p, 'vents') || bool(p, 'ring') || bool(p, 'display') || bool(p, 'recessed') || bool(p, 'glossy') || Math.abs(r - 0.55) > 0.02 || Math.abs(h - 0.22) > 0.02) return null;
  const g = new THREE.Group(), mm = new THREE.Group(); mm.scale.setScalar((2 * r) / D); g.add(mm);

  // matt-satin ABS: the moulding's fine orange-peel, a faintly uneven gloss, no clearcoat shine
  const abs = (c = '#f3f3f0', ro = 0.46) => new THREE.MeshPhysicalMaterial({ color: c, roughness: ro, metalness: 0, specularIntensity: 0.7, sheen: 0.12, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 0.95, normalMap: microNormal(), normalScale: new THREE.Vector2(0.03, 0.03), roughnessMap: roughVar() });
  const shell = abs(), back = abs('#ecebe7', 0.52);
  const dark = new THREE.MeshStandardMaterial({ color: '#171819', roughness: 0.92, metalness: 0, envMapIntensity: 0.25 });
  const seam = new THREE.MeshStandardMaterial({ color: '#5d5e5b', roughness: 0.85, metalness: 0, envMapIntensity: 0.4 });

  // the back body: a soft chamfer onto the ceiling, a plain band, the slotted band, a plain band up to the seam
  const S0 = 3.2, S1 = 13.0;                         // the slots run 3.2 … 13 mm (tall: along the depth)
  mm.add(mesh(lathe([[RK - 2.2, 0], [RK - 0.9, 0.25], ...arc(RK - 0.9, 1.15, 0.9, -Math.PI / 2, 0, 4), [RK, S0], [RK - 1.6, S0]]), back));
  mm.add(mesh(lathe([[RK - 1.6, S1], [RK, S1], [RK, Z_SEAM - 0.25], [RK - 0.25, Z_SEAM]]), back));
  mm.add(mesh(new THREE.CylinderGeometry(RK - 3.4, RK - 3.4, S1 - S0 + 0.4, 96, 1, true).rotateX(Math.PI / 2), dark, 0, 0, (S0 + S1) / 2)); // the labyrinth
  { const parts: THREE.BufferGeometry[] = []; const pitch = (2 * Math.PI) / N_SLOTS, rc = RK - 0.8, slot = 1.9, wide = rc * pitch - slot; // 1.9 mm slots between 40 louvres
    for (let i = 0; i < N_SLOTS; i++) { const a = (i + 0.5) * pitch, b = rbox(wide, 1.6, S1 - S0 + 0.2, 0.45, 2); b.rotateZ(a - Math.PI / 2); b.translate(Math.cos(a) * rc, Math.sin(a) * rc, (S0 + S1) / 2); parts.push(b); }
    mm.add(mesh(mergeGeometries(parts)!, back)); }
  // the seam: the back body steps in under the front cover, a hairline of shadow between them
  mm.add(mesh(lathe([[RK - 0.25, Z_SEAM], [RK - 0.9, Z_SEAM + 0.05], [RK - 0.9, Z_SEAM + 0.55], [R - 0.9, Z_SEAM + 0.6]]), seam));
  // the front cover: a straight wall, a soft roll, the thin raised lip (flat top, a crisp inner edge), a small step down to the face
  const Z_ROLL = 21.6; // the wall runs straight to here, then an elliptic roll (2.8 mm in, 7.6 mm up) arrives flat on the lip
  const roll: [number, number][] = Array.from({ length: 15 }, (_, i) => { const t = ((i + 1) / 15) * (Math.PI / 2); return [RL + (R - RL) * Math.cos(t), Z_ROLL + (Z_LIP - Z_ROLL) * Math.sin(t)] as [number, number]; });
  mm.add(mesh(lathe([[R - 0.9, Z_SEAM + 0.6], [R - 0.25, Z_SEAM + 0.72], [R, Z_SEAM + 1.1], [R, Z_ROLL], ...roll,
    [RL - LIPW + 0.18, Z_LIP], ...arc(RL - LIPW + 0.18, Z_LIP - 0.18, 0.18, Math.PI / 2, Math.PI, 3), [RL - LIPW, Z_FACE - 0.3], [RF + 0.05, Z_FACE - 0.3], [RF - 0.3, Z_FACE - 0.05]]), shell));
  // the face: a soft dome cut through for the sounder and the button
  const field = new THREE.RingGeometry(0, RF, 180, 30);
  { const pos = field.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) pos.setZ(i, faceZ(pos.getX(i), pos.getY(i))); field.computeVertexNormals(); }
  const faceMat = abs(); faceMat.color.set('#ffffff'); faceMat.map = faceTex('paint'); faceMat.alphaMap = faceTex('cut'); faceMat.alphaTest = 0.5; faceMat.alphaToCoverage = true; // MSAA feathers the holes' edges
  mm.add(mesh(field, faceMat));
  // the sounder's dark chamber under the holes
  mm.add(mesh(new THREE.CircleGeometry(RF - 0.4, 120), dark, 0, 0, Z_FACE - 1.0)); // under the whole face: no line of sight through a hole reaches past it

  // the test button: a flat pill standing 0.5 mm proud in its gap, its top softly crowned, a shade greyer than the face; the status
  // LED glows through its upper end (`led_0`), the live layer's test pulse lands on its centre (`btn_test`)
  const bz = faceZ(0, BTN_Y);
  mm.add(mesh(rbox(BTN_W + 1.2, BTN_H + 1.2, 0.6, 0.25, 2), dark, 0, BTN_Y, bz - 1.4)); // the gap's floor
  const btn = mesh(new THREE.CapsuleGeometry(BTN_W / 2, BTN_H - BTN_W, 8, 32).scale(1, 1, 0.3), abs('#e4e4e1', 0.38), 0, BTN_Y, bz - 0.05); btn.name = 'btn_test'; mm.add(btn);
  const glow = mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshStandardMaterial({ color: '#dfe6e1', roughness: 0.5, emissive: '#56f08e', emissiveIntensity: 0.16, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, BTN_Y + BTN_H / 2 - 1.9, bz + 0.46);
  glow.castShadow = false; mm.add(glow);
  const led = new THREE.Object3D(); led.name = 'led_0'; led.position.copy(glow.position); mm.add(led);

  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, 0, faceZ(0, 0)); mm.add(hs);
  // product viewer: tilted so the face reads (the generic puck's 0.35 rad); mounted (tilt:false) the face looks at the room, +Z
  g.rotation.x = off(p, 'tilt') ? 0 : -(Math.PI / 2 - 0.35);
  return g;
}
