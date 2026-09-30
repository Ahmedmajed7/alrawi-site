#!/usr/bin/env node
/**
 * Interior PBR sets for the walkthrough (Poly Haven and ambientCG, both CC0) → public/textures/interior/<name>_{diff,nor,rough}.webp.
 * Colour maps are desaturated here so the material `color` in interior.ts sets the final tone.
 *
 *   node scripts/fetch-interior-textures.mjs [--only=limewash,travertine,fabric,…]
 *
 * Downloads are cached in assets/polyhaven/ (git-ignored; ambientCG zips under assets/polyhaven/acg/), so a second run only converts.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}public/textures/interior/`, CACHE = `${ROOT}assets/polyhaven/`, ACG = `${CACHE}acg/`;
// name: [Poly Haven id, resolution, saturation kept in the colour map, output size, optional [contrast, offset] on the colour map]
const SETS = {
  fabric: ['rough_linen', '1k', 0, 1024],             // sofas, majlis, curtains: the weave, tinted in code
  velvet: ['velour_velvet', '1k', 0, 1024],           // cushions
  walnut: ['natural_walnut_veneer', '2k', 0.9, 1024], // the front door (door.ts); its wild cathedral figure reads as a cartoon on large faces
  plaster: ['white_plaster_02', '1k', 0.15, 1024, [0.3, 172]], // the shell's trowel marks (materials.ts) and roughness (house.json shell.roughnessMap)
  // smoked walnut for every interior trim, casing and cabinet: a quarter-cut veneer, fine straight grain, 1 m per tile (2K = 0.5 mm per
  // texel: the camera passes the casings at arm's length). Kept dark and nearly neutral; interior.ts warms it with the material colour.
  smoked: ['flamed_black_veneer', '2k', 0.8, 2048, [1.25, -6]],
  // soft goods (interior-soft.ts maps them from three sides, so they need no seams): a curly bouclé for the sofas, a dense wool
  // twill for the throw and the scatter cushions, a cut pile for the rug's relief. All grey here, dyed by the material colour
  boucle: ['curly_teddy_natural', '1k', 0, 1024],
  wool: ['caban', '1k', 0, 1024],
  pile: ['dirty_carpet', '1k', 0, 1024],
};
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const wanted = (name) => !only || only.includes(name);
mkdirSync(OUT, { recursive: true }); mkdirSync(ACG, { recursive: true });
for (const [name, [id, res, sat, size, lin]] of Object.entries(SETS)) {
  if (!wanted(name)) continue;
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [key, suffix] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['Rough', 'rough']]) {
    const src = files[key]?.[res]?.jpg?.url; if (!src) { console.warn(`${id}: no ${key}`); continue; }
    const cache = `${CACHE}${id}_${suffix}_${res}.jpg`;
    const legacy = `${CACHE}${id}_${key === 'nor_gl' ? 'nor_gl' : suffix}_${res}.jpg`; // earlier downloads kept Poly Haven's own suffix
    const from = existsSync(cache) ? cache : existsSync(legacy) ? legacy : null;
    if (!from) writeFileSync(cache, Buffer.from(await (await fetch(src)).arrayBuffer()));
    let img = sharp(readFileSync(from ?? cache)).resize(size, size);
    if (suffix === 'diff') { img = img.modulate({ saturation: sat }); if (lin) img = img.linear(lin[0], lin[1]); }
    if (suffix === 'rough' && size > 1024) img = img.resize(1024, 1024); // roughness never needs more than 1K
    await img.webp({ quality: suffix === 'nor' ? 90 : 84 }).toFile(`${OUT}${name}_${suffix}.webp`);
  }
  console.log(name, '←', id);
}

/* ---------- ambientCG (CC0): limewash plaster and honed travertine ---------- */
/** Download and unpack one ambientCG set; returns a function that gives the path of one of its maps. */
async function acg(id, res) {
  const dir = `${ACG}${id}_${res}/`, zip = `${ACG}${id}_${res}-JPG.zip`;
  if (!existsSync(`${dir}${id}_${res}-JPG_Color.jpg`)) {
    if (!existsSync(zip)) { const r = await fetch(`https://ambientcg.com/get?file=${id}_${res}-JPG.zip`); if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`); writeFileSync(zip, Buffer.from(await r.arrayBuffer())); }
    mkdirSync(dir, { recursive: true }); execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  }
  return (map) => `${dir}${id}_${res}-JPG_${map}.jpg`;
}
/** Greyscale float pixels (0..1) of an image at n × n. */
async function grey(path, n) { const { data } = await sharp(path).resize(n, n).greyscale().raw().toBuffer({ resolveWithObject: true }); const f = new Float32Array(n * n); for (let i = 0; i < f.length; i++) f[i] = data[i] / 255; return f; }
/** Tiling box blur (three passes ≈ Gaussian) of a square float image. */
function blur(src, n, r) {
  let a = src, b = new Float32Array(n * n);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < n; y++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * n + ((k + n) % n)]; for (let x = 0; x < n; x++) { b[y * n + x] = s / (2 * r + 1); s += a[y * n + ((x + r + 1) % n)] - a[y * n + ((x - r + n) % n)]; } }
    [a, b] = [b, a === src ? new Float32Array(n * n) : a];
    for (let x = 0; x < n; x++) { let s = 0; for (let k = -r; k <= r; k++) s += a[((k + n) % n) * n + x]; for (let y = 0; y < n; y++) { b[y * n + x] = s / (2 * r + 1); s += a[((y + r + 1) % n) * n + x] - a[((y - r + n) % n) * n + x]; } }
    [a, b] = [b, a];
  }
  return a;
}
const toWebp = (buf, n, ch, file, q = 88) => sharp(Buffer.from(buf.buffer), { raw: { width: n, height: n, channels: ch } }).webp({ quality: q }).toFile(file);
/** Blur along x only (tiling): a vein-cut stone's lines run along x, so this calms their small wiggles and leaves the lines. */
function blurX(src, n, r) { const b = new Float32Array(n * n); for (let y = 0; y < n; y++) { let s = 0; for (let k = -r; k <= r; k++) s += src[y * n + ((k + n) % n)]; for (let x = 0; x < n; x++) { b[y * n + x] = s / (2 * r + 1); s += src[y * n + ((x + r + 1) % n)] - src[y * n + ((x - r + n) % n)]; } } return b; }
/** A tangent-space normal map (OpenGL convention: +Y up, image rows run down) of a tiling height field, scaled so that the slopes'
 *  root mean square is `rms`: the material's normalScale then sets the relief in known units. */
function normalMap(h, n, rms) {
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n); let sum = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const at = (dx, dy) => h[((y + dy + n) % n) * n + ((x + dx + n) % n)], i = y * n + x;
    gx[i] = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1); gy[i] = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
    sum += gx[i] * gx[i] + gy[i] * gy[i];
  }
  const K = rms / Math.sqrt(sum / (n * n)), nor = new Uint8Array(n * n * 3);
  for (let i = 0; i < n * n; i++) { const x = -gx[i] * K, y = gy[i] * K, il = 1 / Math.hypot(x, y, 1); nor[i * 3] = Math.round((x * il * 0.5 + 0.5) * 255); nor[i * 3 + 1] = Math.round((y * il * 0.5 + 0.5) * 255); nor[i * 3 + 2] = Math.round((il * 0.5 + 0.5) * 255); }
  return nor;
}
const stats = (a) => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) * (v - m); return [m, Math.sqrt(s / a.length)]; };

if (wanted('limewash')) { // limewash, trowelled smooth: what is left of the hand is a broad, soft movement that only raking light finds
  const p2 = await acg('Plaster002', '2K'), p1 = await acg('Plaster001', '1K'), n = 2048;
  // relief: the scan's height without its pits, grit and scratches (everything finer than 3 cm is gone). Slopes are stored at an
  // r.m.s. of 0.1; interior.ts scales them down to the 1-2 % of a wall a plasterer has closed with a steel trowel
  await toWebp(normalMap(blur(await grey(p2('Displacement'), n), n, 14), n, 0.1), n, 3, `${OUT}limewash_nor.webp`, 92);
  // sheen: the burnished and the chalky patches, as clouds (no grit: a sparkle on a matt wall reads as noise in the film)
  const m = 1024, r = blur(await grey(p2('Roughness'), m), m, 5), [rm, rs] = stats(r), rough = new Uint8Array(m * m);
  for (let i = 0; i < rough.length; i++) rough[i] = Math.max(0, Math.min(255, Math.round((0.55 + (r[i] - rm) / rs * 0.1) * 255)));
  await toWebp(rough, m, 1, `${OUT}limewash_rough.webp`, 84);
  // tone: how lime dries, in clouds a hand to an arm wide. Only a multiplier around 1: mean 0.5, deviation 0.11, nothing fine
  const l = await grey(p1('Color'), m), mid = blur(l, m, 24), low = blur(l, m, 96), [mean] = stats(l), raw = new Float32Array(m * m);
  for (let i = 0; i < raw.length; i++) raw[i] = (mid[i] - mean) + 0.8 * (low[i] - mean);
  const [, sd] = stats(raw), out = new Uint8Array(m * m); for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((0.5 + raw[i] / sd * 0.11) * 255)));
  await toWebp(out, m, 1, `${OUT}limewash_mottle.webp`, 92);
  console.log('limewash ← ambientCG Plaster002 + Plaster001');
}
if (wanted('fine')) { // the paint's own skin: the fine, even stipple a roller and a skim coat leave, 1-3 mm across, that a wall shows at
  // arm's length and under a grazing lamp. Poly Haven painted_plaster_wall, only its fine relief (everything wider than ~1.5 cm is
  // taken out: the broad movement is limewash_nor's job, and a blotch at this scale read as dirt). One tile = 0.6 m (interior-surface.ts)
  const id = 'painted_plaster_wall', cache = `${CACHE}${id}_nor_gl_2k.jpg`;
  if (!existsSync(cache)) { const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json(); writeFileSync(cache, Buffer.from(await (await fetch(files.nor_gl['2k'].jpg.url)).arrayBuffer())); }
  const n = 1024, { data } = await sharp(cache).resize(n, n).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // back to a height field: integrate the slopes by a Poisson-free shortcut (the slopes' high-pass is what we keep, so rebuild the normal
  // from the high-passed slopes directly)
  const sx = new Float32Array(n * n), sy = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { const x = data[i * 3] / 127.5 - 1, y = data[i * 3 + 1] / 127.5 - 1, z = Math.max(0.2, data[i * 3 + 2] / 127.5 - 1); sx[i] = x / z; sy[i] = y / z; }
  const bx = blur(sx, n, 12), by = blur(sy, n, 12); let sum = 0;
  for (let i = 0; i < n * n; i++) { sx[i] -= bx[i]; sy[i] -= by[i]; sum += sx[i] * sx[i] + sy[i] * sy[i]; }
  const K = 0.1 / Math.sqrt(sum / (n * n)), nor = new Uint8Array(n * n * 3); // slopes stored at r.m.s. 0.1, like limewash_nor
  for (let i = 0; i < n * n; i++) { const x = sx[i] * K, y = sy[i] * K, il = 1 / Math.hypot(x, y, 1); nor[i * 3] = Math.round((x * il * 0.5 + 0.5) * 255); nor[i * 3 + 1] = Math.round((y * il * 0.5 + 0.5) * 255); nor[i * 3 + 2] = Math.round((il * 0.5 + 0.5) * 255); }
  await toWebp(nor, n, 3, `${OUT}plaster_fine_nor.webp`, 90);
  console.log('fine ← Poly Haven painted_plaster_wall (high-passed)');
}
if (wanted('travertine')) { // travertine: a light vein-cut stone, filled and honed. The scan keeps its own fine banding and its pores (the
  // first version drew every vein out sideways and the stone read as brushed veneer): only the slow tonal swings are calmed (the scan is a
  // bold polished slab; ours is a calmer cut of the same block, KEEP of its broad contrast, all of its fine), the colour two thirds neutral
  // and light (mean LEVEL: the material colour in interior.ts sets the stone's tone). The pits, the filled holes travertine is known by,
  // are found in the scan's height (what lies well below its neighbourhood) and kept a shade darker and a little rougher.
  // One tile of the map covers 2.4 m, so a 1.2 × 2.4 m slab never shows a repeat
  const t = await acg('Travertine009', '2K'), n = 2048, KEEP = 0.6, SAT = 0.35, LEVEL = 0.86;
  const { data } = await sharp(t('Color')).resize(n, n).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const disp = await grey(t('Displacement'), n), dLow = blur(disp, n, 5), pitH = new Float32Array(n * n); for (let i = 0; i < pitH.length; i++) pitH[i] = disp[i] - dLow[i];
  const [, ps] = stats(pitH), pit = new Float32Array(n * n); for (let i = 0; i < pit.length; i++) pit[i] = Math.min(1, Math.max(0, (-pitH[i] / ps - 1.8) / 2));
  const ch = [0, 1, 2].map((c) => { const f = new Float32Array(n * n); for (let i = 0; i < f.length; i++) f[i] = data[i * 3 + c] / 255; const [mean] = stats(f), low = blur(f, n, 72); for (let i = 0; i < f.length; i++) f[i] = mean + (low[i] - mean) * KEEP + (f[i] - low[i]); return f; });
  const lum = new Float32Array(n * n); for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * ch[0][i] + 0.7152 * ch[1][i] + 0.0722 * ch[2][i];
  const [lm] = stats(lum), col = new Uint8Array(n * n * 3);
  for (let i = 0; i < lum.length; i++) { const dark = 1 - 0.22 * pit[i]; for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.max(0, Math.min(255, Math.round((lum[i] + (ch[c][i] - lum[i]) * SAT) * LEVEL / lm * dark * 255))); }
  await toWebp(col, n, 3, `${OUT}travertine_diff.webp`, 90);
  // honed = flat: the relief is the pits and a hair along the veins, nothing broader than a centimetre (at 0.06 the grazer raked it into cleft stone)
  const wide = blur(lum, n, 8), h = new Float32Array(n * n); for (let i = 0; i < h.length; i++) h[i] = (lum[i] - wide[i]) * 0.15 + pitH[i];
  await toWebp(normalMap(blur(h, n, 1), n, 0.025), n, 3, `${OUT}travertine_nor.webp`, 90);
  // the filled veins and the pits take the hone differently from the body: a sheen that changes across the stone
  const m = 1024, ls = await grey(t('Color'), m), d = new Float32Array(m * m), ws = blur(ls, m, 20); for (let i = 0; i < d.length; i++) d[i] = ls[i] - ws[i];
  const pm = await sharp(Buffer.from(Uint8Array.from(pit, (v) => Math.round(v * 255)).buffer), { raw: { width: n, height: n, channels: 1 } }).resize(m, m).raw().toBuffer();
  const soft = blur(d, m, 1), [, ds] = stats(soft), rough = new Uint8Array(m * m);
  for (let i = 0; i < rough.length; i++) rough[i] = Math.max(0, Math.min(255, Math.round((0.62 - soft[i] / ds * 0.05 + pm[i] / 255 * 0.2) * 255)));
  await toWebp(rough, m, 1, `${OUT}travertine_rough.webp`, 84);
  console.log('travertine ← ambientCG Travertine009');
}
