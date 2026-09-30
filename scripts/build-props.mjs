#!/usr/bin/env node
/**
 * Photoscanned props for the landing villa (Poly Haven, CC0): garden shrubs, potted plants, planters, the
 * living-room sofa, armchair and coffee table, vases, street lamps, and the meadow's boulders. Download the 1k glTF, simplify to a
 * budget, WebP textures, Draco, and (with --wire) put the hashed files into src/data/house.json `props`.
 *
 *   node scripts/build-props.mjs [--only=sofa,shrub2] [--wire]
 *
 * Sources land in assets/polyhaven/<id>/ (git-ignored); outputs in public/models/prop-<kind>-<hash>.glb.
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
// kind: Poly Haven id, triangle ratio kept, texture size, foliage (alpha-tested leaves stay double-sided)
const PROPS = {
  shrub2: { id: 'shrub_02', ratio: 0.3, tex: 1024, foliage: true },
  shrub4: { id: 'shrub_04', ratio: 0.3, tex: 1024, foliage: true },
  rooibos: { id: 'wild_rooibos_bush', ratio: 0.3, tex: 1024, foliage: true },
  plant2: { id: 'potted_plant_02', ratio: 0.35, tex: 1024, foliage: true },
  plant4: { id: 'potted_plant_04', ratio: 0.35, tex: 1024, foliage: true },
  planter: { id: 'planter_pot_clay', ratio: 0.4, tex: 1024 },
  sofa: { id: 'sofa_03', ratio: 0.35, tex: 1024 },
  armchair: { id: 'modern_arm_chair_01', ratio: 0.35, tex: 1024 },
  coffee: { id: 'coffee_table_round_01', ratio: 0.4, tex: 1024 },
  vase: { id: 'ceramic_vase_03', ratio: 0.4, tex: 512 },
  brassvase: { id: 'brass_vase_02', ratio: 0.4, tex: 512 },
  lamp: { id: 'street_lamp_01', ratio: 0.4, tex: 1024 },
  // the meadow (house/meadow.ts): Namaqualand desert boulders (toned to sandstone in meadow.ts)
  boulder2: { id: 'namaqualand_boulder_02', ratio: 0.12, tex: 1024 },
  boulder4: { id: 'namaqualand_boulder_04', ratio: 0.12, tex: 1024 },
  boulder6: { id: 'namaqualand_boulder_06', ratio: 0.12, tex: 1024 },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
await MeshoptSimplifier.ready;
const house = JSON.parse(readFileSync(`${ROOT}src/data/house.json`, 'utf8'));
house.props ??= {};
const only = args.only ? String(args.only).split(',') : null;

for (const [kind, p] of Object.entries(PROPS)) {
  if (only && !only.includes(kind)) continue;
  const dir = `${ROOT}assets/polyhaven/${p.id}/`, gltf = `${dir}${p.id}.gltf`;
  try {
    if (!existsSync(gltf)) {
      const files = await (await fetch(`https://api.polyhaven.com/files/${p.id}`)).json(); const g = files.gltf['1k'].gltf;
      mkdirSync(dir, { recursive: true }); writeFileSync(gltf, Buffer.from(await (await fetch(g.url)).arrayBuffer()));
      for (const [rel, v] of Object.entries(g.include)) { mkdirSync(dirname(dir + rel), { recursive: true }); writeFileSync(dir + rel, Buffer.from(await (await fetch(v.url)).arrayBuffer())); }
    }
    const doc = await io.read(gltf); const root = doc.getRoot();
    await doc.transform(prune(), dedup(), weld());
    let before = 0, after = 0;
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      before += prim.getIndices().getCount() / 3;
      if (p.ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: p.ratio, error: 0.01, lockBorder: false });
      after += prim.getIndices().getCount() / 3;
      const m = prim.getMaterial(); if (p.foliage && m) { if (m.getAlphaMode() !== 'OPAQUE') { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); } m.setDoubleSided(true); }
    }
    await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, effort: 6, resize: [p.tex, p.tex] }), draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
    const bin = await io.writeBinary(doc);
    const hash = createHash('sha1').update(bin).digest('hex').slice(0, 8), file = `prop-${kind}-${hash}.glb`;
    for (const f of readdirSync(`${ROOT}public/models`)) if (new RegExp(`^prop-${kind}-[0-9a-f]{8}\\.glb$`).test(f)) unlinkSync(`${ROOT}public/models/${f}`);
    writeFileSync(`${ROOT}public/models/${file}`, bin);
    house.props[kind] = `/models/${file}`;
    console.log(`${kind.padEnd(10)} ${p.id.padEnd(22)} ${String(before).padStart(8)} → ${String(after).padStart(7)} tris  ${(bin.length / 1048576).toFixed(2)} MB  ${file}`);
  } catch (e) { console.warn(`${kind}: failed`, e.message); }
}
if (args.wire) writeFileSync(`${ROOT}src/data/house.json`, JSON.stringify(house, null, 2) + '\n');
else console.log('\nhouse.json not written (pass --wire). props:', JSON.stringify(house.props, null, 1));
