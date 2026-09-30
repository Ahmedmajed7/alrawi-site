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
 * Output (content-hashed names: /film/* is cached immutable), a ladder the player picks from per device (player.ts `pickRung`):
 *   public/film/<id>-<hash>.mp4          1920×1080 H.264  (src)
 *   public/film/<id>-m-<hash>.mp4        1280×720 H.264   (srcMobile: slow lines, weak devices)
 *   public/film/<id>-q-<hash>.mp4        2560×1440 H.264  (large and high-density screens)
 *   public/film/<id>-hevc[-m|-q]-<hash>.mp4   the same in HEVC (hvc1) at ~60 % of the bits
 *   Only rungs the source is large enough for are made: a 1080p recording yields 720p and 1080p, a 1440p (or 4K) one all three.
 *   (A 4K rung was tried on 29 Sep 2026 and dropped at the client's request: 2K is the top.)
 *   public/film/<id>-first|last-<hash>.webp   posters (first frame = page poster for hero; last = paused frame)
 *   public/og.jpg                    from the hero poster
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
// held (lamps and screens keep their glow), a touch more colour, a faint vignette, a contrast-adaptive sharpen
const LOOK = "deband=1thr=0.012:2thr=0.012:3thr=0.012:range=12:blur=1,split[la][lb];[lb]scale=iw/4:ih/4,gblur=sigma=6,scale=iw*4:ih*4:flags=bicubic[lbl];[la][lbl]blend=c0_expr='clip(A+0.22*(A-B)\\,0\\,255)':c1_expr='A':c2_expr='A',curves=master='0/0 0.25/0.185 0.5/0.415 0.75/0.7 1/1',eq=saturation=1.07,vignette=angle=0.2,cas=strength=0.45";
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
  g += `,hqdn3d=0:0:5:5,${LOOK},format=yuv420p[v]`; // hqdn3d, temporal only: the recorded grain left still surfaces crawling, which pulsed at every keyframe and at the loop seam
  ff([...(loop ? ['-stream_loop', '2'] : []), ...tIn, '-i', input, '-filter_complex', g, '-map', '[v]', '-r', String(fps), '-an', '-c:v', 'libx264', '-crf', '8', '-preset', 'medium', '-color_range', 'tv', out]);
  return out;
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
    ['m', 1280, 720, ['3.1', '3.2'], 22, seg.loop ? 2.4 : 3],
    ['', 1920, 1080, ['4.1', '4.2'], 19, seg.loop ? 6 : 7],
    ['q', 2560, 1440, ['5.0', '5.1'], 19, seg.loop ? 10 : 12],
  ].filter(([, , h]) => h <= Math.max(1080, srcH));
  const cap = (m) => ['-maxrate', `${m.toFixed(2)}M`, '-bufsize', `${(m * 2).toFixed(2)}M`];
  const outs = {};
  for (const [suf, w, h, lv, crf, max] of RUNGS) {
    // the master is sharpened at its own size; a rung cut down from it gets a light pass of its own so 1080p stays as crisp as before
    const vf = cover(w, h) + (h < srcH ? ',cas=strength=0.3' : '');
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
    // the control panel's screen, frame by frame (recorded clips only): the landing keeps its live UI pinned to the moving film
    track: !ai && seg.track?.panel ? (() => { const t = `${OUT}/.track-${id}.json`; writeFileSync(t, JSON.stringify({ fps: fps * sp, panel: seg.track.panel.map((q) => (q ? q.flat() : 0)) })); return publish(t, `track-${id}`, 'json'); })() : null,
  };
  clips.push(clip);
  const kb = (p) => Math.round(readFileSync(`${ROOT}public${p}`).length / 1024);
  console.log(`${id.padEnd(8)} ${clip.source.padEnd(11)} ${duration.toFixed(2).padStart(6)} s  ` + clip.rungs.map((r) => `${r.h}p ${r.avc ? kb(r.avc) : '-'}/${kb(r.hevc)} KB`).join('  '));
}
writeFileSync(`${ROOT}src/data/film.json`, JSON.stringify({ updated: new Date().toISOString(), clips }, null, 2) + '\n');
const hero = clips.find((c) => c.id === 'hero');
if (hero) await sharp(`${ROOT}public${hero.poster}`).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 86, mozjpeg: true }).toFile(`${ROOT}public/og.jpg`);
console.log('\nsrc/data/film.json written. Total desktop film:', Math.round(clips.reduce((a, c) => a + readFileSync(`${ROOT}public${c.src}`).length, 0) / 1048576 * 10) / 10, 'MB');
