/**
 * The device HUD's placer: a transparent hologram panel (title, specs, a live widget) unfolds beside the device, its
 * header level with it and its near edge lit where it faces it (no reticle, no leader: removed at the client's request,
 * 29 Sep 2026). Shared by the film player (device = a normalised point in the 16:9 picture,
 * mapped through the object-fit: cover scale) and the live 3D walkthrough (device = its `hotspot` node projected to the
 * canvas, possibly re-placed every time that point moves).
 *
 * This file only measures and positions; everything that moves is CSS (styles/11-hud.css) switched by `.is-on`, plus the
 * decode loop and the pointer parallax in film/hud.ts. The intro plays once per stop: later calls for the same stop only
 * move things. Three layouts:
 *   side   wide screens: the panel beside the device, on the side the stop asks for (data-side) or the roomier one
 *   band   upright screens (film/stage.ts): the whole picture stands in a band at the top and the panel is a sheet under
 *          it, down to the bottom edge and under the next button; nothing slides and the device is never covered
 *   sheet  a narrow window on the film that is not upright: a sheet across the bottom, the film slid so the device stands
 *          in the middle of what is left above it
 *   dock   anything else (live 3D on a phone, a device too wide for a side panel): the panel under or over the device
 * The panel keeps clear of the device's box (published by the live layer from the recorded features), of the brand row
 * and of the next button.
 */
import { createDecoder, deviceBox, mountParallax, onDevice } from './hud';
import { stageBox, stagePx } from './stage';

const HALO = 34; // the room kept clear round the device's point when the film knows nothing more of it (px, wide screens)
const HALO_SMALL = 26; // … and on a phone
const PORT = 47; // the header strip's rule, from the panel's top (measured; this is the fallback): the panel's edge light stands level with the device
const NARROW = 720; // below this the panel docks instead of standing beside the device
const DRIFT = 1.04; // the held frame and this layer grow by this much about the centre (05-walkthrough.css): margins are kept at the end of it

export interface CalloutUi {
  cards: HTMLElement[]; callouts: HTMLElement; card?: HTMLElement;
  /** no longer drawn (the reticle and the leader were removed, 29 Sep 2026); accepted so older callers keep compiling */
  hotspot?: HTMLElement | null; leader?: SVGSVGElement | null; halo?: SVGPathElement | null; line?: SVGPathElement | null;
}
type Side = 'right' | 'left' | 'below' | 'above';
type Mode = 'side' | 'dock' | 'sheet';
const SIDES: Side[] = ['right', 'left', 'below', 'above'];
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), Math.max(a, b));
const n1 = (v: number) => v.toFixed(1);

export function createCalloutPlacer(root: HTMLElement, ui: CalloutUi, opts: { reduced: boolean }) {
  const chrome = ui.card ? [ui.card.querySelector<HTMLElement>('[data-walk-next]'), ui.card.querySelector<HTMLElement>('[data-walk-hint]')] : [];
  const decoder = createDecoder();
  // an old office PC keeps the film smooth without a live blur behind the glass: it gets the denser panel
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2) root.classList.add('hud-lite');
  if (!opts.reduced) mountParallax(root, ui.callouts);

  let cur = -1; // the stop whose intro has played (while the HUD is on)
  let last: { i: number; h: number[]; frame?: { w: number; h: number } } | null = null;
  // measured once per stop and viewport, so re-placing (every frame the live 3D camera moves) never forces a layout
  const sizes = new Map<string, { cw: number; ch: number; port: number }>();
  const rects = new Map<string, number[][]>(); // the next button and the hint: [left, right, top, bottom] in the root
  const measure = (el: HTMLElement, key: string) => {
    let s = sizes.get(key);
    if (!s) { const head = el.querySelector<HTMLElement>('.hud-head'), body = head?.parentElement; s = { cw: el.offsetWidth, ch: el.offsetHeight, port: head && body ? body.offsetTop + head.offsetTop + head.offsetHeight - 0.5 : PORT }; sizes.set(key, s); }
    return s;
  };
  const dress = (el: HTMLElement, mode: Mode, d: number) => { el.classList.toggle('is-dock', mode !== 'side'); el.classList.toggle('is-sheet', mode === 'sheet'); el.classList.toggle('is-tight', d >= 1); el.classList.toggle('is-min', d >= 2); };

  const off = () => { decoder.cancel(); if (last) ui.cards[last.i]?.style.removeProperty('--sheet-h'); last = null; root.style.removeProperty('--hud-pan'); root.style.removeProperty('--hud-pan-y'); root.classList.remove('hud-sheet'); };
  const hide = () => { ui.callouts.classList.remove('is-on'); off(); };
  // the player and the walkthrough also switch the layer off by its class alone: clean up behind them
  new MutationObserver(() => { if (last && !ui.callouts.classList.contains('is-on')) off(); }).observe(ui.callouts, { attributes: true, attributeFilter: ['class'] });

  const layout = (i: number, h: number[], frame?: { w: number; h: number }) => {
    const el = ui.cards[i];
    const w = root.clientWidth, H = root.clientHeight, short = H < 500, narrow = w < NARROW && !short; // a phone held sideways keeps the side panel
    // the picture's box: the whole root, or the band an upright screen shows the whole frame in (film/stage.ts)
    const box = stageBox(root), band = box.band && !!frame;
    // a stop may say how far round its point the device reaches (house.json `clear`, in picture widths: a ceiling detector
    // seen from below fills far more of the frame than the features the film records on it)
    const picW = frame ? frame.w * Math.max(box.w / frame.w, box.h / frame.h) : box.w, R = Math.max(narrow || band ? HALO_SMALL : HALO, (+(el.dataset.clear ?? 0) || 0) * picW);
    const [hx, hy] = stagePx(h, box, frame);
    // keep-out: a little room round the device's point, grown to what the film knows of the device (screen, keypad, LEDs …)
    let kx0 = hx - R, ky0 = hy - R, kx1 = hx + R, ky1 = hy + R;
    const b = deviceBox(root, i);
    if (b) { const p0 = stagePx([b.x0, b.y0], box, frame), p1 = stagePx([b.x1, b.y1], box, frame), m = 18; kx0 = Math.min(kx0, p0[0] - m); ky0 = Math.min(ky0, p0[1] - m); kx1 = Math.max(kx1, p1[0] + m); ky1 = Math.max(ky1, p1[1] + m); }

    // the chrome to stay clear of: the brand row on top; at the bottom the progress row, and the next button where the panel is over it
    const held = (v: number, c: number) => (band ? v : c + (v - c) / DRIFT); // where a screen limit lies in this layer once the drift has run (the band's sheet does not drift)
    let cr = rects.get(`${i}:${w}x${H}`);
    if (!cr) {
      const rr = root.getBoundingClientRect(), dy = ui.card ? new DOMMatrix(getComputedStyle(ui.card).transform).m42 : 0; // the button is still easing up into place when the tour arrives
      cr = chrome.map((c) => c?.getBoundingClientRect()).filter((r): r is DOMRect => !!r && r.width > 0).map((r) => [r.left - rr.left, r.right - rr.left, r.top - rr.top - dy, r.bottom - rr.top - dy]);
      rects.set(`${i}:${w}x${H}`, cr);
    }
    // a phone held sideways: the chrome's own rows (and the notch's insets in the overlay's padding) say where the panel may reach
    let tight: number[] | undefined;
    if (short) {
      tight = rects.get(`top:${w}x${H}`)?.[0];
      if (!tight) {
        const rr = root.getBoundingClientRect(), top = root.querySelector<HTMLElement>('.walk-top')?.getBoundingClientRect(), steps = root.querySelector<HTMLElement>('.walk-steps')?.getBoundingClientRect(), ov = root.querySelector<HTMLElement>('.walk-ui');
        const ps = ov ? getComputedStyle(ov) : null;
        tight = [top ? top.bottom - rr.top + 10 : 60, steps && steps.height ? steps.top - rr.top - 12 : H - 56, Math.max(12, ps ? parseFloat(ps.paddingLeft) || 0 : 12, ps ? parseFloat(ps.paddingRight) || 0 : 12)];
        rects.set(`top:${w}x${H}`, [tight]);
      }
    }
    const padX = tight ? tight[2] : narrow ? 12 : w - held(w - 20, w / 2), padTop = held(tight ? tight[0] : narrow ? 72 : 84, H / 2), base = held(tight ? tight[1] : H - (narrow ? 64 : 72), H / 2);
    /** the lowest the panel may reach between the screen columns x0..x1 */
    const floor = (x0: number, x1: number) => cr!.reduce((f, r) => (r[0] < x1 + 36 && r[1] > x0 - 36 ? Math.min(f, held(r[2] - 20, H / 2)) : f), base);

    el.hidden = false; el.classList.add('is-placed'); // placed from here on: the first style the browser computes for it is the off state, never the unplaced fallback
    const key = (mode: Mode, d: number) => `${i}:${w}x${H}:${mode}${d}`;
    let side: Side = 'below', bx = 0, by = 0, cw = 0, ch = 0, port = PORT, panX = 0, panY = 0, placed = false;
    let edge = 0; // where along its near edge the panel faces the device (px from its top / its start): its edge light stands there

    // a narrow window shows only the middle of the 16:9 picture: slide the film (and this layer with it) until the device is in view
    if (frame && !band) { const s = Math.max(w / frame.w, H / frame.h), spare = Math.max(0, (frame.w * s - w) / 2), m = R + 14; panX = clamp(clamp(hx, m, w - m) - hx, -spare, spare); if (Math.abs(panX) < 0.5) panX = 0; }
    const L = -panX, Rt = w - panX; // the screen's edges in this layer's coordinates

    if (band) {
      // ---- band: a sheet under the picture, down to the bottom edge (it runs under the next button, as the phone sheet does) ----
      placed = true; side = 'below';
      const top = box.y + box.h + 8, lo = floor(0, w), zone = H - lo, btn = cr[0];
      el.style.setProperty('--zone', `${n1(zone)}px`);
      el.style.removeProperty('--sheet-h'); // measured at the text's own height (the stretch below is put back in the same frame)
      for (const dn of [0, 1, 2]) { dress(el, 'sheet', dn); ({ cw, ch } = measure(el, key('sheet', dn))); if (ch <= H - top) break; }
      el.style.setProperty('--sheet-h', `${n1(H - top)}px`); // the glass reaches the bottom edge whatever the text's height
      by = top; bx = 0;
      edge = clamp(hx, 30, w - 30);
      el.style.setProperty('--act', `${n1(btn ? (btn[2] + btn[3]) / 2 - top : H - top - zone / 2)}px`);
    } else if (!narrow) {
      // ---- side: the panel stands beside the device, its header level with it ----
      dress(el, 'side', 0);
      ({ cw, ch, port } = measure(el, key('side', 0)));
      const gap = clamp(w * 0.028, 28, 52);
      const room = (right: boolean) => (right ? Rt - padX - (kx1 + gap) : kx0 - gap - (L + padX)); // width left for the panel on that side
      const head = (right: boolean) => { const x = right ? kx1 + gap : kx0 - gap - cw; return floor(x + panX, x + cw + panX) - padTop; }; // … and height (the next button takes some of one side)
      // the side the stop asks for; else the roomier one, unless the panel only stands at full height on the other
      const pref = el.dataset.side, wider = room(true) >= room(false);
      let right = pref === 'right' ? true : pref === 'left' ? false : wider;
      if (!pref && room(!right) >= cw && head(!right) >= ch && head(right) < ch) right = !right;
      if (room(right) < cw && room(!right) >= cw) right = !right; // no room on that side: the other one
      placed = true; side = right ? 'right' : 'left';
      let lo = 0, dn = 0;
      const stand = () => {
        bx = clamp(right ? kx1 + gap : kx0 - gap - cw, L + padX, Rt - padX - cw); lo = floor(bx + panX, bx + cw + panX); // a device wider than the room it leaves: the panel keeps to the screen and overlaps its edge
        by = clamp(hy - port, padTop, lo - ch);
      };
      stand();
      while (ch > lo - padTop && dn < 2) { dress(el, 'side', ++dn); ({ cw, ch, port } = measure(el, key('side', dn))); stand(); } // a short window: the panel tightens
      edge = clamp(hy - by, 24, ch - 24);
    } else if (frame) {
      // ---- sheet: across the bottom of a phone, the device centred in what is left above it ----
      placed = true; side = 'below';
      const lo = floor(0, w), zone = H - lo, btn = cr[0];
      el.style.removeProperty('--sheet-h');
      el.style.setProperty('--zone', `${n1(zone)}px`);
      for (const dn of [0, 1, 2]) { dress(el, 'sheet', dn); ({ cw, ch } = measure(el, key('sheet', dn))); if (ky1 - ky0 + 28 <= H - ch - padTop) break; }
      by = H - ch; bx = L;
      // slide the film up until the device stands in the middle of the free picture; what that bares at the bottom is under the sheet
      panY = clamp((padTop + by) / 2 - (ky0 + ky1) / 2, -(ch - 28), 0); if (Math.abs(panY) < 0.5) panY = 0;
      by -= panY;
      edge = clamp(hx, L + 30, Rt - 30) - bx;
      el.style.setProperty('--act', `${n1(btn ? (btn[2] + btn[3]) / 2 - (H - ch) : ch - zone / 2)}px`);
    }
    if (!band) el.style.removeProperty('--sheet-h');
    if (!placed) {
      // ---- dock: under the device (or over it), against the chrome ----
      dress(el, 'dock', 0);
      ({ cw, ch } = measure(el, key('dock', 0)));
      bx = clamp((L + Rt - cw) / 2, L + padX, Rt - padX - cw);
      const lo = floor(bx + panX, bx + cw + panX), gap = 22;
      let below = true;
      for (const dn of [0, 1, 2]) {
        if (dn) { dress(el, 'dock', dn); ({ cw, ch } = measure(el, key('dock', dn))); }
        const roomB = lo - (ky1 + gap), roomA = ky0 - gap - padTop;
        if (ch <= roomB) { below = true; break; }
        if (ch <= roomA) { below = false; break; }
        below = roomB >= roomA - 40; // neither fits: the roomier end (the lower one on a tie, by the button the thumb is on)
      }
      side = below ? 'below' : 'above';
      by = below ? Math.max(padTop, lo - ch) : padTop;
      edge = clamp(hx, bx + 30, bx + cw - 30) - bx;
    }

    if (panX) root.style.setProperty('--hud-pan', `${n1(panX)}px`); else root.style.removeProperty('--hud-pan');
    if (panY) root.style.setProperty('--hud-pan-y', `${n1(panY)}px`); else root.style.removeProperty('--hud-pan-y');
    root.classList.toggle('hud-sheet', el.classList.contains('is-sheet'));
    for (const sd of SIDES) el.classList.toggle(`is-${sd}`, sd === side);
    el.style.setProperty('--port', `${n1(edge)}px`); // the glass unfolds from here, and its edge light stands here
    el.style.left = `${n1(bx)}px`; el.style.top = `${n1(by)}px`;
    ui.callouts.style.setProperty('--hx', `${n1(hx)}px`); ui.callouts.style.setProperty('--hy', `${n1(hy)}px`);
  };

  /**
   * Lock onto stop `i`. `h` is the device in normalised coordinates (0..1 from the top-left) of `frame` (a picture shown
   * object-fit: cover; omit it for the canvas, which fills the root). The first call for a stop plays the intro; calls
   * that follow (the settling camera, a drag, a resize, the device's box arriving) only reposition.
   */
  const place = (i: number, h: number[] | null, frame?: { w: number; h: number }) => {
    const el = ui.cards[i]; if (!el || !h) { hide(); return; }
    const fresh = cur !== i || !ui.callouts.classList.contains('is-on');
    if (fresh) ui.callouts.classList.remove('is-on'); // a new target: everything starts from the off state
    last = { i, h, frame };
    layout(i, h, frame);
    if (!fresh) return;
    cur = i; redo = 0;
    void el.getBoundingClientRect(); // the off state is laid out: the switch below is a transition, not a jump
    ui.callouts.classList.add('is-on');
    if (!opts.reduced) decoder.start(el);
  };
  // the panel's own size can change after it was measured (a face that loads when its text first shows; seen on the
  // Arabic phone sheet, which then ran under the next button): measure again. Re-placing ends on the same size, so this
  // settles after one pass; the cap keeps a size that flips between two layouts from looping
  let redo = 0;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!last || ui.cards[last.i]?.hidden || ++redo > 3) return;
    for (const k of [...sizes.keys()]) if (k.startsWith(`${last.i}:`)) sizes.delete(k);
    layout(last.i, last.h, last.frame);
  }) : null;
  ui.cards.forEach((c) => ro?.observe(c));
  // the device's box reaches us after the first placement (the live layer is shown right after): fit the panel to it at once
  onDevice(root, (i) => { if (last && last.i === i) layout(i, last.h, last.frame); });
  return { place, hide };
}
