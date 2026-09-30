/** Nav: solid plate after the first scroll, hides on the way down and returns on the way up, a brass progress hairline,
    and its tone follows whatever band sits under it (night glass → light type, limestone → ink). */
import { onScroll } from './motion/loop';

export function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const burger = document.querySelector<HTMLButtonElement>('[data-burger]');
  const drawer = document.querySelector<HTMLElement>('[data-drawer]');
  if (!nav) return;
  let last = 0;
  const tones = () => Array.from(document.querySelectorAll<HTMLElement>('[data-tone], [data-dark-hero]'));
  let bands = tones();
  window.addEventListener('load', () => { bands = tones(); });
  onScroll((y) => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    nav.style.setProperty('--sp', h > 0 ? (y / h).toFixed(4) : '0');
    nav.classList.toggle('is-scrolled', y > 24);
    if (!nav.classList.contains('is-open')) nav.classList.toggle('is-hidden', y > last && y > 420);
    last = y;
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
