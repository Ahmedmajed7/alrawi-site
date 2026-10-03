/** [data-read]: a statement whose words (.rw) take their ink one after another as the reader scrolls through it.
    [data-par]: a framed photograph that drifts inside its frame as it crosses the view (--par, −1 below … 1 above). */
import { onScroll, reduced } from './loop';

export function initReading() {
  document.querySelectorAll<HTMLElement>('[data-read]').forEach((box) => {
    const words = Array.from(box.querySelectorAll<HTMLElement>('.rw'));
    if (!words.length) return;
    if (reduced()) { words.forEach((w) => w.classList.add('is-lit')); return; }
    let lit = 0;
    onScroll((_, vh) => {
      const r = box.getBoundingClientRect();
      if (r.top > vh || (r.bottom < 0 && lit === words.length)) return;
      // 0 as the first line reaches 82 % of the view, 1 when the last line is at 52 %
      const p = Math.min(1, Math.max(0, (vh * 0.82 - r.top) / (r.height + vh * 0.3)));
      const n = Math.round(p * words.length);
      if (n === lit) return;
      for (let i = Math.min(n, lit); i < Math.max(n, lit); i++) words[i].classList.toggle('is-lit', i < n);
      lit = n;
    });
  });
}

export function initParallax() {
  if (reduced()) return;
  document.querySelectorAll<HTMLElement>('[data-par]').forEach((el) => {
    onScroll((_, vh) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) return;
      el.style.setProperty('--par', Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2))).toFixed(3));
    });
  });
}
