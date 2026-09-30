/**
 * The device HUD's small behaviours, kept apart from the placer (film/callout.ts) and from the player, so nothing here
 * can stall the film:
 *   - the device's box: the live layer (film/device-live.ts) knows where the device's screen, keypad and LEDs are in the
 *     picture; it publishes their bounding box here and the placer keeps the glass panel clear of it
 *   - decode: the title and the spec values resolve out of hex noise, start to end (so right to left in Arabic). The
 *     real text never changes (readers and the layout see it from the first frame): it is unveiled by a clip, the
 *     noise sits on top in its own absolutely placed box. ONE requestAnimationFrame loop, which stops when the last
 *     value has resolved
 *   - pointer parallax (fine pointers only): the panel leans a degree or two toward the cursor; one style write per
 *     frame on the panel's tilt element, through two registered custom properties that do not inherit
 */
export interface Box { x0: number; y0: number; x1: number; y1: number }
interface Feat { quads: Record<string, number[][]>; points: Record<string, number[]> }

/* ---------------- the device's box (normalised frame coordinates, like the features) ---------------- */
const boxes = new WeakMap<HTMLElement, { i: number; box: Box | null }>();
const subs = new WeakMap<HTMLElement, (i: number) => void>();
export function publishDevice(root: HTMLElement, i: number, f: Feat | null | undefined) {
  let box: Box | null = null;
  const add = (p: number[]) => { if (!box) box = { x0: p[0], y0: p[1], x1: p[0], y1: p[1] }; else { box.x0 = Math.min(box.x0, p[0]); box.y0 = Math.min(box.y0, p[1]); box.x1 = Math.max(box.x1, p[0]); box.y1 = Math.max(box.y1, p[1]); } };
  if (f) { for (const q of Object.values(f.quads ?? {})) q.forEach(add); for (const p of Object.values(f.points ?? {})) add(p); }
  const was = boxes.get(root), a = was?.box, b = box as Box | null;
  // the live 3D publishes every frame: only a real move (a few px on any screen) reaches the placer
  const same = !!was && was.i === i && (a && b ? Math.abs(a.x0 - b.x0) + Math.abs(a.y0 - b.y0) + Math.abs(a.x1 - b.x1) + Math.abs(a.y1 - b.y1) < 0.004 : a === b);
  if (same) return;
  boxes.set(root, { i, box: b }); subs.get(root)?.(i);
}
export const deviceBox = (root: HTMLElement, i: number) => { const b = boxes.get(root); return b && b.i === i ? b.box : null; };
export const onDevice = (root: HTMLElement, fn: (i: number) => void) => { subs.set(root, fn); };

/* ---------------- decode ---------------- */
const GLYPHS = '0123456789ABCDEF<>/=+:*#';
/** noise without Math.random: a hash of the position and the step, so a run is the same every time */
const glyph = (k: number, step: number) => { let x = (k * 374761393 + step * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return GLYPHS[((x ^ (x >>> 16)) >>> 0) % GLYPHS.length]; };
interface Job { el: HTMLElement; nz: HTMLElement | null; at: number; dur: number; len: number; on: boolean; done: boolean }

export function createDecoder() {
  let raf = 0, jobs: Job[] = [], t0 = 0, step = 0;
  const settle = (j: Job) => { j.done = true; j.el.style.removeProperty('--p'); j.el.classList.remove('is-decoding'); if (j.nz) j.nz.textContent = ''; };
  const tick = () => {
    const now = performance.now(); // not the frame's own timestamp: that one follows the animation clock, which dev tools can slow down
    raf = 0; step++;
    let open = 0;
    for (const j of jobs) {
      if (j.done) continue;
      const k = (now - t0 - j.at) / j.dur;
      if (k >= 1) { settle(j); continue; }
      open++;
      if (k <= 0) continue;
      if (!j.on) { j.on = true; j.el.classList.add('is-decoding'); }
      j.el.style.setProperty('--p', k.toFixed(3));
      if (j.nz && step % 3 === 0) { let s = ''; for (let c = 0; c < j.len; c++) s += glyph(c + j.len, step); j.nz.textContent = s; } // new noise every third frame: legible flicker, a third of the text work
    }
    if (open) raf = requestAnimationFrame(tick); else jobs = [];
  };
  return {
    /** play the panel's decode: the title from 400 ms, the rows from 600 ms, 60 ms apart (the CSS brings each row in on the same clock) */
    start(panel: HTMLElement) {
      this.cancel();
      const targets = Array.from(panel.querySelectorAll<HTMLElement>('[data-hud-decode]'));
      let row = 0;
      jobs = targets.map((el) => {
        const title = el.dataset.hudDecode === 'title', len = Math.ceil((el.textContent ?? '').trim().length * 1.1) + 2;
        el.style.setProperty('--p', '0');
        return { el, nz: el.querySelector<HTMLElement>('.hud-nz'), at: title ? 400 : 600 + row++ * 60, dur: title ? 500 : 380, len, on: false, done: false };
      });
      t0 = performance.now(); step = 0;
      if (jobs.length) raf = requestAnimationFrame(tick);
    },
    /** stop at once with every text fully shown */
    cancel() { cancelAnimationFrame(raf); raf = 0; jobs.forEach((j) => { if (!j.done) settle(j); }); jobs = []; },
  };
}

/* ---------------- pointer parallax ---------------- */
export function mountParallax(root: HTMLElement, layer: HTMLElement) {
  if (!matchMedia('(pointer: fine)').matches) return;
  let raf = 0, x = 0, y = 0, on: HTMLElement | null = null;
  const apply = () => {
    raf = 0;
    const tilt = layer.classList.contains('is-on') ? layer.querySelector<HTMLElement>('.walk-callout:not([hidden]) .hud-tilt') : null;
    if (on && on !== tilt) { on.style.removeProperty('--hud-mx'); on.style.removeProperty('--hud-my'); }
    on = tilt; if (!tilt) return;
    tilt.style.setProperty('--hud-mx', x.toFixed(3)); tilt.style.setProperty('--hud-my', y.toFixed(3));
  };
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !layer.classList.contains('is-on')) return;
    x = Math.max(-1, Math.min(1, (e.clientX / innerWidth) * 2 - 1)); y = Math.max(-1, Math.min(1, (e.clientY / innerHeight) * 2 - 1));
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
  root.addEventListener('pointerleave', () => { x = 0; y = 0; if (!raf) raf = requestAnimationFrame(apply); });
}
