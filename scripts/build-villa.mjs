#!/usr/bin/env node
/**
 * Build the landing-page villa from the Tripo GLB: bake scale/origin into metres, cut away the
 * plinth / road / baked interior / door + gate leaves / window panes, simplify, compress.
 *
 *   node scripts/build-villa.mjs               → public/models/villa-<hash>.glb + villa-lite-<hash>.glb
 *   node scripts/build-villa.mjs --dev         → public/models/villa-dev.glb (cuts only, uncompressed, fast)
 *   node scripts/build-villa.mjs --probe=y     → histogram of triangle centroids along an axis
 *        [--x=a,b --y=a,b --z=a,b --bin=0.05]     restricted to a slab (metres, after the transform)
 *   node scripts/build-villa.mjs --probe=plan  → ASCII occupancy map (x/z) of triangles inside the y band
 *   --only=high|lite   --nocut (probe/dev without cuts)
 * Everything is configured in src/data/villa.json (also read at runtime by the interior builder).
 */
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformPrimitive, unweld, weld, simplify, textureCompress, draco, prune, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const cfg = JSON.parse(readFileSync(`${ROOT}src/data/villa.json`, 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const range = (k, d) => (typeof args[k] === 'string' ? args[k].split(',').map(Number) : d);
const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------- io ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(`${ROOT}${cfg.source}`);
const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
if (prims.length !== 1) throw new Error(`expected one primitive, got ${prims.length}`);
const prim = prims[0];
if (!prim.getIndices()) throw new Error('primitive has no indices');
log('read', cfg.source, prim.getIndices().getCount() / 3, 'triangles');

// ---------- transform: source units → metres, origin at the door threshold, front = +Z ----------
const { scale: S, origin: O, yawDeg } = cfg.transform;
const a = (yawDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
const ro = [c * O[0] + s * O[2], O[1], -s * O[0] + c * O[2]]; // rotated origin
const M = [S * c, 0, -S * s, 0, 0, S, 0, 0, S * s, 0, S * c, 0, -S * ro[0], -S * ro[1], -S * ro[2], 1]; // column-major
const node = doc.getRoot().listNodes().find((n) => n.getMesh());
const W = node.getWorldMatrix();
const mul = (A, B) => { const R = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) R[j * 4 + i] += A[k * 4 + i] * B[j * 4 + k]; return R; };
transformPrimitive(prim, mul(M, W));
for (const n of doc.getRoot().listNodes()) { n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
const pos = prim.getAttribute('POSITION').getArray();
let idx = prim.getIndices().getArray();
const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { bb[0][k] = Math.min(bb[0][k], pos[i + k]); bb[1][k] = Math.max(bb[1][k], pos[i + k]); }
log('bbox (m)', bb.map((v) => v.map((x) => x.toFixed(2)).join(', ')).join('  →  '));

// ---------- cut boxes ----------
const boxes = [...(cfg.cuts || []).map((b) => ({ mode: 'centroid', ...b }))];
for (const w of cfg.windows || []) {
  const T = w.thick ?? 0.25, axis = w.face[1];
  const min = [0, w.y0, 0], max = [0, w.y1, 0];
  if (axis === 'x') { min[0] = w.at - T; max[0] = w.at + T; min[2] = Math.min(w.a0, w.a1); max[2] = Math.max(w.a0, w.a1); }
  else { min[2] = w.at - T; max[2] = w.at + T; min[0] = Math.min(w.a0, w.a1); max[0] = Math.max(w.a0, w.a1); }
  boxes.push({ id: `win:${w.id}`, min, max, mode: w.mode || 'centroid' });
}
const inside = (B, x, y, z) => x >= B.min[0] && x <= B.max[0] && y >= B.min[1] && y <= B.max[1] && z >= B.min[2] && z <= B.max[2];
if (!args.nocut && boxes.length) {
  const keep = new Uint32Array(idx.length); let k = 0; const removed = Object.fromEntries(boxes.map((b) => [b.id, 0]));
  for (let t = 0; t < idx.length; t += 3) {
    const A = idx[t] * 3, Bv = idx[t + 1] * 3, C = idx[t + 2] * 3;
    const cx = (pos[A] + pos[Bv] + pos[C]) / 3, cy = (pos[A + 1] + pos[Bv + 1] + pos[C + 1]) / 3, cz = (pos[A + 2] + pos[Bv + 2] + pos[C + 2]) / 3;
    let hit = null;
    for (const B of boxes) {
      let h;
      if (B.mode === 'any') h = inside(B, pos[A], pos[A + 1], pos[A + 2]) || inside(B, pos[Bv], pos[Bv + 1], pos[Bv + 2]) || inside(B, pos[C], pos[C + 1], pos[C + 2]);
      else if (B.mode === 'all') h = inside(B, pos[A], pos[A + 1], pos[A + 2]) && inside(B, pos[Bv], pos[Bv + 1], pos[Bv + 2]) && inside(B, pos[C], pos[C + 1], pos[C + 2]);
      else h = inside(B, cx, cy, cz);
      if (h) { hit = B; break; }
    }
    if (hit) removed[hit.id]++; else { keep[k++] = idx[t]; keep[k++] = idx[t + 1]; keep[k++] = idx[t + 2]; }
  }
  const acc = doc.createAccessor('indices').setType(Accessor.Type.SCALAR).setArray(keep.slice(0, k)).setBuffer(doc.getRoot().listBuffers()[0]);
  prim.getIndices().dispose(); prim.setIndices(acc); idx = acc.getArray();
  log('cuts:', Object.entries(removed).map(([id, n]) => `${id}=${n}`).join('  '), '→', k / 3, 'triangles left');
}

// ---------- probe ----------
if (args.probe) {
  const xr = range('x', [-1e9, 1e9]), yr = range('y', [-1e9, 1e9]), zr = range('z', [-1e9, 1e9]);
  const bin = +(args.bin || 0.05);
  const cent = []; // filtered centroids
  for (let t = 0; t < idx.length; t += 3) {
    const A = idx[t] * 3, B = idx[t + 1] * 3, C = idx[t + 2] * 3;
    const x = (pos[A] + pos[B] + pos[C]) / 3, y = (pos[A + 1] + pos[B + 1] + pos[C + 1]) / 3, z = (pos[A + 2] + pos[B + 2] + pos[C + 2]) / 3;
    if (x < xr[0] || x > xr[1] || y < yr[0] || y > yr[1] || z < zr[0] || z > zr[1]) continue;
    cent.push(x, y, z);
  }
  const n = cent.length / 3; log(`probe ${args.probe}: ${n} triangles in slab x${xr} y${yr} z${zr}`);
  if (args.probe === 'plan') {
    const cell = +(args.cell || 0.5); const x0 = Math.floor(bb[0][0] / cell), x1 = Math.ceil(bb[1][0] / cell), z0 = Math.floor(bb[0][2] / cell), z1 = Math.ceil(bb[1][2] / cell);
    const grid = new Map(); let mx = 0;
    for (let i = 0; i < cent.length; i += 3) { const key = `${Math.floor(cent[i] / cell)},${Math.floor(cent[i + 2] / cell)}`; const v = (grid.get(key) || 0) + 1; grid.set(key, v); mx = Math.max(mx, v); }
    const ramp = ' .:-=+*#%@';
    console.log(`plan view (rows = z from ${(z0 * cell).toFixed(1)} (top, back) to ${(z1 * cell).toFixed(1)} (bottom, front); cols = x from ${(x0 * cell).toFixed(1)} to ${(x1 * cell).toFixed(1)}; cell ${cell} m; max ${mx} tris/cell)`);
    for (let zi = z0; zi <= z1; zi++) { let row = `${(zi * cell).toFixed(1).padStart(6)} |`; for (let xi = x0; xi <= x1; xi++) { const v = grid.get(`${xi},${zi}`) || 0; row += ramp[Math.min(9, Math.round(Math.log1p(v) / Math.log1p(mx) * 9))]; } console.log(row); }
    let ax = '        '; for (let xi = x0; xi <= x1; xi++) ax += xi % 2 === 0 ? String(Math.abs(xi * cell).toFixed(0)).slice(-1) : ' '; console.log(ax);
  } else {
    const ai = { x: 0, y: 1, z: 2 }[args.probe]; const h = new Map(); let mx = 0;
    for (let i = ai; i < cent.length; i += 3) { const b = Math.floor(cent[i] / bin); const v = (h.get(b) || 0) + 1; h.set(b, v); mx = Math.max(mx, v); }
    const keys = [...h.keys()].sort((p, q) => p - q);
    for (const b of keys) { const v = h.get(b); if (v < mx * 0.01) continue; console.log(`${(b * bin).toFixed(2).padStart(7)} ${String(v).padStart(7)} ${'#'.repeat(Math.round(v / mx * 60))}`); }
  }
  process.exit(0);
}

// ---------- compact ----------
await doc.transform(unweld(), weld(), prune());
log('welded', prim.getAttribute('POSITION').getCount(), 'vertices', prim.getIndices().getCount() / 3, 'triangles');

if (args.dev) {
  const out = `${ROOT}public/models/villa-dev.glb`; await io.write(out, doc); log('wrote', out, (statSync(out).size / 1048576).toFixed(1), 'MB'); process.exit(0);
}

// ---------- LODs ----------
await MeshoptSimplifier.ready;
const outputs = [];
for (const [name, lod] of Object.entries(cfg.lods)) {
  if (args.only && args.only !== name) continue;
  const d = cloneDocument(doc);
  await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: lod.error }));
  const p = d.getRoot().listMeshes()[0].listPrimitives()[0];
  log(name, 'simplified →', p.getIndices().getCount() / 3, 'triangles');
  await d.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: lod.quality ?? 82, effort: 6, ...(lod.textureSize ? { resize: [lod.textureSize, lod.textureSize] } : {}) }));
  await d.transform(draco({ method: 'edgebreaker', ...cfg.draco }));
  const bin = await io.writeBinary(d);
  const hash = createHash('sha1').update(bin).digest('hex').slice(0, 8);
  const file = name === 'high' ? `villa-${hash}.glb` : `villa-${name}-${hash}.glb`;
  for (const f of readdirSync(`${ROOT}public/models`)) if (new RegExp(`^villa-${name === 'high' ? '' : name + '-'}[0-9a-f]{8}\\.glb$`).test(f)) unlinkSync(`${ROOT}public/models/${f}`);
  writeFileSync(`${ROOT}public/models/${file}`, bin);
  outputs.push([name, `/models/${file}`, (bin.length / 1048576).toFixed(2) + ' MB']);
}
console.table(outputs);
console.log('Now set "model" / "modelLite" in src/data/house.json to the paths above.');
