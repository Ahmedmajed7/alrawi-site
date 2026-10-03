/** Nav: the navy bar hides on the way down and returns on the way up, carries a brass progress hairline, and knows
    whether a dark band sits under it (over the film, before the first scroll, it is clear). */
import { onScroll } from './motion/loop';

export function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const burger = document.querySelector<HTMLButtonElement>('[data-burger]');
  const drawer = document.querySelector<HTMLElement>('[data-drawer]');
  if (!nav) return;
  // Hiding follows the direction of travel, and a direction only counts once the page has really moved that way
  // (TURN px from where it last turned). Comparing each frame with the one before made the bar shake: a smooth scroll
  // ends in steps of less than a pixel, so two frames often read the same position, which looked like "not going down"
  // and brought the bar back for a frame, over and over.
  const TOP = 420, TURN = 14;
  let hidden = false, anchor = 0;
  const tones = () => Array.from(document.querySelectorAll<HTMLElement>('[data-tone], [data-dark-hero]'));
  let bands = tones();
  window.addEventListener('load', () => { bands = tones(); });
  onScroll((y) => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    nav.style.setProperty('--sp', h > 0 ? (y / h).toFixed(4) : '0');
    nav.classList.toggle('is-scrolled', y > 24);
    if (y <= TOP) { hidden = false; anchor = y; }
    else if (!hidden) { if (y > anchor + TURN) { hidden = true; anchor = y; } else if (y < anchor) anchor = y; }
    else if (y < anchor - TURN) { hidden = false; anchor = y; }
    else if (y > anchor) anchor = y;
    if (!nav.classList.contains('is-open')) nav.classList.toggle('is-hidden', hidden);
    // dark band under the nav's midline?
    const mid = 40;
    let dark = false;
    for (const b of bands) { const r = b.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) { dark = b.dataset.tone ? b.dataset.tone === 'dusk' : true; break; } }
    nav.classList.toggle('on-night', dark);
  });

  if (burger && drawer) {
    const set = (open: boolean) => {
      nav.classList.toggle('is-open', open);
      drawer.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('no-scroll', open);
    };
    burger.addEventListener('click', () => set(!nav.classList.contains('is-open')));
    drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
    window.addEventListener('keydown', (e) => e.key === 'Escape' && set(false));
  }
}
