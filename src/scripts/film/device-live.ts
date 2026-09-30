/**
 * Live devices on the paused film: when the tour stops on a device, real HTML is pinned onto it — onto the quads and
 * points recorded with the film (film.json `features`, or projected every frame in the live 3D) — and it comes alive:
 *   panel   the control panel's screen as a working UI (components/PanelScreen.astro, same layout as the baked pixels)
 *   switch  backlit dots you can tap: each gang toggles, and the room dims as its lights go off
 *   lock    the keypad wakes digit by digit, then the unlocked tick; digits are tappable
 *   puck    the smoke detector's green heartbeat; "Test" pulses it red with a spreading ring
 *   disc    sound rings spreading from the speaker grille; tap to pause
 *   rail    the curtain motor's status LED blinks
 * Everything lives inside the callout layer, so it drifts with the held frame; interactive parts are real buttons (or a
 * [data-live-ui] slider), so taps on them never advance the tour.
 */
import { toPx, quadMatrix, type Frame } from './homography';
import { SCENES, PANEL_DEFAULT, PW, PH, FULL, PILL_HEAD, type PanelState } from '@/data/panel-ui';
import { publishDevice } from './hud';

export interface Features { quads: Record<string, number[][]>; points: Record<string, number[]> }
interface Live { place(f: Features, w: number, H: number, frame?: Frame): void; enter(): void; leave(): void; /** the panel only: follow the moving film (corners of its screen this frame, or null when it is out of view) */ track?(q: number[][] | null, w: number, H: number, frame?: Frame): void }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, attrs: Record<string, string> = {}) => { const e = document.createElement(tag); e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };
const at = (e: HTMLElement, p: [number, number]) => { e.style.left = `${p[0]}px`; e.style.top = `${p[1]}px`; };
const quadPx = (q: number[][], w: number, H: number, frame?: Frame) => q.map((p) => toPx(p, w, H, frame)) as [number, number][];

export function createDeviceLive(root: HTMLElement, layer: HTMLElement, opts: { reduced: boolean }) {
  const t = layer.dataset;
  const built = new Map<number, Live | null>();
  let cur: Live | null = null;
  const later = (fn: () => void, ms: number) => window.setTimeout(fn, opts.reduced ? 0 : ms);

  /* ---------------- the control panel's screen ---------------- */
  function panelLive(): Live | null {
    const scr = layer.querySelector<HTMLElement>('[data-panel-screen]'); if (!scr) return null;
    const $ = <T extends Element = HTMLElement>(s: string) => scr.querySelector<T & HTMLElement>(s)!;
    const $$ = (s: string) => Array.from(scr.querySelectorAll<HTMLElement>(s));
    let st: PanelState = { ...PANEL_DEFAULT }; let clock = 0, wake = 0;
    const tweens = new Map<string, number>();
    const count = (key: string, node: HTMLElement, from: number, to: number) => { // numbers roll to their new value
      cancelAnimationFrame(tweens.get(key) ?? 0); if (opts.reduced || from === to) { node.textContent = String(to); return; }
      const t0 = performance.now(); const step = (now: number) => { const k = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - k, 3); node.textContent = String(Math.round(from + (to - from) * e)); if (k < 1) tweens.set(key, requestAnimationFrame(step)); };
      tweens.set(key, requestAnimationFrame(step));
    };
    const render = (prev: PanelState) => {
      $$('[data-ps-scene]').forEach((b, i) => { b.classList.toggle('is-on', i === st.scene); b.setAttribute('aria-pressed', String(i === st.scene)); });
      count('temp', $('[data-ps-temp]'), prev.temp, st.temp);
      for (const key of ['main', 'vanity'] as const) {
        const s = $(`[data-ps-slider="${key}"]`); (s.querySelector('.ps-fill') as HTMLElement).style.height = `calc((100% - ${PILL_HEAD}px) * ${st[key] / 100})`; s.setAttribute('aria-valuenow', String(st[key])); s.classList.toggle('is-full', st[key] >= FULL);
        count(key, s.querySelector('.ps-val span') as HTMLElement, prev[key], st[key]);
      }
      $$('[data-ps-curtain]').forEach((b, i) => { b.classList.toggle('is-on', i === st.curtain); b.setAttribute('aria-pressed', String(i === st.curtain)); });
      const play = $('[data-ps-play]'); play.classList.toggle('is-playing', st.playing); play.setAttribute('aria-pressed', String(st.playing)); $('[data-ps-music]').classList.toggle('is-playing', st.playing);
    };
    const set = (patch: Partial<PanelState>) => { const prev = st; st = { ...st, ...patch }; render(prev); };
    // wiring (once)
    $$('[data-ps-scene]').forEach((b, i) => b.addEventListener('click', () => set({ scene: i, ...SCENES[i] })));
    $$('[data-ps-temp-step]').forEach((b) => b.addEventListener('click', () => set({ temp: Math.min(30, Math.max(16, st.temp + Number(b.dataset.psTempStep))) })));
    $$('[data-ps-curtain]').forEach((b, i) => b.addEventListener('click', () => set({ curtain: i as 0 | 1 | 2 })));
    $('[data-ps-play]').addEventListener('click', () => set({ playing: !st.playing }));
    $$('[data-ps-slider]').forEach((s) => {
      const key = s.dataset.psSlider as 'main' | 'vanity';
      const fromEvent = (e: PointerEvent) => Math.round(Math.min(100, Math.max(0, (1 - (e.offsetY - PILL_HEAD) / (s.offsetHeight - PILL_HEAD)) * 100))); // offsetY is in the slider's own (projected) space; the fill track is below the head
      let drag = false;
      s.addEventListener('pointerdown', (e) => { drag = true; s.setPointerCapture(e.pointerId); s.classList.add('is-drag'); const prev = st; st = { ...st, [key]: fromEvent(e) }; render(prev); e.stopPropagation(); });
      s.addEventListener('pointermove', (e) => { if (!drag) return; const prev = st; st = { ...st, [key]: fromEvent(e) }; render(prev); });
      const end = () => { drag = false; s.classList.remove('is-drag'); };
      s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
      s.addEventListener('click', (e) => e.stopPropagation()); // a drag is not a tap on the film
      s.addEventListener('keydown', (e) => { const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0; if (!d) return; e.preventDefault(); e.stopPropagation(); set({ [key]: Math.min(100, Math.max(0, st[key] + d)) } as Partial<PanelState>); });
    });
    const lang = scr.getAttribute('lang') || 'en';
    const tick = () => {
      const now = new Date();
      $('[data-ps-time]').textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Muscat' }).format(now);
      $('[data-ps-date]').textContent = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Muscat' }).format(now);
    };
    // visible while the tour is stopped here (`showing`) or while the moving film has the screen in full view (`tracking`)
    let showing = false, tracking = false, awake = false;
    const reset = () => { clearTimeout(wake); clearInterval(clock); clock = 0; awake = false; scr.classList.remove('is-awake'); const prev = st; st = { ...PANEL_DEFAULT }; render(prev); $('[data-ps-time]').textContent = PANEL_DEFAULT.time; };
    const vis = () => {
      if (showing || tracking) { if (scr.hidden) { scr.hidden = false; void scr.offsetWidth; } scr.classList.add('is-on'); return; }
      scr.classList.remove('is-on');
      later(() => { if (!showing && !tracking) { scr.hidden = true; reset(); } }, 600); // fully gone: back to the film's state for the next visit
    };
    return {
      place(f, w, H, frame) { const q = f.quads.screen; if (q) scr.style.transform = quadMatrix(PW, PH, quadPx(q, w, H, frame)); },
      enter() {
        showing = true; vis();
        // a beat after the handoff (the baked frame shows the very same state), the screen wakes: live clock and date
        if (!awake) wake = later(() => { awake = true; scr.classList.add('is-awake'); tick(); clock = window.setInterval(tick, 1000); }, 800);
      },
      leave() { showing = false; vis(); },
      track(q, w, H, frame) {
        if (q) scr.style.transform = quadMatrix(PW, PH, quadPx(q, w, H, frame));
        const on = !!q; if (on !== tracking) { tracking = on; scr.classList.toggle('is-tracking', on); vis(); }
      },
    };
  }

  /* ---------------- the light switch ---------------- */
  function switchLive(): Live {
    const box = el('div', 'live-switch', layer, { 'data-live': '', 'data-live-ui': '' });
    const dim = el('i', 'live-dim', layer);
    let n = 0; const dots: HTMLElement[] = [], hits: HTMLButtonElement[] = [], on: boolean[] = [];
    const update = () => { const off = on.filter((v) => !v).length; dim.classList.toggle('is-on', off > 0); dim.style.opacity = off ? String(0.35 + 0.65 * (off / Math.max(1, n))) : ''; dots.forEach((d, i) => d.classList.toggle('is-off', !on[i])); hits.forEach((h, i) => h.setAttribute('aria-pressed', String(on[i]))); };
    const ensure = (k: number) => {
      while (n < k) { const i = n++; on.push(true); const d = el('i', 'live-dot', box); dots.push(d);
        const b = el('button', 'live-hit', box, { type: 'button', 'aria-label': `${t.tLight ?? 'Light'} ${i + 1}`, 'aria-pressed': 'true' }) as HTMLButtonElement; hits.push(b);
        b.addEventListener('click', (e) => { e.stopPropagation(); on[i] = !on[i]; update(); }); }
    };
    return {
      place(f, w, H, frame) {
        const pts = Object.keys(f.points).filter((k) => k.startsWith('led_')).sort().map((k) => toPx(f.points[k], w, H, frame)); ensure(pts.length);
        pts.forEach((p, i) => { at(dots[i], p); at(hits[i], p); });
        if (pts.length) { const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length; dim.style.setProperty('--x', `${(cx / w) * 100}%`); dim.style.setProperty('--y', `${(cy / H) * 100}%`); }
      },
      enter() { box.classList.add('is-on'); },
      leave() { box.classList.remove('is-on'); on.fill(true); update(); },
    };
  }

  /* ---------------- the lock's keypad ---------------- */
  function lockLive(): Live {
    const kp = el('div', 'live-keypad', layer, { 'data-live': '', 'data-live-ui': '' });
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''];
    const btns: HTMLButtonElement[] = [];
    keys.forEach((k, i) => { if (!k) return; const b = el('button', '', kp, { type: 'button', 'aria-label': k }) as HTMLButtonElement; b.textContent = k; b.style.left = `${256 * (0.22 + (i % 3) * 0.28)}px`; b.style.top = `${512 * (0.2 + Math.floor(i / 3) * 0.17)}px`; btns.push(b);
      b.addEventListener('click', (e) => { e.stopPropagation(); b.classList.add('is-lit'); window.setTimeout(() => b.classList.remove('is-lit'), 420); }); });
    el('i', 'live-ok', kp, { role: 'img', 'aria-label': t.tUnlocked ?? 'Unlocked' }); // the green tick
    const timers: number[] = [];
    return {
      place(f, w, H, frame) { const q = f.quads.keypad; if (q) kp.style.transform = quadMatrix(256, 512, quadPx(q, w, H, frame)); },
      enter() {
        kp.classList.add('is-on');
        // the code is entered: four digits glow in turn, then the lock opens
        [2, 6, 3, 9].forEach((d, k) => { const b = btns.find((x) => x.textContent === String(d))!; timers.push(later(() => b.classList.add('is-lit'), 500 + k * 380), later(() => b.classList.remove('is-lit'), 800 + k * 380)); });
        timers.push(later(() => kp.classList.add('is-open'), 2200));
      },
      leave() { timers.splice(0).forEach(clearTimeout); kp.classList.remove('is-on', 'is-open'); btns.forEach((b) => b.classList.remove('is-lit')); },
    };
  }

  /* ---------------- smoke detector ---------------- */
  function smokeLive(): Live {
    const box = el('div', 'live-smoke', layer, { 'data-live': '', 'data-live-ui': '' });
    const ledEl = el('i', 'live-led', box); const test = el('button', 'live-test', box, { type: 'button' }) as HTMLButtonElement; test.textContent = t.tTest ?? 'Test';
    let alarm = 0;
    test.addEventListener('click', (e) => { e.stopPropagation(); ledEl.classList.remove('is-alarm'); void ledEl.offsetWidth; ledEl.classList.add('is-alarm'); clearTimeout(alarm); alarm = window.setTimeout(() => ledEl.classList.remove('is-alarm'), 3200); });
    return {
      place(f, w, H, frame) { const p = f.points.led_0; if (p) at(ledEl, toPx(p, w, H, frame)); const b = f.points.btn_test ?? p; if (b) at(test, toPx(b, w, H, frame)); },
      enter() { box.classList.add('is-on'); },
      leave() { box.classList.remove('is-on'); ledEl.classList.remove('is-alarm'); },
    };
  }

  /* ---------------- ceiling speaker ---------------- */
  function speakerLive(): Live {
    const g = el('div', 'live-grille is-playing', layer, { 'data-live': '', 'data-live-ui': '' });
    for (let i = 0; i < 3; i++) el('i', '', g);
    const b = el('button', '', g, { type: 'button', 'aria-label': t.tSound ?? 'Sound', 'aria-pressed': 'true' }) as HTMLButtonElement;
    b.addEventListener('click', (e) => { e.stopPropagation(); const on = !g.classList.contains('is-playing'); g.classList.toggle('is-playing', on); b.setAttribute('aria-pressed', String(on)); });
    return {
      place(f, w, H, frame) { const q = f.quads.grille; if (q) g.style.transform = quadMatrix(400, 400, quadPx(q, w, H, frame)); },
      enter() { g.classList.add('is-on', 'is-playing'); },
      leave() { g.classList.remove('is-on'); },
    };
  }

  /* ---------------- curtain motor ---------------- */
  function railLive(): Live {
    const box = el('div', 'live-rail', layer, { 'data-live': '' }); const b = el('i', 'live-blink', box);
    return {
      place(f, w, H, frame) { const p = f.points.led_0; if (p) at(b, toPx(p, w, H, frame)); },
      enter() { box.classList.add('is-on'); },
      leave() { box.classList.remove('is-on'); },
    };
  }

  const make: Record<string, () => Live | null> = { panel: panelLive, switch: switchLive, lock: lockLive, puck: smokeLive, disc: speakerLive, rail: railLive };
  const get = (i: number, shape: string) => { if (!built.has(i)) built.set(i, make[shape]?.() ?? null); return built.get(i) ?? null; };
  let features: Features | null = null, frameNow: Frame, stop = -1;
  return {
    /** stop `i` (recipe `shape`) has arrived: pin its live layer onto the recorded features and bring it to life */
    show(i: number, shape: string | undefined, f: Features | null | undefined, frame?: Frame) {
      cur?.leave(); cur = null; features = f ?? null; frameNow = frame; stop = i;
      publishDevice(root, i, f); // the HUD keeps its panel clear of what is known of the device (film/hud.ts)
      if (!f || !shape || !make[shape]) return;
      const live = get(i, shape); if (!live) return;
      live.place(f, root.clientWidth, root.clientHeight, frame); live.enter(); cur = live;
    },
    /** re-place (resize, or every frame in the live 3D where the features are projected live) */
    place(f?: Features | null, frame?: Frame) { if (f) { features = f; if (stop >= 0) publishDevice(root, stop, f); } if (frame !== undefined) frameNow = frame; if (cur && features) cur.place(features, root.clientWidth, root.clientHeight, frameNow); },
    hide() { cur?.leave(); cur = null; features = null; },
    /** the moving film: pin the panel (stop `i`) to its screen on this frame, or let it go (`q` null) */
    trackPanel(i: number, q: number[][] | null, frame?: Frame) { const live = i >= 0 ? get(i, 'panel') : null; live?.track?.(q, root.clientWidth, root.clientHeight, frame); },
  };
}
