import type * as THREE from 'three';
export type V3 = [number, number, number];
export interface StopConfig {
  id: string; product: string;
  device: { pos: V3; rot: V3; scale: number; source: 'procedural' | 'glb' };
  camera: { pos: V3; look: V3 };
  via: V3[];
}
export interface HouseConfig {
  model: string; modelLite: string; hdr: string;
  exposure: { exterior: number; interior: number };
  sun: { dir: V3; intensity: number; color: string };
  exterior: { pos: V3; look: V3; breathe: number };
  entry: V3[];
  stops: StopConfig[];
  exit: { pos: V3; look: V3 };
}
export interface LoadedHouse { root: THREE.Group; anchors: Map<string, THREE.Object3D>; door?: THREE.Object3D; bounds: THREE.Box3 }
