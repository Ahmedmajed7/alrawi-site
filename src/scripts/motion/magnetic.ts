/** Buttons lean toward a nearby pointer (fine pointers only); one listener, one rAF. */
import { finePointer, reduced } from './loop';
export function initMagnetic() {
  if (!finePointer() || reduced()) return;
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]'));
  if (!els.length) return;
  let mx = 0, my = 0, raf = 0;
  const tick = () => {
    raf = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = mx - cx, dy = my - cy;
      const reach = Math.max(r.width, r.height) / 2 + 70, d = Math.hypot(dx, dy);
      const k = d < reach ? (1 - d / reach) : 0;
      el.style.translate = k ? `${(dx * 0.22 * k).toFixed(2)}px ${(dy * 0.3 * k).toFixed(2)}px` : '';
    }
  };
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
}

/** [data-spot] surfaces carry a pointer spotlight (--mx/--my) for their hover ring and wash (Dartz). */
export function initSpot() {
  if (!finePointer()) return;
  document.querySelectorAll<HTMLElement>('[data-spot]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  });
}
