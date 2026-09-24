import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { buildProduct } from '../procedural';
import type { StopConfig } from './types';
import products from '@/data/products.json';

/** Mount one device per stop. Named anchors from the model override JSON transforms. */
export async function mountDevices(stops: StopConfig[], anchors: Map<string, THREE.Object3D>, parent: THREE.Object3D) {
  const out = new Map<string, THREE.Object3D>();
  for (const stop of stops) {
    const product = (products as { slug: string; shape: string; shapeParams: Record<string, unknown>; accent: string; model: boolean }[]).find((p) => p.slug === stop.product);
    if (!product) continue;
    let obj: THREE.Object3D | null = null;
    if (stop.device.source === 'glb' || product.model) {
      try { const l = new GLTFLoader(); const d = new DRACOLoader(); d.setDecoderPath('/draco/'); l.setDRACOLoader(d); obj = (await l.loadAsync(`/models/${product.slug}.glb`)).scene; } catch { obj = null; }
    }
    if (!obj) obj = buildProduct(product.shape, product.shapeParams, product.accent);
    // normalise to the device's largest dimension = 1, then scale to real size (metres)
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const k = stop.device.scale / Math.max(size.x, size.y, size.z);
    const holder = new THREE.Group(); holder.name = `device_${stop.id}`;
    obj.scale.setScalar(k); holder.add(obj);
    // the recipe's -Z side is its mounting face: move it to the holder origin so the device sits ON the surface
    const sb = new THREE.Box3().setFromObject(obj); obj.position.z -= sb.min.z;
    const anchor = anchors.get(`anchor_${stop.id}`);
    if (anchor) { anchor.getWorldPosition(holder.position); anchor.getWorldQuaternion(holder.quaternion); }
    else { holder.position.set(...stop.device.pos); holder.rotation.set(...stop.device.rot); }
    // push slightly off the surface so it never z-fights with the wall
    holder.translateZ(0.004);
    holder.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    // small warm fill light so the device reads on camera
    const fill = new THREE.PointLight('#ffe8c8', 0.35, 1.6, 2); fill.position.set(0, 0.25, 0.35); holder.add(fill);
    parent.add(holder); out.set(stop.id, holder);
  }
  return out;
}
