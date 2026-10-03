import type * as THREE from 'three';
export type V3 = [number, number, number];
export interface StopConfig {
  id: string;
  /** a device stop names its product and where the device is mounted; the `app` stop (the phone in the living room) has neither */
  product?: string;
  device?: { pos?: V3; rot?: V3; scale: number; source: 'procedural' | 'glb'; mount?: 'door'; params?: Record<string, unknown> };
  kind?: 'app';
  /** the app stop: points in the room its markers are pinned to (recorded as film.json `marks`) */
  marks?: Record<string, V3>;
  /** the app stop: the room is recorded in every state of its drapes (this many frames from parted to drawn), lights on and off */
  scene?: { frames: number };
  camera: { pos: V3; look: V3 };
  via: V3[];
  /** which side of the device the callout card goes (default: the roomier side) */
  side?: 'left' | 'right';
}
export interface DoorConfig {
  pos: V3; yaw: number; width: number; height: number; thickness: number;
  hinge: 'left' | 'right'; openAngle: number; style: 'walnut' | 'steel'; open?: number; steps?: number;
  /** the front door: a leaf hinged beside a fixed panel, or (the default) one wide pivot leaf; see door.ts */
  type?: 'pivot' | 'hinged';
}
export interface Pose { pos: V3; look: V3 }
export interface HouseConfig {
  model: string; modelLite: string; skyYaw: number;
  exposure: { exterior: number; interior: number };
  sun: { dir: V3; intensity: number; color: string };
  /** sky + atmosphere (colours as CSS hex). `image` = upper-hemisphere equirect baked by scripts/build-sky.mjs,
   *  rendered × `intensity` (linear); `horizon` is measured from it and, × intensity, colours the fog and haze. */
  sky: { image: string; intensity: number; horizon: string; ground: string; /** tint multiplied into the sky near the horizon (golden-hour glow) */ warm?: string; fog?: string; fogNear: number; fogFar: number; sea: string };
  /** the Al Rawi "R" in the sky above the villa: base centre (metres), yaw (radians, 0 = faces +Z), height and depth (metres),
   *  `style` brand (flat, unlit, the exact brand colours as in the key visual), glass (tinted glass panes) or brass (legacy → glass),
   *  `float` bob amplitude (m), `sweep` how far a reflection rotates (rad), `opacity` of the flat brand panes (0..1, default 0.92) */
  logo?: { pos: V3; yaw: number; height: number; depth: number; style?: 'brand' | 'glass' | 'brass'; float?: number; sweep?: number; opacity?: number };
  /** photoscanned plants built by scripts/build-trees.mjs (skipped on the low tier) */
  plants?: { tree?: string };
  /** photoscanned props built by scripts/build-props.mjs: kind → hashed GLB url */
  props?: Record<string, string>;
  hemi?: { sky: string; ground: string; intensity: number };
  /** the real range behind the villa (scripts/build-terrain.mjs): viewpoint (lat, lon, compass bearing of world −Z), height exaggeration, and the baked files */
  terrain?: { lat: number; lon: number; bearing: number; exaggerate?: number; model?: string; modelLite?: string };
  /** the wind every plant bends in: `dir` = the world XZ direction it blows toward */
  wind?: { dir: [number, number] };
  /** warm "lit room" quads a few cm proud of the shell's baked (opaque) upper windows, seen from the street at dusk:
   *  centre (metres), size [w, h], `yaw` of the face normal (0 = faces +Z), emissive `intensity`, and a point light in front on the high tier */
  glow?: { pos: V3; size: [number, number]; yaw?: number; intensity?: number; light?: boolean }[];
  shell: { detailNormal: string; detailTiles: number; detailScale: number; roughness: number; envMapIntensity: number; roughnessMap?: string; color?: string;
    /** optional baked lightmap (sRGB) on the glTF's second UV set (TEXCOORD_1; see docs/house-model.md) and its intensity */ lightMap?: string; lightMapIntensity?: number };
  door: DoorConfig; gate: DoorConfig;
  /** the hero pose; `fov` is the hero lens (vertical degrees, default 50 — the tour itself always runs at 50) */
  exterior: Pose & { breathe: number; fov?: number };
  approach: Pose & { via: V3[] };
  hall: V3[];
  stops: StopConfig[];
  exitOut: Pose & { via: V3[] };
  exit: Pose & { via?: V3[] };
}
export interface LoadedHouse { root: THREE.Group; anchors: Map<string, THREE.Object3D>; bounds: THREE.Box3 }
