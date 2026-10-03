/**
 * Doors built in code: the front door (a smoked-oak pivot leaf with the smart lock riding on it) and the steel garden gate.
 * Local frame: origin = threshold centre on the facade plane, +Z outside.
 *
 * The front door (house.json `door.type`):
 *  - 'hinged' (2 Oct 2026, the client found the pivot's swing weird): a leaf hinged on a bronze post beside a fixed panel of the same
 *    oak. The opening in the shell is 1.1 m wide but the hall behind it begins at x −0.25 (its west wall and the walnut casing: clear
 *    opening x −0.222 … 0.606), so the first 30 cm are the fixed panel, and the leaf (0.76 m) swings in to lie flat along that wall,
 *    1.5 cm clear of the casing, as a front door does. It closes against stops on the porch side of the post, the jamb and the head.
 *    It moves like a heavy leaf (`SWING`): pushed off gently and settling slowly when it opens; on its closer when it shuts, a steady
 *    sweep, the slow last degrees, a hair of give against the seal, then the bolts.
 *  - 'pivot' (the default, kept to compare): the whole 1.1 m leaf turns about an axis 0.395 m in from its hinge-side edge, the lock
 *    side swinging in and the short side out onto the porch; it stays 4 cm clear of the casing and opens no further than square to
 *    the wall. Its frame is rebated to match: the stop behind the leaf on the pivot side, in front of it on the lock side.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';
import { microNormal } from '../procedural/kit';
import type { DoorConfig } from './types';

export interface Door {
  group: THREE.Group; leaves: THREE.Group[]; lockMount: THREE.Object3D; open: number;
  setOpen(t: number): void; /** the hinged door: 0 = bolts drawn (the lock's light green), 1 = thrown */ setLock(v: number): void;
  animate(open: boolean, duration?: number): Promise<void>; dispose(): void;
}

const tl = new THREE.TextureLoader();
function tex(url: string, repeat: [number, number], srgb = false) { const t = tl.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
/** Veneer scans have horizontal grain; turn them so it runs up the door (UVs are metres, repeat = tiles per metre). */
const grain = (url: string, perMetre: number, srgb = false) => { const t = tex(url, [perMetre, perMetre], srgb); t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; return t; };
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const rbox = (w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).translate(x, y, z);

/** Extrusion UVs in metres: faces by x, y; the edges by (x + z, y), so a vertical edge carries the grain upright and the top and
 *  bottom edges show it end-on (the lipping's end grain) */
const METRES = {
  generateTopUV: (_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) => [a, b, c].map((i) => new THREE.Vector2(v[i * 3], v[i * 3 + 1])),
  generateSideWallUV: (_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) => [a, b, c, d].map((i) => new THREE.Vector2(v[i * 3] + v[i * 3 + 2], v[i * 3 + 1])),
};
/** A slab w × (y0…y1) × t, centred on z = 0, every edge eased with radius r (the leaf's edge profile). */
function easedSlab(w: number, y0: number, y1: number, t: number, r: number) {
  const s = new THREE.Shape(); s.moveTo(-w / 2 + r, y0 + r); s.lineTo(w / 2 - r, y0 + r); s.lineTo(w / 2 - r, y1 - r); s.lineTo(-w / 2 + r, y1 - r); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: t - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, UVGenerator: METRES as unknown as NonNullable<THREE.ExtrudeGeometryOptions['UVGenerator']> }).translate(0, 0, -(t - r * 2) / 2);
}

const PIVOT = 0.395;                 // the pivot door's axis, in from its hinge-side edge (m)
const INLAYS = [-0.275, 0, 0.275];   // brushed-brass inlays across the pivot leaf (from its centre): four equal bays, the lock centred in the last
const INLAY = 0.004;                 // 4 mm wide, as the brass in the hall's stone wall
const SIDE = 0.3, POST = 0.04;       // the hinged door: the fixed panel beside the leaf, and the post between them that carries the hinges
const INLAYS_H = [-0.127, 0.124];    // … its leaf's inlays: three bays of a quarter metre, the lock centred in the last
const UNLATCH = 0.25, THROW = 0.2;   // seconds the bolts take to draw back before the leaf moves, and to throw once it has landed

/** A curve through knots [u, value, slope in, slope out] (cubic Hermite, u rising): the leaf's travel against its time. */
function hermite(knots: [number, number, number, number][]) {
  return (u: number) => {
    if (u <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i]; if (u > b[0]) continue;
      const d = b[0] - a[0], t = (u - a[0]) / d, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * d * a[3] + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * d * b[2];
    }
    return knots[knots.length - 1][1];
  };
}
/** How a heavy hinged leaf moves (how far open, 0 … 1, at fraction u of its time). */
const SWING = {
  // opening: pushed off gently, carried by its own weight, a long settle onto the stay
  open: (u: number) => 1 - Math.pow(1 - Math.pow(u, 1.6), 2.4),
  // closing on its closer: off the stay, a steady sweep down to the last 7°, the slow latch speed, the landing on the seal with a
  // hair of give (a quarter of a degree back), and rest. Every span is monotone (slopes under three times its mean), so the leaf
  // never passes its stop
  close: hermite([[0, 1, 0, 0], [0.6, 0.08, -0.62, -0.62], [0.88, 0, -0.12, 0.09], [0.93, 0.0026, 0, 0], [1, 0, -0.02, 0]]),
};

export function createDoor(cfg: DoorConfig, opts: { leaves?: 1 | 2; reveal?: number; shadows?: boolean; head?: boolean } = {}): Door {
  const { width: w, height: h, thickness: t } = cfg; const leavesN = opts.leaves ?? 1; const reveal = opts.reveal ?? 0; const shadows = opts.shadows ?? true; const head = opts.head ?? true;
  const group = new THREE.Group(); group.name = `door_${cfg.style}`; group.position.set(...cfg.pos); group.rotation.y = cfg.yaw;
  const steel = cfg.style === 'steel', hinged = !steel && leavesN === 1 && cfg.type === 'hinged', pivot = !steel && leavesN === 1 && !hinged;

  // satin dark-bronze anodised aluminium (albedo ≈ 0.04): the frame reads as metal by what it reflects, never as a black hole
  const bronze = new THREE.MeshPhysicalMaterial({ color: '#463c32', metalness: 1, roughness: 0.35, envMapIntensity: 1.1 });
  // satin brass, isotropic on purpose: an anisotropic (brushed) lobe drew each 4 mm inlay as one unbroken streak of light, an LED
  // strip; its sky reflection held down too, as the porch roof hides most of that sky and the map does not know it
  const brass = new THREE.MeshStandardMaterial({ color: '#b08d5a', metalness: 1, roughness: 0.46, envMapIntensity: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.85, envMapIntensity: 0.3 });
  const stone = new THREE.MeshStandardMaterial({ color: '#d6cebf', roughness: 0.62, normalMap: tex('/textures/house/plaster_nor.webp', [3, 1.5]), normalScale: new THREE.Vector2(0.3, 0.3) }); // honed limestone: one plain slab per tread, no tile joints
  const plaster = new THREE.MeshStandardMaterial({ color: '#e6e1d8', roughness: 0.9, normalMap: tex('/textures/house/plaster_nor.webp', [2, 2]), normalScale: new THREE.Vector2(0.4, 0.4) });
  // the hall's smoked oak (the same quarter-cut veneer as the casings inside, 1 m per tile): fine straight grain, low contrast,
  // under a satin lacquer that takes a soft sheen of the sky
  const veneer = new THREE.MeshPhysicalMaterial({ color: '#b39a80', roughness: 0.82, map: grain('/textures/interior/smoked_diff.webp', 1, true), normalMap: grain('/textures/interior/smoked_nor.webp', 1), normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: grain('/textures/interior/smoked_rough.webp', 1), clearcoat: 0.3, clearcoatRoughness: 0.42, envMapIntensity: 0.8 });
  // the gate: powder-coated steel, a dark bronze with the coat's fine orange peel
  const powder = new THREE.MeshPhysicalMaterial({ color: '#2e2a26', metalness: 0.3, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45, normalMap: microNormal(), normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.9 });
  // what stands in the door's own shadow under the porch (the post, the stops, the sill): the sky map knows nothing of the soffit over
  // them, and mirrored in satin metal it drew a blue line down every joint
  const bronzeIn = new THREE.MeshStandardMaterial({ color: '#16130f', metalness: 0.3, roughness: 0.7, envMapIntensity: 0.08 }); // (and the sky's cool fill on a face turned west did the same: these read as the joint's shadow)
  const steelSatin = new THREE.MeshStandardMaterial({ color: '#4a443d', metalness: 1, roughness: 0.4, envMapIntensity: 0.45 }); // the lock case's faceplate and its strike: dark bronze plate, as the lock is black
  const mats: THREE.Material[] = [bronze, brass, rubber, stone, plaster, veneer, powder, bronzeIn, steelSatin];
  const frameMat = steel ? powder : bronze;

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadows; m.receiveShadow = true; parent.add(m); return m; };

  // frame: jambs full height, the head between them (butt-jointed: no two faces share a plane), every edge eased
  const j = 0.07, fd = Math.max(t + 0.06, 0.12), jh = h + (head ? j : 0);
  add(mergeGeometries([rbox(j, jh, fd, 0.004, -(w / 2 + j / 2), jh / 2), rbox(j, jh, fd, 0.004, w / 2 + j / 2, jh / 2), ...(head ? [rbox(w, j, fd, 0.004, 0, h + j / 2)] : [])])!, frameMat);
  if (pivot) {
    // the rebate: a stop on each jamb where the leaf closes against it, a black seal on its face; the head carries the seal alone
    const sw = 0.014, sd = 0.025, sgn = cfg.hinge === 'left' ? 1 : -1, zb = -(t / 2 + 0.004 + sd / 2), zf = t / 2 + 0.004 + sd / 2;
    add(mergeGeometries([rbox(sw, h, sd, 0.002, sgn * (-w / 2 + sw / 2), h / 2, zb), rbox(sw, h, sd, 0.002, sgn * (w / 2 - sw / 2), h / 2, zf)])!, bronze);
    add(mergeGeometries([box(sw * 0.7, h - 0.004, 0.004, sgn * (-w / 2 + sw * 0.4), h / 2, -(t / 2 + 0.002)), box(sw * 0.7, h - 0.004, 0.004, sgn * (w / 2 - sw * 0.4), h / 2, t / 2 + 0.002), box(w, 0.0026, t * 0.8, 0, h - 0.0013, 0)])!, rubber);
    // the threshold: a bronze sill the leaf clears by 3 mm, the floor pivot's cover plate on it and the top pivot in the head
    const px = sgn * (-w / 2 + PIVOT);
    add(mergeGeometries([rbox(w + j * 2, 0.012, fd, 0.002, 0, 0.006, 0), rbox(0.032, 0.002, 0.07, 0.0008, px, 0.013, 0), rbox(0.032, 0.0028, 0.052, 0.0008, px, h - 0.0016, 0)])!, bronze);
  }
  if (hinged) {
    const sgn = cfg.hinge === 'left' ? 1 : -1, xl = -w / 2 + SIDE + POST; // where the leaf begins (for a left hinge; `sgn` mirrors it)
    // the post between the fixed panel and the leaf, and the panel: the leaf's own oak, flush with it, a 3 mm joint all round
    add(rbox(POST, h, fd, 0.004, sgn * (xl - POST / 2), h / 2), bronzeIn);
    add(easedSlab(SIDE - 0.006, 0.015, h - 0.003, t, 0.003).translate(sgn * (-w / 2 + SIDE / 2), 0, 0), veneer).name = 'side_panel';
    // the rebate: the leaf swings in, so it closes against stops on the porch side (post, strike jamb, head), a black seal on each
    const sw = 0.013, sd = 0.022, zf = t / 2 + 0.004 + sd / 2, lw = w / 2 - xl;
    add(mergeGeometries([rbox(sw, h, sd, 0.002, sgn * (xl + sw / 2), h / 2, zf), rbox(sw, h, sd, 0.002, sgn * (w / 2 - sw / 2), h / 2, zf), rbox(lw - sw * 2, sw, sd, 0.002, sgn * (xl + lw / 2), h - sw / 2, zf)])!, bronzeIn);
    add(mergeGeometries([box(sw * 0.7, h - 0.004, 0.004, sgn * (xl + sw * 0.45), h / 2, t / 2 + 0.002), box(sw * 0.7, h - 0.004, 0.004, sgn * (w / 2 - sw * 0.45), h / 2, t / 2 + 0.002), box(lw - sw * 2, sw * 0.7, 0.004, sgn * (xl + lw / 2), h - sw * 0.45, t / 2 + 0.002)])!, rubber);
    // the threshold (the leaf clears it by 3 mm), the three hinges' knuckles on the hall side of the post, the strike plate in the jamb
    const parts: THREE.BufferGeometry[] = [rbox(w + j * 2, 0.012, fd, 0.002, 0, 0.006, 0)];
    for (const y of [0.24, 1.05, 1.86]) parts.push(new THREE.CylinderGeometry(0.0075, 0.0075, 0.11, 16).translate(sgn * (xl + 0.003), y, -t / 2 - 0.0015));
    add(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!, bronzeIn);
    add(box(0.0016, 0.24, 0.026, sgn * (w / 2 - 0.0008), 1.07, -0.002), steelSatin);
    add(mergeGeometries([box(0.0006, 0.03, 0.013, sgn * (w / 2 - 0.0019), 1.05, -0.002), box(0.0006, 0.05, 0.015, sgn * (w / 2 - 0.0019), 1.13, -0.002)])!, rubber); // the latch's and the bolt's holes
  }
  if (reveal > 0) {
    const rw = w + j * 2 + 0.02, rh = h + j + 0.01;
    add(mergeGeometries([box(0.02, rh, reveal, -rw / 2 - 0.01, rh / 2, -reveal / 2), box(0.02, rh, reveal, rw / 2 + 0.01, rh / 2, -reveal / 2), box(rw + 0.04, 0.02, reveal, 0, rh + 0.01, -reveal / 2)])!, plaster);
    add(box(rw + 0.3, 0.02, reveal + fd, 0, -0.01, -reveal / 2 + fd / 2), stone); // threshold
  }
  // steps down to the garden when the floor is raised
  if (cfg.steps && cfg.pos[1] > 0.05) {
    const n = cfg.steps, rise = cfg.pos[1] / n, tread = 0.32; const steps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n - 1; i++) { const top = -rise * (i + 1), hgt = cfg.pos[1] + top; steps.push(box(w + 0.9 + i * 0.12, hgt, tread, 0, top - hgt / 2, fd / 2 + tread / 2 + i * tread)); }
    if (steps.length) add(mergeGeometries(steps)!, stone);
  }

  // leaves
  const leaves: THREE.Group[] = []; let lockMount = new THREE.Object3D(); const bolts: { m: THREE.Mesh; x: number; reach: number }[] = [];
  const leafW = hinged ? w - SIDE - POST : (w - (leavesN - 1) * 0.01) / leavesN;
  for (let i = 0; i < leavesN; i++) {
    const hingeLeft = leavesN === 2 ? i === 0 : cfg.hinge === 'left', sgn = hingeLeft ? 1 : -1;
    const off = pivot ? PIVOT : 0; // the axis, in from the hinge-side edge
    const hinge = new THREE.Group(), leaf = new THREE.Group(); group.add(hinge); hinge.add(leaf);
    if (hinged) { hinge.position.set(sgn * (-w / 2 + SIDE + POST + 0.003), 0, -t / 2); leaf.position.set(sgn * (leafW / 2 - 0.003), 0, t / 2); } // the knuckle's pin: on the leaf's hall-side arris
    else { hinge.position.set(hingeLeft ? -w / 2 + off : w / 2 - off, 0, 0); leaf.position.x = hingeLeft ? leafW / 2 - off : -(leafW / 2 - off); }
    (hinge as THREE.Group & { sign: number }).userData.sign = sgn;
    if (!steel) {
      const core = add(easedSlab(leafW - 0.006, 0.015, h - 0.003, t, 0.003), veneer, leaf); core.name = 'leaf_core';
      // brass inlays let into both faces, flush but for a hair: they catch the light as lines, never as bars
      const inl: THREE.BufferGeometry[] = []; for (const x of hinged ? INLAYS_H.map((v) => v * sgn) : INLAYS) for (const s of [-1, 1]) inl.push(box(INLAY, h - 0.02, 0.0012, x, 0.015 + (h - 0.02) / 2, s * (t / 2 - 0.0003)));
      add(mergeGeometries(inl)!, brass, leaf);
      // the lock rides on the strike side, outside face
      const mx = hingeLeft ? leafW / 2 - 0.13 : -leafW / 2 + 0.13;
      lockMount = new THREE.Object3D(); lockMount.position.set(mx, 1.05, t / 2 + 0.001); leaf.add(lockMount);
      if (hinged) {
        // the lock case in the leaf's strike edge: a satin faceplate, the sprung latch, and two deadbolts that throw once it is shut
        const ex = sgn * ((leafW - 0.006) / 2);
        add(box(0.0016, 0.26, 0.026, ex + sgn * 0.0003, 1.07, -0.002), steelSatin, leaf);
        const bolt = (y: number, hh: number, d: number, out: number, reach: number) => { const m = add(box(0.03, hh, d, 0, y, -0.002), steelSatin, leaf); m.castShadow = false; bolts.push({ m, x: ex - sgn * (0.015 - out), reach: sgn * reach }); };
        bolt(1.05, 0.026, 0.012, 0.008, 0); bolt(1.13, 0.044, 0.014, 0, 0.018); bolt(1.0, 0.044, 0.014, 0, 0.018);
      }
    } else {
      // the gate leaf: a welded box-section frame round vertical flats with open slits between them (it reads as solid face-on and
      // lets the garden through at an angle), a flat-bar pull on the meeting edge
      const fw = 0.05, y0 = 0.04, y1 = h - 0.01, iw = leafW - fw * 2, sw = 0.062, gap = 0.014, n = Math.max(1, Math.floor((iw + gap) / (sw + gap))), used = n * sw + (n - 1) * gap;
      const parts: THREE.BufferGeometry[] = [
        rbox(fw, y1 - y0, t, 0.004, -leafW / 2 + fw / 2, (y0 + y1) / 2), rbox(fw, y1 - y0, t, 0.004, leafW / 2 - fw / 2, (y0 + y1) / 2),
        rbox(iw, fw, t, 0.004, 0, y1 - fw / 2), rbox(iw, fw, t, 0.004, 0, y0 + fw / 2), rbox(iw, 0.03, t * 0.8, 0.004, 0, (y0 + y1) / 2 - 0.1),
      ];
      for (let k = 0; k < n; k++) parts.push(rbox(sw, y1 - y0 - fw * 2, 0.012, 0.002, -used / 2 + sw / 2 + k * (sw + gap), (y0 + y1) / 2, 0));
      const core = add(mergeGeometries(parts)!, powder, leaf); core.name = 'leaf_core';
      const ex = hingeLeft ? leafW / 2 - fw - 0.03 : -leafW / 2 + fw + 0.03;
      add(mergeGeometries([rbox(0.012, 0.34, 0.03, 0.003, ex, 1.0, t / 2 + 0.035), rbox(0.012, 0.03, 0.035, 0.003, ex, 0.86, t / 2 + 0.0175), rbox(0.012, 0.03, 0.035, 0.003, ex, 1.14, t / 2 + 0.0175)])!, bronze, leaf);
    }
    leaves.push(hinge);
  }
  // the front door opens square to the wall at most (see the header); the gate as far as house.json asks
  const reach = pivot || hinged ? Math.min(cfg.openAngle, Math.PI / 2) : cfg.openAngle;
  const state = { open: cfg.open ?? 0, lock: (cfg.open ?? 0) > 0 ? 0 : 1 };
  const setOpen = (v: number) => { state.open = v; for (const hg of leaves) hg.rotation.y = (hg.userData.sign as number) * v * reach; };
  // the bolts, and the lock's own light with them: its resting blue when locked, green while the door is free
  const LOCKED = new THREE.Color('#4aa8ff'), FREE = new THREE.Color('#46d17a');
  const setLock = (v: number) => {
    state.lock = v; for (const b of bolts) b.m.position.x = b.x + b.reach * v;
    const led = lockMount.getObjectByName('led_0') as THREE.Mesh | undefined, mt = led?.material as THREE.MeshStandardMaterial | undefined;
    if (mt?.emissive) mt.emissive.copy(FREE).lerp(LOCKED, v);
  };
  setOpen(state.open); setLock(state.lock);
  const door: Door = {
    group, leaves, lockMount, get open() { return state.open; },
    setOpen: (v) => { setOpen(v); setLock(v > 0 ? 0 : 1); }, setLock,
    animate(open, duration = hinged ? (open ? 2.15 : 2.4) : open ? 1.6 : 1.4) {
      if (!hinged) return new Promise<void>((res) => { gsap.to(state, { open: open ? 1 : 0, duration, ease: open ? 'power2.inOut' : 'power3.inOut', onUpdate: () => setOpen(state.open), onComplete: res }); });
      // the hinged leaf: the bolts draw back, then it swings; shut, it lands, then the bolts throw. One clock (GSAP's, stepped by hand
      // when the film is recorded), the curve its own (`SWING`), from wherever the leaf stands now
      return new Promise<void>((res) => {
        const from = state.open, k = { u: 0 }, swing = Math.max(0.2, duration - (open ? UNLATCH : THROW));
        if (open) gsap.to(state, { lock: 0, duration: UNLATCH, ease: 'power1.out', onUpdate: () => setLock(state.lock) });
        gsap.to(k, { u: 1, duration: swing, delay: open ? UNLATCH : 0, ease: 'none', onUpdate: () => setOpen(open ? from + (1 - from) * SWING.open(k.u) : from * Math.max(0, SWING.close(k.u))),
          onComplete: () => { if (open) { res(); return; } gsap.to(state, { lock: 1, duration: THROW, ease: 'power2.in', onUpdate: () => setLock(state.lock), onComplete: res }); } });
      });
    },
    dispose() {
      group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      for (const m of mats) { for (const k of ['map', 'normalMap', 'roughnessMap'] as const) { const tx = (m as THREE.MeshStandardMaterial)[k]; if (tx && tx !== microNormal()) tx.dispose(); } m.dispose(); }
    },
  };
  return door;
}
