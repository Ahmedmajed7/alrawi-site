/**
 * Path helpers for the device HUD's drawn parts (the dial, the speaker's waves, the fingerprint; `arc`, `ticks` and `bracket` also
 * draw components/Reticle.astro).
 * Pure functions that return SVG path data: Walkthrough.astro calls them at build time, so the browser only ever
 * receives finished paths. Angles are in degrees, 0° at 3 o'clock, clockwise (SVG's y points down).
 */
const f = (v: number) => +v.toFixed(2);
const pt = (cx: number, cy: number, r: number, deg: number) => { const a = (deg * Math.PI) / 180; return [f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a))] as const; };

/** a circular arc from `a0` to `a1` (clockwise, a1 > a0, less than a full turn) */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** `n` radial ticks between the radii `r0` and `r1`, spread from `a0` over `sweep` degrees (a full turn leaves the last one out) */
export function ticks(cx: number, cy: number, r0: number, r1: number, n: number, a0 = 0, sweep = 360) {
  const step = sweep / (sweep >= 360 ? n : n - 1);
  return Array.from({ length: n }, (_, i) => { const [x0, y0] = pt(cx, cy, r0, a0 + i * step), [x1, y1] = pt(cx, cy, r1, a0 + i * step); return `M${x0} ${y0}L${x1} ${y1}`; }).join('');
}

/** one chamfered corner bracket (the top-left one; the others are this one turned): legs of `leg`, the corner cut by `cut` */
export const bracket = (leg: number, cut: number) => `M0.5 ${leg}V${cut}L${cut} 0.5H${leg}`;

/**
 * A fingerprint: ridges as nested arches around a core, open at the bottom, a few of them broken the way real ridges
 * end and fork. Drawn in a 64 × 72 box.
 */
export function fingerprint() {
  const cx = 32, cy = 40, out: string[] = [];
  // [radius x, radius y, start°, end°] — each ridge swings over the top; the inner ones close further round the core
  const ridges: [number, number, number, number][] = [
    [4, 5, 150, 400], [8.5, 10, 158, 372], [13, 15.5, 168, 330], [13, 15.5, 338, 378],
    [17.5, 21, 172, 262], [17.5, 21, 270, 372], [22, 26.5, 176, 300], [22, 26.5, 308, 366],
    [26.5, 32, 182, 236], [26.5, 32, 244, 358],
  ];
  for (const [rx, ry, a0, a1] of ridges) {
    const p0 = [f(cx + rx * Math.cos((a0 * Math.PI) / 180)), f(cy + ry * Math.sin((a0 * Math.PI) / 180))];
    const p1 = [f(cx + rx * Math.cos((a1 * Math.PI) / 180)), f(cy + ry * Math.sin((a1 * Math.PI) / 180))];
    out.push(`M${p0[0]} ${p0[1]}A${rx} ${ry} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1[0]} ${p1[1]}`);
  }
  return out.join('');
}
