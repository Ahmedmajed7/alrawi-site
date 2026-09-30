#!/usr/bin/env node
/**
 * Bake the landing sky from a Poly Haven "puresky" HDRI (CC0) into a web image and wire it into house.json.
 *
 *   node scripts/build-sky.mjs [--src=evening_road_01_puresky] [--res=8k] [--azimuth=deg] [--width=6144]
 *   node scripts/build-sky.mjs … [--look=none|teal] [--hue=deg] [--sat=k] [--val=k] [--tint=#rrggbb]   the grade baked into the image
 *        (default teal: the blue sky pulled to a desaturated film teal, clouds a cool pearl — the WildCrumb reference)
 *   node scripts/build-sky.mjs --preview --src=<id> [--res=4k]   try a sky without touching the site: writes
 *        dist/textures/sky-preview/<id>.webp (served by the running preview) and prints the ?skyimg=… flags for ?live3d
 *
 * Downloads assets/polyhaven/<src>_<res>.hdr if missing, then writes
 *   public/textures/sky/sky-<hash>.webp   upper hemisphere only (W × W/4), linear radiance / scale, sRGB-encoded,
 *                                         highlights soft-clipped so the sun disc never lights the interior
 * and updates src/data/house.json: sky.image, sky.fog / sky.horizon (measured at the horizon), skyYaw and
 * sun.dir (the HDRI's sun, turned to --azimuth, default = the current sun azimuth) so shadows match the clouds.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const SRC = args.src || 'kloofendal_48d_partly_cloudy_puresky', RES = args.res || (args.preview ? '4k' : '8k');
const OUTW = Number(args.width || (args.preview ? 4096 : 6144)); // 6144 × 1536 is sharp at the hero FOV and ~40 % lighter on the GPU than 8k
const hdrPath = `${ROOT}assets/polyhaven/${SRC}_${RES}.hdr`;
const housePath = `${ROOT}src/data/house.json`;
const house = JSON.parse(readFileSync(housePath, 'utf8'));

if (!existsSync(hdrPath)) {
  let url = `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${RES}/${SRC}_${RES}.hdr`;
  let res = await fetch(url);
  if (!res.ok) { // ask the API where the file lives
    const api = await (await fetch(`https://api.polyhaven.com/files/${SRC}`)).json(); url = api?.hdri?.[RES]?.hdr?.url;
    if (!url) throw new Error(`no ${RES} hdr for ${SRC}`); res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`);
  }
  console.log('downloading', url);
  mkdirSync(`${ROOT}assets/polyhaven`, { recursive: true }); writeFileSync(hdrPath, Buffer.from(await res.arrayBuffer()));
}

// ---------- Radiance .hdr (RGBE, new-style RLE) ----------
function readHdr(buf) {
  let p = 0; const line = () => { let s = ''; while (buf[p] !== 10) s += String.fromCharCode(buf[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error('not a Radiance file');
  for (let l = line(); l !== ''; l = line()) if (l.startsWith('FORMAT') && !l.includes('32-bit_rle_rgbe')) throw new Error(l);
  const m = line().match(/-Y (\d+) \+X (\d+)/); if (!m) throw new Error('unsupported orientation');
  const H = +m[1], W = +m[2]; const out = new Float32Array(W * H * 3); const scan = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (buf[p] === 2 && buf[p + 1] === 2 && ((buf[p + 2] << 8) | buf[p + 3]) === W) {
      p += 4;
      for (let c = 0; c < 4; c++) for (let x = 0; x < W;) { let n = buf[p++]; if (n > 128) { n -= 128; const v = buf[p++]; while (n--) scan[(x++) * 4 + c] = v; } else while (n--) scan[(x++) * 4 + c] = buf[p++]; }
    } else { for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) scan[x * 4 + c] = buf[p++]; }
    for (let x = 0; x < W; x++) { const e = scan[x * 4 + 3]; const f = e ? Math.pow(2, e - 136) : 0; const o = (y * W + x) * 3; out[o] = scan[x * 4] * f; out[o + 1] = scan[x * 4 + 1] * f; out[o + 2] = scan[x * 4 + 2] * f; }
  }
  return { W, H, data: out };
}
const t0 = Date.now();
const { W, H, data } = readHdr(readFileSync(hdrPath));
console.log(`read ${SRC}_${RES}.hdr ${W}×${H} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

// ---------- sun: centroid of the brightest pixels ----------
let best = 0; for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) best = Math.max(best, lum((y * W + x) * 3));
let sx = 0, sy = 0, sw = 0, cx = 0, cy = 0; // circular mean in x (the sun may straddle the seam)
for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) { const l = lum((y * W + x) * 3); if (l > best * 0.5) { const a = (x / W) * Math.PI * 2; cx += Math.cos(a) * l; cy += Math.sin(a) * l; sy += y * l; sw += l; } }
sx = ((Math.atan2(cy, cx) / (Math.PI * 2)) + 1) % 1 * W; sy /= sw;
const sunLonTex = (sx / W - 0.5) * Math.PI * 2, sunLat = (0.5 - (sy + 0.5) / H) * Math.PI;
console.log(`sun at px ${sx.toFixed(0)},${sy.toFixed(0)} → elevation ${(sunLat * 180 / Math.PI).toFixed(1)}°, peak ${best.toFixed(0)}`);

// ---------- scale: the bright cloud tops (99.5th percentile away from the sun) land near 1 ----------
const sample = []; const sunV = [Math.cos(sunLat) * Math.cos(sunLonTex), Math.sin(sunLat), Math.cos(sunLat) * Math.sin(sunLonTex)];
for (let y = 0; y < H / 2; y += 4) for (let x = 0; x < W; x += 4) {
  const lat = (0.5 - (y + 0.5) / H) * Math.PI, lon = ((x + 0.5) / W - 0.5) * Math.PI * 2;
  const d = Math.cos(lat) * Math.cos(lon) * sunV[0] + Math.sin(lat) * sunV[1] + Math.cos(lat) * Math.sin(lon) * sunV[2];
  if (d < 0.94) sample.push(lum((y * W + x) * 3)); // outside ~20° of the sun
}
sample.sort((a, b) => a - b); const p995 = sample[Math.floor(sample.length * 0.995)];
const scale = 0.92 / p995;
const knee = (v) => (v < 0.9 ? v : 0.9 + 0.1 * Math.tanh((v - 0.9) / 0.1)); // gentle roll-off: the cloud tops keep their modelling
const srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

// ---------- the look: a film-stock sky, graded in display space (sRGB floats, before quantising) ----------
// Blue sky pixels (hue 170°–260°, weighted by saturation) are pulled toward `hue`, their saturation × `sat` and value × `val`;
// everything else (clouds, haze) is multiplied by `tint`, fading out as the pixel becomes sky. The IBL is baked from this
// image, so the scene's light takes the same cast.
const LOOKS = { none: null, teal: { hue: 200, pull: 0.9, sat: 1.5, val: 0.92, tint: '#f1faf6' } };
const look = LOOKS[args.look ?? 'teal'] && { ...LOOKS[args.look ?? 'teal'], ...(args.hue && { hue: +args.hue }), ...(args.sat && { sat: +args.sat }), ...(args.val && { val: +args.val }), ...(args.tint && { tint: args.tint }) };
const tintRgb = look ? [1, 3, 5].map((i) => parseInt(look.tint.slice(i, i + 2), 16) / 255) : null;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function grade(r, g, b) { // sRGB floats in, sRGB floats out
  if (!look) return [r, g, b];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, s = mx > 0 ? d / mx : 0;
  let h = 0; if (d > 1e-6) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  const w = sstep(0.06, 0.22, s) * sstep(160, 185, h) * (1 - sstep(250, 275, h)); // how much of this pixel is blue sky
  const h2 = h + (look.hue - h) * look.pull * w, s2 = s * (1 + (look.sat - 1) * w), v2 = mx * (1 + (look.val - 1) * w);
  const c = v2 * s2, x = c * (1 - Math.abs(((h2 / 60) % 2) - 1)), m = v2 - c, k = Math.floor(h2 / 60) % 6;
  const o = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return o.map((v, i) => (v + m) * (1 + (tintRgb[i] - 1) * (1 - w)));
}
const encPx = (lr, lg, lb) => grade(srgb(knee(lr * scale)), srgb(knee(lg * scale)), srgb(knee(lb * scale))).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));

// ---------- upper hemisphere → webp ----------
const HH = H / 2; const rgb = Buffer.alloc(W * HH * 3);
for (let i = 0; i < W * HH * 3; i += 3) { const px = encPx(data[i], data[i + 1], data[i + 2]); rgb[i] = px[0]; rgb[i + 1] = px[1]; rgb[i + 2] = px[2]; }
// horizon colour (average of the lowest 1.5° band) for the fog and the mountains' haze
const band = Math.max(1, Math.round(H * 1.5 / 180)); const acc = [0, 0, 0];
for (let y = HH - band; y < HH; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) acc[c] += knee(data[(y * W + x) * 3 + c] * scale);
const hex = (lin) => '#' + encPx(...lin.map((v) => v / scale)).map((v) => v.toString(16).padStart(2, '0')).join('');
const horizon = hex(acc.map((v) => v / (band * W)));
const webp = await sharp(rgb, { raw: { width: W, height: HH, channels: 3 } }).resize(Math.min(W, OUTW), Math.min(W, OUTW) / 4, { kernel: 'lanczos3' }).webp({ quality: 92, effort: 5 }).toBuffer();
const hash = createHash('sha1').update(webp).digest('hex').slice(0, 8);
const cur = house.sun.dir; const azDeg = args.azimuth !== undefined ? +args.azimuth : Math.atan2(cur[2], cur[0]) * 180 / Math.PI;
const lonW = azDeg * Math.PI / 180;
const skyYaw = +(sunLonTex - lonW).toFixed(4); // shader: texture longitude = world longitude + skyYaw
const sunDir = [Math.cos(sunLat) * Math.cos(lonW), Math.sin(sunLat), Math.cos(sunLat) * Math.sin(lonW)].map((v) => +(v * 10).toFixed(3));
if (args.preview) {
  const pd = `${ROOT}dist/textures/sky-preview/`; mkdirSync(pd, { recursive: true }); writeFileSync(`${pd}${SRC}.webp`, webp);
  console.log(`preview: dist/textures/sky-preview/${SRC}.webp (${(webp.length / 1e6).toFixed(2)} MB)\nflags: skyimg=/textures/sky-preview/${SRC}.webp&skyyaw=${skyYaw}&sundir=${sunDir.join(',')}&horizon=${encodeURIComponent(horizon)}`);
  process.exit(0);
}
const dir = `${ROOT}public/textures/sky/`; mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (/^sky-[0-9a-f]{8}\.webp$/.test(f)) unlinkSync(dir + f);
writeFileSync(`${dir}sky-${hash}.webp`, webp);
console.log(`look ${look ? JSON.stringify(look) : 'none'}`);
console.log(`wrote public/textures/sky/sky-${hash}.webp (${Math.min(W, OUTW)}×${Math.min(W, OUTW) / 4}, ${(webp.length / 1e6).toFixed(2)} MB), horizon ${horizon}`);

// ---------- house.json ----------
house.skyYaw = skyYaw;
house.sun.dir = sunDir;
house.sky = { ...house.sky, image: `/textures/sky/sky-${hash}.webp`, horizon, fog: horizon };
writeFileSync(housePath, JSON.stringify(house, null, 2) + '\n');
console.log(`house.json: skyYaw ${house.skyYaw}, sun.dir ${house.sun.dir.join(', ')} (azimuth ${azDeg.toFixed(1)}°)`);
