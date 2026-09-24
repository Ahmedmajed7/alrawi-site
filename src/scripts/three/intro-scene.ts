/**
 * "The connected home" intro: a holographic villa built from glowing edges, device
 * nodes that ignite one by one and link back to the control panel hub, a drifting
 * particle field, and a camera that settles then reacts to mouse + scroll.
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { perfTier, createRenderer, trackSize, runLoop, disposeObject, glowTexture } from './common';

gsap.registerPlugin(ScrollTrigger);

const CYAN = new THREE.Color('#35e0ff'), BLUE = new THREE.Color('#2f80ff'), WARM = new THREE.Color('#ffd28a');

type Node = { key: string; pos: THREE.Vector3; mesh: THREE.Mesh; sprite: THREE.Sprite; ring: THREE.Mesh; link?: THREE.Line; label?: HTMLElement };

function block(w: number, h: number, d: number, x: number, z: number, edgeMat: THREE.LineBasicMaterial, faceMat: THREE.Material) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  const face = new THREE.Mesh(geo, faceMat); face.position.y = h / 2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 12), edgeMat); edges.position.y = h / 2;
  g.add(face, edges); g.position.set(x, 0, z);
  // parapet lip
  const lip = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.02, 0.12, d * 1.02), 12), edgeMat); lip.position.y = h - 0.06; g.add(lip);
  return g;
}
function windowPane(w: number, h: number, mat: THREE.Material) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); }

export function mountIntro(hero: HTMLElement) {
  const tier = perfTier();
  const loader = document.querySelector<HTMLElement>('[data-intro-loader]');
  const bar = loader?.querySelector<HTMLElement>('[data-bar]');
  const content = hero.querySelectorAll<HTMLElement>('[data-hero-el]');
  const labels = Array.from(hero.querySelectorAll<HTMLElement>('[data-node-label]'));
  const finishLoader = () => loader?.classList.add('is-done');
  const revealContent = (fast = false) => gsap.to(content, { opacity: 1, y: 0, duration: fast ? 0.01 : 1.1, stagger: fast ? 0 : 0.12, ease: 'power3.out', overwrite: true });
  gsap.set(content, { opacity: 0, y: 26 });

  const seen = (() => { try { return sessionStorage.getItem('alrawi-intro') === '1'; } catch { return false; } })();
  try { sessionStorage.setItem('alrawi-intro', '1'); } catch { /* ignore */ }
  loader?.querySelector('[data-skip]')?.addEventListener('click', () => { finishLoader(); revealContent(true); });
  // Never trap the visitor behind the loader (throttled tabs, slow GPUs, stalled rAF).
  setTimeout(() => { if (!loader?.classList.contains('is-done')) { finishLoader(); revealContent(true); } }, seen ? 2500 : 4500);

  if (tier === 'off') { finishLoader(); revealContent(true); hero.classList.add('is-static'); return; }

  const mount = hero.querySelector<HTMLElement>('[data-hero-canvas]')!;
  const canvas = document.createElement('canvas'); mount.appendChild(canvas);
  const renderer = createRenderer(canvas, tier);
  renderer.setClearColor(0x070b14, 1);
  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0x070b14, 0.045);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const camHome = new THREE.Vector3(12.5, 8.2, 14.5);
  camera.position.copy(camHome).multiplyScalar(1.5);
  // Keep the villa on the side opposite the headline: shift the look-at point along the
  // camera's right axis by a fraction of the visible half-width (screen-space, not world X).
  const rtl = document.documentElement.dir === 'rtl';
  const centre = new THREE.Vector3(0, 1.0, 0);
  const lookAt = centre.clone();
  const right = new THREE.Vector3();
  const applyOffset = () => {
    const w = hero.clientWidth, h = hero.clientHeight;
    const fwd = new THREE.Vector3().subVectors(centre, camHome).normalize();
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const dist = camHome.distanceTo(centre);
    const halfW = dist * Math.tan((camera.fov * Math.PI) / 360) * (w / h);
    const k = w < 900 ? 0 : halfW * 0.5; // villa centred at ~25% / 75% of the width
    lookAt.copy(centre).addScaledVector(right, rtl ? k : -k);
  };

  /* ---- ground grid (shader, radial fade) ---- */
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#35e0ff') }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vPos;
      void main(){ vec2 g = abs(fract(vPos.xy * 0.5 - 0.5) - 0.5) / fwidth(vPos.xy * 0.5); float line = 1.0 - min(min(g.x, g.y), 1.0);
        float d = length(vPos.xy) / 22.0; float fade = smoothstep(1.0, 0.15, d);
        float pulse = 0.85 + 0.15 * sin(uTime * 0.8 - d * 6.0);
        gl_FragColor = vec4(uColor, line * fade * 0.28 * pulse); }`,
  }));
  grid.rotation.x = -Math.PI / 2; grid.position.y = -0.01; scene.add(grid);

  /* ---- villa ---- */
  const edgeMat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const faceMat = new THREE.MeshStandardMaterial({ color: '#0b1220', roughness: 1, metalness: 0, transparent: true, opacity: 0.92 });
  const winMat = new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const house = new THREE.Group();
  const blocks = [block(6, 2.6, 4, 0, 0, edgeMat, faceMat), block(3.2, 2.1, 3.4, 4.4, 0.6, edgeMat, faceMat), block(3, 1.7, 3, -4.3, 0.9, edgeMat, faceMat), block(2.6, 1.6, 3.6, 1.2, -3.6, edgeMat, faceMat)];
  blocks.forEach((b) => { b.scale.y = 0.001; house.add(b); });
  // windows on the front (+z) faces
  const wins: THREE.Mesh[] = [];
  for (const [x, y, z, w, h] of [[-1.6, 1.3, 2.01, 1.4, 1.2], [1.2, 1.3, 2.01, 1.6, 1.2], [4.4, 1.1, 2.31, 1.4, 1.0], [-4.3, 0.9, 2.41, 1.2, 0.8]] as number[][]) {
    const m = windowPane(w, h, winMat); m.position.set(x, y, z); house.add(m); wins.push(m);
  }
  const door = windowPane(0.9, 1.8, new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })); door.position.set(-0.2, 0.9, 2.02); house.add(door);
  scene.add(house);

  /* ---- nodes ---- */
  const glowTex = glowTexture(128, '#35e0ff');
  const nodeDefs: [string, number, number, number][] = [
    ['hub', 0.3, 1.5, 2.06], ['lighting', -1.6, 2.3, 0.4], ['climate', 1.4, 2.72, -0.6], ['security', -0.65, 1.0, 2.1], ['audio', 4.4, 2.0, 0.2], ['curtains', 1.2, 1.55, 1.9], ['access', -4.3, 0.9, 2.5],
  ];
  const nodes: Node[] = nodeDefs.map(([key, x, y, z]) => {
    const pos = new THREE.Vector3(x, y, z);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(key === 'hub' ? 0.12 : 0.075, 24, 24), new THREE.MeshBasicMaterial({ color: key === 'hub' ? '#ffffff' : CYAN, transparent: true, opacity: 0 }));
    mesh.position.copy(pos);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: key === 'hub' ? BLUE : CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.position.copy(pos); sprite.scale.setScalar(key === 'hub' ? 1.6 : 0.9);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.2, 48), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(pos); ring.lookAt(camera.position);
    scene.add(mesh, sprite, ring);
    const label = labels.find((l) => l.dataset.nodeLabel === key);
    return { key, pos, mesh, sprite, ring, label };
  });
  const hub = nodes[0];
  const linkMat = new THREE.LineDashedMaterial({ color: CYAN, transparent: true, opacity: 0, dashSize: 0.25, gapSize: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const n of nodes.slice(1)) {
    const mid = hub.pos.clone().lerp(n.pos, 0.5).add(new THREE.Vector3(0, 1.1 + n.pos.distanceTo(hub.pos) * 0.12, 0.6));
    const curve = new THREE.QuadraticBezierCurve3(hub.pos, mid, n.pos);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    const line = new THREE.Line(geo, linkMat.clone()); line.computeLineDistances(); (line.material as THREE.LineDashedMaterial).opacity = 0;
    scene.add(line); n.link = line;
  }

  /* ---- particles ---- */
  const count = tier === 'high' ? 1800 : 450;
  const pts = new Float32Array(count * 3), speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) { pts[i * 3] = (Math.random() - 0.5) * 30; pts[i * 3 + 1] = Math.random() * 9; pts[i * 3 + 2] = (Math.random() - 0.5) * 30; speeds[i] = 0.05 + Math.random() * 0.25; }
  const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const particles = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: CYAN, size: 0.05, map: glowTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  scene.add(particles);

  /* ---- light ---- */
  scene.add(new THREE.HemisphereLight('#2f80ff', '#070b14', 0.6));
  const sun = new THREE.DirectionalLight('#8fb8ff', 0.8); sun.position.set(-6, 10, 4); scene.add(sun);

  /* ---- post ---- */
  let composer: EffectComposer | null = null, bloom: UnrealBloomPass | null = null;
  if (tier === 'high') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.7, 0.25); composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const stopSize = trackSize(hero, renderer, camera, (w, h) => { composer?.setSize(w, h); bloom?.resolution.set(w, h); applyOffset(); });

  /* ---- interaction state ---- */
  const mouse = new THREE.Vector2(0, 0), mouseS = new THREE.Vector2(0, 0);
  const onMove = (e: PointerEvent) => { mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1); };
  if (tier === 'high') window.addEventListener('pointermove', onMove, { passive: true });
  const scroll = { p: 0 };
  ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6, onUpdate: (self) => { scroll.p = self.progress; } });

  /* ---- timeline ---- */
  const state = { build: 0, orbit: 0 };
  const tl = gsap.timeline({ paused: true });
  const wait = seen ? 0.2 : 1.1;
  tl.to(bar || {}, { width: '100%', duration: wait, ease: 'power2.inOut' }, 0)
    .add(finishLoader, wait)
    .to(camera.position, { x: camHome.x, y: camHome.y, z: camHome.z, duration: 2.6, ease: 'power3.out' }, wait)
    .to(edgeMat, { opacity: 0.9, duration: 1.2 }, wait + 0.1)
    .to(blocks.map((b) => b.scale), { y: 1, duration: 1.3, stagger: 0.14, ease: 'power3.out' }, wait + 0.15)
    .to(winMat, { opacity: 0.55, duration: 0.8 }, wait + 1.2)
    .to(state, { build: 1, duration: 0.01 }, wait + 1.4);
  let at = wait + 1.35;
  for (const n of nodes) {
    tl.to([n.mesh.material, n.sprite.material], { opacity: 1, duration: 0.5, ease: 'power2.out' }, at)
      .fromTo(n.ring.scale, { x: 0.2, y: 0.2, z: 0.2 }, { x: 4, y: 4, z: 4, duration: 1.4, ease: 'power2.out' }, at)
      .fromTo(n.ring.material, { opacity: 0.8 }, { opacity: 0, duration: 1.4, ease: 'power2.out' }, at);
    if (n.link) tl.to(n.link.material, { opacity: 0.85, duration: 0.7 }, at + 0.1);
    if (n.label) tl.add(() => n.label!.classList.add('is-on'), at + 0.25);
    at += 0.22;
  }
  tl.add(() => revealContent(), wait + 1.6);
  tl.to(state, { orbit: 1, duration: 3, ease: 'sine.inOut' }, at);
  tl.play();

  /* ---- loop ---- */
  const tmp = new THREE.Vector3();
  const stop = runLoop(hero, (dt, t) => {
    (grid.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    // particles drift up
    const arr = pgeo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) { arr[i * 3 + 1] += speeds[i] * dt; if (arr[i * 3 + 1] > 9) arr[i * 3 + 1] = 0; }
    pgeo.attributes.position.needsUpdate = true;
    // dashed links flow
    for (const n of nodes) if (n.link) (n.link.material as THREE.LineDashedMaterial).dashOffset = -t * 0.9;
    // hub pulse
    hub.sprite.scale.setScalar(1.6 + Math.sin(t * 2.2) * 0.18);
    for (const n of nodes.slice(1)) n.sprite.scale.setScalar(0.9 + Math.sin(t * 2.2 + n.pos.x) * 0.1);
    // camera: gentle orbit + mouse parallax + scroll lift
    mouseS.lerp(mouse, 0.05);
    const orbitA = Math.sin(t * 0.12) * 0.22 * state.orbit;
    const base = camHome.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitA + mouseS.x * 0.12);
    base.y += mouseS.y * -0.6 + scroll.p * 6;
    base.multiplyScalar(1 + scroll.p * 0.35);
    if (state.build) camera.position.lerp(base, 0.06);
    camera.lookAt(tmp.set(lookAt.x, lookAt.y - scroll.p * 2 - (hero.clientWidth < 900 ? 2.2 : 0), lookAt.z));
    house.position.y = -scroll.p * 1.2;
    fog.density = 0.045 + scroll.p * 0.06;
    for (const n of nodes) n.ring.lookAt(camera.position);
    // DOM labels
    const w = hero.clientWidth, h = hero.clientHeight;
    for (const n of nodes) if (n.label) {
      tmp.copy(n.pos).add(house.position); tmp.project(camera);
      n.label.style.left = `${((tmp.x + 1) / 2) * w}px`; n.label.style.top = `${((1 - tmp.y) / 2) * h - 24}px`;
      n.label.style.opacity = tmp.z < 1 && scroll.p < 0.4 && n.label.classList.contains('is-on') ? '1' : '0';
    }
    composer ? composer.render() : renderer.render(scene, camera);
  });

  hero.classList.add('is-3d');
  return () => { stop(); stopSize(); window.removeEventListener('pointermove', onMove); tl.kill(); disposeObject(scene); renderer.dispose(); };
}
