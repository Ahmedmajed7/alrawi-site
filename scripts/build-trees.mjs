#!/usr/bin/env node
/**
 * Photoscanned plants for the landing villa (Poly Haven, CC0): download the 1k glTF, simplify each
 * part to a budget, WebP textures, Draco, and wire the hashed files into src/data/house.json `plants`.
 *
 *   node scripts/build-trees.mjs [--only=tree]
 *
 *   tree  = island_tree_02 (a sidr-like broadleaf; ~1.07 M triangles → ~150 k)
 * Sources land in assets/polyhaven/<id>/ (git-ignored); outputs in public/models/<kind>-<hash>.glb.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, textureCompress, draco, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PLANTS = {
  // ratio per material name (first match wins); leaves are real geometry, so they survive heavy simplification at garden distance
  tree: { id: 'island_tree_02', parts: [['leaves', 0.12], ['branches', 0.1], ['', 0.5]], opaque: true },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
await MeshoptSimplifier.ready;
const house = JSON.parse(readFileSync(`${ROOT}src/data/house.json`, 'utf8'));
house.plants ??= {};

for (const [kind, p] of Object.entries(PLANTS)) {
  if (args.only && args.only !== kind) continue;
  const dir = `${ROOT}assets/polyhaven/${p.id}/`, gltf = `${dir}${p.id}.gltf`;
  if (!existsSync(gltf)) {
    const files = await (await fetch(`https://api.polyhaven.com/files/${p.id}`)).json(); const g = files.gltf['1k'].gltf;
    mkdirSync(dir, { recursive: true }); writeFileSync(gltf, Buffer.from(await (await fetch(g.url)).arrayBuffer()));
    for (const [rel, v] of Object.entries(g.include)) { mkdirSync(dirname(dir + rel), { recursive: true }); writeFileSync(dir + rel, Buffer.from(await (await fetch(v.url)).arrayBuffer())); }
  }
  const doc = await io.read(gltf); const root = doc.getRoot();
  await doc.transform(prune(), dedup(), weld());
  let before = 0, after = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const name = prim.getMaterial()?.getName() || ''; const ratio = p.parts.find(([k]) => name.includes(k))[1];
    before += prim.getIndices().getCount() / 3;
    if (ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false });
    after += prim.getIndices().getCount() / 3;
    if (p.opaque) { const m = prim.getMaterial(); m?.setAlphaMode('OPAQUE'); m?.setDoubleSided(true); }
  }
  console.log(kind, p.id, `${before} → ${after} triangles`);
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, effort: 6, resize: [1024, 1024] }), draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  const bin = await io.writeBinary(doc);
  const hash = createHash('sha1').update(bin).digest('hex').slice(0, 8), file = `${kind}-${hash}.glb`;
  for (const f of readdirSync(`${ROOT}public/models`)) if (new RegExp(`^${kind}-[0-9a-f]{8}\\.glb$`).test(f)) unlinkSync(`${ROOT}public/models/${f}`);
  writeFileSync(`${ROOT}public/models/${file}`, bin);
  house.plants[kind] = `/models/${file}`;
  console.log(`  wrote public/models/${file} (${(bin.length / 1048576).toFixed(2)} MB)`);
}
writeFileSync(`${ROOT}src/data/house.json`, JSON.stringify(house, null, 2) + '\n');
