/**
 * Live devices on the paused film: when the tour stops on a device, real HTML is pinned onto it — onto the quads and
 * points recorded with the film (film.json `features`, or projected every frame in the live 3D) — and it comes alive:
 *   panel   the control panel's screen as a working UI (components/PanelScreen.astro, same layout as the baked pixels)
 *   switch  backlit dots you can tap: each gang toggles, and the room dims as its lights go off
 *   lock    the four ways in, one after another, each where it happens on the lock and named in the HUD beside it: a card read,
 *           a fingerprint, a face scanned, a password keyed in; after each the lock's light goes green. Digits are tappable
 *   puck    the smoke detector's green heartbeat; "Test" pulses it red with a spreading ring
 *   disc    sound rings spreading from the speaker grille; tap to pause
 *   rail    the curtain motor's status LED blinks
 * Everything lives inside the callout layer, so it drifts with the held frame; interactive parts are real buttons (or a
 * [data-live-ui] slider), so taps on them never advance the tour.
 *
 * The hand-over is only ever made at rest (2 Oct 2026). A layer comes up over the held frame once the move has ended, and `hide()`
 * takes it down quickly before the next move starts (the player waits for it): HTML pinned to a moving picture trails it by a
 * frame, which at the film's pace is a third of the panel's own width, so nothing is pinned while the film moves.
 */
import { toPx, quadMatrix, type Frame } from './homography';
import { SCENES, PANEL_DEFAULT, PW, PH, FULL, PILL_HEAD, type PanelState } from '@/data/panel-ui';
import { publishDevice } from './hud';

export interface Features { quads: Record<string, number[][]>; points: Record<string, number[]> }
interface Live { place(f: Features, w: number, H: number, frame?: Frame): void; enter(): void; leave(): void }

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
    // One wake, in one breath: the live screen comes up over the filmed one looking as the film shows it (a little hazed and
    // muted: glass, a grade), and as it arrives it clears to its own contrast; the clock and the date turn over to the real ones in
    // the middle of that, under a short dip. Before it there were three separate steps (a fade, a brightening, a swapped clock)
    let showing = false, awake = false;
    const reset = () => { clearTimeout(wake); clearInterval(clock); clock = 0; awake = false; scr.classList.remove('is-awake', 'is-turning'); const prev = st; st = { ...PANEL_DEFAULT }; render(prev); $('[data-ps-time]').textContent = PANEL_DEFAULT.time; };
    return {
      place(f, w, H, frame) { const q = f.quads.screen; if (q) scr.style.transform = quadMatrix(PW, PH, quadPx(q, w, H, frame)); },
      enter() {
        showing = true; if (scr.hidden) { scr.hidden = false; void scr.offsetWidth; } scr.classList.add('is-on');
        if (!awake) wake = later(() => {
          awake = true; scr.classList.add('is-awake', 'is-turning');
          later(() => { if (!showing) return; tick(); clock = window.setInterval(tick, 1000); scr.classList.remove('is-turning'); }, 380);
        }, 420);
      },
      // back to what the film shows, and gone before the film moves (device-live `hide` gives it 170 ms)
      leave() { showing = false; clearTimeout(wake); scr.classList.remove('is-on'); later(() => { if (!showing) { scr.hidden = true; reset(); } }, 240); },
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

  /* ---------------- the lock: the four ways in ---------------- */
  function lockLive(): Live {
    const box = el('div', 'live-lock', layer, { 'data-live': '' });
    const kp = el('div', 'live-keypad', layer, { 'data-live': '', 'data-live-ui': '' });
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''];
    const btns: HTMLButtonElement[] = [];
    keys.forEach((k, i) => { if (!k) return; const b = el('button', '', kp, { type: 'button', 'aria-label': k }) as HTMLButtonElement; b.textContent = k; b.style.left = `${256 * (0.22 + (i % 3) * 0.28)}px`; b.style.top = `${512 * (0.2 + Math.floor(i / 3) * 0.17)}px`; btns.push(b);
      b.addEventListener('click', (e) => { e.stopPropagation(); b.classList.add('is-lit'); window.setTimeout(() => b.classList.remove('is-lit'), 420); }); });
    // where each way in happens on the lock: the reader under the camera, the handle's flank, the lens window, the keypad; and the
    // lock's own light, which goes green as each is accepted
    const fx = { card: el('i', 'live-card', box), finger: el('i', 'live-finger', box), face: el('i', 'live-face', box) }, led = el('i', 'live-lockled', box, { role: 'img', 'aria-label': t.tUnlocked ?? 'Unlocked' });
    // the HUD's widget beside it names the same way in and shows it read, then granted (Walkthrough.astro `data-w-lock`)
    const hud = root.querySelector<HTMLElement>('[data-w-lock]'), chips = Array.from(hud?.querySelectorAll<HTMLElement>('.w-methods li') ?? []), cap = root.querySelector<HTMLElement>('[data-w-method]');
    const WAYS = ['card', 'finger', 'face', 'password'] as const, STEP = 2500;
    const timers: number[] = []; let on = false;
    const after = (fn: () => void, ms: number) => { timers.push(window.setTimeout(() => { if (on) fn(); }, ms)); };
    const clear = () => { for (const k of Object.values(fx)) k.classList.remove('is-on'); btns.forEach((b) => b.classList.remove('is-lit')); led.classList.remove('is-ok'); hud?.classList.remove('is-scan', 'is-ok'); };
    const run = (n: number) => {
      const way = WAYS[n % WAYS.length]; clear();
      if (hud) hud.dataset.m = way; chips.forEach((c) => c.classList.toggle('is-on', c.dataset.m === way)); if (cap) cap.textContent = chips.find((c) => c.dataset.m === way)?.textContent ?? cap.textContent;
      after(() => { hud?.classList.add('is-scan'); if (way === 'password') [2, 6, 3, 9].forEach((d, k) => { const b = btns.find((x) => x.textContent === String(d))!; after(() => b.classList.add('is-lit'), k * 250); after(() => b.classList.remove('is-lit'), 330 + k * 250); }); else fx[way].classList.add('is-on'); }, 150);
      after(() => { hud?.classList.remove('is-scan'); hud?.classList.add('is-ok'); led.classList.add('is-ok'); }, 1450);
      after(() => run(n + 1), STEP);
    };
    return {
      place(f, w, H, frame) {
        const q = f.quads.keypad; if (!q) return; const px = quadPx(q, w, H, frame);
        kp.style.transform = quadMatrix(256, 512, px);
        box.style.setProperty('--u', `${Math.hypot(px[1][0] - px[0][0], px[1][1] - px[0][1]).toFixed(1)}px`); // the keypad's width on screen (51 mm on the lock): the effects' unit
        for (const [name, node] of [['btn_card', fx.card], ['btn_finger', fx.finger], ['btn_face', fx.face], ['led_0', led]] as const) { const p = f.points[name]; node.hidden = !p; if (p) at(node, toPx(p, w, H, frame)); }
      },
      enter() {
        on = true; box.classList.add('is-on'); kp.classList.add('is-on');
        if (opts.reduced) { chips.forEach((c) => c.classList.add('is-on')); hud?.classList.add('is-ok'); led.classList.add('is-ok'); return; }
        after(() => run(0), 900);
      },
      leave() { on = false; timers.splice(0).forEach(clearTimeout); box.classList.remove('is-on'); kp.classList.remove('is-on'); clear(); chips.forEach((c) => c.classList.remove('is-on')); },
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
      cur?.leave(); cur = null; features = f ?? null; frameNow = frame; stop = i; layer.classList.remove('is-leaving');
      publishDevice(root, i, f); // the HUD keeps its panel clear of what is known of the device (film/hud.ts)
      if (!f || !shape || !make[shape]) return;
      const live = get(i, shape); if (!live) return;
      live.place(f, layer.clientWidth, layer.clientHeight, frame); live.enter(); cur = live;
    },
    /** re-place (resize, or every frame in the live 3D where the features are projected live) */
    place(f?: Features | null, frame?: Frame) { if (f) { features = f; if (stop >= 0) publishDevice(root, stop, f); } if (frame !== undefined) frameNow = frame; if (cur && features) cur.place(features, layer.clientWidth, layer.clientHeight, frameNow); },
    /** take the layer down; resolves once it is off the picture (the film may then move) */
    hide(now = false) {
      const was = cur; cur?.leave(); cur = null; features = null; if (!was || now || opts.reduced) return Promise.resolve();
      layer.classList.add('is-leaving'); return new Promise<void>((res) => window.setTimeout(res, 170));
    },
  };
}
