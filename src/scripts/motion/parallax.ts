/** Scroll-linked depth: [data-parallax] images drift inside their frames, [data-drift="n"] elements move at n × scroll,
    [data-scrub] sections expose their progress through the view as --p (0 → 1) for CSS. */
import { onScroll, reduced } from './loop';
export function initParallax() {
  if (reduced()) return;
  const imgs = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
  const drifts = Array.from(document.querySelectorAll<HTMLElement>('[data-drift]'));
  const scrubs = Array.from(document.querySelectorAll<HTMLElement>('[data-scrub]'));
  if (!imgs.length && !drifts.length && !scrubs.length) return;
  onScroll((_, vh) => {
    const rects = imgs.map((el) => el.parentElement!.getBoundingClientRect());
    const dr = drifts.map((el) => (el.parentElement ?? el).getBoundingClientRect());
    const sr = scrubs.map((el) => el.getBoundingClientRect());
    imgs.forEach((el, i) => {
      const r = rects[i]; if (r.bottom < -100 || r.top > vh + 100) return;
      const p = (r.top + r.height / 2 - vh / 2) / vh;
      el.style.setProperty('--py', `${(-p * 7).toFixed(2)}%`);
    });
    drifts.forEach((el, i) => {
      const r = dr[i]; if (r.bottom < -200 || r.top > vh + 200) return;
      el.style.setProperty('--dy', `${((r.top + r.height / 2 - vh / 2) * -Number(el.dataset.drift || 0.1)).toFixed(1)}px`);
    });
    scrubs.forEach((el, i) => {
      const r = sr[i]; const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      el.style.setProperty('--p', p.toFixed(4));
    });
  });
}
