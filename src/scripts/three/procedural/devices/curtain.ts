/**
 * The curtain motor and its track, modelled after the catalogue unit (p. 25, the Zigbee square-section motor) and the track
 * system it drives: an extruded aluminium C-profile, white powder coat, on wall brackets, a toothed belt running inside the
 * slot, runners with rings stacked where the drapes gather, moulded end housings, and the motor hanging below the drive end
 * the way it is installed: a rounded square body in satin white, a light grey end cap, the setting button, a status lens, a
 * blank label, the power lead running from its foot to an outlet on the wall.
 * Dimensioned in millimetres for the villa's 3.2 m track and scaled once (`length` units = the track).
 *
 * Frame: X along the track (the motor at −X), Y up, Z out of the wall (the mounting face is z = 0). The track's axis is the
 * recipe's `origin`: the walkthrough puts that, not the box's centre (the motor hangs below it), at the authored point.
 * `userData.setOpen(t)` moves the runners with the drapes (1 = gathered at the ends, 0 = drawn); the walkthrough calls it with
 * the drapes' own t (walkthrough.ts), and it follows interior.ts' law for the west window (which spans the track): each drape is
 * half the window + 6 cm wide, hangs from 5 cm past the window's edge and is gathered to 0.26 + 0.74 (1 − t) of its width.
 * If that law changes, change `setOpen` with it.
 */
import * as THREE from 'three';
import { num, off, canvasTex, brushed, metal, mesh, rbox, type Ctx } from '../kit';

const LEN = 3200;                    // the villa's track (the product viewer shows a 1.4 m section, so the motor reads)
const ZC = 131;                      // the track's axis off the wall: the drapes hang in its plane
const W = 26, H = 30;                // the profile's depth and height
const SLOT = 8;                      // the runners' slot in its floor
const HOUSE_M = 62, HOUSE_F = 22;    // the drive housing (motor end) and the idler cap (far end)
const MS = 55, MR = 9, ML = 232, MC = 34; // motor section, its corner radius, body and end cap length
const RUNNERS = 12;                  // per side
const HOOK = 70;                     // the drapes' heading hangs this far below the track's axis (interior.ts: 2.83 m under a 2.9 m track)

/* ---------- a profile in the (z, y) plane swept along X, with analytic normals ---------- */
type PP = { z: number; y: number; nz: number; ny: number };
const flat = (z0: number, y0: number, z1: number, y1: number, n = 1): PP[] => { const dz = z1 - z0, dy = y1 - y0, l = Math.hypot(dz, dy); return Array.from({ length: n + 1 }, (_, i) => ({ z: z0 + dz * i / n, y: y0 + dy * i / n, nz: dy / l, ny: -dz / l })); }; // counter-clockwise travel: the outside is on the right
const bend = (cz: number, cy: number, r: number, a0: number, a1: number, n = 6): PP[] => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return { z: cz + Math.cos(a) * r, y: cy + Math.sin(a) * r, nz: Math.cos(a), ny: Math.sin(a) }; });
const run = (...parts: PP[][]) => parts.flat().filter((q, i, a) => i === 0 || Math.hypot(q.z - a[i - 1].z, q.y - a[i - 1].y) > 1e-6);
/** a rounded rectangle, counter-clockwise from its bottom edge's centre */
const roundRectRun = (w: number, h: number, r: number, n = 6) => run(flat(0, -h / 2, w / 2 - r, -h / 2), bend(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, n), flat(w / 2, -h / 2 + r, w / 2, h / 2 - r), bend(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, n), flat(w / 2 - r, h / 2, -w / 2 + r, h / 2), bend(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, n), flat(-w / 2, h / 2 - r, -w / 2, -h / 2 + r), bend(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, n), flat(-w / 2 + r, -h / 2, 0, -h / 2));
/**
 * Sweep `runs` through `stations` (x, and an inset that shrinks the profile along its normals: a chamfer where it changes).
 * Every band has its own vertices, so a chamfer stays a crisp facet; `caps` closes the two ends (the first run only).
 */
function prism(runs: PP[][], stations: { x: number; inset: number }[], caps = false) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v); return pos.length / 3 - 1; };
  const tri = (a: number, b: number, c: number) => { // wound so the face agrees with its normals
    const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), n = new THREE.Vector3().subVectors(P(b), P(a)).cross(new THREE.Vector3().subVectors(P(c), P(a)));
    if (n.dot(new THREE.Vector3(nor[a * 3] + nor[b * 3] + nor[c * 3], nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1], nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2])) >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  for (const pr of runs) {
    const s: number[] = [0]; for (let i = 1; i < pr.length; i++) s.push(s[i - 1] + Math.hypot(pr[i].z - pr[i - 1].z, pr[i].y - pr[i - 1].y));
    for (let k = 0; k < stations.length - 1; k++) {
      const A = stations[k], B = stations[k + 1], dx = B.x - A.x, di = B.inset - A.inset;
      const base = pos.length / 3;
      for (const st of [A, B]) for (let i = 0; i < pr.length; i++) { const q = pr[i], l = Math.hypot(dx, di), rad = dx / l, ax = di / l; vert(st.x, q.y - q.ny * st.inset, q.z - q.nz * st.inset, ax, q.ny * rad, q.nz * rad, st.x / 100, s[i] / 100); }
      const n = pr.length; for (let i = 0; i < n - 1; i++) { tri(base + i, base + n + i, base + i + 1); tri(base + n + i, base + n + i + 1, base + i + 1); }
    }
  }
  if (caps) for (const [st, sx] of [[stations[0], -1], [stations[stations.length - 1], 1]] as const) {
    const pr = runs[0], c = vert(st.x, 0, 0, sx, 0, 0, 0, 0), first = pos.length / 3;
    for (const q of pr) vert(st.x, q.y - q.ny * st.inset, q.z - q.nz * st.inset, sx, 0, 0, q.z / 100, q.y / 100);
    for (let i = 0; i < pr.length - 1; i++) tri(c, first + i, first + i + 1);
  }
  const g = new THREE.BufferGeometry(); g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** a box with a rounded-rectangle section (w along Z, h along Y), length along X, a small chamfer round both ends */
const housing = (x0: number, x1: number, w: number, h: number, r: number, ch = 1.2) => prism([roundRectRun(w, h, r)], [{ x: x0, inset: ch }, { x: x0 + ch, inset: 0 }, { x: x1 - ch, inset: 0 }, { x: x1, inset: ch }], true);

/* ---------- the track's C-profile: the outer skin and the slot's lips (the cavity is dark, only seen through the slot) ---------- */
function trackSection(): PP[][] {
  const hz = W / 2, hy = H / 2, s = SLOT / 2, lip = 2;
  return [
    flat(s, -hy + lip, s, -hy),                                                           // the front lip's inner face
    run(flat(s, -hy, hz - 3, -hy, 2), bend(hz - 3, -hy + 3, 3, -Math.PI / 2, 0), flat(hz, -hy + 3, hz, hy - 4, 4), bend(hz - 4, hy - 4, 4, 0, Math.PI / 2, 8), flat(hz - 4, hy, -hz + 1.5, hy, 4), bend(-hz + 1.5, hy - 1.5, 1.5, Math.PI / 2, Math.PI, 3), flat(-hz, hy - 1.5, -hz, -hy + 1.5, 4), bend(-hz + 1.5, -hy + 1.5, 1.5, Math.PI, Math.PI * 1.5, 3), flat(-hz + 1.5, -hy, -s, -hy, 2)),
    flat(-s, -hy, -s, -hy + lip),                                                         // the back lip's inner face
  ];
}

/** a blank product label: fine grey rules where the print would be, nothing legible (brand-neutral) */
function labelTex() {
  return canvasTex(128, 384, (g, w, h) => {
    g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(120,122,126,0.55)';
    g.fillRect(14, 22, w * 0.55, 10); for (let i = 0; i < 9; i++) g.fillRect(14, 58 + i * 16, w * (0.42 + ((i * 37) % 30) / 100), 4);
    g.strokeStyle = 'rgba(120,122,126,0.5)'; g.lineWidth = 3; g.strokeRect(14, h - 86, 60, 60); g.fillRect(24, h - 76, 16, 16); g.fillRect(48, h - 52, 16, 16); // a code square
  });
}

/** The curtain track with its motor. Returns null for parameter sets it does not cover (no other product is a rail today). */
export function curtainTrack({ p, accent }: Ctx): THREE.Group | null {
  const L = num(p, 'length', 2.4); if (L <= 0) return null;
  const viewer = !off(p, 'cloth'), len = viewer ? 1400 : LEN, HALF = len / 2, MX = -HALF + 29; // the motor's axis, under the drive housing, as near the end as its body allows
  const g = new THREE.Group(), mm = new THREE.Group(); mm.scale.setScalar(L / len); g.add(mm);

  // finishes: powder-coated aluminium with a slight gloss; moulded end parts; the motor's satin shell; the dark insides
  const coat = new THREE.MeshPhysicalMaterial({ color: '#f1f0ec', roughness: 0.34, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.28, envMapIntensity: 1 });
  const moulded = new THREE.MeshPhysicalMaterial({ color: '#ecece8', roughness: 0.46, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 1 });
  const shell = new THREE.MeshPhysicalMaterial({ color: '#f5f5f2', roughness: 0.26, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 1.05 });
  const capGrey = new THREE.MeshPhysicalMaterial({ color: '#d9dad8', roughness: 0.42, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.85, metalness: 0, envMapIntensity: 0.3 });
  const belt = new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.62, metalness: 0, envMapIntensity: 0.4 });
  const screw = metal('#c3c6ca', 0.3);

  // the track: the profile between the housings, the channel and the belt seen through its slot
  const track = mesh(prism(trackSection(), [{ x: -HALF + 4, inset: 0 }, { x: HALF - 4, inset: 0 }]), coat, 0, 0, ZC); mm.add(track);
  mm.add(mesh(new THREE.PlaneGeometry(len - 8, SLOT + 2).rotateX(Math.PI / 2), dark, 0, -H / 2 + 2.6, ZC));   // the channel's roof
  mm.add(mesh(new THREE.PlaneGeometry(len - HOUSE_M - HOUSE_F, 6).rotateX(Math.PI / 2), belt, (HOUSE_M - HOUSE_F) / 2, -H / 2 + 2.1, ZC)); // the lower run of the belt
  // the drive housing over the motor end, the idler cap at the far end (a touch larger than the profile), the idler's axle
  mm.add(mesh(housing(-HALF, -HALF + HOUSE_M, W + 4, H + 4, 4), moulded, 0, 0, ZC));
  mm.add(mesh(housing(HALF - HOUSE_F, HALF, W + 4, H + 4, 4), moulded, 0, 0, ZC));
  mm.add(mesh(new THREE.CylinderGeometry(3, 3, 0.8, 20).rotateZ(Math.PI / 2), screw, HALF - 0.2, 0, ZC));

  // wall brackets: a plate on the wall (two screws), an arm over the track's top, a clip over its front edge, a rib beneath
  const nb = Math.max(2, Math.round((len - 600) / 650) + 1);
  for (const bx of Array.from({ length: nb }, (_, i) => -HALF + 300 + (len - 600) * i / (nb - 1))) {
    mm.add(mesh(rbox(36, 56, 3, 1.2, 2), coat, bx, 4, 1.5));
    mm.add(mesh(rbox(30, 5, ZC + W / 2 - 1, 1.2, 2), coat, bx, H / 2 + 2.5, (ZC + W / 2 - 1) / 2 + 1));
    mm.add(mesh(rbox(30, 7, 3, 1, 2), coat, bx, H / 2 - 1.5, ZC + W / 2 + 0.6));
    { const rib = new THREE.Shape([new THREE.Vector2(3, 15), new THREE.Vector2(60, 15), new THREE.Vector2(3, -18)]); mm.add(mesh(new THREE.ExtrudeGeometry(rib, { depth: 3, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(bx + 1.5, 0, 0), coat)); }
    for (const sy of [-12, 22]) mm.add(mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 20).rotateX(Math.PI / 2), screw, bx, sy, 3.4));
    const c = new THREE.Object3D(); c.name = 'contact'; c.position.set(bx, 4, 0); c.userData = { w: 36, h: 56 }; mm.add(c);
  }

  // runners: a nylon body under the slot and a ring for the hook; the lead carrier at each drape's inner edge is longer
  const runner = new THREE.MeshPhysicalMaterial({ color: '#efefeb', roughness: 0.4, metalness: 0, clearcoat: 0.2, envMapIntensity: 1 });
  const bodyG = rbox(11, 7, 9, 1.6, 2), leadG = rbox(34, 8, 10, 2, 2), ringG = new THREE.TorusGeometry(3.2, 0.75, 8, 20), hookG = new THREE.CylinderGeometry(0.6, 0.6, HOOK - H / 2 - 13.2, 6);
  const makeRunner = (lead: boolean) => {
    const o = new THREE.Group(); o.add(mesh(lead ? leadG : bodyG, runner, 0, -H / 2 - 3.5, 0));
    for (const rx of lead ? [-11, 11] : [0]) { o.add(mesh(ringG, screw, rx, -H / 2 - 10, 0)); o.add(mesh(hookG, screw, rx, -(H / 2 + 13.2 + HOOK) / 2, 0)); } // ring, and the drape's hook down to its heading
    o.position.z = ZC; mm.add(o); return o;
  };
  // the walkthrough: two drapes meeting in the middle (lead carriers last); the viewer: one drape, its lead carrier first
  const runners = viewer ? [Array.from({ length: RUNNERS * 2 }, (_, i) => makeRunner(i === 0))] : [0, 1].map(() => Array.from({ length: RUNNERS }, (_, i) => makeRunner(i === RUNNERS - 1)));
  // runners spread from e0 to e1 (the lead carrier), in mm along +X; one pleat of cloth between each pair
  const spread = (rs: THREE.Object3D[], e0: number, e1: number) => rs.forEach((o, i) => { o.position.x = e0 + (e1 - e0) * (i / (rs.length - 1)); });
  // the walkthrough: the room draws the drapes; the runners follow them (1 = gathered at the ends, 0 = drawn). The lead carrier
  // holds the drape's inner edge (the two meet, never cross, at the centre); the last runner stands against the end housing, since
  // the cloth's return runs on past the track's end where no runner can
  const setOpen = (t: number) => { const k = 0.26 + (1 - Math.min(1, Math.max(0, t))) * 0.74, lead = Math.max(18, HALF + 50 - (HALF + 60) * k); spread(runners[0], -HALF + HOUSE_M + 6, -lead); spread(runners[1], HALF - HOUSE_F - 6, lead); };
  if (viewer) { // the product viewer: one linen drape drawn from the far end almost to the motor, so the motor stays in view
    const e0 = HALF - 50, e1 = -HALF + 150; spread(runners[0], e1, e0);
    const w = e0 - e1, n = runners[0].length - 1, amp = 0.2 * (w / n) + 6, drape = new THREE.PlaneGeometry(w, 1000, n * 8, 1), pos = drape.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const u = (pos.getX(i) + w / 2) / w; pos.setZ(i, Math.sin(u * Math.PI * n) * amp * (pos.getY(i) > 0 ? 0.8 : 1)); }
    drape.computeVertexNormals();
    const d = new THREE.Mesh(drape, new THREE.MeshPhysicalMaterial({ color: '#e7dfd2', roughness: 0.95, metalness: 0, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#fff6e8'), side: THREE.DoubleSide, envMapIntensity: 0.9 }));
    d.castShadow = d.receiveShadow = true; d.position.set((e0 + e1) / 2, -HOOK - 500, ZC); mm.add(d);
  } else { setOpen(num(p, 'open', 1)); g.userData.setOpen = setOpen; }

  // the motor, hanging from the drive housing: steel coupling plate, satin body, grey end cap; the lead from its foot to the wall
  const top = -H / 2 - 2;
  mm.add(mesh(rbox(50, 2.5, 50, 1.2, 2), brushed('#b9bbbd'), MX, top - 1.25, ZC));
  const body = mesh(prism([roundRectRun(MS, MS, MR, 8)], [{ x: 0, inset: 1.6 }, { x: 1.6, inset: 0 }, { x: ML - 1.2, inset: 0 }, { x: ML, inset: 1.2 }], true).rotateZ(-Math.PI / 2), shell, MX, top - 2.5, ZC); mm.add(body); // swept along −Y
  const cap = mesh(prism([roundRectRun(MS - 0.6, MS - 0.6, MR - 0.3, 8)], [{ x: 0, inset: 1.2 }, { x: 1.2, inset: 0 }, ...[0, 1, 2, 3].map((j) => ({ x: MC - 5 + 5 * Math.sin(j * Math.PI / 6), inset: 5 * (1 - Math.cos(j * Math.PI / 6)) }))], true).rotateZ(-Math.PI / 2), capGrey, MX, top - 2.5 - ML - 0.6, ZC); mm.add(cap);
  const foot = top - 2.5 - ML - 0.6 - MC, face = ZC + MS / 2;
  // on the room side: the blank label, the status lens, the setting button in its ring
  { const lab = new THREE.Mesh(new THREE.PlaneGeometry(30, 90), new THREE.MeshStandardMaterial({ color: '#ffffff', map: labelTex(), roughness: 0.85, metalness: 0, envMapIntensity: 0.8 })); lab.position.set(MX, top - 2.5 - 78, face + 0.05); mm.add(lab); }
  const lensY = top - 2.5 - ML + 30;
  const lens = mesh(new THREE.SphereGeometry(1.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#1d2226', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, emissive: accent, emissiveIntensity: 0.5 }), MX, lensY, face + 0.1);
  lens.name = 'led_0'; mm.add(lens);
  mm.add(mesh(new THREE.TorusGeometry(4.6, 0.6, 8, 32), dark, MX, lensY - 14, face + 0.1));
  mm.add(mesh(new THREE.CylinderGeometry(3.8, 3.8, 1.4, 28).rotateX(Math.PI / 2), shell, MX, lensY - 14, face + 0.3));
  // the lead: a grommet under the cap, a white cable bending back to an outlet plate on the wall
  mm.add(mesh(new THREE.CylinderGeometry(5, 5.6, 4, 24), dark, MX, foot - 2, ZC));
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(MX, foot - 3, ZC), new THREE.Vector3(MX, foot - 28, ZC - 4), new THREE.Vector3(MX, foot - 52, ZC - 50), new THREE.Vector3(MX, foot - 60, 40), new THREE.Vector3(MX, foot - 62, 6)]);
  mm.add(mesh(new THREE.TubeGeometry(cable, 48, 2.3, 10, false), new THREE.MeshStandardMaterial({ color: '#efefec', roughness: 0.5, metalness: 0, envMapIntensity: 0.9 })));
  mm.add(mesh(rbox(26, 26, 4, 1.5, 2), moulded, MX, foot - 62, 2));
  { const c = new THREE.Object3D(); c.name = 'contact'; c.position.set(MX, foot - 62, 0); c.userData = { w: 26, h: 26 }; mm.add(c); }

  const origin = new THREE.Object3D(); origin.name = 'origin'; origin.position.set(0, 0, ZC); mm.add(origin);
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(MX, top - 2.5 - ML * 0.42, face); mm.add(hs);
  return g;
}
