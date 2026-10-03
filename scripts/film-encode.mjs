#!/usr/bin/env node
/**
 * Publish the landing film: encode every clip for the web and write src/data/film.json.
 *
 *   npm run film:encode            (node scripts/film-encode.mjs [--only=hero,panel])
 *
 * Input per clip id (hero, one per stop in house.json, outro), first match wins:
 *   assets/film/clips/<id>.(mp4|mov|webm|mkv)   ← your AI-generated clip
 *   assets/film/source/<id>.mp4                 ← the recorded 3D placeholder (scripts/record-film.mjs)
 * Device hotspots (where the pulsing ring sits on the paused last frame, 0..1 from top-left) come
 * from assets/film/source/manifest.json; put overrides in assets/film/hotspots.json {"panel":[0.52,0.48]}
 * when an AI clip moved a device. Optional per-clip trims in assets/film/trim.json {"panel":[0.3, 8.1]}.
 *
 * Output (content-hashed names: /film/* is cached immutable), a ladder the player picks from per device (player.ts `chooseRung`):
 *   public/film/<id>-<hash>.mp4          1920×1080 H.264  (src)
 *   public/film/<id>-m-<hash>.mp4        1280×720 H.264   (srcMobile: slow lines, weak devices)
 *   public/film/<id>-q-<hash>.mp4        2560×1440 H.264  (large and high-density screens)
 *   public/film/<id>-hevc[-m|-q]-<hash>.mp4   the same in HEVC (hvc1) at ~60 % of the bits
 *   Only rungs the source is large enough for are made: a 1080p recording yields 720p and 1080p, a 1440p (or 4K) one all three.
 *   (A 4K rung was tried on 29 Sep 2026 and dropped at the client's request: 2K is the top.)
 *   public/film/<id>-first|last-<hash>.webp   posters (first frame = page poster for hero; last = paused frame)
 *   public/og.jpg                    from the hero poster
 *
 * The app scene (a stop recorded in every state of its drapes and its lights: record-film.mjs `--only=app-scene`) is published as
 * ONE video per rung, so that the light states can never be a frame apart:
 *   public/film/<id>-scene[-m|-q]-<hash>.mp4, …-scene-hevc…   three pictures stacked (w × 3h): the rooms' lights on, the table lamps
 *       alone, all off; the drapes going from parted to drawn and back again (2N − 1 frames: both directions play forwards), a
 *       keyframe every 15 frames and no B-frames, so any position is a short seek away. The landing adds the lamps' light and the
 *       ceiling's to the unlit room, each at its own level (film/scene.ts)
 *   public/film/<id>-scene-<on|lamps|off>-<open|closed>-<hash>.webp   its six corners, for visitors who get stills instead of film
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, renameSync } from 'node:fs';
import sharp from 'sharp';
import house from '../src/data/house.json' with { type: 'json' };

const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = `${ROOT}public/film`; mkdirSync(OUT, { recursive: true });
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const manifest = readJson(`${ROOT}assets/film/source/manifest.json`, { segments: [] });
const hotspotOverrides = readJson(`${ROOT}assets/film/hotspots.json`, {});
// the device features the landing pins live HTML onto (quads + points, 0..1 of the frame); an AI clip that moved a device needs
// its own in assets/film/features.json {"panel": {"quads": {"screen": [[x,y],[x,y],[x,y],[x,y]]}, "points": {}}}
const featureOverrides = readJson(`${ROOT}assets/film/features.json`, {});
const trims = readJson(`${ROOT}assets/film/trim.json`, {});
// {"panel": 1.5}: play a move faster (multiples of 0.25); the clip is resampled in time, not frame-dropped, so it stays smooth
const speeds = readJson(`${ROOT}assets/film/speed.json`, {});
// {"hero": [[x, y, w, h], …]}: source-pixel boxes held steady with a temporal median (z-fighting faces that flash frame to frame)
const steady = readJson(`${ROOT}assets/film/steady.json`, {});
const CACHE = `${ROOT}scripts/_cache/film-master`; mkdirSync(CACHE, { recursive: true });
const prev = readJson(`${ROOT}src/data/film.json`, { clips: [] });
const order = ['hero', ...house.stops.map((s) => s.id), 'outro'];
const only = args.only ? String(args.only).split(',') : null;

const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a], { stdio: 'inherit' });
const probe = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString().trim();
/** the source's frame rate (the tour moves are recorded at 60 fps for smooth motion, the hero loop at 30) */
const probeFps = (f) => { const [a, b] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=nw=1:nk=1', f]).toString().trim().split('/').map(Number); const r = b ? a / b : a; return Math.round(r) >= 50 ? 60 : 30; };
const hashFile = (f) => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 8);
/** move tmp → public/film/<base>-<hash>.<ext>, delete older versions of the same base */
const publish = (tmp, base, ext) => {
  const h = hashFile(tmp), name = `${base}-${h}.${ext}`;
  for (const f of readdirSync(OUT)) if (new RegExp(`^${base}-[0-9a-f]{8}\\.${ext}$`).test(f) && f !== name) unlinkSync(`${OUT}/${f}`);
  renameSync(tmp, `${OUT}/${name}`); return `/film/${name}`;
};
const probeHeight = (f) => +execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'default=nw=1:nk=1', f]).toString().trim();
const MAX_BYTES = 24 * 1048576; // Cloudflare Pages serves at most 25 MiB per file
const cover = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1`;
const probeFrames = (f) => +execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'default=nw=1:nk=1', f]).toString().trim();
// the grade: debanded, a clarity pass (local contrast against a wide blur, clamped), the mids deeper with the highlights
// held (lamps and screens keep their glow), a touch more colour, a faint vignette, a contrast-adaptive sharpen. Crisper since
// 3 Oct 2026 at the client's request (clarity 0.22 → 0.3, sharpen 0.45 → 0.68: weave, cushion patterns and the palms through
// the glass read; no halo at 1:1)
const LOOK = "deband=1thr=0.012:2thr=0.012:3thr=0.012:range=12:blur=1,split[la][lb];[lb]scale=iw/4:ih/4,gblur=sigma=6,scale=iw*4:ih*4:flags=bicubic[lbl];[la][lbl]blend=c0_expr='clip(A+0.3*(A-B)\\,0\\,255)':c1_expr='A':c2_expr='A',curves=master='0/0 0.25/0.185 0.5/0.415 0.75/0.7 1/1',eq=saturation=1.07,vignette=angle=0.2,cas=strength=0.68";
// a rung cut down from the master gets a light sharpen of its own
const RUNG_CAS = 0.42;
/**
 * The master of one clip (scripts/_cache/film-master/<id>.mp4, at the source's size — 4K from a 4K recording — near-lossless), every published size is cut from it:
 *  - boxes listed in steady.json are held with a temporal median (coplanar faces that flash frame to frame)
 *  - time is resampled with one even shutter: the clip is interpolated to 4× its rate, averaged with a triangle kernel and
 *    every k-th frame kept (k = 4 × speed). Faster moves stay smooth (no dropped-frame judder), and whatever flickers at
 *    the frame rate (wind-blown fronds, fine texture under a moving camera) is averaged out
 *  - a loop is wrapped around its seam first, so the first and last frames get the same blend
 *  - then the grade
 */
function master(id, input, fps, loop, sp, tIn, blurred = false) {
  const out = `${CACHE}/${id}.mp4`, k = Math.round(4 * sp), H = loop ? 7 : k + 1, n = probeFrames(input);
  if (Math.abs(k - 4 * sp) > 1e-6) throw new Error(`${id}: speed must be a multiple of 0.25`);
  const tri = Array.from({ length: 2 * H + 1 }, (_, i) => H + 1 - Math.abs(i - H)).join(' ');
  const boxes = steady[id] ?? [];
  let g = `[0:v]setpts=N/(${fps}*TB),format=yuv444p,deflicker=size=7:mode=am`;
  if (boxes.length) {
    g += `,split=${boxes.length + 1}[m0]${boxes.map((_, i) => `[c${i}]`).join('')};`;
    g += boxes.map(([x, y, w, h], i) => `[c${i}]crop=${w}:${h}:${x}:${y},tmedian=radius=7[t${i}];`).join('');
    g += boxes.map(([x, y], i) => `[m${i}][t${i}]overlay=${x}:${y}:format=yuv444${i === boxes.length - 1 ? '' : `[m${i + 1}];`}`).join('');
  }
  const pick = loop ? `gte(n\\,${4 * n + H})*lt(n\\,${8 * n + H})*not(mod(n-${H}\\,${k}))` : `gte(n\\,${H})*not(mod(n-${H}\\,${k}))`;
  // a move recorded with its own 180° shutter (record-film.mjs --blur) at its final speed is kept frame for frame: blending
  // neighbouring frames on top of real motion blur doubles every edge on a fast pan
  const resample = loop || sp !== 1 || !blurred;
  if (resample) g += `,framerate=fps=${fps * 4}:interp_start=0:interp_end=255:scene=100${loop ? '' : `,tpad=stop_mode=clone:stop=${H}`},tmix=frames=${2 * H + 1}:weights='${tri}',select='${pick}',setpts=N/(${fps}*TB)`;
  // hqdn3d, temporal only: the recorded grain left still surfaces crawling, which pulsed at every keyframe and at the loop seam. The
  // recorder renders no grain now, and on a move it smeared fine detail: the moves keep a trace of it, the hero loop all of it
  g += `,hqdn3d=0:0:${loop ? '5:5' : '2.5:2.5'},${LOOK},format=yuv420p[v]`;
  ff([...(loop ? ['-stream_loop', '2'] : []), ...tIn, '-i', input, '-filter_complex', g, '-map', '[v]', '-r', String(fps), '-an', '-c:v', 'libx264', '-crf', '8', '-preset', 'medium', '-color_range', 'tv', out]);
  return out;
}

/**
 * The app scene of stop `id`. Per state of the rooms' lights (all on, the table lamps alone, all off), the two recorded takes
 * (frame k = drapes at 1 − k / (N − 1); one with the bounce light baked for parted drapes, one for drawn) are blended by the
 * drapes' position and graded like the film (no deflicker and no temporal denoise: here the light really changes from frame to
 * frame); then the three states are stacked (on, lamps, off), played there and back, and cut to the ladder. Returns what the
 * landing needs (film.json `scene`), or null when it is not recorded.
 */
// a keyframe every SCENE_GOP frames: a drag seeks at most that far from one, and the three stacked pictures are mostly the same from
// frame to frame, so it is the keyframes that weigh (every 8 frames made the 1080p file 23 MB)
const SCENE_GOP = 15;
async function scene(id, srcH) {
  const sc = manifest.scenes?.[id], STATES = ['on', 'lamps', 'off'], take = (state, bake) => `${ROOT}assets/film/source/${id}-scene-${state}-b${bake}.mp4`;
  if (!sc || !STATES.every((st) => existsSync(take(st, 1)) && existsSync(take(st, 0)))) return null;
  const N = probeFrames(take('on', 1)), fps = sc.fps ?? 30; for (const st of STATES) for (const b of [1, 0]) if (probeFrames(take(st, b)) !== N) throw new Error(`${id} scene: the takes differ in length`);
  const graded = {};
  for (const state of STATES) {
    graded[state] = `${CACHE}/${id}-scene-${state}.mp4`;
    // frame 0 is the parted bake alone (the film's own frame), the last the drawn bake alone
    ff(['-i', take(state, 1), '-i', take(state, 0), '-filter_complex', `[0:v]setpts=N/(${fps}*TB),format=gbrp[a];[1:v]setpts=N/(${fps}*TB),format=gbrp[b];[a][b]blend=all_expr='A*(1-N/${N - 1})+B*N/${N - 1}',format=yuv444p,${LOOK},format=yuv444p[v]`, '-map', '[v]', '-r', String(fps), '-an', '-c:v', 'libx264', '-crf', '6', '-preset', 'medium', '-pix_fmt', 'yuv444p', '-color_range', 'tv', graded[state]]);
  }
  // [suffix, width, height of one state, H.264 level of the three stacked, crf]
  const RUNGS = [['m', 1280, 720, '5.0', 20], ['', 1920, 1080, '5.1', 20], ['q', 2560, 1440, '6.0', 21]].filter(([, , h]) => h <= Math.max(1080, srcH));
  const outs = {}, base = `${id}-scene`;
  for (const [suf, w, h, lvA, crf] of RUNGS) {
    // each state cut to the rung like the film's own frames, then stacked, then there and back. Where the rung's height is not a
    // whole number of 16 px blocks (1080), a state is carried on by `gap` rows of its own last row, so that no block holds floor
    // from one state and ceiling from the next
    const half = cover(w, h) + (h < srcH ? `,cas=strength=${RUNG_CAS}` : ''), gap = (16 - (h % 16)) % 16, pad = gap ? `,pad=iw:ih+${gap}:0:0,fillborders=bottom=${gap}:mode=smear` : '';
    const g = `[0:v]${half}${pad}[a];[1:v]${half}${pad}[b];[2:v]${half}[c];[a][b][c]vstack=inputs=3,split[f][r0];[r0]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[f][r]concat=n=2:v=1,format=yuv420p[v]`;
    const ins = STATES.flatMap((st) => ['-i', graded[st]]);
    const name = suf ? `${base}-${suf}` : base, hname = `${base}-hevc${suf ? `-${suf}` : ''}`;
    const tmp = `${OUT}/.${name}.mp4`;
    for (let c = crf; ; c += 2) {
      ff([...ins, '-filter_complex', g, '-map', '[v]', '-r', String(fps), '-an', '-c:v', 'libx264', '-profile:v', 'high', '-level:v', lvA, '-x264-params', 'ref=2:scenecut=0', '-bf', '0', '-g', String(SCENE_GOP), '-keyint_min', String(SCENE_GOP), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-preset', 'slow', '-movflags', '+faststart', '-crf', String(c), tmp]);
      if (readFileSync(tmp).length <= MAX_BYTES) break; console.warn(`  ${name}: over 24 MB at crf ${c}, retrying`);
    }
    outs[name] = publish(tmp, name, 'mp4');
    const tmpH = `${OUT}/.${hname}.mp4`;
    for (let c = crf + 3; ; c += 2) {
      ff([...ins, '-filter_complex', g, '-map', '[v]', '-r', String(fps), '-an', '-c:v', 'libx265', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-preset', 'medium', '-x265-params', `keyint=${SCENE_GOP}:min-keyint=${SCENE_GOP}:bframes=0:scenecut=0:log-level=error`, '-movflags', '+faststart', '-crf', String(c), tmpH]);
      if (readFileSync(tmpH).length <= MAX_BYTES) break; console.warn(`  ${hname}: over 24 MB at crf ${c}, retrying`);
    }
    outs[hname] = publish(tmpH, hname, 'mp4');
  }
  const stills = {};
  for (const state of STATES) for (const [pos, k] of [['open', 0], ['closed', N - 1]]) {
    const png = `${OUT}/.${base}-${state}-${pos}.png`, webp = `${OUT}/.${base}-${state}-${pos}.webp`;
    ff(['-i', graded[state], '-vf', `select='eq(n\\,${k})'`, '-frames:v', '1', '-update', '1', png]); await sharp(png).resize(1600).webp({ quality: 80 }).toFile(webp); unlinkSync(png);
    stills[`${state}${pos[0].toUpperCase()}${pos.slice(1)}`] = publish(webp, `${base}-${state}-${pos}`, 'webp');
  }
  const kb = (p) => Math.round(readFileSync(`${ROOT}public${p}`).length / 1024);
  // `gap`: state k begins k × (h + gap) rows down
  const rungs = RUNGS.map(([suf, w, h]) => ({ h, w, gap: (16 - (h % 16)) % 16, avc: outs[suf ? `${base}-${suf}` : base], hevc: outs[`${base}-hevc${suf ? `-${suf}` : ''}`] }));
  console.log(`${base.padEnd(8)} ${N} positions × ${STATES.length} lights  ` + rungs.map((r) => `${r.h}p ${kb(r.avc)}/${kb(r.hevc)} KB`).join('  '));
  return { frames: N, fps, layers: STATES, rungs, stills };
}

const clips = [];
for (const id of order) {
  const seg = manifest.segments.find((s) => s.id === id) ?? { id, loop: id === 'hero', ends: order.includes(id) && id !== 'hero' && id !== 'outro' ? id : null, hotspot: null };
  if (only && !only.includes(id)) { const keep = prev.clips.find((c) => c.id === id); if (keep) clips.push(keep); continue; }
  const ai = ['mp4', 'mov', 'webm', 'mkv'].map((e) => `${ROOT}assets/film/clips/${id}.${e}`).find(existsSync);
  const input = ai ?? `${ROOT}assets/film/source/${id}.mp4`;
  if (!existsSync(input)) { console.warn(`! ${id}: no clip (record with scripts/record-film.mjs or add assets/film/clips/${id}.mp4) — skipped`); continue; }
  const trim = trims[id]; const tTrim = trim ? ['-ss', String(trim[0]), '-to', String(trim[1])] : [];
  // H.264 High with 4 reference frames decodes in hardware on every old PC; TV range; a keyframe every 2 s
  const fps = probeFps(input), fk = fps === 60 ? 1.35 : 1; // 60 fps needs ~35 % more bits for the same picture
  const sp = seg.loop ? 1 : +speeds[id] || 1; // the hero loop keeps its own pace
  const src = master(id, input, fps, !!seg.loop, sp, tTrim, !ai && (manifest.blur ?? 1) > 1), tIn = [], srcH = probeHeight(src);
  const gop = String(seg.loop ? 600 : fps * 2);
  // the rungs: [suffix, width, height, H.264 level (30 / 60 fps), crf, maxrate Mb/s at 30 fps]. Bitrates are capped so a clip streams
  // faster than it plays; the hero loop is the first download, so it gets the leanest budget. The sharp 1440p rung exists for big
  // and high-density screens: cut from a 1440p recording rendered at 1.5× (record-film.mjs --size=2560x1440), it carries real
  // detail, not an upscale
  const RUNGS = [
    ['m', 1280, 720, ['3.1', '3.2'], 20, seg.loop ? 3 : 3.6],
    ['', 1920, 1080, ['4.1', '4.2'], 17, seg.loop ? 7.5 : 8.8],
    ['q', 2560, 1440, ['5.0', '5.1'], 17, seg.loop ? 12.5 : 15],
  ].filter(([, , h]) => h <= Math.max(1080, srcH));
  const cap = (m) => ['-maxrate', `${m.toFixed(2)}M`, '-bufsize', `${(m * 2).toFixed(2)}M`];
  const outs = {};
  for (const [suf, w, h, lv, crf, max] of RUNGS) {
    // the master is sharpened at its own size; a rung cut down from it gets a light pass of its own so 1080p stays as crisp as before
    const vf = cover(w, h) + (h < srcH ? `,cas=strength=${RUNG_CAS}` : '');
    const name = suf ? `${id}-${suf}` : id, hname = `${id}-hevc${suf ? `-${suf}` : ''}`;
    {
      const tmp = `${OUT}/.${name}.mp4`;
      for (let c = crf; ; c += 2) {
        ff([...tIn, '-i', src, '-vf', vf, '-r', String(fps), '-an', '-c:v', 'libx264', '-profile:v', 'high', '-level:v', lv[fps === 60 ? 1 : 0], '-x264-params', 'ref=4', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-preset', 'slow', '-g', gop, '-movflags', '+faststart', '-crf', String(c), ...cap(max * fk), tmp]);
        if (readFileSync(tmp).length <= MAX_BYTES) break; console.warn(`  ${name}: over 24 MB at crf ${c}, retrying`);
      }
      outs[name] = publish(tmp, name, 'mp4');
    }
    // HEVC at ~60 % of the H.264 budget looks the same (x265 CRF sits ~4 above x264 for equal quality)
    const tmpH = `${OUT}/.${hname}.mp4`;
    for (let c = crf + 4; ; c += 2) {
      ff([...tIn, '-i', src, '-vf', vf, '-r', String(fps), '-an', '-c:v', 'libx265', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-preset', 'medium', '-x265-params', `keyint=${gop}:min-keyint=${fps}:log-level=error`, '-movflags', '+faststart', '-crf', String(c), ...cap(max * fk * 0.6), tmpH]);
      if (readFileSync(tmpH).length <= MAX_BYTES) break; console.warn(`  ${hname}: over 24 MB at crf ${c}, retrying`);
    }
    outs[hname] = publish(tmpH, hname, 'mp4');
  }
  for (const f of readdirSync(OUT)) { // a rung this source no longer makes (a 1080p recording, the dropped 4K rung): drop its old file
    const m = f.match(new RegExp(`^(${id}(?:-hevc)?(?:-[mqu])?)-[0-9a-f]{8}\\.mp4$`)); if (m && !outs[m[1]]) unlinkSync(`${OUT}/${f}`);
    if (new RegExp(`^track-${id}-[0-9a-f]{8}\\.json$`).test(f)) unlinkSync(`${OUT}/${f}`); // the panel's per-frame track: no longer published (2 Oct 2026, the live screen is handed over at rest only)
  }
  const tmpD = `${ROOT}public${outs[id]}`;
  const duration = +probe(tmpD).toFixed(3);
  const tmpF = `${OUT}/.${id}-first.webp`, tmpL = `${OUT}/.${id}-last.webp`, png = `${OUT}/.${id}.png`;
  ff(['-i', tmpD, '-frames:v', '1', png]); await sharp(png).resize(1600).webp({ quality: 80 }).toFile(tmpF);
  ff(['-sseof', '-0.1', '-i', tmpD, '-update', '1', '-frames:v', '1', png]); await sharp(png).resize(1600).webp({ quality: 80 }).toFile(tmpL); unlinkSync(png);
  const clip = {
    id, loop: !!seg.loop, ends: seg.ends ?? null, duration, source: ai ? 'ai' : 'placeholder',
    src: outs[id], srcMobile: outs[`${id}-m`], srcHevc: outs[`${id}-hevc`], srcHevcMobile: outs[`${id}-hevc-m`],
    // the full ladder by picture height: the player picks the rung that fills the screen's pixels on what the device decodes smoothly
    rungs: RUNGS.map(([suf, w, h]) => ({ h, w, avc: outs[suf ? `${id}-${suf}` : id] ?? null, hevc: outs[`${id}-hevc${suf ? `-${suf}` : ''}`] })),
    poster: publish(tmpF, `${id}-first`, 'webp'), last: publish(tmpL, `${id}-last`, 'webp'),
    hotspot: hotspotOverrides[id] ?? seg.hotspot ?? null,
    features: featureOverrides[id] ?? (ai ? null : seg.features) ?? null, // a recorded frame's features only fit the recorded frame
    fps,
    // the app stop: where its markers stand in the frame, and the room in every state the phone can put it in
    ...(!ai && seg.marks ? { marks: seg.marks } : {}),
    ...(!ai && manifest.scenes?.[id] ? { scene: await scene(id, srcH) } : {}),
  };
  clips.push(clip);
  const kb = (p) => Math.round(readFileSync(`${ROOT}public${p}`).length / 1024);
  console.log(`${id.padEnd(8)} ${clip.source.padEnd(11)} ${duration.toFixed(2).padStart(6)} s  ` + clip.rungs.map((r) => `${r.h}p ${r.avc ? kb(r.avc) : '-'}/${kb(r.hevc)} KB`).join('  '));
}
writeFileSync(`${ROOT}src/data/film.json`, JSON.stringify({ updated: new Date().toISOString(), clips }, null, 2) + '\n');
const hero = clips.find((c) => c.id === 'hero');
if (hero) await sharp(`${ROOT}public${hero.poster}`).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 86, mozjpeg: true }).toFile(`${ROOT}public/og.jpg`);
console.log('\nsrc/data/film.json written. Total desktop film:', Math.round(clips.reduce((a, c) => a + readFileSync(`${ROOT}public${c.src}`).length, 0) / 1048576 * 10) / 10, 'MB');
