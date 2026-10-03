/**
 * The app scene: the living room the visitor runs from the phone (film/phone.ts). The film is a video, so the room was recorded
 * in every state the phone can put it in (scripts/record-film.mjs `--only=app-scene`, film-encode.mjs `scene`): one video of three
 * pictures stacked (the rooms' lights on, the table lamps alone, all off), the drapes going from parted to drawn over `frames`
 * frames and back again. Here that becomes a picture that answers the phone:
 *   - the drapes' position is a frame: a drag seeks to it (one seek in flight, the latest wins); Open / Close / a scene plays the
 *     half of the clip that runs the right way, forwards, with a soft start and stop, and halts on the frame it was sent to;
 *   - the lights are light, added the way light adds: unlit room + the lamps' share × their level + the ceiling's share × its
 *     level, summed in linear light (a WebGL pass; a plain cross-fade of the encoded pictures greys the room on its way down).
 *     One dimmer runs both: the ceiling comes down first and the lamps' glow is what is left before the dark, as in a room.
 *     All three pictures come out of one decoded frame, so they can never be a frame apart.
 * The canvas sits in the film's stage over the paused clip, whose last frame is the scene's first (drapes parted, lights on): it
 * comes up over the identical picture, and when the tour moves on it dissolves back into it (the room returns to the film's own
 * state in that dissolve, nothing is played back to get there), and the room's video and its texture are let go of before the
 * camera sets off: a second decoder at work beside the film's own is what made the move out of the house stutter (3 Oct 2026).
 * Where the stacked video cannot be decoded (or the visitor gets stills instead of film: reduced motion, data saver), the six
 * corner stills are blended instead: the drapes dissolve between parted and drawn.
 */
export interface SceneRung { h: number; w: number; gap: number; avc: string | null; hevc: string | null }
export interface SceneClip { frames: number; fps: number; layers?: string[]; rungs: SceneRung[]; stills: Record<string, string> }
/** `curtain`: 1 = parted, 0 = drawn · `lights`: the dimmer, 1 = full, 0 = off */
export interface SceneState { curtain: number; lights: number }
export interface Scene {
  canvas: HTMLCanvasElement; readonly state: SceneState; readonly moving: boolean;
  /** start fetching (the stop before this one has been reached) */
  prepare(): void;
  /** the first frame is drawn (the film's own last frame) and the canvas is up */
  enter(): Promise<void>;
  /** `drag`: follow the finger · `travel`: run there as the motor would */
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
  let mode: 'none' | 'video' | 'still' = 'none', moving = false, lightTween = 0;
  const tell = () => { for (const f of subs) f(st, moving || !!lightTween); };

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
  let v: HTMLVideoElement | null = null, rung: SceneRung | null = null, seeking = false, pending: number | null = null, playTo: number | null = null, playRate = 1.5, playT0 = 0, onArrive: (() => void) | null = null;
  const frameOf = (t: number) => clamp(Math.round(t * fps - 0.5 + 1e-3), 0, 2 * last);      // a frame shows from f / fps
  const posOf = (f: number) => (f <= last ? f : 2 * last - f);                                  // the drapes' position (0 = parted … last = drawn) on frame f
  const timeOf = (f: number) => (f + 0.5) / fps;
  let shown = 0; // the frame the canvas shows
  const drawVideo = (f: number) => {
    if (!v || !rung || v.readyState < 2) return;
    paint(v, rung.w, rung.h, rung.gap); shown = f; st.curtain = 1 - posOf(f) / last;
  };
  const draw = (frame = false) => { if (mode === 'video') { if (frame || !held) drawVideo(shown); else repaint(); } else if (mode === 'still') drawStill(); tell(); };
  const seek = (f: number) => {
    if (!v) return; if (seeking) { pending = f; return; }
    if (f === shown && Math.abs(v.currentTime - timeOf(f)) < 0.4 / fps) return;
    seeking = true; v.currentTime = timeOf(f);
  };
  const seeked = () => {
    seeking = false; if (!v) return; drawVideo(frameOf(v.currentTime)); tell();
    if (pending !== null) { const f = pending; pending = null; seek(f); return; }
    if (playTo !== null && v.paused) void v.play().catch(() => { arrived(); });
  };
  const arrived = () => {
    if (!v) return; const f = playTo; playTo = null; moving = false; v.pause(); v.playbackRate = 1;
    if (f !== null) seek(f); // exactly the frame it was sent to
    tell(); const done = onArrive; onArrive = null; done?.();
  };
  const onFrame = (t: number) => {
    if (!v || playTo === null) return; const f = frameOf(t); drawVideo(f); tell();
    if (f >= playTo) { arrived(); return; }
    // a motor's start and stop: the drapes gather speed over a third of a second and lose it over the last few frames
    const left = playTo - f, k = ease(clamp(Math.min((performance.now() - playT0) / 320, left / 7)));
    const r = Math.round((0.55 + (playRate - 0.55) * k) * 20) / 20; if (Math.abs(v.playbackRate - r) > 0.04) v.playbackRate = r;
  };
  const pump = () => { // per decoded frame where the browser tells us, else per display frame
    if (!v) return; const rv = (v as HTMLVideoElement & { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback;
    if (rv) { const cb = (_: number, m: { mediaTime: number }) => { if (!v) return; if (playTo !== null) onFrame(m.mediaTime); rv.call(v, cb); }; rv.call(v, cb); }
    else { const loop = () => { if (!v) return; if (playTo !== null && !v.paused) onFrame(v.currentTime); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  };
  const travel = (k: number, rate: number, done?: () => void) => {
    if (!v) { done?.(); return; }
    const now = posOf(shown); if (k === now && playTo === null) { done?.(); return; }
    // drawing the drapes is the first half of the clip, parting them the second: either way the clip plays forwards
    const f0 = k > now ? now : 2 * last - now, f1 = k > now ? k : 2 * last - k;
    onArrive = done ?? null; playTo = f1; playRate = rate; playT0 = performance.now(); moving = true; pending = null; v.pause();
    if (frameOf(v.currentTime) !== f0 || seeking) seek(f0); else void v.play().catch(() => { arrived(); });
    tell();
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
  let videoReady: Promise<boolean> | null = null;
  /** the room's video and its picture on the graphics card, given back (they are fetched again from the cache if the visitor returns) */
  const release = () => {
    if (v) { const el = v; v = null; el.removeAttribute('src'); el.load(); el.remove(); }
    rung = null; videoReady = null; seeking = false; held = null; mode = 'none';
    if (gl && !lost) { try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(3)); } catch { /* gone already */ } }
  };
  const loadVideo = () => (videoReady ??= (async () => {
    let r = pick();
    while (r && !(await supported(r))) { const lower: SceneRung[] = clip.rungs.filter((x) => x.h < r!.h && usable(x)).sort((a, b) => a.h - b.h); r = lower[lower.length - 1] ?? null; }
    if (!r) return false;
    const el = document.createElement('video'); el.muted = true; el.defaultMuted = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.setAttribute('muted', ''); el.preload = 'auto'; el.disablePictureInPicture = true;
    el.className = 'walk-scene-src'; el.setAttribute('aria-hidden', 'true'); el.tabIndex = -1; host.appendChild(el);
    const ok = await new Promise<boolean>((res) => {
      const t = setTimeout(() => res(false), 12000);
      el.addEventListener('loadeddata', () => { clearTimeout(t); res(true); }, { once: true }); el.addEventListener('error', () => { clearTimeout(t); res(false); }, { once: true });
      el.src = (opts.hevc ? r!.hevc : r!.avc)!; el.load();
    });
    if (!ok) { el.remove(); return false; }
    v = el; rung = r; el.addEventListener('seeked', seeked); el.addEventListener('ended', () => { if (playTo !== null) arrived(); }); pump();
    return true;
  })());

  // the lights: the dimmer is eased to its new level, and the two circuits follow it each on its own curve (lampsAt, ceilingAt):
  // switched on, the lamps are up first and the ceiling comes after them; switched off, the ceiling goes and the lamps linger
  const tweenLights = (to: number, ms: number) => {
    cancelAnimationFrame(lightTween); const from = st.lights, t0 = performance.now();
    const step = (now: number) => { const k = clamp((now - t0) / ms); st.lights = from + (to - from) * ease(k); lightTween = k < 1 ? requestAnimationFrame(step) : 0; draw(); };
    lightTween = requestAnimationFrame(step);
  };
  let stillTween = 0;
  const tweenStill = (to: number, ms: number, done?: () => void) => {
    cancelAnimationFrame(stillTween); const from = st.curtain, t0 = performance.now(); moving = true;
    const step = (now: number) => { const k = clamp((now - t0) / ms); st.curtain = from + (to - from) * ease(k); if (k < 1) stillTween = requestAnimationFrame(step); else { stillTween = 0; moving = false; done?.(); } draw(); };
    stillTween = requestAnimationFrame(step);
  };

  return {
    canvas, get state() { return st; }, get moving() { return moving; },
    prepare() { if (opts.still) void loadStills(); else void loadVideo(); },
    async enter() {
      st.curtain = 1; st.lights = 1; held = null; mixed = -1;
      const film = !opts.still && (await Promise.race([loadVideo(), new Promise<boolean>((res) => setTimeout(() => res(false), 5000))]));
      if (film && v) {
        mode = 'video'; shown = -1;
        try { await v.play(); v.pause(); } catch { /* a frame is decoded all the same once it is sought */ }
        // onto the first frame (the film's own last frame), whatever the clip was showing when it was last left
        playTo = null; pending = null; moving = false;
        await new Promise<void>((res) => { const done = () => { clearTimeout(t); v!.removeEventListener('seeked', done); seeking = false; res(); }; const t = setTimeout(done, 1500); v!.addEventListener('seeked', done); seeking = true; v!.currentTime = timeOf(0); });
        drawVideo(0);
      } else { await loadStills().catch(() => {}); mode = 'still'; drawStill(); }
      canvas.classList.add('is-on'); tell();
    },
    curtainTo(c, how) {
      c = clamp(c);
      if (mode === 'video') {
        const k = Math.round((1 - c) * last);
        if (how === 'travel' && !opts.reduced) { travel(k, 1.5); return; }
        if (playTo !== null) { playTo = null; moving = false; onArrive = null; v?.pause(); }
        seek(Math.abs(k - shown) <= Math.abs(2 * last - k - shown) ? k : 2 * last - k); // the nearer of the two frames that show this position
      } else if (mode === 'still') { if (how === 'travel' && !opts.reduced) tweenStill(c, 300 + 1300 * Math.abs(c - st.curtain)); else { cancelAnimationFrame(stillTween); stillTween = 0; moving = false; st.curtain = c; draw(); } }
    },
    halt() {
      if (mode === 'video' && playTo !== null && v) { playTo = null; onArrive = null; moving = false; v.pause(); v.playbackRate = 1; drawVideo(frameOf(v.currentTime)); tell(); }
      else if (stillTween) { cancelAnimationFrame(stillTween); stillTween = 0; moving = false; tell(); }
    },
    lightsTo(l, animate) { l = clamp(l); if (animate && !opts.reduced) tweenLights(l, 420 + 620 * Math.abs(l - st.lights)); else { cancelAnimationFrame(lightTween); lightTween = 0; st.lights = l; draw(); } },
    leave(now = false) {
      cancelAnimationFrame(lightTween); lightTween = 0; cancelAnimationFrame(stillTween); stillTween = 0;
      if (v) { playTo = null; onArrive = null; pending = null; moving = false; v.pause(); }
      canvas.classList.remove('is-on');
      return new Promise<void>((res) => setTimeout(() => {
        if (!canvas.classList.contains('is-on')) release();
        res();
      }, now || opts.reduced ? 0 : 520));
    },
    onChange(cb) { subs.push(cb); },
  };
}
