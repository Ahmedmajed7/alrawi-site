/**
 * Grey-box villa used while the client's model is being prepared. Metres, Y-up.
 * Front wall on z=0 (interior is z<0), entrance door around x=1.2. Same coordinate frame as house.json.
 */
import * as THREE from 'three';
import type { LoadedHouse } from './types';

const tl = new THREE.TextureLoader();
function pbr(name: string, repeat: number, color = '#ffffff', rough = 1) {
  const load = (suffix: string, srgb = false) => { const t = tl.load(`/textures/${name}_${suffix}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return new THREE.MeshStandardMaterial({ color, map: load('diff', true), normalMap: load('nor'), roughnessMap: load('rough'), roughness: rough, metalness: 0 });
}
const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
};
/** Wall along X (length L, height H) at z, with rectangular openings [{x0,x1,y0,y1}] in wall-local X (0..L). */
function wallX(L: number, H: number, T: number, x0: number, z: number, mat: THREE.Material, openings: { x0: number; x1: number; y0: number; y1: number }[], parent: THREE.Object3D) {
  const cuts = [0, ...openings.flatMap((o) => [o.x0, o.x1]), L];
  for (let i = 0; i < cuts.length - 1; i += 2) { const a = cuts[i], b = cuts[i + 1]; if (b - a > 0.001) box(b - a, H, T, mat, x0 + (a + b) / 2, H / 2, z, parent); }
  for (const o of openings) {
    if (o.y0 > 0) box(o.x1 - o.x0, o.y0, T, mat, x0 + (o.x0 + o.x1) / 2, o.y0 / 2, z, parent);
    if (o.y1 < H) box(o.x1 - o.x0, H - o.y1, T, mat, x0 + (o.x0 + o.x1) / 2, (H + o.y1) / 2, z, parent);
  }
}
function wallZ(L: number, H: number, T: number, x: number, z0: number, mat: THREE.Material, openings: { z0: number; z1: number; y0: number; y1: number }[], parent: THREE.Object3D) {
  const cuts = [0, ...openings.flatMap((o) => [o.z0, o.z1]), L];
  for (let i = 0; i < cuts.length - 1; i += 2) { const a = cuts[i], b = cuts[i + 1]; if (b - a > 0.001) box(T, H, b - a, mat, x, H / 2, z0 - (a + b) / 2, parent); }
  for (const o of openings) {
    if (o.y0 > 0) box(T, o.y0, o.z1 - o.z0, mat, x, o.y0 / 2, z0 - (o.z0 + o.z1) / 2, parent);
    if (o.y1 < H) box(T, H - o.y1, o.z1 - o.z0, mat, x, (H + o.y1) / 2, z0 - (o.z0 + o.z1) / 2, parent);
  }
}

export function buildPlaceholder(): LoadedHouse {
  const root = new THREE.Group(); root.name = 'placeholder-house';
  const plaster = pbr('wall', 2.5, '#efe9df', 0.95);
  const exterior = pbr('exterior', 3, '#d8d2c6', 0.9);
  const floor = pbr('floor', 3, '#c9b08a', 0.8);
  const marble = pbr('marble', 2, '#efece6', 0.35);
  const ground = pbr('exterior', 24, '#b9b2a4', 1);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe3ef', roughness: 0.05, metalness: 0, transmission: 0.9, thickness: 0.02, transparent: true, opacity: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2926', roughness: 0.5, metalness: 0.2 });
  const fabric = new THREE.MeshStandardMaterial({ color: '#b8ad9c', roughness: 1 });
  const H = 2.7, T = 0.25;
  // interior x [-2.5, 4.5], z [-4.5, 0]
  const X0 = -2.5, X1 = 4.5, Z0 = 0, Z1 = -4.5;
  // ground
  const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), ground); g.rotation.x = -Math.PI / 2; g.position.y = -0.001; g.receiveShadow = true; root.add(g);
  // slab + interior floors
  box(X1 - X0 + 0.6, 0.12, Z0 - Z1 + 0.6, exterior, (X0 + X1) / 2, -0.06, (Z0 + Z1) / 2, root);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z0 - Z1), floor); fl.rotation.x = -Math.PI / 2; fl.position.set((X0 + X1) / 2, 0.001, (Z0 + Z1) / 2); fl.receiveShadow = true; root.add(fl);
  const hall = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), marble); hall.rotation.x = -Math.PI / 2; hall.position.set(1.2, 0.002, -0.8); hall.receiveShadow = true; root.add(hall);
  // ceiling
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z0 - Z1), plaster); ce.rotation.x = Math.PI / 2; ce.position.set((X0 + X1) / 2, H, (Z0 + Z1) / 2); ce.receiveShadow = true; root.add(ce);
  // roof slab (flat, modern) + parapet
  box(X1 - X0 + 0.9, 0.3, Z0 - Z1 + 0.9, exterior, (X0 + X1) / 2, H + 0.15, (Z0 + Z1) / 2, root);
  // front wall (z=0): door x[0.75,1.65] h 2.1; window x[2.6,4.0] y[0.9,2.2]
  wallX(X1 - X0, H, T, X0, Z0 - T / 2 + T / 2, plaster, [{ x0: 0.75 - X0, x1: 1.65 - X0, y0: 0, y1: 2.1 }, { x0: 2.6 - X0, x1: 4.0 - X0, y0: 0.9, y1: 2.2 }], root);
  // back wall (z=-4.5): window x[-2.0,0.5] y[0.9,2.3]
  wallX(X1 - X0, H, T, X0, Z1, plaster, [{ x0: -2.0 - X0, x1: 0.5 - X0, y0: 0.9, y1: 2.3 }], root);
  // left wall x=-2.5, right wall x=4.5 (window z[-3.6,-2.4])
  wallZ(Z0 - Z1, H, T, X0, Z0, plaster, [], root);
  wallZ(Z0 - Z1, H, T, X1, Z0, plaster, [{ z0: 2.4, z1: 3.6, y0: 1.0, y1: 2.2 }], root);
  // partition x=2.0 from z=-4.5 to z=-1.5 (kitchen on the right)
  wallZ(3.0, H, 0.15, 2.0, -1.5, plaster, [], root);
  // exterior skin (thin boxes outside the plaster walls) for concrete look
  box(X1 - X0 + 0.5, H, 0.04, exterior, (X0 + X1) / 2, H / 2, Z0 + T / 2 + 0.02, root).name = 'skin-front';
  box(X1 - X0 + 0.5, H, 0.04, exterior, (X0 + X1) / 2, H / 2, Z1 - T / 2 - 0.02, root);
  box(0.04, H, Z0 - Z1 + 0.5, exterior, X0 - T / 2 - 0.02, H / 2, (Z0 + Z1) / 2, root);
  box(0.04, H, Z0 - Z1 + 0.5, exterior, X1 + T / 2 + 0.02, H / 2, (Z0 + Z1) / 2, root);
  // cut the door and window through the front skin: rebuild the skin with openings instead
  root.remove(root.getObjectByName('skin-front')!);
  wallX(X1 - X0 + 0.5, H, 0.04, X0 - 0.25, Z0 + T / 2 + 0.02, exterior, [{ x0: 0.75 - X0 + 0.25, x1: 1.65 - X0 + 0.25, y0: 0, y1: 2.1 }, { x0: 2.6 - X0 + 0.25, x1: 4.0 - X0 + 0.25, y0: 0.9, y1: 2.2 }], root);
  // glass
  for (const [w, h, x, y, z, ry] of [[1.4, 1.3, 3.3, 1.55, 0, 0], [2.5, 1.4, -0.75, 1.6, -4.5, 0], [1.2, 1.2, 4.5, 1.6, -3.0, Math.PI / 2]] as number[][]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); m.position.set(x, y, z); m.rotation.y = ry; root.add(m);
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.06), dark); f.position.set(x, y, z); f.rotation.y = ry; f.castShadow = true; root.add(f);
    f.geometry = new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.06);
  }
  // door with hinge pivot on the left jamb (x=0.75)
  const door = new THREE.Group(); door.name = 'door_main'; door.position.set(0.75, 0, 0.02);
  const leaf = box(0.9, 2.08, 0.05, wood, 0.45, 1.04, 0, door); leaf.castShadow = true;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 12), dark); handle.rotation.x = Math.PI / 2; handle.position.set(0.8, 1.05, 0.06); door.add(handle);
  root.add(door);
  // furniture (readable rooms)
  box(2.2, 0.45, 0.9, fabric, -1.0, 0.225, -2.2, root); box(2.2, 0.5, 0.25, fabric, -1.0, 0.7, -2.55, root); // sofa
  box(0.9, 0.05, 0.5, wood, -1.0, 0.4, -1.2, root); for (const [x, z] of [[-1.4, -1.0], [-0.6, -1.0], [-1.4, -1.4], [-0.6, -1.4]]) box(0.04, 0.4, 0.04, dark, x, 0.2, z, root); // table
  box(2.4, 0.9, 0.6, plaster, 3.25, 0.45, -4.15, root); box(2.4, 0.05, 0.65, dark, 3.25, 0.925, -4.15, root); // kitchen counter
  box(0.6, 2.0, 0.6, dark, 4.15, 1.0, -1.85, root); // fridge
  box(1.6, 0.06, 0.6, wood, 3.2, 0.75, -2.4, root); // dining
  // path outside
  box(2.2, 0.03, 6, exterior, 1.2, 0.015, 3.2, root);
  // trees (billboard-less, simple)
  for (const [x, z, s] of [[-6, 3, 1.2], [8.5, 2, 1.5], [-5, -7, 1.0]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 2.6 * s, 10), wood); t.position.set(x, 1.3 * s, z); t.castShadow = true; root.add(t); const c = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 20, 14), new THREE.MeshStandardMaterial({ color: '#5f7a4b', roughness: 1 })); c.position.set(x, 3.2 * s, z); c.castShadow = true; root.add(c); }
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const bounds = new THREE.Box3().setFromObject(root);
  return { root, anchors: new Map(), door, bounds: new THREE.Box3(new THREE.Vector3(X0 - 1, 0, Z1 - 1), new THREE.Vector3(X1 + 1, H + 1, Z0 + 1)) || bounds };
}
