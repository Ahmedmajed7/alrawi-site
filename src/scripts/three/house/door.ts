/**
 * Doors built in code: the front door (a smoked-oak pivot leaf with the smart lock riding on it) and the steel garden gate.
 * Local frame: origin = threshold centre on the facade plane, +Z outside.
 *
 * The front door is a pivot door, as large modern entrance doors are: it turns about an axis 0.395 m in from its hinge-side
 * edge, the lock side swinging in and the short side out onto the porch. A leaf hinged at its edge (x −0.55) swept a metre into
 * the hall's west wall (x −0.25) and the walnut casing inside (clear opening x −0.222 … 0.606); about the pivot it stays 4 cm
 * clear of the casing when fully open, and it opens no further than square to the wall (house.json `openAngle` caps it).
 * The frame is rebated to match: the stop stands behind the leaf on the pivot side and in front of it on the lock side.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';
import { microNormal } from '../procedural/kit';
import type { DoorConfig } from './types';

export interface Door {
  group: THREE.Group; leaves: THREE.Group[]; lockMount: THREE.Object3D; open: number;
  setOpen(t: number): void; animate(open: boolean, duration?: number): Promise<void>; dispose(): void;
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

const PIVOT = 0.395;                 // the front door's pivot, in from its hinge-side edge (m)
const INLAYS = [-0.275, 0, 0.275];   // brushed-brass inlays across the leaf (from its centre): four equal bays, the lock centred in the last
const INLAY = 0.004;                 // 4 mm wide, as the brass in the hall's stone wall

export function createDoor(cfg: DoorConfig, opts: { leaves?: 1 | 2; reveal?: number; shadows?: boolean; head?: boolean } = {}): Door {
  const { width: w, height: h, thickness: t } = cfg; const leavesN = opts.leaves ?? 1; const reveal = opts.reveal ?? 0; const shadows = opts.shadows ?? true; const head = opts.head ?? true;
  const group = new THREE.Group(); group.name = `door_${cfg.style}`; group.position.set(...cfg.pos); group.rotation.y = cfg.yaw;
  const steel = cfg.style === 'steel', pivot = !steel && leavesN === 1;

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
  const mats: THREE.Material[] = [bronze, brass, rubber, stone, plaster, veneer, powder];
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
  const leaves: THREE.Group[] = []; let lockMount = new THREE.Object3D();
  const leafW = (w - (leavesN - 1) * 0.01) / leavesN;
  for (let i = 0; i < leavesN; i++) {
    const hingeLeft = leavesN === 2 ? i === 0 : cfg.hinge === 'left';
    const off = pivot ? PIVOT : 0; // the axis, in from the hinge-side edge
    const hinge = new THREE.Group(); hinge.position.set(hingeLeft ? -w / 2 + off : w / 2 - off, 0, 0); group.add(hinge);
    const leaf = new THREE.Group(); leaf.position.x = hingeLeft ? leafW / 2 - off : -(leafW / 2 - off); hinge.add(leaf);
    (hinge as THREE.Group & { sign: number }).userData.sign = hingeLeft ? 1 : -1;
    if (!steel) {
      const core = add(easedSlab(leafW - 0.006, 0.015, h - 0.003, t, 0.003), veneer, leaf); core.name = 'leaf_core';
      // brass inlays let into both faces, flush but for a hair: they catch the light as lines, never as bars
      const inl: THREE.BufferGeometry[] = []; for (const x of INLAYS) for (const s of [-1, 1]) inl.push(box(INLAY, h - 0.02, 0.0012, x, 0.015 + (h - 0.02) / 2, s * (t / 2 - 0.0003)));
      add(mergeGeometries(inl)!, brass, leaf);
      // the lock rides on the strike side, outside face
      const mx = hingeLeft ? leafW / 2 - 0.13 : -leafW / 2 + 0.13;
      lockMount = new THREE.Object3D(); lockMount.position.set(mx, 1.05, t / 2 + 0.001); leaf.add(lockMount);
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
  // the pivot door opens square to the wall at most (see the header); the gate as far as house.json asks
  const reach = pivot ? Math.min(cfg.openAngle, Math.PI / 2) : cfg.openAngle;
  const state = { open: cfg.open ?? 0 };
  const setOpen = (v: number) => { state.open = v; for (const hg of leaves) hg.rotation.y = (hg.userData.sign as number) * v * reach; };
  setOpen(state.open);
  const door: Door = {
    group, leaves, lockMount, get open() { return state.open; },
    setOpen,
    animate(open, duration = open ? 1.6 : 1.4) { return new Promise<void>((res) => { gsap.to(state, { open: open ? 1 : 0, duration, ease: open ? 'power2.inOut' : 'power3.inOut', onUpdate: () => setOpen(state.open), onComplete: res }); }); },
    dispose() {
      group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      for (const m of mats) { for (const k of ['map', 'normalMap', 'roughnessMap'] as const) { const tx = (m as THREE.MeshStandardMaterial)[k]; if (tx && tx !== microNormal()) tx.dispose(); } m.dispose(); }
    },
  };
  return door;
}
