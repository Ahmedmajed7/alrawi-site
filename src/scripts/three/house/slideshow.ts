/** Image-only walkthrough for devices without WebGL / reduced motion. Same tap-to-advance UX. */
export function mountSlideshow(root: HTMLElement, count: number, onIndex: (i: number) => void) {
  const host = root.querySelector<HTMLElement>('[data-walk-slides]')!;
  host.hidden = false;
  const imgs: HTMLImageElement[] = [];
  for (let i = 0; i <= count; i++) { const im = new Image(); im.src = `/img/house/stop-${i}.webp`; im.alt = ''; im.decoding = 'async'; host.appendChild(im); imgs.push(im); }
  let idx = -1;
  const show = (i: number) => { idx = i; imgs.forEach((im, k) => im.classList.toggle('is-on', k === i)); onIndex(i); };
  show(0);
  return { next: () => { if (idx < count) show(idx + 1); return idx; }, prev: () => { if (idx > 0) show(idx - 1); return idx; }, get index() { return idx; } };
}
