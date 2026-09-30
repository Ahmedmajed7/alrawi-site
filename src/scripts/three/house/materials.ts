/**
 * The client's model arrived with named V-Ray materials but no texture links, so textures are
 * assigned here by material name (textures live in /textures/house/, 2K WebP).
 */
import * as THREE from 'three';

const tl = new THREE.TextureLoader();
let base = '/textures/house/';
const tex = (name: string, srgb = false, repeat = 1) => { const t = tl.load(`${base}${name}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };

type Rule = (old: THREE.MeshStandardMaterial) => THREE.Material;
const std = (o: Partial<THREE.MeshStandardMaterialParameters>) => new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.85, ...o });

const rules: Record<string, Rule> = {
  'concrete dark': () => std({ color: '#8f8b84', map: tex('concrete_diff', true, 2), normalMap: tex('concrete_nor', false, 2), roughness: 0.9 }),
  'white walls dirt': () => std({ color: '#ffffff', map: tex('wallpaint_diff', true, 2), normalMap: tex('plaster_nor', false, 2), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92 }),
  'wall grey': () => std({ color: '#e9e4db', map: tex('wallpaint_diff', true, 2), normalMap: tex('plaster_nor', false, 2), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92 }),
  'tiles dark': () => std({ color: '#5a5651', map: tex('tile_diff', true, 3), normalMap: tex('tile_nor', false, 3), roughnessMap: tex('tile_rough', false, 3), roughness: 0.8 }),
  'interior tile': () => std({ color: '#e9e4dc', map: tex('inttile_diff', true, 3), roughness: 0.35, metalness: 0.05 }),
  gravel: () => std({ color: '#b9b2a6', map: tex('gravel_diff', true, 8), normalMap: tex('gravel_nor', false, 8), roughnessMap: tex('gravel_rough', false, 8), roughness: 1 }),
  solar: () => std({ color: '#ffffff', map: tex('solar_diff', true, 1), normalMap: tex('solar_nor', false, 1), roughnessMap: tex('solar_rough', false, 1), metalness: 0.4, roughness: 0.3 }),
  'glass clear': () => new THREE.MeshPhysicalMaterial({ color: '#dfeaf0', roughness: 0.04, metalness: 0, transmission: 0.92, thickness: 0.05, ior: 1.5, transparent: true, opacity: 0.85, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
  'glass milky': () => new THREE.MeshPhysicalMaterial({ color: '#e8e6e2', roughness: 0.55, transmission: 0.55, thickness: 0.1, transparent: true, opacity: 0.8 }),
  'metal black': () => std({ color: '#141414', metalness: 0.9, roughness: 0.35 }),
  metal: () => std({ color: '#5a5a5a', metalness: 0.9, roughness: 0.4 }),
  light: () => std({ color: '#fff2dc', emissive: '#ffd9a8', emissiveIntensity: 2.2, roughness: 0.5 }),
  light2: () => std({ color: '#fff2dc', emissive: '#ffe1b8', emissiveIntensity: 1.6, roughness: 0.5 }),
};

export function applyHouseMaterials(root: THREE.Object3D, lite = false) {
  base = lite ? '/textures/house/1k/' : '/textures/house/';
  const cache = new Map<string, THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map((mat) => {
      const key = (mat.name || '').trim().toLowerCase();
      const rule = rules[key]; if (!rule) return mat;
      if (!cache.has(key)) { const nm = rule(mat as THREE.MeshStandardMaterial); nm.name = mat.name; cache.set(key, nm); }
      return cache.get(key)!;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
    if (/glass/.test((m.material as THREE.Material).name.toLowerCase())) m.castShadow = false;
  });
}

/**
 * The Tripo villa: one mesh, one baked albedo atlas. Rebuild its material with tiled detail on a second,
 * planar-projected UV set so plaster reads sharp even 1 m from the wall: a normal map sampled at two scales
 * (no visible tiling), a roughness map, a slow large-scale tonal variation over the render, and a dusty
 * plinth band where the walls meet the ground — the things that separate limewash from plastic.
 */
export function applyShellMaterial(root: THREE.Object3D, opts: { detailNormal: string; detailTiles: number; detailScale: number; roughness: number; envMapIntensity: number; roughnessMap?: string; color?: string; lightMap?: string; lightMapIntensity?: number }, lite = false) {
  let detail: THREE.Texture | null = null, rough: THREE.Texture | null = null, plaster: THREE.Texture | null = null, lightMap: THREE.Texture | null = null;
  const tl = new THREE.TextureLoader();
  // A baked lightmap (Blender: second UV layer → Lightmap Pack → bake Diffuse indirect+direct, no colour → export glTF with both UV
  // sets; docs/house-model.md) lives on the glTF's own TEXCOORD_1 = three's `uv1`, so the projected detail tiles move to `uv2`.
  const detailUv = opts.lightMap ? 2 : 1;
  if (opts.lightMap) { lightMap = tl.load(opts.lightMap); lightMap.channel = 1; lightMap.flipY = false; lightMap.colorSpace = THREE.SRGBColorSpace; lightMap.anisotropy = 8; }
  if (!lite) {
    detail = tl.load(opts.detailNormal); detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.channel = detailUv; detail.anisotropy = 8;
    if (opts.roughnessMap) { rough = tl.load(opts.roughnessMap); rough.wrapS = rough.wrapT = THREE.RepeatWrapping; rough.channel = detailUv; rough.anisotropy = 4; }
    plaster = tl.load('/textures/interior/plaster_diff.webp'); plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping; plaster.colorSpace = THREE.SRGBColorSpace; plaster.anisotropy = 8;
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const old = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const map = old.map ?? null; if (map) { map.anisotropy = 16; map.colorSpace = THREE.SRGBColorSpace; }
    const mat = new THREE.MeshStandardMaterial({ map, color: opts.color ?? '#e2ddd6', roughness: opts.roughness, metalness: 0, envMapIntensity: opts.envMapIntensity });
    if (lightMap && m.geometry.attributes.uv1) { mat.lightMap = lightMap; mat.lightMapIntensity = opts.lightMapIntensity ?? 1; }
    if (detail) {
      bakeProjectedUv(m.geometry, opts.detailTiles, `uv${detailUv}`); mat.normalMap = detail; mat.normalScale.set(opts.detailScale, opts.detailScale);
      if (rough) mat.roughnessMap = rough;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uPlaster = { value: plaster };
        sh.vertexShader = 'varying vec3 vShellW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vShellW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'varying vec3 vShellW; uniform sampler2D uPlaster;\nfloat shellHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat shellNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(shellHash(i), shellHash(i+vec2(1,0)), f.x), mix(shellHash(i+vec2(0,1)), shellHash(i+vec2(1,1)), f.x), f.y); }\n' + sh.fragmentShader
          // second, larger normal sample blended in: the detail tile never repeats visibly
          .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
            vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 0.31 + vec2(0.37, 0.61) ).xyz * 2.0 - 1.0;
            mapN = normalize(mix(mapN, mapN2, 0.5)); mapN.xy *= normalScale;
            normal = normalize( tbn * mapN );
          #endif`)
          .replace('#include <map_fragment>', `#include <map_fragment>
          { // slow tonal variation over the render (two octaves), a little warmer and darker low down, dust at the plinth
            float n = shellNoise(vShellW.xz * 0.35 + vShellW.y * 0.2) * 0.6 + shellNoise(vShellW.xz * 1.3 + vShellW.y * 0.7) * 0.4;
            diffuseColor.rgb *= mix(0.94, 1.05, n);
            float trowel = texture2D(uPlaster, vNormalMapUv * 0.27).r; // real limewash trowel marks over the baked albedo
            diffuseColor.rgb *= mix(1.0, 0.72 + trowel * 0.34, 0.7);
            float low = 1.0 - smoothstep(0.0, 0.45, vShellW.y);
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.83, 0.78), low * 0.9);
          }`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          { float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); roughnessFactor *= mix(1.04, 0.9, smoothstep(0.35, 0.85, lum)); }`);
      };
      mat.customProgramCacheKey = () => 'villa-shell';
    }
    m.material = mat; m.castShadow = true; m.receiveShadow = true;
  });
}
/** `attr` (uv1 by default) = dominant-axis planar projection of the local position (tiles per metre). */
function bakeProjectedUv(g: THREE.BufferGeometry, tiles: number, attr = 'uv1') {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute | undefined;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = n ? Math.abs(n.getX(i)) : 0, ny = n ? Math.abs(n.getY(i)) : 1, nz = n ? Math.abs(n.getZ(i)) : 0;
    let u: number, v: number;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * tiles; uv[i * 2 + 1] = v * tiles;
  }
  g.setAttribute(attr, new THREE.BufferAttribute(uv, 2));
}
