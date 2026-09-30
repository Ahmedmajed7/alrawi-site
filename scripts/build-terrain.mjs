#!/usr/bin/env node
/**
 * The real Hajar behind the villa: elevation from AWS Terrain Tiles (Terrarium PNG, Open Data, no key; sources
 * SRTM/GMTED/NED via Mapzen), resampled onto a polar grid centred on the villa (dense in front of the camera, log-spaced
 * rings out to 32 km), earth curvature and refraction applied, with the low golden-hour sun's shadows and a horizon
 * ambient occlusion baked per vertex. Written as a small binary the walkthrough builds its terrain mesh from
 * (src/scripts/three/house/terrain.ts), and wired into house.json `terrain.model` / `modelLite`.
 *
 *   npm run terrain:build                                   uses house.json terrain { lat, lon, bearing, exaggerate }
 *   node scripts/build-terrain.mjs --preview --cands="23.557,58.3985,180;23.525,58.495,195"
 *        silhouette panoramas of candidate viewpoints (lat, lon, compass bearing of world −Z) → scripts/_cache/terrain/preview.png
 *
 * World frame: metres, Y up, origin at the villa, the camera looks down −Z; `bearing` is the compass direction of −Z.
 * Re-run after `npm run sky:build` (the baked shadows follow house.json sun.dir).
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const housePath = `${ROOT}src/data/house.json`;
const house = JSON.parse(readFileSync(housePath, 'utf8'));
const CACHE = `${ROOT}scripts/_cache/terrain`; mkdirSync(CACHE, { recursive: true });
const R_EARTH = 6371000, REFRACT = 0.13;

// ---------------------------------------------------------------- tiles
const tileXY = (lat, lon, z) => { const n = 2 ** z, x = ((lon + 180) / 360) * n, lr = (lat * Math.PI) / 180; const y = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n; return [x, y]; };
async function tile(z, x, y) {
  const f = `${CACHE}/${z}-${x}-${y}.png`;
  if (!existsSync(f)) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < h.length; i++) { const o = i * info.channels; h[i] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768; }
  return h;
}
/** A mosaic of zoom-z tiles covering ±radius metres around (lat, lon); returns a bilinear sampler in lat/lon. */
async function mosaic(lat, lon, z, radius) {
  const dLat = radius / 111320, dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const [x0f, y0f] = tileXY(lat + dLat, lon - dLon, z), [x1f, y1f] = tileXY(lat - dLat, lon + dLon, z);
  const tx0 = Math.floor(x0f), ty0 = Math.floor(y0f), tx1 = Math.floor(x1f), ty1 = Math.floor(y1f);
  const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256, M = new Float32Array(W * H);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(tile(z, tx, ty).then((t) => { for (let r = 0; r < 256; r++) M.set(t.subarray(r * 256, r * 256 + 256), ((ty - ty0) * 256 + r) * W + (tx - tx0) * 256); }));
  await Promise.all(jobs);
  process.stdout.write(`  z${z}: ${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} tiles\n`);
  return (la, lo) => {
    const [fx, fy] = tileXY(la, lo, z); const px = (fx - tx0) * 256 - 0.5, py = (fy - ty0) * 256 - 0.5;
    const x = Math.min(W - 2, Math.max(0, Math.floor(px))), y = Math.min(H - 2, Math.max(0, Math.floor(py))), u = Math.min(1, Math.max(0, px - x)), v = Math.min(1, Math.max(0, py - y));
    const a = M[y * W + x], b = M[y * W + x + 1], c = M[(y + 1) * W + x], d = M[(y + 1) * W + x + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

/**
 * Heights in the local frame: two Cartesian grids (fine ±9 km at 15 m, coarse ±34 km at 50 m) resampled from the
 * tiles, relative to the villa's own ground, with curvature. Returns h(x, z) in metres (bilinear).
 */
async function localField(lat, lon, bearing, exaggerate) {
  const fineR = 9000, coarseR = 34000;
  const [fineS, coarseS] = await Promise.all([mosaic(lat, lon, 13, fineR * 1.45), mosaic(lat, lon, 11, coarseR * 1.45)]);
  const b = (bearing * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b), mLat = 111320, mLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const toLL = (x, z) => { const east = x * cb - z * sb, north = -x * sb - z * cb; return [lat + north / mLat, lon + east / mLon]; };
  const h0 = fineS(lat, lon);
  const grid = (R, step, S) => {
    const n = Math.round((2 * R) / step) + 1, g = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -R + i * step, z = -R + j * step; const [la, lo] = toLL(x, z); g[j * n + i] = S(la, lo); }
    return { R, step, n, g, at(x, z) { const fx = (x + R) / step, fz = (z + R) / step; const i = Math.min(n - 2, Math.max(0, Math.floor(fx))), j = Math.min(n - 2, Math.max(0, Math.floor(fz))), u = fx - i, v = fz - j; const a = g[j * n + i], bb = g[j * n + i + 1], c = g[(j + 1) * n + i], d = g[(j + 1) * n + i + 1]; return (a * (1 - u) + bb * u) * (1 - v) + (c * (1 - u) + d * u) * v; } };
  };
  const fine = grid(fineR, 15, fineS), coarse = grid(coarseR, 50, coarseS);
  const h = (x, z) => {
    const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
    let raw = m < fineR - 800 ? fine.at(x, z) : m < fineR ? (() => { const t = (m - (fineR - 800)) / 800; return fine.at(x, z) * (1 - t) + coarse.at(x, z) * t; })() : coarse.at(x, z);
    const d2 = x * x + z * z;
    return (raw - h0) * exaggerate - (d2 / (2 * R_EARTH)) * (1 - REFRACT);
  };
  return { h, h0 };
}

// ---------------------------------------------------------------- preview: silhouette panoramas of candidate viewpoints
if (args.preview) {
  const cands = String(args.cands || '23.557,58.3985,180;23.525,58.495,195;23.6,58.42,180;23.575,58.13,190').split(';').map((s) => s.split(',').map(Number));
  const PW = 1600, PH = 360, rows = [];
  // the hero camera looks ~20° right of −Z and sees ±40° horizontally at 16:9, vfov 50°, pitched up ~6°
  const azMin = -40, azMax = 80, elMin = -3, elMax = 22;
  for (const [la, lo, be] of cands) {
    console.log(`candidate ${la}, ${lo}, bearing ${be}`);
    const { h, h0 } = await localField(la, lo, be, 1);
    const img = Buffer.alloc(PW * PH * 3);
    for (let i = 0; i < PW * PH; i++) { img[i * 3] = 205; img[i * 3 + 1] = 222; img[i * 3 + 2] = 240; } // sky
    for (let px = 0; px < PW; px++) {
      const az = ((azMin + ((azMax - azMin) * px) / PW) * Math.PI) / 180, dx = Math.sin(az), dz = -Math.cos(az);
      let maxEl = -Infinity;
      for (let d = 400; d < 32000; d *= 1.015) {
        const el = Math.atan2(h(dx * d, dz * d) - 1.7, d) * (180 / Math.PI);
        if (el > maxEl) { // this distance band shows above everything nearer: paint it, lighter with distance (aerial haze)
          const y0 = Math.round(((elMax - el) / (elMax - elMin)) * PH), y1 = Math.round(((elMax - Math.max(maxEl, elMin)) / (elMax - elMin)) * PH);
          const k = Math.min(1, d / 26000), col = [120 + 90 * k, 78 + 110 * k, 55 + 150 * k];
          for (let y = Math.max(0, y0); y < Math.min(PH, y1); y++) { const o = (y * PW + px) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; }
          maxEl = el;
        }
      }
    }
    const mark = (el, c) => { const y = Math.round(((elMax - el) / (elMax - elMin)) * PH); if (y >= 0 && y < PH) for (let px = 0; px < PW; px++) { const o = (y * PW + px) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; } };
    mark(0, [40, 40, 40]); mark(14, [220, 60, 60]); // horizon; the height the key visual's peaks reach
    for (const a of [-20, 60]) { const x = Math.round(((a - azMin) / (azMax - azMin)) * PW); for (let y = 0; y < PH; y++) { const o = (y * PW + x) * 3; img[o] = 30; img[o + 1] = 30; img[o + 2] = 30; } } // hero frame edges
    rows.push(await sharp(img, { raw: { width: PW, height: PH, channels: 3 } }).png().toBuffer());
    console.log(`  ground here ${h0.toFixed(0)} m`);
  }
  const out = `${CACHE}/preview.png`;
  await sharp({ create: { width: PW, height: PH * rows.length, channels: 3, background: '#000' } }).composite(rows.map((input, i) => ({ input, top: i * PH, left: 0 }))).png().toFile(out);
  console.log(`wrote ${out}  (rows top→bottom = candidates; black verticals = the hero frame, red = 14° elevation)`);
  process.exit(0);
}

// ---------------------------------------------------------------- build
const T = house.terrain ?? {};
const lat = T.lat ?? 23.557, lon = T.lon ?? 58.3985, bearing = T.bearing ?? 180, exaggerate = T.exaggerate ?? 1;
console.log(`terrain at ${lat}, ${lon}, −Z bearing ${bearing}°, exaggeration ${exaggerate}`);
const { h, h0 } = await localField(lat, lon, bearing, exaggerate);
console.log(`  villa ground ${h0.toFixed(0)} m above sea`);

const sun = house.sun.dir; const sl = Math.hypot(sun[0], sun[2]); const sx = sun[0] / sl, sz = sun[2] / sl, sunTan = sun[1] / sl;
// the terrain renders behind the scene (background pass), so the villa's ground plane (±350 m) always covers what is under it:
// only a short feather under that edge, no flattened plain (a flattened ring rising into the real hills read as a dark wall)
const R0 = 250, R1 = 32000, FLAT0 = 300, FLAT1 = 420;
/** azimuths (0 = −Z, clockwise toward +X): 3/4 of the samples in the 200° in front of the camera */
function azimuths(n) {
  const front = Math.round(n * 0.75), back = n - front, a = [];
  for (let i = 0; i < front; i++) a.push(((-100 + (200 * i) / front) * Math.PI) / 180);
  for (let i = 0; i < back; i++) a.push(((100 + (160 * i) / back) * Math.PI) / 180);
  return a;
}
const radii = (n) => Array.from({ length: n }, (_, i) => R0 * (R1 / R0) ** (i / (n - 1)));

function bake(na, nr) {
  const az = azimuths(na), rr = radii(nr), N = na * nr;
  const H = new Int16Array(N), SUN = new Uint8Array(N), AO = new Uint8Array(N);
  const flat = (r) => (r <= FLAT0 ? 0 : r >= FLAT1 ? 1 : ((r - FLAT0) / (FLAT1 - FLAT0)) ** 2 * (3 - 2 * (r - FLAT0) / (FLAT1 - FLAT0)));
  const hf = (x, z) => h(x, z) * flat(Math.hypot(x, z));
  const dirs = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
  let t0 = Date.now();
  for (let j = 0; j < nr; j++) {
    for (let i = 0; i < na; i++) {
      const x = Math.sin(az[i]) * rr[j], z = -Math.cos(az[i]) * rr[j], y = hf(x, z), k = j * na + i;
      H[k] = Math.max(-32000, Math.min(32000, Math.round(y * 10)));
      // sun: march toward the low sun; soft edge from how far the terrain rises above the ray
      let vis = 1;
      for (let t = 20; t < 14000; t *= 1.12) { const hy = hf(x + sx * t, z + sz * t), ray = y + t * sunTan; const over = (hy - ray) / (t * 0.035 + 4); if (over > 0) { vis = Math.min(vis, Math.max(0, 1 - over)); if (vis <= 0) break; } }
      SUN[k] = Math.round(vis * 255);
      // ambient occlusion: how much of the sky the horizon hides, in 8 directions out to 1.6 km
      let occ = 0;
      for (const [dx, dz] of dirs) { let m = 0; for (let t = 15; t < 1600; t *= 1.35) m = Math.max(m, (hf(x + dx * t, z + dz * t) - y) / t); occ += Math.sin(Math.atan(m)); }
      AO[k] = Math.round(Math.max(0, 1 - occ / 8 * 1.2) * 255);
    }
    if (Date.now() - t0 > 4000) { process.stdout.write(`  ${na}×${nr}: ring ${j}/${nr}\n`); t0 = Date.now(); }
  }
  // file: "TRN1", u32 json length, json header, f32 azimuths, f32 radii, i16 heights (dm), u8 sun, u8 ao
  const hdr = Buffer.from(JSON.stringify({ na, nr, lat, lon, bearing, exaggerate, h0: +h0.toFixed(1), sun }));
  const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const head = pad(Buffer.concat([Buffer.from('TRN1'), Buffer.from(new Uint32Array([hdr.length]).buffer), hdr]));
  return Buffer.concat([head, Buffer.from(new Float32Array(az).buffer), Buffer.from(new Float32Array(rr).buffer), pad(Buffer.from(H.buffer)), Buffer.from(SUN.buffer), Buffer.from(AO.buffer)]);
}
const dir = `${ROOT}public/models/`; mkdirSync(dir, { recursive: true });
const write = (buf, base) => {
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 8);
  for (const f of readdirSync(dir)) if (new RegExp(`^${base}-[0-9a-f]{8}\\.bin$`).test(f)) unlinkSync(dir + f);
  writeFileSync(`${dir}${base}-${hash}.bin`, buf); console.log(`wrote public/models/${base}-${hash}.bin (${(buf.length / 1024).toFixed(0)} KB)`);
  return `/models/${base}-${hash}.bin`;
};
const full = write(bake(Number(args.na || 1024), Number(args.nr || 256)), 'terrain');
const lite = write(bake(512, 160), 'terrain-lite');
house.terrain = { lat, lon, bearing, exaggerate, ...(house.terrain ?? {}), model: full, modelLite: lite };
writeFileSync(housePath, JSON.stringify(house, null, 2) + '\n');
console.log('house.json terrain updated');
