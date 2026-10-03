/**
 * Text tone over the film: the UI chrome (brand row and skip link on top, the next button, hint and progress at the
 * bottom, the leader around the device) reads in ivory over a dark picture and in dark ink over a bright one — the
 * sky, the cream limewash walls. The player hands us the picture on screen; we average the relative luminance of
 * each band on a 48×27 copy of it and set `data-bg-top`, `data-bg-bottom` and `data-bg-mid` on the root
 * ("light" / "dark"), which the CSS turns into colours with a slow cross-fade.
 *
 * Stability over speed: each band has hysteresis (dark ink from L > 0.26, back to ivory below 0.17 — the two inks
 * contrast equally at L ≈ 0.21), and while the film moves a change must hold for two samples in a row (0.6 s) before
 * it is applied, so passing a window or a lamp never makes the text blink. On a held frame the verdict is immediate.
 */
import { stageBox } from './stage';

const W = 48, H = 27;
type Tone = 'light' | 'dark';
/** bands in normalised coordinates of the visible picture (after the object-fit: cover crop) [x0, y0, x1, y1] */
const BANDS = { top: [0, 0, 1, 0.16], bottom: [0, 0.8, 1, 1], mid: [0.2, 0.25, 0.8, 0.75] } as const;
type Band = keyof typeof BANDS;
/** what is on screen: a clip, a still, or the app scene's canvas (the room the visitor is dimming) */
type Picture = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export function createToneSampler(root: HTMLElement) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  // sRGB → linear, as a table (the frame arrives as 8-bit sRGB)
  const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
  const cur: Record<Band, Tone | null> = { top: null, bottom: null, mid: null };
  const pending: Record<Band, Tone | null> = { top: null, bottom: null, mid: null };
  let broken = !g, timer = 0;

  /** mean relative luminance of a band (the canvas holds exactly the visible picture) */
  const luminance = (data: Uint8ClampedArray, b: readonly number[]) => {
    const x0 = Math.floor(b[0] * W), x1 = Math.ceil(b[2] * W), y0 = Math.floor(b[1] * H), y1 = Math.ceil(b[3] * H);
    let s = 0, k = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; s += 0.2126 * lin[data[i]] + 0.7152 * lin[data[i + 1]] + 0.0722 * lin[data[i + 2]]; k++; }
    return k ? s / k : 0.5;
  };
  const verdict = (band: Band, L: number): Tone => { const was = cur[band]; if (was === 'light') return L < 0.17 ? 'dark' : 'light'; if (was === 'dark') return L > 0.26 ? 'light' : 'dark'; return L > 0.21 ? 'light' : 'dark'; };
  const set = (band: Band, t: Tone) => { cur[band] = t; root.dataset[`bg${band[0].toUpperCase()}${band.slice(1)}`] = t; };

  /** Sample the picture now. `settle`: the frame is held (apply at once); otherwise a change needs two samples in a row. */
  const sample = (v: Picture | null, settle = false) => {
    if (broken || !v) return;
    // an upright screen: the chrome stands on the night ground round the band, never on the picture
    const box = stageBox(root);
    if (box.band) { for (const band of Object.keys(BANDS) as Band[]) { pending[band] = null; if (cur[band] !== 'dark') set(band, 'dark'); } return; }
    const vw = v instanceof HTMLVideoElement ? (v.readyState >= 2 ? v.videoWidth : 0) : v instanceof HTMLCanvasElement ? v.width : v.complete ? v.naturalWidth : 0;
    const vh = v instanceof HTMLVideoElement ? v.videoHeight : v instanceof HTMLCanvasElement ? v.height : v.naturalHeight; if (!vw || !vh) return;
    // the part of the picture actually on screen (object-fit: cover crops the long side)
    const rw = box.w || 1, rh = box.h || 1;
    const s = Math.max(rw / vw, rh / vh), cw = rw / s, ch = rh / s;
    try { g!.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H); } catch { broken = true; return; }
    let data: Uint8ClampedArray; try { data = g!.getImageData(0, 0, W, H).data; } catch { broken = true; return; } // a tainted canvas: keep the CSS defaults
    for (const band of Object.keys(BANDS) as Band[]) {
      const t = verdict(band, luminance(data, BANDS[band]));
      if (t === cur[band]) { pending[band] = null; continue; }
      if (settle || cur[band] === null || pending[band] === t) { set(band, t); pending[band] = null; } else pending[band] = t;
    }
  };
  return {
    sample,
    /** keep sampling `get()` every 300 ms (while the film is on screen); `stop()` ends it */
    watch(get: () => Picture | null) { clearInterval(timer); timer = window.setInterval(() => sample(get()), 300); },
    stop() { clearInterval(timer); timer = 0; },
  };
}
