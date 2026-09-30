/** The HUD cursor (fine pointers only): a ring that trails the pointer; over anything clickable its four brackets leave
    it and lock onto the target's box, like the film's reticle locking onto a device. Tone follows the band under it. */
import { finePointer, reduced } from './loop';

export function initCursor() {
  if (!finePointer() || reduced()) return;
  const cur = document.createElement('div'); cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true');
  cur.innerHTML = '<i class="cur-ring"></i><i class="cur-dot"></i>' + [0, 1, 2, 3].map((k) => `<i class="cur-br cur-br${k}"></i>`).join('');
  document.body.appendChild(cur);
  const ring = cur.querySelector<HTMLElement>('.cur-ring')!, dot = cur.querySelector<HTMLElement>('.cur-dot')!;
  const brs = Array.from(cur.querySelectorAll<HTMLElement>('.cur-br'));
  let mx = -100, my = -100, rx = -100, ry = -100, target: HTMLElement | null = null, raf = 0, shown = false;
  const bx = [0, 0, 0, 0], by = [0, 0, 0, 0];
  const tick = () => {
    raf = 0;
    rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
    let tx: number[], ty: number[];
    if (target && target.isConnected) {
      const r = target.getBoundingClientRect(), p = 6;
      tx = [r.left - p, r.right + p, r.right + p, r.left - p]; ty = [r.top - p, r.top - p, r.bottom + p, r.bottom + p];
    } else { const s = 11; tx = [rx - s, rx + s, rx + s, rx - s]; ty = [ry - s, ry - s, ry + s, ry + s]; }
    let moving = Math.abs(mx - rx) + Math.abs(my - ry) > 0.2;
    for (let k = 0; k < 4; k++) {
      bx[k] += (tx[k] - bx[k]) * 0.24; by[k] += (ty[k] - by[k]) * 0.24;
      if (Math.abs(tx[k] - bx[k]) + Math.abs(ty[k] - by[k]) > 0.2) moving = true;
      brs[k].style.transform = `translate(${bx[k]}px, ${by[k]}px)`;
    }
    if (moving) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (!shown) { shown = true; rx = mx; ry = my; for (let k = 0; k < 4; k++) { bx[k] = mx; by[k] = my; } cur.classList.add('is-on'); }
    kick();
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const el = e.target as Element;
    const hit = el.closest<HTMLElement>('a, button, summary, label, [data-hover], input, textarea, select');
    target = hit && !hit.closest('[data-walk]') ? (hit.closest<HTMLElement>('[data-lock]') ?? hit) : null;
    cur.classList.toggle('is-lock', !!target);
    cur.classList.toggle('is-dark', !!el.closest('[data-tone="dusk"], [data-dark-hero], .nav.on-night, .nav-drawer'));
    cur.classList.toggle('is-hide', !!el.closest('[data-walk]:not(.is-done)'));
    kick();
  });
  document.addEventListener('pointerleave', () => { cur.classList.remove('is-on'); shown = false; });
  window.addEventListener('scroll', kick, { passive: true });
  document.addEventListener('pointerdown', () => cur.classList.add('is-press'));
  document.addEventListener('pointerup', () => cur.classList.remove('is-press'));
}
