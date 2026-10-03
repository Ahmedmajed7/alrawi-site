/**
 * The app scene: the living room the visitor runs from the phone (film/phone.ts). The film is a video, so the room was recorded
 * in every state the phone can put it in (scripts/record-film.mjs `--only=app-scene`, film-encode.mjs `scene`): one video of three
 * pictures stacked (the rooms' lights on, the table lamps alone, all off), the drapes going from parted to drawn over `frames`
 * frames and back again. Here that becomes a picture that answers the phone:
 *   - the drapes' position is a frame, and the drapes only ever get anywhere the way a motor gets them there: the half of the clip
 *     that runs the right way plays forwards (drawing them is the first half, parting them the second) and halts on the frame it
 *     was sent to. Open / Close / a scene start softly and run at 1.5×; a finger on the slider is followed quickly (up to 3×, a
 *     few frames behind it): a new mark the same way only moves the stop, and a seek happens only when the drapes turn round
 *     (onto the frame of the other half that shows them where they are). Seeking per pointer move made the drapes trail the
 *     finger in steps and crawl on after it let go (3 Oct 2026);
 *   - the room's file is fetched whole and played from memory (see `loadFile`);
 *   - the lights are light, added the way light adds: unlit room + the lamps' share × their level + the ceiling's share × its
 *     level, summed in linear light (a WebGL pass; a plain cross-fade of the encoded pictures greys the room on its way down).
 *     One dimmer runs both: the ceiling comes down first and the lamps' glow is what is left before the dark, as in a room.
 *     All three pictures come out of one decoded frame, so they can never be a frame apart.
 * The canvas sits in the film's stage over the paused clip, whose last frame is the scene's first (drapes parted, lights on): it
 * comes up over the identical picture, and when the tour moves on it dissolves back into it (the room returns to the film's own
 * state in that dissolve, nothing is played back to get there), and the room's video and its texture are let go of before the
 * camera sets off: a second decoder at work beside the film's own is what made the move out of the house stutter (3 Oct 2026).
 * Where the stacked video cannot be decoded (or the visitor gets stills instead of film: reduced motion, data saver), the six
 * corner stills are blended instead: the drapes dissolve between parted and drawn. The stills also stand in while the video is
 * still on its way (a slow line), and the video takes over as soon as it is in, so the phone answers from the first touch.
 */
export interface SceneRung { h: number; w: number; gap: number; avc: string | null; hevc: string | null }
export interface SceneClip { frames: number; fps: number; layers?: string[]; rungs: SceneRung[]; stills: Record<string, string> }
/** `curtain`: 1 = parted, 0 = drawn · `lights`: the dimmer, 1 = full, 0 = off */
export interface SceneState { curtain: number; lights: number }
export interface Scene {
  canvas: HTMLCanvasElement; readonly state: SceneState; readonly moving: boolean;
  /** the drapes' travel in frames: a curtain position the room can show exactly is a multiple of 1 / steps */
  readonly steps: number;
  /** start fetching (the stop before this one has been reached) */
  prepare(): void;
  /** the first frame is drawn (the film's own last frame) and the canvas is up */
  enter(): Promise<void>;
  /** `drag`: follow the finger (quickly) · `travel`: run there as the motor would */
  curtainTo(c: number, how: 'drag' | 'travel'): void;
  /** halt the drapes where they are */
  halt(): void;
  lightsTo(l: number, animate: boolean): void;
  /** dissolve back into the film's own frame and let go of the room's video; resolves once the canvas is off the picture */
  leave(now?: boolean): Promise<void>;
  onChange(cb: (s: SceneState, moving: boolean) => void): void;
}

// the three pictures stacked: H.264 / HEVC levels that hold w × 3h
const CODEC: Record<number, { avc: string; hevc: string }> = { 720: { avc: 'avc1.640032', hevc: 'hvc1.1.6.L150.B0' }, 1080: { avc: 'avc1.640033', hevc: 'hvc1.1.6.L153.B0' }, 1440: { avc: 'avc1.64003C', hevc: 'hvc1.1.6.L180.B0' } };
const LAYERS = 3; // on, lamps, off (top to bottom)
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
/** what the one dimmer asks of each circuit: the lamps are up by a third of its travel, the ceiling follows over the rest */
const lampsAt = (d: number) => ease(clamp(d / 0.3)), ceilingAt = (d: number) => Math.pow(clamp((d - 0.1) / 0.9), 1.5);
type RVFC = (cb: (now: number, m: { mediaTime: number }) => void) => number;
/** how the drapes get to their mark: top speed (× the recording), ms to reach it, frames over which they slow to a stop */
interface Pace { top: number; ramp: number; brake: number }
const MOTOR: Pace = { top: 1.5, ramp: 320, brake: 7 }, FINGER: Pace = { top: 3, ramp: 120, brake: 9 };
const wait = <T>(ms: number, v: T) => new Promise<T>((res) => setTimeout(() => res(v), ms));

const VERT = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `precision highp float; varying vec2 vUv; uniform sampler2D t; uniform float uLamps, uCeil, uH, uPitch, uInset;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 layer(float k) { return texture2D(t, vec2(vUv.x, k * uPitch + clamp(vUv.y, uInset, 1.0 - uInset) * uH)).rgb; }
void main() {
  vec3 on = layer(0.0);
  if (uLamps > 0.999 && uCeil > 0.999) { gl_FragColor = vec4(on, 1.0); return; } // the film's own picture, untouched
  vec3 lam = lin(layer(1.0)), off = lin(layer(2.0));
  // a dimmed lamp runs warmer: its share of the light leans amber as it comes down
  vec3 warm = mix(vec3(1.0, 0.86, 0.7), vec3(1.0), sqrt(uCeil));
  vec3 l = off + uLamps * (lam - off) * mix(vec3(1.0, 0.9, 0.78), vec3(1.0), uLamps) + uCeil * (lin(on) - lam) * warm;
  gl_FragColor = vec4(pow(max(l, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

export function createScene(host: HTMLElement, clip: SceneClip, opts: { hevc: boolean; rungH: () => number; still: boolean; reduced: boolean }): Scene {
  const canvas = document.createElement('canvas'); canvas.className = 'walk-scene'; canvas.setAttribute('aria-hidden', 'true'); host.appendChild(canvas);
  const N = clip.frames, last = N - 1, fps = clip.fps;
  const st: SceneState = { curtain: 1, lights: 1 };
  const subs: ((s: SceneState, moving: boolean) => void)[] = [];
  let mode: 'none' | 'video' | 'still' = 'none', lightTween = 0, stillTween = 0, entered = false, epoch = 0;
  /** where the visitor last sent the drapes (1 = parted): carried over when the picture changes hands (stills → video) */
  let aim = 1;
  /** where the drapes are headed in frames (0 = parted … last = drawn); null = at rest */
  let goal: number | null = null;
  const moving = () => goal !== null || !!stillTween;
  const tell = () => { for (const f of subs) f(st, moving() || !!lightTween); };

  /* ---------------- the painter: one source holding the three pictures, summed as light ---------------- */
  let gl: WebGLRenderingContext | null = null, ctx: CanvasRenderingContext2D | null = null, uni: Record<string, WebGLUniformLocation | null> = {};
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true }) as WebGLRenderingContext | null; // (the phone's thumbnail and the chrome's tone read this canvas)
    if (gl) {
      const sh = (type: number, src: string) => { const s = gl!.createShader(type)!; gl!.shaderSource(s, src); gl!.compileShader(s); if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? 'shader'); return s; };
      const pr = gl.createProgram()!; gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link'); gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      for (const k of ['uLamps', 'uCeil', 'uH', 'uPitch', 'uInset']) uni[k] = gl.getUniformLocation(pr, k);
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
    }
  } catch { gl = null; }
  if (!gl) ctx = canvas.getContext('2d');
  let lost = false, held: TexImageSource | null = null, geo = { w: 0, h: 0, gap: 0 };
  /** draw the room from `src` (three pictures of w × h, `gap` rows between them); `upload` false = the same frame, other lights */
  const paint = (src: CanvasImageSource & TexImageSource, w: number, h: number, gap: number, upload = true) => {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const a = lampsAt(st.lights), b = ceilingAt(st.lights); held = src; geo = { w, h, gap };
    if (gl && !lost) {
      const total = LAYERS * h + (LAYERS - 1) * gap;
      gl.viewport(0, 0, w, h);
      if (upload) { try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src); } catch { return; } }
      gl.uniform1f(uni.uLamps, a); gl.uniform1f(uni.uCeil, b); gl.uniform1f(uni.uH, h / total); gl.uniform1f(uni.uPitch, (h + gap) / total); gl.uniform1f(uni.uInset, 0.5 / h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (ctx) { // no WebGL: the same sum as cross-fades (close, a little greyer half-way)
      const row = (k: number) => ctx!.drawImage(src, 0, k * (h + gap), w, h, 0, 0, w, h);
      ctx.globalAlpha = 1; row(2); if (a > 0.002) { ctx.globalAlpha = a; row(1); } if (b > 0.002) { ctx.globalAlpha = b; row(0); } ctx.globalAlpha = 1;
    }
  };
  const repaint = () => { if (held) paint(held as CanvasImageSource & TexImageSource, geo.w, geo.h, geo.gap, false); };

  /* ---------------- stills: the six corners, the drapes dissolving between parted and drawn ---------------- */
  let stack: { open: HTMLCanvasElement; closed: HTMLCanvasElement; mix: HTMLCanvasElement; w: number; h: number } | null = null, stillReady: Promise<void> | null = null, mixed = -1;
  const loadStills = () => (stillReady ??= (async () => {
    const load = (u: string) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = u; });
    const s = clip.stills, names = [['onOpen', 'lampsOpen', 'offOpen'], ['onClosed', 'lampsClosed', 'offClosed']];
    const [open, closed] = await Promise.all(names.map((set) => Promise.all(set.map((k) => load(s[k] ?? s[k.replace('lamps', 'off')])))));
    const w = open[0].naturalWidth, h = open[0].naturalHeight;
    const pile = (ims: HTMLImageElement[]) => { const c = document.createElement('canvas'); c.width = w; c.height = h * LAYERS; const g = c.getContext('2d')!; ims.forEach((im, k) => g.drawImage(im, 0, k * h, w, h)); return c; };
    const mix = document.createElement('canvas'); mix.width = w; mix.height = h * LAYERS;
    stack = { open: pile(open), closed: pile(closed), mix, w, h };
  })());
  const drawStill = () => {
    if (!stack) return; const d = 1 - st.curtain, upload = Math.abs(d - mixed) > 0.0005;
    if (upload) { const g = stack.mix.getContext('2d')!; g.globalAlpha = 1; g.drawImage(stack.open, 0, 0); if (d > 0.002) { g.globalAlpha = d; g.drawImage(stack.closed, 0, 0); g.globalAlpha = 1; } mixed = d; }
    paint(stack.mix, stack.w, stack.h, 0, upload || held !== stack.mix);
  };

  /* ---------------- video: one stacked clip, there and back ---------------- */
  let v: HTMLVideoElement | null = null, rung: SceneRung | null = null;
  let seeking = false, watch = 0, landed: (() => void) | null = null;
  /** `stopAt`: the frame the clip is running to · `gen`: which play() a refusal belongs to · `stuck`: the browser will not play
   *  this video (power saving): the drapes step there by seeks instead */
  let stopAt = 0, gen = 0, t0 = 0, stuck = false, pace = MOTOR;
  const frameOf = (t: number) => clamp(Math.round(t * fps - 0.5 + 1e-3), 0, 2 * last);      // a frame shows from f / fps
  const posOf = (f: number) => (f <= last ? f : 2 * last - f);                                  // the drapes' position (0 = parted … last = drawn) on frame f
  const timeOf = (f: number) => (f + 0.5) / fps;
  let shown = 0; // the frame the canvas shows
  const drawVideo = (f: number) => {
    if (!v || !rung || v.readyState < 2) return;
    paint(v, rung.w, rung.h, rung.gap); shown = f; st.curtain = 1 - posOf(f) / last;
  };
  const draw = (frame = false) => { if (mode === 'video') { if (frame || !held) drawVideo(shown); else repaint(); } else if (mode === 'still') drawStill(); tell(); };
  const seekTo = (f: number) => {
    if (!v) return; seeking = true; clearTimeout(watch);
    // a seek that never lands (a decoder that gave up) must not hold the drapes for good
    watch = window.setTimeout(() => { if (seeking) { seeking = false; drive(); } }, 1500);
    v.currentTime = timeOf(f);
  };
  const seeked = () => {
    seeking = false; clearTimeout(watch); if (!v) return;
    if (mode !== 'still') { drawVideo(frameOf(v.currentTime)); tell(); } // (over the stills only once the video takes over: toVideo)
    const l = landed; landed = null; l?.();
    drive();
  };
  const pause = () => { if (!v) return; gen++; v.pause(); v.playbackRate = 1; };
  const run = () => {
    const el = v; if (!el) return; const g = ++gen; t0 = performance.now(); el.playbackRate = 0.55;
    // a pause() of ours rejects the play() it cuts short (AbortError): only a real refusal changes how the drapes move
    el.play().catch((e: unknown) => { if (g !== gen || v !== el || (e as DOMException | null)?.name === 'AbortError') return; stuck = true; drive(); });
  };
  /** the clip has reached the frame it ran to: hold exactly that frame (one run past is sought back) */
  const land = () => {
    if (!v) return; pause();
    const f = frameOf(v.currentTime);
    if (f !== stopAt) { seekTo(stopAt); return; } // seeked → drive → at rest, or on to a newer mark
    drawVideo(f); tell(); drive();
  };
  /** head for `goal` from the frame on screen */
  const drive = () => {
    if (!v || seeking || goal === null || mode !== 'video') return;
    const playing = !v.paused, p = posOf(shown);
    if (goal === p) { if (playing) { stopAt = shown; land(); } else { goal = null; tell(); } return; }
    const fwd = goal > p, end = fwd ? goal : 2 * last - goal;
    if (playing) {
      if (fwd === (shown < last)) { stopAt = end; return; } // the same way: the stop moves, the drapes run on
      pause();                                          // turning round
    }
    if (stuck || opts.reduced) { // no motor to show: straight there (reduced motion), or a few frames per seek
      const q = opts.reduced ? goal : p + Math.sign(goal - p) * Math.min(Math.abs(goal - p), 4);
      seekTo(shown <= last ? q : 2 * last - q); return;
    }
    const start = fwd ? p : 2 * last - p;
    if (shown !== start || Math.abs(frameOf(v.currentTime) - start) > 1) {
      // a hop of a frame or three is a seek in the half on screen; anything longer starts from the frame that shows the drapes
      // where they are in the half that runs the right way
      if (Math.abs(goal - p) <= 3) seekTo(shown <= last ? goal : 2 * last - goal); else seekTo(start);
      return;
    }
    stopAt = end; run();
  };
  const onFrame = (t: number) => {
    if (!v || goal === null || seeking || v.paused) return;
    const f = frameOf(t); if (f !== shown) { drawVideo(f); tell(); }
    if (f >= stopAt) { land(); return; }
    // a motor's start and stop: the drapes gather speed and lose it again over the last few frames
    const left = stopAt - f, k = ease(clamp(Math.min((performance.now() - t0) / pace.ramp, left / pace.brake)));
    const r = Math.round((0.55 + (pace.top - 0.55) * k) * 20) / 20; if (Math.abs(v.playbackRate - r) > 0.04) v.playbackRate = r;
  };
  const pump = (el: HTMLVideoElement) => { // per decoded frame where the browser tells us, else per display frame
    const rv = (el as HTMLVideoElement & { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback;
    if (rv) { const cb = (_: number, m: { mediaTime: number }) => { if (v !== el) return; onFrame(m.mediaTime); rv.call(el, cb); }; rv.call(el, cb); }
    else { const loop = () => { if (v !== el) return; onFrame(el.currentTime); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  };
  const usable = (r: SceneRung) => !!(opts.hevc ? r.hevc : r.avc) && (!gl || LAYERS * r.h + (LAYERS - 1) * r.gap <= (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number));
  const pick = () => { const ok = clip.rungs.filter(usable).sort((a, b) => a.h - b.h); return [...ok].reverse().find((r) => r.h <= opts.rungH()) ?? ok[0] ?? null; };
  const supported = async (r: SceneRung) => {
    const mc = (navigator as Navigator & { mediaCapabilities?: { decodingInfo(c: unknown): Promise<{ supported: boolean; smooth: boolean }> } }).mediaCapabilities, k = CODEC[r.h];
    if (!mc || !k) return true;
    try {
      const info = await Promise.race([mc.decodingInfo({ type: 'file', video: { contentType: `video/mp4; codecs="${opts.hevc ? k.hevc : k.avc}"`, width: r.w, height: LAYERS * r.h + (LAYERS - 1) * r.gap, bitrate: 10e6, framerate: fps } }), new Promise<null>((res) => setTimeout(() => res(null), 400))]);
      return !info || info.supported;
    } catch { return true; }
  };
  // The room's file is fetched whole and played from memory. Every move of the drapes may start with a seek, and seeking a video
  // needs a server that answers byte ranges: the live host sends the whole file to a range request, and Chrome then takes the
  // video for a stream it can seek only to its start, so every drag and every scene began from parted drapes (3 Oct 2026). From
  // memory a seek always lands. The file is kept for the visit (a return to the room starts at once) unless it was cut short.
  type Loaded = { r: SceneRung; url: string };
  let file: Loaded | null = null, fileReady: Promise<Loaded | null> | null = null, fetching: AbortController | null = null;
  const loadFile = () => (fileReady ??= (async () => {
    let r = pick();
    while (r && !(await supported(r))) { const lower: SceneRung[] = clip.rungs.filter((x) => x.h < r!.h && usable(x)).sort((a, b) => a.h - b.h); r = lower[lower.length - 1] ?? null; }
    if (!r) return null;
    const ac = new AbortController(); fetching = ac;
    try {
      const res = await fetch((opts.hevc ? r.hevc : r.avc)!, { signal: ac.signal });
      if (!res.ok) throw new Error(String(res.status));
      const b = await res.blob();
      return (file = { r, url: URL.createObjectURL(b.type.startsWith('video/') ? b : b.slice(0, b.size, 'video/mp4')) });
    } catch { fileReady = null; return null; } // (cut short, or the line failed: fetched again on the next visit)
    finally { if (fetching === ac) fetching = null; }
  })());
  let videoReady: Promise<boolean> | null = null;
  /** the room's video element and its picture on the graphics card, given back (the file in memory is kept) */
  const release = () => {
    epoch++; clearTimeout(watch);
    if (v) { const el = v; v = null; el.removeAttribute('src'); el.load(); el.remove(); }
    rung = null; videoReady = null; seeking = false; landed = null; held = null; mode = 'none'; goal = null;
    if (gl && !lost) { try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(3)); } catch { /* gone already */ } }
  };
  const loadVideo = () => (videoReady ??= (async () => {
    const at = epoch, f = await loadFile();
    if (!f || at !== epoch) { if (at === epoch) videoReady = null; return false; }
    const el = document.createElement('video'); el.muted = true; el.defaultMuted = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.setAttribute('muted', ''); el.preload = 'auto'; el.disablePictureInPicture = true;
    el.className = 'walk-scene-src'; el.setAttribute('aria-hidden', 'true'); el.tabIndex = -1; host.appendChild(el);
    const ok = await new Promise<boolean>((res) => {
      const t = setTimeout(() => res(false), 8000);
      el.addEventListener('loadeddata', () => { clearTimeout(t); res(true); }, { once: true }); el.addEventListener('error', () => { clearTimeout(t); res(false); }, { once: true });
      el.src = f.url; el.load();
    });
    if (!ok || at !== epoch) { el.removeAttribute('src'); el.load(); el.remove(); if (at === epoch) videoReady = null; return false; }
    v = el; rung = f.r; el.addEventListener('seeked', seeked); el.addEventListener('ended', () => { if (goal !== null) land(); }); pump(el);
    return true;
  })());
  /** the video on frame `f`, decoded and drawn into the canvas (whatever the canvas showed before) */
  const startVideo = async (f: number) => {
    const el = v; if (!el) return false;
    // played once (some browsers draw nothing from a video that has never played), then onto the frame
    await Promise.race([el.play().then(() => {}, () => {}), wait(800, undefined)]); el.pause(); gen++;
    if (v !== el || !entered) return false;
    goal = null; shown = -1;
    await new Promise<void>((res) => { landed = res; setTimeout(res, 1600); seekTo(f); });
    if (v !== el || !entered || el.readyState < 2) return false;
    drawVideo(frameOf(el.currentTime));
    return true;
  };
  /** the picture becomes the video's (from the stills, or from nothing): the drapes then go on to wherever they were sent */
  const toVideo = async () => {
    if (mode === 'video' || !v) return;
    const from = mode === 'still' ? 1 - st.curtain : 0;
    if (!(await startVideo(Math.round(from * last))) || !entered || (mode as string) === 'video') return;
    cancelAnimationFrame(stillTween); stillTween = 0;
    mode = 'video'; canvas.classList.add('is-on');
    if (Math.abs(aim - st.curtain) > 0.5 / last) { goal = Math.round((1 - aim) * last); pace = MOTOR; drive(); }
    draw();
  };

  // the lights: the dimmer is eased to its new level, and the two circuits follow it each on its own curve (lampsAt, ceilingAt):
  // switched on, the lamps are up first and the ceiling comes after them; switched off, the ceiling goes and the lamps linger
  const tweenLights = (to: number, ms: number) => {
    cancelAnimationFrame(lightTween); const from = st.lights, t0 = performance.now();
    const step = (now: number) => { const k = clamp((now - t0) / ms); st.lights = from + (to - from) * ease(k); lightTween = k < 1 ? requestAnimationFrame(step) : 0; draw(); };
    lightTween = requestAnimationFrame(step);
  };
  const tweenStill = (to: number, ms: number) => {
    cancelAnimationFrame(stillTween); const from = st.curtain, s0 = performance.now();
    const step = (now: number) => { const k = clamp((now - s0) / ms); st.curtain = from + (to - from) * ease(k); stillTween = k < 1 ? requestAnimationFrame(step) : 0; draw(); };
    stillTween = requestAnimationFrame(step);
  };
  const curtainTo = (c: number, how: 'drag' | 'travel') => {
    c = clamp(c); aim = c;
    if (mode === 'video') {
      // a finger is followed quickly, the motor starts softly (a run under way keeps the speed it has, whichever sends it on)
      pace = how === 'drag' ? FINGER : MOTOR; goal = Math.round((1 - c) * last); drive(); tell();
    } else if (mode === 'still') {
      if (how === 'travel' && !opts.reduced) tweenStill(c, 300 + 1300 * Math.abs(c - st.curtain));
      else { cancelAnimationFrame(stillTween); stillTween = 0; st.curtain = c; draw(); }
    } // (no picture yet: the drapes go to `aim` as soon as there is one)
  };

  return {
    canvas, get state() { return st; }, get moving() { return moving(); }, steps: last,
    prepare() { void loadStills().catch(() => {}); if (!opts.still) void loadVideo(); },
    async enter() {
      entered = true; st.curtain = 1; st.lights = 1; aim = 1; goal = null; stuck = false; held = null; mixed = -1; mode = 'none';
      // the room's own first frame (the film's last) from the video when it is in; when it is not (yet), from the stills
      const film = !opts.still && (await Promise.race([loadVideo(), wait(400, false)]));
      if (!entered) return;
      if (film) await toVideo();
      if (!entered || mode !== 'none') { tell(); return; }
      const ok = await loadStills().then(() => true, () => false);
      if (!entered) return;
      if (ok && mode === 'none') { mode = 'still'; drawStill(); canvas.classList.add('is-on'); if (aim !== 1) curtainTo(aim, 'travel'); }
      if (!opts.still) void loadVideo().then((ready) => { if (ready && entered) void toVideo(); });
      tell();
    },
    curtainTo,
    halt() {
      aim = st.curtain;
      if (mode === 'video') { if (goal === null) return; goal = null; if (v && !v.paused) pause(); tell(); }
      else if (stillTween) { cancelAnimationFrame(stillTween); stillTween = 0; tell(); }
    },
    lightsTo(l, animate) { l = clamp(l); if (animate && !opts.reduced) tweenLights(l, 420 + 620 * Math.abs(l - st.lights)); else { cancelAnimationFrame(lightTween); lightTween = 0; st.lights = l; draw(); } },
    leave(now = false) {
      entered = false; cancelAnimationFrame(lightTween); lightTween = 0; cancelAnimationFrame(stillTween); stillTween = 0;
      goal = null; if (v) pause();
      if (fetching && !file) fetching.abort(); // a file still on its way does not compete with the film's next move (fetched again next visit)
      canvas.classList.remove('is-on');
      return new Promise<void>((res) => setTimeout(() => {
        if (!entered) release();
        res();
      }, now || opts.reduced ? 0 : 520));
    },
    onChange(cb) { subs.push(cb); },
  };
}
