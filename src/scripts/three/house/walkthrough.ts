/**
 * The landing walkthrough: exterior shot → tap → through the door → hold at each mounted device → tap → next.
 */
import * as THREE from 'three';
import { perfTier, trackSize, runLoop, disposeObject } from '../common';
import { CameraRig } from './camera-rig';
import { createStage, type Stage } from './renderer';
import { loadHouse } from './loader';
import { buildPlaceholder } from './placeholder';
import { mountDevices } from './devices';
import { mountSlideshow } from './slideshow';
import cfgJson from '@/data/house.json';
import type { HouseConfig, LoadedHouse } from './types';

type State = 'loading' | 'exterior' | 'travelling' | 'stop' | 'done';

export async function mountWalkthrough(root: HTMLElement) {
  const cfg = structuredClone(cfgJson) as HouseConfig;
  const q = new URLSearchParams(location.search);
  const forcedTier = q.get('tier');
  let tier = perfTier(); if (forcedTier === 'low' || forcedTier === 'high' || forcedTier === 'off') tier = forcedTier;
  const author = q.has('author');
  const startStop = q.has('stop') ? Math.max(0, Math.min(cfg.stops.length + 1, +q.get('stop')!)) : -1;
  const returning = (() => { try { return sessionStorage.getItem('alrawi-walk') === 'done'; } catch { return false; } })();

  // UI handles
  const ui = {
    prompt: root.querySelector<HTMLElement>('[data-walk-prompt]')!, tap: root.querySelector<HTMLButtonElement>('[data-walk-tap]')!,
    load: root.querySelector<HTMLElement>('[data-walk-load]')!, bar: root.querySelector<HTMLElement>('[data-walk-bar]')!,
    card: root.querySelector<HTMLElement>('[data-walk-card]')!, cards: Array.from(root.querySelectorAll<HTMLElement>('[data-walk-stop]')),
    nexts: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-walk-next]')), steps: Array.from(root.querySelectorAll<HTMLElement>('[data-walk-step]')),
    counter: root.querySelector<HTMLElement>('[data-walk-counter]')!, skip: root.querySelector<HTMLElement>('[data-walk-skip]')!,
    hint: root.querySelector<HTMLElement>('[data-walk-hint]')!, authorBox: root.querySelector<HTMLElement>('[data-walk-author]')!,
  };
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const n = cfg.stops.length;
  if (!returning && !author) nav?.classList.add('is-off'); // the tour has its own top bar
  let state: State = 'loading'; let idx = -1;

  const lockScroll = (on: boolean) => {
    document.body.classList.toggle('no-scroll', on); document.body.classList.toggle('is-walking', on);
    nav?.classList.toggle('is-off', on);
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis; on ? lenis?.stop() : lenis?.start();
  };
  const showCard = (i: number) => {
    ui.cards.forEach((c, k) => (c.hidden = k !== i));
    ui.card.classList.toggle('is-on', i >= 0);
    ui.steps.forEach((s, k) => { s.classList.toggle('is-done', k < i); s.classList.toggle('is-on', k === i); });
    ui.counter.textContent = i >= 0 ? `${i + 1} / ${n}` : '';
    ui.nexts.forEach((b) => { b.firstChild!.textContent = (i === n - 1 ? b.dataset.finish! : b.dataset.next!) + ' '; });
    ui.hint.classList.toggle('is-on', i >= 0 && i < n - 1);
  };
  const finish = () => {
    state = 'done'; showCard(-1); ui.prompt.classList.remove('is-on');
    lockScroll(false); try { sessionStorage.setItem('alrawi-walk', 'done'); } catch { /* ignore */ }
    root.classList.add('is-done');
    // reveal the page: scroll to the first section
    const target = document.getElementById('philosophy');
    setTimeout(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  };
  ui.skip.addEventListener('click', (e) => { e.preventDefault(); finish(); });

  // ---------- no-WebGL / reduced-motion: slideshow ----------
  const runSlideshow = () => {
    root.classList.add('is-live');
    ui.load.classList.add('is-done');
    const show = mountSlideshow(root, n, (i) => showCard(i - 1));
    state = 'exterior'; ui.prompt.classList.add('is-on');
    const advance = () => { if (show.index >= n) { finish(); return; } show.next(); ui.prompt.classList.remove('is-on'); state = 'stop'; };
    ui.tap.addEventListener('click', advance); ui.nexts.forEach((b) => b.addEventListener('click', advance));
    window.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); } if (e.key === 'ArrowLeft') show.prev(); });
    if (!returning) lockScroll(true);
  };
  if (tier === 'off' || q.has('slides')) { runSlideshow(); return; }

  // ---------- 3D ----------
  // Headline + tap prompt render at first paint over the poster (LCP); the model streams behind it.
  if (author || startStop > 0) ui.prompt.classList.remove('is-on');
  let pendingTap = root.dataset.autoenter === '1'; let ready = false;
  if (pendingTap) ui.load.classList.remove('is-done');
  ui.tap.addEventListener('click', () => { if (!ready) { pendingTap = true; ui.load.classList.remove('is-done'); } });
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', root.dataset.aria || 'House walkthrough');
  root.querySelector('[data-walk-canvas]')!.appendChild(canvas);
  let stage: Stage; let house: LoadedHouse;
  try {
    stage = await createStage(canvas, tier, cfg)
    const url = tier === 'low' && cfg.modelLite ? cfg.modelLite : cfg.model;
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000));
    house = url === 'procedural' ? buildPlaceholder() : await Promise.race([loadHouse(url, (p) => (ui.bar.style.width = `${Math.round(p * 100)}%`)), timeout])
  } catch (e) {
    console.warn('[walk] 3D unavailable, using slideshow', e);
    canvas.remove(); runSlideshow(); return;
  }
  const { scene, camera } = stage;
  if (q.has('ray')) { // dev: ?ray=x,y,z,tx,ty,tz;... logs surface hits for authoring
    const rc = new THREE.Raycaster();
    for (const spec of (q.get('ray') || '').split(';')) { const a = spec.split(',').map(Number); if (a.length !== 6) continue;
      const o = new THREE.Vector3(a[0], a[1], a[2]), d = new THREE.Vector3(a[3], a[4], a[5]).sub(o).normalize(); rc.set(o, d);
      const hit = rc.intersectObject(house.root, true)[0];
      console.warn('[ray]', spec, hit ? `hit ${hit.point.x.toFixed(2)},${hit.point.y.toFixed(2)},${hit.point.z.toFixed(2)} n ${hit.face?.normal.x.toFixed(1)},${hit.face?.normal.y.toFixed(1)},${hit.face?.normal.z.toFixed(1)} d ${hit.distance.toFixed(2)} ${(hit.object as THREE.Mesh).material && ((hit.object as THREE.Mesh).material as THREE.Material).name}` : 'miss'); }
  }
  if (q.has('clip')) { stage.renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), Number(q.get('clip')))]; } // dev: cutaway plan views
  scene.add(house.root); stage.fitShadows(house.bounds);
  const camExt = house.anchors.get('cam_exterior');
  if (camExt) { const p = new THREE.Vector3(), d = new THREE.Vector3(0, 0, -1); camExt.getWorldPosition(p); d.applyQuaternion(camExt.getWorldQuaternion(new THREE.Quaternion())); cfg.exterior.pos = [p.x, p.y, p.z]; cfg.exterior.look = [p.x + d.x * 5, p.y + d.y * 5, p.z + d.z * 5]; }
  const devices = await mountDevices(cfg.stops, house.anchors, house.root)
  // if anchors came from the model, aim the stop cameras at the placed devices
  for (const s of cfg.stops) { const d = devices.get(s.id); if (d && house.anchors.get(`anchor_${s.id}`)) { const p = d.getWorldPosition(new THREE.Vector3()); s.camera.look = [p.x, p.y, p.z]; } }

  const rig = new CameraRig(camera);
  // portrait phones: pull the exterior camera back and up so the whole villa fits the frame
  const exteriorPos = (): [number, number, number] => {
    const aspect = root.clientWidth / Math.max(1, root.clientHeight); if (aspect >= 0.95) return cfg.exterior.pos;
    const p = new THREE.Vector3(...cfg.exterior.pos), l = new THREE.Vector3(...cfg.exterior.look);
    const d = p.clone().sub(l).multiplyScalar(1 / Math.max(0.45, aspect) * 0.9); return [l.x + d.x, l.y + d.y + 1.5, l.z + d.z];
  };
  cfg.exterior.pos = exteriorPos();
  rig.set(cfg.exterior.pos, cfg.exterior.look, cfg.exterior.breathe);
  const stopSize = trackSize(root, stage.renderer, camera, (w, h) => stage.setSize(w, h));
  ui.load.classList.add('is-done'); ui.bar.style.width = '100%';
  root.classList.add('is-live')

  // door animation
  const door = house.door; const doorOpen = { a: 0 };
  const swingDoor = (open: boolean) => { if (!door) return; import('gsap').then(({ gsap }) => gsap.to(doorOpen, { a: open ? -1.6 : 0, duration: 1.6, ease: 'power2.inOut', onUpdate: () => (door.rotation.y = doorOpen.a) })); };

  const goTo = (i: number, fromExterior = false) => {
    const s = cfg.stops[i]; state = 'travelling'; showCard(-1); ui.prompt.classList.remove('is-on');
    const via = fromExterior ? [...cfg.entry, ...s.via] : s.via;
    const dist = rig.pos.distanceTo(new THREE.Vector3(...s.camera.pos));
    const dur = fromExterior ? 4.2 : THREE.MathUtils.clamp(1.2 + dist * 0.35, 1.5, 3.2);
    stage.renderer.toneMappingExposure = cfg.exposure.interior;
    if (fromExterior) swingDoor(true);
    rig.travel(via, s.camera.pos, s.camera.look, dur, () => { state = 'stop'; idx = i; showCard(i); });
  };
  const advance = () => {
    if (state === 'travelling' || state === 'done') return;
    if (state === 'exterior') { lockScroll(true); goTo(0, true); return; }
    if (idx >= n - 1) { state = 'travelling'; showCard(-1); rig.travel([], cfg.exit.pos, cfg.exit.look, 1.8, () => finish()); return; }
    goTo(idx + 1);
  };
  const back = () => { if (state !== 'stop' || idx <= 0) return; goTo(idx - 1); };
  ui.tap.addEventListener('click', advance); ui.nexts.forEach((b) => b.addEventListener('click', advance));
  canvas.addEventListener('click', (e) => { if (dragged) return; if (state === 'stop' || state === 'exterior') advance(); void e; });
  window.addEventListener('keydown', (e) => {
    if (author) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
    if (e.key === 'ArrowLeft') back();
  });
  // look-around drag
  let dragging = false, dragged = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; dragged = false; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging || author) return; const dx = e.clientX - lx, dy = e.clientY - ly; if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true; rig.nudge(dx * 0.0025, dy * 0.0025); lx = e.clientX; ly = e.clientY; });
  const endDrag = () => { dragging = false; rig.release(); setTimeout(() => (dragged = false), 0); };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

  // author mode
  let authorCtl: { update(dt: number): void } | null = null;
  if (author) { const { mountAuthor } = await import('./author'); ui.authorBox.hidden = false; authorCtl = mountAuthor({ canvas, camera, house: house.root, devices, cfg, ui: ui.authorBox }); ui.prompt.classList.remove('is-on'); }
  else if (q.has('cam')) {
    const v3 = (k: string, d: [number, number, number]) => { const a = (q.get(k) || '').split(',').map(Number); return a.length === 3 && a.every((x) => !isNaN(x)) ? (a as [number, number, number]) : d; };
    rig.set(v3('cam', cfg.exterior.pos), v3('look', cfg.exterior.look)); if (q.has('inside')) stage.renderer.toneMappingExposure = cfg.exposure.interior; if (door) door.rotation.y = -1.6; state = 'stop';
  }
  else if (startStop >= 0) {
    // deep link for stills: jump straight to a stop (0 = exterior, n+1 = exit)
    if (startStop === 0) { state = 'exterior'; ui.prompt.classList.add('is-on'); }
    else if (startStop > n) { rig.set(cfg.exit.pos, cfg.exit.look); state = 'done'; }
    else { const s = cfg.stops[startStop - 1]; rig.set(s.camera.pos, s.camera.look); stage.renderer.toneMappingExposure = cfg.exposure.interior; if (door) door.rotation.y = -1.6; state = 'stop'; idx = startStop - 1; showCard(idx); }
  } else {
    state = 'exterior'; ui.prompt.classList.add('is-on');
    if (!returning) lockScroll(true);
  }
  ready = true; ui.load.classList.add('is-done');
  if (pendingTap) { pendingTap = false; setTimeout(advance, 400); }

  let first = true;
  const stop = runLoop(root, (dt) => { authorCtl ? authorCtl.update(dt) : rig.update(dt); stage.render(); if (first) { first = false; root.classList.add('is-live'); } });
  return () => { stop(); stopSize(); rig.dispose(); disposeObject(scene); stage.dispose(); };
}
