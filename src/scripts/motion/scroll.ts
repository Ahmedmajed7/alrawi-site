const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reveal [data-reveal] elements as they enter the viewport. Stagger via --d on siblings. */
export function initReveal() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!els.length) return;
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((e, i) => {
    if (!e.style.getPropertyValue('--d') && e.parentElement?.hasAttribute('data-stagger')) {
      const idx = Array.from(e.parentElement.children).indexOf(e);
      e.style.setProperty('--d', `${Math.min(idx, 8) * 0.08}s`);
    }
    io.observe(e);
  });
}

/** Lenis smooth scroll on fine-pointer devices only; loaded lazily so mobile ships no extra JS. */
export async function initSmoothScroll() {
  if (reduced() || window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900) return;
  const { default: Lenis } = await import('lenis');
  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
  const raf = (t: number) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  (window as unknown as { __lenis?: unknown }).__lenis = lenis;
  // anchor links
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!.slice(1); const target = id && document.getElementById(id);
    if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -70 }); }
  }));
}
