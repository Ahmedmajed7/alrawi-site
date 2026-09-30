/**
 * The smart door lock, modelled after the catalogue unit (p. 10, the outside escutcheon on the left of the photograph) and its
 * maker's drawings (S300 series: 78 × 425 mm, 14 keys): a 62 × 425 mm piano-black escutcheon 22 mm over the door.
 *
 *   door │ escutcheon (gloss black, a soft roundover) │ glass panes, polished rims │ lenses under the glass │ push-pull handle
 *
 * From the top, as the photograph measures it (425 mm ↔ 1835 px):
 *   9–34 mm    the face-recognition window: three lens domes in a row, a status dot above the right one;
 *   37–176     the main pane: the camera between two infrared emitters, then the keypad (1–9, ✱ 0 bell, the padlock below);
 *   205–418    the handle: a block of the same gloss black standing 24 mm proud, left-aligned (it overhangs the escutcheon's left
 *              edge by 3 mm), a tight arch at the top and a long cut at the lower left; the fingerprint reader on its left flank.
 * The keypad's digits are light over the glass (added, so the glass keeps its own reflection), softly backlit.
 */
import * as THREE from 'three';
import { num, off, canvasTex, mesh, roughVar, type Ctx } from '../kit';
import { loft, addLoft, rounded, type Step } from './panel';

const W = 62, H = 425, D = 22, RO = 4.5;          // the escutcheon: width, height, depth over the door, the roundover of its front edge
const RT = 16, RB = 9;                             // its corner radii: the arch at the top, tighter at the foot
const INSET = 3.5, PANE_Z = D + 0.95;              // the glass stands in from the edge and about a millimetre proud
const WIN = [9, 34] as const, PANE = [37, 176] as const; // from the top edge: the face-recognition window, the camera + keypad pane
const HANDLE = { top: 205, bot: 418, w: 50, left: -34, proud: 24, r: 7 };
/** the live keypad (film/device-live.ts) pins its digits at these shares of the quad: columns 0.22 / 0.5 / 0.78, rows from 0.2 by 0.17 */
const KEYS = { w: 51, h: 100, top: 76 };         // so the catalogue's 14.5 × 17 mm key pitch makes a 51 × 100 mm quad, its top 76 mm down
const y = (fromTop: number) => H / 2 - fromTop;

/** the keypad as light: thin digits with a soft halo, the bell, the ✱, the padlock and the tactile dot under the 5 */
function keypadLight() {
  const paint = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const ink = 'rgba(232,240,255,0.95)', col = [0.22, 0.5, 0.78], row = (k: number) => h * (0.2 + k * 0.17);
    const icon = (fn: () => void) => { g.save(); g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = 'rgba(160,195,255,0.8)'; g.shadowBlur = 8; fn(); g.restore(); };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const pass of [0, 1]) { // the halo first (the light guide bleeds round each digit), then the crisp digit
      g.font = `300 78px Jost, "IBM Plex Sans", system-ui, sans-serif`; g.fillStyle = pass ? ink : 'rgba(150,185,255,0.35)'; g.shadowColor = pass ? 'transparent' : 'rgba(150,190,255,0.9)'; g.shadowBlur = pass ? 0 : 12;
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((d, i) => g.fillText(d, w * col[i % 3], row(Math.floor(i / 3)) + 3));
      g.fillText('0', w * col[1], row(3) + 3);
    }
    g.shadowBlur = 0;
    icon(() => { const cx = w * col[0], cy = row(3); for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(cx - Math.cos(a) * 20, cy - Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); g.stroke(); } }); // ✱
    icon(() => { const cx = w * col[2], cy = row(3) - 4; g.beginPath(); g.moveTo(cx - 22, cy + 16); g.quadraticCurveTo(cx - 16, cy + 10, cx - 16, cy - 4); g.arc(cx, cy - 4, 16, Math.PI, 0); g.quadraticCurveTo(cx + 16, cy + 10, cx + 22, cy + 16); g.closePath(); g.stroke(); g.beginPath(); g.arc(cx, cy + 23, 5, 0, Math.PI); g.stroke(); }); // bell
    icon(() => { const cx = w * 0.5, cy = h * 0.85; g.strokeRect(cx - 17, cy - 6, 34, 28); g.beginPath(); g.arc(cx, cy - 6, 11, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(cx, cy + 8, 3, 0, Math.PI * 2); g.fill(); }); // padlock
    g.fillStyle = 'rgba(232,240,255,0.7)'; g.beginPath(); g.arc(w * 0.5, row(1) + 52, 4, 0, Math.PI * 2); g.fill(); // the tactile dot under the 5
  };
  const t = canvasTex(512, 1024, paint);
  if (typeof document !== 'undefined' && document.fonts) document.fonts.load('300 78px Jost').then(() => { const c = t.image as HTMLCanvasElement; paint(c.getContext('2d')!, c.width, c.height); t.needsUpdate = true; }).catch(() => { /* the system face stays */ });
  return t;
}

/** the handle's section: its flanks roll off (3 mm) to 45°, then a polished 45° chamfer (1.2 mm deep) meets the face */
function handleProfile(z0: number, z1: number): Step[] {
  const r = 3, c = 1.2, k = 1 - Math.SQRT1_2, zc = z1 - c;               // the roundover ends at 45°, the chamfer starts there
  const zr = zc - r * Math.SQRT1_2;                                      // the straight wall ends here, so the roundover reaches 45° at zc
  return [{ i: 0, z: z0, a: 0, m: 0 }, { i: 0, z: zr, a: 0 }, { i: r * (1 - Math.cos(Math.PI / 8)), z: zr + r * Math.sin(Math.PI / 8), a: 22.5 }, { i: r * k, z: zc, a: 45 }, { i: r * k, z: zc, a: 45, m: 1 }, { i: r * k + c, z: z1, a: 45 }];
}

/** a lens under the glass: a polished ring round a small coated dome that catches the sky */
function lens(parent: THREE.Object3D, x: number, yy: number, r: number, ring: THREE.Material, dome: THREE.Material, z = PANE_Z) {
  parent.add(mesh(new THREE.RingGeometry(r, r * 1.28, 48), ring, x, yy, z + 0.02));
  const d = mesh(new THREE.SphereGeometry(r, 32, 8, 0, Math.PI * 2, 0, 0.75).rotateX(Math.PI / 2), dome, x, yy, z - r * Math.cos(0.75) + 0.05); d.scale.z = 0.8; parent.add(d);
}

/** The push-pull smart lock. Returns null for a parameter set that is not a tall escutcheon. */
export function doorLock({ p }: Ctx): THREE.Group | null {
  const h = num(p, 'h', 1.7), w = num(p, 'w', 0.36);
  if (h < w * 2.5) return null;
  const g = new THREE.Group(), mm = new THREE.Group(); mm.scale.setScalar(h / H); g.add(mm);

  // The catalogue unit is piano-black lacquer over the metal, and it reads as real by what it mirrors, never by a sheen of its own:
  //  – the lacquer: a black base with no specular of its own (a rough base lobe under the coat was the grey haze that made it read
  //    as foggy plastic) under one clear coat, glass-smooth but for a faint unevenness in its gloss;
  //  – the glass: plain soda-lime (4 % at normal incidence, rising to a mirror at grazing), no coat, no haze, black behind it;
  //  – polished steel wherever an edge is machined (the 45° rims round the panes, the lens rings): a crisp line of light.
  // Outdoors it gets a reflection probe of the porch itself (house/devices.ts), so the lacquer mirrors the court, not a flat sky.
  const obsidian = new THREE.MeshPhysicalMaterial({ color: '#030304', roughness: 0.3, metalness: 0, specularIntensity: 0, clearcoat: 1, clearcoatRoughness: 0.03, clearcoatRoughnessMap: roughVar(), envMapIntensity: 1.5 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.012, metalness: 0, ior: 1.52, specularIntensity: 1, envMapIntensity: 1.5 });
  const rim = new THREE.MeshPhysicalMaterial({ color: '#e4e6ea', metalness: 1, roughness: 0.06, envMapIntensity: 1.1 });   // the polished edge round every pane
  // the handle: the same lacquer (black chrome reflected the sunlit beige court as a brown bronze); its front edge is a polished 45°
  // chamfer, the crisp line of light down its length
  const handle = obsidian;
  const ring = new THREE.MeshStandardMaterial({ color: '#9da1a8', metalness: 1, roughness: 0.12, envMapIntensity: 1 });
  const dome = new THREE.MeshPhysicalMaterial({ color: '#07060d', roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.5, iridescenceIOR: 1.6, iridescenceThicknessRange: [260, 420], envMapIntensity: 1.2 });
  const ir = new THREE.MeshPhysicalMaterial({ color: '#140405', roughness: 0.05, metalness: 0, clearcoat: 1, envMapIntensity: 1 }); // the infrared emitters' deep red filter

  // the escutcheon: a soft roundover into a flat face
  addLoft(mm, loft(W, H, [RT, RT, RB, RB], rounded(0, D, RO, 0, 6), { cap: 0, back: 0, seg: 10 }), [obsidian]);
  // the panes: edge 0.5 mm, a polished 45° rim, the glass face
  const pane = (from: number, to: number, r: readonly [number, number, number, number]) => {
    const steps: Step[] = [{ i: 0, z: D - 0.3, a: 0, m: 2 }, { i: 0, z: PANE_Z - 0.45, a: 0 }, { i: 0, z: PANE_Z - 0.45, a: 45, m: 1 }, { i: 0.45, z: PANE_Z, a: 45 }];
    addLoft(mm, loft(W - INSET * 2, to - from, r, steps, { cap: 0, seg: 10, cy: y((from + to) / 2) }), [glass, rim, obsidian]);
  };
  pane(WIN[0], WIN[1], [RT - INSET, RT - INSET, 3, 3]);
  pane(PANE[0], PANE[1], [3, 3, 3, 3]);

  // face recognition: three lens domes in a row; the status dot above the right one (`led_0`)
  const ly = y(21.5); for (const x of [-9, 0, 9]) lens(mm, x, ly, 2.7, ring, dome);
  const l0 = mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#4aa8ff', emissiveIntensity: 1.2, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), 10, y(12.5), PANE_Z + 0.03); l0.name = 'led_0'; mm.add(l0);
  // the camera between its two infrared emitters
  lens(mm, 0, y(47), 3.4, ring, dome);
  for (const s of [-1, 1]) { mm.add(mesh(new THREE.RingGeometry(1.5, 1.95, 32), ring, s * 18, y(47), PANE_Z + 0.02)); mm.add(mesh(new THREE.CircleGeometry(1.5, 32), ir, s * 18, y(47), PANE_Z + 0.015)); }
  // the keypad: light added over the glass (the glass keeps its reflection under the digits). `keypad`: the landing wakes it digit by digit
  const kpMat = new THREE.MeshBasicMaterial({ map: keypadLight(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.25, 1.25, 1.3) });
  const kp = new THREE.Mesh(new THREE.PlaneGeometry(KEYS.w, KEYS.h), kpMat); kp.name = 'keypad'; kp.position.set(0, y(KEYS.top + KEYS.h / 2), PANE_Z + 0.04); kp.renderOrder = 3; mm.add(kp);

  // the handle: left-aligned, a tight arch at the top, the long cut at the lower left; a 3 mm roundover off its flanks turning into
  // the polished chamfer round its face
  const hx = HANDLE.left + HANDLE.w / 2, hy = y((HANDLE.top + HANDLE.bot) / 2);
  addLoft(mm, loft(HANDLE.w, HANDLE.bot - HANDLE.top, [HANDLE.r, HANDLE.r, 20, HANDLE.r], handleProfile(D - 1, D + HANDLE.proud), { cap: 0, seg: 10, cx: hx, cy: hy }), [handle, rim]);
  { // the fingerprint reader on the handle's left flank, where the index finger lies: dark glass in a polished ring
    const fp = new THREE.Group(); fp.rotation.y = -Math.PI / 2; fp.position.set(HANDLE.left, y(HANDLE.top + 30), D + HANDLE.proud * 0.45); mm.add(fp);
    addLoft(fp, loft(13, 11, 4, [{ i: 0, z: -0.2, a: 0, m: 1 }, { i: 0, z: 0.3, a: 0 }, { i: 0, z: 0.3, a: 45 }, { i: 0.35, z: 0.6, a: 45 }], { cap: 0 }), [glass, rim]);
    const f = new THREE.Object3D(); f.name = 'btn_finger'; f.position.z = 0.7; fp.add(f);
  }

  // behind the mounting plane (product viewer only): the rubber gasket that seals it to the door
  if (!off(p, 'back')) addLoft(mm, loft(W - 3, H - 3, [RT - 1.5, RT - 1.5, RB - 1.5, RB - 1.5], [{ i: 0, z: -1.5, a: 0 }, { i: 0, z: 0, a: 0 }], { cap: -1, back: 0 }), [new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.8 })]);
  // the HUD's reticle locks onto the face camera: on the keypad it hid the live digits (film/device-live.ts wakes them one by one);
  // at the film's framing its rings end just above the first row
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, y(47), PANE_Z + 0.5); mm.add(hs);
  return g;
}
