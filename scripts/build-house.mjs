#!/usr/bin/env node
/**
 * Optimise the client's house model for the web.
 * Usage: node scripts/build-house.mjs assets/house/villa.glb
 * Produces public/models/house.glb (high) and public/models/house-lite.glb (mobile).
 */
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
const src = process.argv[2];
if (!src || !existsSync(src)) { console.error('Pass the path to a .glb/.gltf file (see docs/house-model.md for FBX/.blend)'); process.exit(1); }
const run = (cmd) => { console.log('>', cmd); execSync(cmd, { stdio: 'inherit' }); };
const cli = 'npx @gltf-transform/cli';
const tmp = (n) => `/tmp/house-${n}.glb`;
// explicit chain (no dedup: the client's materials are numerically identical and must stay separate)
run(`${cli} flatten "${src}" ${tmp(1)}`); run(`cp ${tmp(1)} ${tmp(3)}`); // join/weld skipped: they merge identical materials
run(`${cli} draco ${tmp(3)} public/models/house.glb`);
run(`${cli} simplify ${tmp(3)} ${tmp(4)} --ratio 0.5 --error 0.001`); run(`${cli} draco ${tmp(4)} public/models/house-lite.glb`);
for (const f of ['public/models/house.glb', 'public/models/house-lite.glb']) console.log(f, (statSync(f).size / 1048576).toFixed(1), 'MB');
run(`${cli} inspect public/models/house.glb`);
console.log('\nNow set "model": "/models/house.glb" and "modelLite": "/models/house-lite.glb" in src/data/house.json, then open /en/?author to place the devices.');
