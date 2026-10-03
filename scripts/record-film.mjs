#!/usr/bin/env node
/**
 * Record the 3D walkthrough as frame-exact film clips (the camera choreography the AI restyle keeps).
 *
 *   SITE=http://localhost:4321 node scripts/record-film.mjs [--fps=60] [--hero-fps=30] [--size=1920x1080] [--only=hero,panel,app-scene] [--blur=6] [--check]
 *   --size=2560x1440 records the 2K film the landing's sharp 1440p rung is cut from (rendered at 1.5×: see PR below)
 *
 * The tour moves are recorded at --fps (60 by default: fast moves stay smooth), the hero loop at --hero-fps (30: it barely moves,
 * and half the frames keep the first download small). One run records both.
 *
 * --blur=K gives the moves motion blur: every film frame is the average of K renders spread over a 180° shutter (the page's
 * ?shutter=K, see __rec.step in house/walkthrough.ts). The hero loop and the hold at the end of a move stay at one render per
 * frame. Recording time grows about K-fold while the camera moves; 6 to 8 is plenty at 60 fps.
 * --check measures each clip's motion (mean frame difference at 160×90) and flags jerks: a camera move that
 * passes has no frame-to-frame jump > 34 and no jerk (change of that jump) > 6 outside its first/last half second
 * (the moves run at their final speed now: the encoder no longer speeds them up, see assets/film/speed.json).
 *
 * For every segment it opens the walkthrough at the segment's start (?stop=N&record), steps the
 * GSAP clock + renderer one frame at a time (window.__rec, see house/walkthrough.ts) and reads the
 * canvas back, so the output is smooth no matter how slow the machine is. Writes:
 *   assets/film/source/<id>.mp4          high-quality clip (input for video-to-video AI, and the placeholder)
 *   assets/film/keyframes/<id>-start.jpg / <id>-end.jpg   stills for image-to-video or first/last-frame tools
 *   assets/film/source/manifest.json     order, durations, device hotspots (normalised, end of each clip)
 * Then run `npm run film:encode` to publish the web versions.
 *
 * The app scene (a stop with `scene` in house.json: the living room the visitor runs from the phone, `--only=app-scene`): the film
 * is a video, so the room is recorded in every state the phone can put it in. From the stop's own frame, with every clock where
 * the move that arrives there left it and held there, the west drapes are posed at `frames` positions from parted to drawn, with
 * the rooms' lights on, with the table lamps alone (?lights=0&lamps=1) and with all of them off, and each of those under two bakes of the light the room gives back: baked
 * with the drapes parted (?bake=1, as every clip is) and with them drawn (?bake=0). The encoder blends the two bakes by the drapes'
 * position, so a drawn room is lit as a drawn room. (Baking again for every frame hung the browser after a few.) Writes
 *   assets/film/source/<id>-scene-<on|lamps|off>-b<1|0>.mp4   frame k = drapes at 1 − k / (frames − 1); frame 0 of `on-b1` is the move's last frame
 * and `scenes` in the manifest. It resumes where it stopped (the frames it has are kept), so a lost GPU context costs one reload.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, copyFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import house from '../src/data/house.json' with { type: 'json' };

const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = process.env.SITE || 'http://localhost:4321';
const FPS = +(args.fps || 60), HERO_FPS = Math.min(FPS, +(args['hero-fps'] || 30));
const [W, H] = String(args.size || '1920x1080').split('x').map(Number);
// the page renders a buffer about 3840 px wide whatever the film's size (?pr): 1080p is that buffer averaged down 2×, 1440p 1.5×
// (the encoder then cuts 1080p and 720p from the 1440p film)
const PR = +(args.pr || Math.max(1, Math.min(2, Math.round((3840 / W) * 4) / 4)));
const BLUR = Math.max(1, Math.min(32, Math.round(+(args.blur || 1)))); // sub-frames per film frame while the camera moves
const DATA_ONLY = !!args['data-only']; // rebuild the manifest entries (hotspot, features, marks) of clips already recorded, without rendering
const HOLD = 0.3; // seconds of stillness at the end of each move: the eye sees the lens come to rest, then the player pauses on the last frame and the HUD opens
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// segments: hero idle loop, one move per stop (named after the stop it arrives at), and the outro
const stops = house.stops.map((s) => s.id);
const segments = [
  { id: 'hero', stop: 0, loop: true },
  ...stops.map((id, i) => ({ id, stop: i, ends: id })),       // from stop i (0 = exterior) to stop i+1
  { id: 'outro', stop: stops.length, ends: null },
].filter((s) => !args.only || String(args.only).split(',').includes(s.id));
// the app scene of each stop that has one (recorded after the moves: it needs the frame count of the move that arrives there)
const scenes = house.stops.map((s, i) => ({ id: `${s.id}-scene`, of: s.id, stop: i + 1, frames: s.scene?.frames ?? 0 })).filter((s) => s.frames > 1 && (!args.only || String(args.only).split(',').includes(s.id)));
const SCENE_FPS = 30; // the rate its frames are filed at: the landing plays the drapes at its own pace

const out = `${ROOT}assets/film/source`, keys = `${ROOT}assets/film/keyframes`, tmp = `${ROOT}scripts/_cache/film`;
mkdirSync(out, { recursive: true }); mkdirSync(keys, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Frame-difference energy of a clip (160×90 grey): mean, max and max jerk, ignoring the first/last half second. */
function motionCheck(file, fps) {
  const W = 160, H = 90, raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const n = Math.floor(raw.length / (W * H)), m = [];
  for (let i = 1; i < n; i++) { let acc = 0; const a = i * W * H, b = (i - 1) * W * H; for (let k = 0; k < W * H; k++) acc += Math.abs(raw[a + k] - raw[b + k]); m.push(acc / (W * H)); }
  const guard = Math.round(fps / 2), inner = m.slice(guard, Math.max(guard, m.length - guard));
  const jerks = inner.map((v, i) => (i ? Math.abs(v - inner[i - 1]) : 0));
  const worst = jerks.map((j, i) => [j, i + guard]).filter(([j]) => j > 6).map(([, i]) => i).slice(0, 6);
  const max = Math.max(0, ...inner), jerk = Math.max(0, ...jerks), mean = m.reduce((a, b) => a + b, 0) / Math.max(1, m.length);
  return { mean: +mean.toFixed(2), max: +max.toFixed(1), jerk: +jerk.toFixed(1), ok: max <= 34 && jerk <= 6, worst };
}

/** Frames to draw again (160×90 grey): a repeat of the one before (a step far smaller than the one before it, then one about two
 *  steps long), or a frame that is not of the film at all (a stalled page leaves a black one: a spike out and straight back) */
function repeats(dir, fps) {
  const W = 160, H = 90, raw = execFileSync('ffmpeg', ['-v', 'error', '-framerate', String(fps), '-i', `${dir}/%05d.jpg`, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const n = Math.floor(raw.length / (W * H)), d = [0], lum = [];
  for (let i = 0; i < n; i++) { let acc = 0, l = 0; const a = i * W * H, b = (i - 1) * W * H; for (let k = 0; k < W * H; k++) { l += raw[a + k]; if (i) acc += Math.abs(raw[a + k] - raw[b + k]); } lum.push(l / (W * H)); if (i) d.push(acc / (W * H)); }
  const bad = []; for (let i = 0; i < n; i++) if (lum[i] < 3 && (lum[i - 1] ?? lum[i + 1] ?? 0) > 20) bad.push(i); // black: the film never goes to black
  for (let i = 2; i < n - 1; i++) {
    if (d[i - 1] > 0.5 && d[i] < 0.2 * d[i - 1] && d[i + 1] > 1.25 * d[i - 1]) bad.push(i);
    else if (d[i] > 25 && d[i + 1] > 25 && d[i] > 4 * Math.max(0.5, d[i - 1]) && d[i + 1] > 4 * Math.max(0.5, d[i + 2] ?? 0)) bad.push(i);
  }
  return [...new Set(bad)].sort((x, y) => x - y);
}

const manifest = { fps: FPS, heroFps: HERO_FPS, size: [W, H], recorded: new Date().toISOString(), ...(BLUR > 1 ? { blur: BLUR } : {}), segments: [], scenes: {} };
const readManifest = () => { try { return JSON.parse(readFileSync(`${out}/manifest.json`, 'utf8')); } catch { return { segments: [], scenes: {} }; } };

/**
 * A browser of its own for the recording. A page that stalls (headless Chrome loses its GPU context now and then, and always when
 * something else leans on the GPU) never answers again, and neither does a reload in the same browser: so every call is timed, and
 * on a failure the caller closes this browser, starts another and carries on from the frames already on disk (the tour is replayed
 * up to there without rendering: `__rec.dry` runs the same clocks).
 */
async function launch() {
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--window-size=${W},${H}`, `--user-data-dir=/tmp/alrawi-rec-${port}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let info; for (let i = 0; i < 50 && !info; i++) { await sleep(200); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { /* starting */ } }
    if (!info) throw new Error('chrome did not start');
    const ws = new WebSocket(info.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map(); const errors = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
    const send = (method, params = {}, sessionId, ms = 30000) => new Promise((res, rej) => { const i = ++id, t = setTimeout(() => { pending.delete(i); rej(new Error(`the browser did not answer ${method} in ${ms / 1000} s`)); }, ms); pending.set(i, (m) => { clearTimeout(t); res(m); }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, width: W, height: H });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
    const evaluate = async (expression, ms = 90000) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId, ms); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed'); return r.result?.result?.value; };
    /** open the walkthrough at `url`, wait for it to be ready to record, and take the clocks in hand */
    const open = async (url) => {
      await send('Page.navigate', { url }, sessionId);
      let ready = false; for (let i = 0; i < 720 && !ready; i++) { await sleep(250); ready = await evaluate('!!window.__recReady', 15000).catch(() => false); }
      if (!ready) throw new Error(`the walkthrough never became ready ${errors.slice(-3).join(' | ')}`);
      await evaluate('window.__rec.begin()', 240000); // the first frame bakes the probes
    };
    return { evaluate, open, errors, close() { try { ws.close(); } catch { /* gone */ } chrome.kill('SIGKILL'); } };
  } catch (e) { chrome.kill('SIGKILL'); throw e; }
}
let browser = await launch();
const again = async (what, e, attempt) => { if (attempt >= 10) throw e; console.warn(`${what}: ${e.message.split('\n')[0]}; a new browser, carrying on from the frames it has`); browser.close(); await sleep(4000); browser = await launch(); };
// --resume keeps the frames a segment already has (an interrupted run); --frames=a-b renders those frames of one clip again
const RANGE = args.frames ? String(args.frames).split('-').map(Number) : null;
if (RANGE && segments.length !== 1) throw new Error('--frames=a-b needs --only=<one clip>');

try {
  for (const seg of segments) {
    const t0 = Date.now(), fps = seg.loop ? HERO_FPS : FPS, dir = `${tmp}/${seg.id}`, file = (k) => `${dir}/${String(k).padStart(5, '0')}.jpg`;
    if (!DATA_ONLY && !args.resume && !RANGE) rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const redo = new Set(); if (RANGE) for (let k = RANGE[0]; k <= (RANGE[1] ?? RANGE[0]); k++) redo.add(k);
    /** is frame k still to be drawn? (the frames on disk are replayed without rendering) */
    const wanted = (k) => !DATA_ONLY && (RANGE ? redo.has(k) : redo.has(k) || !existsSync(file(k)));
    const save = (k, img) => { writeFileSync(file(k), Buffer.from(img.split(',')[1], 'base64')); redo.delete(k); };
    let n = 0, hotspot = null, features = null, marks = null, rendered = 0;
    for (let round = 0; ; round++) {
      for (let attempt = 1; ; attempt++) { try {
        await browser.open(`${BASE}/en/?stop=${seg.stop}&record&tier=high&noadapt&pr=${PR}${!seg.loop && BLUR > 1 ? `&shutter=${BLUR}` : ''}`);
        n = 0;
        const frame = async (dt) => { const draw = wanted(n); const r = await browser.evaluate(`window.__rec.${draw ? 'step' : 'dry'}(${dt})`); if (draw) { save(n, r.img); rendered++; } n++; return r.state; };
        if (seg.loop) {
          // the idle "breathe" is sin(t * 0.5): one period = 4π s, so the clip loops seamlessly
          const frames = Math.round(4 * Math.PI * fps), dt = (4 * Math.PI) / frames;
          for (let i = 0; i < frames; i++) await frame(dt);
        } else {
          await browser.evaluate('window.__rec.go()');
          const dt = 1 / fps; let state = 'travelling', guard = fps * 40;
          while (state === 'travelling' && guard-- > 0) { state = await frame(dt); if (RANGE && !redo.size) break; }
          if (!(RANGE && !redo.size)) for (let i = 0; i < Math.round(HOLD * fps); i++) await frame(dt);
        }
        if (!RANGE) {
          hotspot = seg.ends ? await browser.evaluate(`window.__rec.hotspot(${JSON.stringify(seg.ends)})`) : null;
          // where the device's screen / keypad / grille corners and LEDs sit on the last frame: the landing pins live HTML onto them
          features = seg.ends ? await browser.evaluate(`window.__rec.features ? window.__rec.features(${JSON.stringify(seg.ends)}) : null`) : null;
          // the app stop: where its markers stand in the room on the last frame
          marks = seg.ends ? await browser.evaluate(`window.__rec.marks ? window.__rec.marks(${JSON.stringify(seg.ends)}) : null`) : null;
        }
        break;
      } catch (e) { await again(seg.id, e, attempt); } }
      if (DATA_ONLY || RANGE) break;
      // a frame that repeats the one before it (the GPU was shared for a moment): those are drawn again
      const bad = repeats(dir, fps); if (!bad.length || round >= 3) { if (bad.length) console.warn(`! ${seg.id}: frames ${bad.join(', ')} still repeat the one before`); break; }
      console.warn(`${seg.id}: frames ${bad.join(', ')} repeat the one before; drawing them again`); for (const k of bad) redo.add(k);
    }
    if (!DATA_ONLY) {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/${seg.id}.mp4`]);
      const frames = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
      copyFileSync(`${dir}/${frames[0]}`, `${keys}/${seg.id}-start.jpg`); copyFileSync(`${dir}/${frames[frames.length - 1]}`, `${keys}/${seg.id}-end.jpg`);
      if (RANGE) { console.log(`${seg.id}: frames ${RANGE.join('-')} drawn again (${rendered}), clip rebuilt from ${frames.length} frames`); continue; }
    } else { const had = +execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'default=nw=1:nk=1', `${out}/${seg.id}.mp4`]).toString().trim(); if (had !== n) throw new Error(`${seg.id}: the replay has ${n} frames, the recorded clip ${had}: its data would not match its frames`); }
    const check = args.check && !DATA_ONLY ? motionCheck(`${out}/${seg.id}.mp4`, fps) : null;
    manifest.segments.push({ id: seg.id, from: seg.stop, ends: seg.ends, loop: !!seg.loop, frames: n, seconds: +(n / fps).toFixed(3), hotspot, features, fps, ...(marks ? { marks } : {}), ...(check ? { motion: check } : {}) });
    if (check) console.log(`         motion mean ${check.mean} max ${check.max} jerk ${check.jerk} → ${check.ok ? 'PASS' : 'FAIL at frames ' + check.worst.join(',')}`);
    console.log(`${seg.id.padEnd(8)} ${String(n).padStart(4)} frames  ${(n / fps).toFixed(2)} s  hotspot ${JSON.stringify(hotspot)}  (${((Date.now() - t0) / 1000).toFixed(0)} s, ${rendered} drawn)`);
  }

  // ---------- the app scene: the room in every state the phone can put it in ----------
  for (const sc of scenes) {
    const move = [...manifest.segments, ...readManifest().segments].find((s) => s.id === sc.of);
    if (!move) { console.warn(`! ${sc.id}: record the move first (--only=${sc.of}): the scene starts on its last frame`); continue; }
    const t0 = Date.now(), N = sc.frames;
    // three states of the rooms' lights: all on, the table lamps alone, all off; each under the two bakes
    for (const [state, lights, bake, lamps] of [['on-b1', 1, 1, 1], ['on-b0', 1, 0, 1], ['lamps-b1', 0, 1, 1], ['lamps-b0', 0, 0, 1], ['off-b1', 0, 1, 0], ['off-b0', 0, 0, 0]]) {
      const dir = `${tmp}/${sc.id}-${state}`, file = (k) => `${dir}/${String(k).padStart(5, '0')}.jpg`;
      if (args.fresh) rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      let k = 0; while (k < N && existsSync(file(k))) k++; // it carries on from the frames it has
      for (let attempt = 1; k < N; attempt++) { try {
        await browser.open(`${BASE}/en/?stop=${sc.stop}&record&tier=high&noadapt&pr=${PR}&lights=${lights}&lamps=${lamps}&bake=${bake}`);
        // every clock to where the move left it (its frames, hold included, at its rate), and held there
        await browser.evaluate(`(() => { for (let i = 0; i < ${move.frames}; i++) window.__rec.dry(${1 / move.fps}); return true; })()`);
        for (; k < N; k++) {
          await browser.evaluate(`window.__rec.drapes(${(1 - k / (N - 1)).toFixed(5)})`);
          writeFileSync(file(k), Buffer.from((await browser.evaluate('window.__rec.step(0)')).img.split(',')[1], 'base64'));
          if (k % 20 === 0) console.log(`${sc.id} ${state} ${k + 1}/${N}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        }
      } catch (e) { await again(`${sc.id} ${state} frame ${k}`, e, attempt); } }
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(SCENE_FPS), '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/${sc.id}-${state}.mp4`]);
    }
    manifest.scenes[sc.of] = { frames: N, fps: SCENE_FPS, states: ['on', 'lamps', 'off'], bakes: [1, 0], size: [W, H] };
    console.log(`${sc.id.padEnd(8)} ${N} frames × 6  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  if (browser.errors.length) console.warn('page errors:\n' + browser.errors.slice(0, 10).join('\n'));
  if (RANGE) { /* a repair: the clip's entry in the manifest stands */ }
  else if (!args.only) writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  else { // merge a partial re-record into the existing manifest (its header stays as it was: the film's size and blur are those of the full recording)
    const prev = readManifest();
    const map = new Map(prev.segments.map((s) => [s.id, s])); for (const s of manifest.segments) map.set(s.id, s);
    const order = ['hero', ...stops, 'outro']; const head = prev.fps ? { fps: prev.fps, heroFps: prev.heroFps, size: prev.size, recorded: manifest.recorded, ...(prev.blur ? { blur: prev.blur } : {}) } : manifest;
    if (prev.fps && (prev.size?.[0] !== W || (prev.blur ?? 1) !== BLUR) && manifest.segments.length) console.warn(`! this run (${W}x${H}, blur ${BLUR}) differs from the film it is merged into (${prev.size?.join('x')}, blur ${prev.blur ?? 1}): the clips will not match`);
    writeFileSync(`${out}/manifest.json`, JSON.stringify({ ...head, segments: order.map((k) => map.get(k)).filter(Boolean), scenes: { ...(prev.scenes ?? {}), ...manifest.scenes } }, null, 2));
  }
} finally { browser.close(); }
console.log(`\nClips in assets/film/source/, keyframes in assets/film/keyframes/. Next: npm run film:encode`);
