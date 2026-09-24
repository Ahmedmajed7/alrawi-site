import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Tier = 'off' | 'low' | 'high';

/** Decide how much GPU work this device should get. */
export function perfTier(): Tier {
  if (typeof window === 'undefined') return 'off';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off';
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) return 'off';
  } catch { return 'off'; }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  return coarse || weak || window.innerWidth < 760 ? 'low' : 'high';
}

export function createRenderer(canvas: HTMLCanvasElement, tier: Tier, alpha = false) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', alpha, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : 1.3));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

export function makeEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

/** Keep renderer + camera in sync with the element size. Returns a cleanup. */
export function trackSize(el: HTMLElement, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, onResize?: (w: number, h: number) => void) {
  const apply = () => {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    onResize?.(w, h);
  };
  apply();
  const ro = new ResizeObserver(apply); ro.observe(el);
  return () => ro.disconnect();
}

/** Run `frame` only while `el` is on screen and the tab is visible. Returns stop(). */
export function runLoop(el: HTMLElement, frame: (dt: number, t: number) => void) {
  let raf = 0, visible = true, last = performance.now(), running = true;
  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt, now / 1000);
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!raf && running && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0.01 });
  io.observe(el);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  start();
  return () => { running = false; stop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** Radial soft-shadow texture for a contact-shadow plane. */
export function contactShadowTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Soft glow sprite texture. */
export function glowTexture(size = 128, color = '#35e0ff') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color); grd.addColorStop(0.25, color + 'aa'); grd.addColorStop(1, color + '00');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function fitCameraTo(obj: THREE.Object3D, camera: THREE.PerspectiveCamera, pad = 1.35) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = (maxDim / 2 / Math.tan((camera.fov * Math.PI) / 360)) * pad;
  return { center, dist, size };
}
