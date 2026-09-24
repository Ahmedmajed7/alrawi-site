/**
 * The client's model arrived with named V-Ray materials but no texture links, so textures are
 * assigned here by material name (textures live in /textures/house/, 2K WebP).
 */
import * as THREE from 'three';

const tl = new THREE.TextureLoader();
const tex = (name: string, srgb = false, repeat = 1) => { const t = tl.load(`/textures/house/${name}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };

type Rule = (old: THREE.MeshStandardMaterial) => THREE.Material;
const std = (o: Partial<THREE.MeshStandardMaterialParameters>) => new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.85, ...o });

const rules: Record<string, Rule> = {
  'concrete dark': () => std({ color: '#8f8b84', map: tex('concrete_diff', true, 2), normalMap: tex('concrete_nor', false, 2), roughness: 0.9 }),
  'white walls dirt': () => std({ color: '#ffffff', map: tex('wallpaint_diff', true, 2), normalMap: tex('plaster_nor', false, 2), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92 }),
  'wall grey': () => std({ color: '#e9e4db', map: tex('wallpaint_diff', true, 2), normalMap: tex('plaster_nor', false, 2), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92 }),
  'tiles dark': () => std({ color: '#5a5651', map: tex('tile_diff', true, 3), normalMap: tex('tile_nor', false, 3), roughnessMap: tex('tile_rough', false, 3), roughness: 0.8 }),
  'interior tile': () => std({ color: '#e9e4dc', map: tex('inttile_diff', true, 3), roughness: 0.35, metalness: 0.05 }),
  gravel: () => std({ color: '#b9b2a6', map: tex('gravel_diff', true, 8), normalMap: tex('gravel_nor', false, 8), roughnessMap: tex('gravel_rough', false, 8), roughness: 1 }),
  solar: () => std({ color: '#ffffff', map: tex('solar_diff', true, 1), normalMap: tex('solar_nor', false, 1), roughnessMap: tex('solar_rough', false, 1), metalness: 0.4, roughness: 0.3 }),
  'glass clear': () => new THREE.MeshPhysicalMaterial({ color: '#dfeaf0', roughness: 0.04, metalness: 0, transmission: 0.92, thickness: 0.05, ior: 1.5, transparent: true, opacity: 0.85, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
  'glass milky': () => new THREE.MeshPhysicalMaterial({ color: '#e8e6e2', roughness: 0.55, transmission: 0.55, thickness: 0.1, transparent: true, opacity: 0.8 }),
  'metal black': () => std({ color: '#141414', metalness: 0.9, roughness: 0.35 }),
  metal: () => std({ color: '#5a5a5a', metalness: 0.9, roughness: 0.4 }),
  light: () => std({ color: '#fff2dc', emissive: '#ffd9a8', emissiveIntensity: 2.2, roughness: 0.5 }),
  light2: () => std({ color: '#fff2dc', emissive: '#ffe1b8', emissiveIntensity: 1.6, roughness: 0.5 }),
};

export function applyHouseMaterials(root: THREE.Object3D) {
  const cache = new Map<string, THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map((mat) => {
      const key = (mat.name || '').trim().toLowerCase();
      const rule = rules[key]; if (!rule) return mat;
      if (!cache.has(key)) { const nm = rule(mat as THREE.MeshStandardMaterial); nm.name = mat.name; cache.set(key, nm); }
      return cache.get(key)!;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
    if (/glass/.test((m.material as THREE.Material).name.toLowerCase())) m.castShadow = false;
  });
}
