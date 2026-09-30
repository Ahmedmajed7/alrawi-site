#!/usr/bin/env node
/**
 * Record the 3D walkthrough as frame-exact film clips (the camera choreography the AI restyle keeps).
 *
 *   SITE=http://localhost:4321 node scripts/record-film.mjs [--fps=60] [--hero-fps=30] [--size=1920x1080] [--only=hero,panel] [--blur=6] [--check]
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
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
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
const DATA_ONLY = !!args['data-only']; // rebuild the manifest entries (hotspot, features, panel track) of clips already recorded, without rendering
const HOLD = 0.3; // seconds of stillness at the end of each move: the eye sees the lens come to rest, then the player pauses on the last frame and the HUD opens
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// segments: hero idle loop, one move per stop (named after the stop it arrives at), and the outro
const stops = house.stops.map((s) => s.id);
const segments = [
  { id: 'hero', stop: 0, loop: true },
  ...stops.map((id, i) => ({ id, stop: i, ends: id })),       // from stop i (0 = exterior) to stop i+1
  { id: 'outro', stop: stops.length, ends: null },
].filter((s) => !args.only || String(args.only).split(',').includes(s.id));

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

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--window-size=${W},${H}`, `--user-data-dir=/tmp/alrawi-rec-${port}`, 'about:blank'], { stdio: 'ignore' });
const manifest = { fps: FPS, heroFps: HERO_FPS, size: [W, H], recorded: new Date().toISOString(), ...(BLUR > 1 ? { blur: BLUR } : {}), segments: [] };
try {
  let info; for (let i = 0; i < 50 && !info; i++) { await sleep(200); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { /* starting */ } }
  if (!info) throw new Error('chrome did not start');
  const ws = new WebSocket(info.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, width: W, height: H });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  // a stalled page (lost GPU context in headless Chrome) never answers: time out so the segment's retry takes over instead of hanging
  const evaluate = async (expression) => { const r = await Promise.race([send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId), new Promise((_, rej) => setTimeout(() => rej(new Error('page did not answer in 60 s')), 60000))]); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed'); return r.result?.result?.value; };

  for (const seg of segments) for (let attempt = 1; ; attempt++) { try {
    const t0 = Date.now(), fps = seg.loop ? HERO_FPS : FPS;
    await send('Page.navigate', { url: `${BASE}/en/?stop=${seg.stop}&record&tier=high&noadapt&pr=${PR}${!seg.loop && BLUR > 1 ? `&shutter=${BLUR}` : ''}` }, sessionId);
    let ready = false; for (let i = 0; i < 720 && !ready; i++) { await sleep(250); ready = await evaluate('!!window.__recReady').catch(() => false); }
    if (!ready) throw new Error(`segment ${seg.id}: walkthrough never became ready ${errors.slice(-3).join(' | ')}`);
    await evaluate('window.__rec.begin()');
    const dir = `${tmp}/${seg.id}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const track = []; const hasPanel = stops.includes('panel');
    let n = 0; const save = (img) => writeFileSync(`${dir}/${String(n++).padStart(5, '0')}.jpg`, Buffer.from(img.split(',')[1], 'base64'));
    if (seg.loop) {
      // the idle "breathe" is sin(t * 0.5): one period = 4π s, so the clip loops seamlessly
      const frames = Math.round(4 * Math.PI * fps), dt = (4 * Math.PI) / frames;
      for (let i = 0; i < frames; i++) save((await evaluate(`window.__rec.step(${dt})`)).img);
    } else {
      await evaluate('window.__rec.go()');
      const dt = 1 / fps; let state = 'travelling', guard = fps * 40;
      // per frame, where the control panel's screen is (when fully in view): the landing keeps its live UI pinned to the film
      const trackIt = async () => { track.push(hasPanel ? await evaluate(`window.__rec.track ? window.__rec.track('panel') : null`) : null); };
      if (DATA_ONLY) { // the clip's frames exist: replay the move without rendering to rebuild its per-frame data
        while (state === 'travelling' && guard-- > 0) { state = (await evaluate(`window.__rec.dry(${dt})`)).state; n++; await trackIt(); }
        for (let i = 0; i < Math.round(HOLD * fps); i++) { await evaluate(`window.__rec.dry(${dt})`); n++; await trackIt(); }
      } else {
      while (state === 'travelling' && guard-- > 0) { const r = await evaluate(`window.__rec.step(${dt})`); state = r.state; save(r.img); await trackIt(); }
      for (let i = 0; i < Math.round(HOLD * fps); i++) { save((await evaluate(`window.__rec.step(${dt})`)).img); await trackIt(); }
      }
    }
    const hotspot = seg.ends ? await evaluate(`window.__rec.hotspot(${JSON.stringify(seg.ends)})`) : null;
    // where the device's screen / keypad / grille corners and LEDs sit on the last frame: the landing pins live HTML onto them
    const features = seg.ends ? await evaluate(`window.__rec.features ? window.__rec.features(${JSON.stringify(seg.ends)}) : null`) : null;
    if (!DATA_ONLY) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/${seg.id}.mp4`]);
    const frames = readdirSync(dir).sort();
    copyFileSync(`${dir}/${frames[0]}`, `${keys}/${seg.id}-start.jpg`); copyFileSync(`${dir}/${frames[frames.length - 1]}`, `${keys}/${seg.id}-end.jpg`);
    } else { const had = +execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'default=nw=1:nk=1', `${out}/${seg.id}.mp4`]).toString().trim(); if (had !== n) throw new Error(`${seg.id}: the replay has ${n} frames, the recorded clip ${had}: its data would not match its frames`); }
    const check = args.check && !DATA_ONLY ? motionCheck(`${out}/${seg.id}.mp4`, fps) : null;
    manifest.segments.push({ id: seg.id, from: seg.stop, ends: seg.ends, loop: !!seg.loop, frames: n, seconds: +(n / fps).toFixed(3), hotspot, features, fps, ...(track.some(Boolean) ? { track: { panel: track } } : {}), ...(check ? { motion: check } : {}) });
    if (check) console.log(`         motion mean ${check.mean} max ${check.max} jerk ${check.jerk} → ${check.ok ? 'PASS' : 'FAIL at frames ' + check.worst.join(',')}`);
    console.log(`${seg.id.padEnd(8)} ${String(n).padStart(4)} frames  ${(n / fps).toFixed(2)} s  hotspot ${JSON.stringify(hotspot)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    break;
  } catch (e) { if (attempt >= 3) throw e; console.warn(`${seg.id}: attempt ${attempt} failed (${e.message.split('\n')[0]}); the page probably lost its GPU context — retrying`); await sleep(3000); } }
  if (errors.length) console.warn('page errors:\n' + errors.slice(0, 10).join('\n'));
  if (!args.only) writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  else { // merge a partial re-record into the existing manifest
    let prev = { segments: [] }; try { prev = JSON.parse((await import('node:fs')).readFileSync(`${out}/manifest.json`, 'utf8')); } catch { /* first run */ }
    const map = new Map(prev.segments.map((s) => [s.id, s])); for (const s of manifest.segments) map.set(s.id, s);
    const order = ['hero', ...stops, 'outro']; writeFileSync(`${out}/manifest.json`, JSON.stringify({ ...manifest, segments: order.map((k) => map.get(k)).filter(Boolean) }, null, 2));
  }
  ws.close();
} finally { chrome.kill('SIGKILL'); }
console.log(`\nClips in assets/film/source/, keyframes in assets/film/keyframes/. Next: npm run film:encode`);
