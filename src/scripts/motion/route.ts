/** The page route: the film's HUD leader line continues down the page margin (the Dartz flight path). It is measured
    through every section head that names a waypoint ([data-wp]), drawn by scroll with a lit tip at 62 % of the view,
    and each waypoint node lights with a readout "WP 02 / 06 · label" when the tip reaches it. Wide screens only. */
import { onScroll, reduced } from './loop';

const NS = 'http://www.w3.org/2000/svg';

export function initRoute() {
  const main = document.querySelector<HTMLElement>('main');
  if (!main || reduced()) return;
  const heads = () => Array.from(main.querySelectorAll<HTMLElement>('[data-wp]'));
  if (heads().length < 2) return;
  const wrap = document.createElement('div'); wrap.className = 'route'; wrap.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  const ghost = document.createElementNS(NS, 'path'); ghost.setAttribute('class', 'route-ghost');
  const line = document.createElementNS(NS, 'path'); line.setAttribute('class', 'route-line');
  svg.append(ghost, line); wrap.appendChild(svg);
  const tip = document.createElement('i'); tip.className = 'route-tip'; wrap.appendChild(tip);
  main.appendChild(wrap);

  let nodes: { el: HTMLElement; y: number }[] = [];
  let len = 0, top = 0, bottom = 0, lut: number[] = [], x = 0, W = 0, on = false;

  const build = () => {
    on = window.innerWidth >= 1000;
    wrap.hidden = !on; if (!on) return;
    const rtl = document.documentElement.dir === 'rtl';
    const mainTop = main.getBoundingClientRect().top + window.scrollY;
    W = main.clientWidth;
    // halfway into the gutter beside the content column
    const col = main.querySelector<HTMLElement>('.band .wrap, .wrap');
    const cr = col ? col.getBoundingClientRect() : ({ left: 40, right: W - 40 } as DOMRect);
    const cs = col ? getComputedStyle(col) : null;
    const gutter = rtl ? W - (cr.right - parseFloat(cs?.paddingRight || '0')) : cr.left + parseFloat(cs?.paddingLeft || '0');
    const rx = Math.max(16, gutter * 0.5);
    x = rtl ? W - rx : rx;
    const hs = heads();
    const ys = hs.map((h) => h.getBoundingClientRect().top + window.scrollY - mainTop + 10);
    const first = hs[0].closest<HTMLElement>('section, .band') ?? hs[0];
    top = first.getBoundingClientRect().top + window.scrollY - mainTop + 40;
    const last = hs[hs.length - 1].closest<HTMLElement>('section, .band') ?? hs[hs.length - 1];
    bottom = last.getBoundingClientRect().bottom + window.scrollY - mainTop - 40;
    wrap.style.height = `${main.scrollHeight}px`;
    svg.setAttribute('viewBox', `0 0 ${W} ${main.scrollHeight}`);
    svg.setAttribute('width', String(W)); svg.setAttribute('height', String(main.scrollHeight));
    // a vertical path that bows gently between waypoints (alternating sides), with rounded shoulders at each node
    const dir = rtl ? -1 : 1;
    let d = `M${x} ${top}`; let prev = top;
    const pts = [...ys.filter((y) => y > top + 20), bottom];
    pts.forEach((y, i) => {
      const bow = (i % 2 ? -1 : 1) * dir * 16, mid = (prev + y) / 2;
      d += ` C${x + bow} ${prev + (mid - prev) * 0.9} ${x + bow} ${y - (y - mid) * 0.9} ${x} ${y}`;
      prev = y;
    });
    ghost.setAttribute('d', d); line.setAttribute('d', d);
    len = line.getTotalLength();
    line.style.strokeDasharray = `${len} ${len}`;
    // y → length lookup (the path only ever moves down)
    lut = []; const N = 600;
    for (let k = 0; k <= N; k++) lut.push(line.getPointAtLength((k / N) * len).y);
    wrap.querySelectorAll('.route-node').forEach((n) => n.remove());
    nodes = hs.map((h, i) => {
      const el = document.createElement('span'); el.className = 'route-node';
      el.style.transform = `translate(${x}px, ${ys[i]}px)`;
      el.innerHTML = `<i></i><b dir="ltr">WP ${String(i + 1).padStart(2, '0')} / ${String(hs.length).padStart(2, '0')}<em></em></b>`;
      el.querySelector('em')!.textContent = h.dataset.wp ? ` · ${h.dataset.wp}` : '';
      wrap.appendChild(el); return { el, y: ys[i] };
    });
    update(window.scrollY, window.innerHeight);
  };

  const lenAt = (y: number) => {
    if (y <= lut[0]) return 0; if (y >= lut[lut.length - 1]) return len;
    let lo = 0, hi = lut.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lut[m] < y) lo = m; else hi = m; }
    const f = (y - lut[lo]) / Math.max(1e-3, lut[hi] - lut[lo]);
    return ((lo + f) / (lut.length - 1)) * len;
  };
  const update = (sy: number, vh: number) => {
    if (!on || !len) return;
    const mainTop = main.getBoundingClientRect().top + sy;
    const tipY = sy + vh * 0.62 - mainTop;
    const l = lenAt(tipY);
    line.style.strokeDashoffset = String(len - l);
    const p = line.getPointAtLength(l);
    tip.style.transform = `translate(${p.x}px, ${p.y}px)`;
    tip.classList.toggle('is-on', l > 2 && l < len - 2);
    for (const n of nodes) n.el.classList.toggle('is-hit', tipY >= n.y);
  };

  let t = 0;
  const rebuild = () => { clearTimeout(t); t = window.setTimeout(build, 180); };
  new ResizeObserver(rebuild).observe(main);
  document.fonts?.ready.then(build);
  window.addEventListener('load', build, { once: true });
  build();
  onScroll(update);
}
