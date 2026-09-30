/**
 * What is drawn rather than scanned: the rug's knotted pattern, its fringe, the paintings, the books' cloth bindings and the bed
 * of embers in the firebox. All of it is drawn once into canvases from seeded numbers, so every frame of the film and every
 * visit shows the same picture.
 */
import * as THREE from 'three';

const seeded = (a: number) => () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 16; return t;
}

/**
 * A hand-knotted rug, an old Oushak washed by decades of sun: a brick field, an ink border, ivory and ochre drawing. It is
 * drawn knot by knot (one pixel = one knot, 11 mm), a quarter of it mirrored twice as a weaver works from a cartoon, then
 * enlarged without smoothing: diagonals step as they do in wool. Over that the dye lots change in bands (abrash), every knot
 * takes the dye a little differently, and the pile is worn thin where the room is walked.
 */
export function rugTexture(seed = 5, size = 2048) {
  const N = 256, H = N / 2, rnd = seeded(seed);
  const field = '#743c30', ink = '#24324a', ivory = '#d8ccb3', ochre = '#b08a54', olive = '#6a6a4c', rose = '#a9796a', dark = '#1c2230';
  const quarter = document.createElement('canvas'); quarter.width = quarter.height = H; const q = quarter.getContext('2d')!;
  const diamond = (cx: number, cy: number, rx: number, ry: number, fill: string, line?: string, lw = 1) => { q.beginPath(); q.moveTo(cx, cy - ry); q.lineTo(cx + rx, cy); q.lineTo(cx, cy + ry); q.lineTo(cx - rx, cy); q.closePath(); q.fillStyle = fill; q.fill(); if (line) { q.strokeStyle = line; q.lineWidth = lw; q.stroke(); } };
  const rosette = (cx: number, cy: number, r: number, a: string, b: string, c: string) => { diamond(cx, cy, r, r, a); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) diamond(cx + dx * r * 0.95, cy + dy * r * 0.95, r * 0.42, r * 0.42, b); diamond(cx, cy, r * 0.5, r * 0.5, c); diamond(cx, cy, r * 0.2, r * 0.2, a); };
  // (the quarter's origin is the rug's corner; its far corner, H, is the rug's centre)
  q.fillStyle = ivory; q.fillRect(0, 0, H, H); q.fillStyle = dark; q.fillRect(2, 2, H, H); q.fillStyle = ochre; q.fillRect(3, 3, H, H);                    // outer guards
  q.fillStyle = ink; q.fillRect(5, 5, H, H);                                                                                                             // the main border
  for (let i = 0; i < 6; i++) { const c = 16 + i * 21.5; rosette(c, 15, 6.5, i % 2 ? rose : ivory, ochre, i % 2 ? ivory : field); rosette(15, c, 6.5, i % 2 ? rose : ivory, ochre, i % 2 ? ivory : field);
    diamond(c + 10.7, 15, 2.2, 5.5, olive); diamond(15, c + 10.7, 5.5, 2.2, olive); }
  q.fillStyle = ochre; q.fillRect(25, 25, H, H); q.fillStyle = ivory; q.fillRect(26, 26, H, H); q.fillStyle = dark; q.fillRect(28, 28, H, H);              // inner guards
  q.fillStyle = field; q.fillRect(29, 29, H, H);                                                                                                          // the field
  q.save(); q.beginPath(); q.rect(29, 29, H, H); q.clip();
  diamond(29, 29, 40, 52, ink, ivory, 1.5); diamond(29, 29, 27, 36, rose, ochre, 1); diamond(29, 29, 13, 18, ivory); rosette(47, 52, 5, ochre, ivory, ink);   // the corner piece
  diamond(H, H, 46, 62, ink, ivory, 1.5); diamond(H, H, 38, 52, field, ochre, 1); diamond(H, H, 28, 39, ivory, ink, 1); diamond(H, H, 19, 27, rose, ochre, 1); rosette(H, H, 11, ink, ochre, ivory); // the medallion
  diamond(H, H - 70, 5, 9, ink, ivory, 1); diamond(H, H - 82, 3, 5, ochre);                                                                              // its pendants, toward the ends
  for (const [x, y, r] of [[58, 96, 4], [80, 60, 3.5], [100, 40, 4], [64, 122, 3], [44, 84, 3], [92, 84, 3], [112, 62, 3], [74, 38, 3]] as const) rosette(x, y, r, rnd() < 0.5 ? ivory : ochre, olive, ink); // flowers strewn over the field
  q.restore();
  const pattern = document.createElement('canvas'); pattern.width = pattern.height = N; const p = pattern.getContext('2d')!;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { p.save(); p.translate(sx < 0 ? N : 0, sy < 0 ? N : 0); p.scale(sx, sy); p.drawImage(quarter, 0, 0); p.restore(); }
  return canvas(size, size, (g, w, h) => {
    const k = w / N; g.imageSmoothingEnabled = false; g.drawImage(pattern, 0, 0, w, h);
    // washed and sun-faded: the whole drawing moves toward the colour of undyed wool
    g.fillStyle = 'rgba(176,160,136,0.2)'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < N;) { const rows = 2 + Math.floor(rnd() * 14), a = (rnd() - 0.5) * 0.16; g.fillStyle = a > 0 ? `rgba(244,230,206,${a})` : `rgba(38,28,22,${-a})`; g.fillRect(0, y * k, w, rows * k); y += rows; } // abrash
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = (rnd() - 0.5) * 0.1; g.fillStyle = a > 0 ? `rgba(255,244,224,${a})` : `rgba(24,18,14,${-a})`; g.fillRect(x * k, y * k, k, k); } // knot by knot
    for (let i = 0; i < 26; i++) { const x = w * (0.2 + rnd() * 0.6), y = h * (0.15 + rnd() * 0.7), r = 120 + rnd() * 260, wear = g.createRadialGradient(x, y, 0, x, y, r); wear.addColorStop(0, `rgba(186,170,146,${0.06 + rnd() * 0.08})`); wear.addColorStop(1, 'rgba(186,170,146,0)'); g.fillStyle = wear; g.fillRect(x - r, y - r, r * 2, r * 2); } // wear
    g.fillStyle = 'rgba(20,14,10,0.07)'; for (let y = 0; y < N; y++) g.fillRect(0, y * k + k - 1, w, 1); // the shadow between the rows of knots
    // the pile leans and blurs the knots into each other: at a few pixels a knot, square knots with hard edges read as a mosaic
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; c2.getContext('2d')!.drawImage(g.canvas, 0, 0);
    g.filter = `blur(${(k * 0.2).toFixed(2)}px)`; g.drawImage(c2, 0, 0); g.filter = 'none';
  });
}
/** The warp ends left long at both ends of a rug: strands, some parted, some lying across each other (alpha in the colour's own channel). */
export function fringeTexture(seed = 9) {
  return canvas(1024, 64, (g, w, h) => {
    const rnd = seeded(seed); g.clearRect(0, 0, w, h);
    for (let x = 2; x < w; x += 5 + rnd() * 3) { const len = h * (0.62 + rnd() * 0.36), lean = (rnd() - 0.5) * 14; g.strokeStyle = `rgba(${206 + rnd() * 30 | 0},${192 + rnd() * 26 | 0},${164 + rnd() * 24 | 0},0.95)`; g.lineWidth = 2.2 + rnd() * 1.4; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + lean * 0.3, len * 0.5, x + lean, len); g.stroke(); }
  });
}

/** Brushwork: a field of colour laid in with a loaded flat brush, stroke beside stroke, each dragging out dry at its end. */
function lay(g: CanvasRenderingContext2D, rnd: () => number, x0: number, y0: number, x1: number, y1: number, cols: string[], o: { n?: number; width?: number; alpha?: number; slant?: number; ragged?: number } = {}) {
  const n = o.n ?? 160, bw = o.width ?? 46, ragged = o.ragged ?? 40;
  for (let i = 0; i < n; i++) {
    const y = y0 + rnd() * (y1 - y0), xa = x0 - ragged + rnd() * ragged * 2 + (x1 - x0) * rnd() * 0.5, len = (x1 - x0) * (0.25 + rnd() * 0.6), slant = (o.slant ?? 0) + (rnd() - 0.5) * 0.06;
    g.save(); g.translate(xa, y); g.rotate(slant); g.globalAlpha = (o.alpha ?? 0.5) * (0.5 + rnd() * 0.5);
    const grd = g.createLinearGradient(0, 0, len, 0), c = cols[Math.floor(rnd() * cols.length)]; grd.addColorStop(0, c); grd.addColorStop(0.75, c); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd;
    const hgt = bw * (0.4 + rnd() * 0.8); g.fillRect(0, -hgt / 2, len, hgt);
    g.globalAlpha *= 0.5; g.strokeStyle = rnd() < 0.5 ? 'rgba(255,250,240,0.5)' : 'rgba(10,8,6,0.5)'; g.lineWidth = 1; for (let b = 0; b < 5; b++) { const by = (rnd() - 0.5) * hgt; g.beginPath(); g.moveTo(len * rnd() * 0.3, by); g.lineTo(len * (0.6 + rnd() * 0.4), by + (rnd() - 0.5) * 3); g.stroke(); } // bristle marks
    g.restore();
  }
  g.globalAlpha = 1;
}
function linen(g: CanvasRenderingContext2D, rnd: () => number, w: number, h: number, a = 0.05) { for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,240' : '20,16,12'},${a * rnd()})`; g.fillRect(0, y, w, 1.5); } for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,240' : '20,16,12'},${a * rnd()})`; g.fillRect(x, 0, 1.5, h); } }
/**
 * The paintings, oil on linen. 0: the coast at dusk in three bands (a pale sky, the dark of the range, the rust of the plain)
 * under a line of gold leaf; 1: a tall piece in two blocks, ink over rust, their edges scumbled into the ground.
 */
export function paintingTexture(i: number) {
  return canvas(i === 0 ? 1536 : 1024, i === 0 ? 1024 : 1408, (g, w, h) => {
    const rnd = seeded(23 + i * 17);
    g.fillStyle = '#d9cfbd'; g.fillRect(0, 0, w, h); lay(g, rnd, 0, 0, w, h, ['#e3dac9', '#cfc3ad', '#d8cdb8', '#c4b69e'], { n: 220, width: 70, alpha: 0.5 });
    if (i === 0) {
      lay(g, rnd, 0, h * 0.06, w, h * 0.44, ['#d9c7a8', '#e0d2b8', '#c9b18c', '#d3bd9a'], { n: 150, width: 60, alpha: 0.4 });
      lay(g, rnd, w * 0.02, h * 0.4, w * 0.98, h * 0.5, ['#b98a5c', '#c89b68', '#a87548'], { n: 90, width: 30, alpha: 0.4 });                         // the last light on the horizon
      g.save(); g.beginPath(); g.moveTo(0, h * 0.56); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.56 - 0.1 * Math.sin((x / w) * 2.2 + 0.4) - 0.035 * Math.sin((x / w) * 9 + 1) - 0.012 * Math.sin((x / w) * 31))); g.lineTo(w, h * 0.74); g.lineTo(0, h * 0.74); g.closePath(); g.clip();
      g.fillStyle = '#1e2633'; g.fillRect(0, 0, w, h); lay(g, rnd, 0, h * 0.4, w, h * 0.74, ['#1a2230', '#27344a', '#141a26', '#33415a'], { n: 260, width: 40, alpha: 0.55, slant: -0.05 }); g.restore();   // the range
      lay(g, rnd, 0, h * 0.72, w, h * 0.97, ['#8a4f35', '#9b5f3f', '#74402c', '#a8714c', '#5d3426'], { n: 260, width: 52, alpha: 0.6 });                // the plain
      lay(g, rnd, w * 0.1, h * 0.7, w * 0.9, h * 0.76, ['#2a3446', '#6a3a2a'], { n: 60, width: 22, alpha: 0.45 });
      g.fillStyle = '#c9a55a'; g.globalAlpha = 0.9; for (let x = w * 0.18; x < w * 0.74; x += 22) if (rnd() < 0.86) g.fillRect(x, h * 0.705 + (rnd() - 0.5) * 3, 20 + rnd() * 4, 5 + rnd() * 3); g.globalAlpha = 1; // gold leaf, laid in squares
    } else {
      lay(g, rnd, w * 0.12, h * 0.08, w * 0.88, h * 0.52, ['#1c2534', '#263349', '#151c29', '#2f3e58'], { n: 300, width: 56, alpha: 0.6, ragged: 50 });
      lay(g, rnd, w * 0.12, h * 0.58, w * 0.88, h * 0.9, ['#8a4f35', '#9d6040', '#7a4430', '#aa7550'], { n: 260, width: 56, alpha: 0.6, ragged: 50 });
      lay(g, rnd, w * 0.1, h * 0.52, w * 0.9, h * 0.585, ['#d8ccb4', '#c9a55a', '#e2d8c4'], { n: 50, width: 16, alpha: 0.5 });
    }
    linen(g, rnd, w, h, 0.07);
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,14,8,0.16)'); g.fillStyle = vg; g.fillRect(0, 0, w, h); // varnish, a little darker toward the stretcher
  });
}
/** Sadu, the Bedouin weave: warp-faced bands of black, madder red and undyed wool, a row of small teeth between them. */
export function saduTexture(seed = 13) {
  return canvas(512, 256, (g, w, h) => {
    const rnd = seeded(seed), black = '#16130f', red = '#6e1f1a', ivory = '#d9ccb0', ochre = '#a9782f';
    g.fillStyle = red; g.fillRect(0, 0, w, h);
    let y = 0; const bands: [string, number][] = [[black, 22], [ivory, 5], [black, 5], [ivory, 5], [red, 30], [ochre, 4], [black, 34], [ivory, 4], [red, 40], [ivory, 4], [black, 34], [ochre, 4], [red, 30], [ivory, 5], [black, 5], [ivory, 5], [black, 22]];
    for (const [c, n] of bands) { g.fillStyle = c; g.fillRect(0, y, w, n); y += n; }
    g.fillStyle = ivory; for (const yy of [74, 182]) for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, yy + 12); g.lineTo(x + 8, yy); g.lineTo(x + 16, yy + 12); g.closePath(); g.fill(); } // teeth
    g.fillStyle = red; for (let x = 4; x < w; x += 24) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 8, 118); g.lineTo(x + 16, 128); g.lineTo(x + 8, 138); g.closePath(); g.fill(); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,245,225' : '10,8,6'},${0.05 + rnd() * 0.08})`; g.fillRect(x, 0, 1, h); } // the warp
  });
}
/** A book bound in cloth: the weave, a foil block on the front board and rules across the spine (the spine is the top eighth). */
export function bindingTexture(colour: string, foil: string, seed: number) {
  return canvas(256, 256, (g, w, h) => {
    const rnd = seeded(seed); g.fillStyle = colour; g.fillRect(0, 0, w, h); linen(g, rnd, w, h, 0.09);
    g.fillStyle = foil; g.globalAlpha = 0.85; g.fillRect(w * 0.12, h * 0.05, w * 0.76, 2); g.fillRect(w * 0.12, h * 0.095, w * 0.76, 1);
    const bx = w * (0.2 + rnd() * 0.12), by = h * (0.32 + rnd() * 0.1); g.fillRect(bx, by, w * 0.32, 5); g.fillRect(bx, by + 12, w * (0.18 + rnd() * 0.2), 3); g.globalAlpha = 1;
  });
}
/** What is left of the fire: a bed of embers along the slot, brightest in its cracks, under a low lick of flame (no tongues: a
 *  painted flame that does not move is a sticker, and one that flickers makes the film flicker). */
export function emberTexture(seed = 31) {
  return canvas(1024, 128, (g, w, h) => {
    const rnd = seeded(seed); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const glow = g.createLinearGradient(0, h, 0, h * 0.25); glow.addColorStop(0, 'rgba(255,140,60,0.5)'); glow.addColorStop(0.35, 'rgba(230,80,24,0.2)'); glow.addColorStop(1, 'rgba(160,40,10,0)'); g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 260; i++) { const x = rnd() * w, y = h * (0.8 + rnd() * 0.2), r = 5 + rnd() * 16, e = g.createRadialGradient(x, y, 0, x, y, r), a = 0.25 + rnd() * 0.55; e.addColorStop(0, `rgba(255,${150 + rnd() * 70 | 0},${60 + rnd() * 50 | 0},${a})`); e.addColorStop(1, 'rgba(200,50,10,0)'); g.fillStyle = e; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 70; i++) { const x = rnd() * w, fh = h * (0.18 + rnd() * 0.3), fw = 26 + rnd() * 40, f = g.createRadialGradient(x, h, 0, x, h, fh); f.addColorStop(0, 'rgba(255,170,90,0.3)'); f.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = f; g.save(); g.translate(x, h); g.scale(fw / fh, 1); g.translate(-x, -h); g.fillRect(x - fh, h - fh, fh * 2, fh); g.restore(); }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#050302'; for (let i = 0; i < 120; i++) g.fillRect(rnd() * w, h * (0.86 + rnd() * 0.14), 4 + rnd() * 12, 2 + rnd() * 4); // the coals themselves, dark against their glow
  });
}
/** The bed of coals seen from above: dark lumps, the fire in the gaps between them. */
export function coalTexture(seed = 37) {
  return canvas(1024, 64, (g, w, h) => {
    const rnd = seeded(seed); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 420; i++) { const x = rnd() * w, y = rnd() * h, r = 4 + rnd() * 12, e = g.createRadialGradient(x, y, 0, x, y, r), a = 0.2 + rnd() * 0.6; e.addColorStop(0, `rgba(255,${120 + rnd() * 80 | 0},${40 + rnd() * 40 | 0},${a})`); e.addColorStop(1, 'rgba(180,40,8,0)'); g.fillStyle = e; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(0,0,0,0.85)'; for (let i = 0; i < 260; i++) { g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 5 + rnd() * 9, 3 + rnd() * 5, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  });
}
