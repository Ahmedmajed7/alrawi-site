/** Page heroes: the title block rises in, then the blueprint draws itself and the reticle locks onto the device with an
    X/Y readout; scrolling lifts the text away. */
import { onScroll, reduced } from './loop';
import { decode } from './decode';

export function initPageHero() {
  const hero = document.querySelector<HTMLElement>('[data-ph]');
  if (!hero) return;
  const ret = hero.querySelector<HTMLElement>('[data-ret]');
  const xy = ret?.querySelector('[data-ret-xy]');
  if (ret && xy) xy.textContent = `X ${Number(ret.dataset.x).toFixed(3)}  Y ${Number(ret.dataset.y).toFixed(3)}`;
  requestAnimationFrame(() => {
    hero.classList.add('is-in');
    hero.querySelector('.fig')?.classList.add('is-in');
    hero.querySelectorAll<HTMLElement>('[data-decode]').forEach((d) => setTimeout(() => decode(d), 400));
    setTimeout(() => ret?.classList.add('is-on'), reduced() ? 0 : 1500);
  });
  if (reduced()) return;
  onScroll((y, vh) => {
    if (y > vh * 1.2) return;
    hero.style.setProperty('--hs', Math.min(1, y / (hero.offsetHeight || vh)).toFixed(4));
  });
}
