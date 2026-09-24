/** Home-page only motion: sticky device storytelling and slow image parallax. */
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initStory() {
  const items = document.querySelectorAll<HTMLElement>('[data-story-item]');
  const imgs = document.querySelectorAll<HTMLElement>('[data-story-img]');
  const index = document.querySelector<HTMLElement>('[data-story-index]');
  if (!items.length) return;
  const set = (i: number) => {
    items.forEach((el, k) => el.classList.toggle('is-on', k === i));
    imgs.forEach((el, k) => el.classList.toggle('is-on', k === i));
    if (index) index.textContent = String(i + 1).padStart(2, '0');
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) set(Number((e.target as HTMLElement).dataset.storyItem));
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  items.forEach((el) => io.observe(el));
}

export function initParallax() {
  if (reduced()) return;
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
  if (!els.length) return;
  let raf = 0;
  const tick = () => {
    raf = 0; const vh = window.innerHeight;
    for (const el of els) {
      const r = el.parentElement!.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const p = (r.top + r.height / 2 - vh / 2) / vh; // -1..1
      el.style.setProperty('--py', `${(-p * 6).toFixed(2)}%`);
    }
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
  window.addEventListener('scroll', onScroll, { passive: true }); tick();
}
