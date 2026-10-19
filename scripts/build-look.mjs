#!/usr/bin/env node
/**
 * "A closer look" (the home, after the projects map; 19 Oct 2026): the client's own clips of homes the company fitted,
 * published as muted autoplay loops in a collage, each opening large in a viewer.
 *
 *   assets/look/source/<file>   the clips as the client sent them (phone recordings and the brand film; git-ignored)
 *   public/look/<id>-g-<hash>.mp4   the collage rung (≤ 720 wide; muted, so no audio track)
 *   public/look/<id>-v-<hash>.mp4   the viewer rung (1080 wide, with the clip's sound) where the source is tall enough
 *   public/look/<id>-<hash>.webp    the poster, a frame picked per clip
 *   src/data/look.json              what the component reads (sizes, rungs, labels)
 *
 * Per clip: the burned-in captions are cut away (`crop`: every caption sits in a fixed band at the top or the foot, and
 * the frame is cropped past it rather than smudged over); the two 4K iPhone clips are HLG HDR (bt2020, arib-std-b67)
 * and are tone-mapped to SDR bt709 here (an exact inverse OETF, the OOTF's gamma 1.2 and a soft knee, all in 16-bit
 * RGB; ffmpeg's `tonemap` wants zimg, which this build lacks); 60 fps sources are published at 30. The `size` class
 * (l / m / s) is the clip's resolution: the crisp 4K clips and the 1080p film show large, the 720p clip medium, the two
 * 576p clips small. Every published file carries a content hash and is served immutable (public/_headers `/look/*`);
 * a rung is re-encoded only when its source or settings change (scripts/_cache/look/).
 *
 * Usage: node scripts/build-look.mjs [--only=id,…] [--force]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url).pathname;
const SRC = `${ROOT}assets/look/source`, OUT = `${ROOT}public/look`, CACHE = `${ROOT}scripts/_cache/look`;
mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true });
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const only = args.only ? String(args.only).split(',') : null;
const MAX_BYTES = 24 * 1048576; // Cloudflare Pages serves at most 25 MiB per file

/** the clips, in the order the collage and the viewer show them */
const CLIPS = [
  // the control panel on the wall, the switches, the hall and the living room (4K HLG, 60 fps)
  { id: 'panel', src: 'IMG_8603.MOV', hlg: true, fps: 30, size: 'l', rungs: { g: [720, 1280], v: [1080, 1920] }, poster: 0.5,
    label: { en: 'The control panel, the switches and the hall', ar: 'لوحة التحكم والمفاتيح والممر' } },
  // the app on the phone, then the curtains opening in the living room (4K HLG, 30 fps)
  { id: 'curtains', src: 'IMG_8604.MOV', hlg: true, fps: 30, size: 'l', rungs: { g: [720, 1280], v: [1080, 1920] }, poster: 8,
    label: { en: 'The curtains open from the phone', ar: 'الستائر تُفتح من الهاتف' } },
  // the brand film (1080p, 24 fps, with sound): its subtitles run in a band at the foot, cut away below 72.5 %
  { id: 'film', src: 'IMG_5225.MP4', crop: [1080, 1392, 0, 0], size: 'l', audio: true, cap: 2300, rungs: { g: [720, 928], v: [1080, 1392] }, poster: 1.5,
    label: { en: 'Al Rawi Smart Home, the film', ar: 'فيلم الراوي للمنازل الذكية' } },
  // Ramadan mode from the phone (720p): the caption stands in the top quarter, cut away
  { id: 'ramadan', src: 'IMG_5322.MOV', crop: [720, 960, 0, 320], size: 'm', rungs: { g: [720, 960] }, poster: 2.5,
    label: { en: 'One press on your phone and Ramadan mode is on: the lights adjust, the air conditioning starts, and the whole mood of the house changes. All in one moment.', ar: 'بضغطة زر من هاتفك يعمل وضع رمضان: تُضبط الإضاءة، ويعمل التكييف، ويتغيّر جو البيت بالكامل. كل شيء في لحظة واحدة.' } },
  // one touch on the phone and the living room's lights come on (576p): the caption box at the foot, cut away below 81 %
  { id: 'touch', src: 'IMG_6029.MOV', crop: [576, 832, 0, 0], size: 's', rungs: { g: [576, 832] }, poster: 2.2,
    label: { en: 'One touch, and the whole scene changes.', ar: 'لمسة واحدة، ويتغيّر المشهد بالكامل.' } },
  // the dining room's chandelier and coves light up (576p): the caption box at the top, cut away above 12 %
  { id: 'chandelier', src: 'IMG_6008.MOV', crop: [576, 896, 0, 120], size: 's', rungs: { g: [576, 896] }, poster: 3.6,
    label: { en: 'One touch, and the light makes the scene.', ar: 'لمسة واحدة، والإضاءة تصنع المشهد.' } },
];

const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a], { stdio: 'inherit' });
const hashFile = (f) => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 8);
const probe = (f, what) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', what, '-of', 'default=nw=1:nk=1', f]).toString().trim();
/** copy tmp → public/look/<base>-<hash>.<ext>, delete older versions of the same base */
const publish = (tmp, base, ext) => {
  const h = hashFile(tmp), name = `${base}-${h}.${ext}`;
  for (const f of readdirSync(OUT)) if (new RegExp(`^${base}-[0-9a-f]{8}\\.${ext}$`).test(f) && f !== name) unlinkSync(`${OUT}/${f}`);
  copyFileSync(tmp, `${OUT}/${name}`); return `/look/${name}`;
};

// HLG → SDR in 16-bit RGB: the inverse OETF (ARIB STD-B67) per channel, the bt2020 → bt709 matrix in linear light, then
// the OOTF (gamma 1.2, scene 1.0 → 1000 nits against SDR white at 203) with a soft knee, and the bt709 curve
const E = (expr) => ['r', 'g', 'b'].map((c) => `${c}=${expr}`).join(':');
const HLG_INV = `lutrgb=${E('maxval*if(lte(val/maxval\\,0.5)\\,pow(val/maxval\\,2)/3\\,(exp((val/maxval-0.55991073)/0.17883277)+0.28466892)/12)')}`;
const TO_709 = 'colorchannelmixer=rr=1.6605:rg=-0.5876:rb=-0.0728:gr=-0.1246:gg=1.1329:gb=-0.0083:br=-0.0182:bg=-0.1006:bb=1.1187';
const OOTF = `lutrgb=${E('maxval*pow(min(1\\,(pow(val/maxval\\,1.2)*4.6)/(1+pow(val/maxval\\,1.2)*4.6*0.33))\\,1/2.2)')}`;
const SDR_TAGS = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];

const out = { clips: [] };
for (const c of CLIPS) {
  const input = `${SRC}/${c.src}`;
  if (!existsSync(input)) throw new Error(`${c.id}: missing ${input}`);
  const skip = only && !only.includes(c.id);
  const st = statSync(input);
  const key = createHash('sha1').update(JSON.stringify({ src: c.src, size: st.size, mtime: st.mtimeMs, crop: c.crop, hlg: c.hlg, fps: c.fps, rungs: c.rungs, cap: c.cap, audio: c.audio, v: 3 })).digest('hex').slice(0, 10);
  const rungs = Object.keys(c.rungs);
  const tmpOf = (r) => `${CACHE}/${c.id}-${r}-${key}.mp4`;
  const fresh = rungs.every((r) => existsSync(tmpOf(r)));
  if (!skip && (args.force || !fresh)) {
    console.log(`[look] ${c.id}: encoding ${rungs.join(' + ')}`);
    // the master chain: frame rate, the caption crop or the HLG tone-map (which also brings 4K down to 1080 wide)
    let g = '[0:v]';
    if (c.fps) g += `fps=${c.fps},`;
    if (c.hlg) g += `scale=${c.rungs.v[0]}:${c.rungs.v[1]}:in_color_matrix=bt2020:flags=lanczos,format=rgb48le,${HLG_INV},${TO_709},${OOTF},format=yuv420p,`;
    else if (c.crop) g += `crop=${c.crop.join(':')},`;
    g += `setsar=1,split=${rungs.length}${rungs.map((r) => `[m_${r}]`).join('')};`;
    g += rungs.map((r) => `[m_${r}]scale=${c.rungs[r][0]}:${c.rungs[r][1]}:flags=lanczos,format=yuv420p[o_${r}]`).join(';');
    const fpsOut = c.fps ?? Math.round(eval(probe(input, 'stream=r_frame_rate')));
    const maps = [];
    for (const r of rungs) {
      maps.push('-map', `[o_${r}]`, '-c:v', 'libx264', '-preset', 'slow', '-crf', r === 'v' ? '22' : '23', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-g', String(fpsOut * 2), ...SDR_TAGS, '-movflags', '+faststart');
      if (r === 'v' && c.cap) maps.push('-maxrate', `${c.cap}k`, '-bufsize', `${c.cap * 2}k`);
      if (r === 'v' && c.audio) maps.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ac', '2'); else maps.push('-an');
      maps.push(tmpOf(r));
    }
    ff(['-i', input, '-filter_complex', g, ...maps]);
    for (const r of rungs) {
      const bytes = statSync(tmpOf(r)).size;
      if (bytes > MAX_BYTES) throw new Error(`${c.id}-${r}: ${(bytes / 1048576).toFixed(1)} MB is over Pages' limit; lower its cap`);
    }
  } else console.log(`[look] ${c.id}: ${skip ? 'skipped' : 'up to date'}`);
  // the poster from the collage rung, the frame at `poster` seconds
  const posterTmp = `${CACHE}/${c.id}-${key}.webp`;
  if (!existsSync(posterTmp) || args.force) {
    const png = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(c.poster), '-i', tmpOf('g'), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 64 * 1048576 });
    writeFileSync(posterTmp, await sharp(png).webp({ quality: 80 }).toBuffer());
  }
  const entry = { id: c.id, size: c.size, audio: !!c.audio, label: c.label, poster: publish(posterTmp, c.id, 'webp'), src: {} };
  for (const r of rungs) {
    const [w, h] = c.rungs[r];
    entry.src[r] = { url: publish(tmpOf(r), `${c.id}-${r}`, 'mp4'), w, h, bytes: statSync(tmpOf(r)).size };
  }
  const big = entry.src.v ?? entry.src.g;
  entry.w = big.w; entry.h = big.h;
  entry.duration = +(+probe(tmpOf('g'), 'format=duration')).toFixed(2);
  out.clips.push(entry);
  console.log(`[look] ${c.id}: ${rungs.map((r) => `${r} ${(entry.src[r].bytes / 1048576).toFixed(1)} MB`).join(', ')}`);
}
writeFileSync(`${ROOT}src/data/look.json`, JSON.stringify(out, null, 2) + '\n');
console.log(`[look] wrote src/data/look.json (${out.clips.length} clips)`);
