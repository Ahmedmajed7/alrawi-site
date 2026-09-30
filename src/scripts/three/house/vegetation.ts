/**
 * Planting, as a Muscat garden is planted. Date palms of every age (palm.ts: six characters built leaf by leaf, every
 * instance turned and scaled, a full-detail kit near the lens and lighter ones further out), bougainvillea grown cane by
 * cane over the wall tops in flower, a frangipani by the gate, free-grown branchy shrubs behind the wall, agaves, clipped
 * balls and ground cover in the beds at its foot, a photoscanned sidr-like broadleaf (Poly Haven CC0,
 * scripts/build-trees.mjs) in the gardens, and palm groves far out. Leaves shade as volumes and let the sun through
 * (foliage.ts). Everything is instanced or merged — one draw call per kit and material — and moves in the one wind.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Tier } from '../common';
import type { V3 } from './types';
import { windify } from './wind';
import type { Props } from './props';
import type { Street, Spill } from './street';

import { datePalm, bootTextures, mulberry32, LOD, type PalmSpec, type PalmLod } from './palm';
import { foliage, uplit } from './foliage';

/* ------------------------------------------------------------ date palm */
interface Kit { wood: THREE.BufferGeometry; leaf: THREE.BufferGeometry }
/** Adds a quad (a, b, c, d counter-clockwise) with one colour to flat arrays. */
function quad(pos: number[], nor: number[], colr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color) {
  const n = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(d, b)).normalize();
  for (const p of [a, b, c, a, c, d]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); colr.push(color.r, color.g, color.b); }
}
function leafGeo(pos: number[], nor: number[], colr: number[], uv?: number[]) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
/** uv of the two triangles [0, 1, 2, 0, 2, 3] of a leaf card (corners −a−b, +a−b, +a+b, −a+b) */
const CARD_UV = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
let leafTex: THREE.Texture | null = null;
/**
 * The silhouette every shrub, cover and bougainvillea card is cut to (alpha-tested): an ovate leaf along the card's long
 * axis with a drawn-out tip, a paler midrib and a darker rim. Square cards read as confetti from a few metres; leaves read
 * as leaves. White, so the vertex colour still decides the hue; the same alpha shapes the shadow (windify's depth material).
 */
export function leafCard() {
  if (leafTex) return leafTex;
  const W = 128, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, W, H);
  const leaf = new Path2D(); leaf.moveTo(3, H / 2); leaf.bezierCurveTo(W * 0.22, 2, W * 0.62, 1, W - 2, H / 2); leaf.bezierCurveTo(W * 0.62, H - 1, W * 0.22, H - 2, 3, H / 2); leaf.closePath();
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#c9c9c9'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#bdbdbd');
  g.fillStyle = gr; g.fill(leaf);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, H / 2); g.lineTo(W - 6, H / 2); g.stroke(); // midrib
  g.strokeStyle = 'rgba(150,150,150,0.5)'; g.lineWidth = 1; for (let i = 1; i < 6; i++) { const x = W * (0.12 + i * 0.13); g.beginPath(); g.moveTo(x, H / 2); g.lineTo(x + 12, H * 0.2); g.moveTo(x, H / 2); g.lineTo(x + 12, H * 0.8); g.stroke(); } // veins
  leafTex = new THREE.CanvasTexture(c); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4; return leafTex;
}
/* ------------------------------------------------------------ bushes */
/**
 * A dense mounded bush of small leaf cards. Normals point out of the mound (not per card) so it shades as
 * one soft volume; `flowers` scatters clustered magenta bracts over the sunny top (bougainvillea).
 */
export function bush(seed: number, rx: number, ry: number, leaves: number, flowers: boolean, palette = ['#3f5a2a', '#4c6a31', '#5a7a3a', '#35502a'], leaf = { size: 1, aspect: 0.6 }) {
  const rnd = mulberry32(seed); const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [];
  const greens = palette.map((c) => new THREE.Color(c)), pinks = ['#c2185b', '#d6337f', '#a8155a', '#e0508f'].map((c) => new THREE.Color(c));
  const blooms = Array.from({ length: 14 }, () => new THREE.Vector3(rnd() * 2 - 1, 0.2 + rnd() * 0.8, rnd() * 2 - 1).normalize());
  const n = new THREE.Vector3(), p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < leaves; i++) {
    n.set(rnd() * 2 - 1, rnd() * 1.4 - 0.25, rnd() * 2 - 1).normalize(); // mostly upper half
    const r = 1 - Math.pow(rnd(), 3) * 0.4;
    p.set(n.x * rx * r, Math.max(0.02, (n.y * 0.5 + 0.5) * ry * r * 1.1), n.z * rx * r);
    const bloom = flowers && blooms.some((bl) => bl.dot(n) > 0.9) && rnd() < 0.8;
    const size = (bloom ? 0.055 : 0.06 + rnd() * 0.036) * leaf.size; // (leaf-shaped cards cover ~65 % of their square)
    q.setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
    a.set(size, 0, 0).applyQuaternion(q); b.set(0, size * leaf.aspect, 0).applyQuaternion(q);
    c.copy(bloom ? pinks[Math.floor(rnd() * 4)] : greens[Math.floor(rnd() * 4)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
    if (!bloom) c.multiplyScalar(0.75 + 0.35 * (n.y * 0.5 + 0.5)); // inner/lower leaves darker
    const v = [p.clone().sub(a).sub(b), p.clone().add(a).sub(b), p.clone().add(a).add(b), p.clone().sub(a).add(b)];
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(v[k].x, v[k].y, v[k].z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); } uv.push(...CARD_UV);
  }
  return leafGeo(pos, nor, col, uv);
}

/**
 * A free-growing shrub, grown from its branches: stems fan up and out from the base, fork, and carry their leaves in clusters
 * at the twig ends, so the outline is a crowd of rounded heads with gaps between them, the stems showing in the dark
 * inside, the sunny heads paler than the ones deep in. Leaf cards from the atlas (tile 0); normals lean out of the shrub
 * and out of each head, so it shades as a body made of smaller bodies.
 */
export function shrub(seed: number, rx: number, ry: number, leaves: number, palette: string[], o: { leaf?: number; stems?: number; heads?: number; stem?: string } = {}) {
  const rnd = mulberry32(seed), R = (a: number, b: number) => a + rnd() * (b - a);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [];
  const greens = palette.map((c) => new THREE.Color(c)), bark = new THREE.Color(o.stem ?? '#5d5344'), c = new THREE.Color();
  const X = new THREE.Vector3(), N = new THREE.Vector3(), ctr = new THREE.Vector3(0, ry * 0.5, 0);
  const card = (p: THREE.Vector3, D: THREE.Vector3, F: THREE.Vector3, len: number, wid: number, color: THREE.Color, out: THREE.Vector3, stemUv = false) => {
    X.crossVectors(D, F); if (X.lengthSq() < 1e-8) return; X.normalize().multiplyScalar(wid / 2);
    N.crossVectors(X, D).normalize(); if (N.dot(out) < 0) N.negate(); N.multiplyScalar(0.45).addScaledVector(out, 0.55).normalize();
    const a = p.clone().sub(X), b = p.clone().add(X), cc = b.clone().addScaledVector(D, len), d = a.clone().addScaledVector(D, len);
    const U = stemUv ? [[0.1, 0.49], [0.1, 0.51], [0.4, 0.51], [0.1, 0.49], [0.4, 0.51], [0.4, 0.49]] : [[0, 0], [0, 1], [0.5, 1], [0, 0], [0.5, 1], [0.5, 0]];
    [a, b, cc, a, cc, d].forEach((v, k) => { pos.push(v.x, v.y, v.z); nor.push(N.x, N.y, N.z); col.push(color.r, color.g, color.b); uv.push(U[k][0], U[k][1]); });
  };
  const heads: { p: THREE.Vector3; r: number }[] = [];
  const stems = o.stems ?? Math.round(R(9, 14));
  const grow = (a: THREE.Vector3, dir: THREE.Vector3, len: number, w: number, depth: number) => {
    const b = a.clone().addScaledVector(dir, len); const out = b.clone().sub(ctr).normalize();
    card(a, dir, out, len, w, bark, out, true);
    if (depth === 0) { heads.push({ p: b, r: R(0.14, 0.26) * Math.min(rx, ry) / 0.8 }); return; }
    const k = rnd() < 0.6 ? 2 : 3;
    for (let i = 0; i < k; i++) { const d = dir.clone().add(new THREE.Vector3(R(-0.7, 0.7), R(-0.2, 0.5), R(-0.7, 0.7))).normalize(); grow(b, d, len * R(0.55, 0.8), w * 0.7, depth - 1); }
  };
  for (let i = 0; i < stems; i++) {
    const az = (i / stems) * Math.PI * 2 + R(-0.4, 0.4), el = R(0.5, 1.35), dir = new THREE.Vector3(Math.cos(az) * Math.cos(el) * rx / ry, Math.sin(el), Math.sin(az) * Math.cos(el) * rx / ry).normalize();
    grow(new THREE.Vector3(R(-0.05, 0.05), 0, R(-0.05, 0.05)), dir, ry * R(0.35, 0.5), 0.025 * Math.min(1.5, ry), o.heads ?? 2);
  }
  // keep the heads inside the shrub's envelope (a clipped outline without the clipping)
  for (const h of heads) { const q = new THREE.Vector3(h.p.x / rx, (h.p.y - ry * 0.5) / (ry * 0.5), h.p.z / rx); const l = q.length(); if (l > 0.92) h.p.set(h.p.x * 0.92 / l, ry * 0.5 + (h.p.y - ry * 0.5) * 0.92 / l, h.p.z * 0.92 / l); h.p.y = Math.max(h.p.y, h.r * 0.6); }
  const per = Math.max(8, Math.round(leaves / heads.length)), size = o.leaf ?? 1;
  for (const h of heads) {
    const hc = greens[Math.floor(rnd() * greens.length)].clone().offsetHSL(R(-0.01, 0.01), R(-0.05, 0.05), R(-0.04, 0.04)), hout = h.p.clone().sub(ctr).normalize();
    const sun = 0.8 + 0.3 * Math.max(0, hout.y) + 0.1 * Math.max(0, hout.z);
    for (let i = 0; i < per; i++) {
      const n = new THREE.Vector3(R(-1, 1), R(-0.6, 1), R(-1, 1)).normalize(), r = h.r * (1 - Math.pow(rnd(), 3) * 0.6), p = h.p.clone().addScaledVector(n, r);
      if (p.y < 0.02) continue;
      const out = n.clone().multiplyScalar(0.5).addScaledVector(hout, 0.5).normalize(), D = new THREE.Vector3(R(-1, 1), R(-0.8, 0.6), R(-1, 1)).addScaledVector(n, 0.8).normalize();
      c.copy(hc).offsetHSL(0, 0, R(-0.05, 0.05)).multiplyScalar(sun * (0.72 + 0.28 * (r / h.r)));
      card(p, D, n.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize(), R(0.05, 0.08) * size, R(0.028, 0.045) * size, c, out);
    }
  }
  return leafGeo(pos, nor, col, uv);
}

let atlasTex: THREE.Texture | null = null;
/**
 * Leaf and bract atlas (two tiles side by side, alpha-cut, white so the vertex colour decides the hue): u 0…0.5 an ovate,
 * pointed leaf with its midrib and veins; u 0.5…1 a bougainvillea bract — broad, heart-based, papery, a net of fine veins
 * that the sun shows through.
 */
export function foliageAtlas() {
  if (atlasTex) return atlasTex;
  const T = 128, H = 64, c = document.createElement('canvas'); c.width = T * 2; c.height = H; const g = c.getContext('2d')!;
  g.clearRect(0, 0, T * 2, H);
  // the leaf
  const leaf = new Path2D(); leaf.moveTo(2, H / 2); leaf.bezierCurveTo(T * 0.2, 3, T * 0.6, 4, T - 2, H / 2); leaf.bezierCurveTo(T * 0.6, H - 4, T * 0.2, H - 3, 2, H / 2); leaf.closePath();
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#cfcfcf'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#c4c4c4'); g.fillStyle = gr; g.fill(leaf);
  g.save(); g.clip(leaf);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(3, H / 2); g.lineTo(T - 6, H / 2); g.stroke();
  g.strokeStyle = 'rgba(140,140,140,0.45)'; g.lineWidth = 1; for (let i = 1; i < 7; i++) { const x = T * (0.08 + i * 0.12); g.beginPath(); g.moveTo(x, H / 2); g.quadraticCurveTo(x + 8, H * 0.3, x + 16, H * 0.14); g.moveTo(x, H / 2); g.quadraticCurveTo(x + 8, H * 0.7, x + 16, H * 0.86); g.stroke(); }
  g.restore();
  // the bract
  const o = T, br = new Path2D(); br.moveTo(o + 3, H / 2); br.bezierCurveTo(o + T * 0.05, 1, o + T * 0.55, -2, o + T - 3, H / 2); br.bezierCurveTo(o + T * 0.55, H + 2, o + T * 0.05, H - 1, o + 3, H / 2); br.closePath();
  gr = g.createRadialGradient(o + T * 0.3, H / 2, 2, o + T * 0.4, H / 2, T * 0.6); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d8d8d8'); g.fillStyle = gr; g.fill(br);
  g.save(); g.clip(br);
  g.strokeStyle = 'rgba(120,120,120,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(o + 3, H / 2); g.lineTo(o + T - 8, H / 2); g.stroke();
  for (let i = 1; i < 8; i++) { const x = o + T * (0.05 + i * 0.1); g.beginPath(); g.moveTo(x, H / 2); g.bezierCurveTo(x + 6, H * 0.35, x + 14, H * 0.2, x + 22, H * 0.05); g.moveTo(x, H / 2); g.bezierCurveTo(x + 6, H * 0.65, x + 14, H * 0.8, x + 22, H * 0.95); g.stroke(); }
  g.restore();
  atlasTex = new THREE.CanvasTexture(c); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4; return atlasTex;
}

/**
 * Bougainvillea over a wall, grown cane by cane: woody whips rise behind the wall, arch over the coping and hang down the
 * street face or reach out into the air, leafing alternately along their length; from the sunny part short side shoots
 * end in heads of bracts in threes (the papery "flowers"), the biggest heads at the cane tips. The mass is only what the
 * canes add up to, so it is dense where they cross and open elsewhere, with the wall and dark gaps between.
 * World coordinates (the wall is where it is); normals lean out of the mass so it shades as one soft body.
 */
function spill(seed: number, runs: Spill[], density: number, bracts: string[]) {
  const rnd = mulberry32(seed), R = (a: number, b: number) => a + rnd() * (b - a);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [];
  const greens = ['#3c5c28', '#48692e', '#547834', '#324f23'].map((c) => new THREE.Color(c)), pinks = bracts.map((c) => new THREE.Color(c));
  const wood = new THREE.Color('#5a4631'), shoot = new THREE.Color('#58743a');
  const X = new THREE.Vector3(), N = new THREE.Vector3(), c = new THREE.Color();
  /** one alpha-cut card from `p` along `D` (tile 0 = leaf, 1 = bract), facing `F`, its normal leaning toward `out` */
  const card = (p: THREE.Vector3, D: THREE.Vector3, F: THREE.Vector3, len: number, wid: number, color: THREE.Color, tile: number, out: THREE.Vector3) => {
    X.crossVectors(D, F); if (X.lengthSq() < 1e-8) return; X.normalize().multiplyScalar(wid / 2);
    N.crossVectors(X, D).normalize(); if (N.dot(out) < 0) N.negate(); N.multiplyScalar(0.5).addScaledVector(out, 0.5).normalize();
    const a = p.clone().sub(X), b = p.clone().add(X), cc = b.clone().addScaledVector(D, len), d = a.clone().addScaledVector(D, len), u0 = tile * 0.5;
    for (const [v, u, w] of [[a, 0, 0], [b, 0, 1], [cc, 1, 1], [a, 0, 0], [cc, 1, 1], [d, 1, 0]] as const) { pos.push(v.x, v.y, v.z); nor.push(N.x, N.y, N.z); col.push(color.r, color.g, color.b); uv.push(u0 + u * 0.5, w); }
  };
  /** a thin stem quad from a to b (uses the leaf tile's opaque midrib band) */
  const stem = (a: THREE.Vector3, b: THREE.Vector3, w: number, color: THREE.Color, out: THREE.Vector3) => { const D = b.clone().sub(a); const l = D.length(); if (l < 1e-4) return; D.divideScalar(l); card(a, D, out, l, w, color, 0, out); uv.splice(uv.length - 12, 12, 0.1, 0.49, 0.1, 0.51, 0.4, 0.51, 0.1, 0.49, 0.4, 0.51, 0.4, 0.49); };
  const P = new THREE.Vector3(), out = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
  for (const run of runs) {
    if (run.a1 - run.a0 < 0.6) continue;
    const half = run.thick / 2 + 0.03;
    const world = (al: number, ac: number, y: number, o: THREE.Vector3) => run.axis === 'x' ? o.set(al, y, run.at + run.side * ac) : o.set(run.at + run.side * ac, y, al);
    const outward = (ac: number, up: number, o: THREE.Vector3) => { world(0, Math.sign(ac) || 1, 0, o); if (run.axis === 'x') o.set(0, 0, o.z - run.at); else o.set(o.x - run.at, 0, 0); o.normalize().multiplyScalar(0.8).setY(up).normalize(); return o; };
    for (let at = run.a0 + R(0.2, 0.7); at < run.a1 - 0.25; at += R(1.3, 2.4)) {
      const w = R(0.7, 1.3), fall = R(0.5, 1.3), canes = Math.round(density * R(30, 40));
      for (let k = 0; k < canes; k++) {
        const kind = rnd(), arch = kind < 0.2, short = kind > 0.5; // some whips reach out into the air, most mound over the coping, a few hang long
        const al0 = at + R(-0.5, 0.5) * w, drift = R(-0.8, 0.8);
        const P0 = [al0, -(half + R(0.1, 0.35)), run.top - R(0.3, 0.8)], P1 = [al0 + drift * 0.4, R(-0.15, 0.25), run.top + R(0.15, 0.55)];
        const P2 = arch ? [al0 + drift, half + R(0.5, 0.9), run.top + R(-0.3, 0.2)] : short ? [al0 + drift * 0.6, half + R(0.1, 0.35), run.top - R(0.05, 0.5)] : [al0 + drift, half + R(0.2, 0.5), run.top - R(0.5, 1.4) * fall];
        const bez = (t: number, o: THREE.Vector3) => { const u = 1 - t; const al = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], ac = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1], y = u * u * P0[2] + 2 * u * t * P1[2] + t * t * P2[2]; return world(al, ac, y, o); };
        const acAt = (t: number) => { const u = 1 - t; return u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]; };
        const steps = short ? 28 : 44;
        let prev = bez(0, new THREE.Vector3());
        for (let i = 1; i <= steps; i++) {
          const t = i / steps; bez(t, P); T.subVectors(P, prev).normalize();
          const ac = acAt(t); if (Math.abs(ac) < half && P.y < run.top + 0.02) { prev.copy(P); continue; } // never inside the wall
          outward(ac, 0.6, out);
          stem(prev, P, 0.009 * (1 - 0.5 * t), c.copy(wood).lerp(shoot, t), out);
          // a leaf at every node, turning round the cane
          const ph = i * 2.4, side = new THREE.Vector3().crossVectors(T, U).normalize(); if (side.lengthSq() < 0.5) side.set(1, 0, 0);
          const up2 = new THREE.Vector3().crossVectors(side, T).normalize();
          const L = side.clone().multiplyScalar(Math.cos(ph)).addScaledVector(up2, Math.sin(ph)).addScaledVector(T, 0.5).normalize(); L.y -= 0.25; L.normalize();
          for (let lf = rnd() < 0.5 ? 2 : 1; lf > 0; lf--, L.addScaledVector(side, -1.6).normalize()) card(P.clone().addScaledVector(L, 0.012), L, out.clone().add(U).normalize(), R(0.06, 0.1) * (t < 0.3 ? 0.8 : 1), R(0.038, 0.058), c.copy(greens[Math.floor(rnd() * 4)]).offsetHSL(0, 0, R(-0.04, 0.03)).multiplyScalar(0.75 + 0.3 * t), 0, out);
          // side shoots in the sun, each ending in a head of bracts; the cane's own tip ends in the biggest
          const sunny = ac > 0 || P.y > run.top + 0.1;
          const tipHead = i === steps, lateral = t > 0.15 && rnd() < 0.36, bloom = tipHead || (sunny && t > 0.3 && rnd() < 0.8);
          if (tipHead || lateral) {
            const hl = tipHead ? 0 : R(0.08, 0.22), hd = L.clone().addScaledVector(out, 0.6).normalize(), H0 = P.clone().addScaledVector(hd, hl);
            if (hl > 0) { stem(P, H0, 0.006, shoot, out); const nl = 3 + Math.floor(rnd() * 4); for (let q = 0; q < nl; q++) { const lp = P.clone().addScaledVector(hd, hl * (0.2 + q * 0.8 / nl)), ld = hd.clone().addScaledVector(side, q % 2 ? 0.9 : -0.9).addScaledVector(U, R(-0.3, 0.4)).normalize(); card(lp, ld, out, R(0.055, 0.09), R(0.034, 0.052), c.copy(greens[q % 4]).offsetHSL(0, 0, R(-0.04, 0.03)).multiplyScalar(0.8 + 0.2 * t), 0, out); } }
            if (!bloom) { prev.copy(P); continue; }
            const trip = Math.round((tipHead ? R(12, 20) : R(6, 13)) * (0.6 + 0.4 * density)), rad = tipHead ? 0.11 : R(0.06, 0.1), hue = pinks[Math.floor(rnd() * pinks.length)];
            for (let f = 0; f < trip; f++) {
              const ctr = H0.clone().add(new THREE.Vector3(R(-1, 1), R(-0.7, 0.9), R(-1, 1)).multiplyScalar(rad)); ctr.addScaledVector(out, rad * 0.4);
              const ax = out.clone().add(new THREE.Vector3(R(-0.6, 0.6), R(-0.3, 0.8), R(-0.6, 0.6))).normalize(), bx = new THREE.Vector3().crossVectors(ax, U).normalize(), by = new THREE.Vector3().crossVectors(ax, bx);
              c.copy(hue).offsetHSL(R(-0.02, 0.02), R(-0.08, 0.04), R(-0.07, 0.07)); if (rnd() < 0.12) c.lerp(new THREE.Color('#d9a2c0'), 0.45); // an old bract fading
              const bl = R(0.03, 0.045); // three bracts cupped round their flowers, overlapping
              for (let q = 0; q < 3; q++) { const a = (q / 3) * Math.PI * 2 + R(-0.3, 0.3); const D = bx.clone().multiplyScalar(Math.cos(a)).addScaledVector(by, Math.sin(a)).addScaledVector(ax, 1.5).normalize(); card(ctr.clone().addScaledVector(D, -bl * 0.3), D, ax, bl, bl * 0.9, c, 1, out); }
            }
          }
          prev.copy(P);
        }
      }
    }
  }
  return pos.length ? leafGeo(pos, nor, col, uv) : null;
}

/** An agave: a rosette of stiff, tapering, glaucous blades, each folded along its keel, the young ones standing in the heart. */
function agave(seed: number, blades = 30) {
  const rnd = mulberry32(seed); const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  for (let i = 0; i < blades; i++) {
    const age = i / (blades - 1), az = i * 2.39996 + (rnd() - 0.5) * 0.2, el = THREE.MathUtils.lerp(1.35, 0.18, Math.pow(age, 0.8)), L = (0.32 + 0.3 * Math.sin(Math.PI * (0.25 + 0.75 * age))) * (0.9 + rnd() * 0.2), W = 0.05 + 0.025 * age;
    const F = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), Lat = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const at = (s: number) => new THREE.Vector3().addScaledVector(F, Math.cos(el) * s * L + 0.03).addScaledVector(up, 0.04 + Math.sin(el) * s * L + 0.12 * s * s * L * (1 - age));
    c.set('#6f8b7c').offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05 + 0.04 * (1 - age));
    const SEG = 4;
    for (let k = 0; k < SEG; k++) {
      const s0 = k / SEG, s1 = (k + 1) / SEG, p0 = at(s0), p1 = at(s1), w0 = W * (1 - Math.pow(s0, 1.6)) * (0.55 + 0.9 * Math.min(1, s0 * 4)), w1 = W * (1 - Math.pow(s1, 1.6)) * (0.55 + 0.9 * Math.min(1, s1 * 4));
      const T = p1.clone().sub(p0).normalize(), N = new THREE.Vector3().crossVectors(Lat, T).normalize(); if (N.y < 0) N.negate();
      for (const side of [-1, 1]) { // two halves folded up along the keel
        const e0 = p0.clone().addScaledVector(Lat, side * w0).addScaledVector(N, w0 * 0.45), e1 = p1.clone().addScaledVector(Lat, side * w1).addScaledVector(N, w1 * 0.45);
        if (side > 0) quad(pos, nor, col, p0, e0, e1, p1, c); else quad(pos, nor, col, e0, p0, p1, e1, c);
      }
    }
  }
  return leafGeo(pos, nor, col);
}

/** A frangipani: stout grey limbs forking in threes, a whorl of long leaves at every tip, clusters of white flowers with yellow throats. */
function frangipani(seed: number, height = 3.3): Kit {
  const rnd = mulberry32(seed), R = (a: number, b: number) => a + rnd() * (b - a);
  const wood: THREE.BufferGeometry[] = [], pos: number[] = [], nor: number[] = [], col: number[] = [];
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => { const d = b.clone().sub(a), L = d.length(); const g = new THREE.CylinderGeometry(r1, r0, L, 8, 1, false).translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); wood.push(g); };
  const leafC = new THREE.Color(), white = new THREE.Color('#f4efe2'), yolk = new THREE.Color('#e9b53a');
  const tip = (at: THREE.Vector3, dir: THREE.Vector3) => {
    const x = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0.3, 1, 0.2)).normalize(), y = new THREE.Vector3().crossVectors(dir, x).normalize();
    const n = 12 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) { // the whorl: long obovate leaves, a shallow fold along the midrib
      const az = i * 2.39996, el = R(0.1, 0.75), L = R(0.26, 0.38), W = L * 0.17;
      const out = x.clone().multiplyScalar(Math.cos(az)).addScaledVector(y, Math.sin(az)), D = out.clone().multiplyScalar(Math.cos(el)).addScaledVector(dir, Math.sin(el)).normalize(), S = new THREE.Vector3().crossVectors(D, dir).normalize();
      const N = new THREE.Vector3().crossVectors(S, D).normalize(); if (N.dot(dir) < 0) N.negate();
      leafC.set('#45683a').offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
      const from = nor.length;
      // an obovate blade, widest two thirds out, curving down to a blunt point, folded a little along its midrib
      const ctr = (t: number) => at.clone().addScaledVector(D, 0.03 + L * t).addScaledVector(N, -0.07 * t * t), wid = (t: number) => W * 1.9 * Math.pow(t, 0.75) * Math.pow(1 - t, 0.5);
      const ts = [0, 0.18, 0.4, 0.62, 0.8, 0.93, 1];
      for (let k = 0; k < ts.length - 1; k++) {
        const c0 = ctr(ts[k]), c1 = ctr(ts[k + 1]);
        for (const s of [-1, 1]) {
          const e0 = c0.clone().addScaledVector(S, s * wid(ts[k])).addScaledVector(N, 0.25 * wid(ts[k])), e1 = c1.clone().addScaledVector(S, s * wid(ts[k + 1])).addScaledVector(N, 0.25 * wid(ts[k + 1]));
          if (s > 0) quad(pos, nor, col, c0, e0, e1, c1, leafC); else quad(pos, nor, col, e0, c0, c1, e1, leafC);
        }
      }
      // soft shading: the whorl shades as one rosette (a normal leaning out of it), not as flat facets; kept on the face's own side so double-sided lighting stays true
      for (let k = from; k < nor.length; k += 3) { const g = new THREE.Vector3(nor[k], nor[k + 1], nor[k + 2]), m = g.clone().multiplyScalar(0.45).addScaledVector(out, 0.55 * Math.sign(g.dot(out) || 1)).addScaledVector(dir, 0.35 * Math.sign(g.dot(dir) || 1)).normalize(); nor[k] = m.x; nor[k + 1] = m.y; nor[k + 2] = m.z; }
    }
    if (rnd() < 0.75) for (let f = 0; f < 5; f++) { // a head of flowers above the whorl
      const c0 = at.clone().addScaledVector(dir, R(0.08, 0.16)).addScaledVector(x, R(-0.07, 0.07)).addScaledVector(y, R(-0.07, 0.07)), fa = new THREE.Vector3().copy(dir).addScaledVector(x, R(-0.5, 0.5)).addScaledVector(y, R(-0.5, 0.5)).normalize();
      const fx = new THREE.Vector3().crossVectors(fa, new THREE.Vector3(0.2, 1, 0.4)).normalize(), fy = new THREE.Vector3().crossVectors(fa, fx).normalize();
      for (let k = 0; k < 5; k++) { const a0 = (k / 5) * Math.PI * 2, a1 = a0 + 0.9, r = 0.034; const pa = c0.clone().addScaledVector(fx, Math.cos(a0) * r).addScaledVector(fy, Math.sin(a0) * r).addScaledVector(fa, 0.01), pb = c0.clone().addScaledVector(fx, Math.cos(a1) * r).addScaledVector(fy, Math.sin(a1) * r).addScaledVector(fa, 0.01);
        for (const [p, cl] of [[c0, yolk], [pa, white], [pb, white]] as const) { pos.push(p.x, p.y, p.z); nor.push(fa.x, fa.y, fa.z); col.push(cl.r, cl.g, cl.b); } }
    }
  };
  const grow = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const b = a.clone().addScaledVector(dir, len); limb(a, b, r, r * 0.78);
    if (depth === 0) { tip(b, dir); return; }
    const k = depth > 2 ? 2 + Math.floor(rnd() * 2) : 3, x = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0.2, 1, 0.3)).normalize(), y = new THREE.Vector3().crossVectors(dir, x).normalize(), a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < k; i++) { const az = a0 + (i / k) * Math.PI * 2 + R(-0.3, 0.3), sp = R(0.5, 0.8); const d = dir.clone().multiplyScalar(Math.cos(sp)).addScaledVector(x, Math.sin(sp) * Math.cos(az)).addScaledVector(y, Math.sin(sp) * Math.sin(az)); d.y = Math.max(d.y, 0.15) + 0.25; d.normalize(); grow(b, d, len * R(0.62, 0.78), r * 0.74, depth - 1); }
  };
  const s = height / 3.3;
  grow(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(R(-0.06, 0.06), 1, R(-0.06, 0.06)).normalize(), 1.0 * s, 0.095 * s, 4);
  const w = mergeGeometries(wood.map((g) => g.toNonIndexed()), false)!; const wc = new Float32Array(w.attributes.position.count * 3); const grey = new THREE.Color('#8d867a'); for (let i = 0; i < wc.length; i += 3) { wc[i] = grey.r; wc[i + 1] = grey.g; wc[i + 2] = grey.b; } w.setAttribute('color', new THREE.BufferAttribute(wc, 3));
  return { wood: w, leaf: leafGeo(pos, nor, col) };
}

/* ------------------------------------------------------------ helpers */
type Spot = { p: V3; s: number; ry: number };
function instance(geo: THREE.BufferGeometry, mat: THREE.Material, spots: Spot[], shadows: boolean) {
  const m = new THREE.InstancedMesh(geo, mat, spots.length); const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach((s, i) => { p.set(...s.p); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry); sc.setScalar(s.s); M.compose(p, q, sc); m.setMatrixAt(i, M); });
  m.castShadow = shadows; m.receiveShadow = true; m.frustumCulled = false; return m;
}
/**
 * Every mesh of a loaded GLB, with its world transform baked, instanced at the spots. The model is set on
 * the ground at its footprint centre and, when `height` is given, scaled to it (Poly Haven units vary).
 */
function instanceGltf(gltf: GLTF, spots: Spot[], shadows: boolean, height?: number) {
  const g = new THREE.Group(); gltf.scene.updateMatrixWorld(true);
  const parts: [THREE.BufferGeometry, THREE.MeshStandardMaterial][] = []; const box = new THREE.Box3();
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox(); box.union(geo.boundingBox!);
    parts.push([geo, mesh.material as THREE.MeshStandardMaterial]);
  });
  const c = box.getCenter(new THREE.Vector3()), k = height ? height / (box.max.y - box.min.y) : 1;
  for (const [geo, mat] of parts) {
    geo.translate(-c.x, -box.min.y, -c.z).scale(k, k, k);
    if (mat.alphaTest || mat.transparent) { mat.transparent = false; mat.alphaTest = Math.max(0.4, mat.alphaTest); mat.side = THREE.DoubleSide; }
    g.add(instance(geo, mat, spots, shadows));
  }
  return g;
}

/* ------------------------------------------------------------ planting */
export interface Vegetation { near: THREE.Group; far: THREE.Group; /** the ground cover in the beds */ cover: THREE.Object3D | null }
export function plantVegetation(tier: Tier, inside: (x: number, z: number) => boolean, rand: () => number, tree: GLTF | null, street: Street, wind?: { uTime: { value: number }; uWind: { value: number } }, _props?: Props): Vegetation {
  const R = (a: number, b: number) => a + rand() * (b - a);
  const near = new THREE.Group(); near.name = 'trees'; const far = new THREE.Group(); far.name = 'oasis';
  const high = tier === 'high', shadows = high;
  const boot = bootTextures();
  const barkMat = new THREE.MeshStandardMaterial({ ...boot, vertexColors: true, roughness: 0.96, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.8 });
  const frondMat = foliage(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.58, metalness: 0, envMapIntensity: 0.9 }), { trans: 0.4 });
  // the garden's uplights, just come on at sunset: two in-ground fixtures before the palm at the villa's front, one before the
  // young palm by the garage (both behind our front wall, so only their light shows); the same beams on trunk and crown
  const UP: [number, number, number, number][] = [[-5.55, 0.04, 5.95, 50], [-4.5, 0.04, 5.95, 50], [12.75, 0.04, 5.95, 30]];
  if (tier !== 'off') {
    uplit(barkMat, UP); uplit(frondMat, UP);
    // the fixtures themselves, set in the soil: a dark bronze can with its warm lens (seen only from inside the garden)
    const can = new THREE.CylinderGeometry(0.06, 0.055, 0.07, 20), lens = new THREE.CircleGeometry(0.042, 20).rotateX(-Math.PI / 2);
    const canMat = new THREE.MeshStandardMaterial({ color: '#3a2c20', metalness: 0.8, roughness: 0.45 }), lensMat = new THREE.MeshStandardMaterial({ color: '#2a1a0c', emissive: '#ffc078', emissiveIntensity: 4, roughness: 0.3 });
    for (const [x, , z] of UP) { const c = new THREE.Mesh(can, canMat); c.position.set(x, 0.0, z); const l = new THREE.Mesh(lens, lensMat); l.position.set(x, 0.036, z); near.add(c, l); }
  }
  const sway = <T extends THREE.Mesh>(m: T, o: Parameters<typeof windify>[3]) => { if (wind) windify(m, wind.uTime, wind.uWind, o); return m; };
  const cp = street.compound, [gapW, gapE] = street.gaps;
  const record = new URLSearchParams(location.search).has('record');

  /* ---- date palms: six characters; the first is the one that stands before the villa ---- */
  const KITS: PalmSpec[] = [
    { h: 8.6, lean: 0.55, fronds: 118, len: [3.3, 4.1], droop: 1.0, girth: 1.0, dry: 2, dates: 5 },   // in its prime
    { h: 6.5, lean: -0.4, fronds: 104, len: [3.0, 3.8], droop: 1.2, girth: 1.0, dry: 5, dates: 4 },   // middle-aged, heavy crown
    { h: 3.6, lean: 0.12, fronds: 90, len: [2.8, 3.5], droop: 0.95, girth: 1.12, dry: 1, dates: 2 },  // young: a short trunk under a full crown that reaches down
    { h: 10.4, lean: 1.0, fronds: 84, len: [2.8, 3.5], droop: 1.35, girth: 0.9, dry: 7, dates: 3 },  // old: tall, thin, a skirt of dead fronds
    { h: 7.6, lean: -0.95, fronds: 108, len: [3.1, 3.9], droop: 1.1, girth: 0.95, dry: 2, dates: 5 }, // leaning out of a wind
    { h: 5.4, lean: 0.3, fronds: 96, len: [2.9, 3.6], droop: 1.0, girth: 1.05, dry: 2, dates: 0 },   // a male palm: no fruit
  ];
  const nKits = high ? 6 : 3, kitCache = new Map<string, Kit>();
  const kitFor = (v: number, lod: PalmLod, name: string) => { const key = `${v}-${name}`; if (!kitCache.has(key)) kitCache.set(key, datePalm(71 + v * 17, KITS[v], lod)); return kitCache.get(key)!; };
  // x, z, character, size: ours; the open plots; the neighbours' gardens; the back lane; off-frame by the street (their shadows rake the road).
  // The hero's headline sits over its upper-left third (upper-right in Arabic): there only young palms, low enough that their
  // crowns stay under it ((height − 3.6 m) / depth < 0.09); the tall ones stand behind the villa's shoulders, where their
  // crowns layer over its roofline, and the one before the villa leans toward it (its instance turn below)
  const palmSpots: [number, number, number, number?][] = [
    [-5.0, 5.4, 0, 1.0], [-5.0, -8.9, 1], [8.7, -8.8, 4], [12.7, -6.0, 2], [12.75, 5.3, 2, 0.9], [-1.5, -13.5, 3],
    [gapW.x0 + 2.2, -7.6, 2, 0.9], [gapE.x0 + 2.5, -8.8, 1], [gapE.x1 - 1.8, 1.6, 2],
    [cp.x0 - 11.2, 3.6, 4], [cp.x0 - 28.5, 3.2, 1], [cp.x1 + 12, 3.8, 0, 0.92], [cp.x1 + 28.8, 2.8, 3], [cp.x0 - 45, 2.5, 2], [cp.x1 + 50, 3, 5],
    [-27.5, -21.4, 1], [-3.8, -21.2, 4], [4.5, -21.3, 2], [34, -21.4, 2], [47.5, -21.2, 5], [-16, -16.5, 2, 0.8], [10.5, -17.5, 0], [23, -18.5, 4], [-40, -18, 3],
    [-30, 20.2, 3], [-19.5, 19.8, 0], [37, 20.4, 1], [58, 20, 4],
  ];
  // level of detail by distance from the hero's lens (the tour only comes closer to the ones by the gate): every leaflet near, a lighter crown further out
  const nearR = record ? 46 : high ? 32 : 0, cam = [-7.5, 22];
  for (let v = 0; v < nKits; v++) {
    const mine = palmSpots.filter((s) => s[2] % nKits === v).filter((s) => s === palmSpots[0] || !inside(s[0], s[1])).slice(0, high ? 99 : 4);
    const groups: [PalmLod, string, typeof mine][] = [[LOD.near, 'near', mine.filter((s) => Math.hypot(s[0] - cam[0], s[1] - cam[1]) < nearR)], [high ? LOD.mid : LOD.low, high ? 'mid' : 'low', mine.filter((s) => Math.hypot(s[0] - cam[0], s[1] - cam[1]) >= nearR)]];
    for (const [lod, name, list] of groups) {
      if (!list.length) continue;
      const spots: Spot[] = list.map((s) => ({ p: [s[0], -0.05, s[1]] as V3, s: s[3] ?? R(0.9, 1.1), ry: s === palmSpots[0] ? -1.0 : R(0, Math.PI * 2) })); // −1.0: this kit's lean points +x and a little away, toward the villa
      const kit = kitFor(v, lod, name);
      const leaves = instance(kit.leaf, frondMat, spots, shadows), wood = instance(kit.wood, barkMat, spots, shadows);
      // the trunk bends downwind from the ground up; the crown rides on its top and every frond bends and bobs about its own root
      const trunk = { base: 0, height: 8.5, amp: 0.16 }; sway(leaves, { ...trunk, flutter: 0.04, fronds: 0.2 }); sway(wood, { ...trunk, flutter: 0 });
      near.add(wood, leaves);
    }
  }

  /* ---- sidr-like broadleaf trees (photoscan) in the gardens and at the back of the open plots; skipped when the model is missing ---- */
  if (tree) {
    const spotsTree: [number, number][] = [[gapW.x0 + 4.6, -6.0], [-5.65, -2.4], [13.0, -2.2], [cp.x0 - 17.5, 3.8], [cp.x1 + 17, 3.6], [gapE.x0 + 5.2, -3.4], [-20, -20.8], [16, -21], [40, -20.6], [-4, -15.5], [cp.x0 - 38, 3], [cp.x1 + 40, 3.4], [-36, 19.8], [26, 20]];
    const list: Spot[] = spotsTree.slice(0, high ? 99 : 4).filter(([x, z]) => !inside(x, z)).map(([x, z]) => ({ p: [x, -0.05, z] as V3, s: R(0.85, 1.2), ry: R(0, Math.PI * 2) }));
    const grp = instanceGltf(tree, list, shadows);
    // the whole tree bends (the photoscan's leaves are opaque cards, so no alphaTest to key on): heights are world metres above each tree's base
    grp.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) sway(m, { base: 0.9, height: 3.8, amp: 0.13, flutter: 0.3 }); });
    near.add(grp);
  }

  /* ---- bougainvillea over the walls ---- */
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.7, map: leafCard(), alphaTest: 0.5, alphaToCoverage: true }); // leaf-shaped cards (clones share the texture)
  const bougMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.66, envMapIntensity: 0.7, map: foliageAtlas(), alphaTest: 0.45, alphaToCoverage: true });
  const ours = street.spills.filter((s) => s.mine), theirs = street.spills.filter((s) => !s.mine);
  const dens = high ? 1 : 0.4;
  for (const [runs, seed, bracts] of [[ours, 31, ['#c2185b', '#d6337f', '#a8155a', '#e0508f']], [theirs, 47, ['#d9556b', '#e77a62', '#c93f6a', '#f09a7a']]] as const) {
    const g = spill(seed, [...runs], seed === 31 ? dens : dens * 0.6, [...bracts]); if (!g) continue; // (the neighbours' are 20 m off: lighter)
    const m = new THREE.Mesh(g, foliage(bougMat.clone(), { trans: 0.55, tint: '#ffd0c8' })); m.castShadow = shadows; m.receiveShadow = true; m.frustumCulled = false; m.name = 'bougainvillea';
    near.add(sway(m, { base: 0.4, height: 2.6, amp: 0.05, flutter: 1.4 })); // the sprays shiver more than they lean
  }

  /* ---- behind our wall: dense shrubs that show over it, a frangipani by the gate ---- */
  const shrubMat = foliage(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72, envMapIntensity: 0.7, map: foliageAtlas(), alphaTest: 0.45, alphaToCoverage: true }), { trans: 0.3 }); // its own material: wind options are per material (first patch wins)
  const ballMat = leafMat.clone();
  const dark = ['#2f4a27', '#3a5a2c', '#466a33', '#2a4424'];
  // conocarpus and ficus behind the wall: free-grown, branchy, heads of leaves with gaps between them
  const big = [shrub(13, 1.0, 2.2, high ? 9000 : 3000, ['#3d5a2c', '#4a6a33', '#557739', '#35502a'], { leaf: 1.1, stems: 12, heads: 2 }), shrub(14, 0.85, 1.8, high ? 7000 : 2500, ['#4f6338', '#5b7040', '#687c48', '#465a34'], { leaf: 1, stems: 10, heads: 2 })];
  const spotsBig: [number, number][] = [[-4.3, 5.55], [-6.0, 4.2], [-5.9, 1.2], [-5.85, -3.9], [3.9, 5.6], [5.6, 5.5], [7.3, 5.55], [-5.8, -6.8], [12.9, 1.8]];
  big.forEach((g, v) => { const sp = spotsBig.filter((_, i) => i % 2 === v).map(([x, z]) => ({ p: [x + R(-0.15, 0.15), -0.02, z + R(-0.1, 0.1)] as V3, s: R(0.85, 1.15), ry: R(0, Math.PI * 2) })); near.add(sway(instance(g, shrubMat, sp, shadows), { base: 0.3, height: 2.1, amp: 0.07, flutter: 0.6 })); });
  const fr = frangipani(5, 3.5), frMat = foliage(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, envMapIntensity: 0.8 }), { trans: 0.35 }), frWood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const frSpots: Spot[] = [{ p: [2.55, -0.02, 5.45], s: 1, ry: 0.4 }, ...(high ? [{ p: [gapE.x1 + 6.2, -0.02, 4.4] as V3, s: 0.9, ry: 2.1 }] : [])];
  near.add(sway(instance(fr.wood, frWood, frSpots, shadows), { base: 0.8, height: 3.5, amp: 0.03, flutter: 0 }), sway(instance(fr.leaf, frMat, frSpots, shadows), { base: 0.8, height: 3.5, amp: 0.03, flutter: 1.2 }));

  /* ---- the beds at the wall's foot: ground cover in drifts, agaves, clipped balls ---- */
  const cover = new THREE.Group(); cover.name = 'cover';
  const mats = [bush(21, 0.55, 0.22, high ? 1500 : 500, false, ['#4f7036', '#5d8040', '#6b8e48', '#42602f'], { size: 0.8, aspect: 0.7 }), bush(22, 0.5, 0.3, high ? 1500 : 500, true, ['#55683f', '#627648', '#6f8450', '#4a5c38'], { size: 0.7, aspect: 0.6 })];
  const coverMat = leafMat.clone();
  const lay: Spot[][] = [[], []], agaves: Spot[] = [], balls: Spot[] = [];
  street.beds.forEach((b, bi) => { // the street side: a rhythm of agaves, drifts of cover between them
    const zc = (b.z0 + b.z1) / 2 - 0.03; let k = 0;
    for (let x = b.x0 + 0.45; x < b.x1 - 0.3; x += R(0.5, 0.75), k++) {
      if ((k + bi) % 4 === 1) agaves.push({ p: [x, 0, zc + R(-0.05, 0.05)], s: R(0.8, 1.1), ry: R(0, 6.28) });
      else lay[k % 2].push({ p: [x, -0.01, zc + R(-0.08, 0.08)], s: R(0.55, 0.8), ry: R(0, 6.28) });
    }
  });
  // inside the wall: cover under the shrubs along the front and west beds, clipped balls flanking the path
  const [drive, path] = street.drives;
  for (let x = cp.x0 + 0.7; x < cp.x1 - 0.6; x += R(0.55, 0.85)) { if ((x > path.x0 - 0.7 && x < path.x1 + 0.7) || (x > drive.x0 - 0.6 && x < drive.x1 + 0.6)) continue; lay[Math.floor(rand() * 2)].push({ p: [x, -0.01, cp.z1 - R(0.55, 1.25)], s: R(0.8, 1.2), ry: R(0, 6.28) }); }
  for (let z = cp.z0 + 1; z < cp.z1 - 0.6; z += R(0.6, 0.9)) lay[Math.floor(rand() * 2)].push({ p: [cp.x0 + R(0.5, 1.2), -0.01, z], s: R(0.8, 1.2), ry: R(0, 6.28) });
  for (const x of [path.x0 - 0.55, path.x1 + 0.55]) for (const z of [cp.z1 - 0.75, cp.z1 - 1.75]) balls.push({ p: [x, -0.02, z], s: 1, ry: R(0, 6.28) });
  mats.forEach((g, i) => { if (lay[i].length) cover.add(sway(instance(g, coverMat, lay[i], false), { base: 0.05, height: 0.4, amp: 0.015, flutter: 0.8 })); });
  if (agaves.length) cover.add(instance(agave(9, high ? 30 : 18), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, envMapIntensity: 0.9 }), agaves, shadows));
  near.add(sway(instance(bush(15, 0.36, 0.72, high ? 6500 : 1800, false, dark, { size: 0.5, aspect: 0.7 }), ballMat, balls, shadows), { base: 0.1, height: 0.7, amp: 0.012, flutter: 0.7 }));
  near.add(cover);

  /* ---- the oasis: palm groves 70–160 m out (fog does the aerial perspective), never on a road or in a house ---- */
  const farKit = [datePalm(301, { ...KITS[0], dates: 0 }, high ? LOD.far : LOD.farLow), datePalm(317, { ...KITS[1], dates: 0 }, high ? LOD.far : LOD.farLow)]; // few, broad leaflets: at 70–160 m a crown is a texture, not a comb
  const spots: Spot[][] = [[], []];
  const groves = high ? 14 : 8;
  for (let g = 0; g < groves; g++) {
    const a = R(0, Math.PI * 2), dist = R(70, 160); const cx = Math.cos(a) * dist + 4, cz = Math.sin(a) * dist;
    const k = Math.round(R(5, 12));
    for (let i = 0; i < k; i++) { const x = cx + R(-9, 9), z = cz + R(-9, 9); if (!inside(x, z)) spots[i % 2].push({ p: [x, -0.05, z], s: R(0.9, 1.3), ry: R(0, Math.PI * 2) }); }
  }
  farKit.forEach((kit, i) => { if (spots[i].length) far.add(instance(kit.wood, barkMat, spots[i], false), instance(kit.leaf, frondMat, spots[i], false)); }); // frondMat is already wind-patched: the oasis sways too
  return { near, far, cover };
}
