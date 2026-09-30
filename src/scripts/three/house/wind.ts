/**
 * Wind for foliage. One wind blows across the whole garden (house.json `wind.dir`, world XZ): every plant bends
 * *downwind* about its base — a cantilever curve, so trunks bend and crowns lean instead of sliding — and the gust
 * pumps the lean back and forth along that one axis, with only a small cross-wind term, so nothing ever traces a
 * circle. The displacement is computed in world space (height above each instance's own base, the shared wind
 * direction) and converted into the mesh's local space, so randomly rotated instances and multi-node photoscans all
 * move the same way. Palm fronds also pivot at their own roots (attributes aFrond/aArc): they bend with the gust,
 * bob on their own phase and their pinnae shiver. The same displacement is patched into a depth material so the
 * shadows move with the leaves. Every term is a multiple of 0.5 rad/s, which keeps the recorded hero loop (4π s)
 * seamless. `uWind` scales everything (0 = still).
 */
import * as THREE from 'three';

/** The world's clock (seconds), advanced once per frame by the environment; every animated material reads it. */
export const WORLD_TIME = { value: 0 };
/** 0 = every leaf still (quality step), 1 = full wind. */
export const WIND = { value: 1 };
/** The direction the wind blows toward, world XZ (normalised); set from house.json `wind.dir`. */
export const WIND_DIR = { value: new THREE.Vector2(0.6, -0.8).normalize() };
export function setWindDir(dir?: [number, number]) { if (dir) WIND_DIR.value.set(dir[0], dir[1]).normalize(); }

export interface WindOpts {
  /** world height above the plant's base where the bend starts (m) */ base: number;
  /** world height of full bend, the crown (m) */ height: number;
  /** metres of lean at the crown in a full gust */ amp: number;
  /** share of `amp` in the fast leaf flutter */ flutter?: number;
  /** palm fronds (geometry carries aFrond = root xyz + phase, aArc = 0 root … 1 tip): radians of downwind bend at the tip */ fronds?: number;
}

const patched = new WeakSet<THREE.Material>();
const f = (v: number) => v.toFixed(3);
function inject(mat: THREE.Material, uTime: { value: number }, uWind: { value: number }, o: WindOpts) {
  if (patched.has(mat)) return; patched.add(mat);
  const prev = mat.onBeforeCompile;
  const FR = o.fronds !== undefined;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uTime = uTime; sh.uniforms.uWind = uWind; sh.uniforms.uWindDir = WIND_DIR;
    sh.vertexShader = `uniform float uTime, uWind; uniform vec2 uWindDir;\n${FR ? 'attribute vec4 aFrond; attribute float aArc;\n' : ''}` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          mat4 wM = modelMatrix * instanceMatrix;
        #else
          mat4 wM = modelMatrix;
        #endif
        vec3 wBase = (wM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 W = normalize(vec3(uWindDir.x, 0.0, uWindDir.y)), Wx = vec3(-W.z, 0.0, W.x);
        float ph = wBase.x * 0.37 + wBase.z * 0.23;
        // the gust: mostly positive (a steady downwind lean that pumps), never a rotation
        float gust = 0.55 + 0.30 * sin(uTime * 0.5 + ph) + 0.12 * sin(uTime * 1.5 + ph * 1.7 + 1.3) + 0.05 * sin(uTime * 3.0 + ph * 0.6 + 0.4);
        float xw = 0.12 * sin(uTime * 2.5 + ph * 2.0 + 0.7);
        vec3 wp = (wM * vec4(transformed, 1.0)).xyz;
        ${FR ? 'vec3 pivot = (wM * vec4(aFrond.xyz, 1.0)).xyz; float hgt = pivot.y - wBase.y; // a frond rides on the trunk top as one piece' : 'float hgt = wp.y - wBase.y;'}
        float k = smoothstep(${f(o.base)}, ${f(o.height)}, hgt); k = k * k * uWind; // cantilever: the top bends most
        float fl = (sin(uTime * 3.0 + position.x * 5.1 + position.z * 3.7 + ph) + 0.5 * sin(uTime * 5.0 + position.y * 2.3 + ph)) * ${f(o.flutter ?? 0.15)};
        vec3 d = ${f(o.amp)} * k * ((gust + fl * 0.4) * W + xw * Wx);
        d.y += ${f(o.amp)} * k * fl * 0.3 - 0.5 * dot(d.xz, d.xz) / ${f(Math.max(o.height, 0.5))}; // a bent stem dips a little: its length is kept
        ${FR ? `{ // the frond pivots at its root: bends downwind with the gust, bobs on its own phase, the pinnae shiver
          vec3 v = wp - pivot; float s2 = aArc * aArc * uWind;
          vec3 A = normalize(cross(vec3(0.0, 1.0, 0.0), W));
          float a = ${f(o.fronds!)} * s2 * (gust * 0.8 + 0.35 * sin(uTime * 3.0 + aFrond.w));
          vec3 r1 = v * cos(a) + cross(A, v) * sin(a) + A * dot(A, v) * (1.0 - cos(a));
          vec3 hz = vec3(r1.x, 0.0, r1.z); vec3 B = length(hz) > 1e-3 ? normalize(cross(vec3(0.0, 1.0, 0.0), hz)) : A;
          float b = 0.07 * aArc * uWind * sin(uTime * 3.0 + aFrond.w * 1.3 + 0.8);
          vec3 r2 = r1 * cos(b) + cross(B, r1) * sin(b) + B * dot(B, r1) * (1.0 - cos(b));
          d += r2 - v;
          d.y += 0.012 * aArc * uWind * sin(uTime * 5.0 + aFrond.w + position.x * 3.0);
        }` : ''}
        transformed += inverse(mat3(wM)) * d; // world displacement → this mesh's local space (rotated instances, node transforms)
      }`);
  };
  const key = mat.customProgramCacheKey; const suffix = `-wind2-${o.base}-${o.height}-${o.amp}-${o.flutter ?? 0.15}-${o.fronds ?? 'x'}`;
  mat.customProgramCacheKey = key ? () => key.call(mat) + suffix : () => suffix;
}

/** Make `mesh` (and its shadow) sway. Materials are patched once (first options win); a depth material is added per mesh. */
export function windify(mesh: THREE.Mesh, uTime: { value: number }, uWind: { value: number }, o: WindOpts) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) inject(m, uTime, uWind, o);
  const src = mats[0] as THREE.MeshStandardMaterial;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: src.map ?? null, alphaTest: src.alphaTest || 0, side: src.side });
  inject(depth, uTime, uWind, o);
  mesh.customDepthMaterial = depth;
  return mesh;
}

/** Tileable cloud cover for the shadow pass: broad soft cells, ~40 % coverage, in the red channel. */
let coverTex: THREE.Texture | null = null;
function coverTexture(size = 512) {
  if (coverTex) return coverTex;
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!;
  const img = g.createImageData(size, size); const d = img.data;
  let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const oct = 4, P = 3, grids: Float32Array[] = [];
  for (let o = 0; o < oct; o++) { const w = P << o, gr = new Float32Array(w * w); for (let i = 0; i < gr.length; i++) gr[i] = rnd(); grids.push(gr); }
  const noise = (u: number, v: number) => { let sum = 0, amp = 0.5, norm = 0; for (let o = 0; o < oct; o++) { const w = P << o, gr = grids[o]; const x = u * w, y = v * w; const xi = Math.floor(x), yi = Math.floor(y); const tx = x - xi, ty = y - yi; const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const x0 = ((xi % w) + w) % w, x1 = (x0 + 1) % w, y0 = ((yi % w) + w) % w, y1 = (y0 + 1) % w; const a = gr[y0 * w + x0] + (gr[y0 * w + x1] - gr[y0 * w + x0]) * sx, b = gr[y1 * w + x0] + (gr[y1 * w + x1] - gr[y1 * w + x0]) * sx; sum += (a + (b - a) * sy) * amp; norm += amp; amp *= 0.5; } return sum / norm; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const n = noise(x / size, y / size); const v = Math.min(1, Math.max(0, (n - 0.44) / 0.2)); const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  coverTex = new THREE.CanvasTexture(c); coverTex.wrapS = coverTex.wrapT = THREE.RepeatWrapping; coverTex.colorSpace = THREE.NoColorSpace; return coverTex;
}
const shadowed = new WeakSet<THREE.Material>();
/**
 * Cloud shadows: soft bands of cover drift across the ground and the walls (one tile of 240 m per hero loop,
 * so the recording seams), dimming the direct sun only — the sky light is untouched, exactly as a passing
 * cloud does. Applied to every sunlit outdoor material.
 */
/** The cover drifts exactly one tile per hero loop (4π s) along x only, so the recorded loop seams (a fractional v-drift did not). */
export function cloudShadow(mat: THREE.Material, strength = 0.55) {
  if (shadowed.has(mat)) return mat; shadowed.add(mat);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uTime = WORLD_TIME; sh.uniforms.uCover = { value: coverTexture() }; sh.uniforms.uCoverK = { value: strength };
    sh.vertexShader = 'varying vec3 vCoverW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vCoverW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D uCover; uniform float uTime, uCoverK; varying vec3 vCoverW;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { vec2 cuv = vCoverW.xz / 240.0 + vec2(uTime, 0.0) / 12.566370614; float cov = texture2D(uCover, cuv).r; float k = 1.0 - uCoverK * smoothstep(0.25, 0.9, cov);
        reflectedLight.directDiffuse *= k; reflectedLight.directSpecular *= k; }`);
  };
  const key = mat.customProgramCacheKey; mat.customProgramCacheKey = key ? () => key.call(mat) + '-cloudshadow' : () => 'cloudshadow';
  return mat;
}
