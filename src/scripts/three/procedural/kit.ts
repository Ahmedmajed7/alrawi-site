/**
 * The device kit: parameters, surface grain, materials, canvas textures and geometry helpers shared by every
 * procedural recipe (index.ts and the per-device files beside it).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paintPanel, PANEL_DEFAULT, PW, PH, type PanelStrings } from '@/data/panel-ui';
import en from '@/i18n/en.json';

export type Params = Record<string, unknown>;
export type Ctx = { accent: THREE.Color; p: Params };

export const num = (p: Params, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const str = (p: Params, k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const bool = (p: Params, k: string) => p[k] === true;
export const off = (p: Params, k: string) => p[k] === false; // explicit opt-out
export const FONT = '"IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, -apple-system, sans-serif';

/* ---------- surface grain (shared, generated once): what separates a moulded or machined part from CG ---------- */
let _micro: THREE.Texture | null = null, _rough: THREE.Texture | null = null, _brush: THREE.Texture | null = null;
export const prng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
/** fine moulding texture as a normal map: a satin plastic's orange-peel */
export function microNormal() {
  if (_micro || typeof document === 'undefined') return _micro;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!; const img = g.createImageData(N, N); const rnd = prng(7);
  const h = new Float32Array(N * N); for (let i = 0; i < h.length; i++) h[i] = rnd();
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  const sm = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) sm[y * N + x] = (at(x, y) * 4 + at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1)) / 8;
  const s2 = (x: number, y: number) => sm[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = s2(x + 1, y) - s2(x - 1, y), dy = s2(x, y + 1) - s2(x, y - 1), i = (y * N + x) * 4; img.data[i] = 128 + dx * 160; img.data[i + 1] = 128 + dy * 160; img.data[i + 2] = 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); _micro = new THREE.CanvasTexture(c); _micro.wrapS = _micro.wrapT = THREE.RepeatWrapping; _micro.repeat.set(6, 6); return _micro;
}
/** gentle roughness variation (handled parts are a touch glossier in patches) */
export function roughVar() {
  if (_rough || typeof document === 'undefined') return _rough;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!; const img = g.createImageData(N, N); const rnd = prng(19);
  for (let i = 0; i < N * N; i++) { const v = 215 + rnd() * 40; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); g.globalAlpha = 0.5; g.drawImage(c, 0, 0, N, N, -1, -1, N + 2, N + 2);
  _rough = new THREE.CanvasTexture(c); _rough.wrapS = _rough.wrapT = THREE.RepeatWrapping; _rough.colorSpace = THREE.NoColorSpace; _rough.repeat.set(2, 2); return _rough;
}
/** machined brushing as a normal map (aluminium strips, end caps) */
export function brushNormal() {
  if (_brush || typeof document === 'undefined') return _brush;
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!; const img = g.createImageData(N, N); const rnd = prng(41);
  const rows = new Float32Array(N); for (let y = 0; y < N; y++) rows[y] = rnd();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const ny = (rows[y] - rows[(y + 1) % N]) * 1.4 + (rnd() - 0.5) * 0.12, i = (y * N + x) * 4; img.data[i] = 128; img.data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 127)); img.data[i + 2] = 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); _brush = new THREE.CanvasTexture(c); _brush.wrapS = _brush.wrapT = THREE.RepeatWrapping; _brush.repeat.set(3, 3); return _brush;
}

/* ---------- materials ---------- */
export const plastic = (color: string | THREE.Color, rough = 0.45) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 1.1, normalMap: microNormal(), normalScale: new THREE.Vector2(0.05, 0.05), roughnessMap: roughVar() });
export const piano = (color = '#0b0c10') => new THREE.MeshPhysicalMaterial({ color, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 });
export const glass = (color = '#05070c') => new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 });
export const metal = (color = '#c9ccd2', rough = 0.32) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.92, envMapIntensity: 1.1 });
export const brushed = (color = '#cfd0cc') => new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 1, envMapIntensity: 1.2, normalMap: brushNormal(), normalScale: new THREE.Vector2(0.35, 0.35), anisotropy: 0.6 });
export const emissive = (color: THREE.Color | string, intensity = 1.6) => new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: intensity, roughness: 0.6 });
/** A self-lit display: black diffuse so room lights never wash it out. */
export const screenMat = (tex: THREE.Texture, intensity = 1) => new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.2, metalness: 0 });

/* ---------- canvas textures ---------- */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/**
 * The wall-panel dashboard, painted from the shared layout in data/panel-ui.ts (the landing overlays the very same
 * layout as live HTML on the paused frame). Painted once now and again once the site fonts have loaded.
 */
export function screenTexture() {
  const strings = en.walk.panel as PanelStrings;
  const t = canvasTex(PW, PH, (g) => paintPanel(g, strings, PANEL_DEFAULT));
  if (typeof document !== 'undefined' && document.fonts) {
    Promise.all(['300 100px Jost', '400 30px Jost', '500 30px Jost'].map((f) => document.fonts.load(f))).then(() => {
      const c = t.image as HTMLCanvasElement; const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); paintPanel(g, strings, PANEL_DEFAULT); t.needsUpdate = true;
    }).catch(() => { /* keep the system-font paint */ });
  }
  return t;
}
export function lcdTexture(text: string, accent: string) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.font = `300 120px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
  });
}
/** Backlit glass keypad after the catalogue lock: thin white digits 1–9, then bell · 0 · lock, on black glass. */
export function keypadTexture(accent: string) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#04060a'; g.fillRect(0, 0, w, h);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''];
    g.font = `300 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    keys.forEach((k, i) => { if (!k) return; g.fillStyle = i === 4 ? accent : 'rgba(255,255,255,0.9)'; g.fillText(k, w * (0.22 + (i % 3) * 0.28), h * (0.2 + Math.floor(i / 3) * 0.17)); });
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
    { const x = w * 0.22, y = h * 0.71; g.beginPath(); g.arc(x, y, 13, Math.PI, 0); g.lineTo(x + 15, y + 8); g.lineTo(x - 15, y + 8); g.closePath(); g.stroke(); g.beginPath(); g.arc(x, y + 13, 3, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); } // bell
    { const x = w * 0.78, y = h * 0.71; g.beginPath(); g.arc(x, y - 6, 11, Math.PI, 0); g.stroke(); g.strokeRect(x - 15, y - 6, 30, 22); }                                                                                             // lock
    g.beginPath(); g.arc(w / 2, h * 0.9, 2.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill(); // doorbell / status dot
  });
}
/**
 * Perforated speaker grille as paint: a white face with fine dark holes in the colour map and the same
 * pattern as a bump map. Opaque, so nothing behind it shows (the real grille hides the driver completely).
 */
export function grilleTexture(srgb: boolean, size = 1024, holes = 76) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = srgb ? '#f2f2ef' : '#ffffff'; g.fillRect(0, 0, w, h);
    const step = w / holes, R = w * 0.5;
    for (let y = 0; y < holes; y++) for (let x = 0; x <= holes; x++) {
      const cx = (x + (y % 2) * 0.5) * step, cy = (y + 0.5) * step, dx = cx - R, dy = cy - R;
      if (dx * dx + dy * dy > (R * 0.965) ** 2) continue;
      const r = step * 0.38; // the holes read at a glance: dark, a crisp edge
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r); grd.addColorStop(0, srgb ? '#141413' : '#000'); grd.addColorStop(0.82, srgb ? '#262625' : '#080808'); grd.addColorStop(1, srgb ? '#f2f2ef' : '#ffffff');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
  }, srgb);
}
/** Smoke-detector face after the catalogue unit: a plain white ring, a band of concentric vent holes around a plain centre. */
export function detectorTop() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#1c1d20';
    for (let k = 0; k < 6; k++) { const rr = w * (0.105 + k * 0.03), n = 22 + k * 7; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k * 0.35; g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, w * 0.0095, 0, Math.PI * 2); g.fill(); } } // the vent holes, dark and crisp like the catalogue unit's
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, w * 0.39, 0, Math.PI * 2); g.stroke(); // the step to the outer ring
  });
}
export function slotsAlpha() {
  return canvasTex(1024, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; for (let i = 0; i < 96; i++) g.fillRect(i * (w / 96) + 4, h * 0.3, w / 96 - 8, h * 0.4); }, false);
}

/* ---------- helpers ---------- */
export const rbox = (w: number, h: number, d: number, r = 0.04, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2.2));
export function roundedCylinder(r: number, h: number, edge = 0.05, seg = 64) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
  const e = Math.min(edge, r * 0.5, h * 0.5);
  pts.push(new THREE.Vector2(r - e, -h / 2));
  for (let i = 1; i <= 6; i++) { const a = (-Math.PI / 2) + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e)); }
  pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, seg);
}
/** Flat base, soft shoulder, gently domed top (smoke detectors, sensors). `dome` = share of the height in the dome. */
export function domedPuck(r: number, h: number, seg = 72, dome = 0.28) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2), new THREE.Vector2(r, -h / 2)];
  const sh = 1 - dome;
  for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(r - (1 - Math.cos(t * Math.PI / 2)) * r * 0.16, -h / 2 + Math.sin(t * Math.PI / 2) * h * sh)); }
  for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(r * 0.84 * (1 - t), -h / 2 + h * sh + Math.sin(t * Math.PI / 2) * h * dome)); }
  return new THREE.LatheGeometry(pts, seg);
}
export const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
export const led = (accent: THREE.Color | string, r = 0.02) => mesh(new THREE.SphereGeometry(r, 16, 16), emissive(accent, 2.5));
