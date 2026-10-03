/**
 * The phone at the film's app stop (components/PhoneScreen.astro, styles/15-phone.css): its controls run the room behind it
 * through film/scene.ts, and what it shows always comes back from the picture itself (the curtain slider's knob rides with the
 * drapes while the motor runs them; the percentage is the frame on screen), so the phone and the room can never disagree.
 *   - curtains: drag the slider (the drapes follow the finger), Open / Pause / Close (the motor runs them), arrow keys;
 *   - lights: the switch, the dimmer;
 *   - scenes: the control panel's own four, each a curtain position and a light level set together.
 * Two markers stand in the room (the stop's recorded `marks`), each tied to its card by a dashed line that runs while its control
 * moves. On an upright screen the whole picture stands in a band at the top (film/stage.ts) and the app is a sheet under it
 * (`is-sheet`, starting at `--app-h`, the band's bottom edge).
 */
import type { Scene, SceneState } from './scene';
import { stageBox, stagePx, upright } from './stage';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
type Marks = Record<string, number[]> | null | undefined;

export function createPhone(root: HTMLElement, el: HTMLElement, opts: { reduced: boolean }) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const phone = $('[data-phone]'), thumb = $<HTMLCanvasElement>('[data-app-thumb]'), tctx = thumb.getContext('2d');
  const rtl = phone.getAttribute('dir') === 'rtl';
  const sliders = { curtain: $('[data-app-slider="curtain"]'), lights: $('[data-app-slider="lights"]') };
  const sw = $<HTMLButtonElement>('[data-app-switch]'), chips = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-app-scene]'));
  const cWord = $('[data-app-curtain-word]'), cNum = $('[data-app-curtain-n]'), lWord = $('[data-app-lights-word]'), lNum = $('[data-app-lights-n]'), lPc = $('[data-app-lights-pc]');
  const marks = { curtain: $('[data-app-mark="curtain"]'), lights: $('[data-app-mark="lights"]') }, links = { curtain: el.querySelector<SVGPathElement>('[data-app-link="curtain"]')!, lights: el.querySelector<SVGPathElement>('[data-app-link="lights"]')! };
  const cards = { curtain: $('[data-app-card="curtain"]'), lights: $('[data-app-card="lights"]') };
  const sheetMq = upright;
  let scene: Scene | null = null, marksAt: Marks = null, on = false, risen = false, lastLevel = 1, clock = 0, touched = false, wired = false;
  let liveTimer: Record<string, number> = {};

  /* ---------------- the picture → the phone ---------------- */
  const live = (k: 'curtain' | 'lights') => { // the marker and its line run while their control moves
    marks[k].classList.add('is-live'); links[k].classList.add('is-live'); cards[k].classList.add('is-live');
    clearTimeout(liveTimer[k]); liveTimer[k] = window.setTimeout(() => { marks[k].classList.remove('is-live'); links[k].classList.remove('is-live'); cards[k].classList.remove('is-live'); }, 900);
  };
  let prev: SceneState = { curtain: 1, lights: 1 };
  const show = (s: SceneState) => {
    const c = Math.round(s.curtain * 100), l = Math.round(s.lights * 100), lit = s.lights > 0.02;
    sliders.curtain.style.setProperty('--v', s.curtain.toFixed(4)); sliders.curtain.setAttribute('aria-valuenow', String(c));
    cNum.textContent = String(c); cWord.textContent = c > 0 ? cWord.dataset.open! : cWord.dataset.closed!; cNum.parentElement!.hidden = c === 0;
    sliders.lights.style.setProperty('--v', s.lights.toFixed(4)); sliders.lights.setAttribute('aria-valuenow', String(l));
    lNum.textContent = String(l); lWord.textContent = lit ? lWord.dataset.on! : lWord.dataset.off!; lPc.hidden = !lit;
    sw.classList.toggle('is-on', lit); sw.setAttribute('aria-checked', String(lit));
    phone.style.setProperty('--lights', s.lights.toFixed(3)); phone.style.setProperty('--curtain', s.curtain.toFixed(3));
    el.style.setProperty('--lights', s.lights.toFixed(3)); el.style.setProperty('--curtain', s.curtain.toFixed(3));
    if (Math.abs(s.curtain - prev.curtain) > 0.002) live('curtain'); if (Math.abs(s.lights - prev.lights) > 0.004) live('lights');
    prev = { ...s };
    // the room's own picture in the app's header: the middle of the frame, as the canvas shows it now
    if (tctx && scene && scene.canvas.width && thumb.offsetParent) { const cw = scene.canvas.width, ch = scene.canvas.height, a = thumb.width / thumb.height, sh = ch * 0.74, sw2 = sh * a; tctx.drawImage(scene.canvas, clamp(cw * 0.4 - sw2 / 2, 0, cw - sw2), ch * 0.1, sw2, sh, 0, 0, thumb.width, thumb.height); }
  };
  const chip = (i: number) => chips.forEach((b, k) => { b.classList.toggle('is-on', k === i); b.setAttribute('aria-pressed', String(k === i)); });
  const first = () => { if (!touched) { touched = true; el.classList.add('is-touched'); } };

  /* ---------------- the phone → the room ---------------- */
  const wire = () => {
    if (wired) return; wired = true;
    const drag = (node: HTMLElement, set: (v: number, end: boolean) => void) => {
      // offsetX is in the slider's own space, whatever the phone's tilt; the knob's travel is the track less the knob
      const val = (e: PointerEvent) => { const w = node.offsetWidth, pad = node.offsetHeight / 2, x = clamp((e.offsetX - pad) / Math.max(1, w - pad * 2)); return rtl ? 1 - x : x; };
      let down = false;
      node.addEventListener('pointerdown', (e) => { down = true; node.setPointerCapture(e.pointerId); node.classList.add('is-drag'); first(); chip(-1); set(val(e), false); e.stopPropagation(); e.preventDefault(); });
      node.addEventListener('pointermove', (e) => { if (down) set(val(e), false); });
      const end = (e: PointerEvent) => { if (!down) return; down = false; node.classList.remove('is-drag'); set(val(e), true); };
      node.addEventListener('pointerup', end); node.addEventListener('pointercancel', () => { down = false; node.classList.remove('is-drag'); });
      node.addEventListener('click', (e) => e.stopPropagation());
      node.addEventListener('keydown', (e) => {
        const fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
        const d = e.key === fwd || e.key === 'ArrowUp' ? 0.1 : e.key === back || e.key === 'ArrowDown' ? -0.1 : e.key === 'Home' ? -1 : e.key === 'End' ? 1 : 0; if (!d) return;
        e.preventDefault(); e.stopPropagation(); first(); chip(-1); set(clamp(Number(node.getAttribute('aria-valuenow')) / 100 + d), true);
      });
    };
    drag(sliders.curtain, (v, end) => scene?.curtainTo(v, end && sliders.curtain.matches(':focus-visible') ? 'travel' : 'drag'));
    drag(sliders.lights, (v) => { if (v > 0.02) lastLevel = v; scene?.lightsTo(v < 0.02 ? 0 : v, false); });
    sw.addEventListener('click', (e) => { e.stopPropagation(); first(); chip(-1); const lit = (scene?.state.lights ?? 0) > 0.02; if (lit) lastLevel = Math.max(0.3, scene!.state.lights); scene?.lightsTo(lit ? 0 : lastLevel, true); });
    for (const b of Array.from(el.querySelectorAll<HTMLButtonElement>('[data-app-curtain]'))) b.addEventListener('click', (e) => {
      e.stopPropagation(); first(); chip(-1); const k = b.dataset.appCurtain;
      if (k === 'pause') scene?.halt(); else scene?.curtainTo(k === 'open' ? 1 : 0, 'travel');
    });
    chips.forEach((b, i) => b.addEventListener('click', (e) => {
      e.stopPropagation(); first(); chip(i); const l = Number(b.dataset.lights) / 100; if (l > 0.02) lastLevel = l;
      scene?.curtainTo(Number(b.dataset.curtain) / 100, 'travel'); scene?.lightsTo(l, true);
    }));
    phone.addEventListener('click', (e) => e.stopPropagation()); // a tap on the phone is never a tap on the film
    addEventListener('resize', () => { if (on || risen) layout(); });
    sheetMq.addEventListener?.('change', () => { if (on || risen) layout(); });
  };

  /* ---------------- where things stand ---------------- */
  /** the stage's box (film/stage.ts): where a point of the frame (0 … 1) lands in the root, and where the picture ends */
  const picture = () => {
    const box = stageBox(root), W = root.clientWidth;
    return { sheet: box.band, W, top: box.y, bh: box.y + box.h, at: (p: number[]) => stagePx(p, box, { w: 16, h: 9 }) };
  };
  const layout = () => {
    const g = picture();
    const up = on || risen;
    root.classList.toggle('is-sheet', g.sheet && up);
    if (g.sheet && up) root.style.setProperty('--app-h', `${g.bh.toFixed(1)}px`); else root.style.removeProperty('--app-h');
    if (!on) return;
    const r0 = root.getBoundingClientRect(), pr = phone.getBoundingClientRect();
    for (const k of ['curtain', 'lights'] as const) {
      const p = marksAt?.[k], m = marks[k], line = links[k];
      const xy = p ? g.at(p) : null, inView = !!xy && xy[0] > 24 && xy[0] < g.W - 24 && xy[1] > g.top + 24 && xy[1] < g.bh - 16 && !(!g.sheet && xy[0] > pr.left - r0.left - 30);
      m.classList.toggle('is-off', !inView); line.classList.toggle('is-off', !inView); if (!inView || !xy) continue;
      m.style.left = `${xy[0].toFixed(1)}px`; m.style.top = `${xy[1].toFixed(1)}px`;
      // from the marker's rim to its card: the card's near edge beside the room, or its top edge under it
      const c = cards[k].getBoundingClientRect(), R = m.offsetWidth / 2 + 3;
      const to: [number, number] = g.sheet ? [clamp(xy[0], c.left - r0.left + 28, c.right - r0.left - 28), c.top - r0.top - 2] : [c.left - r0.left - 4, c.top - r0.top + Math.min(c.height / 2, 34)];
      const dx = to[0] - xy[0], dy = to[1] - xy[1], d = Math.hypot(dx, dy) || 1, sx = xy[0] + (dx / d) * R, sy = xy[1] + (dy / d) * R;
      const bow = g.sheet ? 0.12 : 0.2, mx = (sx + to[0]) / 2 - dy * bow * (k === 'curtain' ? 1 : -0.6), my = (sy + to[1]) / 2 + dx * bow * (k === 'curtain' ? 1 : -0.6);
      line.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`);
    }
  };
  const tick = () => { $('[data-app-time]').textContent = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'Asia/Muscat' }).format(new Date()); };
  /** keep the lines on their cards while the phone rises into place */
  const settle = (ms: number) => { const t0 = performance.now(); const loop = () => { if (!on) return; layout(); if (performance.now() - t0 < ms) requestAnimationFrame(loop); }; requestAnimationFrame(loop); };

  /** the phone starts up into the frame (on an upright phone: the picture starts making room for the app) */
  const rise = () => {
    if (risen) return; risen = true; wire(); tick();
    el.hidden = false; void el.offsetWidth; layout(); root.classList.add('is-app'); el.classList.add('is-rising');
  };
  return {
    /** the camera is still settling on the room: the phone is already on its way up, so it arrives with the lens, in one shot.
     *  It is not live yet (`show` makes it so) */
    rise,
    /** the stop is reached: the room's picture is `s`, its markers stand at `m` (normalised in the 16:9 frame) */
    show(s: Scene, m: Marks) {
      if (scene !== s) { scene = s; s.onChange((st) => { if (on) show(st); }); }
      marksAt = m; rise(); on = true; touched = false; el.classList.remove('is-touched'); chip(0); prev = { curtain: 1, lights: 1 };
      layout(); el.classList.add('is-on');
      show(s.state); clearInterval(clock); clock = window.setInterval(tick, 20000);
      settle(opts.reduced ? 100 : 1500);
    },
    /** the tour moves on: the phone goes down (the room is put back by scene.reset) */
    hide(now = false) {
      if (!on && !risen) return Promise.resolve(); on = false; risen = false; clearInterval(clock);
      el.classList.remove('is-on', 'is-rising'); root.classList.remove('is-app', 'is-sheet'); root.style.removeProperty('--app-h');
      return new Promise<void>((res) => setTimeout(() => { if (!on && !risen) el.hidden = true; res(); }, now || opts.reduced ? 0 : 560));
    },
    get shown() { return on || risen; },
  };
}
