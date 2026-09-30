/**
 * Adaptive quality: watch the real frame time and step effects down (never up) until the
 * walkthrough holds its budget. Old laptops with a "high" GPU string still end up smooth.
 */
import * as THREE from 'three';
import type { Stage } from './renderer';

export interface Quality { sample(ms: number): void; level: number; label(): string }

const BUDGET_MS = +(new URLSearchParams(location.search).get('budget') || 24); // ~40 fps; below this the fly-in reads as a slideshow (dev: ?budget=1 forces every step)
const WINDOW = 45;    // frames per decision

export function adaptiveQuality(stage: Stage, root: HTMLElement): Quality {
  const r = stage.renderer; const env = stage.env;
  const dpr0 = r.getPixelRatio();
  const setDpr = (v: number) => { r.setPixelRatio(v); const s = r.getSize(new THREE.Vector2()); r.setSize(s.x, s.y, false); stage.setSize(s.x, s.y); };
  const steps: { name: string; apply(): void }[] = [
    { name: 'ao off', apply: () => { if (stage.gtao) stage.gtao.enabled = false; } },
    { name: 'dpr 1.25', apply: () => setDpr(Math.min(dpr0, 1.25)) },
    { name: 'grass off', apply: () => { if (env.grass) env.grass.visible = false; } },
    { name: 'motion off', apply: () => { env.wind.value = 0; env.setInside(true); } },
    { name: 'dpr 1', apply: () => setDpr(1) },
    { name: 'bloom off', apply: () => { if (stage.bloom) stage.bloom.enabled = false; if (stage.grade) stage.grade.pass.enabled = false; } },
    { name: 'oasis off', apply: () => { env.oasis.visible = false; } },
    { name: 'shadows off', apply: () => { stage.sun.castShadow = false; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; } },
  ];
  let level = 0; const buf: number[] = []; let settle = 30; // ignore the first frames (uploads, compiles)
  const q: Quality = {
    get level() { return level; },
    label: () => (level ? steps.slice(0, level).map((s) => s.name).join(' · ') : 'full'),
    sample(ms) {
      if (settle > 0) { settle--; return; }
      buf.push(ms); if (buf.length < WINDOW) return;
      const sorted = [...buf].sort((a, b) => a - b); const median = sorted[sorted.length >> 1]; buf.length = 0;
      if (median > BUDGET_MS && level < steps.length) { steps[level++].apply(); settle = 20; root.dataset.quality = q.label(); }
    },
  };
  return q;
}
