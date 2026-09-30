import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { HouseConfig, LoadedHouse } from './types';
import { applyHouseMaterials, applyShellMaterial } from './materials';

/** Load the villa GLB (DRACO ok). Reads anchor_* / cam_* nodes when a model carries them. */
export async function loadHouse(url: string, onProgress?: (p: number) => void, lite = false, shell?: HouseConfig['shell']): Promise<LoadedHouse> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url, (e) => { if (e.total) onProgress?.(e.loaded / e.total); else onProgress?.(Math.min(0.95, e.loaded / 4e6)); });
  const root = gltf.scene;
  const anchors = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (/^(anchor|cam)_/i.test(o.name)) anchors.set(o.name.toLowerCase(), o);
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  if (shell) applyShellMaterial(root, shell, lite); else applyHouseMaterials(root, lite);
  draco.dispose();
  const bounds = new THREE.Box3().setFromObject(root);
  return { root, anchors, bounds };
}
