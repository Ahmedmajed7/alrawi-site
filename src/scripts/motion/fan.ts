/** Fans open with the scroll (--o: 0 closed and drafted → 1 open and filled) and lean toward the pointer. */
import { onScroll, reduced, finePointer } from './loop';
export function initFans() {
  const fans = Array.from(document.querySelectorAll<HTMLElement>('[data-fan]'));
  if (!fans.length) return;
  if (reduced()) { fans.forEach((f) => { f.style.setProperty('--o', '1'); f.classList.add('is-filled'); }); return; }
  onScroll((_, vh) => {
    for (const f of fans) {
      const r = f.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const p = Math.min(1, Math.max(0, (vh * 0.95 - r.top) / (vh * 0.7)));
      const e = 1 - Math.pow(1 - p, 3);
      f.style.setProperty('--o', e.toFixed(4));
      if (p > 0.35) f.classList.add('is-filled');
    }
  });
  if (finePointer()) fans.forEach((f) => {
    f.addEventListener('pointermove', (ev) => {
      const r = f.getBoundingClientRect();
      f.style.setProperty('--tx', (((ev.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
      f.style.setProperty('--ty', (((ev.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
    }, { passive: true });
    f.addEventListener('pointerleave', () => { f.style.setProperty('--tx', '0'); f.style.setProperty('--ty', '0'); });
  });
}
