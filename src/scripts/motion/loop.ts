/** One scroll listener, one rAF: every scroll-driven effect registers here and runs once per frame, reads before writes. */
type Fn = (y: number, vh: number) => void;
const reads: Fn[] = [];
let queued = false;
const run = () => { queued = false; const y = window.scrollY, vh = window.innerHeight; for (const f of reads) f(y, vh); };
export const request = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
export function onScroll(fn: Fn) {
  if (!reads.length) { window.addEventListener('scroll', request, { passive: true }); window.addEventListener('resize', request, { passive: true }); }
  reads.push(fn); request();
}
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isAr = () => document.documentElement.lang === 'ar';
