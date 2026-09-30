/**
 * Pin an HTML element onto a quad of the film frame. Features come in normalised frame coordinates (0..1 from the
 * top-left); the film is shown object-fit: cover, so they are mapped through the cover scale first (`frame` omitted =
 * the canvas fills the root, as in the live 3D). The element (W × H logical px, transform-origin 0 0) is then carried
 * onto the four corners (TL, TR, BR, BL) by a projective matrix3d — so a flat UI sits on a screen seen in perspective.
 */
export type Frame = { w: number; h: number } | undefined;

/** normalised frame point → px in the root (unscaled layer coordinates) */
export function toPx(p: number[], w: number, H: number, frame?: Frame): [number, number] {
  if (!frame) return [p[0] * w, p[1] * H];
  const s = Math.max(w / frame.w, H / frame.h), dw = frame.w * s, dh = frame.h * s;
  return [(w - dw) / 2 + p[0] * dw, (H - dh) / 2 + p[1] * dh];
}

/** CSS matrix3d that maps the W × H rectangle (0,0)…(W,H) onto the quad q = [TL, TR, BR, BL] (px). */
export function quadMatrix(W: number, H: number, q: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  // unit square → quad (Heckbert): x = (a u + b v + c) / (g u + h v + 1)
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) > 1e-9 && (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9)) { g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det; }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // then scale the element's px into the unit square; matrix3d is column-major
  const m = [a / W, d / W, 0, g / W, b / H, e / H, 0, h / H, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}
