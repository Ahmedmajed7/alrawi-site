import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createRenderer, type Tier } from '../common';
import type { HouseConfig } from './types';

export interface Stage {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight; composer: EffectComposer | null; gtao: GTAOPass | null;
  setSize(w: number, h: number): void; render(): void; fitShadows(bounds: THREE.Box3): void; dispose(): void;
}

export async function createStage(canvas: HTMLCanvasElement, tier: Tier, cfg: HouseConfig): Promise<Stage> {
  const renderer = createRenderer(canvas, tier);
  renderer.shadowMap.enabled = tier === 'high';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMappingExposure = cfg.exposure.exterior;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);

  // environment
  const hdr = await new HDRLoader().loadAsync(cfg.hdr);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr).texture; pmrem.dispose();
  scene.environment = env; scene.background = hdr; scene.backgroundBlurriness = 0.15; scene.backgroundIntensity = 1.0;
  scene.environmentIntensity = 1.0;

  // sun + fill
  const sun = new THREE.DirectionalLight(cfg.sun.color, cfg.sun.intensity);
  sun.position.set(...cfg.sun.dir); sun.castShadow = tier === 'high';
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#dfe8f5', '#8a7a62', 0.5));
  // ground: the client's model has no terrain; a wide gravel/sand disc that fades into the sky
  const tl = new THREE.TextureLoader();
  const gt = (n: string, srgb = false) => { const t = tl.load(`/textures/house/${n}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), new THREE.MeshStandardMaterial({ color: '#c7bfb0', map: gt('gravel_diff', true), normalMap: gt('gravel_nor'), roughnessMap: gt('gravel_rough'), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; ground.name = 'ground'; scene.add(ground);
  scene.fog = new THREE.Fog('#d9dfe6', 60, 160);

  let composer: EffectComposer | null = null, gtao: GTAOPass | null = null, smaa: SMAAPass | null = null, bloom: UnrealBloomPass | null = null;
  if (tier === 'high') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 1, 1); gtao.output = GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1, thickness: 1, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    composer.addPass(gtao);
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.6, 0.92); composer.addPass(bloom);
    smaa = new SMAAPass(); composer.addPass(smaa);
    composer.addPass(new OutputPass());
  }
  return {
    renderer, scene, camera, sun, composer, gtao,
    setSize(w, h) { composer?.setSize(w, h); gtao?.setSize(w, h); bloom?.setSize(w, h); },
    render() { composer ? composer.render() : renderer.render(scene, camera); },
    fitShadows(bounds) {
      const c = bounds.getCenter(new THREE.Vector3()), s = bounds.getSize(new THREE.Vector3()), r = Math.max(s.x, s.z) * 0.75;
      sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(...cfg.sun.dir).normalize().multiplyScalar(r * 2));
      const sc = sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.5; sc.far = r * 5; sc.updateProjectionMatrix();
    },
    dispose() { composer?.dispose(); hdr.dispose(); env.dispose(); renderer.dispose(); },
  };
}
