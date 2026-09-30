#!/usr/bin/env node
/**
 * Exterior PBR sets for the street, the neighbourhood, the ground and the mountains (Poly Haven, CC0) →
 * public/textures/env/<name>_{diff,nor,rough|ao}.webp. Sources are cached in assets/polyhaven/ (git-ignored) and
 * downloaded from the Poly Haven API when missing.
 *
 *   node scripts/build-env-textures.mjs [--only=asphalt,interlock]
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}public/textures/env/`, CACHE = `${ROOT}assets/polyhaven/`;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const only = args.only ? String(args.only).split(',') : null;
// name: [Poly Haven id, resolution, saturation kept in the colour map, output size, maps]
const SETS = {
  render: ['beige_wall_001', '1k', 0.25, 1024, ['diff', 'nor_gl', 'rough']],   // (legacy) rendered walls, tinted in code
  dsand: ['dense_sand', '2k', 0.9, 1024, ['diff', 'nor']],                     // wind-packed sand far out
  grass: ['grass_medium_01', '1k', 1, 1024, ['ao', 'rough']],                  // lawn occlusion + roughness
  asphalt: ['asphalt_04', '2k', 0.6, 1024, ['diff', 'nor_gl', 'rough']],       // the road: sun-bleached, fine aggregate
  interlock: ['concrete_pavers', '2k', 0.7, 1024, ['diff', 'nor_gl', 'rough']], // the pavement and driveways: interlock concrete pavers
  gravel: ['gravelly_sand', '2k', 0.8, 1024, ['diff', 'nor_gl']],              // verges, open plots, garden gravel
  plaster: ['painted_plaster_wall', '2k', 0.3, 1024, ['diff', 'nor_gl', 'rough']], // painted render of boundary walls and villas (tinted in code)
  cliff: ['cliff_side', '2k', 0.85, 1024, ['diff', 'nor_gl']],                 // the Hajar: bedded, fractured faces (terrain.ts, projected from the side)
  scree: ['rock_face', '2k', 0.85, 1024, ['diff', 'nor_gl']],                  // the Hajar: broken slopes and fans (projected from above)
};
const API = { diff: 'Diffuse', nor_gl: 'nor_gl', nor: 'nor_gl', rough: 'Rough', ao: 'AO' };
mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true });
const listings = new Map();
async function source(id, key, res) {
  const file = `${CACHE}${id}_${key}_${res}.jpg`; if (existsSync(file)) return file;
  if (!listings.has(id)) listings.set(id, await (await fetch(`https://api.polyhaven.com/files/${id}`)).json());
  const url = listings.get(id)?.[API[key]]?.[res]?.jpg?.url; if (!url) return null;
  writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return file;
}
for (const [name, [id, res, sat, size, maps]] of Object.entries(SETS)) {
  if (only && !only.includes(name)) continue;
  for (const key of maps) {
    const src = await source(id, key, res).catch(() => null); if (!src) { console.warn(`${id}: missing ${key} ${res}`); continue; }
    const suffix = key === 'nor_gl' ? 'nor' : key;
    let img = sharp(readFileSync(src)).resize(size, size);
    if (suffix === 'diff') img = img.modulate({ saturation: sat });
    await img.webp({ quality: suffix === 'nor' ? 90 : 82 }).toFile(`${OUT}${name}_${suffix}.webp`);
  }
  console.log(name, '←', id);
}
