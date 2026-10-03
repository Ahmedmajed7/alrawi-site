/** The projects map: plays once when it is well in view (the regions light in order of their count; each column's figure
    counts up as it rises and the total adds them one by one), then a row, a region and its column light together under
    the pointer, a tap or the keyboard. Left alone, the light walks the regions on its own. */
import { reduced } from './loop';

const STEP = 260, FIRST = 1500; // ms between regions and before the first column: the coast draws and the plate settles first (as in 14-profile.css)

function count(el: HTMLElement, from: number, to: number, ms: number) {
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initProjectsMap() {
  const root = document.querySelector<HTMLElement>('[data-pm]');
  if (!root) return;
  const total = root.querySelector<HTMLElement>('[data-pm-total]');
  const stage = root.querySelector<HTMLElement>('.pm-stage') ?? root;
  const figs = Array.from(root.querySelectorAll<HTMLElement>('[data-pm-n]'));
  const ids = Array.from(root.querySelectorAll<HTMLElement>('.pm-row')).map((r) => r.dataset.pmId!);
  const of = (id: string) => root.querySelectorAll<HTMLElement | SVGElement>(`[data-pm-id="${id}"]`);

  // one region lit at a time: held when a visitor chose it (the others dim), otherwise the light is only passing
  let active = '', cursor = 0, held = false, touch = false;
  const light = (id: string, hold: boolean) => {
    if (active) of(active).forEach((e) => e.classList.remove('is-on'));
    active = id; held = hold && !!id;
    if (id) of(id).forEach((e) => e.classList.add('is-on'));
    root.classList.toggle('is-held', held);
  };
  root.addEventListener('pointerdown', (e) => { touch = e.pointerType !== 'mouse'; }, { passive: true });
  root.querySelectorAll<HTMLElement | SVGElement>('[data-pm-id]').forEach((el) => {
    const id = el.dataset.pmId!;
    el.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType === 'mouse') light(id, true); });
    el.addEventListener('pointerleave', (e) => { if ((e as PointerEvent).pointerType === 'mouse') light('', false); });
    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) light(id, true); });
    el.addEventListener('blur', () => { if (!touch) light('', false); });
    el.addEventListener('click', (e) => { if (!touch) return; e.stopPropagation(); light(held && active === id ? '' : id, true); });
  });
  document.addEventListener('click', () => { if (touch && held) light('', false); });

  const live = () => {
    root.classList.add('is-live');
    if (reduced()) return;
    window.setInterval(() => {
      if (held || root.classList.contains('is-away')) return;
      light(ids[cursor % ids.length], false); cursor++;
    }, 2600);
  };
  const show = () => total?.classList.add('is-counting');

  if (reduced() || !('IntersectionObserver' in window)) { root.classList.add('is-told', 'is-in'); show(); live(); return; }

  // side by side, the total adds up region by region as the columns rise; stacked (the title above the map), it counts
  // on its own when it comes into view
  const stacked = () => total != null && total.getBoundingClientRect().bottom <= stage.getBoundingClientRect().top + 4;
  figs.forEach((f) => { f.textContent = '0'; });
  if (total) total.textContent = '0';
  let told = false;
  const tell = () => { if (told || !total) return; told = true; show(); count(total, 0, Number(total.dataset.pmTotal), 2000); };
  const play = () => {
    root.classList.add('is-in');
    const sync = !told && !stacked();
    if (!sync) tell();
    let sum = 0;
    figs.forEach((f, i) => {
      const n = Number(f.dataset.pmN), before = sum;
      sum += n;
      setTimeout(() => {
        count(f, 0, n, 900);
        if (sync && total) { if (!i) { told = true; show(); } count(total, before, before + n, i < 2 ? 900 : 420); }
      }, FIRST + i * STEP);
    });
    setTimeout(live, FIRST + figs.length * STEP + 900);
  };
  const once = (el: Element, fn: () => void, threshold: number) => {
    const io = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) { io.disconnect(); fn(); } }, { threshold });
    io.observe(el);
  };
  once(root.querySelector('.pm-title') ?? root, () => root.classList.add('is-told'), 0.2);
  once(stage, play, 0.3);
  if (total) once(total, () => { if (stacked()) tell(); }, 0.6);
  // the walk rests while the map is off screen
  new IntersectionObserver((entries) => { for (const en of entries) root.classList.toggle('is-away', !en.isIntersecting); }).observe(root);
}
