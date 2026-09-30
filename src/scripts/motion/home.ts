/** Home only: the hero after the film (constellation, beams that lean with the pointer and spread on scroll) and the
    process rail, which draws with scroll and lights each step as the line reaches it. */
import { onScroll, reduced, finePointer } from './loop';
import { initNets } from './net';

export function initHome() {
  initNets();
  // the hero after the film: its beams and mark lean with the pointer (--px/--py in -1..1)
  const hero = document.querySelector<HTMLElement>('[data-hero2]');
  if (hero && !reduced()) {
    if (finePointer()) {
      let raf = 0, x = 0, y = 0, gx = 0, gy = 0;
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        gx = e.clientX - r.left; gy = e.clientY - r.top; x = (gx / r.width - 0.5) * 2; y = (gy / r.height - 0.5) * 2;
        if (!raf) raf = requestAnimationFrame(() => {
          raf = 0;
          hero.style.setProperty('--px', x.toFixed(3)); hero.style.setProperty('--py', y.toFixed(3));
          hero.style.setProperty('--gx', `${gx.toFixed(0)}px`); hero.style.setProperty('--gy', `${gy.toFixed(0)}px`);
        });
      }, { passive: true });
      hero.addEventListener('pointerenter', () => hero.classList.add('is-lit'));
      hero.addEventListener('pointerleave', () => { hero.classList.remove('is-lit'); hero.style.setProperty('--px', '0'); hero.style.setProperty('--py', '0'); });
    }
    // leaving: as the hero scrolls up out of view the beams spread, the mark grows and the words lift away (--sx 0 → 1)
    onScroll((_, vh) => {
      const r = hero.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh) return;
      hero.style.setProperty('--sx', Math.min(1, Math.max(0, -r.top / (r.height * 0.75))).toFixed(4));
    });
  }

  const rail = document.querySelector<HTMLElement>('[data-rail]');
  if (rail) {
    const steps = Array.from(rail.querySelectorAll<HTMLElement>('[data-rail-step]'));
    const n = steps.length;
    onScroll((_, vh) => {
      const r = rail.getBoundingClientRect();
      // 0 when the rail's top reaches 85 % of the view, 1 when its bottom reaches 55 %
      const p = reduced() ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.3)));
      rail.style.setProperty('--draw', p.toFixed(4));
      steps.forEach((s, i) => s.classList.toggle('is-lit', p >= (i + 0.35) / n - 0.08));
    });
  }

}
