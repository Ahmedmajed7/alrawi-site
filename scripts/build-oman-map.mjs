#!/usr/bin/env node
/**
 * The projects map on the home page (company profile, page 17): Oman's governorates as SVG paths.
 * Source: Natural Earth 10m admin-1 (public domain), cached in scripts/_cache/geo/. The profile counts projects in nine
 * regions, so Al Batinah North + South and Ash Sharqiyah North + South are dissolved into one shape each.
 * Writes src/data/oman-map.json: { viewBox, outline, regions: [{ id, d, at }] } (at = where the region's light stands). Counts and names live in
 * src/data/projects.json.   Usage: node scripts/build-oman-map.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, 'scripts/_cache/geo/ne-omn-admin1.geojson');
const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const OUT = resolve(ROOT, 'src/data/oman-map.json');

// Natural Earth name → the profile's region
const GROUP = {
  Musandam: 'musandam', 'Al Buraymi': 'buraimi', 'Al Batnah North': 'batinah', 'Al Batnah South': 'batinah',
  Muscat: 'muscat', 'Al Dhahira': 'dhahirah', 'Ad Dakhliyah': 'dakhiliyah', 'Ash Sharqiyah North': 'sharqiyah',
  'Ash Sharqiyah South': 'sharqiyah', 'Al Wusta': 'wusta', Dhofar: 'dhofar',
};
const ORDER = ['muscat', 'dakhiliyah', 'dhahirah', 'batinah', 'sharqiyah', 'wusta', 'buraimi', 'musandam', 'dhofar'];
const OFFICE = [58.36, 23.55]; // the Muscat office (Al Azaiba): Muscat's light stands here
// where a region's light stands when the deepest point would crowd its neighbours (viewBox units, checked to be inside)
const AT = { batinah: [478, 280], buraimi: [376, 236], dhahirah: [385, 445], dakhiliyah: [512, 468] };
const H = 1000, PAD = { l: 26, r: 26, t: 30, b: 30 };

async function load() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'));
  console.log('downloading Natural Earth admin-1 (40 MB)…');
  const all = await (await fetch(SRC)).json();
  const omn = { type: 'FeatureCollection', features: all.features.filter((f) => f.properties.adm0_a3 === 'OMN') };
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(omn));
  return omn;
}

const merc = ([lon, lat]) => [(lon * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

/** Union of polygons that share borders vertex for vertex: drop every edge that also runs the other way, stitch the rest. */
function dissolve(rings) {
  const edges = new Map();
  for (const r of rings) for (let i = 0; i < r.length - 1; i++) {
    const a = key(r[i]), b = key(r[i + 1]);
    if (a === b) continue;
    if (edges.has(`${b}|${a}`)) edges.delete(`${b}|${a}`); else edges.set(`${a}|${b}`, [r[i], r[i + 1]]);
  }
  const from = new Map();
  for (const [k, e] of edges) { const a = k.split('|')[0]; if (!from.has(a)) from.set(a, []); from.get(a).push(e); }
  const out = [];
  while (edges.size) {
    const [k0, e0] = edges.entries().next().value;
    edges.delete(k0);
    const ring = [e0[0], e0[1]];
    for (let guard = 0; guard < 1e5; guard++) {
      const here = key(ring[ring.length - 1]);
      if (here === key(ring[0])) break;
      const next = (from.get(here) || []).find((e) => edges.has(`${key(e[0])}|${key(e[1])}`));
      if (!next) break;
      edges.delete(`${key(next[0])}|${key(next[1])}`);
      ring.push(next[1]);
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}

const area = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
const inside = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
/** The point deepest inside a ring (a grid search is plenty at this size): where the region's light sits. */
function deepest(r) {
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], bd = -1;
  const N = 48;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
    if (!inside(p, r)) continue;
    let d = Infinity;
    for (let k = 0; k < r.length - 1; k++) d = Math.min(d, segDist(p, r[k], r[k + 1]));
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}

const omn = await load();
const groups = new Map(ORDER.map((id) => [id, []]));
for (const f of omn.features) {
  const id = GROUP[f.properties.name];
  if (!id) throw new Error(`unmapped governorate: ${f.properties.name}`);
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of polys) groups.get(id).push(poly[0].map(merc)); // outer rings only (no lakes at this scale)
}

// fit: the country's height fills H
const all = [...groups.values()].flat(2);
const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
const k = (H - PAD.t - PAD.b) / (maxY - minY);
const W = Math.round((maxX - minX) * k + PAD.l + PAD.r);
const fit = (p) => [(p[0] - minX) * k + PAD.l, (p[1] - minY) * k + PAD.t];
const n1 = (v) => (Math.round(v * 10) / 10).toString();
const path = (rings) => rings.map((r) => 'M' + r.slice(0, -1).map((p) => `${n1(p[0])} ${n1(p[1])}`).join('L') + 'Z').join('');

const regions = ORDER.map((id) => {
  const rings = dissolve(groups.get(id)).map((r) => r.map(fit)).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const at = id === 'muscat' ? fit(merc(OFFICE)) : AT[id] ?? deepest(rings[0]);
  if (!inside(at, rings[0])) throw new Error(`${id}: the light at ${at} is outside the region`);
  return { id, d: path(rings), at: [Math.round(at[0]), Math.round(at[1])] };
});
const outline = dissolve([...groups.values()].flat()).map((r) => r.map(fit)).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));

writeFileSync(OUT, JSON.stringify({ viewBox: [W, H], outline: path(outline), regions }) + '\n');
console.log(`oman-map.json: ${W}×${H}, ${regions.length} regions, outline rings ${outline.length}, ${(JSON.stringify(regions).length / 1024).toFixed(1)} KB`);
for (const r of regions) console.log(' ', r.id.padEnd(11), 'at', r.at.join(','), 'path', r.d.length);
