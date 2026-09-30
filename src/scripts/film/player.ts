/**
 * The landing film: a looping hero shot, then one clip per device. Tap anywhere to play the next
 * move; the film pauses on each device with a callout anchored beside it (a hairline leader runs
 * from the text to the device). Pure <video> (H.264), so it is as smooth on an old office PC as on
 * a new Mac. Clips come from src/data/film.json (scripts/film-encode.mjs); the 3D walkthrough is
 * still available with ?live3d.
 */
import film from '@/data/film.json';
import house from '@/data/house.json';
import { createCalloutPlacer } from './callout';
import { createDeviceLive, type Features } from './device-live';
import { createToneSampler } from './tone';

interface Rung { h: number; w: number; avc: string | null; hevc: string | null }
interface Clip { id: string; loop: boolean; ends: string | null; duration: number; src: string; srcMobile: string; srcHevc?: string; srcHevcMobile?: string; rungs?: Rung[]; poster: string; last: string; hotspot: number[] | null; features?: Features | null; fps?: number; track?: string | null }
interface Track { fps: number; panel: (number[] | 0)[] }
type State = 'loading' | 'exterior' | 'travelling' | 'stop' | 'done';

export function mountFilm(root: HTMLElement) {
  const clips = new Map((film.clips as Clip[]).map((c) => [c.id, c]));
  const stops = house.stops.map((s) => s.id);
  const n = stops.length;
  const q = new URLSearchParams(location.search);
  const small = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const lowData = !!conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const returning = (() => { try { return sessionStorage.getItem('alrawi-walk') === 'done'; } catch { return false; } })();
  const hero = clips.get('hero');

  const ui = {
    prompt: root.querySelector<HTMLElement>('[data-walk-prompt]')!, tap: root.querySelector<HTMLButtonElement>('[data-walk-tap]')!,
    load: root.querySelector<HTMLElement>('[data-walk-load]')!, bar: root.querySelector<HTMLElement>('[data-walk-bar]')!,
    card: root.querySelector<HTMLElement>('[data-walk-card]')!, cards: Array.from(root.querySelectorAll<HTMLElement>('[data-walk-stop]')),
    nexts: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-walk-next]')), steps: Array.from(root.querySelectorAll<HTMLElement>('[data-walk-step]')),
    counter: root.querySelector<HTMLElement>('[data-walk-counter]')!, skip: root.querySelector<HTMLElement>('[data-walk-skip]')!,
    hint: root.querySelector<HTMLElement>('[data-walk-hint]')!, host: root.querySelector<HTMLElement>('[data-walk-canvas]')!,
    callouts: root.querySelector<HTMLElement>('[data-walk-callouts]')!, hotspot: root.querySelector<HTMLElement>('[data-walk-hotspot]')!,
    leader: root.querySelector<SVGSVGElement>('[data-walk-leader]')!, halo: root.querySelector<SVGPathElement>('[data-walk-leader-halo]')!, line: root.querySelector<SVGPathElement>('[data-walk-leader-line]')!,
  };
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  let state: State = 'loading'; let idx = -1;
  let videoW = 1920, videoH = 1080; // every clip is 16:9; refined from the playing video when known

  const lockScroll = (on: boolean) => {
    document.body.classList.toggle('no-scroll', on); document.body.classList.toggle('is-walking', on);
    nav?.classList.toggle('is-off', on);
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis; on ? lenis?.stop() : lenis?.start();
  };
  const showCard = (i: number) => {
    ui.cards.forEach((c, k) => (c.hidden = k !== i));
    ui.card.classList.toggle('is-on', i >= 0);
    if (i < 0) { ui.callouts.classList.remove('is-on'); ui.hotspot.classList.remove('is-on'); }
    ui.steps.forEach((s, k) => { s.classList.toggle('is-done', k < i); s.classList.toggle('is-on', k === i); });
    ui.counter.textContent = i >= 0 ? `${i + 1} / ${n}` : '';
    ui.nexts.forEach((b) => { b.firstChild!.textContent = (i === n - 1 ? b.dataset.finish! : b.dataset.next!) + ' '; });
    ui.hint.classList.toggle('is-on', i >= 0 && i < n - 1);
  };
  // callouts: shared with the live 3D walkthrough (film/callout.ts); the device is a normalised point in the 16:9 picture
  const placer = createCalloutPlacer(root, ui, { reduced });
  const placeCallout = (i: number, h: number[] | null) => placer.place(i, h, { w: videoW, h: videoH });
  // live devices on the held frame (the panel's working screen, the switch's backlit dots, the keypad, …)
  const liveLayer = root.querySelector<HTMLElement>('[data-walk-live]');
  const live = liveLayer ? createDeviceLive(root, liveLayer, { reduced }) : null;
  const shapes = ui.cards.map((c) => c.dataset.shape);
  const tone = createToneSampler(root); // ivory or dark ink for the chrome, from the picture under it
  const isControl = (e: Event) => !!(e.target as Element | null)?.closest?.('a, button, .walk-load, [data-live-ui], [data-panel-screen]');
  if (!returning) nav?.classList.add('is-off');

  // ---------- still-image fallback: reduced motion, data saver, or no film published yet ----------
  if (reduced || lowData || !hero || q.has('slides')) {
    const host = root.querySelector<HTMLElement>('[data-walk-slides]')!; host.hidden = false;
    const frames = [hero ? { u: hero.poster, h: null as number[] | null, f: null as Features | null } : null, ...stops.map((id) => { const c = clips.get(id); return c ? { u: c.last, h: c.hotspot, f: c.features ?? null } : null; })].filter(Boolean) as { u: string; h: number[] | null; f: Features | null }[];
    const imgs = frames.map((f) => { const im = new Image(); im.src = f.u; im.alt = ''; im.decoding = 'async'; host.appendChild(im); return im; });
    let k = 0;
    const show = (i: number) => { k = i; imgs.forEach((im, j) => im.classList.toggle('is-on', j === i)); if (imgs[i].complete) tone.sample(imgs[i], true); else imgs[i].addEventListener('load', () => { if (k === i) tone.sample(imgs[i], true); }, { once: true }); showCard(i - 1); if (i > 0) { placeCallout(i - 1, frames[i].h); live?.show(i - 1, shapes[i - 1], frames[i].f, { w: 16, h: 9 }); } else live?.hide(); ui.prompt.classList.toggle('is-on', i === 0); root.classList.toggle('is-prompt', i === 0); };
    const advance = () => { if (k >= imgs.length - 1) { finish(); return; } show(k + 1); };
    const finish = () => { showCard(-1); lockScroll(false); try { sessionStorage.setItem('alrawi-walk', 'done'); } catch { /* ignore */ } setTimeout(() => document.getElementById('philosophy')?.scrollIntoView({ behavior: 'smooth' }), 300); show(0); };
    show(0); root.classList.add('is-live'); ui.load.classList.add('is-done'); if (!returning) lockScroll(true);
    root.addEventListener('click', (e) => { if (!isControl(e)) advance(); }); ui.nexts.forEach((b) => b.addEventListener('click', advance)); ui.tap.addEventListener('click', advance);
    ui.skip.addEventListener('click', (e) => { e.preventDefault(); finish(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); } if (e.key === 'ArrowLeft' && k > 0) show(k - 1); });
    addEventListener('resize', () => { if (k > 0) { placeCallout(k - 1, frames[k].h); live?.place(frames[k].f, { w: 16, h: 9 }); } });
    return;
  }

  // ---------- film ----------
  const stage = document.createElement('div'); stage.className = 'walk-film';
  const mk = () => { const v = document.createElement('video'); v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto'; v.disablePictureInPicture = true; v.className = 'walk-video'; v.setAttribute('aria-hidden', 'true'); stage.appendChild(v); return v; };
  let front = mk(), back = mk();
  ui.host.appendChild(stage);
  ui.load.classList.add('is-done');

  // ---------- which picture: the ladder rung (720p … 1440p) that fills this screen's pixels on what this device decodes smoothly ----------
  // HEVC where the browser decodes it in hardware (Safari and Apple devices, Chrome/Edge on most GPUs since 2016): ~40 % less to
  // download for the same picture
  const CODEC: Record<number, { avc: string; hevc: string; bps: number }> = {
    720: { avc: 'avc1.640020', hevc: 'hvc1.1.6.L93.B0', bps: 3e6 }, 1080: { avc: 'avc1.64002A', hevc: 'hvc1.1.6.L123.B0', bps: 7e6 },
    1440: { avc: 'avc1.640033', hevc: 'hvc1.1.6.L150.B0', bps: 12e6 },
  };
  const hevc = (() => { try { return document.createElement('video').canPlayType(`video/mp4; codecs="${CODEC[1080].hevc}"`) === 'probably' || document.createElement('video').canPlayType('video/mp4; codecs="hvc1"') === 'probably'; } catch { return false; } })();
  const nav_ = navigator as Navigator & { deviceMemory?: number; connection?: { downlink?: number } };
  const ladder = [720, 1080, 1440].filter((h) => (hero?.rungs ?? []).some((r) => r.h === h && (hevc ? r.hevc : r.avc)) || (!hero?.rungs && h <= 1080));
  const DROP_KEY = 'alrawi-film-cap';
  /** the tallest rung worth fetching: the covered picture's rows in device pixels, then capped by what the device and line can carry */
  const target = () => {
    const dpr = Math.min(3, devicePixelRatio || 1);
    const rows = Math.max(innerWidth * 9 / 16, innerHeight) * dpr; // object-fit: cover spans at least this many screen pixels vertically
    let cap = 1440;
    const phone = Math.min(screen.width, screen.height) < 600, tablet = !phone && small;
    if (phone) cap = 1080; else if (tablet) cap = 1440; // phones decode 1080p60 in their sleep; more is data, not detail at arm's length
    if (nav_.deviceMemory && nav_.deviceMemory <= 2) cap = 720; else if (nav_.deviceMemory && nav_.deviceMemory <= 4) cap = Math.min(cap, 1080);
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) cap = Math.min(cap, 1080);
    // Mb/s, Chromium's estimate: coarse and often low on a first visit, so only a clearly slow line caps the start; the hero's own
    // measured download (`measureLine`) settles the rest
    const dl = nav_.connection?.downlink; if (dl) { if (dl < 1) cap = 720; else if (dl < 3) cap = Math.min(cap, 1080); }
    try { const c = +(sessionStorage.getItem(DROP_KEY) || 0); if (c) cap = Math.min(cap, c); } catch { /* ignore */ } // this visit already dropped frames
    const want = ladder.find((h) => h >= rows * 0.85) ?? ladder[ladder.length - 1] ?? 1080;
    return Math.min(want, cap);
  };
  let rungH = 1080, ceiling = 1080, dropCap = 1440;
  /** walk down from the target until the browser says the rung decodes smoothly (and, above 1080p, in hardware) */
  const chooseRung = async () => {
    let h = target();
    const mc = (navigator as Navigator & { mediaCapabilities?: { decodingInfo(c: unknown): Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }> } }).mediaCapabilities;
    for (; mc; ) {
      const k = CODEC[h]; const r = ladder.filter((x) => x <= h);
      if (!k || !r.length) break;
      try {
        const info = await Promise.race([mc.decodingInfo({ type: 'file', video: { contentType: `video/mp4; codecs="${hevc ? k.hevc : k.avc}"`, width: Math.round(h * 16 / 9), height: h, bitrate: k.bps, framerate: 60 } }), new Promise<null>((res) => setTimeout(() => res(null), 400))]);
        if (!info || (info.supported && info.smooth && (h <= 1080 || info.powerEfficient))) break;
      } catch { break; }
      const lower = ladder.filter((x) => x < h); if (!lower.length) break; h = lower[lower.length - 1];
    }
    const forced = +(q.get('rung') || 0); if (ladder.includes(forced)) h = forced; // dev/QA: ?rung=720|1080|1440
    ceiling = rungH = h;
  };
  /** Mb/s a rung's moves need to stream faster than they play (60 fps caps from film-encode.mjs, with headroom) */
  const NEED: Record<number, [number, number]> = { 720: [6, 4], 1080: [14, 9], 1440: [24, 15] }; // [H.264, HEVC]
  /** Once the hero has fully downloaded, its resource timing says how fast this line really is: the moves step down to the rung
   *  the line can stream (never up: the start rung is already the most the screen and the device want). A hero still not buffered
   *  after 20 s means a slow line. */
  const measureLine = (v: HTMLVideoElement) => new Promise<number | null>((res) => {
    const t0 = performance.now(); let done = false;
    const finish = (mbps: number | null) => { if (done) return; done = true; v.removeEventListener('progress', check); clearInterval(iv); res(mbps); };
    const check = () => {
      const b = v.buffered; const full = b.length && b.end(b.length - 1) >= (v.duration || 1e9) - 0.25;
      if (full) {
        const url = new URL(v.currentSrc || v.src, location.href).href;
        const es = performance.getEntriesByType('resource').filter((e) => e.name === url) as PerformanceResourceTiming[];
        const bytes = es.reduce((a, e) => a + (e.transferSize || 0), 0);
        if (bytes < 5e5) { finish(null); return; } // served from cache: nothing learnt about the line
        const span = Math.max(...es.map((e) => e.responseEnd)) - Math.min(...es.map((e) => e.startTime));
        finish(span > 0 ? (bytes * 8) / (span * 1000) : null);
      } else if (performance.now() - t0 > 20000) finish(0);
    };
    const iv = setInterval(check, 1000); v.addEventListener('progress', check); check();
  });
  const fitLine = (mbps: number | null) => {
    if (mbps === null) return;
    const fits = ladder.filter((h) => h <= ceiling && NEED[h][hevc ? 1 : 0] > 0 && mbps >= NEED[h][hevc ? 1 : 0]);
    rungH = Math.min(rungH, dropCap, fits.length ? fits[fits.length - 1] : ladder[0] ?? 720);
  };
  const srcOf = (c: Clip) => {
    if (c.rungs?.length) {
      const ok = c.rungs.filter((r) => (hevc ? r.hevc : r.avc)).sort((a, b) => a.h - b.h);
      const r = [...ok].reverse().find((x) => x.h <= rungH) ?? ok[0];
      if (r) return (hevc ? r.hevc : r.avc)!;
    }
    const lowRes = rungH < 1080 || (small && !c.rungs);
    return hevc && c.srcHevc && c.srcHevcMobile ? (lowRes ? c.srcHevcMobile : c.srcHevc) : lowRes ? c.srcMobile : c.src;
  };
  /** the safety net: a clip that dropped more than 8 % of its frames moves every later clip (and this visit) one rung down */
  const judge = (v: HTMLVideoElement) => {
    const pq = v.getVideoPlaybackQuality?.(); if (!pq || pq.totalVideoFrames < 90) return;
    if (pq.droppedVideoFrames / pq.totalVideoFrames <= 0.08) return;
    const lower = ladder.filter((x) => x < rungH); if (!lower.length) return;
    rungH = dropCap = lower[lower.length - 1]; try { sessionStorage.setItem(DROP_KEY, String(rungH)); } catch { /* ignore */ }
  };
  const tracks = new Map<string, Promise<Track | null>>();
  const loadTrack = (c: Clip) => { if (!c.track) return null; if (!tracks.has(c.track)) tracks.set(c.track, fetch(c.track).then((r) => (r.ok ? r.json() : null)).catch(() => null)); return tracks.get(c.track)!; };
  const panelIdx = stops.indexOf('panel');
  const prepare = (v: HTMLVideoElement, c: Clip) => { void loadTrack(c); const u = srcOf(c); if (v.dataset.clip === c.id && v.dataset.src === u) return; v.dataset.clip = c.id; v.dataset.src = u; v.poster = c.poster; v.src = u; v.load(); };
  /** while `v` plays clip `c`, keep the control panel's live screen pinned to it frame by frame (its recorded track) */
  const follow = async (v: HTMLVideoElement, c: Clip) => {
    const t = await loadTrack(c); if (!t || !live || panelIdx < 0) return;
    const quad = (f: number) => { const q = t.panel[Math.max(0, Math.min(t.panel.length - 1, f))]; return q ? [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]] : null; };
    const rv = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, m: { mediaTime: number }) => void) => number }).requestVideoFrameCallback;
    const step = (time: number) => { if (v !== front || v.dataset.clip !== c.id) { live.trackPanel(panelIdx, null); return false; } live.trackPanel(panelIdx, quad(Math.round(time * t.fps)), { w: videoW, h: videoH }); return !v.ended; };
    if (rv) { const cb = (_: number, m: { mediaTime: number }) => { if (step(m.mediaTime)) rv.call(v, cb); else live.trackPanel(panelIdx, null); }; rv.call(v, cb); }
    else { const loop = () => { if (step(v.currentTime)) requestAnimationFrame(loop); else live.trackPanel(panelIdx, null); }; requestAnimationFrame(loop); }
  };
  const nextClipId = () => (state === 'exterior' ? stops[0] : idx < n - 1 ? stops[idx + 1] : 'outro');
  const ready = (v: HTMLVideoElement) => new Promise<void>((res) => { if (v.readyState >= 3) { res(); return; } const on = () => { v.removeEventListener('canplay', on); res(); }; v.addEventListener('canplay', on); });
  /** The first decoded frame of the new clip (so the dissolve never starts on a blank or poster frame). */
  const firstFrame = (v: HTMLVideoElement) => new Promise<void>((res) => {
    const t = setTimeout(res, 300); const done = () => { clearTimeout(t); res(); };
    const rv = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (rv) rv.call(v, done); else setTimeout(done, 40);
  });
  /** True over-dissolve: the outgoing picture stays at full opacity underneath; only the incoming one fades in. */
  const swap = () => {
    const old = front; old.classList.replace('is-front', 'is-under'); back.classList.add('is-front');
    front = back; back = old;
    setTimeout(() => { old.pause(); old.classList.remove('is-under'); }, 900);
  };
  let holdClip: Clip | null = null;
  addEventListener('resize', () => { if (state === 'stop' && holdClip) { placeCallout(idx, holdClip.hotspot); live?.place(holdClip.features, { w: videoW, h: videoH }); } });

  const play = async (c: Clip) => {
    state = 'travelling'; showCard(-1);
    if (c.track && idx === panelIdx && live) { const q = (await loadTrack(c))?.panel[0]; if (q) live.trackPanel(panelIdx, [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]], { w: videoW, h: videoH }); } // hand the screen straight to the track: no dip
    live?.hide(); ui.prompt.classList.remove('is-on'); root.classList.remove('is-prompt');
    prepare(back, c); back.loop = false;
    // the next move is normally buffered already (it was prepared on arrival); only a slow line ever sees the loader, and only after a beat
    const slow = back.readyState < 3 ? setTimeout(() => { ui.load.classList.remove('is-done'); ui.bar.style.width = '60%'; }, 250) : 0;
    if (back.readyState < 3) await ready(back);
    clearTimeout(slow); ui.load.classList.add('is-done');
    back.currentTime = 0;
    try { await back.play(); } catch { /* autoplay refusal: the poster frame still shows */ }
    await firstFrame(back);
    root.classList.remove('is-hold'); // the held drift eases back to rest as the new move begins
    swap();
    if (c.track) void follow(front, c); // the panel's screen stays live while the film moves past it
    if (front.videoWidth) { videoW = front.videoWidth; videoH = front.videoHeight; }
    await new Promise<void>((res) => { const done = () => { front.removeEventListener('ended', done); res(); }; front.addEventListener('ended', done); });
    judge(front);
  };
  const arrive = (i: number, c: Clip) => {
    state = 'stop'; idx = i; holdClip = c; tone.sample(front, true); showCard(i); placeCallout(i, c.hotspot);
    live?.show(i, shapes[i], c.features, { w: videoW, h: videoH }); // over the identical baked frame: the handoff is invisible, then it comes alive
    root.classList.add('is-hold'); // slow drift on the paused frame keeps it alive; the callout layer drifts with it
    const next = i < n - 1 ? clips.get(stops[i + 1]) : clips.get('outro'); if (next) prepare(back, next); // preload the next move
  };
  const finish = () => {
    state = 'done'; showCard(-1); live?.hide(); root.classList.remove('is-hold');
    lockScroll(false); try { sessionStorage.setItem('alrawi-walk', 'done'); } catch { /* ignore */ }
    root.classList.add('is-done');
    setTimeout(() => document.getElementById('philosophy')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    // back to the living hero shot for when the visitor scrolls up again
    prepare(back, hero); back.loop = true; void ready(back).then(async () => { back.currentTime = 0; void back.play().catch(() => {}); await firstFrame(back); swap(); state = 'exterior'; idx = -1; ui.prompt.classList.add('is-on'); root.classList.add('is-prompt'); });
  };
  const advance = async () => {
    if (state === 'travelling' || state === 'loading' || state === 'done') return;
    const id = nextClipId(); const c = clips.get(id); if (!c) { finish(); return; }
    if (state === 'exterior') lockScroll(true);
    await play(c);
    if (id === 'outro') { finish(); return; }
    arrive(stops.indexOf(id), c);
  };
  const back_ = async () => { // jump (cut) back to the previous device's paused frame
    if (state !== 'stop' || idx <= 0) return;
    const c = clips.get(stops[idx - 1]); if (!c) return;
    state = 'travelling'; showCard(-1); live?.hide(); root.classList.remove('is-hold');
    prepare(back, c); back.loop = false; await ready(back);
    back.currentTime = Math.max(0, c.duration - 0.05); await new Promise((r) => back.addEventListener('seeked', r, { once: true }));
    back.pause(); swap(); arrive(idx - 1, c);
  };

  ui.skip.addEventListener('click', (e) => { e.preventDefault(); finish(); });
  ui.tap.addEventListener('click', () => void advance()); ui.nexts.forEach((b) => b.addEventListener('click', () => void advance()));
  root.addEventListener('click', (e) => { if (!isControl(e) && (state === 'stop' || state === 'exterior')) void advance(); });
  window.addEventListener('keydown', (e) => {
    if (root.getBoundingClientRect().bottom < 80) return; // only while the hero is on screen
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); void advance(); }
    if (e.key === 'ArrowLeft') void back_();
  });
  // pause everything while the hero is off screen or the tab is hidden
  const io = new IntersectionObserver(([en]) => { if (!en.isIntersecting) { front.pause(); tone.stop(); } else { tone.watch(() => front); if (state === 'exterior' || state === 'travelling') void front.play().catch(() => {}); } }, { threshold: 0.05 });
  io.observe(root);
  document.addEventListener('visibilitychange', () => { if (document.hidden) front.pause(); else if (state === 'exterior' || state === 'travelling') void front.play().catch(() => {}); });

  // ---------- start: the hero loop behind the headline ----------
  void chooseRung().then(() => {
  prepare(front, hero); front.loop = true; front.classList.add('is-front');
  // the hero decodes a few seconds before any tap: if it already stutters, step down before the first move is fetched
  setTimeout(() => { if (state === 'exterior') judge(front); }, 5000);
  void ready(front).then(async () => {
    try { await front.play(); } catch { /* muted autoplay refused (rare): stay on the poster */ }
    root.classList.add('is-live'); tone.sample(front, true);
    state = 'exterior'; ui.prompt.classList.add('is-on'); root.classList.add('is-prompt');
    if (!returning) lockScroll(true);
    // warm the first move only once the hero has fully buffered, so it never competes with the hero on a slow line; a hover on the
    // tap button (a tap is coming) starts it early — but not any mouse move over the page, which fires the moment the page opens
    const first = clips.get(stops[0]);
    // the hero's download measures the line: the moves take the rung it carries
    const line = measureLine(front).then(fitLine).catch(() => {});
    if (first) {
      const warm = () => { if (state === 'exterior') prepare(back, first); };
      void line.then(() => setTimeout(warm, 800));
      // a pointer on the page (hover, or the touch before the tap) means a tap is coming: start buffering the first move now
      ui.tap.addEventListener('pointerenter', warm, { once: true }); root.addEventListener('pointerdown', warm, { once: true });
    }
    if (root.dataset.autoenter === '1') void advance();
  });
  });
  root.addEventListener('click', (e) => { if (state === 'loading' && !isControl(e)) root.dataset.autoenter = '1'; });
}
