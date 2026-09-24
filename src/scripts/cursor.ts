export function initCursor() {
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el || window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
  let x = 0, y = 0, cx = 0, cy = 0, raf = 0;
  const tick = () => {
    cx += (x - cx) * 0.22; cy += (y - cy) * 0.22;
    el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    raf = requestAnimationFrame(tick);
  };
  window.addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    if (!el.classList.contains('is-on')) { el.classList.add('is-on'); cx = x; cy = y; if (!raf) tick(); }
    const t = e.target as HTMLElement | null;
    el.classList.toggle('is-link', !!t?.closest('a, button, [data-cursor=link], canvas'));
  }, { passive: true });
  document.addEventListener('mouseleave', () => el.classList.remove('is-on'));
}
