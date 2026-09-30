/**
 * The landing walkthrough: villa exterior → tap → through the gate to the front door → the door
 * opens by itself → five devices inside → back out, the door closes → the smart lock → the site.
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { perfTier, trackSize, runLoop, disposeObject } from '../common';
import { CameraRig, tourMoves, type TourConfig } from './camera-rig';
import { createStage, type Stage } from './renderer';
import { loadHouse } from './loader';
import { mountDevices } from './devices';
import { mountSlideshow } from './slideshow';
import { createDoor, type Door } from './door';
import { buildInterior, type Interior } from './interior';
import { buildCourt, type Court } from './court';
import { adaptiveQuality } from './quality';
import { cloudShadow } from './wind';
import { createCalloutPlacer } from '../../film/callout';
import cfgJson from '@/data/house.json';
import villaJson from '@/data/villa.json';
import type { HouseConfig, LoadedHouse, V3 } from './types';
import { createDeviceLive, type Features } from '../../film/device-live';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type State = 'loading' | 'exterior' | 'travelling' | 'stop' | 'done';
const PLOT = { x0: -4.3, x1: 6.9, z0: -8.1, z1: 4.15 }; // the diorama's footprint on the lawn (metres)

export async function mountWalkthrough(root: HTMLElement) {
  const cfg = structuredClone(cfgJson) as unknown as HouseConfig;
  const q = new URLSearchParams(location.search);
  const forcedTier = q.get('tier');
  let tier = perfTier(); if (forcedTier === 'low' || forcedTier === 'high' || forcedTier === 'off') tier = forcedTier;
  const author = q.has('author');
  const recording = q.has('record'); // dev: frame-exact capture for the film pipeline (scripts/record-film.mjs)
  const startStop = q.has('stop') ? Math.max(0, Math.min(cfg.stops.length + 1, +q.get('stop')!)) : -1;
  const returning = (() => { try { return sessionStorage.getItem('alrawi-walk') === 'done'; } catch { return false; } })();
  if (q.get('model')) cfg.model = cfg.modelLite = q.get('model')!;
  // dev: try a sky without rebuilding — ?skyimg=/textures/sky-preview/x.webp&skyyaw=&sundir=x,y,z&skyint=&horizon=%23rrggbb (scripts/build-sky.mjs --preview prints them)
  if (q.get('skyimg')) cfg.sky.image = q.get('skyimg')!;
  if (q.get('skyyaw')) cfg.skyYaw = Number(q.get('skyyaw'));
  if (q.get('skyint')) cfg.sky.intensity = Number(q.get('skyint'));
  if (q.get('horizon')) cfg.sky.horizon = cfg.sky.fog = q.get('horizon')!;
  if (q.get('sundir')) { const a = q.get('sundir')!.split(',').map(Number); if (a.length === 3 && a.every((x) => !isNaN(x))) cfg.sun.dir = a as V3; }

  // UI handles
  const ui = {
    prompt: root.querySelector<HTMLElement>('[data-walk-prompt]')!, tap: root.querySelector<HTMLButtonElement>('[data-walk-tap]')!,
    load: root.querySelector<HTMLElement>('[data-walk-load]')!, bar: root.querySelector<HTMLElement>('[data-walk-bar]')!,
    card: root.querySelector<HTMLElement>('[data-walk-card]')!, cards: Array.from(root.querySelectorAll<HTMLElement>('[data-walk-stop]')),
    nexts: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-walk-next]')), steps: Array.from(root.querySelectorAll<HTMLElement>('[data-walk-step]')),
    counter: root.querySelector<HTMLElement>('[data-walk-counter]')!, skip: root.querySelector<HTMLElement>('[data-walk-skip]')!,
    hint: root.querySelector<HTMLElement>('[data-walk-hint]')!, authorBox: root.querySelector<HTMLElement>('[data-walk-author]')!,
    callouts: root.querySelector<HTMLElement>('[data-walk-callouts]')!, hotspot: root.querySelector<HTMLElement>('[data-walk-hotspot]')!,
    leader: root.querySelector<SVGSVGElement>('[data-walk-leader]')!, halo: root.querySelector<SVGPathElement>('[data-walk-leader-halo]')!, line: root.querySelector<SVGPathElement>('[data-walk-leader-line]')!,
  };
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const n = cfg.stops.length; const lockIdx = n - 1;
  if (!returning && !author) nav?.classList.add('is-off');
  let state: State = 'loading'; let idx = -1;
  const setPrompt = (on: boolean) => { ui.prompt.classList.toggle('is-on', on); root.classList.toggle('is-prompt', on); }; // the headline and its slate palette on the bright sky
  // device callouts (shared with the film player): the device's `hotspot` node projected to the canvas each frame; the card
  // is (re)placed whenever that point has moved, so it follows the settling gimbal, a look-around drag and a resize
  const placer = createCalloutPlacer(root, ui, { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches });
  // live devices (the panel's working screen, the switch's dots, …): pinned to the device's features, projected every frame
  const liveLayer = root.querySelector<HTMLElement>('[data-walk-live]');
  const live = liveLayer && !q.has('record') ? createDeviceLive(root, liveLayer, { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }) : null;
  let liveFor = -1;
  let hotspotAt: (id: string) => number[] | null = () => null;
  let featuresAt: (id: string) => Features | null = () => null;
  let placed: { i: number; x: number; y: number } | null = null; let lastH: number[] | null = null;
  const refreshCallout = () => {
    if (state !== 'stop' || idx < 0) { lastH = null; return; }
    const h = hotspotAt(cfg.stops[idx].id); if (!h) { lastH = null; return; }
    const w = root.clientWidth, H = root.clientHeight;
    const still = !!lastH && Math.hypot((h[0] - lastH[0]) * w, (h[1] - lastH[1]) * H) < 0.6; lastH = h;
    if (!still) return; // the head is still settling on the device (or a drag is in progress): place once it rests
    if (placed && placed.i === idx && Math.hypot((h[0] - placed.x) * w, (h[1] - placed.y) * H) < 1.5) return;
    placer.place(idx, h); placed = { i: idx, x: h[0], y: h[1] };
    if (live && liveFor !== idx) { liveFor = idx; live.show(idx, ui.cards[idx]?.dataset.shape, featuresAt(cfg.stops[idx].id)); }
  };

  const lockScroll = (on: boolean) => {
    document.body.classList.toggle('no-scroll', on); document.body.classList.toggle('is-walking', on);
    nav?.classList.toggle('is-off', on);
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis; on ? lenis?.stop() : lenis?.start();
  };
  const showCard = (i: number) => {
    ui.cards.forEach((c, k) => (c.hidden = k !== i));
    placed = null; if (i < 0) placer.hide(); // a visible card is placed by the render loop once the camera has settled on this frame
    if (live && i !== liveFor) { live.hide(); liveFor = -1; }
    ui.card.classList.toggle('is-on', i >= 0);
    ui.steps.forEach((s, k) => { s.classList.toggle('is-done', k < i); s.classList.toggle('is-on', k === i); });
    ui.counter.textContent = i >= 0 ? `${i + 1} / ${n}` : '';
    ui.nexts.forEach((b) => { b.firstChild!.textContent = (i === n - 1 ? b.dataset.finish! : b.dataset.next!) + ' '; });
    ui.hint.classList.toggle('is-on', i >= 0 && i < n - 1);
  };
  const finish = () => {
    if (recording) { state = 'done'; return; }
    state = 'done'; showCard(-1); setPrompt(false);
    lockScroll(false); try { sessionStorage.setItem('alrawi-walk', 'done'); } catch { /* ignore */ }
    root.classList.add('is-done');
    if (!author) freeLook(); // the tour hands the camera over: look around the villa from the street
    const target = document.getElementById('philosophy');
    setTimeout(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  };
  ui.skip.addEventListener('click', (e) => { e.preventDefault(); finish(); });
  // Taps anywhere on the hero advance the tour; buttons and links keep their own jobs.
  const isControl = (e: Event) => !!(e.target as Element | null)?.closest?.('a, button, [data-walk-author], .walk-load, [data-live-ui], [data-panel-screen]');

  // ---------- no-WebGL / reduced-motion: slideshow ----------
  const runSlideshow = () => {
    root.classList.add('is-live');
    ui.load.classList.add('is-done');
    const show = mountSlideshow(root, n, (i) => showCard(i - 1));
    state = 'exterior'; setPrompt(true);
    const advance = () => { if (show.index >= n) { finish(); return; } show.next(); setPrompt(false); state = 'stop'; };
    ui.tap.addEventListener('click', advance); ui.nexts.forEach((b) => b.addEventListener('click', advance));
    root.addEventListener('click', (e) => { if (!isControl(e)) advance(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); } if (e.key === 'ArrowLeft') show.prev(); });
    if (!returning) lockScroll(true);
  };
  if (tier === 'off' || q.has('slides')) { runSlideshow(); return; }

  // ---------- 3D ----------
  if (author || startStop > 0) setPrompt(false);
  let pendingTap = root.dataset.autoenter === '1'; let ready = false;
  if (pendingTap) ui.load.classList.remove('is-done');
  const queueTap = () => { if (!ready) { pendingTap = true; ui.load.classList.remove('is-done'); } };
  ui.tap.addEventListener('click', queueTap);
  root.addEventListener('click', (e) => { if (!isControl(e) && !ready) queueTap(); });
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', root.dataset.aria || 'House walkthrough');
  root.querySelector('[data-walk-canvas]')!.appendChild(canvas);
  let stage: Stage; let house: LoadedHouse;
  try {
    stage = await createStage(canvas, tier, cfg, PLOT, { record: recording });
    const url = tier === 'low' && cfg.modelLite ? cfg.modelLite : cfg.model;
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000));
    house = await Promise.race([loadHouse(url, (p) => (ui.bar.style.width = `${Math.round(p * 100)}%`), tier === 'low', cfg.shell), timeout]);
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
      console.warn('[ray]', spec, hit ? `hit ${hit.point.x.toFixed(2)},${hit.point.y.toFixed(2)},${hit.point.z.toFixed(2)} n ${hit.face?.normal.x.toFixed(1)},${hit.face?.normal.y.toFixed(1)},${hit.face?.normal.z.toFixed(1)} d ${hit.distance.toFixed(2)}` : 'miss'); }
  }
  { // dev: cutaways ?clip=<y> (below), ?cx=<x> (keep x < cx), ?cz=<z> (keep z < cz)
    const planes: THREE.Plane[] = [];
    if (q.has('clip')) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), Number(q.get('clip'))));
    if (q.has('cx')) planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), Number(q.get('cx'))));
    if (q.has('cz')) planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), Number(q.get('cz'))));
    if (planes.length) { stage.renderer.clippingPlanes = planes; stage.renderer.localClippingEnabled = true; }
  }
  scene.add(house.root); stage.fitShadows(house.bounds);
  if (tier === 'high') house.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) cloudShadow(m.material as THREE.Material); });

  // our additions: front door (+ lock mount), garden gate, designed interior
  const door: Door = createDoor(cfg.door, { reveal: 0.3, shadows: tier === 'high' });
  const gate: Door = createDoor(cfg.gate, { leaves: 2, shadows: tier === 'high', head: false });
  const interior: Interior = buildInterior(tier, stage.env.roomEnv, stage.env.props, cfg.glow);
  const court: Court = buildCourt(tier); // the garden wall, gate piers, beds and intercom between the street and the porch, where the shell was melted (villa.json cuts court-*)
  scene.add(door.group, gate.group, interior.group, court.group);
  if (tier === 'high') for (const g of [door.group, gate.group, interior.outdoor, court.group]) g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) cloudShadow(m.material as THREE.Material); });
  for (const h of (q.get('hide') || '').split(',')) { ({ shell: house.root, door: door.group, gate: gate.group, interior: interior.group, court: court.group, env: stage.env.group } as Record<string, THREE.Object3D | undefined>)[h]?.traverse((o) => (o.visible = false)); } // dev: ?hide=shell,interior,court,...
  try { await document.fonts.ready; } catch { /* canvas UI falls back to system fonts */ }
  const devices = await mountDevices(cfg.stops, house.anchors, scene, new Map([['door', door.lockMount]]), stage.env.roomEnv);
  // aim stop cameras at devices placed by anchors in the model (their world position is only known now); the lock on the door
  // leaf keeps its authored aim: the door is where house.json puts it, and the frame leaves room for the specs beside the device
  door.setOpen(0); door.group.updateMatrixWorld(true);
  for (const s of cfg.stops) { const d = devices.get(s.id); if (d && house.anchors.get(`anchor_${s.id}`)) { const p = d.getWorldPosition(new THREE.Vector3()); s.camera.look = [p.x, p.y, p.z]; } }

  // a device's live features in normalised screen space (0..1 from the top-left): the quads the landing pins HTML onto (the panel's
  // screen, the lock's keypad, the speaker's grille; corners TL, TR, BR, BL as seen from the front) and its LEDs / buttons as points
  featuresAt = (id) => {
    const d = devices.get(id); if (!d) return null; d.updateWorldMatrix(true, true);
    const quads: Record<string, number[][]> = {}, points: Record<string, number[]> = {}; let behind = false;
    const proj = (v: THREE.Vector3) => { v.project(camera); if (v.z > 1) behind = true; return [(v.x + 1) / 2, (1 - v.y) / 2]; };
    d.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (o.name === 'screen' || o.name === 'keypad' || o.name === 'grille')) {
        m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox!, z = b.max.z;
        quads[o.name] = [[b.min.x, b.max.y], [b.max.x, b.max.y], [b.max.x, b.min.y], [b.min.x, b.min.y]].map(([x, y]) => proj(new THREE.Vector3(x, y, z).applyMatrix4(m.matrixWorld)));
      } else if (/^(led_\d+|btn_\w+)$/.test(o.name)) points[o.name] = proj(o.getWorldPosition(new THREE.Vector3()));
    });
    return behind ? null : { quads, points };
  };
  hotspotAt = (id) => { const d = devices.get(id); if (!d) return null; const pt = (d.getObjectByName('hotspot') ?? d).getWorldPosition(new THREE.Vector3()).project(camera); return pt.z > 1 ? null : [(pt.x + 1) / 2, (1 - pt.y) / 2]; };
  const rig = new CameraRig(camera);
  const texturesReady = new Promise<void>((res) => { const m = THREE.DefaultLoadingManager; const done = () => res(); if (!(m as unknown as { isLoading?: boolean }).isLoading) { res(); return; } const prev = m.onLoad; m.onLoad = () => { prev?.(); done(); }; setTimeout(done, 8000); });
  const warmUp = async () => {
    await texturesReady;
    const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), open: door.open, exp: stage.renderer.toneMappingExposure };
    const poses: [V3, V3, boolean][] = [[cfg.exterior.pos, cfg.exterior.look, false], [cfg.approach.pos, cfg.approach.look, true], ...cfg.stops.map((s) => [s.camera.pos, s.camera.look, s.id !== 'lock'] as [V3, V3, boolean])];
    try { await stage.renderer.compileAsync(scene, camera); await stage.renderer.compileAsync(stage.env.background, camera); } catch { /* older browsers: the renders below compile instead */ }
    for (const [p, l, inside] of poses) { camera.position.set(...p); camera.lookAt(...l); door.setOpen(inside ? 1 : 0); stage.render(); await new Promise((r) => requestAnimationFrame(r)); }
    camera.position.copy(saved.pos); camera.quaternion.copy(saved.quat); door.setOpen(saved.open); stage.renderer.toneMappingExposure = saved.exp;
  };
  const TOUR_FOV = 50; let heroFov = cfg.exterior.fov ?? TOUR_FOV; // the hero lens (house.json); every interior stop was authored at 50
  const exteriorPos = (): V3 => { // portrait phones: pull back and up so the villa fits — never past the compounds across the road — and widen the lens
    const aspect = root.clientWidth / Math.max(1, root.clientHeight); if (aspect >= 0.95) return cfg.exterior.pos;
    const p = new THREE.Vector3(...cfg.exterior.pos), l = new THREE.Vector3(...cfg.exterior.look), d = p.clone().sub(l);
    const k = Math.max(1, Math.min(1 / Math.max(0.5, aspect) * 0.72, d.z > 0.1 ? (22.5 - l.z) / d.z : Infinity)); d.multiplyScalar(k);
    heroFov = Math.min(66, heroFov * Math.sqrt(0.95 / Math.max(0.5, aspect)));
    return [l.x + d.x, l.y + d.y + 1.2, l.z + d.z];
  };
  cfg.exterior.pos = exteriorPos(); cfg.exit.pos = cfg.exterior.pos; // the outro returns to the same frame
  rig.set(cfg.exterior.pos, cfg.exterior.look, cfg.exterior.breathe); rig.setFov(heroFov); rig.fovBreathe = 1.5; // the hero lens breathes in very slowly
  const stopSize = trackSize(root, stage.renderer, camera, (w, h) => stage.setSize(w, h));
  ui.bar.style.width = '100%';

  // ---------- choreography ----------
  // every move is planned in full by the rig the moment it starts (camera-rig.ts); doors, fades and the lens hang on that plan
  // through the GSAP clock, never on a promise, so the tour can be stepped frame by frame when recording
  const tour = tourMoves(cfg as unknown as TourConfig);
  const fadeExposure = (to: number, dur: number) => { gsap.to(stage.renderer, { toneMappingExposure: to, duration: dur, ease: 'sine.inOut' }); stage.setLook(to === cfg.exposure.interior, dur); };
  const insideNow = (on: boolean) => { stage.renderer.toneMappingExposure = on ? cfg.exposure.interior : cfg.exposure.exterior; stage.setLook(on, 0); door.setOpen(on ? 1 : 0); };
  const lensTo = (s: (typeof cfg.stops)[number]) => new THREE.Vector3(...s.camera.pos).distanceTo(devices.get(s.id)?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(...s.camera.look));
  const focusAtEnd = (s: (typeof cfg.stops)[number], T: number) => { const d = Math.min(1, T * 0.5); gsap.delayedCall(Math.max(0, T - d), () => stage.focusOn(lensTo(s), d)); }; // the lens racks onto the device as the move settles
  const arrive = (i: number) => { state = 'stop'; idx = i; showCard(i); };
  // the hero lens (it breathes, and is wider on portrait phones) eases to the tour's lens instead of cutting to it
  const leaveHero = () => { rig.fovBreathe = 0; gsap.to(camera, { fov: TOUR_FOV, duration: 1.2, ease: 'sine.inOut', onUpdate: () => camera.updateProjectionMatrix(), onComplete: () => rig.setFov(TOUR_FOV) }); };
  const CURTAIN = 2.8, curtainIdx = cfg.stops.findIndex((s) => s.id === 'curtain'); // seconds the drapes take to part (interior.ts)
  { // the motor's track (procedural/devices/curtain.ts, userData.setOpen) carries the drapes: every setOpen below, instant or
    // animated, drives its runners with the same t. interior.ts tweens the drapes with gsap.to(state, 2.8 s, power2.inOut) and no
    // overwrite; the runners get the same tween, started in the same call on the same GSAP clock (stepped by hand when recording),
    // so they move in step frame for frame, interruptions included
    let runners: ((t: number) => void) | undefined; devices.get('curtain')?.traverse((o) => { runners ??= o.userData.setOpen; });
    if (runners) {
      const drapes = interior.curtain.setOpen.bind(interior.curtain), set = runners, rt = { t: 1 };
      interior.curtain.setOpen = (t, animate = false) => { drapes(t, animate); if (animate) gsap.to(rt, { t, duration: CURTAIN, ease: 'power2.inOut', onUpdate: () => set(rt.t) }); else { rt.t = t; set(t); } };
    }
  }
  interior.curtain.setOpen(0); // the west window's drapes are drawn until the tour reaches their motor: the stop shows them part
  const enter = () => { // first tap: one unbroken push-in from the street, through the gate and up the steps; the door swings open ahead of the lens and the panel is already in view on the right-hand wall as it crosses the threshold
    state = 'travelling'; setPrompt(false); lockScroll(true); leaveHero();
    stage.focusOn(40, 0);
    const plan = rig.move(tour.enter(), () => arrive(0));
    const tDoor = plan.timeWhen((p) => p.z < 0.3); // the lens reaches the threshold
    gsap.delayedCall(Math.max(0, tDoor - 2.4), () => { void door.animate(true, 1.5); });
    gsap.delayedCall(Math.max(0, tDoor - 1), () => fadeExposure(cfg.exposure.interior, 1.6));
    focusAtEnd(cfg.stops[0], plan.T);
  };
  const goTo = (i: number, back = false) => { // `back`: the path that led from stop i to the next one, walked the other way
    const s = cfg.stops[i]; state = 'travelling'; showCard(-1);
    const plan = rig.move(tour.goTo(i, back), () => arrive(i));
    // the drapes part while the lens swings round to the window and come to rest within the clip's closing hold
    if (s.id === 'curtain' && !back) gsap.delayedCall(Math.max(0, plan.T + 0.5 - CURTAIN), () => interior.curtain.setOpen(1, true));
    if (back && cfg.stops[i + 1].id === 'curtain') interior.curtain.setOpen(0, true);
    focusAtEnd(s, plan.T);
  };
  const leaveToLock = () => { // backwards out of the house, eyes on the rooms: through the hall and the front door, straight onto the lock's frame; the door closes in front of the lens and brings the lock with it
    state = 'travelling'; showCard(-1);
    const s = cfg.stops[lockIdx], CLOSE = 1.1;
    stage.focusOn(40, 1);
    const plan = rig.move(tour.leave());
    const tOut = plan.timeWhen((p) => p.z > 0.2); // the lens is over the threshold: the leaf can swing behind it
    gsap.delayedCall(Math.max(0, tOut - 0.8), () => fadeExposure(cfg.exposure.exterior, 1.4));
    const tClose = Math.max(tOut, plan.T - 0.5);
    gsap.delayedCall(tClose, () => { void door.animate(false, CLOSE); stage.focusOn(lensTo(s), CLOSE); });
    gsap.delayedCall(tClose + CLOSE, () => arrive(lockIdx));
  };
  const reenter = () => { // back from the lock: the door opens, then the way out in reverse
    state = 'travelling'; showCard(-1);
    void door.animate(true, 1.2); stage.focusOn(40, 1);
    gsap.delayedCall(0.6, () => { fadeExposure(cfg.exposure.interior, 1.4); const plan = rig.move(tour.reenter(), () => arrive(lockIdx - 1)); focusAtEnd(cfg.stops[lockIdx - 1], plan.T); });
  };
  const advance = () => {
    if (state === 'travelling' || state === 'done') return;
    if (state === 'exterior') { enter(); return; }
    if (idx === lockIdx) { // the outro: dolly back down the path, through the gate, and rise to the opening shot, eyes on the villa the whole way
      state = 'travelling'; showCard(-1); stage.focusOn(40, 1.6);
      const plan = rig.move(tour.outro(), finish);
      if (heroFov !== TOUR_FOV) gsap.to(camera, { fov: heroFov, duration: Math.max(0.5, plan.T * 0.6), delay: plan.T * 0.4, ease: 'sine.inOut', onUpdate: () => camera.updateProjectionMatrix() });
      return;
    }
    if (idx === lockIdx - 1) { leaveToLock(); return; }
    goTo(idx + 1);
  };
  const back = () => { if (state !== 'stop' || idx <= 0) return; if (idx === lockIdx) { reenter(); return; } goTo(idx - 1, true); };
  ui.tap.addEventListener('click', advance); ui.nexts.forEach((b) => b.addEventListener('click', advance));
  root.addEventListener('click', (e) => { if (dragged || isControl(e)) return; if (state === 'stop' || state === 'exterior') advance(); });
  window.addEventListener('keydown', (e) => {
    if (author) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
    if (e.key === 'ArrowLeft') back();
  });
  // after the tour (live only): OrbitControls around the villa, damped, no pan or zoom, a modest arc — the wheel still scrolls the page
  let orbit: OrbitControls | null = null;
  const freeLook = () => {
    if (orbit || recording) return;
    const o = new OrbitControls(camera, canvas); o.target.set(...cfg.exterior.look); o.enableDamping = true; o.dampingFactor = 0.06; o.enablePan = false; o.enableZoom = false;
    const yaw0 = o.getAzimuthalAngle(); o.minAzimuthAngle = yaw0 - 0.6; o.maxAzimuthAngle = yaw0 + 0.6; o.minPolarAngle = 1.25; o.maxPolarAngle = 1.62; o.update();
    orbit = o;
  };
  // look-around drag (the overlay no longer swallows pointers, so this works over the headline too)
  let dragging = false, dragged = false, lx = 0, ly = 0;
  root.addEventListener('pointerdown', (e) => { if (isControl(e) || orbit) return; dragging = true; dragged = false; lx = e.clientX; ly = e.clientY; });
  root.addEventListener('pointermove', (e) => { if (!dragging || author || orbit) return; const dx = e.clientX - lx, dy = e.clientY - ly; if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true; rig.nudge(dx * 0.0025, dy * 0.0025); lx = e.clientX; ly = e.clientY; });
  const endDrag = () => { if (!dragging) return; dragging = false; rig.release(); setTimeout(() => (dragged = false), 0); };
  root.addEventListener('pointerup', endDrag); root.addEventListener('pointercancel', endDrag); root.addEventListener('pointerleave', endDrag);
  // pointer parallax in the hero (mouse only, never while recording): the still frame follows the cursor by a fraction of a degree
  if (!recording && !author && matchMedia('(pointer: fine)').matches) {
    root.addEventListener('pointermove', (e) => { if (dragging || orbit || state !== 'exterior') return; rig.parallax((e.clientX / root.clientWidth) * 2 - 1, (e.clientY / root.clientHeight) * 2 - 1); });
    root.addEventListener('pointerleave', () => rig.parallax(0, 0));
  }

  // author mode / deep links
  let authorCtl: { update(dt: number): void } | null = null;
  if (author) { const { mountAuthor } = await import('./author'); ui.authorBox.hidden = false; authorCtl = mountAuthor({ canvas, camera, house: house.root, devices, cfg, ui: ui.authorBox }); setPrompt(false); interior.curtain.setOpen(1); if (q.has('inside')) insideNow(true); }
  else if (q.has('cam')) {
    const v3 = (k: string, d: V3): V3 => { const a = (q.get(k) || '').split(',').map(Number); return a.length === 3 && a.every((x) => !isNaN(x)) ? (a as V3) : d; };
    rig.set(v3('cam', cfg.exterior.pos), v3('look', cfg.exterior.look)); insideNow(q.has('inside')); state = 'stop';
    if (q.has('fov')) rig.setFov(Number(q.get('fov')) || heroFov);
    if (q.has('door')) door.setOpen(Number(q.get('door')) || 0); // dev: ?door=0..1 and ?drapes=0..1 pose the leaf and the west window's drapes for a still (drapes parted by default)
    interior.curtain.setOpen(q.has('drapes') ? Number(q.get('drapes')) || 0 : 1);
  }
  else if (startStop >= 0) { // stills: 0 = exterior, 1..n = stops (n = lock, outside, door closed), n+1 = exit
    if (startStop === 0) { state = 'exterior'; setPrompt(true); }
    else if (startStop > n) { rig.set(cfg.exit.pos, cfg.exit.look); state = 'done'; }
    else { const i = startStop - 1, s = cfg.stops[i]; rig.fovBreathe = 0; rig.setFov(TOUR_FOV); rig.set(s.camera.pos, s.camera.look); insideNow(i !== lockIdx); interior.curtain.setOpen(i >= curtainIdx ? 1 : 0); stage.focusOn(lensTo(s), 0); state = 'stop'; idx = i; showCard(i); }
  } else {
    state = 'exterior'; setPrompt(true);
    if (!returning) lockScroll(true);
  }
  // Warm-up behind the poster: wait for every texture, compile every shader and render the poses
  // the tour will visit so nothing compiles or uploads mid-flight.
  await warmUp();
  ready = true; ui.load.classList.add('is-done'); root.classList.add('is-live');
  if (pendingTap) { pendingTap = false; setTimeout(advance, 400); }

  // dev: ?stats → window.__walkStats() returns ms/frame + renderer.info
  const times: number[] = [];
  (window as unknown as { __walkDebug?: () => unknown }).__walkDebug = () => ({ state, idx, h: idx >= 0 ? hotspotAt(cfg.stops[idx].id) : null, lastH, placed, cam: camera.position.toArray().map((v) => +v.toFixed(5)), rot: camera.rotation.toArray().slice(0, 3).map((v) => +(v as number).toFixed(6)), fov: camera.fov, ...rig.angles, door: +door.open.toFixed(3) }); // dev: what the callout placer sees, where the rig is
  (window as unknown as { __walkStats?: () => unknown }).__walkStats = () => { const t = times.slice(-120); const avg = t.reduce((a, b) => a + b, 0) / Math.max(1, t.length); const i = stage.renderer.info; return { ms: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), quality: quality?.label(), calls: i.render.calls, tris: i.render.triangles, lines: i.render.lines, points: i.render.points, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, dpr: stage.renderer.getPixelRatio(), size: stage.renderer.getSize(new THREE.Vector2()).toArray() }; };
  if (recording) {
    const w = window as unknown as Record<string, unknown>;
    let T = 0; const down = document.createElement('canvas');
    // ?shutter=K: motion blur for the moves. K sub-frames are rendered across a 180° shutter (the second half of the frame's time,
    // so it closes on the frame's own instant, like the unblurred frames around it) and averaged; the hero loop and every hold stay
    // at one render per frame, so whatever stands still stays crisp
    const K = Math.max(1, Math.min(32, Math.round(Number(q.get('shutter')) || 1)));
    const tick = (h: number) => { T += h; gsap.updateRoot(T); rig.update(h); stage.update(h); interior.update(h, camera); };
    let mid: { p: THREE.Vector3; q: THREE.Quaternion } | null = null; // where the lens was at the middle of the last blurred frame's shutter
    /** run `fn` with the camera where the frame shows it (the shutter's middle when the frame is blurred) */
    const asShown = <R,>(fn: () => R): R => {
      if (!mid) return fn();
      const p = camera.position.clone(), r = camera.quaternion.clone(); camera.position.copy(mid.p); camera.quaternion.copy(mid.q); camera.updateMatrixWorld(true);
      try { return fn(); } finally { camera.position.copy(p); camera.quaternion.copy(r); camera.updateMatrixWorld(true); }
    };
    w.__rec = {
      begin() { gsap.ticker.remove(gsap.updateRoot); T = gsap.globalTimeline.time(); rig.update(0); stage.update(0); interior.update(0, camera); stage.render(); return true; },
      go() { advance(); return state; },
      state: () => state,
      /** advance the whole scene by dt seconds, render, and return the frame as a JPEG data URL */
      step(dt: number, quality = 0.95) {
        // the stage renders at 2x (renderer.ts); average it down to the CSS size so the film is supersampled
        const w = canvas.clientWidth, h = canvas.clientHeight; if (down.width !== w || down.height !== h) { down.width = w; down.height = h; }
        const c = down.getContext('2d')!; c.imageSmoothingQuality = 'high';
        const n = state === 'travelling' ? K : 1; mid = null;
        if (n === 1) { tick(dt); stage.render(); c.globalAlpha = 1; c.drawImage(canvas, 0, 0, w, h); }
        else {
          // the shutter opens half a frame in; sub-frame i sits at (i + ½) / n of it and a running average (alpha 1 / (i + 1)) weighs
          // them equally. The scene then runs on to the end of the frame, so every clock ends the frame exactly where it would without
          // the blur, and a blurred frame is centred only a quarter frame before an unblurred one (no hitch where a move starts or ends)
          const sub = dt / 2 / n, a = (n - 1) >> 1, b = n >> 1; let pa: THREE.Vector3 | null = null, qa: THREE.Quaternion | null = null;
          for (let i = 0; i < n; i++) {
            tick(i ? sub : dt / 2 + sub / 2); stage.render(); c.globalAlpha = 1 / (i + 1); c.drawImage(canvas, 0, 0, w, h);
            if (i === a) { pa = camera.position.clone(); qa = camera.quaternion.clone(); }
            if (i === b) mid = { p: pa!.clone().lerp(camera.position, a === b ? 0 : 0.5), q: qa!.clone().slerp(camera.quaternion, a === b ? 0 : 0.5) }; // the shutter's middle
          }
          c.globalAlpha = 1; tick(sub / 2);
        }
        return { state, img: down.toDataURL('image/jpeg', quality) };
      },
      /** `step` without the picture: the same clocks and the same shutter timing, nothing rendered or read back. The recorder's
       *  --data-only pass replays a clip with it to rebuild the clip's per-frame data (hotspot, features, the panel track) when its
       *  frames are already recorded */
      dry(dt: number) {
        const n = state === 'travelling' ? K : 1; mid = null;
        if (n === 1) tick(dt);
        else {
          const sub = dt / 2 / n, a = (n - 1) >> 1, b = n >> 1; let pa: THREE.Vector3 | null = null, qa: THREE.Quaternion | null = null;
          for (let i = 0; i < n; i++) {
            tick(i ? sub : dt / 2 + sub / 2);
            if (i === a) { pa = camera.position.clone(); qa = camera.quaternion.clone(); }
            if (i === b) mid = { p: pa!.clone().lerp(camera.position, a === b ? 0 : 0.5), q: qa!.clone().slerp(camera.quaternion, a === b ? 0 : 0.5) };
          }
          tick(sub / 2);
        }
        camera.updateMatrixWorld(true); scene.updateMatrixWorld(true); // `render` would have done this: the projections read these matrices
        return { state };
      },
      /** normalised screen position (0..1 from top-left) of a stop's device, or null when behind the camera */
      hotspot(id: string) { return hotspotAt(id)?.map((v) => +v.toFixed(4)) ?? null; },
      /** the panel's screen corners on this frame when fully in view and unoccluded (the landing keeps its live UI pinned to the moving
       *  film with these), else null */
      track(id: string) {
        return asShown(() => {
        const f = featuresAt(id); const q = f?.quads.screen; if (!q) return null;
        if (q.some(([x, y]) => x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02)) return null;
        const scr = devices.get(id)?.getObjectByName('screen') as THREE.Mesh | undefined; if (!scr) return null;
        scr.geometry.computeBoundingBox(); const b = scr.geometry.boundingBox!, z = b.max.z, cam = camera.getWorldPosition(new THREE.Vector3());
        const n = new THREE.Vector3(0, 0, 1).transformDirection(scr.matrixWorld), mid = new THREE.Vector3(0, 0, z).applyMatrix4(scr.matrixWorld);
        if (n.dot(cam.clone().sub(mid).normalize()) < 0.25) return null; // too oblique to read
        const rc = new THREE.Raycaster(), occ = [house.root, interior.group, door.group];
        for (const [x, y] of [[b.min.x, b.max.y], [b.max.x, b.max.y], [b.max.x, b.min.y], [b.min.x, b.min.y], [0, 0]]) {
          const pt = new THREE.Vector3(x, y, z).applyMatrix4(scr.matrixWorld), dir = pt.clone().sub(cam), dist = dir.length(); rc.set(cam, dir.normalize()); rc.far = dist - 0.03;
          if (rc.intersectObjects(occ, true).length) return null; // a jamb or a wall is in front of it
        }
        return q.map((c) => c.map((v) => +v.toFixed(4)));
        });
      },
      /** the device's live features (quads + points) in normalised screen space, 5 decimals (text edges need sub-pixel corners) */
      features(id: string) { const f = featuresAt(id); if (!f) return null; const r = (a: number[]) => a.map((v) => +v.toFixed(5)); return { quads: Object.fromEntries(Object.entries(f.quads).map(([k, q]) => [k, q.map(r)])), points: Object.fromEntries(Object.entries(f.points).map(([k, v]) => [k, r(v)])) }; },
    };
    ready = true; ui.load.classList.add('is-done'); root.classList.add('is-live'); w.__recReady = true;
    return () => { stopSize(); rig.dispose(); interior.dispose(); door.dispose(); gate.dispose(); court.dispose(); disposeObject(scene); stage.dispose(); };
  }
  const quality = tier === 'high' && !q.has('noadapt') ? adaptiveQuality(stage, root) : null;
  let first = true;
  const stop = runLoop(root, (dt) => {
    const t0 = performance.now(); authorCtl ? authorCtl.update(dt) : orbit ? orbit.update() : rig.update(dt); stage.update(dt); interior.update(dt, camera); stage.render(); refreshCallout(); if (live && liveFor >= 0 && state === 'stop') live.place(featuresAt(cfg.stops[liveFor].id)); const ms = performance.now() - t0; times.push(ms); if (times.length > 600) times.splice(0, 300); quality?.sample(ms); if (first) { first = false; root.classList.add('is-live'); } });
  return () => { stop(); stopSize(); orbit?.dispose(); rig.dispose(); interior.dispose(); door.dispose(); gate.dispose(); court.dispose(); disposeObject(scene); stage.dispose(); };
}
void villaJson;
