/**
 * How a leaf takes the light. Two changes to the standard material, shared by every plant outdoors:
 *  - the normals the geometry carries are kept on both faces (no back-face flip): foliage builders bend each leaf's normal
 *    toward the outside of its crown or mound, so a crown shades as one soft volume, sunlit on one side and in its own shade
 *    on the other, instead of a speckle of leaves that go black whenever their back is to the lens;
 *  - the sun shines through: a leaf lit from the far side glows a warmer, yellower version of its colour, most when the lens
 *    looks toward the sun (thin leaves and papery bracts at golden hour). The term reads the shadowed sun, so leaves in the
 *    shade of others stay dark.
 * Chains onBeforeCompile and the program cache key, so wind.ts and cloudShadow() can patch the same material after it.
 */
import * as THREE from 'three';

export interface FoliageOpts { /** 0 … 1: how much sun passes through (palm leaflets ~0.4, bracts ~0.7) */ trans: number; /** colour the light takes on passing through (multiplies the albedo) */ tint?: THREE.ColorRepresentation }
const done = new WeakSet<THREE.Material>();
export function foliage<T extends THREE.MeshStandardMaterial>(mat: T, o: FoliageOpts): T {
  if (done.has(mat)) return mat; done.add(mat);
  const tint = new THREE.Color(o.tint ?? '#ffe98a');
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uLeafTrans = { value: o.trans }; sh.uniforms.uLeafTint = { value: tint };
    sh.fragmentShader = 'uniform float uLeafTrans; uniform vec3 uLeafTint;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      #if NUM_DIR_LIGHTS > 0
      { // the sun through the leaf: directLight is the (shadowed) sun, the last light lights_fragment_begin evaluated
        float behind = saturate(-dot(geometryNormal, directLight.direction));
        float toward = pow(saturate(dot(-geometryViewDir, directLight.direction)), 3.0);
        reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * uLeafTint * uLeafTrans * (0.3 * behind + 0.9 * toward * (0.35 + 0.65 * behind));
      }
      #endif`);
  };
  const key = mat.customProgramCacheKey; const suffix = `-foliage-${o.trans}-${tint.getHexString()}`;
  mat.customProgramCacheKey = key ? () => key.call(mat) + suffix : () => suffix;
  return mat;
}

/**
 * Landscape uplights: in-ground fixtures at the foot of a palm, aimed up (a 2700 K beam, ~35° wide, soft edge). The garden's
 * lights have just come on at sunset: the beam grazes the trunk (bright low, fading as it climbs, the grazing angle drawing out
 * every leaf base) and warms the underside of the crown. Lambert only, unshadowed, no per-frame state; `fixtures` are world
 * positions with their intensity (candela-like: irradiance = w · cosθ / d²). Chains like foliage().
 */
const lit = new WeakSet<THREE.Material>();
export function uplit<T extends THREE.MeshStandardMaterial>(mat: T, fixtures: [number, number, number, number][], color: THREE.ColorRepresentation = '#ffa860'): T {
  if (lit.has(mat) || !fixtures.length) return mat; lit.add(mat);
  const F = fixtures.slice(0, 4).map(([x, y, z, w]) => new THREE.Vector4(x, y, z, w)); while (F.length < 4) F.push(new THREE.Vector4(0, -100, 0, 0));
  const col = new THREE.Color(color);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uUpF = { value: F }; sh.uniforms.uUpC = { value: col };
    sh.vertexShader = 'varying vec3 vUpW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 up4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          up4 = instanceMatrix * up4;
        #endif
        vUpW = (modelMatrix * up4).xyz; }`);
    sh.fragmentShader = 'uniform vec4 uUpF[4]; uniform vec3 uUpC; varying vec3 vUpW;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float upE = 0.0;
        for (int i = 0; i < 4; i++) {
          vec3 Lw = uUpF[i].xyz - vUpW; float d2 = max(dot(Lw, Lw), 0.36); vec3 L = Lw * inversesqrt(d2);
          float cone = smoothstep(0.8, 0.93, -L.y); // the beam: full within ~21° of vertical, gone past ~37°
          upE += uUpF[i].w * cone * max(dot(normal, normalize((viewMatrix * vec4(L, 0.0)).xyz)), 0.0) / d2;
        }
        reflectedLight.directDiffuse += upE * uUpC * BRDF_Lambert(diffuseColor.rgb); }`);
  };
  const key = mat.customProgramCacheKey; const suffix = `-uplit-${fixtures.length}`;
  mat.customProgramCacheKey = key ? () => key.call(mat) + suffix : () => suffix;
  return mat;
}
