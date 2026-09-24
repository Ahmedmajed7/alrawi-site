/**
 * Author mode (?author): fly around the house, place devices, log camera poses, copy house.json.
 * Keys: WASDQE move · 1-6 select stop · P log pose · click place device on surface · V add waypoint
 *       X set exterior pose · N set exit pose · J copy JSON · H toggle help
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HouseConfig, V3 } from './types';

export function mountAuthor(opts: { canvas: HTMLCanvasElement; camera: THREE.PerspectiveCamera; house: THREE.Object3D; devices: Map<string, THREE.Object3D>; cfg: HouseConfig; ui: HTMLElement }) {
  const { canvas, camera, house, devices, cfg, ui } = opts;
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.screenSpacePanning = true;
  controls.target.set(...cfg.exterior.look); camera.position.set(...cfg.exterior.pos); controls.update();
  let stop = 0; const keys = new Set<string>();
  const r3 = (v: THREE.Vector3): V3 => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  const help = () => { ui.textContent = `AUTHOR MODE  stop ${stop + 1}/${cfg.stops.length} (${cfg.stops[stop].id})\nWASDQE move · 1-6 stop · P log camera · click place device\nV add waypoint · X exterior · N exit · J copy JSON\ncam ${r3(camera.position).join(', ')}  look ${r3(controls.target).join(', ')}`; };
  const ray = new THREE.Raycaster();
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObject(house, true)[0]; if (!hit || !hit.face) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    const dev = devices.get(cfg.stops[stop].id); if (!dev) return;
    dev.position.copy(hit.point).addScaledVector(n, 0.01);
    dev.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const s = cfg.stops[stop]; s.device.pos = r3(dev.position); const e3 = new THREE.Euler().setFromQuaternion(dev.quaternion); s.device.rot = [+e3.x.toFixed(3), +e3.y.toFixed(3), +e3.z.toFixed(3)];
    s.camera.look = r3(hit.point); s.camera.pos = r3(camera.position);
    console.log('[author] placed', s.id, JSON.stringify(s)); help();
  });
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); keys.add(k);
    if (/^[1-6]$/.test(k)) { stop = Math.min(+k - 1, cfg.stops.length - 1); }
    if (k === 'p') { cfg.stops[stop].camera.pos = r3(camera.position); cfg.stops[stop].camera.look = r3(controls.target); console.log('[author] camera', JSON.stringify(cfg.stops[stop].camera)); }
    if (k === 'v') { cfg.stops[stop].via.push(r3(camera.position)); console.log('[author] via', JSON.stringify(cfg.stops[stop].via)); }
    if (k === 'x') { cfg.exterior.pos = r3(camera.position); cfg.exterior.look = r3(controls.target); console.log('[author] exterior', JSON.stringify(cfg.exterior)); }
    if (k === 'n') { cfg.exit.pos = r3(camera.position); cfg.exit.look = r3(controls.target); }
    if (k === 'j') { navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2)); console.log(JSON.stringify(cfg, null, 2)); ui.textContent += '\n(copied)'; }
    help();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  help();
  return {
    update(dt: number) {
      const sp = (keys.has('shift') ? 6 : 2.2) * dt; const dir = new THREE.Vector3();
      camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
      const mv = new THREE.Vector3();
      if (keys.has('w')) mv.add(dir); if (keys.has('s')) mv.sub(dir); if (keys.has('d')) mv.add(right); if (keys.has('a')) mv.sub(right); if (keys.has('e')) mv.y += 1; if (keys.has('q')) mv.y -= 1;
      if (mv.lengthSq()) { mv.normalize().multiplyScalar(sp); camera.position.add(mv); controls.target.add(mv); help(); }
      controls.update();
    },
  };
}
