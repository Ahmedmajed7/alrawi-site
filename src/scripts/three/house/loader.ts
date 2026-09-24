import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { LoadedHouse } from './types';
import { applyHouseMaterials } from './materials';

/** Load the client's GLB (DRACO ok). Reads anchor_* / cam_* / door_main nodes. */
export async function loadHouse(url: string, onProgress?: (p: number) => void, lite = false): Promise<LoadedHouse> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url, (e) => { if (e.total) onProgress?.(e.loaded / e.total); else onProgress?.(Math.min(0.95, e.loaded / 8e6)); });
  const root = gltf.scene;
  const anchors = new Map<string, THREE.Object3D>();
  let door: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (/^(anchor|cam)_/i.test(o.name)) anchors.set(o.name.toLowerCase(), o);
    if (o.name.toLowerCase() === 'door_main') door = o;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true; m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const s = mat as THREE.MeshStandardMaterial;
        if (s.map) s.map.anisotropy = 8;
        if (s.lightMap) { s.lightMapIntensity = 1; }
      }
    }
  });
  applyHouseMaterials(root, lite);
  const bounds = new THREE.Box3().setFromObject(root);
  return { root, anchors, door, bounds };
}
