/** Figures count up like the HUD's live readouts (ease-out, tabular). data-count = target, data-suffix appended. */
import { reduced } from './loop';
export function countUp(el: HTMLElement) {
  if (el.dataset.counted) return; el.dataset.counted = '1';
  const to = Number(el.dataset.count || 0), suffix = el.dataset.suffix || '';
  if (reduced()) { el.textContent = to + suffix; return; }
  const dur = 1600 + Math.min(900, to * 3), t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    el.textContent = Math.round(to * e) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
