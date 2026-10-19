/** "A closer look" (components/CloserLook.astro): the clips play as muted loops while they are in view and stop when
    they leave it; the collage drifts with the scroll (--par on the wall, each tile at its own --spd); a tap opens the
    clip large in the viewer (a <dialog> on navy), with its sound where it has one, the set walked with the arrows, the
    keyboard or a swipe. Under prefers-reduced-motion or Save-Data nothing plays by itself: the posters stand, and a
    tap still opens the viewer, where the clip plays on the visitor's own gesture. */
import { onScroll, reduced } from './loop';

export function initLook() {
  const root = document.querySelector<HTMLElement>('[data-look]');
  if (!root) return;
  const wall = root.querySelector<HTMLElement>('[data-look-wall]')!;
  const tiles = Array.from(root.querySelectorAll<HTMLElement>('[data-look-tile]'));
  const vids = tiles.map((t) => t.querySelector<HTMLVideoElement>('video')!);
  const saveData = !!(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
  const auto = !reduced() && !saveData;
  const inView = new Set<HTMLVideoElement>();
  let viewing = false;

  const load = (v: HTMLVideoElement) => { if (!v.getAttribute('src')) { v.src = v.closest<HTMLElement>('[data-look-tile]')!.dataset.src!; v.load(); } };
  const play = (v: HTMLVideoElement) => { load(v); v.muted = true; v.play().then(() => v.closest('.look-tile')?.classList.add('is-playing')).catch(() => {}); };

  // play in view, pause out of it (and while the viewer is open)
  if (auto && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const v = en.target as HTMLVideoElement;
        if (en.isIntersecting) { inView.add(v); if (!viewing) play(v); } else { inView.delete(v); v.pause(); }
      }
    }, { rootMargin: '18% 0px', threshold: 0.12 });
    vids.forEach((v) => io.observe(v));
    document.addEventListener('visibilitychange', () => { if (viewing) return; inView.forEach((v) => (document.hidden ? v.pause() : play(v))); });
  }

  // the wall's drift: --par runs −1 (the wall below the view) … 1 (above), each tile scaled by its --spd in CSS
  if (!reduced()) onScroll((_, vh) => {
    const r = wall.getBoundingClientRect();
    if (r.bottom < -120 || r.top > vh + 120) return;
    wall.style.setProperty('--par', Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2))).toFixed(3));
  });

  // the viewer
  const dlg = root.querySelector<HTMLDialogElement>('[data-look-view]');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  const big = dlg.querySelector<HTMLVideoElement>('[data-look-big]')!;
  const stage = dlg.querySelector<HTMLElement>('[data-look-stage]')!;
  const cap = dlg.querySelector<HTMLElement>('[data-look-cap]')!;
  const idx = dlg.querySelector<HTMLElement>('[data-look-i]')!;
  const soundBtn = dlg.querySelector<HTMLButtonElement>('[data-look-sound]')!;
  let cur = 0, sound = true, closing = 0;

  const setSound = (on: boolean) => {
    sound = on; big.muted = !on;
    soundBtn.classList.toggle('is-on', on);
    soundBtn.setAttribute('aria-label', on ? soundBtn.dataset.off! : soundBtn.dataset.on!);
  };
  const show = (i: number) => {
    cur = (i + tiles.length) % tiles.length;
    const t = tiles[cur], d = t.dataset;
    stage.style.setProperty('--ar', `${d.w} / ${d.h}`);
    big.pause();
    big.poster = d.poster!;
    big.muted = !(d.audio && sound);
    big.src = d.big!;
    big.load();
    big.play().catch(() => {});
    cap.textContent = d.label ?? '';
    idx.textContent = String(cur + 1).padStart(2, '0');
    soundBtn.hidden = !d.audio;
    if (d.audio) setSound(sound);
  };
  const open = (i: number) => {
    viewing = true;
    vids.forEach((v) => v.pause());
    show(i);
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-open')));
  };
  const close = () => {
    if (!dlg.open || closing) return;
    dlg.classList.remove('is-open');
    closing = window.setTimeout(() => {
      closing = 0;
      big.pause(); big.removeAttribute('src'); big.load();
      dlg.close();
      document.body.classList.remove('no-scroll');
      viewing = false;
      if (auto) inView.forEach((v) => play(v));
      tiles[cur].querySelector<HTMLElement>('[data-look-open]')?.focus({ preventScroll: true });
    }, 320);
  };

  root.querySelectorAll<HTMLButtonElement>('[data-look-open]').forEach((b) => b.addEventListener('click', () => open(+b.dataset.lookOpen!)));
  dlg.querySelector('[data-look-close]')!.addEventListener('click', close);
  dlg.querySelector('[data-look-prev]')!.addEventListener('click', () => show(cur - 1));
  dlg.querySelector('[data-look-next]')!.addEventListener('click', () => show(cur + 1));
  soundBtn.addEventListener('click', () => setSound(!sound));
  // Esc: the dialog's own cancel, routed through the fade
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || (e.target as HTMLElement).classList.contains('look-view-in')) close(); });
  dlg.addEventListener('keydown', (e) => {
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowRight') show(cur + (rtl ? -1 : 1));
    else if (e.key === 'ArrowLeft') show(cur + (rtl ? 1 : -1));
    else return;
    e.preventDefault();
  });
  // a swipe across the picture walks the set; a tap on it toggles play
  let sx = 0, sy = 0, st = 0;
  stage.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; st = e.timeStamp; }, { passive: true });
  stage.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && e.timeStamp - st < 700) show(cur + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { if (big.paused) big.play().catch(() => {}); else big.pause(); }
  }, { passive: true });
}
