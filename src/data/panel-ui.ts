/**
 * The control panel's screen, one layout for both renderings: the 3D model paints it into its screen texture
 * (procedural/index.ts → paintPanel) and the landing overlays the same layout as real HTML/CSS on the paused frame
 * (components/PanelScreen.astro + scripts/film/device-live.ts), so the handoff from video to live UI is invisible.
 * Logical space: 1280 × 836 px, the exact aspect of the panel's glass (1.4555 m × 0.95 m in model units).
 */
export const PW = 1280, PH = 836;
export const ACCENT = '#2f80ff';
/** a light pill at or above this level puts its text on the fill (dark ink); the fill lives below the text now, so never */
export const FULL = 101;
/** the light pills' fill starts this far below the pill's top: the value and the label sit above it, never on it */
export const PILL_HEAD = 172;

type Rect = [x: number, y: number, w: number, h: number];
export const LAYOUT = {
  time: [56, 38, 560, 118] as Rect, date: [60, 166, 600, 38] as Rect,
  weather: [700, 52, 524, 34] as Rect, room: [700, 94, 524, 30] as Rect,
  scene0: [56, 250, 250, 96] as Rect, sceneGap: 16,
  climate: [340, 250, 430, 250] as Rect, curtains: [340, 516, 430, 166] as Rect,
  main: [786, 250, 206, 432] as Rect, vanity: [1008, 250, 216, 432] as Rect,
  music: [56, 706, 1168, 74] as Rect,
  radius: 22,
};
export const sceneRect = (i: number): Rect => { const [x, y, w, h] = LAYOUT.scene0; return [x, y + i * (h + LAYOUT.sceneGap), w, h]; };

export interface PanelStrings { date: string; weather: string; room: string; scenes: string[]; climate: string; climateSub: string; curtains: string; open: string; pause: string; close: string; main: string; mainSub: string; vanity: string; vanitySub: string; music: string; track: string }
export interface PanelState { time: string; scene: number; temp: number; main: number; vanity: number; curtain: 0 | 1 | 2; playing: boolean }
/** what the screen shows when the camera arrives (baked into the film frame; the live UI starts from exactly this) */
export const PANEL_DEFAULT: PanelState = { time: '09:26', scene: 0, temp: 22, main: 88, vanity: 45, curtain: 0, playing: true };
/** what each scene button sets */
export const SCENES: Pick<PanelState, 'main' | 'vanity' | 'temp' | 'curtain'>[] = [
  { main: 88, vanity: 45, temp: 22, curtain: 0 }, // full light
  { main: 42, vanity: 20, temp: 23, curtain: 2 }, // evening
  { main: 0, vanity: 6, temp: 24, curtain: 2 },   // sleep
  { main: 0, vanity: 0, temp: 26, curtain: 2 },   // away
];
export const COLORS = { bg0: '#0d1526', bg1: '#070b16', card: 'rgba(255,255,255,0.065)', cardHi: 'rgba(255,255,255,0.11)', ink: '#eef3ff', inkSoft: 'rgba(238,243,255,0.64)', inkMute: 'rgba(238,243,255,0.42)' };

/** Scene icons as SVG path data in a 24-unit box (drawn with Path2D on the canvas and as <path> in the HTML). */
export const ICONS = [
  'M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1', // sun
  'M3 17h18M6.5 17a5.5 5.5 0 0 1 11 0M12 6.5v2.5M4.2 9.8l1.8 1.8M19.8 9.8l-1.8 1.8', // sunset
  'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', // moon
  'M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5', // home / away
];

const FONT_LATIN = '"Jost", "Cairo", system-ui, sans-serif';

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
}

/** Paint the panel UI (logical 1280 × 836) into a 2D context; `k` scales to the canvas size. */
export function paintPanel(g: CanvasRenderingContext2D, s: PanelStrings, st: PanelState, k = 1, font = FONT_LATIN) {
  g.save(); g.scale(k, k);
  const L = LAYOUT, C = COLORS;
  const bg = g.createLinearGradient(0, 0, PW, PH); bg.addColorStop(0, C.bg0); bg.addColorStop(1, C.bg1); g.fillStyle = bg; g.fillRect(0, 0, PW, PH);
  const orb = g.createRadialGradient(PW * 0.86, PH * 0.06, 0, PW * 0.86, PH * 0.06, PW * 0.5); orb.addColorStop(0, ACCENT + '4d'); orb.addColorStop(1, ACCENT + '00'); g.fillStyle = orb; g.fillRect(0, 0, PW, PH);
  g.textBaseline = 'alphabetic';
  // header
  g.fillStyle = C.ink; g.font = `300 ${L.time[3]}px ${font}`; g.fillText(st.time, L.time[0] - 4, L.time[1] + L.time[3] * 0.86);
  g.fillStyle = C.inkSoft; g.font = `400 ${L.date[3] * 0.8}px ${font}`; g.fillText(s.date, L.date[0], L.date[1] + L.date[3] * 0.78);
  g.textAlign = 'right';
  g.fillStyle = C.ink; g.font = `400 ${L.weather[3] * 0.82}px ${font}`; g.fillText(s.weather, L.weather[0] + L.weather[2], L.weather[1] + L.weather[3] * 0.8);
  g.fillStyle = C.inkMute; g.font = `400 ${L.room[3] * 0.8}px ${font}`; g.fillText(s.room, L.room[0] + L.room[2], L.room[1] + L.room[3] * 0.8);
  g.textAlign = 'left';
  // scenes
  s.scenes.forEach((name, i) => {
    const [x, y, w, h] = sceneRect(i), on = i === st.scene;
    rr(g, x, y, w, h, L.radius); g.fillStyle = on ? ACCENT : C.card; g.fill();
    g.beginPath(); g.arc(x + 48, y + h / 2, 26, 0, Math.PI * 2); g.fillStyle = on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'; g.fill();
    g.save(); g.translate(x + 48 - 13, y + h / 2 - 13); g.scale(26 / 24, 26 / 24); g.strokeStyle = on ? '#fff' : C.inkSoft; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(new Path2D(ICONS[i])); g.restore();
    g.fillStyle = on ? '#fff' : C.ink; g.font = `500 30px ${font}`; g.fillText(name, x + 92, y + h / 2 + 10);
  });
  // climate
  { const [x, y, w, h] = L.climate; rr(g, x, y, w, h, L.radius); g.fillStyle = C.card; g.fill();
    g.fillStyle = C.inkSoft; g.font = `500 26px ${font}`; g.fillText(s.climate, x + 30, y + 50);
    g.fillStyle = C.ink; g.font = `300 104px ${font}`; g.fillText(`${st.temp}°`, x + 26, y + 168);
    g.fillStyle = C.inkMute; g.font = `400 24px ${font}`; g.fillText(s.climateSub, x + 30, y + 214);
    for (const [i, sign] of [[0, '−'], [1, '+']] as const) { const bx = x + w - 156 + i * 76, by = y + h - 96; g.beginPath(); g.arc(bx + 30, by + 30, 30, 0, Math.PI * 2); g.fillStyle = C.cardHi; g.fill(); g.fillStyle = C.ink; g.font = `300 40px ${font}`; g.textAlign = 'center'; g.fillText(sign, bx + 30, by + 43); g.textAlign = 'left'; } }
  // curtains
  { const [x, y, w, h] = L.curtains; rr(g, x, y, w, h, L.radius); g.fillStyle = C.card; g.fill();
    g.fillStyle = C.inkSoft; g.font = `500 26px ${font}`; g.fillText(s.curtains, x + 30, y + 48);
    [s.open, s.pause, s.close].forEach((lab, i) => { const bw = (w - 60 - 24) / 3, bx = x + 30 + i * (bw + 12), by = y + h - 82; rr(g, bx, by, bw, 56, 28); g.fillStyle = i === st.curtain ? ACCENT : C.cardHi; g.fill(); g.fillStyle = '#fff'; g.font = `500 24px ${font}`; g.textAlign = 'center'; g.fillText(lab, bx + bw / 2, by + 36); g.textAlign = 'left'; }); }
  // light pills
  for (const [rect, label, sub, v] of [[L.main, s.main, s.mainSub, st.main], [L.vanity, s.vanity, s.vanitySub, st.vanity]] as const) {
    const [x, y, w, h] = rect; rr(g, x, y, w, h, 40); g.fillStyle = C.card; g.fill();
    g.save(); rr(g, x, y, w, h, 40); g.clip(); const fh = (h - PILL_HEAD) * (v / 100); const fill = g.createLinearGradient(0, y + h - fh, 0, y + h); fill.addColorStop(0, '#ffd28a'); fill.addColorStop(1, '#f4a940'); g.fillStyle = fill; g.globalAlpha = v > 0 ? 0.92 : 0; g.fillRect(x, y + h - fh, w, fh); g.restore(); g.globalAlpha = 1;
    const onFill = v >= FULL; // the text sits on the warm fill: dark ink keeps it legible
    g.fillStyle = onFill ? '#3a2308' : C.ink; g.font = `300 64px ${font}`; g.fillText(`${v}%`, x + 24, y + 86);
    g.fillStyle = onFill ? 'rgba(58,35,8,0.8)' : C.inkSoft; g.font = `500 24px ${font}`; g.fillText(label, x + 26, y + 128);
    g.fillStyle = onFill ? 'rgba(58,35,8,0.6)' : C.inkMute; g.font = `400 21px ${font}`; g.fillText(sub, x + 26, y + 158);
  }
  // music
  { const [x, y, w, h] = L.music; rr(g, x, y, w, h, 37); g.fillStyle = C.card; g.fill();
    g.beginPath(); g.arc(x + 37, y + 37, 26, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
    g.fillStyle = '#fff'; if (st.playing) { g.fillRect(x + 28, y + 26, 6, 22); g.fillRect(x + 40, y + 26, 6, 22); } else { g.beginPath(); g.moveTo(x + 31, y + 24); g.lineTo(x + 49, y + 37); g.lineTo(x + 31, y + 50); g.closePath(); g.fill(); }
    g.fillStyle = C.ink; g.font = `500 26px ${font}`; g.fillText(s.track, x + 86, y + 34);
    g.fillStyle = C.inkMute; g.font = `400 21px ${font}`; g.fillText(s.music, x + 86, y + 60);
    for (let i = 0; i < 18; i++) { const bh = 10 + 30 * Math.abs(Math.sin(i * 1.7 + 0.6)); g.fillStyle = 'rgba(238,243,255,0.35)'; g.fillRect(x + w - 40 - i * 14, y + h / 2 - bh / 2, 6, bh); } }
  // faint glass sheen
  const sheen = g.createLinearGradient(0, 0, PW * 0.6, PH); sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); g.fillStyle = sheen; g.fillRect(0, 0, PW, PH);
  g.restore();
}
