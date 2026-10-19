/**
 * Where things happen inside each clip of the film, for its sound (src/scripts/film/sfx.ts): the door's unlatch and swing on the
 * way in, the threshold (the exposure fade: the ambience crosses from the street to the rooms there), the drapes parting in the
 * curtain clip, the way out over the threshold and the door closing in front of the lens, the gate on the way back. The tour is
 * planned by src/scripts/three/house/camera-rig.ts (pure: the same code the walkthrough and the recorder run), so the times are
 * computed here, not timed by ear, and come out frame-exact against the published clips (each clip = the move + the recorder's
 * 0.3 s hold). Run after a change to house.json's poses or the rig's pace, before `npm run film:record`:
 *   node scripts/film-cues.mjs        → src/data/film-cues.json
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const tmp = mkdtempSync(path.join(tmpdir(), 'film-cues-'));
// the rig imports gsap for the live tween only; the plan itself never touches it
writeFileSync(path.join(tmp, 'gsap.js'), 'export const gsap = { to() { return { kill() {} }; }, delayedCall() {} };');
writeFileSync(path.join(tmp, 'entry.ts'), `
import * as THREE from 'three';
import { planMove, tourMoves } from '${path.join(root, 'src/scripts/three/house/camera-rig.ts')}';
import cfg from '${path.join(root, 'src/data/house.json')}';
const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
const ang = (d: THREE.Vector3) => ({ yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) });
const c = cfg as any, tour = tourMoves(c), stops = c.stops, GATE = c.gate.pos[2], r = (x: number) => +x.toFixed(3);
const plan = (pos: number[], look: number[], spec: any) => { const p0 = v(pos), a = ang(v(look).sub(p0)); return planMove(p0, a.yaw, a.pitch, spec); };
const out: Record<string, Record<string, number>> = {};
{ const p = plan(c.exterior.pos, c.exterior.look, tour.enter()), tDoor = p.timeWhen((q) => q.z < 0.3);
  // walkthrough.ts enter(): the door starts 3 s before the lens is at the threshold (door.ts: 0.25 s unlatch, then the swing), the
  // exposure fades to the rooms' from 1 s before it over 1.6 s
  out[stops[0].id] = { T: r(p.T), gate: r(p.timeWhen((q) => q.z < GATE)), door: r(Math.max(0, tDoor - 3)), inside: r(Math.max(0, tDoor - 1)), threshold: r(tDoor) }; }
for (let i = 1; i < stops.length; i++) { const s0 = stops[i - 1], p = plan(s0.camera.pos, s0.camera.look, tour.goTo(i)); out[stops[i].id] = { T: r(p.T) };
  if (stops[i].id === 'curtain') out.curtain.drapes = r(Math.max(0, p.T + 0.5 - 2.8)); } // the drapes part over 2.8 s and rest within the hold
{ const s0 = stops[stops.length - 2], p = plan(s0.camera.pos, s0.camera.look, tour.leave()), tOut = p.timeWhen((q) => q.z > 0.2), tClose = Math.max(tOut + 0.05, p.T - 1.25);
  // leaveToLock(): the exposure fades back to the street's 0.8 s before the lens is over the threshold; the door closes on its closer
  // over 2.4 s (door.ts SWING.close, then the bolts) and the stop is reached 0.1 s after
  out[stops[stops.length - 1].id] = { T: r(tClose + 2.5), outside: r(Math.max(0, tOut - 0.8)), threshold: r(tOut), close: r(tClose) }; }
{ const s0 = stops[stops.length - 1], p = plan(s0.camera.pos, s0.camera.look, tour.outro()); out.outro = { T: r(p.T), gate: r(p.timeWhen((q) => q.z > GATE)) }; }
console.log(JSON.stringify(out));
`);
const outfile = path.join(tmp, 'plan.mjs');
await build({ entryPoints: [path.join(tmp, 'entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning', alias: { gsap: path.join(tmp, 'gsap.js'), three: require.resolve('three') } });
const { stdout } = await import('node:child_process').then((cp) => cp.spawnSync(process.execPath, [outfile], { encoding: 'utf8' }));
const cues = JSON.parse(stdout);
const file = path.join(root, 'src/data/film-cues.json');
writeFileSync(file, JSON.stringify({ note: 'seconds into each clip of the film: node scripts/film-cues.mjs (from house.json through camera-rig.ts); the player (film/sfx.ts) hangs the sound on these', clips: cues }, null, 2) + '\n');
console.log(`wrote ${path.relative(root, file)}`);
for (const [id, c] of Object.entries(cues)) console.log(`  ${id.padEnd(8)} ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
