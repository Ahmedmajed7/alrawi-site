#!/usr/bin/env node
/** Render the exterior (stop 0), the six stops and the exit view for posters, OG and the slideshow fallback. */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import house from '../src/data/house.json' with { type: 'json' };
const base = process.env.SITE || 'http://localhost:4321';
const out = 'scripts/_cache/stops'; mkdirSync(out, { recursive: true });
const n = house.stops.length;
for (let i = 0; i <= n + 1; i++) {
  const url = `${base}/en/?stop=${i}&tier=high`;
  const pre = "document.querySelectorAll('.walk-ui,.walk-load,.grain,.wa-fab,.nav').forEach(e=>e.remove())";
  execFileSync('node', ['scripts/shoot.mjs', `${out}/stop-${i}.png`, url, '1600', '900', '9000', '', pre], { stdio: 'inherit' });
}
console.log('Now: python3 scripts/make-stops.py  (→ public/img/house/stop-N.webp, intro-poster, og.jpg)');
