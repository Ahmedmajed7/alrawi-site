/**
 * What lies on the open ground beside the compound: weathered stones half sunk in the gravel (photoscanned desert
 * boulders, house.json `props`, toned to the pale Hajar limestone) and dry desert scrub, instanced, kept off the tyre
 * tracks that cross the two open plots. Missing props fall back to nothing; the ground shader (environment.ts) paints
 * the ground under it either way.
 */
import * as THREE from 'three';
import type { Tier } from '../common';
import type { Props } from './props';
import type { Street } from './street';
import { windify, cloudShadow } from './wind';
import { shrub, foliageAtlas } from './vegetation';
import { foliage } from './foliage';

export type { Rect } from './street';

/** The scanned boulders are a red-brown granite: keep their detail, turn them into pale, dusty limestone. */
function limestone(src: THREE.MeshStandardMaterial) {
  const mat = src.clone();
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    { float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 0.3) * vec3(1.5, 1.42, 1.28); }`); };
  mat.customProgramCacheKey = () => 'verge-limestone';
  return mat;
}
/** Dry scrub: the scans are a fresh green; sun-bleach them toward straw and grey. */
function parched(src: THREE.MeshStandardMaterial) {
  const mat = src.clone(); mat.side = THREE.DoubleSide; if (mat.alphaTest || mat.transparent) { mat.transparent = false; mat.alphaTest = Math.max(0.4, mat.alphaTest); }
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    { float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(vec3(l) * vec3(1.25, 1.12, 0.8), diffuseColor.rgb, 0.45); }`); };
  mat.customProgramCacheKey = () => 'verge-parched';
  return mat;
}
/** Every mesh of a prop, its node transforms baked, centred on its footprint and standing on y = 0, scaled so its largest footprint side is 1 m. */
function unit(props: Props, kind: string) {
  const g = props.get(kind); if (!g) return null;
  g.scene.updateMatrixWorld(true);
  const parts: [THREE.BufferGeometry, THREE.MeshStandardMaterial][] = []; const box = new THREE.Box3();
  g.scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const geo = m.geometry.clone().applyMatrix4(m.matrixWorld); geo.computeBoundingBox(); box.union(geo.boundingBox!); parts.push([geo, m.material as THREE.MeshStandardMaterial]); });
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), k = 1 / Math.max(s.x, s.z, 1e-6);
  for (const [geo] of parts) geo.translate(-c.x, -box.min.y, -c.z).scale(k, k, k);
  return { parts, height: s.y * k };
}

export function dressGround(props: Props, tier: Tier, rand: () => number, street: Street, inside: (x: number, z: number) => boolean, wind: { uTime: { value: number }; uWind: { value: number } }) {
  const group = new THREE.Group(); group.name = 'verge';
  const R = (a: number, b: number) => a + rand() * (b - a);
  const high = tier === 'high';
  // the tyre tracks of the ground shader (environment.ts makeGround): stones and scrub keep clear of them
  const onTrack = (i: number, x: number, z: number) => [0, 1].some((k) => { const g = street.gaps[i], xc = g.x0 + (g.x1 - g.x0) * (k ? 0.66 : 0.42) + (k ? -0.4 : 0.55) * Math.sin(z * (k ? 0.31 : 0.23) + i * 2.1 + k); return Math.abs(x - xc) < 1.35; });
  type Spot = { x: number; z: number; s: number; ry: number; sink: number };
  const spots = (n: number, size: [number, number], edge: number): Spot[] => {
    const out: Spot[] = [];
    street.gaps.forEach((g, i) => { for (let k = 0, guard = 0; k < n && guard++ < n * 40;) {
      const nearWall = rand() < edge, x = nearWall ? (rand() < 0.5 ? R(g.x0 + 0.5, g.x0 + 1.6) : R(g.x1 - 1.6, g.x1 - 0.5)) : R(g.x0 + 0.5, g.x1 - 0.5), z = R(g.z0 - 6, g.z1 - 0.2);
      if (onTrack(i, x, z) || inside(x, z)) continue;
      out.push({ x, z, s: R(...size), ry: R(0, Math.PI * 2), sink: R(0.18, 0.4) }); k++;
    } });
    return out;
  };
  const place = (kind: string, list: Spot[], tone: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial, sway?: { height: number; amp: number }) => {
    const u = unit(props, kind); if (!u || !list.length) return;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [geo, src] of u.parts) {
      const mat = tone(src); const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => { p.set(o.x, sway ? -0.02 : -u.height * o.s * o.sink, o.z); q.setFromAxisAngle(up, o.ry); s.setScalar(o.s); im.setMatrixAt(i, M.compose(p, q, s)); });
      im.castShadow = high; im.receiveShadow = true; im.frustumCulled = false; im.name = `verge_${kind}`;
      if (sway) windify(im, wind.uTime, wind.uWind, { base: 0.05, height: sway.height, amp: sway.amp, flutter: 0.6 });
      if (high) cloudShadow(mat, 0.5);
      group.add(im);
    }
  };
  // stones: one big one and a few smaller by the walls, a scatter of fist- to head-sized ones
  place('boulder4', spots(1, [1.1, 1.5], 1), limestone); place('boulder2', spots(2, [0.5, 0.9], 0.8), limestone);
  place('boulder6', spots(high ? 16 : 8, [0.14, 0.38], 0.45), limestone);
  // dry scrub: the photoscanned shrub, sun-bleached, and the grey-green mounds of the plain (Sodom apple, Rhazya) built here.
  // (The rooibos scan is not used: its 1k download has no alpha, its leaf cards rendered as black squares.)
  place('shrub4', spots(high ? 6 : 3, [0.5, 0.9], 0.5), parched, { height: 0.5, amp: 0.04 });
  const scrubSpots = spots(high ? 7 : 4, [0.7, 1.25], 0.7);
  if (scrubSpots.length) {
    const g = shrub(61, 0.62, 0.78, high ? 2600 : 900, ['#76826a', '#66735b', '#8a9478', '#58644c'], { leaf: 1.3, stems: 9, heads: 2, stem: '#8a7d6a' }); // grey, open, twiggy: the plain's Rhazya and Sodom apple
    const mat = foliage(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, envMapIntensity: 0.6, map: foliageAtlas(), alphaTest: 0.45, alphaToCoverage: true }), { trans: 0.25 });
    const im = new THREE.InstancedMesh(g, mat, scrubSpots.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    scrubSpots.forEach((o, i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(o.x, -0.03, o.z), q.setFromAxisAngle(up, o.ry), new THREE.Vector3(o.s, o.s * (0.8 + 0.3 * ((i * 7) % 5) / 4), o.s))));
    im.castShadow = high; im.receiveShadow = true; im.frustumCulled = false; im.name = 'verge_scrub';
    windify(im, wind.uTime, wind.uWind, { base: 0.05, height: 0.9, amp: 0.05, flutter: 0.7 }); if (high) cloudShadow(mat, 0.5);
    group.add(im);
  }
  return { group };
}
