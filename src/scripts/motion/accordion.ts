/** <details data-acc>: height animates open and closed (WAAPI); one open at a time inside [data-acc-group]. */
import { reduced } from './loop';
export function initAccordions() {
  document.querySelectorAll<HTMLDetailsElement>('details[data-acc]').forEach((d) => {
    const sum = d.querySelector('summary')!, body = d.querySelector<HTMLElement>('.acc-body')!;
    let anim: Animation | null = null;
    const set = (open: boolean) => {
      if (reduced()) { d.open = open; return; }
      anim?.cancel();
      const start = d.open ? body.offsetHeight : 0;
      if (open) d.open = true;
      const end = open ? body.scrollHeight : 0;
      d.classList.toggle('is-open', open);
      anim = body.animate([{ height: `${start}px`, opacity: open ? 0.2 : 1 }, { height: `${end}px`, opacity: open ? 1 : 0 }], { duration: open ? 620 : 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      anim.onfinish = () => { if (!open) d.open = false; anim = null; };
    };
    if (d.open) d.classList.add('is-open');
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      const open = !d.classList.contains('is-open');
      if (open) d.closest('[data-acc-group]')?.querySelectorAll<HTMLDetailsElement>('details[data-acc].is-open').forEach((o) => { if (o !== d) o.querySelector('summary')!.click(); });
      set(open);
    });
  });
}
