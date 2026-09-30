/** Everything that plays once when it enters the view: [data-reveal] (CSS does the motion from .is-in),
    [data-decode] labels, [data-count] figures, [data-split] titles (split first, then revealed by their section head). */
import { reduced } from './loop';
import { splitTitles } from './split';
import { decode } from './decode';
import { countUp } from './count';

const fire = (el: HTMLElement) => {
  el.classList.add('is-in');
  el.querySelectorAll<HTMLElement>('[data-decode]').forEach((d, i) => setTimeout(() => decode(d), Number(d.dataset.delay) || 120 + i * 90));
  el.querySelectorAll<HTMLElement>('[data-count]').forEach((c) => countUp(c));
  if (el.matches('[data-decode]')) decode(el);
  if (el.matches('[data-count]')) countUp(el);
};

export function initReveal() {
  splitTitles();
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal], [data-split]:not([data-reveal] [data-split]):not([data-ph-in]):not([data-hero2] [data-split]), [data-count]:not([data-reveal] [data-count])'));
  // stagger: children of [data-stagger] get increasing delays unless they set their own
  document.querySelectorAll<HTMLElement>('[data-stagger]').forEach((p) => {
    const step = Number(p.dataset.stagger) || 0.08;
    Array.from(p.children).forEach((c, i) => { const e = c as HTMLElement; if (!e.style.getPropertyValue('--d')) e.style.setProperty('--d', `${Math.min(i, 10) * step}s`); });
  });
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach(fire); return; }
  // a clip-path mask hides its own box from the observer (zero visible area), so masks are watched through their parent
  const watch = new Map<Element, HTMLElement[]>();
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { watch.get(en.target)?.forEach(fire); watch.delete(en.target); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  // a stage (the hero after the film) plays its whole entrance only once it is well in view
  const stage = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { fire(en.target as HTMLElement); stage.unobserve(en.target); }
  }, { threshold: 0.4 });
  els.forEach((e) => {
    if (e.dataset.reveal === 'stage') { stage.observe(e); return; }
    const key = e.dataset.reveal === 'mask' && e.parentElement ? e.parentElement : e;
    if (!watch.has(key)) { watch.set(key, []); io.observe(key); }
    watch.get(key)!.push(e);
  });
}
