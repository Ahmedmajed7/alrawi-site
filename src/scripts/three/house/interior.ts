/**
 * The ground floor, designed in code inside the villa shell: entrance hall, living room with a majlis corner, inner hallway
 * and kitchen. Gulf contemporary at golden hour, built on three values: off-white limewash (the lights), honed travertine a
 * stop and a half under it (the mids), smoked walnut and dark bronze (the darks), with brushed brass for the glints.
 * Dimensions come from villa.json so they track the shell cuts. How the surfaces are shaded: interior-surface.ts; the light
 * the rooms give back: interior-gi.ts.
 *
 * Dev flags: ?gi=0 (no probes), ?lk=spots,coves,strips,bounce (weigh the groups of light), ?nocontact (without the devices' contact
 * shades), ?pick=x,y;… (what lies under a pixel of a 1600 × 900 still), ?nan (paints what cannot be lit, names the geometry at fault).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gsap } from 'gsap';
import type { Tier } from '../common';
import villaJson from '@/data/villa.json';
import houseJson from '@/data/house.json';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { glowTexture } from '../common';
import type { HouseConfig } from './types';
import { stamp, type Props } from './props';
import { createSurfaceKit, worldMapped, type Aperture, type Cove, type Pane, type ShadeOpts, type Strip } from './interior-surface';
import { createRoomGI, type RoomGI } from './interior-gi';
import { band, cushion, drape, lampShade, noGlint, noise2, pillow, triplanar, voile, type Drape } from './interior-soft';
import { book, bowl, dallah, dates, finjan, jar, mabkhara, tableLamp, tray, tree, turned } from './interior-decor';
import { bindingTexture, coalTexture, emberTexture, fringeTexture, paintingTexture, rugTexture, saduTexture } from './interior-textiles';

export interface Interior { group: THREE.Group; /** the porch and path pieces that stand in the sun (they get the cloud shadows) */ outdoor: THREE.Group; curtain: { setOpen(t: number, animate?: boolean): void; /** hold the drapes at `t` for a moment (the probe bake); returns what puts them back */ pose?(t: number): () => void; /** the sky's light through the west window follows the drapes (the film's app scene; elsewhere it is constant, as every clip was recorded) */ follow?(on: boolean): void }; /** bake the bounced light again on the next frame, the drapes where they stand (dev: stills; too heavy to do per frame of a recording) */ rebake?(): void; /** the app scene's frames are one held instant shown in any order: what only lives by moving (the thread of smoke, the motes in the sun) is left out of them */ still?(on: boolean): void; /** per-frame life: flames, lantern breathing, sheers, dust, frankincense smoke (dt-driven, so it records frame-exact) */ update(dt: number, camera: THREE.Camera): void; dispose(): void }
interface Win { id: string; face: '-x' | '+x' | '+z' | '-z'; at: number; a0: number; a1: number; y0: number; y1: number; mullions?: number }
const villa = villaJson as unknown as { plan: { x0: number; x1: number; z0: number; z1: number; wing: { x0: number; x1: number; z0: number; z1: number }; floorY: number; ceilY: number; slabY: number }; windows: Win[] };

const T = '/textures/interior/';
const tl = new THREE.TextureLoader();
let loading = 0; // textures still on their way: the probe lattice is only baked once every surface has its own
function tex(name: string, rx: number, ry = rx, srgb = false) { loading++; const done = () => { loading--; }; const t = tl.load(`${T}${name}.webp`, done, undefined, done); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
/** Axis-aligned box between two corners, in either order (a negative size would turn the box inside out). */
const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
/** A moulding: a closed profile drawn in plan (x, z) and raised from y0 to y1, or drawn in section (z, y) and run from x0 to x1.
 *  One solid: a casing built of it has no face lying in another's plane. */
function profile(pts: [number, number][], run: 'y' | 'x', from: number, to: number) {
  const shape = new THREE.Shape(pts.map(([a, b]) => (run === 'y' ? new THREE.Vector2(a, b) : new THREE.Vector2(-a, b))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(to - from), bevelEnabled: false });
  return run === 'y' ? g.rotateX(Math.PI / 2).translate(0, Math.max(from, to), 0) : g.rotateY(Math.PI / 2).translate(Math.min(from, to), 0, 0);
}
const rbox = (w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.1)).translate(x, y, z);
/** A floor/ceiling quad with metre-scaled UVs. */
function quad(x0: number, x1: number, z0: number, z1: number, y: number, per = 1, up = true) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(up ? -Math.PI / 2 : Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / per, uv.getY(i) * (z1 - z0) / per);
  return g;
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const seeded = (a: number) => () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
/** Soft contact shadow texture: a blurred rounded rectangle (or disc). */
function contactTex(round: boolean) {
  const t = canvasTex(256, 256, (g, w, h) => { g.filter = 'blur(26px)'; g.fillStyle = '#000'; g.beginPath(); if (round) g.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); else g.roundRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6, 18); g.fill(); });
  t.colorSpace = THREE.NoColorSpace; return t;
}

/* The details every room shares (metres) */
const SK = 0.1, GAP = 0.015;        // flush skirting, and the shadow gap that parts it from the plaster (a 15 mm dark line a hand over the floor)
const CW = 0.22, DROP = 0.05;       // the cove trough between wall and dropped ceiling; the dropped ceiling's thickness
const PIER = 1.6, PT = 0.12;        // the partition between living room and inner hallway: its west face is the panel wall
const CLAD = 0.03;                  // the panel wall's stone stands this proud of the pier: its face is x = 1.51, where the control panel is mounted
const OPEN = { z0: -1.45, z1: -0.45, h: 2.15 }, LINING = 0.02, REVEAL = 0.005; // the cased opening hall → hallway (clear size), its walnut lining and the shadow reveal around it
const PANEL_Z = -2.3;               // where the control panel hangs on it (house.json): the grazer is brightest over it
const INLAYS = [-1.91, -2.69, -3.47], INLAY = 0.004; // brushed-brass inlays in the panel wall, 4 mm wide: the panel (z −2.3) sits in the middle of a 78 cm bay, 27 cm clear of both
// the front door as door.ts builds it: a steel frame (x ±0.55…0.62, z ±0.06, head up to 2.17 over the floor) and, behind it, a 2 cm plaster
// lining through the wall (x ±0.63…0.65, top 2.18…2.20). The hall's wall clears that lining by 4 mm; a walnut casing covers both
const DOOR = { hole: 0.654, top: 2.204, face: 0.606, head: 2.156, end: -0.064, arch: 0.088, proud: 0.018, sunk: 0.003 };
/** Trimless downlights: x, z, candela, what they are aimed at (straight down by default), half-angle, and whether they cast shadows. */
interface Down { x: number; z: number; i: number; aim?: [number, number, number]; angle?: number; shadow?: boolean }

export function buildInterior(tier: Tier, roomEnv?: THREE.Texture, props?: Props, glowCfg?: HouseConfig['glow']): Interior {
  const { plan, windows } = villa; const W = plan.wing;
  const sunDir = new THREE.Vector3(...(houseJson as unknown as HouseConfig).sun.dir).normalize(); // toward the sun
  const F = plan.floorY, C = plan.ceilY, S = plan.slabY; const high = tier === 'high';
  const CY = C - DROP; // the dropped ceiling's underside (3.05): the speaker and the smoke detector are mounted on it
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const record = q.has('record');
  // the walls as a painter leaves them (29 Sep): an even skin of fine stipple, the tonal clouds and the trowel waves nearly gone (at arm's
  // length both read as dirt), a crisp crease in every corner. dev: ?iw0 shows the walls as they were
  const V2 = !q.has('iw0');
  // dev: ?lk=spots,coves,strips,bounce scales those groups of light (1 = as designed), to weigh them against each other in stills
  const lkv = (q.get('lk') ?? '').split(',').map(Number), lk = (i: number) => (lkv[i] > 0 ? lkv[i] : 1);
  // ?lights=0…1: the rooms' own lights (downlights, pendants, lamps, coves, the grazer and their fixtures' glow), 1 = as designed.
  // The film's app scene is recorded twice, lights on and off (scripts/record-film.mjs): the fire, the sky and the sun are not touched
  const LV = q.has('lights') ? Math.max(0, Math.min(1, Number(q.get('lights')) || 0)) : 1;
  // ?lamps=0…1: the table lamps on their own (they follow ?lights unless said otherwise). The app scene is also recorded with the
  // lamps alone (?lights=0&lamps=1): a room dims ceiling first, and the lamps' glow is what is left before the dark
  const LAMPS = q.has('lamps') ? Math.max(0, Math.min(1, Number(q.get('lamps')) || 0)) : LV;
  // ?bake=0…1: where the west drapes stand while the bounce light is baked (1 = parted, as every clip is baked; 0 = drawn), the
  // sky's light through that window following them from the start. The app scene is recorded under both and the encoder blends
  // the two by the drapes' position: baking again for every frame hung the browser after a few (2 Oct 2026)
  const BAKE = q.has('bake') ? Math.max(0, Math.min(1, Number(q.get('bake')) || 0)) : null;
  const group = new THREE.Group(); group.name = 'interior';
  const outdoor = new THREE.Group(); outdoor.name = 'porch'; group.add(outdoor);
  // reflections come from a studio-room map (bright soft panels, dark corners), not the sky: the sky is not occluded by
  // walls and an orange sky in every brass and travertine reflection is what made the rooms look like plastic
  const envI = roomEnv ? 0.55 : 0.45;
  const GLASS_IN = high ? 0.35 : 0.5, GLASS_OUT = 0.8; // the window glass's reflection seen from inside and from the street (update())
  const uTime = { value: 0 };
  const t = 0.14, DEPTH = 0.34; // wall thickness; window reveal depth ≈ shell wall + our wall
  const px0 = PIER - PT / 2, px1 = PIER + PT / 2, faceX = px0 - CLAD; // the pier's faces, and the panel wall's finished face (1.51)
  const zN = OPEN.z0 - LINING - REVEAL, zS = -4.2;                     // the panel wall runs from the portal's reveal to the pier's free end
  const slot = { x0: faceX - 0.125, x1: faceX, z0: zS, z1: zN };       // the ceiling slot over the panel wall that hides the grazer
  const doorW = 1.1 + 0.16, doorH = 2.1 + 0.09;

  /* ---------- what the shading needs to know about the plan ---------- */
  const rooms = { a: new THREE.Vector4(plan.x0, plan.x1, plan.z0, plan.z1), b: new THREE.Vector4(W.x0, W.x1, W.z0, W.z1), pier: new THREE.Vector3(PIER, -4.2, W.z1), fc: new THREE.Vector2(F, C) };
  const apertures: Aperture[] = windows.map((w) => { const a0 = Math.min(w.a0, w.a1), a1 = Math.max(w.a0, w.a1), n = w.mullions ?? 0, sgn = w.face[0] === '+' ? 1 : -1;
    return { axis: w.face[1] === 'z' ? 'z' : 'x', at: w.at, out: w.at + sgn * DEPTH, a0, a1, y0: w.y0, y1: w.y1, frame: 0.06, barW: 0.04, bars: Array.from({ length: n }, (_, i) => a0 + ((a1 - a0) * (i + 1)) / (n + 1)) } as Aperture; });
  apertures.push({ axis: 'z', at: W.z1, out: 0, a0: W.x0 + 0.03, a1: 0.55, b0: -0.55, b1: 0.55, y0: F, y1: F + 2.1 }); // the front door (the leaf itself is in the shadow map)
  const wallY: [number, number] = [0.3, 3.6], MX0 = plan.x0 + CW, MX1 = plan.x1 - CW, MZ0 = plan.z0 + CW, MZ1 = plan.z1 - CW, WX0 = W.x0 + CW, WX1 = W.x1 - CW, WZ1 = W.z1 - CW; // the dropped ceiling's edges
  const panes: Pane[] = [
    { axis: 'x', at: PIER, u0: zS, u1: zN, v0: wallY[0], v1: wallY[1] },                                                  // the pier
    { axis: 'x', at: PIER, u0: zN - 0.06, u1: OPEN.z1 + 0.085, v0: F + OPEN.h + LINING, v1: wallY[1] },                    // the header over the portal
    { axis: 'x', at: PIER, u0: OPEN.z1 + LINING + REVEAL, u1: -0.1, v0: wallY[0], v1: wallY[1] },                          // the stub beside the front door
    { axis: 'z', at: plan.z1 + t / 2, u0: plan.x0 - 0.3, u1: W.x0, v0: wallY[0], v1: wallY[1] },                           // living room front wall
    { axis: 'x', at: W.x0 - t / 2, u0: plan.z1, u1: -0.1, v0: wallY[0], v1: wallY[1] },                                    // wing west wall
    { axis: 'z', at: plan.z1 + t / 2, u0: W.x1, u1: plan.x1 + 0.3, v0: wallY[0], v1: wallY[1] },                           // front wall right of the wing
    { axis: 'x', at: W.x1 + t / 2, u0: plan.z1, u1: -0.1, v0: wallY[0], v1: wallY[1] },                                    // wing east wall
    { axis: 'z', at: W.z1 + t / 2, u0: doorW / 2, u1: W.x1 + 0.3, v0: wallY[0], v1: wallY[1] },                            // wing front wall, right of the door
    { axis: 'z', at: W.z1 + t / 2, u0: -doorW / 2 - 0.06, u1: doorW / 2 + 0.06, v0: F + doorH, v1: wallY[1] },             // … and over it
    { axis: 'z', at: -0.25, u0: -1.7, u1: -0.55, v0: wallY[0], v1: wallY[1] },                                              // the porch wall left of the door
    // the dropped ceiling, in pieces around the grazer slot (pieces overlap by 6 cm where they only meet on paper)
    { axis: 'y', at: CY + DROP / 2, u0: MX0, u1: WX0 + 0.06, v0: MZ0, v1: MZ1 }, { axis: 'y', at: CY + DROP / 2, u0: WX0, u1: slot.x0, v0: MZ0, v1: MZ1 + 0.06 },
    { axis: 'y', at: CY + DROP / 2, u0: slot.x1, u1: WX1, v0: MZ0, v1: MZ1 + 0.06 }, { axis: 'y', at: CY + DROP / 2, u0: WX1 - 0.06, u1: MX1, v0: MZ0, v1: MZ1 },
    { axis: 'y', at: CY + DROP / 2, u0: slot.x0 - 0.06, u1: slot.x1 + 0.06, v0: MZ0, v1: slot.z0 }, { axis: 'y', at: CY + DROP / 2, u0: slot.x0 - 0.06, u1: slot.x1 + 0.06, v0: slot.z1, v1: WZ1 },
    { axis: 'y', at: CY + DROP / 2, u0: WX0, u1: slot.x0, v0: MZ1 - 0.06, v1: WZ1 }, { axis: 'y', at: CY + DROP / 2, u0: slot.x1, u1: WX1, v0: MZ1 - 0.06, v1: WZ1 },
  ];
  // 2,900 K lamps as a camera balanced for them sees them: a breath of warmth on a white wall, no more (the walls must read off-white,
  // not tan; the evening sun through the glass is the orange in the picture)
  const led = '#fff1e2', lampWhite = '#fff3e6';
  const strips: Strip[] = [
    // the wall grazer in the slot over the panel wall: a beam aimed down the stone, 9 cm off its face, behind an opal diffuser. Brightest
    // half a metre under the ceiling and over the control panel, fading toward both ends of the wall and toward the floor
    { a: [faceX - 0.09, CY + 0.07, zN - 0.08], b: [faceX - 0.09, CY + 0.07, zS + 0.08], aim: [0.03, -1, 0], spread: 0.3, power: 34 * lk(2) * LV, reach: 3.4, color: led, peak: { at: [faceX - 0.09, CY + 0.07, PANEL_Z], width: 1.0, floor: 0.4 } },
    // the picture light over the painting at the end of the hall
    { a: [W.x1 - 0.13, F + 2.32, -1.2], b: [W.x1 - 0.13, F + 2.32, -0.6], aim: [0.3, -1, 0], spread: 0.5, power: 4 * lk(2) * LV, reach: 1.7, color: led },
  ];
  const cy = CY + DROP + 0.025, sb = 0.06; // LED strips lie on the dropped ceiling, 6 cm back from its edge: no eye below can see them
  const coves: Cove[] = [
    { a: [MX0 + sb, cy, MZ0 + sb], b: [MX0 + sb, cy, MZ1 - sb] }, { a: [MX0 + sb, cy, MZ0 + sb], b: [MX1 - sb, cy, MZ0 + sb] }, { a: [MX1 - sb, cy, MZ0 + sb], b: [MX1 - sb, cy, MZ1 - sb] },
    { a: [MX0 + sb, cy, MZ1 - sb], b: [WX0 - sb, cy, MZ1 - sb] },
    { a: [WX0 + sb, cy, MZ1 + sb], b: [WX0 + sb, cy, WZ1 - sb] }, { a: [WX0 + sb, cy, WZ1 - sb], b: [WX1 - sb, cy, WZ1 - sb] }, { a: [WX1 - sb, cy, MZ1 + sb], b: [WX1 - sb, cy, WZ1 - sb] },
  ];
  // dusk: the rooms are carried by their accents (scallops, coves, the grazer, the lamps' pools) and by the sun through the glass; what
  // they give back (the probes) and the sky's fill are kept low, so a plain wall sits in half light and the corners fall off
  const kit = createSurfaceKit({ rooms, apertures, panes, strips, coves, cove: { power: 1.7 * lk(1) * LV, bounce: 1.5 * lk(1) * LV, fall: 0.7, color: led, y: CY }, gi: 0.8 * lk(3), fill: 0.06, sun: 1.45, taps: record ? 32 : 16, tight: V2 ? 1 : 0 });
  const sh = <T extends THREE.MeshStandardMaterial>(m: T, o?: ShadeOpts) => kit.shade(m, o);

  /* ---------- materials ---------- */
  /** The colour a grey scan must be multiplied by to come out as `target` (the scan's mean level, 0 … 255, is what it is divided by). */
  const dye = (target: string, mean: number) => { const c = new THREE.Color(target), k = 1 / Math.pow(mean / 255, 2.2); return new THREE.Color().setRGB(c.r * k, c.g * k, c.b * k); };
  const wool = (colour: string, sheen: string) => sh(triplanar(new THREE.MeshPhysicalMaterial({ color: dye(colour, 131), roughness: 1, map: tex('wool_diff', 1, 1, true), normalMap: tex('wool_nor', 1), roughnessMap: tex('wool_rough', 1), normalScale: new THREE.Vector2(0.9, 0.9), sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheen).multiplyScalar(0.35), envMapIntensity: envI * 0.3 }), 0.3), { strength: 0.5 });
  const binding = (colour: string, foil: string, seed: number) => sh(new THREE.MeshStandardMaterial({ map: bindingTexture(colour, foil, seed), roughness: 0.85, envMapIntensity: envI * 0.5 }), { strength: 0.3 });
  const stoneMaps = () => ({ map: tex('travertine_diff', 1, 1, true), normalMap: tex('travertine_nor', 1), roughnessMap: tex('travertine_rough', 1) });
  const veneer = () => ({ map: tex('smoked_diff', 1, 1, true), normalMap: tex('smoked_nor', 1), roughnessMap: tex('smoked_rough', 1) });
  const fine = V2 && high ? tex('plaster_fine_nor', 1) : undefined; // the stipple only shows at the film's resolution: the live low tier skips its 340 KB
  const limeMaps = () => ({ map: tex('limewash_mottle', 1), normalMap: tex('limewash_nor', 1), roughnessMap: tex('limewash_rough', 1) }); // the mottle is a multiplier around 1, not a colour (no sRGB)
  const M = {
    // honed travertine in 1.2 × 2.4 m slabs laid in third bond, the long side and the veins running into the house; 2 mm joints. A stop
    // and a half under the walls (albedo 0.22), honey-warm, honed to a soft sheen (0.52 × the scan's 0.62): the windows (the sky's area
    // lights) and the lamps lie in it as soft glows
    floor: sh(new THREE.MeshStandardMaterial({ color: '#9a8064', roughness: 0.52, ...stoneMaps(), normalScale: new THREE.Vector2(V2 ? 0.15 : 0.4, V2 ? 0.15 : 0.4), envMapIntensity: envI * 0.9 }), { worldUv: 2.4, look: 'tiles', tile: [1.2, 2.4, 0.002], strength: 0.8, gi: 0.6 }), // (warm: the scan is two thirds neutral, the colour here is the stone's own ochre)
    // the same stone in slabs. `stone` takes its mapping from the geometry (the panel wall's slabs are book-matched), `stoneW` from the world
    // (honed: optically flat, the veining is in the colour; roughness 0.8 × the map's 0.62 = a soft sheen of 0.5)
    stone: sh(new THREE.MeshStandardMaterial({ color: '#f2f0ec', roughness: 0.8, ...stoneMaps(), normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: envI * 0.7 }), { strength: 0.6 }),
    stoneW: sh(new THREE.MeshStandardMaterial({ color: '#e4e0d8', roughness: 0.7, ...stoneMaps(), normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: envI }), { worldUv: 2.4 }),
    hearth: sh(new THREE.MeshStandardMaterial({ color: '#a89f92', roughness: 0.85, ...stoneMaps(), normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: envI * 0.7 }), { worldUv: 2.4 }), // the fireplace wall: a darker cut of the same stone
    // limewash: a warm off-white (albedo ≈ 0.8), cloudy the way lime dries, trowelled smooth: its relief is only there when light rakes it
    plaster: sh(new THREE.MeshStandardMaterial({ color: '#ece9e2', roughness: 0.9, ...limeMaps(), normalScale: new THREE.Vector2(V2 ? 0.1 : 0.3, V2 ? 0.1 : 0.3), envMapIntensity: envI * 0.5 }), { worldUv: 1.6, look: 'limewash', ...(V2 ? { fine: fine && { tex: fine, tile: 0.6, scale: 0.35 }, mottle: 0.25 } : {}) }),
    // without the probes (low tier) the ceiling keeps a faint warm self-glow for the light the floor would bounce onto it. Its white is a
    // touch cooler than the walls': all it gets is the warm floor's and rug's bounce, which read pink-brown on a warm white (R − B 22
    // against the walls' 7); cooler still, the sky's area light over the west window turned it lilac
    ceiling: sh(new THREE.MeshStandardMaterial({ color: V2 ? '#ebefe8' : '#eeeeeb', roughness: 0.95, emissive: '#fff0dc', emissiveIntensity: high ? 0 : 0.05, ...limeMaps(), normalScale: new THREE.Vector2(0.08, 0.08), envMapIntensity: envI * 0.4 }), { worldUv: 2.4, look: 'limewash', gi: 1.05, ...(V2 ? { fine: fine && { tex: fine, tile: 0.6, scale: 0.2 }, mottle: 0.3 } : {}) }), // (a little over the walls' share: a ceiling sees the lit floor and rug square on, and at 0.9 the ceiling-only frames of the speaker and the detector went muddy)
    skirt: sh(new THREE.MeshStandardMaterial({ color: '#e3e0d9', roughness: 0.5, envMapIntensity: envI * 0.6 })),                      // satin lacquer, the wall's own colour a shade down
    gap: sh(new THREE.MeshStandardMaterial({ color: '#1b1a19', roughness: 0.9, envMapIntensity: 0.2 })),                                 // the inside of every shadow gap, plinth and reveal
    // smoked walnut: a quarter-cut veneer, fine straight grain, 1 m per tile; the grain stands upright on doors, panels and casings
    walnut: sh(new THREE.MeshStandardMaterial({ color: '#c4a88c', roughness: 0.95, ...veneer(), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: envI + 0.1 }), { worldUv: 1, grainUp: true }),
    walnutAlong: sh(new THREE.MeshStandardMaterial({ color: '#c4a88c', roughness: 0.95, ...veneer(), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: envI + 0.1 }), { worldUv: 1 }),
    // upholstery is mapped from three sides (no seams to unwrap); the scans are grey, `dye` gives the cloth its colour
    boucle: sh(triplanar(new THREE.MeshPhysicalMaterial({ color: dye('#bfb39c', 214), roughness: 1, map: tex('boucle_diff', 1, 1, true), normalMap: tex('boucle_nor', 1), roughnessMap: tex('boucle_rough', 1), normalScale: new THREE.Vector2(0.8, 0.8), sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color('#efe4d0'), envMapIntensity: envI * 0.4 }), 0.17), { strength: 0.6 }),
    fabric: sh(triplanar(new THREE.MeshPhysicalMaterial({ color: dye('#a39378', 169), roughness: 0.95, map: tex('fabric_diff', 1, 1, true), normalMap: tex('fabric_nor', 1), roughnessMap: tex('fabric_rough', 1), normalScale: new THREE.Vector2(0.7, 0.7), sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color('#f3e6d2'), envMapIntensity: envI * 0.5 }), 0.4), { strength: 0.6 }),
    ink: wool('#1c2738', '#8fa3c4'), rust: wool('#7a3a22', '#e0a078'), olive: wool('#55543a', '#c9c79a'), throw: wool('#7d6450', '#e0c4a0'),
    sadu: sh(new THREE.MeshPhysicalMaterial({ map: saduTexture(), roughness: 1, normalMap: tex('wool_nor', 4, 2), normalScale: new THREE.Vector2(0.8, 0.8), sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#d9b9a0'), envMapIntensity: envI * 0.3 }), { strength: 0.5 }),
    cushion: sh(new THREE.MeshPhysicalMaterial({ color: '#84694f', roughness: 0.8, map: tex('velvet_diff', 2, 2, true), normalMap: tex('velvet_nor', 2), normalScale: new THREE.Vector2(0.5, 0.5), sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#e8c08a'), envMapIntensity: envI })),
    rug: sh(new THREE.MeshPhysicalMaterial({ map: rugTexture(5, high ? 2048 : 1024), roughness: 1, normalMap: tex('pile_nor', 9, 10), normalScale: new THREE.Vector2(1.2, 1.2), sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color('#d9cbb6'), envMapIntensity: envI * 0.3 }), { strength: 0.5 }),
    fringe: sh(new THREE.MeshStandardMaterial({ map: fringeTexture(), alphaTest: 0.35, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0 }), { strength: 0.3 }),
    brass: sh(new THREE.MeshStandardMaterial({ color: '#b8935c', metalness: 1, roughness: 0.32, envMapIntensity: 0.85 }), { strength: 0.3 }),
    bronze: sh(new THREE.MeshStandardMaterial({ color: '#2b2622', metalness: 0.85, roughness: 0.42, envMapIntensity: 0.7 }), { strength: 0.3 }), // window frames, firebox, fittings
    cone: new THREE.MeshStandardMaterial({ color: '#0c0c0d', metalness: 0.5, roughness: 0.38, emissive: '#ffb878', emissiveIntensity: 0.12 * LV, side: THREE.DoubleSide, envMapIntensity: 0.3 }), // the downlights' anti-glare cone, with the trace of glow its lamp leaves on it
    black: new THREE.MeshStandardMaterial({ color: '#15161a', metalness: 0.85, roughness: 0.4, envMapIntensity: 0.6 }),
    stoneDark: sh(new THREE.MeshStandardMaterial({ color: '#57504a', roughness: 0.75, normalMap: tex('plaster_nor', 2), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: envI }), { worldUv: 1.5 }),
    // window glass: what lies beyond it is let through three quarters of a stop brighter (a photographer's window pull: at dusk the garden is
    // still far brighter than lamplit rooms, and an eye adapted to the room sees it so)
    glass: noGlint(high
      ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(1.7, 1.67, 1.6), roughness: 0.04, metalness: 0, transmission: 0.97, ior: 1.5, thickness: 0.01, envMapIntensity: GLASS_IN, side: THREE.DoubleSide })
      : new THREE.MeshPhysicalMaterial({ color: '#dfeaf5', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: GLASS_IN, side: THREE.DoubleSide })),
    frameGlass: noGlint(high
      ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, transmission: 0.97, ior: 1.5, thickness: 0.01, envMapIntensity: 0.35, side: THREE.DoubleSide })
      : new THREE.MeshPhysicalMaterial({ color: '#dfeaf5', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 0.5, side: THREE.DoubleSide })), // the glass over works on paper
    // a lamp shade with its lamp on: the linen glows from inside
    shade: lampShade(new THREE.MeshStandardMaterial({ color: '#d9c9ae', roughness: 1, map: tex('fabric_diff', 2, 1, true), emissive: '#ffb676', emissiveMap: tex('fabric_diff', 2, 1, true), emissiveIntensity: 1 * LAMPS, side: THREE.DoubleSide, envMapIntensity: 0 })),
    // voile: what shows through it depends on how much cloth the eye crosses (little where it faces the eye, all of it where a fold turns away)
    sheer: voile(sh(new THREE.MeshPhysicalMaterial({ color: '#efe6d6', roughness: 1, transparent: true, opacity: 0.16, side: THREE.DoubleSide, envMapIntensity: 0, depthWrite: false }), { strength: 0.3 })),
    // heavy flax linen, a shade deeper than the walls so the drapes frame the window; the weave at its own scale (a scan tile ≈ 20 cm,
    // a leaf ≈ 3.5 m of cloth by 2.3 m), the light each fold's pocket loses in the vertex colour (interior-soft.ts drape)
    drape: sh(new THREE.MeshPhysicalMaterial({ color: dye('#aa9a82', 169), vertexColors: true, roughness: 1, map: tex('fabric_diff', 17, 11.5, true), normalMap: tex('fabric_nor', 17, 11.5), normalScale: new THREE.Vector2(0.6, 0.6), sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#e9dcc6').multiplyScalar(0.5), side: THREE.DoubleSide, envMapIntensity: envI * 0.4 })),
    // the firebox: black inside, a bed of coals whose glow is light added to the dark (no flame is painted on anything)
    soot: sh(new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 0.95, envMapIntensity: 0.1 }), { strength: 0.2 }),
    fire: new THREE.MeshBasicMaterial({ map: emberTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    embers: new THREE.MeshBasicMaterial({ map: coalTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    lamp: new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffe3bd', emissiveIntensity: 6 * LV, roughness: 0.5 }),      // the lamp deep in a downlight: a point, it may bloom
    diffuser: new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffd9ad', emissiveIntensity: 2.3 * LV, roughness: 0.6, envMapIntensity: 0 }), // an opal diffuser seen from the room (pendants, the shades' undersides): bright, under the bloom's threshold, so its edge stays an edge
    opal: new THREE.MeshStandardMaterial({ color: '#111', emissive: '#fff1e2', emissiveIntensity: 1.7 * LV, roughness: 0.6, envMapIntensity: 0 }), // the grazer's diffuser: bright, under the bloom's threshold
    leaf: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: envI * 0.6 }), { strength: 0.3 }),
    pot: sh(new THREE.MeshStandardMaterial({ color: '#d8ccb8', roughness: 0.85, normalMap: tex('plaster_nor', 1), normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: envI }), { worldUv: 0.8 }),
    bark: sh(new THREE.MeshStandardMaterial({ color: '#5e5044', roughness: 0.95, envMapIntensity: envI * 0.4 }), { strength: 0.3 }),
    twig: sh(new THREE.MeshStandardMaterial({ color: '#4a3b2e', roughness: 0.9, envMapIntensity: envI * 0.4 }), { strength: 0.3 }),
    stoneware: sh(new THREE.MeshStandardMaterial({ color: '#3a322b', roughness: 0.78, normalMap: tex('plaster_nor', 1), normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: envI }), { worldUv: 0.5, strength: 0.4 }), // dark, unglazed: the jar, the bowl
    glaze: sh(new THREE.MeshPhysicalMaterial({ color: '#1b2737', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: envI + 0.3 }), { strength: 0.4 }),    // an ink-blue glaze: the lamp's foot
    date: sh(new THREE.MeshPhysicalMaterial({ color: '#34180d', roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: envI + 0.2 }), { strength: 0.3 }),
    pages: sh(new THREE.MeshStandardMaterial({ color: '#e2dbcb', roughness: 0.9, envMapIntensity: envI * 0.4 }), { strength: 0.3 }),
    canvasEdge: sh(new THREE.MeshStandardMaterial({ color: '#cfc5b2', roughness: 0.95, envMapIntensity: envI * 0.3 }), { strength: 0.3 }),
    bookInk: binding('#1e2a3d', '#c9a55a', 1), bookSand: binding('#b7a88c', '#3a2c20', 2), bookRust: binding('#7c3f28', '#e2d2b0', 3),
    ceramic: sh(new THREE.MeshPhysicalMaterial({ color: '#e9e2d6', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: envI + 0.2 })),
    book: sh(new THREE.MeshStandardMaterial({ color: '#6f5a46', roughness: 0.85, envMapIntensity: envI })),
    dark: sh(new THREE.MeshStandardMaterial({ color: '#23211f', roughness: 0.85, envMapIntensity: envI })),
    // outdoors (the porch): mapped by world position, lit by the real sun and sky, matched to the front door and the shell
    render: new THREE.MeshStandardMaterial({ color: '#cfc6b8', roughness: 0.92, normalMap: tex('plaster_nor', 4), normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 0.9 }), // exterior render, matched to the shell's baked stone
    limestone: new THREE.MeshStandardMaterial({ color: '#cbc2b1', roughness: 0.72, normalMap: tex('plaster_nor', 2), normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.8 }), // honed limestone: the garden path slabs, one stone each
    porchStone: worldMapped(new THREE.MeshStandardMaterial({ color: '#d8ccb8', roughness: 0.6, ...stoneMaps(), normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 0.6 }), 2.4),
    porchSlat: worldMapped(new THREE.MeshStandardMaterial({ color: '#a8815f', roughness: 0.52, map: tex('walnut_diff', 1, 1, true), normalMap: tex('walnut_nor', 1), roughnessMap: tex('walnut_rough', 1), normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.6 }), 0.32, true),
    porchBack: new THREE.MeshStandardMaterial({ color: '#3d3026', roughness: 0.9, envMapIntensity: 0.3 }),
    shadow: new THREE.MeshBasicMaterial({ map: contactTex(false), transparent: true, depthWrite: false, color: '#000000', opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }),
    shadowRound: new THREE.MeshBasicMaterial({ map: contactTex(true), transparent: true, depthWrite: false, color: '#000000', opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const mats: THREE.Material[] = Object.values(M); const extra: THREE.Material[] = [];
  const skyLit = new Set<THREE.Material>([M.render, M.limestone, M.porchStone, M.porchSlat, M.porchBack]); // the porch and path are lit by the sky
  if (roomEnv) for (const m of mats) { const sm = m as THREE.MeshStandardMaterial; if (sm.isMeshStandardMaterial && !skyLit.has(m)) sm.envMap = roomEnv; }
  /** A soft contact shadow on the floor under a piece of furniture (centre x/z, footprint w × d, grown by the blur). */
  const contact = (x: number, z: number, w: number, d: number, round = false, opacity?: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w / 0.6, d / 0.6).rotateX(-Math.PI / 2).translate(x, F + 0.006, z), round ? M.shadowRound : M.shadow);
    if (opacity !== undefined) { m.material = (m.material as THREE.MeshBasicMaterial).clone(); (m.material as THREE.MeshBasicMaterial).opacity = opacity; mats.push(m.material as THREE.MeshBasicMaterial); }
    m.renderOrder = 2; group.add(m);
  };
  /** Fabric that hangs from a track breathes: the hem drifts a few centimetres on the air of the room (loop-safe rates). */
  const breathe = (m: THREE.Material, amp: number, key: string) => {
    const prev = m.onBeforeCompile; m.onBeforeCompile = (shd, r) => { prev?.call(m, shd, r); shd.uniforms.uTime = uTime;
      shd.vertexShader = 'uniform float uTime;\n' + shd.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float hang = 1.0 - uv.y; float w = sin(uTime * 1.0 + position.z * 3.0 + position.x * 2.0) * 0.7 + sin(uTime * 2.0 + position.z * 7.0) * 0.3; transformed.x += w * hang * ${amp.toFixed(3)}; transformed.z += w * hang * ${(amp * 0.6).toFixed(3)}; }`); };
    const k = m.customProgramCacheKey; m.customProgramCacheKey = () => (k ? k.call(m) : '') + key;
  };
  breathe(M.sheer, 0.02, '-breathe-sheer'); breathe(M.drape, 0.008, '-breathe-drape');
  /** dev (?nan): names the geometry that carries a normal of no length or a position that is not a number (neither can be lit: it renders as black slivers) */
  const audit = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], who = '') => {
    const n = geo.attributes.normal as THREE.BufferAttribute | undefined, p = geo.attributes.position as THREE.BufferAttribute | undefined; if (!p) return; let bad = 0, nan = 0, at = '';
    for (let i = 0; i < p.count; i++) { if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) { nan++; continue; } if (n && !(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > 0.5)) { if (!bad) at = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(3)).join(','); bad++; } }
    if (bad || nan || !n) console.warn(`[interior] audit ${who}: ${p.count} vertices, ${nan} not a number, ${n ? bad : 'all'} without a normal (first at ${at}); material #${(mat as THREE.MeshStandardMaterial).color?.getHexString?.()} ${geo.type}`);
  };
  let target: THREE.Object3D = group;
  // the renderer gives an object the probe volume its origin lies in: indoor pieces are built in world coordinates, so their origin
  // moves to the middle of the house (the geometry moves back by as much); what stands outdoors keeps its origin on the threshold
  const HOME = new THREE.Vector3(0.6, 1.8, -3.2); let indoors = true;
  const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, cast = true, recv = true) => { if (!geo) return null; if (q.has('nan')) audit(geo, mat); const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; if (indoors && target === group) { geo.translate(-HOME.x, -HOME.y, -HOME.z); m.position.copy(HOME); } target.add(m); return m; };
  const merge = (list: THREE.BufferGeometry[]) => (list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false) : null);

  /* ---------- floor and ceilings ---------- */
  const eps = 0.001;
  add(merge([quad(plan.x0, plan.x1, plan.z0, plan.z1, F + eps, 2.4), quad(W.x0, W.x1, W.z0, W.z1 + 0.02, F + eps, 2.4)]), M.floor, false);
  add(merge([quad(plan.x0, plan.x1, plan.z0, plan.z1, S - 0.06, 1, false), quad(W.x0, W.x1, W.z0, W.z1, S - 0.06, 1, false)]), M.ceiling, false); // the structural slab: only the cove troughs show it (1 cm under the shell's cut at 3.4)
  // light the architecture, not the floor: the walls carry the rooms (scallops, coves, the grazer), the pools only ground what stands in them
  // (dusk: the pools are half of what they were and narrower, the scallops keep their strength: a wall's brightest place is inside one)
  const downs: Down[] = [
    { x: 0.7, z: -1.0, i: 5.5, angle: 0.55, shadow: true },                           // the hall: a pool inside the front door
    { x: 0.2, z: -1.2, i: 5, aim: [W.x0, F + 1.3, -1.2], angle: 0.55 },                // … and a scallop down the walnut
    { x: 2.65, z: -1.0, i: 4.5, angle: 0.55 },                                        // the inner hallway
    { x: 3.2, z: -0.95, i: 3.5, aim: [W.x1, F + 1.4, -0.95], angle: 0.6 },             // the painting's wall
    { x: 3.55, z: -2.4, i: 9, aim: [plan.x1, F + 0.7, -2.4], angle: 0.7 },             // a soft scallop down the hallway wall over the light switch
    { x: 2.75, z: -2.75, i: 4.5, angle: 0.55 },
    { x: 0.75, z: -2.55, i: 3.5, angle: 0.55 },                                       // the clear floor in front of the panel wall
    { x: -1.7, z: -4.4, i: 8, angle: 0.62, shadow: true },                            // the sofa's seat and the table in front of it
    { x: 0.6, z: -5.4, i: 5, angle: 0.6 },                                            // the armchair
    { x: -0.5, z: -2.45, i: 4, angle: 0.5 },                                          // the jar of branches
    { x: -2.5, z: -6.5, i: 6.5, aim: [-2.5, F + 0.9, plan.z0], angle: 0.5 }, { x: -1.3, z: -6.5, i: 6.5, aim: [-1.3, F + 0.9, plan.z0], angle: 0.5 }, { x: -0.1, z: -6.5, i: 6.5, aim: [-0.1, F + 0.9, plan.z0], angle: 0.5 }, // scallops down the hearth wall
    { x: 1.2, z: -6.2, i: 6, angle: 0.6 },                                            // the majlis seat
    { x: -2.35, z: -2.45, i: 5, angle: 0.55 },                                        // the olive tree
    { x: -2.72, z: -2.47, i: 7, aim: [plan.x0, F + 0.8, -2.47], angle: 0.42, shadow: true }, // a scallop down the fluted walnut behind it (the olive's shadow on the reeds)
    { x: 3.55, z: -5.0, i: 6, aim: [plan.x1, F + 1.0, -5.0], angle: 0.6 },             // the kitchen counter
    { x: -2.75, z: -6.45, i: 5, aim: [plan.x0, F + 1.2, -6.45], angle: 0.55 }, { x: -2.75, z: -3.1, i: 5, aim: [plan.x0, F + 1.2, -3.1], angle: 0.55 }, // the gathered drapes
  ];
  { // the dropped ceiling: one plate with a cove trough all round, a slot over the panel wall and a hole for every downlight
    const plate = new THREE.Shape([[MX0, MZ0], [MX1, MZ0], [MX1, MZ1], [WX1, MZ1], [WX1, WZ1], [WX0, WZ1], [WX0, MZ1], [MX0, MZ1]].map(([x, z]) => new THREE.Vector2(x, z)));
    plate.holes.push(new THREE.Path([[slot.x0, slot.z0], [slot.x1, slot.z0], [slot.x1, slot.z1], [slot.x0, slot.z1]].map(([x, z]) => new THREE.Vector2(x, z))));
    for (const d of downs) plate.holes.push(new THREE.Path().absarc(d.x, d.z, 0.037, 0, Math.PI * 2, true));
    add(new THREE.ExtrudeGeometry(plate, { depth: DROP, bevelEnabled: false, curveSegments: 20 }).rotateX(Math.PI / 2).translate(0, CY + DROP, 0), M.ceiling, false);
    // the slot: an opal diffuser 15 mm up in it (a calm line of light; what the eye finds is the wall it washes), the housing behind it
    add(quad(slot.x0, slot.x1, slot.z0, slot.z1, CY + 0.015, 1, false), M.opal, false, false);
    add(merge([slab(slot.x0 - 0.012, slot.x0, CY + DROP, CY + 0.3, slot.z0 - 0.012, slot.z1 + 0.012), slab(slot.x0 - 0.012, slot.x1, CY + 0.3, CY + 0.312, slot.z0 - 0.012, slot.z1 + 0.012), slab(slot.x0, slot.x1, CY + DROP, CY + 0.3, slot.z0 - 0.012, slot.z0), slab(slot.x0, slot.x1, CY + DROP, CY + 0.3, slot.z1, slot.z1 + 0.012)]), M.ceiling, false);
    // trimless downlights: a dark anti-glare cone set into the plaster, the lamp small and deep inside it
    add(merge(downs.map((d) => new THREE.CylinderGeometry(0.017, 0.036, DROP, 28, 1, true).translate(d.x, CY + DROP / 2, d.z))), M.cone, false, false);
    add(merge(downs.map((d) => new THREE.CircleGeometry(0.017, 20).rotateX(Math.PI / 2).translate(d.x, CY + DROP - 0.001, d.z))), M.lamp, false, false);
  }

  /* ---------- walls ---------- */
  type Hole = { a0: number; a1: number; y0: number; y1: number };
  const walls: THREE.BufferGeometry[] = [], feet: THREE.BufferGeometry[] = [], skirts: THREE.BufferGeometry[] = [];
  /** One straight piece of wall between two corners of the plan. `faces` names its room sides ('x-' = the face at x0, …): there the
   *  foot of the wall steps back by the shadow gap and a skirting board stands in front of it, flush with the plaster above. */
  const piece = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, faces: string) => {
    const top = F + SK + GAP, has = (k: string) => faces.includes(k);
    if (y0 > F + 0.001 || !faces) { walls.push(slab(x0, x1, y0, y1, z0, z1)); return; }
    feet.push(slab(x0 + (has('x-') ? GAP : 0), x1 - (has('x+') ? GAP : 0), y0, Math.min(top, y1), z0 + (has('z-') ? GAP : 0), z1 - (has('z+') ? GAP : 0)));
    if (y1 > top) walls.push(slab(x0, x1, top, y1, z0, z1));
    if (has('x-')) skirts.push(slab(x0, x0 + GAP, F, F + SK, z0, z1)); if (has('x+')) skirts.push(slab(x1 - GAP, x1, F, F + SK, z0, z1));
    if (has('z-')) skirts.push(slab(x0, x1, F, F + SK, z0, z0 + GAP)); if (has('z+')) skirts.push(slab(x0, x1, F, F + SK, z1 - GAP, z1));
  };
  const wallX = (x: number, z0: number, z1: number, out: 1 | -1, holes: Hole[] = [], faces = out > 0 ? 'x-' : 'x+') => { // wall along z at x, thickness outward
    const xa = out > 0 ? x : x - t, xb = out > 0 ? x + t : x; let cur = z0;
    for (const h of [...holes].sort((p, r) => p.a0 - r.a0)) { if (h.a0 > cur) piece(xa, xb, cur, h.a0, F - 0.02, S, faces); if (h.y0 > F) piece(xa, xb, h.a0, h.a1, F - 0.02, h.y0, faces); piece(xa, xb, h.a0, h.a1, h.y1, S, ''); cur = h.a1; }
    if (cur < z1) piece(xa, xb, cur, z1, F - 0.02, S, faces);
  };
  const wallZ = (z: number, x0: number, x1: number, out: 1 | -1, holes: Hole[] = [], faces = out > 0 ? 'z-' : 'z+') => {
    const za = out > 0 ? z : z - t, zb = out > 0 ? z + t : z; let cur = x0;
    for (const h of [...holes].sort((p, r) => p.a0 - r.a0)) { if (h.a0 > cur) piece(cur, h.a0, za, zb, F - 0.02, S, faces); if (h.y0 > F) piece(h.a0, h.a1, za, zb, F - 0.02, h.y0, faces); piece(h.a0, h.a1, za, zb, h.y1, S, ''); cur = h.a1; }
    if (cur < x1) piece(cur, x1, za, zb, F - 0.02, S, faces);
  };
  const winOn = (face: Win['face'], at: number) => windows.filter((w) => w.face === face && Math.abs(w.at - at) < 0.05).map((w) => ({ a0: Math.min(w.a0, w.a1), a1: Math.max(w.a0, w.a1), y0: w.y0, y1: w.y1 }));
  wallX(plan.x0, plan.z0, plan.z1, -1, winOn('-x', plan.x0));                       // west
  wallX(plan.x1, plan.z0, plan.z1 + t, 1, winOn('+x', plan.x1));                    // east (main)
  wallZ(plan.z0, plan.x0 - t, plan.x1 + t, -1, [...winOn('-z', plan.z0), { a0: plan.x0 + 0.66, a1: plan.x0 + 3.04, y0: F + 0.36, y1: F + 0.66 }]); // back, with the firebox let into it
  const frontZ = plan.z1 - 0.012; // the shell is cut in the plane z = plan.z1 and its torn edges reach a few millimetres past it: the front walls' faces stand 12 mm before it
  wallZ(frontZ, plan.x0 - t, W.x0, 1, winOn('+z', plan.z1));                       // front of the living room (left of the wing)
  wallX(W.x0, plan.z1, W.z1 + t, -1, [], '');                                        // wing west: behind the walnut panelling
  wallX(W.x1, plan.z1, W.z1 + t, 1);                                                 // wing east: the painting's wall
  wallZ(W.z1, W.x0 - t, W.x1 + t, 1, [{ a0: -DOOR.hole, a1: DOOR.hole, y0: F - 0.02, y1: F + DOOR.top }]); // wing front with the door opening
  if (plan.x1 > W.x1) wallZ(frontZ, W.x1, plan.x1 + t, 1);                          // front, right of the wing
  // the partition: the pier (its west face is clad in stone), the header over the portal, the stub beside the front door
  piece(px0, px1, zS, zN, F - 0.02, S, 'x+');
  piece(px0, px1, zN, OPEN.z1 + LINING + REVEAL, F + OPEN.h + LINING + REVEAL, S, '');
  piece(px0, px1, OPEN.z1 + LINING + REVEAL, W.z1 + 0.02, F - 0.02, S, 'x+');
  add(merge(walls), M.plaster); add(merge(feet), M.gap, false); add(merge(skirts), M.skirt, false);

  /* ---------- windows: frame, mullions, reveal, glass ---------- */
  const frames: THREE.BufferGeometry[] = [], reveals: THREE.BufferGeometry[] = [], sills: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  for (const w of windows) {
    const a0 = Math.min(w.a0, w.a1), a1 = Math.max(w.a0, w.a1), fw = 0.06, fd = 0.1, depth = DEPTH;
    const alongX = w.face[1] === 'z'; const sgn = w.face[0] === '+' ? 1 : -1;
    const place = (g: THREE.BufferGeometry, a: number, y: number, n: number) => { // a along the wall, n outward normal offset
      if (alongX) g.translate(a, y, w.at + n * sgn); else { g.rotateY(Math.PI / 2); g.translate(w.at + n * sgn, y, a); }
      return g;
    };
    const L = a1 - a0, H = w.y1 - w.y0, cy = (w.y0 + w.y1) / 2, ca = (a0 + a1) / 2;
    frames.push(place(new THREE.BoxGeometry(L, fw, fd), ca, w.y0 + fw / 2, depth * 0.55), place(new THREE.BoxGeometry(L, fw, fd), ca, w.y1 - fw / 2, depth * 0.55), place(new THREE.BoxGeometry(fw, H, fd), a0 + fw / 2, cy, depth * 0.55), place(new THREE.BoxGeometry(fw, H, fd), a1 - fw / 2, cy, depth * 0.55));
    const n = w.mullions ?? 0; for (let i = 1; i <= n; i++) frames.push(place(new THREE.BoxGeometry(0.04, H, fd), a0 + (L * i) / (n + 1), cy, depth * 0.55));
    reveals.push(place(new THREE.BoxGeometry(L + 0.02, 0.02, depth), ca, w.y0 - 0.01, depth / 2), place(new THREE.BoxGeometry(L + 0.02, 0.02, depth), ca, w.y1 + 0.01, depth / 2), place(new THREE.BoxGeometry(0.02, H + 0.04, depth), a0 - 0.01, cy, depth / 2), place(new THREE.BoxGeometry(0.02, H + 0.04, depth), a1 + 0.01, cy, depth / 2));
    glass.push(place(new THREE.PlaneGeometry(L - fw, H - fw), ca, cy, depth * 0.55));
    sills.push(place(new THREE.BoxGeometry(L + 0.16, 0.035, 0.12), ca, w.y0 - 0.0175, -0.06)); // a stone sill
  }
  // the frames and glazing bars throw their shadows analytically (interior-surface.ts): thinner than three shadow texels, the map would only smear them
  add(merge(frames), M.bronze, false); add(merge(reveals), M.plaster); add(merge(sills), M.stoneW, false); const glassMesh = add(merge(glass), M.glass, false, false); if (glassMesh) glassMesh.renderOrder = 5;

  /* ---------- the portal hall → hallway: a walnut lining with a shadow reveal ---------- */
  const lx0 = faceX - 0.002, lx1 = px1 + 0.008; // the lining stands 2 mm proud of the stone, 8 mm proud of the plaster
  add(merge([slab(lx0, lx1, F, F + OPEN.h, OPEN.z0 - LINING, OPEN.z0), slab(lx0, lx1, F, F + OPEN.h, OPEN.z1, OPEN.z1 + LINING)]), M.walnut);
  add(slab(lx0, lx1, F + OPEN.h, F + OPEN.h + LINING, OPEN.z0 - LINING, OPEN.z1 + LINING), M.walnutAlong);
  add(merge([slab(px0, px1 - 0.02, F, F + OPEN.h + LINING + REVEAL, zN, zN + REVEAL), slab(px0, px1 - 0.02, F, F + OPEN.h + LINING + REVEAL, OPEN.z1 + LINING, OPEN.z1 + LINING + REVEAL), slab(px0, px1 - 0.02, F + OPEN.h + LINING, F + OPEN.h + LINING + REVEAL, zN, OPEN.z1 + LINING + REVEAL)]), M.gap, false); // the back of the reveal

  /* ---------- the front door from the hall: a walnut casing, lining and architrave in one piece ---------- */
  {
    const zf = W.z1 - DOOR.proud, zb = W.z1 + DOOR.sunk, x0 = W.x0 + 0.028, x1 = DOOR.face, top = F + DOOR.head; // the architrave stands 18 mm proud of the plaster and is let 3 mm into it
    // the jamb on the pier's side: the lining covers the wall's thickness up to the steel frame, the architrave laps the plaster by 4 cm
    add(profile([[x1, DOOR.end], [x1 + 0.02, DOOR.end], [x1 + 0.02, zb], [x1 + DOOR.arch, zb], [x1 + DOOR.arch, zf], [x1, zf]], 'y', F, top), M.walnut);
    // the jamb on the panelled side: a board on the wall, 4 mm proud of the panels, parted from them by a 2 mm joint
    add(slab(W.x0 - 0.003, x0, F, top, zf, DOOR.end), M.walnut);
    // the head, over both
    add(profile([[DOOR.end, top], [zf, top], [zf, top + DOOR.arch], [zb, top + DOOR.arch], [zb, top + 0.02], [DOOR.end, top + 0.02]], 'x', W.x0 - 0.003, x1 + DOOR.arch), M.walnutAlong);
  }

  /* ---------- the panel wall: honed stone in book-matched slabs, brass inlays, a grazer in the ceiling slot ---------- */
  {
    const top = S - 0.03, foot = F + 0.015; // the stone floats 15 mm over the floor and runs up into the slot, where its top is out of sight
    /** One slab, mapped so the veins stand upright and every slab mirrors its neighbour across their joint (book-matching). */
    const slabs: THREE.BufferGeometry[] = []; let mirror = 1, v0 = 0.13;
    const stoneSlab = (z0: number, z1: number, y0: number, y1: number) => { // z0 > z1: slabs are laid from the portal toward the living room
      const g = slab(faceX, px0, y0, y1, z0, z1).toNonIndexed(), p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getY(i) / 2.4, v0 + mirror * (z0 - p.getZ(i)) / 2.4);
      v0 += mirror * (z0 - z1) / 2.4; mirror = -mirror; slabs.push(g);
    };
    const edges = [zN, ...INLAYS, zS];
    for (let i = 0; i < edges.length - 1; i++) stoneSlab(edges[i] - (i ? INLAY / 2 : 0), edges[i + 1] + (i < edges.length - 2 ? INLAY / 2 : 0), foot, top);
    mirror = 1; v0 = 0.61; stoneSlab(OPEN.z1 + LINING + REVEAL, zN, F + OPEN.h + LINING + REVEAL, top);   // the lintel over the portal
    mirror = -1; v0 = 0.37; stoneSlab(W.z1, OPEN.z1 + LINING + REVEAL, foot, top);                          // the strip between the portal and the front door
    add(merge(slabs), M.stone);
    add(merge(INLAYS.map((z) => slab(faceX + 0.001, px0, foot, top, z - INLAY / 2, z + INLAY / 2))), M.brass, false);
    add(slab(faceX + 0.012, px0, F, foot, zS, W.z1), M.gap, false);
    add(slab(lx0, lx1, F, CY, zS - 0.04, zS), M.walnut);                                                     // the pier's free end: a walnut blade closes the stone
  }

  /* ---------- the hall's west wall: smoked walnut panels on a dark ground ---------- */
  {
    const z0 = plan.z1 + 0.02, z1 = W.z1 - 0.02, n = 3, joint = 0.006, w = (z1 - z0 - joint * (n - 1)) / n, x = W.x0;
    add(slab(x, x + 0.008, F, S - 0.03, z0, z1), M.gap, false);
    add(merge(Array.from({ length: n }, (_, i) => slab(x + 0.008, x + 0.026, F + 0.06, S - 0.03, z0 + i * (w + joint), z0 + i * (w + joint) + w))), M.walnut);
  }

  /* ---------- the living room's feature: a floor-to-ceiling fluted walnut panel on the west wall, behind the olive tree ---------- */
  { // 30 mm reeds, 7 mm proud, on a 12 mm ground; each reed its own strip (the groove between two stays a crisp line). It stands on a
    // shadow gap over the floor and runs up into the cove trough, where the cove's light catches its top. Parted from the plaster by a
    // 10 mm dark reveal at both ends. Lit by its own scallop from the ceiling
    const x = plan.x0, z0 = -3.04, z1 = -1.92, base = 0.012, depth = 0.007, y0 = F + 0.012, y1 = S - 0.07, reed = 0.03, n = Math.round((z1 - z0) / reed), w = (z1 - z0) / n, seg = 10;
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (let r = 0; r < n; r++) {
      const k0 = pos.length / 3;
      for (let i = 0; i <= seg; i++) {
        const s = i / seg, a = Math.PI * s, z = z0 + (r + s) * w, dx = base + depth * Math.sin(a), slope = depth * Math.PI * Math.cos(a) / w; // d(x)/d(z)
        const nl = Math.hypot(1, slope);
        for (const y of [y0, y1]) { pos.push(x + dx, y, z); nor.push(1 / nl, 0, -slope / nl); }
      }
      for (let i = 0; i < seg; i++) { const a = k0 + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2)); g.setIndex(idx);
    // (winding: the faces must look toward +x; flip if three sees them from behind)
    { const a = new THREE.Vector3(...pos.slice(0, 3)), b = new THREE.Vector3(...pos.slice(6, 9)), c = new THREE.Vector3(...pos.slice(3, 6)); if (b.sub(a).cross(c.sub(a)).x < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); } }
    add(g, M.walnut);
    add(merge([slab(x, x + base + depth, y0, y1, z0 - 0.012, z0), slab(x, x + base + depth, y0, y1, z1, z1 + 0.012)]), M.walnut);            // the end boards
    add(merge([slab(x, x + 0.004, F, y1, z0 - 0.022, z0 - 0.012), slab(x, x + 0.004, F, y1, z1 + 0.012, z1 + 0.022), slab(x, x + base, F, y0, z0 - 0.012, z1 + 0.012)]), M.gap, false); // the reveals and the shadow gap under it
  }

  const kx1r = plan.x1; // the east wall
  /* ---------- living room ---------- */
  // the hearth wall: floor-to-ceiling stone round a long firebox let into the wall, a floating bench under it
  const fx0 = plan.x0 + 0.3, fx1 = plan.x0 + 3.4, nx0 = fx0 + 0.36, nx1 = fx1 - 0.36, ny0 = F + 0.36, ny1 = F + 0.66, nzb = plan.z0 - 0.125, nzf = plan.z0 + 0.06; // the niche: 18 cm deep behind the stone's face
  add(merge([slab(fx0, nx0, F, S - 0.03, plan.z0, nzf), slab(nx1, fx1, F, S - 0.03, plan.z0, nzf), slab(nx0, nx1, F, ny0, plan.z0, nzf), slab(nx0, nx1, ny1, S - 0.03, plan.z0, nzf)]), M.hearth);
  add(merge([slab(nx0 - 0.03, nx0, ny0 - 0.03, ny1 + 0.03, nzf, nzf + 0.012), slab(nx1, nx1 + 0.03, ny0 - 0.03, ny1 + 0.03, nzf, nzf + 0.012), slab(nx0, nx1, ny0 - 0.03, ny0, nzf, nzf + 0.012), slab(nx0, nx1, ny1, ny1 + 0.03, nzf, nzf + 0.012)]), M.bronze, false); // a bronze trim round the opening
  // the firebox itself: black. A 3 mm liner standing inside the opening, so each of its four inner planes is the liner's alone (built
  // in the planes of the wall's hole and the stone's opening, the three surfaces fought for every pixel as the lens moved: a flicker)
  const LN = 0.003;
  add(merge([slab(nx0, nx1, ny0, ny1, nzb - 0.01, nzb), slab(nx0, nx1, ny0, ny0 + LN, nzb, nzf), slab(nx0, nx1, ny1 - LN, ny1, nzb, nzf), slab(nx0, nx0 + LN, ny0 + LN, ny1 - LN, nzb, nzf), slab(nx1 - LN, nx1, ny0 + LN, ny1 - LN, nzb, nzf)]), M.soot, false);
  { // a bed of coals along it, their glow between them, and a low lick of flame over the bed (it breathes; nothing dances)
    const rnd = seeded(61), coals: THREE.BufferGeometry[] = [];
    for (let x = nx0 + 0.03; x < nx1 - 0.03; x += 0.035 + rnd() * 0.03) { const r = 0.014 + rnd() * 0.016; coals.push(new THREE.IcosahedronGeometry(r, 0).rotateX(rnd() * 3).rotateY(rnd() * 3).scale(1.3, 0.8, 1).translate(x, ny0 + LN + r * 0.6, nzb + 0.05 + rnd() * 0.09)); }
    add(merge(coals), M.soot, false, false);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(nx1 - nx0 - LN * 2, nzf - nzb - 0.03).rotateX(-Math.PI / 2).translate((nx0 + nx1) / 2, ny0 + LN + 0.006, (nzb + nzf) / 2 - 0.005), M.embers); bed.renderOrder = 3; group.add(bed);
    const lick = new THREE.Mesh(new THREE.PlaneGeometry(nx1 - nx0, ny1 - ny0).translate((nx0 + nx1) / 2, (ny0 + ny1) / 2, nzb + 0.06), M.fire); lick.renderOrder = 4; group.add(lick);
  }
  add(slab(fx0 - 0.05, fx1 + 0.05, F + 0.18, F + 0.24, plan.z0, plan.z0 + 0.42), M.stoneW);                                // floating hearth bench
  contact((fx0 + fx1) / 2, plan.z0 + 0.25, fx1 - fx0, 0.45, false, 0.35);

  /* Upholstery. Every piece is built about its own middle (length along x, the back toward −z, the floor at y = 0), then turned and set in the room. */
  const seg = (n: number) => Math.max(10, Math.round(n * (high ? 1 : 0.6)));
  const hsh = (n: number) => { const s = Math.sin(n * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); };
  type Piece = Record<'plinth' | 'cover' | 'welt', THREE.BufferGeometry[]>;
  const weltOf = (c: { welt: THREE.BufferGeometry | null }, f: (g: THREE.BufferGeometry) => THREE.BufferGeometry, into: THREE.BufferGeometry[]) => { if (c.welt) into.push(f(c.welt)); };
  /** A low, deep sofa: a plinth set back under it, a tight-covered base, back and arms, loose seat cushions with a crown, loose back cushions that lean and slump. */
  const sofa = (len: number, depth: number, o: { seats: number; arms: [boolean, boolean]; seed: number; backH?: number; baseH?: number; seatT?: number; backs?: boolean }): Piece & { top: number; seat: number } => {
    const out: Piece = { plinth: [], cover: [], welt: [] }, P = 0.06, B = o.baseH ?? 0.2, top = P + B, aw = 0.16, bt = 0.16, backH = o.backH ?? 0.44, armH = 0.33, st = o.seatT ?? 0.17;
    out.plinth.push(slab(-len / 2 + 0.06, len / 2 - 0.06, 0, P, -depth / 2 + 0.06, depth / 2 - 0.06));
    const tight = (w: number, h: number, d: number, x: number, y: number, z: number, seed: number) => out.cover.push(cushion(w, h, d, { r: 0.04, crown: 0.006, belly: 0.004, slack: 0.002, welt: 0, seed, seg: seg(22) }).body.translate(x, y, z));
    const x0 = -len / 2 + (o.arms[0] ? aw : 0), x1 = len / 2 - (o.arms[1] ? aw : 0);
    tight(len, B, depth, 0, P + B / 2, 0, o.seed);
    tight(x1 - x0 + 0.03, backH, bt, (x0 + x1) / 2, top + backH / 2 - 0.02, -depth / 2 + bt / 2, o.seed + 1);
    if (o.arms[0]) tight(aw, armH, depth, -len / 2 + aw / 2, top + armH / 2 - 0.02, 0, o.seed + 2);
    if (o.arms[1]) tight(aw, armH, depth, len / 2 - aw / 2, top + armH / 2 - 0.02, 0, o.seed + 3);
    const sw = (x1 - x0 - 0.008 * (o.seats - 1)) / o.seats, sd = depth - bt + 0.02;
    for (let i = 0; i < o.seats; i++) {
      const x = x0 + sw / 2 + i * (sw + 0.008), s = o.seed + 10 + i * 3, tilt = (hsh(s) - 0.5) * 0.02;
      const seat = cushion(sw, st, sd, { r: 0.05, crown: 0.03, belly: 0.016, slack: 0.005, sag: 0.016 + 0.01 * hsh(s + 5), seed: s, seg: seg(28) }), sAt = (g: THREE.BufferGeometry) => g.rotateZ(tilt).translate(x, top + st / 2 - 0.004, -depth / 2 + bt + sd / 2);
      out.cover.push(sAt(seat.body)); weltOf(seat, sAt, out.welt);
      if (o.backs === false) continue;
      // the back cushion stands on the seat and leans into the back: its crowned face to the room, its belly low
      const bw = sw - 0.03, bh = 0.47, bd = 0.2, lean = 0.2 + (hsh(s + 1) - 0.5) * 0.06, zb = -depth / 2 + bt + bd / 2 + bh * Math.sin(lean) - 0.01;
      const back = cushion(bw, bd, bh, { r: 0.075, crown: 0.045, belly: 0.03, slack: 0.008, seed: s + 1, seg: seg(24) });
      const bAt = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2 - lean).rotateZ((hsh(s + 2) - 0.5) * 0.04).translate(x + (hsh(s + 3) - 0.5) * 0.02, top + st + (bh / 2) * Math.cos(lean) - 0.012, zb - (bh / 2) * Math.sin(lean));
      out.cover.push(bAt(back.body)); weltOf(back, bAt, out.welt);
    }
    return { ...out, top, seat: top + st };
  };
  /** A scatter cushion leaning back on a seat: where its foot stands (x, z), the seat's height, how far it leans and how it is turned. */
  const scatter = (w: number, h: number, d: number, at: [number, number, number], lean: number, turn: number, o: { seed: number; chop?: number; uv?: boolean }) => {
    const c = pillow(w, h, d, { seed: o.seed, chop: o.chop ?? 0.5, seg: seg(20), uv: o.uv }), f = (g: THREE.BufferGeometry) => g.rotateZ((hsh(o.seed) - 0.5) * 0.12).rotateX(-lean).rotateY(turn).translate(at[0] - (h / 2) * Math.sin(lean) * Math.sin(turn), at[1] + (h / 2) * Math.cos(lean) - 0.015, at[2] - (h / 2) * Math.sin(lean) * Math.cos(turn));
    return { body: f(c.body), welt: c.welt ? f(c.welt) : null };
  };
  const covers = { boucle: [] as THREE.BufferGeometry[], linen: [] as THREE.BufferGeometry[], ink: [] as THREE.BufferGeometry[], rust: [] as THREE.BufferGeometry[], olive: [] as THREE.BufferGeometry[], sadu: [] as THREE.BufferGeometry[], throws: [] as THREE.BufferGeometry[], plinth: [] as THREE.BufferGeometry[] };
  const sx = -2.37, sz = -4.8, SL = 2.4, SD = 1.0; // the sofa stands under the west window and looks into the room (its own x runs south, its z east)
  const inRoom = (g: THREE.BufferGeometry, ry: number, x: number, z: number) => g.rotateY(ry).translate(x, F, z);
  {
    const s = sofa(SL, SD, { seats: 2, arms: [true, true], seed: 11 }), here = (g: THREE.BufferGeometry) => inRoom(g, Math.PI / 2, sx, sz);
    covers.plinth.push(...s.plinth.map(here)); covers.boucle.push(...s.cover.map(here), ...s.welt.map(here));
    const put = (into: THREE.BufferGeometry[], c: { body: THREE.BufferGeometry; welt: THREE.BufferGeometry | null }, welts = into) => { into.push(here(c.body)); if (c.welt) welts.push(here(c.welt)); };
    // south end: a large ink cushion in the corner, a rust one in front of it; north end: an olive one and a sadu bolster
    put(covers.ink, scatter(0.54, 0.54, 0.17, [0.84, s.seat, 0.12], 0.34, -0.3, { seed: 3, chop: 0.7 }));
    put(covers.rust, scatter(0.45, 0.45, 0.15, [0.55, s.seat, 0.2], 0.4, -0.12, { seed: 4, chop: 0.5 }));
    put(covers.olive, scatter(0.5, 0.5, 0.16, [-0.72, s.seat, 0.11], 0.33, 0.26, { seed: 5, chop: 0.6 }));
    put(covers.sadu, scatter(0.6, 0.3, 0.13, [-0.42, s.seat, 0.23], 0.42, 0.1, { seed: 6, chop: 0, uv: true }), covers.ink);
    // a wool throw folded over the north arm: up its inside from the seat, over the top, down its outside (the path follows the
    // arm's round edges a few millimetres off the cover)
    const xo = -SL / 2, xi = xo + 0.16, ay = s.top - 0.02 + 0.33;
    covers.throws.push(here(band([[xi + 0.07, s.seat + 0.012], [xi + 0.012, s.seat + 0.035], [xi + 0.004, ay - 0.06], [xi - 0.009, ay - 0.009], [xo + 0.08, ay + 0.009], [xo + 0.009, ay - 0.009], [xo - 0.004, ay - 0.07], [xo - 0.006, ay - 0.22], [xo - 0.008, ay - 0.37]].map(([x, y]) => new THREE.Vector3(x, y, 0.24)), new THREE.Vector3(0, 0, -1), 0.4, 0.03, { layers: 3, seed: 8, seg: seg(56) })));
  }
  // the majlis along the back wall: a low seat with a mattress, cushions against the wall and a bolster at each end
  const mx = 1.25, mz = plan.z0 + 0.46, ML = 1.6, MD = 0.8;
  {
    const m = sofa(ML, MD, { seats: 1, arms: [false, false], seed: 31, backH: 0.2, baseH: 0.14, seatT: 0.15, backs: false }), here = (g: THREE.BufferGeometry) => inRoom(g, 0, mx, mz);
    covers.plinth.push(...m.plinth.map(here)); covers.linen.push(...m.cover.map(here), ...m.welt.map(here));
    for (let i = 0; i < 3; i++) { const c = scatter(0.5, 0.42, 0.15, [-0.52 + i * 0.52, m.seat, -0.1], 0.28, (hsh(i + 40) - 0.5) * 0.1, { seed: 40 + i, chop: 0.3 }); covers.linen.push(here(c.body)); if (c.welt) covers.linen.push(here(c.welt)); }
    for (const sgn of [-1, 1]) { const b = new THREE.CapsuleGeometry(0.1, 0.4, 8, 20).rotateX(Math.PI / 2).scale(1, 0.9, 1).translate(sgn * (ML / 2 - 0.12), m.seat + 0.088, 0.1); b.deleteAttribute('uv'); covers.rust.push(here(b)); }
    { const c = scatter(0.56, 0.28, 0.12, [0.1, m.seat, 0.12], 0.45, -0.08, { seed: 44, chop: 0, uv: true }); covers.sadu.push(here(c.body)); if (c.welt) covers.ink.push(here(c.welt)); }
  }
  add(merge(covers.plinth), M.dark, false); add(merge(covers.boucle), M.boucle); add(merge(covers.linen), M.fabric); add(merge(covers.ink), M.ink); add(merge(covers.rust), M.rust); add(merge(covers.olive), M.olive); add(merge(covers.sadu), M.sadu); add(merge(covers.throws), M.throw);

  // the rug: hand-knotted wool, 14 mm deep, never quite flat nor square; its warp ends left as a fringe at both ends
  const rug = { x0: -2.3, x1: 0.35, z0: -6.25, z1: -3.35 };
  {
    const n = 28, w = rug.x1 - rug.x0, d = rug.z1 - rug.z0, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    // (the outermost ring of the grid is the rug's edge, turned down to the floor 6 mm outside the last knots)
    const ring = (i: number) => (i === 0 ? 0 : i === n ? 1 : (i - 1) / (n - 2)), rim = (i: number) => (i === 0 ? -0.006 : i === n ? 0.006 : 0);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const u = ring(i), v = ring(j), edge = i === 0 || i === n || j === 0 || j === n;
      pos.push(rug.x0 + u * w + rim(i) + 0.012 * noise2(v * 3.1, 1.7, 5) * (1 - Math.min(1, Math.min(u, 1 - u) * 6)), F + (edge ? 0.001 : 0.014 + 0.003 * noise2(u * 7, v * 7, 9)), rug.z0 + v * d + rim(j) + 0.012 * noise2(u * 3.1, 8.3, 6) * (1 - Math.min(1, Math.min(v, 1 - v) * 6))); uv.push(u, v); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    add(g, M.rug, false);
    const fr = (z: number, out: number) => { const q = new THREE.PlaneGeometry(w - 0.04, 0.075).rotateX(-Math.PI / 2); if (out < 0) q.rotateY(Math.PI); return q.translate((rug.x0 + rug.x1) / 2, F + 0.004, z + out * 0.036); };
    const fringe = add(merge([fr(rug.z1 - 0.004, 1), fr(rug.z0 + 0.004, -1)]), M.fringe, false, true); if (fringe) fringe.renderOrder = 3;
    contact((rug.x0 + rug.x1) / 2, (rug.z0 + rug.z1) / 2, w + 0.05, d + 0.05, false, 0.3);
  }
  // photoscans are lit like the rooms they stand in: a copy of each scan's material goes through the same shading
  const roomMats = new Map<THREE.Material, THREE.Material>();
  const asRoom = (m: THREE.Mesh) => { const src = m.material as THREE.MeshStandardMaterial; if (!src.isMeshStandardMaterial) return; let mt = roomMats.get(src) as THREE.MeshStandardMaterial | undefined;
    if (!mt) { mt = sh(src.clone(), { strength: 0.5 }); if (roomEnv) { mt.envMap = roomEnv; mt.envMapIntensity = envI; } roomMats.set(src, mt); extra.push(mt); }
    m.material = mt; };
  // one leather armchair across the table from the sofa, by the hearth (x 0.7: from the curtain stop, just behind it, it stays under
  // the frame's foot). A second chair at z −3.72 stood dead centre in the first view through the front door and crowded the entrance
  // shot, whose subjects are the panel wall and the room beyond: it was taken out.
  const chairs: [number, number, number][] = [[0.7, -5.6, -Math.PI / 2 + 0.16]];
  if (props?.has('armchair')) for (const [x, z, ry] of chairs) { const g = stamp(props, 'armchair', { x, y: F, z, ry, size: 0.88 }, asRoom); if (g) group.add(g); contact(x, z, 0.8, 0.8, false, 0.4); }
  else { const c: Piece = { plinth: [], cover: [], welt: [] }; for (const [x, z, ry] of chairs) { const s = sofa(0.86, 0.84, { seats: 1, arms: [true, true], seed: 50 + z }); for (const k of ['plinth', 'cover', 'welt'] as const) c[k].push(...s[k].map((g) => inRoom(g, ry, x, z))); contact(x, z, 0.86, 0.84, false, 0.45); }
    add(merge(c.plinth), M.dark, false); add(merge([...c.cover, ...c.welt]), M.boucle); }
  // the coffee table: a thick slab of smoked walnut over a bronze plinth set well back under it
  const tb = { x: -1.1, z: -4.8, w: 0.72, d: 1.24, top: F + 0.38 };
  add(rbox(tb.w, 0.055, tb.d, 0.016, tb.x, tb.top - 0.0275, tb.z), M.walnutAlong);
  add(rbox(tb.w - 0.3, 0.325, tb.d - 0.34, 0.01, tb.x, F + 0.1625, tb.z), M.bronze);
  contact(tb.x, tb.z, tb.w, tb.d, false, 0.5);
  // a drum of travertine at the sofa's south end, the lamp on it
  const st = { x: -2.42, z: -6.27, r: 0.2, h: 0.47 };
  add(merge([new THREE.CylinderGeometry(st.r, st.r, st.h - 0.02, 48).translate(st.x, F + 0.02 + (st.h - 0.02) / 2, st.z)]), M.stoneW);
  add(new THREE.CylinderGeometry(st.r - 0.02, st.r - 0.02, 0.02, 32).translate(st.x, F + 0.01, st.z), M.gap, false);
  contact(st.x, st.z, 0.42, 0.42, true, 0.5);
  /** A table lamp, lit: what it stands on (x, y, z), its height, the foot's glaze. */
  const lamps: [number, number, number, number][] = [];
  // the glow under and over a lamp's shade: the pendants' opal diffuser, but on the lamps' own switch
  const lampGlow = LAMPS === LV ? M.diffuser : (() => { const m = M.diffuser.clone(); m.emissiveIntensity = 2.3 * LAMPS; extra.push(m); return m; })();
  const tableLampAt = (x: number, y: number, z: number, h: number, foot: THREE.Material, seed: number) => {
    const l = tableLamp(h, seed), at = (g: THREE.BufferGeometry) => g.translate(x, y, z);
    add(at(l.foot), foot); add(at(l.metal), M.brass, false); add(at(l.shade), M.shade, false, false); add(at(l.glow), lampGlow, false, false); lamps.push([x, y + h * 0.78, z, h]);
  };
  tableLampAt(st.x, F + st.h, st.z, 0.64, M.glaze, 2);
  tableLampAt(fx1 - 0.3, F + 0.24, plan.z0 + 0.22, 0.52, M.ceramic, 3); // … and one on the end of the hearth bench: a warm pool at seat height
  // art: oil on linen in a walnut tray frame (a shadow gap between canvas and frame); works on paper behind glass, with a mount
  const art = (x: number, y: number, z: number, w: number, h: number, rotY: number, map: THREE.Texture, mount = 0) => {
    const m = sh(new THREE.MeshStandardMaterial({ map, roughness: mount ? 0.85 : 0.6, envMapIntensity: envI * 0.6 }), { strength: 0.3 }); mats.push(m);
    const at = (g: THREE.BufferGeometry) => g.rotateY(rotY).translate(x, y, z);
    if (!mount) { // the canvas stands 8 mm inside its frame, which is 45 mm deep and 12 mm wide
      const gp = 0.008, fw = 0.012, W2 = w / 2 + gp, H2 = h / 2 + gp;
      add(at(merge([slab(-W2 - fw, -W2, -H2 - fw, H2 + fw, 0, 0.045), slab(W2, W2 + fw, -H2 - fw, H2 + fw, 0, 0.045), slab(-W2, W2, H2, H2 + fw, 0, 0.045), slab(-W2, W2, -H2 - fw, -H2, 0, 0.045)])!), M.walnut);
      add(at(slab(-W2, W2, -H2, H2, 0, 0.012)), M.gap, false); add(at(slab(-w / 2, w / 2, -h / 2, h / 2, 0.012, 0.035)), M.canvasEdge, false);
      add(at(new THREE.PlaneGeometry(w, h).translate(0, 0, 0.0352)), m, false); return;
    }
    add(at(new THREE.BoxGeometry(w + 0.05 + mount * 2, h + 0.05 + mount * 2, 0.035).translate(0, 0, 0.0175)), M.walnut);
    const pm = sh(new THREE.MeshStandardMaterial({ color: '#ebe6dc', roughness: 0.95, envMapIntensity: envI * 0.4 }), { strength: 0.3 }); mats.push(pm); add(at(new THREE.PlaneGeometry(w + mount * 2, h + mount * 2).translate(0, 0, 0.0355)), pm, false);
    add(at(new THREE.PlaneGeometry(w, h).translate(0, 0, 0.0365)), m, false);
    const pane = add(at(new THREE.PlaneGeometry(w + mount * 2 + 0.01, h + mount * 2 + 0.01).translate(0, 0, 0.04)), M.frameGlass, false, false); if (pane) pane.renderOrder = 5;
  };
  art(mx, F + 1.62, plan.z0 + 0.001, 1.38, 0.92, 0, paintingTexture(0));                         // above the majlis
  art(px1 + 0.001, F + 1.55, -3.0, 0.8, 1.1, Math.PI / 2, paintingTexture(1));                   // on the pier's hallway side

  /* ---------- the end of the hall (the wing's east wall): a painting under its picture light, a slim console ---------- */
  art(W.x1 - 0.001, F + 1.62, -0.9, 0.56, 0.78, -Math.PI / 2, hajarTexture(), 0.09);
  add(merge([new THREE.CylinderGeometry(0.011, 0.011, 0.62, 16).rotateX(Math.PI / 2).translate(W.x1 - 0.13, F + 2.34, -0.9), ...[-1.1, -0.7].map((z) => new THREE.CylinderGeometry(0.005, 0.005, 0.13, 8).rotateZ(Math.PI / 2).translate(W.x1 - 0.065, F + 2.34, z)), ...[-1.1, -0.7].map((z) => new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16).rotateZ(Math.PI / 2).translate(W.x1 - 0.003, F + 2.34, z))]), M.brass, false);
  add(slab(W.x1 - 0.134, W.x1 - 0.126, F + 2.328, F + 2.33, -1.19, -0.61), M.lamp, false, false);
  add(merge([rbox(0.26, 0.04, 0.8, 0.01, W.x1 - 0.2, F + 0.8, -0.95)]), M.walnutAlong);
  { // … on an open frame of 18 mm bronze bar: two end loops and a rail under the top
    const b = 0.018, xa = W.x1 - 0.31, xb = W.x1 - 0.09, top = F + 0.78, bars: THREE.BufferGeometry[] = [];
    for (const z of [-1.31, -0.59]) bars.push(slab(xa, xa + b, F, top, z - b / 2, z + b / 2), slab(xb - b, xb, F, top, z - b / 2, z + b / 2), slab(xa + b, xb - b, F + 0.04, F + 0.04 + b, z - b / 2, z + b / 2));
    bars.push(slab(xa, xa + b, top - b - 0.004, top - 0.004, -1.31 + b / 2, -0.59 - b / 2), slab(xb - b, xb, top - b - 0.004, top - 0.004, -1.31 + b / 2, -0.59 - b / 2));
    add(merge(bars), M.bronze);
  }
  add(merge([rbox(0.22, 0.03, 0.16, 0.003, W.x1 - 0.2, F + 0.835, -0.7), rbox(0.2, 0.026, 0.15, 0.003, W.x1 - 0.2, F + 0.863, -0.7).rotateY(0.15)]), M.book);
  contact(W.x1 - 0.2, -0.95, 0.26, 0.8, false, 0.18);
  { const g = props?.has('brassvase') ? stamp(props, 'brassvase', { x: W.x1 - 0.2, y: F + 0.82, z: -1.2, ry: 0, size: 0.3, by: 'height' }, asRoom) : null; if (g) group.add(g); else add(jar(0.3, 8).translate(W.x1 - 0.2, F + 0.82, -1.22), M.ceramic); }

  /* ---------- hallway + kitchen ---------- */
  const kx0 = px1, kx1 = plan.x1;
  // tall unit + linear counter along the east wall, upper cabinets, splash-back band
  add(merge([slab(kx1 - 0.62, kx1 - 0.02, F + 0.08, F + 0.9, plan.z0 + 0.05, plan.z0 + 3.3), slab(kx1 - 0.62, kx1 - 0.02, F + 0.08, F + 2.3, plan.z0 + 3.3, plan.z0 + 3.95), slab(kx1 - 0.36, kx1 - 0.02, F + 1.5, F + 2.3, plan.z0 + 0.05, plan.z0 + 3.3)]), M.walnut);
  add(slab(kx1 - 0.56, kx1 - 0.02, F, F + 0.08, plan.z0 + 0.05, plan.z0 + 3.95), M.gap, false);                           // recessed plinth
  add(slab(kx1 - 0.64, kx1 - 0.0, F + 0.9, F + 0.94, plan.z0 + 0.03, plan.z0 + 3.32), M.stoneW);
  add(slab(kx1 - 0.04, kx1 - 0.0, F + 0.94, F + 1.5, plan.z0 + 0.05, plan.z0 + 3.3), M.stoneDark);
  // island with a waterfall stone top
  const ix = (kx0 + kx1) / 2 - 0.25, iz = plan.z0 + 1.8;
  add(merge([slab(ix - 0.45, ix + 0.45, F, F + 0.88, iz - 1.1, iz + 1.1)]), M.walnut);
  add(merge([slab(ix - 0.5, ix + 0.5, F + 0.88, F + 0.93, iz - 1.15, iz + 1.15), slab(ix - 0.5, ix - 0.45, F, F + 0.88, iz - 1.15, iz + 1.15), slab(ix + 0.45, ix + 0.5, F, F + 0.88, iz - 1.15, iz + 1.15)]), M.stoneW);
  // tap, hob lines, two pendants
  add(merge([new THREE.CylinderGeometry(0.012, 0.012, 0.32, 12).translate(ix + 0.25, F + 1.09, iz - 0.6), new THREE.CylinderGeometry(0.01, 0.01, 0.2, 10).rotateZ(Math.PI / 2).translate(ix + 0.15, F + 1.25, iz - 0.6)]), M.brass);
  add(slab(ix - 0.3, ix + 0.3, F + 0.931, F + 0.936, iz + 0.15, iz + 0.75), M.black);
  const pend: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  for (const dz of [-0.55, 0.55]) { pend.push(new THREE.CylinderGeometry(0.003, 0.003, CY - (F + 2.05), 6).translate(ix, (CY + F + 2.05) / 2, iz + dz), new THREE.CylinderGeometry(0.11, 0.15, 0.22, 32, 1, true).translate(ix, F + 1.95, iz + dz)); glow.push(new THREE.CircleGeometry(0.1, 24).rotateX(Math.PI / 2).translate(ix, F + 1.85, iz + dz)); }
  add(merge(pend), M.brass); add(merge(glow), M.diffuser, false, false);
  // stools
  add(merge([0.35, 1.05].flatMap((dz) => [new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24).translate(ix - 0.85, F + 0.66, iz - 1.1 + dz + 0.4), new THREE.CylinderGeometry(0.02, 0.02, 0.64, 10).translate(ix - 0.85, F + 0.32, iz - 1.1 + dz + 0.4), new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24).translate(ix - 0.85, F + 0.01, iz - 1.1 + dz + 0.4)])), M.black);
  add(merge([0.35, 1.05].map((dz) => rbox(0.32, 0.06, 0.32, 0.03, ix - 0.85, F + 0.71, iz - 1.1 + dz + 0.4))), M.cushion);

  /* ---------- porch: slat soffit, downlights, piers, path ---------- */
  target = outdoor; // everything added until the lanterns lives in the sun
  const porchY = 2.78, ppx0 = -1.72, ppx1 = 4.0, pz0 = -0.02, pz1 = 2.62, sx0 = -2.9, sx1 = 4.5; // piers at the cut, soffit under the whole overhang
  add(quad(sx0, sx1, pz0, pz1 - 0.16, porchY + 0.02, 1, false), M.porchBack, false);
  const psl: THREE.BufferGeometry[] = []; for (let x = sx0 + 0.03; x + 0.07 <= sx1; x += 0.1) psl.push(slab(x, x + 0.07, porchY - 0.035, porchY + 0.02, pz0, pz1 - 0.16));
  add(merge(psl), M.porchSlat, false);
  add(merge([[-1.0, 0.9], [0.6, 0.9], [2.2, 0.9], [3.5, 0.9]].map(([x, z]) => new THREE.CircleGeometry(0.045, 20).rotateX(Math.PI / 2).translate(x, porchY - 0.036, z))), LV < 1 ? (() => { const m = M.lamp.clone(); m.emissiveIntensity = 6; extra.push(m); return m; })() : M.lamp, false, false); // (the porch's own: not the rooms' lights)
  add(merge([slab(ppx0 - 0.24, ppx0 + 0.16, -0.05, S + 0.05, -0.36, pz1 + 0.16), slab(ppx1 - 0.16, ppx1 + 0.24, -0.05, S + 0.05, -0.36, pz1 + 0.16)]), M.render); // piers close the cut, up to the slab and past its front edge (the cut shell's torn edges end at z 2.7)
  add(merge([slab(ppx0 - 0.02, ppx1 + 0.02, porchY - 0.04, S + 0.05, pz1 - 0.16, pz1), slab(ppx0 + 0.16, W.x0 - t + 0.01, porchY + 0.02, S + 0.05, -0.36, -0.2), slab(W.x0 - t + 0.01, ppx1 - 0.16, porchY + 0.02, S + 0.05, W.z1 + 0.006, -0.2)]), M.render); // fascia + back upstand: the void above the soffit never shows (along the hall the upstand stays inside the hall's own wall)
  add(slab(ppx0 + 0.16, W.x0 - 0.12, -0.05, porchY + 0.06, -0.36, -0.14), M.render); // wall left of the wing, under the soffit
  // the wing's front wall right of the steps starts at the hall floor (y 0.53): a plinth, set back 2 cm as a shadow line, closes the
  // gap down to the paving, where the shell's torn plinth and post stubs showed on the approach
  add(slab(0.63, ppx1 - 0.16, -0.05, F - 0.02, -0.3, -0.18), M.render);
  // … and under the door's sill, behind the steps: the void there showed the shell's torn remains between the top step and the sill
  add(slab(-0.62, 0.62, -0.05, F - 0.025, -0.3, -0.012), M.render, false);
  // paved porch floor + stone path to the gate, slightly proud of the lawn
  add(quad(ppx0 + 0.16, ppx1 - 0.16, -0.36, 1.32, 0.012, 0.6), M.porchStone, false);
  add(merge([0, 1, 2, 3].map((i) => slab(-0.85, 0.35, -0.02, 0.03, 1.35 + i * 0.45, 1.35 + i * 0.45 + 0.38))), M.limestone, false);

  target = group; indoors = false;
  /* ---------- exterior lighting for golden hour: lanterns, sconces, path lights ---------- */
  const lampGlass = new THREE.MeshStandardMaterial({ color: '#2a1a0c', emissive: '#ffbf73', emissiveIntensity: 4.5, roughness: 0.4 }); mats.push(lampGlass);
  const lantern = (x: number, y: number, z: number) => {
    add(merge([slab(x - 0.1, x + 0.1, y, y + 0.02, z - 0.1, z + 0.1), slab(x - 0.1, x + 0.1, y + 0.32, y + 0.36, z - 0.1, z + 0.1), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => slab(x + a * 0.1 - 0.012, x + a * 0.1 + 0.012, y, y + 0.34, z + b * 0.1 - 0.012, z + b * 0.1 + 0.012))]), M.black);
    add(slab(x - 0.085, x + 0.085, y + 0.02, y + 0.32, z - 0.085, z + 0.085), lampGlass, false, false);
  };
  lantern(-1.5, 1.61, 3.31); lantern(0.8, 1.61, 3.31);                           // on the garden-gate piers (court.ts: caps at y 1.61, piers centred on z 3.31)
  const sconce = (x: number) => { add(slab(x - 0.06, x + 0.06, F + 1.55, F + 2.05, W.z1 + t, W.z1 + t + 0.1), M.black); add(slab(x - 0.045, x + 0.045, F + 1.6, F + 2.0, W.z1 + t + 0.1, W.z1 + t + 0.105), lampGlass, false, false); };
  sconce(-1.0); sconce(1.0);                                                        // beside the front door
  add(merge([0, 1, 2, 3].flatMap((i) => [-0.95, 0.45].map((x) => new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12).translate(x, 0.03, 1.5 + i * 0.45)))), lampGlass, false, false); // path lights (the east row clear of court.ts's fin and the open gate leaf)
  if (high) { const porch = new THREE.PointLight('#ffc78e', 3, 6, 2); porch.position.set(0.2, 2.5, 1.1); group.add(porch); }
  // the soffit downlight by the door is a real spot on the leaf round the lock: the escutcheon and the handle throw their shadow down
  // the oak and the lacquer takes a highlight along its roundover (lit by the sky map alone, the lock lay flat on the door)
  if (high) { const s = new THREE.SpotLight('#ffd2a2', 9, 5, 0.46, 0.75, 2); s.position.set(0.6, porchY - 0.05, 0.9); s.target.position.set(0.38, F + 0.9, 0.03); s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0003; s.shadow.normalBias = 0.004; s.shadow.radius = 5; s.shadow.camera.near = 0.3; s.shadow.camera.far = 4; group.add(s, s.target); }
  // up/down wall lights on the porch piers (the key visual's warm sconces on the facade)
  const pierLight = (x: number) => { add(slab(x - 0.06, x + 0.06, 1.95, 2.35, pz1, pz1 + 0.1), M.black); add(slab(x - 0.045, x + 0.045, 2.0, 2.3, pz1 + 0.1, pz1 + 0.105), lampGlass, false, false); };
  pierLight(ppx0 + 0.02); pierLight(ppx1 - 0.02);
  if (high) for (const x of [ppx0, ppx1]) { const l = new THREE.PointLight('#ffc78e', 1.6, 4, 2); l.position.set(x, 2.15, pz1 + 0.5); group.add(l); }
  // the shell's upper windows are baked into its albedo (opaque), so authored glow quads sit a few cm proud of them (house.json `glow`)
  if (glowCfg?.length) {
    const glowMat = new THREE.MeshStandardMaterial({ color: '#2a2016', emissive: '#ffc985', emissiveIntensity: 1, roughness: 0.3 }); mats.push(glowMat);
    for (const g of glowCfg) {
      const m = glowMat.clone(); m.emissiveIntensity = g.intensity ?? 1.4; mats.push(m);
      const gq = new THREE.Mesh(new THREE.PlaneGeometry(g.size[0], g.size[1]), m); gq.position.set(...g.pos); gq.rotation.y = g.yaw ?? 0; gq.castShadow = false; gq.receiveShadow = false; group.add(gq);
      if (high && g.light !== false) { const l = new THREE.PointLight('#ffc78e', 2.5, 5, 2); l.position.set(g.pos[0] + Math.sin(g.yaw ?? 0) * 0.6, g.pos[1], g.pos[2] + Math.cos(g.yaw ?? 0) * 0.6); group.add(l); }
    }
  }
  indoors = true;

  /* ---------- what grows: an olive tree between the two windows, dry branches in a jar ---------- */
  {
    const ox = plan.x0 + 0.72, oz = plan.z1 - 0.7, ph = 0.5;
    // in a thrown planter of dark unglazed stoneware (a plain white drum reads as plastic), with a rolled lip
    add(turned([[0, 0], [0.19, 0], [0.205, 0.015], [0.24, 0.12], [0.268, 0.3], [0.278, 0.42], [0.286, 0.47], [0.288, 0.5], [0.262, 0.5], [0.256, 0.47], [0, 0.465]].map(([r, y]) => [r, (y / 0.5) * ph] as [number, number]), { seg: 48, wobble: 0.01, seed: 4 }).translate(ox, F, oz), M.stoneware);
    add(new THREE.CylinderGeometry(0.255, 0.255, 0.01, 32).translate(ox, F + ph - 0.04, oz), M.dark, false);
    const o = tree({ height: 1.75, seed: 41, stems: 1, girth: 0.036, lean: 0.14, levels: 3, kids: high ? 6 : 4, bend: 0.22, spread: 0.8, leaf: 0.06, density: high ? 115 : 60, thin: 0.0018 }); // a full head of narrow silver-green leaves, not a few sprigs
    add(o.wood.translate(ox, F + ph - 0.04, oz), M.bark); if (o.leaves) add(o.leaves.translate(ox, F + ph - 0.04, oz), M.leaf, true, true);
    contact(ox, oz, 0.5, 0.5, true, 0.6);
    // the jar stands in the sun of the front window: the shadow of its branches falls into the sun's patch on the panel wall
    const jx = -0.5, jz = plan.z1 - 0.54, jh = 0.62; // (by the window's east jamb: out of the curtain stop's frame, still in the sun)
    add(jar(jh, 5).translate(jx, F, jz), M.stoneware);
    add(tree({ height: 1.45, seed: 77, stems: 6, girth: 0.0075, lean: 0.3, levels: 2, kids: 2, bend: 0.1, spread: 0.55, thin: 0.0022, sides: 6 }).wood.translate(jx, F + jh - 0.12, jz), M.twig);
    contact(jx, jz, 0.4, 0.4, true, 0.55);
  }

  /* ---------- the things on the coffee table ---------- */
  // (the tall pieces keep to the table's far half: seen from the curtain stop, all of them stand clear of the frame's foot)
  const mbx = tb.x - 0.19, mbz = tb.z + 0.4; let mby = tb.top;
  {
    const y = tb.top;
    // a stack of books at the north end, the mabkhara on it
    const books: [number, number, number, THREE.Material][] = [[0.31, 0.24, 0.034, M.bookInk], [0.28, 0.215, 0.027, M.bookSand], [0.25, 0.185, 0.022, M.bookRust]];
    books.forEach(([w, d, t, m], i) => { const b = book(w, d, t), r = 1.35 + (hsh(i + 70) - 0.5) * 0.34, at = (g: THREE.BufferGeometry) => g.rotateY(r).translate(mbx + (hsh(i + 80) - 0.5) * 0.014, mby, mbz); add(at(b.cover), m); add(at(b.pages), M.pages, false); mby += t; });
    const burner = mabkhara(0.16); add(burner.wood.rotateY(0.5).translate(mbx, mby, mbz), M.walnutAlong); add(burner.metal.rotateY(0.5).translate(mbx, mby, mbz), M.brass);
    // a brass tray at the south end: the dallah and three cups
    const tx = tb.x - 0.14, tz = tb.z - 0.34;
    add(merge([tray(0.2).translate(tx, y, tz), dallah(0.27).rotateY(2.4).translate(tx - 0.05, y + 0.006, tz - 0.03)]), M.brass);
    add(merge([[0.1, 0.06, 0], [0.06, 0.12, 1], [0.12, -0.03, 2]].map(([dx, dz]) => finjan(0.046).translate(tx + dx, y + 0.006, tz + dz))), M.ceramic);
    // a bowl of dates within reach of the sofa
    const bx = tb.x - 0.17, bz = tb.z + 0.02;
    add(bowl(0.105, 0.062, 4).translate(bx, y, bz), M.stoneware); add(dates(0.09, 0.03, 26, 3).translate(bx, y + 0.014, bz), M.date);
    // … and one more book, left open face down on the near end
    const b = book(0.26, 0.19, 0.024), at = (g: THREE.BufferGeometry) => g.rotateY(0.25).translate(tb.x + 0.16, y, tb.z + 0.1); add(at(b.cover), M.bookSand); add(at(b.pages), M.pages, false);
  }
  // a thread of frankincense smoke over the burner
  const smokeTex = canvasTex(128, 512, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < 60; i++) { const y = (i / 60) * h, r = 6 + (i / 60) * 22, x = w / 2 + Math.sin(i * 0.9) * 14; const grd = g.createRadialGradient(x, y, 0, x, y, r); const a = 0.5 * (1 - i / 60); grd.addColorStop(0, `rgba(255,250,240,${a})`); grd.addColorStop(1, 'rgba(255,250,240,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); } });
  const smokeMat = new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, color: '#cfc6ba' }); mats.push(smokeMat);
  smokeMat.onBeforeCompile = (shd) => { shd.uniforms.uTime = uTime; shd.vertexShader = 'uniform float uTime;\n' + shd.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n { float k = uv.y; transformed.x += sin(uTime * 1.5 + k * 6.0) * 0.04 * k + sin(uTime * 0.5 + k * 2.0) * 0.025 * k; }'); };
  smokeMat.customProgramCacheKey = () => 'smoke';
  const smoke = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.9, 1, 24).translate(0, 0.45, 0), smokeMat); smoke.position.set(mbx, mby + 0.15, mbz); smoke.renderOrder = 7; group.add(smoke);

  /* ---------- curtains ---------- */
  const segY = high ? 26 : 14;
  // linen drapes gathered at both sides of the living-room front window, on a slim track in the ceiling
  { const fw = windows.find((w) => w.id === 'living-front');
    if (fw) {
      const top = CY - 0.012, H = top - (F + 0.012), zc = fw.at - 0.15, a0 = Math.min(fw.a0, fw.a1), a1 = Math.max(fw.a0, fw.a1);
      // (turned to face the room: the +x edge of the west leaf and the −x edge of the east one are their returns to the wall, and stay put
      // while the stacks open out toward the hem)
      for (const [x, seed, pin] of [[a0 - 0.02, 21, 1], [a1 + 0.02, 22, -1]] as const) { const d = drape(1.5, H, { folds: 6, depth: 0.07, seed, wander: 1, segY, pin }); d.set(0.42); const m = new THREE.Mesh(d.geo, M.drape); m.rotation.y = Math.PI; m.position.set(x, top, zc); m.castShadow = m.receiveShadow = true; group.add(m); }
      add(slab(a0 - 0.4, a1 + 0.4, top - 0.004, top + 0.02, zc - 0.03, zc + 0.03), M.bronze, false);
    } }

  /* ---------- contact shadows ---------- */
  contact(sx, sz, SD + 0.06, SL + 0.06); contact(mx, mz + 0.03, ML + 0.04, MD + 0.06);                                     // sofa, majlis
  contact(ix, iz, 1.05, 2.3, false, 0.65); contact(ix - 0.85, iz - 0.35, 0.36, 0.36, true, 0.4); contact(ix - 0.85, iz + 0.35, 0.36, 0.36, true, 0.4); // island, stools
  contact(kx1r - 0.32, plan.z0 + 1.7, 0.62, 3.3, false, 0.45);                                        // counter

  /* ---------- the west window: drapes and sheers on the motor's track ---------- */
  const west = windows.find((w) => w.face === '-x');
  let curtain: Interior['curtain'] = { setOpen() {} };
  let westSky: THREE.RectAreaLight | null = null, skyFollows = BAKE !== null; const WEST_SKY = 1.2; // the sky's light through the west window (lit below), and whether it follows the drapes
  if (west) {
    const z0 = Math.min(west.a0, west.a1), z1 = Math.max(west.a0, west.a1), top = Math.min(west.y1 + 0.16, C - 0.22), H = top - (F + 0.015), PW = (z1 - z0) / 2 + 0.06;
    // (turned a quarter: +x of a leaf runs toward −z, its folds stand out into the room; the south leaf's return is its +x edge, the north one's its −x edge)
    const hang = (d: Drape, mat: THREE.Material, x: number, cast: boolean) => { const m = new THREE.Mesh(d.geo, mat); m.rotation.y = Math.PI / 2; m.position.set(x, top, 0); m.castShadow = cast; m.receiveShadow = true; group.add(m); return { m, d }; };
    // two leaves each; the sheers run on the track 7.5 cm behind the drapes' (so a drape's fold may stand 5 cm behind its own track)
    const dA = hang(drape(PW, H, { folds: 6, depth: 0.05, seed: 31, wander: 1, segY, pin: 1 }), M.drape, west.at + 0.12, true), dB = hang(drape(PW, H, { folds: 6, depth: 0.05, seed: 32, wander: 1, segY, pin: -1 }), M.drape, west.at + 0.12, true);
    const sA = hang(drape(PW, H, { folds: 8, depth: 0.028, seed: 33, wander: 0.8, segY, fullness: 2.5, flare: 0.12, pin: 1 }), M.sheer, west.at + 0.045, false), sB = hang(drape(PW, H, { folds: 8, depth: 0.028, seed: 34, wander: 0.8, segY, fullness: 2.5, flare: 0.12, pin: -1 }), M.sheer, west.at + 0.045, false);
    sA.m.renderOrder = sB.m.renderOrder = 6;
    const state = { t: 1 };
    // parted, a drape is gathered to a quarter of its width (its cloth then stands in deep folds by itself); the sheers part to the
    // window's outer quarters. (devices.ts' curtain track moves its runners by the same law)
    const apply = () => { if (westSky) westSky.intensity = WEST_SKY * (skyFollows ? 0.1 + 0.9 * state.t : 1); for (const [{ m, d }, k, side] of [[dA, 0.26 + (1 - state.t) * 0.74, -1], [dB, 0.26 + (1 - state.t) * 0.74, 1], [sA, 0.5 + (1 - state.t) * 0.5, -1], [sB, 0.5 + (1 - state.t) * 0.5, 1]] as [{ m: THREE.Mesh; d: Drape }, number, number][]) { d.set(PW * k); m.position.z = side < 0 ? z0 - 0.05 + (PW * k) / 2 : z1 + 0.05 - (PW * k) / 2; } };
    apply();
    curtain = { setOpen(v, animate = false) { if (!animate) { state.t = v; apply(); return; } gsap.to(state, { t: v, duration: 2.8, ease: 'power2.inOut', onUpdate: apply }); },
      pose(v) { const was = state.t; state.t = v; apply(); return () => { state.t = was; apply(); }; },
      follow(on) { skyFollows = on; apply(); } };
  }

  /* ---------- dust in the window light ---------- */
  // only where the sun is: motes strewn along the shafts that enter by the two windows (a mote outside a shaft is a white speck on
  // the picture), a few millimetres each, drifting a hand's width
  let dust: THREE.Points | null = null;
  if (high && west && sunDir) {
    const n = 110, pos: number[] = [], rnd = seeded(17), front = windows.find((w) => w.id === 'living-front');
    for (let i = 0; i < n; i++) {
      const w = front && i % 3 === 0 ? front : west, a0 = Math.min(w.a0, w.a1) + 0.45, a1 = Math.max(w.a0, w.a1) - 0.45, a = a0 + rnd() * (a1 - a0), y = w.y0 + 0.3 + rnd() * (w.y1 - w.y0 - 0.5), reach = 0.4 + rnd() * 3.2;
      const p = new THREE.Vector3(w.face[1] === 'z' ? a : w.at, y, w.face[1] === 'z' ? w.at : a).addScaledVector(sunDir, -reach);
      if (p.y > F + 0.15 && p.x < px0 - 0.4 && p.z > plan.z0 + 0.3) pos.push(p.x, p.y, p.z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ map: glowTexture(64, '#ffd9a8'), size: 0.005, transparent: true, opacity: 0.085, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }); extra.push(pm);
    pm.onBeforeCompile = (shd) => { shd.uniforms.uTime = uTime; shd.vertexShader = 'uniform float uTime;\n' + shd.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += vec3(sin(uTime * 0.5 + position.y * 3.1 + position.z * 1.7), sin(uTime * 1.0 + position.x * 2.3) * 0.5, cos(uTime * 0.5 + position.x * 2.9)) * 0.03;'); };
    pm.customProgramCacheKey = () => 'dust';
    dust = new THREE.Points(g, pm); dust.renderOrder = 6; group.add(dust);
  }

  /* ---------- lights ---------- */
  let fireLight: THREE.PointLight | null = null;
  if (high) {
    // every downlight is a real spot in its own fixture: pools on the floor, scallops on the walls, soft shadows under the key ones.
    // Walls hide them analytically (interior-surface.ts), so none of them needs a shadow map to stay in its own room
    for (const d of downs) {
      const s = new THREE.SpotLight(lampWhite, d.i * lk(0) * LV, 9, d.angle ?? 0.68, 0.8, 2); s.position.set(d.x, CY - 0.01, d.z); s.target.position.set(d.aim?.[0] ?? d.x, d.aim?.[1] ?? F, d.aim?.[2] ?? d.z);
      if (d.shadow) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; s.shadow.radius = 6; s.shadow.camera.near = 0.2; s.shadow.camera.far = 6; }
      group.add(s, s.target);
    }
    for (const dz of [-0.55, 0.55]) { const s = new THREE.SpotLight('#ffe9d0', 7 * lk(0) * LV, 5, 0.95, 0.7, 2); s.position.set(ix, F + 1.86, iz + dz); s.target.position.set(ix, F, iz + dz); if (dz < 0) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; s.shadow.radius = 6; s.shadow.camera.near = 0.1; s.shadow.camera.far = 4; } group.add(s, s.target); } // the island's pendants
    // the evening sky through the two big windows: a cool, soft area light against the warm lamps (the sky map itself is not occluded by walls)
    RectAreaLightUniformsLib.init();
    for (const w of windows) { if (w.id !== 'living-front' && w.id !== 'living-west') continue;
      const a0 = Math.min(w.a0, w.a1), a1 = Math.max(w.a0, w.a1); const L = new THREE.RectAreaLight('#cfdcff', WEST_SKY, a1 - a0, w.y1 - w.y0); if (w.id === 'living-west') westSky = L;
      if (w.face === '+z') { L.position.set((a0 + a1) / 2, (w.y0 + w.y1) / 2, w.at - 0.05); L.lookAt((a0 + a1) / 2, (w.y0 + w.y1) / 2 - 0.6, w.at - 4); }
      else { L.position.set(w.at + 0.05, (w.y0 + w.y1) / 2, (a0 + a1) / 2); L.lookAt(w.at + 4, (w.y0 + w.y1) / 2 - 0.6, (a0 + a1) / 2); }
      group.add(L); }
    for (const [x, y, z, h] of lamps) { const l = new THREE.PointLight('#ffd2a0', 2.8 * (h / 0.6) * lk(0) * LAMPS, 3.4, 2); l.position.set(x, y, z); group.add(l); } // the table lamps
    fireLight = new THREE.PointLight('#ff9c58', 1.0, 3.5, 2); fireLight.position.set(plan.x0 + 1.85, F + 0.5, plan.z0 + 0.3); group.add(fireLight); // what the embers throw on the bench and the floor
  } else {
    const p = new THREE.PointLight('#fff0e0', 16 * LV, 12, 1.6); p.position.set(0.2, C - 0.4, -3.6); group.add(p);
    const e = new THREE.PointLight('#fff0e0', 9 * LV, 9, 1.6); e.position.set(2.9, C - 0.4, -2.6); group.add(e); // … and one beyond the pier, which hides the first from the hallway and the kitchen
  }

  /* ---------- the light the rooms give back ---------- */
  let gi: RoomGI | null = null;
  // (the probes always see the west window's drapes parted: every clip of the film bakes its own lattice, and a clip that starts
  // with them drawn must end in the same light the next one starts in)
  if (high && q.get('gi') !== '0') { gi = createRoomGI({ record, uGI: kit.uGI, ready: () => loading <= 0, hide: [smoke, ...(dust ? [dust] : [])], pose: () => curtain.pose?.(BAKE ?? 1) ?? (() => {}) }); group.add(gi.group); }

  const camDir = new THREE.Vector3();
  let auditAll = q.has('nan');
  const noContact = q.has('nocontact'); // dev: without the devices' contact shades (devices.ts), to tell them from the wall's own light
  // dev: ?pick=x,y;x,y (pixels of a 1600 × 900 still) logs what lies under those pixels, nearest first: whose surface an artefact is
  let picks = q.get('pick')?.split(';').map((t) => t.split(',').map(Number)) ?? null, pickIn = record ? 0 : 4; // … on the fourth frame (the recorder draws one frame on demand)
  const pick = (camera: THREE.Camera) => {
    const rc = new THREE.Raycaster(); let root: THREE.Object3D = group; while (root.parent) root = root.parent; // the whole scene: the shell, the court, the street rc.params.Points = { threshold: 0.01 }; camera.updateMatrixWorld();
    for (const [x, y] of picks ?? []) {
      const seen = new Map<string, string>(); // every surface under the pixel and its neighbours (a sliver is thinner than a pixel): 13 × 13 rays over ±1.5 px
      for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
        rc.setFromCamera(new THREE.Vector2(((x + 0.5 + i / 4) / 1600) * 2 - 1, 1 - ((y + 0.5 + j / 4) / 900) * 2), camera);
        for (const h of rc.intersectObject(root, true).filter((k) => k.object.visible).slice(0, 3)) { const m = (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; const names: string[] = []; for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o.name) names.push(o.name);
          const key = `${h.object.uuid}${h.distance.toFixed(2)}`; if (!seen.has(key)) seen.set(key, `${h.distance.toFixed(3)} m at ${h.point.toArray().map((v) => v.toFixed(3)).join(',')} n ${h.face ? h.face.normal.toArray().map((v) => v.toFixed(2)).join(',') : '-'} ${h.object.type} ${(h.object as THREE.Mesh).geometry?.type} [${names.join(' < ')}] ${m?.type ?? ''} #${m?.color?.getHexString?.() ?? ''}${m?.transparent ? ' transparent' : ''} scale ${h.object.getWorldScale(new THREE.Vector3()).toArray().map((v) => v.toFixed(2)).join(',')}`); }
      }
      console.warn(`[pick ${x},${y}]\n  ` + [...seen.values()].sort().join('\n  '));
    }
  };
  return {
    group, outdoor, curtain, rebake: () => gi?.rebake(), still: (on) => { smoke.visible = !on; if (dust) dust.visible = !on; },
    update(dt, camera) {
      if (noContact) group.parent?.traverse((o) => { if (o.name === 'contact-shadow') o.visible = false; });
      if (auditAll) { auditAll = false; (group.parent ?? group).traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) { const names: string[] = []; for (let k: THREE.Object3D | null = o; k; k = k.parent) if (k.name) names.push(k.name); audit(m.geometry, m.material, names.join(' < ')); } }); }
      if (picks && --pickIn < 0 && loading <= 0) { pick(camera); picks = null; }
      uTime.value += dt; const now = uTime.value;
      // the glass from the street: a window at dusk is a mirror of the sky and the palms first, the warm room behind it second. Indoors
      // it keeps its faint reflection (the room's own map). The same test as the renderer's inside/outside switch
      { const p = camera.position, out = !(p.x > plan.x0 && p.x < plan.x1 && p.z > plan.z0 && p.z < W.z1 && p.y < plan.slabY);
        M.glass.envMapIntensity = out ? GLASS_OUT : GLASS_IN; }
      // the embers breathe, and so does the light they throw (nothing flickers: a pulsing room reads as a flickering video, and LED
      // downlights that flicker read as a fault)
      const glow = 1 + 0.05 * Math.sin(now * 1.5) + 0.03 * Math.sin(now * 2.5 + 1);
      M.fire.color.setScalar(0.5 * glow); M.embers.color.setScalar(1.05 * (2 - glow)); if (fireLight) fireLight.intensity = 1.0 * (1 + 0.025 * Math.sin(now * 1.5));
      lampGlass.emissiveIntensity = 4.5 * (1 + 0.015 * Math.sin(now * 1.5)); // the porch and gate lanterns: a slow, barely-there breath, no flicker
      // the smoke ribbon faces the camera (about its own axis) and scrolls upward
      camDir.subVectors(camera.position, smoke.position); smoke.rotation.y = Math.atan2(camDir.x, camDir.z);
      smokeTex.offset.y = (smokeTex.offset.y - dt * 0.12) % 1;
    },
    dispose() { gi?.dispose(); group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); for (const m of [...mats, ...extra]) m.dispose(); },
  };
}

/** The painting at the end of the hall: the Hajar at dusk in five washes of ink, ridge behind ridge in the haze, under a small gilded sun. */
function hajarTexture() {
  return canvasTex(736, 1024, (g, w, h) => {
    const rnd = seeded(11);
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#e6dfd0'); sky.addColorStop(0.4, '#e2cfae'); sky.addColorStop(0.6, '#d3b184'); sky.addColorStop(1, '#c9a67a'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const sx = w * 0.63, sy = h * 0.37, halo = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.42); halo.addColorStop(0, 'rgba(255,238,196,0.8)'); halo.addColorStop(1, 'rgba(255,238,196,0)'); g.fillStyle = halo; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c4963f'; g.beginPath(); g.arc(sx, sy, w * 0.046, 0, Math.PI * 2); g.fill();
    ['#b5a088', '#8c7d6f', '#625d5a', '#3d3f45', '#1f2228'].forEach((c, i) => {
      const base = h * (0.5 + i * 0.1), amp = h * (0.05 + i * 0.013); g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 3) { const u = x / w; g.lineTo(x, base - amp * (Math.sin(u * (3.1 + i * 1.7) + i * 2.3) * 0.5 + Math.sin(u * (7.3 + i * 2.1) + i) * 0.3 + Math.sin(u * 19 + i * 5) * 0.12 + (rnd() - 0.5) * 0.05)); }
      g.lineTo(w, h); g.closePath(); g.fill();
      // haze pooled at the foot of the ridge: the wash thins out downward, and the next ridge stands in front of it
      const mist = g.createLinearGradient(0, base - amp * 0.4, 0, base + h * 0.11); mist.addColorStop(0, 'rgba(226,212,188,0)'); mist.addColorStop(1, `rgba(226,212,188,${0.46 - i * 0.09})`); g.fillStyle = mist; g.fillRect(0, base - amp, w, h * 0.11 + amp);
    });
    for (let k = 0; k < 16000; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,240' : '30,24,20'},${0.02 + rnd() * 0.04})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } // paper tooth
  });
}
