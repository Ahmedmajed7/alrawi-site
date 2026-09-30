/** Global client behaviour: nav, reveals, magnetic buttons, accordions, the page hero, language memory and smooth scroll. */
import { initNav } from './nav';
import { initReveal } from './motion/reveal';
import { initMagnetic } from './motion/magnetic';
import { initAccordions } from './motion/accordion';
import { initPageHero } from './motion/hero';
import { reduced } from './motion/loop';

initNav();
initPageHero();
initReveal();
initAccordions();
initMagnetic();
initSmoothScroll();
/** Lenis on fine-pointer desktops only; loaded lazily so phones ship no extra JS. The film locks scroll with
    body.no-scroll while it plays, so Lenis stops with it. */
async function initSmoothScroll() {
  if (reduced() || window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900) return;
  const { default: Lenis } = await import('lenis');
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
  const raf = (t: number) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  (window as unknown as { __lenis?: unknown }).__lenis = lenis;
  new MutationObserver(() => (document.body.classList.contains('no-scroll') ? lenis.stop() : lenis.start())).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!.slice(1); const target = id && document.getElementById(id);
    if (target && !a.hasAttribute('data-walk-skip')) { e.preventDefault(); lenis.scrollTo(target, { offset: -70 }); }
  }));
}

// Remember the visitor's language choice for the root redirect.
document.querySelectorAll<HTMLAnchorElement>('[data-lang-toggle]').forEach((a) => {
  a.addEventListener('click', () => {
    try { localStorage.setItem('alrawi-lang', a.dataset.lang || 'ar'); } catch { /* private mode */ }
  });
});
try { localStorage.setItem('alrawi-lang', document.documentElement.lang); } catch { /* ignore */ }
