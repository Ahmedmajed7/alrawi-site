/**
 * Photoscanned props (Poly Haven, CC0; built by scripts/build-props.mjs and listed in house.json `props`):
 * load each once, then stamp copies at real size. A prop is set on the ground at its footprint centre and
 * scaled so its largest footprint dimension (or its height) matches the given metres.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export type Props = Map<string, GLTF>;

export async function loadProps(urls: Record<string, string> | undefined, skip = false): Promise<Props> {
  const out: Props = new Map(); if (!urls || skip) return out;
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
  await Promise.all(Object.entries(urls).map(async ([kind, url]) => { try { out.set(kind, await loader.loadAsync(url)); } catch (e) { console.warn('[props] failed', kind, e); } }));
  draco.dispose();
  return out;
}

/** One placed copy: geometry and materials are shared with the source; `size` = target metres of the chosen `by` dimension. */
export function stamp(props: Props, kind: string, at: { x: number; y: number; z: number; ry?: number; size: number; by?: 'height' | 'width'; shadows?: boolean }, decorate?: (m: THREE.Mesh) => void): THREE.Group | null {
  const g = props.get(kind); if (!g) return null;
  const src = g.scene; src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src); const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const dim = at.by === 'height' ? s.y : Math.max(s.x, s.z); const k = at.size / Math.max(1e-6, dim);
  const inner = new THREE.Group();
  src.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const copy = new THREE.Mesh(m.geometry, m.material); copy.matrix.copy(m.matrixWorld); copy.matrix.decompose(copy.position, copy.quaternion, copy.scale); copy.castShadow = at.shadows ?? true; copy.receiveShadow = true; decorate?.(copy); inner.add(copy); });
  inner.position.set(-c.x, -box.min.y, -c.z); // footprint centre on the ground
  const wrap = new THREE.Group(); wrap.add(inner); wrap.scale.setScalar(k); wrap.rotation.y = at.ry ?? 0; wrap.position.set(at.x, at.y, at.z); wrap.name = `prop_${kind}`;
  return wrap;
}
