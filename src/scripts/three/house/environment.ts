/**
 * The world around the villa at golden hour: a photographed sky (Poly Haven CC0, baked by scripts/build-sky.mjs) that
 * also provides the image-based light — cooled for the PMREM so open shade reads blue against the warm sun — the Hajar
 * range in aerial haze (terrain.ts), the desert ground (gravelly sand, wind-packed sheets, tyre tracks on the open
 * plots, planted soil at the foot of the walls), the walled compound and its street (street.ts), the planting
 * (vegetation.ts), stones and scrub on the open ground (meadow.ts) and the life in the air (ambient.ts).
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { makeEnvironment, type Tier } from '../common';
import type { HouseConfig } from './types';
import { plantVegetation } from './vegetation';
import { loadTerrain, type TerrainShade } from './terrain';
import { buildStreet, type Street, type Rect } from './street';
import { makeBirds, makeClouds } from './ambient';
import { WORLD_TIME, WIND, setWindDir, cloudShadow } from './wind';
import { loadProps, type Props } from './props';
import { dressGround } from './meadow';

/** `background` is rendered first with its own pass so the sky and mountains stay out of the AO/depth passes. */
export interface Environment { group: THREE.Group; background: THREE.Scene; /** photoscanned props (house.json `props`), for the street, the garden and the rooms */ props: Props; /** a studio-room reflection map for interiors and metal props (the sky PMREM is for the exterior) */ roomEnv: THREE.Texture; /** the ground cover in the beds (the first foliage the quality steps drop) */ grass: THREE.Object3D | null; oasis: THREE.Object3D; trees: THREE.Object3D; /** 0 = every leaf still (quality step), 1 = full wind */ wind: { value: number }; update(dt: number, camera: THREE.Camera): void; /** hide the sky-bound life (birds, clouds) while the camera is indoors */ setInside(inside: boolean): void; dispose(): void }

const TEX = '/textures/env/';
const rand = mulberry32(1337);
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/* ------------------------------------------------------------------ sky */
/** house.json `sky`, with the light-balance fields this file reads: `fill` tints the dome as a light source away from the sun (the blue of open shade), `bounce` is the ground's colour in that light, `ambient` its strength */
type SkyCfg = HouseConfig['sky'] & { fill?: string; bounce?: string; ambient?: number };
/** Linear sky colour at the horizon, as rendered (the fog and the mountains' haze fade into it). */
const horizonColor = (sk: SkyCfg) => (sk.fog ? new THREE.Color(sk.fog) : new THREE.Color(sk.horizon).multiplyScalar(sk.intensity).multiply(new THREE.Color(sk.warm ?? '#ffffff')));
/**
 * Upper-hemisphere equirect (u = longitude + yaw, v = elevation) × intensity; below the horizon it fades to `ground`.
 * The photographed sky is shown as it is: only a warm in-scatter glow around the sun is added (the rest of the sky keeps
 * its blue — a warm multiply along the whole horizon made a muddy band), the 8-bit image is dithered before the gain so it
 * never bands, and it is sampled with seam-safe gradients so the mipmaps (no shimmer on the clouds) have no seam line.
 */
function makeSky(tex: THREE.Texture, sk: SkyCfg, yaw: number, radius = 200, ground = sk.ground, sunDir: THREE.Vector3 = new THREE.Vector3(-1, 0.1, 0.5), fill: THREE.Color | null = null) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uIntensity: { value: sk.intensity }, uYaw: { value: yaw }, uHorizon: { value: horizonColor(sk) }, uGround: { value: new THREE.Color(ground) }, uWarm: { value: new THREE.Color(sk.warm ?? '#ffffff') }, uSun: { value: sunDir.clone().normalize() }, uFill: { value: fill ?? new THREE.Color(1, 1, 1) }, uFillK: { value: fill ? 1 : 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uIntensity, uYaw, uFillK; uniform vec3 uHorizon, uGround, uWarm, uSun, uFill; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir);
        float u0 = (atan(d.z, d.x) + uYaw) / 6.2831853 + 0.5;
        float v = asin(clamp(d.y, 0.0, 1.0)) / 1.5707963;
        // seam-safe gradients: u jumps by 1 at the atan branch cut, so take the derivative of whichever of two shifted copies is continuous here
        float ua = fract(u0), ub = fract(u0 + 0.5) - 0.5;
        vec2 gx = vec2(abs(dFdx(ua)) < abs(dFdx(ub)) ? dFdx(ua) : dFdx(ub), dFdx(v)), gy = vec2(abs(dFdy(ua)) < abs(dFdy(ub)) ? dFdy(ua) : dFdy(ub), dFdy(v));
        vec3 col = textureGrad(uMap, vec2(ua, max(v, 0.0015)), gx, gy).rgb;
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); // interleaved-gradient dither, in the image's own sRGB steps
        col = pow(max(pow(col, vec3(1.0 / 2.2)) + (n - 0.5) / 255.0, 0.0), vec3(2.2)) * uIntensity;
        float sd = max(dot(d, uSun), 0.0);
        col *= mix(vec3(1.0), uWarm * 1.3, clamp(pow(sd, 5.0) * (1.0 - 0.6 * v), 0.0, 1.0)); // golden in-scatter around the sun only
        col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.05) * mix(vec3(1.0), vec3(0.97, 0.99, 1.03), smoothstep(0.3, 0.95, v));
        if (d.y < 0.0) col = mix(uHorizon, uGround, smoothstep(0.0, 0.3, -d.y));
        // as a light source only (the PMREM): the dome away from the sun is the blue fill of open shade; toward the sun it stays warm
        // (strongest in the low sky opposite the sun — what a shaded wall sees — and eased toward the zenith, which is what
        // the sunlit ground mostly sees: a zenith as blue as the far sky turned every sunlit pavement lilac)
        if (uFillK > 0.5) col *= mix(uFill, vec3(1.0), clamp(pow(sd, 2.0) * 1.2 + smoothstep(0.0, -0.25, d.y) + 0.45 * smoothstep(0.35, 0.95, d.y), 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false; mesh.name = 'sky';
  return mesh;
}
/** Small copy of the sky image for the PMREM bake: sampling the 8k original into 256² cube faces would alias. */
function downsample(img: HTMLImageElement | ImageBitmap, w: number) {
  return canvasTex(w, w / 4, (g, cw, ch) => { g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cw, ch); });
}

/* --------------------------------------------------------------- mountains */
/* the real Hajar from elevation data: terrain.ts (built by scripts/build-terrain.mjs) */

/* ----------------------------------------------------------------- ground */
/**
 * One ground plane for everything that is not paved. Open ground is the gravel plain Muscat is built on: gravelly sand
 * read at two scales, wind-packed sand lying over it in sheets, tyre tracks where cars cut across the open plots
 * beside us. Inside the compound and along the foot of every street wall it is planted soil, dark where the drip
 * lines keep it damp; the service yard by the garage is raked gravel. The carriageway is sunk below the ground level,
 * so the plane is cut away under everything the street paves.
 */
function makeGround(tier: Tier, st: Street, yardX: number) {
  const tl = new THREE.TextureLoader();
  const ld = (name: string, srgb = false) => { const t = tl.load(`${TEX}${name}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const gravel = ld('gravel_diff', true), gravelNor = ld('gravel_nor'), sand = ld('dsand_diff', true), sandNor = ld('dsand_nor');
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, map: gravel, normalMap: tier === 'high' ? gravelNor : null, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 0.7 });
  const v4 = (r?: Rect) => (r ? new THREE.Vector4(r.x0, r.x1, r.z0, r.z1) : new THREE.Vector4(0, 0, 0, 0));
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uSand: { value: sand }, uSandNor: { value: sandNor }, uCompound: { value: v4(st.compound) }, uPaved: { value: new THREE.Vector2(st.paved.z0, st.paved.z1) }, uFront: { value: new THREE.Vector2(st.compound.z1, st.paved.z0) }, uGaps: { value: [v4(st.gaps[0]), v4(st.gaps[1])] }, uYard: { value: yardX } });
    sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform sampler2D uSand, uSandNor; uniform vec4 uCompound; uniform vec2 uPaved, uFront; uniform vec4 uGaps[2]; uniform float uYard; varying vec3 vGW;
      float gSheet = 0.0, gBump = 1.0, gSoil = 0.0; vec2 gW;\n` + sh.fragmentShader.replace('#include <map_fragment>', `
      { if (vGW.z > uPaved.x + 0.02 && vGW.z < uPaved.y - 0.02) discard;
        const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
        vec2 w = vec2(vGW.x, -vGW.z); gW = w; // the plane's own uv orientation, in metres: the tangent frame of the normal map follows it
        float n1 = texture2D(uSand, w / 61.0).g / 0.227, n2 = texture2D(map, w / 23.0 + 0.41).g / 0.162, n3 = texture2D(uSand, w / 7.3 + 0.2).r / 0.287;
        vec3 g1 = texture2D(map, w / 2.6).rgb; float g2 = dot(texture2D(map, w / 19.0 + 0.37).rgb, LUM) / 0.179;
        // tan silt with the Hajar's dark ophiolite pebbles strewn over it (a desert pavement), darker and coarser in broad patches
        // where the wind has taken the fines; the scan's own warmth is kept (a grey, cool-tinted ground read as clay under the blue fill)
        vec3 grav = mix(vec3(dot(g1, LUM)), g1, 0.85) * vec3(1.0, 1.02, 1.05) * mix(0.74, 1.08, clamp(g2 - 0.5, 0.0, 1.0));
        float pebF = 1.0 - smoothstep(0.004, 0.012, length(fwidth(w))), pb = dot(texture2D(map, w / 0.93 + 0.3).rgb, LUM) / 0.179;
        grav *= mix(1.0, 0.5, smoothstep(0.72, 0.45, pb) * pebF) * (1.0 + 0.18 * smoothstep(1.2, 1.5, pb) * pebF);
        grav = mix(grav, grav * vec3(0.66, 0.63, 0.62), 0.55 * smoothstep(0.95, 1.25, n2 + 0.5 * (n1 - 1.0)));
        vec3 s1 = texture2D(uSand, w / 4.1).rgb; vec3 sandC = mix(vec3(dot(s1, LUM)), s1, 0.85) * vec3(1.06, 1.04, 1.0);
        float sheet = smoothstep(0.92, 1.12, n1 + 0.3 * (n2 - 1.0));
        vec3 col = mix(grav, sandC, sheet * 0.8);
        // tyre tracks across the two open plots: the fines are pressed smooth and pale in the ruts, the gravel is pushed up beside them
        float bump = 1.0;
        for (int i = 0; i < 2; i++) { vec4 g = uGaps[i];
          float inz = smoothstep(g.z - 2.0, g.z + 6.0, vGW.z) * (1.0 - smoothstep(uFront.y - 0.05, uFront.y, vGW.z));
          for (int k = 0; k < 2; k++) {
            float xc = mix(g.x, g.y, k == 0 ? 0.42 : 0.66) + (k == 0 ? 0.55 : -0.4) * sin(vGW.z * (k == 0 ? 0.23 : 0.31) + float(i) * 2.1 + float(k));
            float d = abs(abs(vGW.x - xc) - 0.78), rut = exp(-d * d / 0.022) * inz * (k == 0 ? 1.0 : 0.55) * smoothstep(0.55, 0.9, n3 + 0.3);
            float ridge = exp(-pow(d - 0.2, 2.0) / 0.004) * inz * (k == 0 ? 1.0 : 0.55);
            col = mix(col, sandC * 1.06, rut * 0.75); col *= 1.0 - 0.16 * ridge * n2; bump = min(bump, 1.0 - 0.8 * rut);
          } }
        // planted soil: the whole garden ring inside our wall and the strips along the street walls; raked gravel in the service yard
        float inC = min(min(vGW.x - uCompound.x, uCompound.y - vGW.x), min(vGW.z - uCompound.z, uCompound.w - vGW.z));
        float inGap = 0.0; for (int i = 0; i < 2; i++) inGap = max(inGap, step(uGaps[i].x, vGW.x) * step(vGW.x, uGaps[i].y));
        float soilK = max(step(0.0, inC) * (1.0 - step(uYard, vGW.x)), step(uFront.x, vGW.z) * step(vGW.z, uFront.y) * (1.0 - inGap));
        vec3 soil = vec3(0.115, 0.082, 0.056) * (0.55 + 0.75 * dot(g1, LUM) / 0.179) * mix(0.72, 1.1, smoothstep(0.7, 1.2, n3));
        vec3 yard = mix(vec3(dot(g1, LUM)), g1, 0.3) * vec3(1.4, 1.46, 1.42);
        col = mix(col, yard, step(0.0, inC) * step(uYard, vGW.x)); col = mix(col, soil, soilK);
        gSheet = sheet * 0.85 * (1.0 - soilK); gBump = bump; gSoil = soilK;
        diffuseColor.rgb = col; }`)
      .replace('#include <normal_fragment_maps>', `
      #ifdef USE_NORMALMAP_TANGENTSPACE
      { vec3 gn = texture2D(normalMap, gW / 2.6).xyz * 2.0 - 1.0, sn = texture2D(uSandNor, gW / 4.1).xyz * 2.0 - 1.0;
        vec3 mapN = mix(gn, sn, gSheet); mapN.xy *= normalScale * gBump; normal = normalize(tbn * mapN); }
      #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.96, 0.88, gSoil);`);
  };
  mat.customProgramCacheKey = () => 'ground-gravel-plain';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 1, 1), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.y = -0.012; mesh.receiveShadow = true; mesh.name = 'ground';
  return mesh;
}

/* ------------------------------------------------------------ paver apron */
/** The terrace ring round the villa's plot: large honed limestone flags with fine joints and a low kerb, instead of a hard cut edge on the garden. */
function makeApron(plot: { x0: number; x1: number; z0: number; z1: number }) {
  const g = new THREE.Group(); g.name = 'apron'; const W = 1.2, Hc = 0.08;
  const tl = new THREE.TextureLoader(); const ld = (n: string, srgb = false) => { const t = tl.load(`${TEX}${n}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const mat = new THREE.MeshStandardMaterial({ color: '#d5c9b5', roughness: 0.66, map: ld('plaster_diff', true), normalMap: ld('plaster_nor'), normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.7 });
  // world-space mapping so the joints run continuously round the corners: 0.6 m flags, a 5 mm joint, each flag its own tone
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vAW;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n { vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; vAW = wp; vec2 wuv = (abs(normal.y) > 0.5 ? wp.xz : vec2(wp.x + wp.z, wp.y)) / 1.7; vMapUv = wuv; vNormalMapUv = wuv; }');
    sh.fragmentShader = 'varying vec3 vAW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      { float l = dot(texture2D(map, vMapUv).rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.374;
        vec2 f = vAW.xz / 0.6, id = floor(f), j = abs(fract(f) - 0.5);
        float tone = 0.93 + 0.14 * fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        float joint = 1.0 - smoothstep(0.488, 0.497, max(j.x, j.y));
        diffuseColor.rgb *= mix(1.0, l, 0.8) * tone * mix(0.5, 1.0, joint); }`);
  };
  mat.customProgramCacheKey = () => 'apron-flags';
  const slab = (x0: number, x1: number, z0: number, z1: number, y: number, h: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), mat); m.position.set((x0 + x1) / 2, y - h / 2, (z0 + z1) / 2); m.receiveShadow = true; g.add(m); };
  const I = 0.5; const x0 = plot.x0 + I, x1 = plot.x1 - I, z0 = plot.z0 + I, z1 = plot.z1 - I; // tuck under the plot's edge
  slab(x0 - W, x1 + W, z1, z1 + W, 0.02, 0.1); slab(x0 - W, x1 + W, z0 - W, z0, 0.02, 0.1); // front, back
  slab(x0 - W, x0, z0, z1, 0.02, 0.1); slab(x1, x1 + W, z0, z1, 0.02, 0.1);                 // sides
  const curb = (a: number, b: number, c: number, d: number) => slab(a, b, c, d, 0.02 + Hc, 0.2);
  curb(x0 - W - 0.12, x1 + W + 0.12, z1 + W, z1 + W + 0.12); curb(x0 - W - 0.12, x1 + W + 0.12, z0 - W - 0.12, z0 - W);
  curb(x0 - W - 0.12, x0 - W, z0 - W, z1 + W); curb(x1 + W, x1 + W + 0.12, z0 - W, z1 + W);
  return g;
}

/* ------------------------------------------------------------------ main */
async function loadGlb(url: string | undefined): Promise<GLTF | null> {
  if (!url) return null;
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);
  try { return await loader.loadAsync(url); } catch (e) { console.warn('[env] plant model failed', url, e); return null; } finally { draco.dispose(); }
}

export async function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, cfg: HouseConfig, tier: Tier, plot: { x0: number; x1: number; z0: number; z1: number }): Promise<Environment> {
  const group = new THREE.Group(); group.name = 'environment';
  const background = new THREE.Scene(); background.name = 'background';
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const skip = new Set((query.get('env') || '').split(',')); // dev: ?env=sky,mountains,street,cover,trees,oasis,apron,verge,clouds,birds,props,breathe,dust
  const props = await loadProps(cfg.props, skip.has('props'));
  const street = buildStreet(tier, plot, props);
  const blocks: [number, number, number, number][] = [[plot.x0 - 0.8, plot.x1 + 0.8, plot.z0 - 0.8, plot.z1 + 0.8], ...street.blocks, [-120, 120, street.compound.z1, street.paved.z1]];
  const inside = (x: number, z: number) => blocks.some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
  const sk: SkyCfg = cfg.sky;

  const [skyTex, tree] = await Promise.all([
    new THREE.TextureLoader().loadAsync(sk.image),
    tier === 'low' || skip.has('trees') ? null : loadGlb(cfg.plants?.tree),
  ]);
  skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.generateMipmaps = true; skyTex.minFilter = THREE.LinearMipmapLinearFilter; skyTex.wrapS = THREE.RepeatWrapping; skyTex.anisotropy = 4;
  const sunDir = new THREE.Vector3(...cfg.sun.dir).normalize();

  // image-based light from the same sky (highlights were soft-clipped when baking, so the sun disc in the
  // env map is only a glow: walls are not occluders for environment light and a real sun would leak indoors;
  // the real sun is the shadow-casting DirectionalLight instead). As a light the dome is cooled away from the sun
  // (`sky.fill`): at golden hour open shade is lit by blue sky while the sunlit faces are amber.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const small = downsample(skyTex.image as HTMLImageElement, 1024); small.generateMipmaps = false; small.minFilter = THREE.LinearFilter;
  const envScene = new THREE.Scene(); envScene.add(makeSky(small, sk, cfg.skyYaw, 50, sk.bounce ?? '#a8977c', sunDir, new THREE.Color(sk.fill ?? '#ffffff'))); // the ground's bounce from below
  const env = pmrem.fromScene(envScene, 0.02, 0.1, 100).texture; pmrem.dispose(); envScene.clear(); small.dispose();
  scene.environment = env; scene.environmentIntensity = sk.ambient ?? 0.62;
  const roomEnv = makeEnvironment(renderer);
  scene.background = null;
  const fog = new THREE.Fog(horizonColor(sk), sk.fogNear, sk.fogFar); scene.fog = fog;

  const sky = makeSky(skyTex, sk, cfg.skyYaw, 200, sk.ground, sunDir); if (!skip.has('sky')) background.add(sky);
  // the real range: long-range geometry in the background pass (its own camera, renderer.ts); `?env=mountains` skips it
  const tUrl = tier === 'low' ? cfg.terrain?.modelLite ?? cfg.terrain?.model : cfg.terrain?.model;
  const mountains = skip.has('mountains') || !tUrl ? null : await loadTerrain(tUrl, { sunDir, sunColor: new THREE.Color(cfg.sun.color), sunIntensity: cfg.sun.intensity, horizon: horizonColor(sk), warm: new THREE.Color(sk.warm ?? '#ffd2a0'), skyLight: new THREE.Color(sk.fill ?? '#a9b4c8').multiplyScalar(0.62), detail: tier !== 'low', shade: (cfg.terrain as { shade?: Partial<TerrainShade> } | undefined)?.shade, sky: { map: skyTex, yaw: cfg.skyYaw, intensity: sk.intensity } }).catch((e) => { console.warn('[terrain]', e); return null; });
  if (mountains) background.add(mountains.group);
  group.add(makeGround(tier, street, plot.x1 + 0.7));
  if (!skip.has('apron')) group.add(makeApron(plot));
  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && tier === 'high') cloudShadow(m.material as THREE.Material); }); // sun-facing outdoor surfaces get the passing clouds
  if (!skip.has('street')) group.add(street.group);
  const uTime = WORLD_TIME, wind = WIND;
  setWindDir(cfg.wind?.dir);
  if (tier !== 'off' && !skip.has('verge')) group.add(dressGround(props, tier, rand, street, inside, { uTime, uWind: wind }).group);
  const veg = plantVegetation(tier, inside, rand, tree, street, { uTime, uWind: wind }, props);
  if (!skip.has('trees')) group.add(veg.near);
  if (!skip.has('oasis')) group.add(veg.far);
  if (skip.has('cover') && veg.cover) veg.cover.visible = false;
  if (tier === 'high') for (const grp of [veg.near, veg.far, street.group]) grp.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.MeshStandardMaterial).emissiveMap) cloudShadow(m.material as THREE.Material, 0.5); });
  // the sky's life (all loop-safe): the photographed sky's own clouds are the clouds (painted veils over them read as
  // camouflage; ?clouds=1 brings them back for experiments), a flock far over the mountains, a few doves nearer the roofs
  const cloudTint = new THREE.Color(sk.warm ?? '#ffffff').lerp(new THREE.Color('#ffffff'), 0.6);
  const clouds = tier === 'high' && query.has('clouds') ? [makeClouds(cloudTint, 130, 0.42, 1, 9, 0), makeClouds(cloudTint, 170, 0.3, 1, 7, 0.37)] : [];
  for (const c of clouds) background.add(c.mesh);
  // (the pigeons wheel ~50 m out over the rooftops right of the big palm, x 820-1250 px / y 130-300 px of the hero, and the doves
  // cross at y ~100 px: both clear of the 1600 px landing's headline, x < 500 in English, in Arabic x > 1345 above y 300 and x > 1100 down to 470)
  const birds = tier === 'high' && !skip.has('birds') ? makeBirds(uTime) : null;
  if (birds) group.add(birds.mesh);
  scene.add(group);

  // the atmosphere breathes: fog reach, mountain haze and the sky's brightness swell and ease by a few percent on the
  // hero loop's period (every rate a multiple of 0.5 rad/s), scaled by the wind so the "motion off" quality step stills it
  const breathe = !skip.has('breathe'); const skyMat = sky.material as THREE.ShaderMaterial;
  const breatheStep = () => {
    const t = uTime.value, w = wind.value;
    fog.near = sk.fogNear * (1 + 0.04 * Math.sin(0.5 * t) * w); fog.far = sk.fogFar * (1 + 0.04 * Math.sin(0.5 * t + 0.9) * w);
    skyMat.uniforms.uIntensity.value = sk.intensity * (1 + 0.02 * Math.sin(0.5 * t + 2.6) * w);
    mountains?.hazeUniforms.forEach((u, i) => { u.value = 0.06 * (0.5 + 0.5 * Math.sin(0.5 * t + i * 1.3)) * w; });
  };

  return {
    group, background, roomEnv, props, grass: veg.cover, oasis: veg.far, trees: veg.near, wind,
    update(dt, camera) { uTime.value += dt; if (breathe) breatheStep(); sky.position.copy(camera.position); for (const c of clouds) { c.mesh.position.set(camera.position.x, c.altitude, camera.position.z); c.update(dt); } birds?.update(); },
    setInside(inside) { if (birds) birds.mesh.visible = !inside; for (const c of clouds) c.mesh.visible = !inside; },
    dispose() { env.dispose(); roomEnv.dispose(); skyTex.dispose(); background.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mt of mats) mt?.dispose?.(); }); group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mt of mats) mt?.dispose?.(); }); scene.remove(group); },
  };
}
