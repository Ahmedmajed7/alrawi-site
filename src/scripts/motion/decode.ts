/** The film HUD's "decode": a label scrambles through glyphs and settles left to right (Latin only; Arabic fades in). */
import { isAr, reduced } from './loop';
const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789/·+';

export function decode(el: HTMLElement, dur = 720) {
  if (el.dataset.decoded) return; el.dataset.decoded = '1';
  const text = el.textContent || '';
  if (isAr() || reduced() || !text.trim()) { el.classList.add('is-decoded'); return; }
  el.style.minWidth = `${el.getBoundingClientRect().width}px`; el.style.display = 'inline-block';
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const fixed = Math.floor(p * text.length);
    let out = text.slice(0, fixed);
    for (let k = fixed; k < text.length; k++) out += text[k] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = out;
    if (p < 1) requestAnimationFrame(tick); else { el.textContent = text; el.style.minWidth = ''; el.classList.add('is-decoded'); }
  };
  requestAnimationFrame(tick);
}
