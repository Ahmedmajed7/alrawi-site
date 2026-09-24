/** Global client behaviour: nav, cursor, reveal-on-scroll, language memory, smooth scroll. */
import { initNav } from './nav';
import { initReveal, initSmoothScroll } from './motion/scroll';

initNav();
initReveal();
initSmoothScroll();

// Remember the visitor's language choice for the root redirect.
document.querySelectorAll<HTMLAnchorElement>('[data-lang-toggle]').forEach((a) => {
  a.addEventListener('click', () => {
    try { localStorage.setItem('alrawi-lang', a.dataset.lang || 'ar'); } catch { /* private mode */ }
  });
});
try { localStorage.setItem('alrawi-lang', document.documentElement.lang); } catch { /* ignore */ }
