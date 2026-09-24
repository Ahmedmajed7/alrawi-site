/**
 * Product 3D viewer. Loads /models/<slug>.glb when the product has `model: true`,
 * otherwise builds a procedural model from its shape recipe. Falls back to the photo
 * on devices without WebGL or with reduced motion.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { perfTier, createRenderer, makeEnvironment, trackSize, runLoop, disposeObject, contactShadowTexture, fitCameraTo } from './common';
import { buildProduct } from './procedural';

export async function mountViewer(root: HTMLElement) {
  const tier = perfTier();
  const status = root.querySelector<HTMLElement>('[data-status]');
  const badge = root.querySelector<HTMLElement>('[data-badge]');
  if (tier === 'off') { if (status) status.textContent = status.dataset.fallback || ''; return; }

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', root.dataset.aria || '3D model');
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  root.appendChild(canvas);

  const renderer = createRenderer(canvas, tier, true);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = tier === 'high';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  scene.environmentIntensity = 0.9;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);

  const accent = new THREE.Color(root.dataset.accent || '#2f80ff');
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2.5, 4, 3);
  key.castShadow = tier === 'high'; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(accent, 2.4); rim.position.set(-3, 1.5, -2.5);
  const fill = new THREE.DirectionalLight('#9bb7ff', 0.6); fill.position.set(-2, -1, 3);
  scene.add(key, rim, fill, new THREE.AmbientLight('#8aa0d0', 0.25));

  // model
  let model: THREE.Object3D;
  const slug = root.dataset.slug || '';
  const params = JSON.parse(root.dataset.params || '{}');
  const procedural = () => buildProduct(root.dataset.shape || 'box', params, root.dataset.accent || '#2f80ff');
  if (root.dataset.model === '1') {
    try {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
      const gltf = await loader.loadAsync(`/models/${slug}.glb`);
      model = gltf.scene;
      model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      if (badge) badge.textContent = 'GLB';
    } catch (e) {
      console.warn(`[viewer] GLB for ${slug} failed, using procedural model`, e);
      model = procedural();
    }
  } else model = procedural();
  scene.add(model);

  const { center, dist, size } = fitCameraTo(model, camera, 1.25);
  model.position.sub(center); // centre at origin
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(size.x, size.z) * 2.2, Math.max(size.x, size.z) * 2.2), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.8 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -size.y / 2 - 0.02; scene.add(shadow);
  if (tier === 'high') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.25 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -size.y / 2 - 0.021; ground.receiveShadow = true; scene.add(ground);
  }

  const home = new THREE.Vector3(dist * 0.55, dist * 0.35, dist * 0.8);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enablePan = false; controls.minDistance = dist * 0.55; controls.maxDistance = dist * 1.8;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI / 2 + 0.15;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.1;
  controls.addEventListener('start', () => { controls.autoRotate = false; status?.classList.add('is-hidden'); });

  // keyboard rotation for accessibility
  canvas.addEventListener('keydown', (e) => {
    const step = 0.15; let used = true;
    if (e.key === 'ArrowLeft') controls.autoRotate = false, spin(-step);
    else if (e.key === 'ArrowRight') controls.autoRotate = false, spin(step);
    else if (e.key === 'ArrowUp') camera.position.y += step;
    else if (e.key === 'ArrowDown') camera.position.y -= step;
    else used = false;
    if (used) e.preventDefault();
  });
  const spin = (a: number) => { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); camera.position.applyQuaternion(q); };

  root.querySelector<HTMLButtonElement>('[data-reset]')?.addEventListener('click', () => {
    camera.position.copy(home); controls.target.set(0, 0, 0); controls.autoRotate = true; status?.classList.remove('is-hidden');
  });

  const stopSize = trackSize(root, renderer, camera);
  let t0 = -1;
  const stop = runLoop(root, (_dt, t) => {
    if (t0 < 0) t0 = t;
    controls.update();
    // gentle float
    model.position.y = Math.sin((t - t0) * 1.2) * 0.012;
    renderer.render(scene, camera);
  });

  root.classList.add('is-3d');
  if (status) { status.classList.add('is-ready'); status.textContent = status.dataset.hint || ''; }

  return () => { stop(); stopSize(); controls.dispose(); disposeObject(scene); renderer.dispose(); canvas.remove(); };
}

export function mountAll() {
  document.querySelectorAll<HTMLElement>('[data-viewer]').forEach((el) => {
    if (el.dataset.mounted) return; el.dataset.mounted = '1';
    // defer until near viewport
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); mountViewer(el).catch((err) => console.error('[viewer]', err)); } }, { rootMargin: '200px' });
    io.observe(el);
  });
}
