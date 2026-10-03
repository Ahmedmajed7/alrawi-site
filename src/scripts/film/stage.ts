/**
 * The stage: the box the 16:9 film is shown in. On a landscape screen it is the whole hero (the picture covers it, as it
 * always has); on an upright one it is a full-width 16:9 band under the brand row ("band mode", 05-walkthrough.css), so a
 * phone sees the whole frame as the PC does — sharp, never cropped to a quarter of its width (3 Oct 2026). The CSS decides;
 * everything that maps a point of the picture to the screen (the HUD, the live devices, the phone's markers, the tone)
 * reads the box back from here.
 */
import { toPx, type Frame } from './homography';

/** an upright screen: the film stands in a band (the same query as the CSS) */
export const upright = matchMedia('(orientation: portrait)');

export interface StageBox { x: number; y: number; w: number; h: number; band: boolean }

/** the stage in the root's px; the whole root on a landscape screen */
export function stageBox(root: HTMLElement): StageBox {
  const host = root.querySelector<HTMLElement>('[data-walk-canvas]');
  const W = root.clientWidth, H = root.clientHeight;
  if (!host || !upright.matches || root.classList.contains('is-3d')) return { x: 0, y: 0, w: W, h: H, band: false };
  const r = host.getBoundingClientRect(), rr = root.getBoundingClientRect();
  if (!r.width || !r.height) return { x: 0, y: 0, w: W, h: H, band: false };
  return { x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height, band: true };
}

/** a normalised point of `frame` (0..1 from the top-left) → px in the root */
export function stagePx(p: number[], box: StageBox, frame?: Frame): [number, number] {
  const q = toPx(p, box.w, box.h, frame);
  return [box.x + q[0], box.y + q[1]];
}
