/**
 * The villa's compound and its street: an upscale Muscat residential street at golden hour. Smooth rendered boundary
 * walls with a honed stone coping and pilasters (ours carry recessed light slots), an open slatted gate and a sliding
 * driveway gate, the garage; a sunken asphalt carriageway with precast kerbs, a dropped kerb at the driveway and an
 * interlock pavement; planted strips at the foot of the walls; contemporary tapered lamp poles; and the neighbourhood —
 * walled plots with white and sand-coloured contemporary villas (real window reveals with stone surrounds, string courses
 * and cornices, windows with sheers, blinds, dim rooms and the odd lamp behind them, parapets, roof stair rooms, water
 * tanks, AC condensers, dishes, lanterns on the gate pillars). Everything is boxes cut around their openings: no two visible faces ever share a plane
 * (coplanar faces z-fought and flashed in the recorded film), and every surface is mapped by world position.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { microNormal } from '../procedural/kit';
import type { Tier } from '../common';
import type { Props } from './props';

const TEX = '/textures/env/';
export type Rect = { x0: number; x1: number; z0: number; z1: number };
/** A wall top a climber may spill over: the run (along x when `axis` is 'x', along z otherwise), the wall's centre line, its top and the side the plant hangs down. */
export interface Spill { axis: 'x' | 'z'; at: number; a0: number; a1: number; top: number; side: 1 | -1; thick: number; /** on our own wall (the neighbours grow another variety) */ mine: boolean }
export interface Street {
  group: THREE.Group; /** footprints trees, grass and shrubs must keep clear of (x0, x1, z0, z1) */ blocks: [number, number, number, number][];
  /** the walled compound (garden inside, open ground outside) */ compound: Rect; road: { z0: number; z1: number }; /** everything paved between the two back edges of the pavements */ paved: { z0: number; z1: number };
  /** planted strips at the foot of our walls (soil, ground cover) */ beds: Rect[]; /** the neighbours' walled plots */ lots: Rect[]; /** the open plots either side of ours */ gaps: Rect[];
  /** our wall tops the bougainvillea spills over */ spills: Spill[]; /** paved ground inside the compound (driveway, path): plants keep off */ drives: Rect[];
}

type Geo = THREE.BufferGeometry;
const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const tint = (g: Geo, c: THREE.Color) => { const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
const lcg = (seed: number) => { let a = (seed * 9301 + 49297) % 233280 || 1; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; };
const uniq = (v: number[]) => [...new Set(v.map((x) => +x.toFixed(4)))].sort((a, b) => a - b);

function maps(name: string, rough = true) {
  const tl = new THREE.TextureLoader();
  const load = (suffix: string, srgb = false) => { const t = tl.load(`${TEX}${name}_${suffix}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: load('diff', true), normalMap: load('nor'), ...(rough ? { roughnessMap: load('rough') } : {}) };
}
/**
 * Textures by world position (metres per tile) so joints and grain run continuously around corners. The colour map only
 * modulates the material's own colour (its luminance around `mean`, by `keep`): one scan serves every tint. `weather`
 * lays dust at the foot of walls and faint runs under the copings; `extra` is GLSL run on diffuseColor afterwards (vWp = world position).
 */
function surface<T extends THREE.MeshStandardMaterial>(mat: T, o: { tile: number; key: string; mean: number; keep?: number; weather?: number; extra?: string; uniforms?: Record<string, THREE.IUniform> }): T {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, o.uniforms ?? {});
    sh.vertexShader = 'varying vec3 vWp; varying vec3 vWn;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      { vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; vec3 wn = normalize(mat3(modelMatrix) * normal); vec3 an = abs(wn); vWp = wp; vWn = wn;
        vec2 wuv = (an.y > 0.5 ? wp.xz : an.x > an.z ? vec2(wp.z, wp.y) : wp.xy) / ${o.tile.toFixed(3)};
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wuv;
        #endif
      }`);
    sh.fragmentShader = 'varying vec3 vWp; varying vec3 vWn;\n' + Object.keys(o.uniforms ?? {}).map((k) => `uniform ${typeof o.uniforms![k].value === 'number' ? 'float' : o.uniforms![k].value instanceof THREE.Vector4 ? 'vec4' : 'vec3'} ${k};`).join('\n') + '\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
      { float l = dot(texture2D(map, vMapUv).rgb, vec3(0.2126, 0.7152, 0.0722)) / ${o.mean.toFixed(3)};
        float big = dot(texture2D(map, vMapUv * 0.083 + 0.37).rgb, vec3(0.3333)) / ${o.mean.toFixed(3)}; // a second, broad read of the same scan: no visible tile
        diffuseColor.rgb *= mix(1.0, l, ${(o.keep ?? 0.8).toFixed(2)}) * mix(1.0, big, 0.35);
        ${o.weather ? `{ float n = texture2D(map, vWp.xz * 0.23 + vWp.y * 0.11).g / ${o.mean.toFixed(3)}; float up = 1.0 - abs(vWn.y);
          float foot = (1.0 - smoothstep(0.0, 0.35 + 0.35 * n, vWp.y)) * up;                                       // dust and splash at the foot
          float run = smoothstep(0.62, 1.0, texture2D(map, vec2((vWp.x + vWp.z) * 0.9, vWp.y * 0.035)).g / ${o.mean.toFixed(3)} * 0.8) * up; // faint runs down the face
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.43, 0.35, 0.26) * (0.8 + 0.3 * n), foot * ${(0.55 * o.weather).toFixed(2)});
          diffuseColor.rgb *= 1.0 - run * ${(0.1 * o.weather).toFixed(3)}; }` : ''}
        ${o.extra ?? ''} }
      #endif`);
  };
  mat.customProgramCacheKey = () => o.key;
  return mat;
}

interface Buckets { wall: Geo[]; roof: Geo[]; stone: Geo[]; glass: Geo[]; /** window panes (windowGlass): each carries `aWin` */ pane: Geo[]; frame: Geo[]; timber: Geo[]; metal: Geo[]; white: Geo[]; lamp: Geo[]; /** lantern glass: a softer glow than the LED lines */ glow: Geo[] }
const buckets = (): Buckets => ({ wall: [], roof: [], stone: [], glass: [], pane: [], frame: [], timber: [], metal: [], white: [], lamp: [], glow: [] });
/** A window pane: a thin box whose outward face carries uv 0..1 across the opening (BoxGeometry maps every face as seen from outside); `aWin` = (width, height, a per-window random, lit) for windowGlass(). */
function pane(g: Geo, w: number, h: number, lit: boolean) {
  g.computeBoundingBox(); const c = g.boundingBox!.getCenter(new THREE.Vector3());
  const r = Math.abs(Math.sin(c.x * 12.9898 + c.y * 78.233 + c.z * 37.719) * 43758.5453) % 1;
  const n = g.attributes.position.count, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set([w, h, r, lit ? 1 : 0], i * 4);
  g.setAttribute('aWin', new THREE.BufferAttribute(a, 4)); return g;
}
/**
 * The neighbours' windows. Seen from the street a Muscat window is rarely a black hole: most hang sheers drawn across
 * for privacy (they catch the daylight through the glass and read pale), some are parted on a dim room, a few have a
 * roller blind half down, and in the golden hour a lamp is on here and there. Behind a glass that mirrors the sky at a
 * grazing look (F0 ~0.1, a solar coating) the room is traced as a box (walls, floor, ceiling, a sofa's dark mass on the
 * back wall) from the pane's own coordinates, so it has true parallax as the camera moves; the sheer hangs 12 cm behind
 * the glass with folds that fade out before they can alias. The sheer is lit as a surface (it follows the facade's sun
 * and shadow); the room is its own dim light.
 */
function windowGlass() {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, specularColor: new THREE.Color(2.6, 2.6, 2.6), envMapIntensity: 1.1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRoom = { value: 0.1 }; sh.uniforms.uLamp = { value: 1.5 };
    sh.vertexShader = 'attribute vec4 aWin; varying vec4 vWin; varying vec2 vWinUv; varying vec3 vWinP, vWinN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vWin = aWin; vWinUv = uv; vWinP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWinN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = 'uniform float uRoom, uLamp; varying vec4 vWin; varying vec2 vWinUv; varying vec3 vWinP, vWinN; vec3 gWinGlow = vec3(0.0);\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      { vec3 n = normalize(vWinN); float W = vWin.x, Hh = vWin.y, r = vWin.z, lit = vWin.w;
        if (abs(n.y) > 0.5) diffuseColor.rgb = vec3(0.03); else {
        vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n)), V = normalize(vWinP - cameraPosition);
        vec3 d = vec3(dot(V, t), V.y, max(-dot(V, n), 0.02)); // into the room: +z
        vec2 p = vWinUv * vec2(W, Hh);
        float D = 3.4 + 2.6 * fract(r * 7.13), side = 1.0 + 1.4 * fract(r * 3.71), fl = -0.9, ce = Hh + 0.45;
        float tx = d.x > 0.0 ? (W + side - p.x) / max(d.x, 1e-4) : (p.x + side) / max(-d.x, 1e-4);
        float ty = d.y > 0.0 ? (ce - p.y) / max(d.y, 1e-4) : (p.y - fl) / max(-d.y, 1e-4);
        float tz = D / d.z, tt = min(min(tx, ty), tz); vec3 q = vec3(p, 0.0) + d * tt;
        vec3 wallC = mix(vec3(0.62, 0.56, 0.48), vec3(0.5, 0.52, 0.5), step(0.7, fract(r * 17.3)));
        vec3 room = tt == tz ? wallC : tt == ty ? (d.y < 0.0 ? vec3(0.3, 0.24, 0.19) : vec3(0.7, 0.68, 0.64) * 0.55) : wallC * 0.8;
        if (tt == tz && q.y < fl + 0.85 && abs(q.x - W * (0.3 + 0.4 * fract(r * 2.9))) < 1.1) room = vec3(0.16, 0.13, 0.11); // a sofa against the back wall
        room *= mix(1.0, 0.4, clamp(q.z / D, 0.0, 1.0)) * uRoom; // daylight from this window only: the back of the room is dim
        vec3 lampC = vec3(1.0, 0.62, 0.34) * uLamp;
        room += lit * lampC * (0.08 + 0.3 * exp(-dot(q.xz - vec2(W * 0.5, D * 0.55), q.xz - vec2(W * 0.5, D * 0.55)) / 3.0)) * (tt == ty && d.y > 0.0 ? 1.4 : 1.0);
        // the sheer, 12 cm behind the glass (parallax), or a roller blind
        vec2 s = p + d.xy * (0.12 / d.z); vec2 su = s / vec2(W, Hh);
        float mode = fract(r * 13.7), cover = 0.0, opac = 0.82;
        if (mode < 0.52) cover = 1.0;
        else if (mode < 0.76) cover = step((0.12 + 0.3 * fract(r * 5.3)) * 0.5, abs(su.x - 0.5 - 0.15 * (fract(r * 8.1) - 0.5)));
        else if (mode < 0.88) { cover = step(1.0 - (0.3 + 0.45 * fract(r * 9.1)), su.y); opac = 1.0; }
        float fw = fwidth(s.x), fold = sin(s.x * 57.1 + r * 40.0) * (1.0 - smoothstep(0.012, 0.04, fw));
        vec3 sheer = mode < 0.76 ? vec3(0.84, 0.8, 0.72) * (0.9 + 0.1 * fold) * (0.92 + 0.08 * smoothstep(0.0, 0.2, su.y)) : vec3(0.5, 0.46, 0.4);
        vec3 T = vec3(0.84, 0.88, 0.86); float k = cover * opac;
        diffuseColor.rgb = T * T * sheer * k * 0.75;
        gWinGlow = T * room * (1.0 - k) + lit * k * T * lampC * (mode < 0.76 ? 0.42 : 0.12) * (0.75 + 0.25 * fold) * (0.6 + 0.4 * smoothstep(0.0, 0.5, su.y));
        } }`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gWinGlow;');
  };
  mat.customProgramCacheKey = () => 'street-window-glass';
  return mat;
}
interface Face { axis: 'x' | 'z'; /** the face's plane */ at: number; /** which way it looks along the other axis */ out: 1 | -1; a0: number; a1: number; y0: number; y1: number; /** wall thickness behind the face */ t: number }
interface Hole { a0: number; a1: number; y0: number; y1: number; kind: 'glass' | 'lit' | 'timber' | 'lamp' | 'void'; /** vertical glazing bars */ bars?: number; /** how far the pane sits behind the face */ depth?: number }

/**
 * A wall face with real openings. The wall is cut into blocks around them (neighbouring blocks share edges, never
 * faces), so every opening has a true reveal that catches the sun and holds a shadow; panes, frames and doors sit
 * back inside it, each face on a plane of its own.
 */
function facade(B: Buckets, f: Face, holes: Hole[], c: THREE.Color) {
  const at = (a0: number, a1: number, y0: number, y1: number, d0: number, d1: number) => (f.axis === 'z' ? slab(a0, a1, y0, y1, f.at - f.out * d0, f.at - f.out * d1) : slab(f.at - f.out * d0, f.at - f.out * d1, y0, y1, a0, a1));
  const hs = holes.map((h) => ({ ...h, a0: Math.max(h.a0, f.a0), a1: Math.min(h.a1, f.a1), y0: Math.max(h.y0, f.y0), y1: Math.min(h.y1, f.y1) })).filter((h) => h.a1 - h.a0 > 0.05 && h.y1 - h.y0 > 0.05);
  const as = uniq([f.a0, f.a1, ...hs.flatMap((h) => [h.a0, h.a1])]), ys = uniq([f.y0, f.y1, ...hs.flatMap((h) => [h.y0, h.y1])]);
  for (let j = 0; j < ys.length - 1; j++) {
    const my = (ys[j] + ys[j + 1]) / 2; let start = -1;
    for (let i = 0; i < as.length; i++) {
      const ma = i < as.length - 1 ? (as[i] + as[i + 1]) / 2 : 0;
      const open = i === as.length - 1 || hs.some((h) => ma > h.a0 && ma < h.a1 && my > h.y0 && my < h.y1);
      if (!open && start < 0) start = i;
      if (open && start >= 0) { B.wall.push(tint(at(as[start], as[i], ys[j], ys[j + 1], 0, f.t), c)); start = -1; }
    }
  }
  for (const h of hs) {
    if (h.kind === 'void') continue;
    const d = h.depth ?? 0.14;
    if (h.kind !== 'glass' && h.kind !== 'lit') { B[h.kind].push(at(h.a0, h.a1, h.y0, h.y1, d, d + 0.02)); continue; }
    B.pane.push(pane(at(h.a0, h.a1, h.y0, h.y1, d, d + 0.02), h.a1 - h.a0, h.y1 - h.y0, h.kind === 'lit'));
    const fw = 0.05;
    B.frame.push(at(h.a0, h.a0 + fw, h.y0, h.y1, d - 0.04, d), at(h.a1 - fw, h.a1, h.y0, h.y1, d - 0.04, d), at(h.a0 + fw, h.a1 - fw, h.y0, h.y0 + fw, d - 0.04, d), at(h.a0 + fw, h.a1 - fw, h.y1 - fw, h.y1, d - 0.04, d));
    for (let k = 1; k <= (h.bars ?? 0); k++) { const a = h.a0 + ((h.a1 - h.a0) * k) / ((h.bars ?? 0) + 1); B.frame.push(at(a - 0.02, a + 0.02, h.y0 + fw, h.y1 - fw, d - 0.03, d)); }
    // a stone surround proud of the render and a deeper sill: the Omani window. Its inner faces continue the reveal's planes
    // outward (they share an edge with the reveal, never a face); only on thick walls (villas, not our pilasters)
    if (f.t >= 0.2 && h.y0 > 0.2) {
      const w = 0.11, p = 0.05, sl = 0.09;
      B.stone.push(at(h.a0 - w, h.a0, h.y0, h.y1 + w, -p, 0), at(h.a1, h.a1 + w, h.y0, h.y1 + w, -p, 0), at(h.a0, h.a1, h.y1, h.y1 + w, -p, 0), at(h.a0 - w - 0.05, h.a1 + w + 0.05, h.y0 - 0.07, h.y0, -sl, 0));
    }
  }
}

type Side = 'n' | 's' | 'e' | 'w'; // n = the −Z face, s = +Z, e = +X, w = −X
/** A flat-roofed block: four facades (the side walls stand between the front and back ones), a roof slab inside the parapet, a stone coping ring. */
function volume(B: Buckets, r: Rect, y0: number, h: number, par: number, c: THREE.Color, holes: Partial<Record<Side, Hole[]>> = {}, omit = '', t = 0.25) {
  const top = y0 + h + par, yb = y0 === 0 ? -0.05 : y0;
  if (!omit.includes('s')) facade(B, { axis: 'z', at: r.z1, out: 1, a0: r.x0, a1: r.x1, y0: yb, y1: top, t }, holes.s ?? [], c);
  if (!omit.includes('n')) facade(B, { axis: 'z', at: r.z0, out: -1, a0: r.x0, a1: r.x1, y0: yb, y1: top, t }, holes.n ?? [], c);
  if (!omit.includes('e')) facade(B, { axis: 'x', at: r.x1, out: 1, a0: r.z0 + t, a1: r.z1 - t, y0: yb, y1: top, t }, holes.e ?? [], c);
  if (!omit.includes('w')) facade(B, { axis: 'x', at: r.x0, out: -1, a0: r.z0 + t, a1: r.z1 - t, y0: yb, y1: top, t }, holes.w ?? [], c);
  B.roof.push(slab(r.x0 + t, r.x1 - t, y0 + h - 0.2, y0 + h, r.z0 + t, r.z1 - t));
  const o = 0.03, ch = 0.06;
  if (!omit.includes('s')) B.stone.push(slab(r.x0 - o, r.x1 + o, top, top + ch, r.z1 - t - o, r.z1 + o));
  if (!omit.includes('n')) B.stone.push(slab(r.x0 - o, r.x1 + o, top, top + ch, r.z0 - o, r.z0 + t + o));
  if (!omit.includes('e')) B.stone.push(slab(r.x1 - t - o, r.x1 + o, top, top + ch, r.z0 + t + o, r.z1 - t - o));
  if (!omit.includes('w')) B.stone.push(slab(r.x0 - o, r.x0 + t + o, top, top + ch, r.z0 + t + o, r.z1 - t - o));
}

/**
 * A boundary wall run along one axis: rendered panels between pilasters, a coping on each panel, a cap on each pilaster.
 * `gaps` are clear openings between two pilaster centres; `ends` says whether this run owns the pilasters at its two ends
 * (at a corner only one of the two runs does).
 */
function wallRun(B: Buckets, o: { axis: 'x' | 'z'; at: number; a0: number; a1: number; H: number; T: number; c: THREE.Color; gaps?: [number, number][]; every?: number; ends?: [boolean, boolean]; pil?: number; rise?: number; /** how far the coping runs past an end that has no pilaster of its own (negative: it stops short, where the crossing wall's coping or pilaster begins) */ cope?: number }, onPilaster?: (a: number) => boolean) {
  const { axis, at, H, T, c } = o, pw = o.pil ?? 0.25, rise = o.rise ?? 0.14, gaps = o.gaps ?? [];
  const box = (a0: number, a1: number, y0: number, y1: number, h: number) => (axis === 'x' ? slab(a0, a1, y0, y1, at - h, at + h) : slab(at - h, at + h, y0, y1, a0, a1));
  const marks = [o.a0, o.a1, ...gaps.flat()];
  if (o.every) { // intermediate pilasters, evenly spaced inside each solid stretch
    const edges = uniq(marks);
    for (let i = 0; i < edges.length - 1; i++) { const a = edges[i], b = edges[i + 1]; if (gaps.some(([g0, g1]) => (a + b) / 2 > g0 && (a + b) / 2 < g1)) continue; const n = Math.round((b - a) / o.every); for (let k = 1; k < n; k++) marks.push(a + ((b - a) * k) / n); }
  }
  const ps = uniq(marks), cope = o.cope ?? 0.035;
  const bare = (i: number) => (i === 0 && !!o.ends && !o.ends[0]) || (i === ps.length - 1 && !!o.ends && !o.ends[1]); // an end without a pilaster of this run
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i], b = ps[i + 1]; if (gaps.some(([g0, g1]) => (a + b) / 2 > g0 && (a + b) / 2 < g1)) continue;
    B.wall.push(tint(box(a, b, -0.05, H, T / 2), c));
    B.stone.push(box(bare(i) ? a - cope : a + pw, bare(i + 1) ? b + cope : b - pw, H, H + 0.06, T / 2 + 0.035));
  }
  ps.forEach((a, i) => {
    if (bare(i)) return;
    if (onPilaster?.(a)) return; // built by the caller (ours, with the light slot)
    B.wall.push(tint(box(a - pw, a + pw, -0.05, H + rise, T / 2 + 0.06), c));
    B.stone.push(box(a - pw - 0.04, a + pw + 0.04, H + rise, H + rise + 0.07, T / 2 + 0.1));
  });
}

/** A contemporary Omani villa on its plot: a two-storey block, a single-storey majlis wing set back beside it, an entrance portal, a balcony, the roof's stair room and plant. `front` = the side the street is on. */
function villa(B: Buckets, r: Rect, front: 1 | -1, seed: number, c: THREE.Color, lit: number) {
  const rnd = lcg(seed), R = (a: number, b: number) => a + rnd() * (b - a);
  const glass = (): Hole['kind'] => (rnd() < lit ? 'lit' : 'glass');
  const W = r.x1 - r.x0, flip = rnd() < 0.5, split = r.x0 + W * (flip ? R(0.36, 0.44) : R(0.56, 0.64));
  const main: Rect = flip ? { x0: split, x1: r.x1, z0: r.z0, z1: r.z1 } : { x0: r.x0, x1: split, z0: r.z0, z1: r.z1 };
  const back = R(1.2, 2.4), fwd = R(1.4, 2.6);
  const wing: Rect = { x0: flip ? r.x0 : split, x1: flip ? split : r.x1, z0: r.z0 + (front > 0 ? back : fwd), z1: r.z1 - (front > 0 ? fwd : back) };
  const h1 = 3.8, h2 = R(7.2, 7.7), par = R(0.8, 1.0), F: Side = front > 0 ? 's' : 'n', K: Side = front > 0 ? 'n' : 's', toWing: Side = flip ? 'w' : 'e', away: Side = flip ? 'e' : 'w';
  const mw = main.x1 - main.x0, cx = main.x0 + mw * R(0.42, 0.58);
  // a bay either side of the portal: each window fits between the corner and the portal's fin
  const bays = ([[main.x0 + 0.7, cx - 1.85], [cx + 1.85, main.x1 - 0.7]] as const).map(([s0, s1]) => ({ x: (s0 + s1) / 2, w: Math.min(2.4, s1 - s0) })).filter((b) => b.w > 0.7);
  const balcony = bays[rnd() < 0.5 ? 0 : bays.length - 1];
  const frontHoles: Hole[] = [
    { a0: cx - 0.75, a1: cx + 0.75, y0: 0.12, y1: 2.8, kind: 'timber', depth: 0.18 },
    { a0: cx - 0.75, a1: cx + 0.75, y0: 3.9, y1: h2 - 0.7, kind: glass(), bars: 1 },
    ...bays.flatMap((b): Hole[] => [{ a0: b.x - b.w / 2, a1: b.x + b.w / 2, y0: 0.7, y1: 3.0, kind: glass(), bars: 1 }, { a0: b.x - b.w / 2, a1: b.x + b.w / 2, y0: b === balcony ? 4.0 : 4.6, y1: h2 - 0.8, kind: glass(), bars: 1 }]),
  ];
  const row = (a0: number, a1: number, n: number, w: number, y0: number, y1: number): Hole[] => Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * (i + 0.5)) / n; return { a0: a - w / 2, a1: a + w / 2, y0, y1, kind: glass() } as Hole; });
  const sideHoles = (a0: number, a1: number, upper: boolean): Hole[] => [...(upper ? [] : row(a0 + 0.8, a1 - 0.8, 2, 1.1, 0.95, 2.7)), ...row(a0 + 0.8, a1 - 0.8, 2, 1.1, 4.6, 6.3)];
  volume(B, main, 0, h2, par, c, { [F]: frontHoles, [K]: [...row(main.x0 + 0.6, main.x1 - 0.6, 3, 1.3, 0.9, 2.9), ...row(main.x0 + 0.6, main.x1 - 0.6, 3, 1.3, 4.5, 6.4)], [away]: sideHoles(main.z0, main.z1, false), [toWing]: sideHoles(main.z0, main.z1, true) } as Partial<Record<Side, Hole[]>>);
  const ww = wing.x1 - wing.x0;
  volume(B, wing, 0, h1, par, c, { [F]: [{ a0: wing.x0 + 0.9, a1: wing.x1 - 0.9, y0: 0.5, y1: 3.0, kind: glass(), bars: Math.max(1, Math.round(ww / 1.6) - 1) }], [K]: row(wing.x0 + 0.5, wing.x1 - 0.5, 2, 1.2, 0.9, 2.8), [away]: row(wing.z0 + 0.6, wing.z1 - 0.6, 2, 1.1, 0.95, 2.7) } as Partial<Record<Side, Hole[]>>, toWing === 'e' ? 'w' : 'e');
  // the stone plinth: a band a few centimetres proud of the render, all the way round
  const fz = front > 0 ? main.z1 : main.z0, P = 0.035, ph = 0.45;
  const ring = (q: Rect, skip: string) => {
    if (!skip.includes('s')) B.stone.push(slab(q.x0 - P, q.x1 + P, -0.05, ph, q.z1, q.z1 + P)); if (!skip.includes('n')) B.stone.push(slab(q.x0 - P, q.x1 + P, -0.05, ph, q.z0 - P, q.z0));
    if (!skip.includes('e')) B.stone.push(slab(q.x1, q.x1 + P, -0.05, ph, q.z0, q.z1)); if (!skip.includes('w')) B.stone.push(slab(q.x0 - P, q.x0, -0.05, ph, q.z0, q.z1));
  };
  // (the door's threshold interrupts the plinth; the wing's band stops at the main block)
  ring({ x0: main.x0, x1: main.x1, z0: main.z0, z1: main.z1 }, F); ring(wing, toWing === 'e' ? 'w' : 'e');
  // horizontal shadow lines, the way the low sun draws a Muscat facade: a string course at the first floor, a cornice at the roof
  // (never on the side the wing abuts; set into rings like the plinth, so no two faces meet in a plane)
  const band = (q: Rect, y0: number, y1: number, p: number, skip: string) => {
    if (!skip.includes('s')) B.stone.push(slab(q.x0 - p, q.x1 + p, y0, y1, q.z1, q.z1 + p)); if (!skip.includes('n')) B.stone.push(slab(q.x0 - p, q.x1 + p, y0, y1, q.z0 - p, q.z0));
    if (!skip.includes('e')) B.stone.push(slab(q.x1, q.x1 + p, y0, y1, q.z0, q.z1)); if (!skip.includes('w')) B.stone.push(slab(q.x0 - p, q.x0, y0, y1, q.z0, q.z1));
  };
  band(main, 3.5, 3.64, 0.05, toWing); band(main, h2 - 0.04, h2 + 0.12, 0.08, toWing); band(wing, h1 - 0.04, h1 + 0.1, 0.07, toWing === 'e' ? 'w' : 'e');
  for (const [a, b] of [[main.x0 - P, cx - 0.75], [cx + 0.75, main.x1 + P]]) B.stone.push(front > 0 ? slab(a, b, -0.05, ph, fz, fz + P) : slab(a, b, -0.05, ph, fz - P, fz));
  // the portal: two fins and a canopy, a metre proud of the facade
  const pz = (d: number) => fz + front * d, fin = 0.3, ph2 = 3.35;
  for (const s of [-1, 1]) B.wall.push(tint(slab(cx + s * 1.25, cx + s * (1.25 + fin), -0.05, ph2, pz(0), pz(1.1)), c));
  B.wall.push(tint(slab(cx - 1.25, cx + 1.25, ph2 - fin, ph2, pz(0), pz(1.1)), c));
  B.stone.push(slab(cx - 1.25, cx + 1.25, -0.05, 0.12, pz(0), pz(1.4))); // the step
  B.lamp.push(slab(cx - 0.5, cx + 0.5, ph2 - fin - 0.02, ph2 - fin, pz(0.35), pz(0.5))); // a light line under the canopy
  // the balcony: a slab and a glass balustrade with a slim rail
  if (balcony) {
    const bw = balcony.w / 2 + 0.45, balc = balcony.x;
    B.wall.push(tint(slab(balc - bw, balc + bw, 3.72, 3.92, pz(0), pz(1.25)), c));
    B.glass.push(slab(balc - bw + 0.03, balc + bw - 0.03, 3.92, 4.9, pz(1.2), pz(1.22)));
    for (const s of [-1, 1]) B.glass.push(slab(balc + s * (bw - 0.03), balc + s * (bw - 0.05), 3.92, 4.9, pz(0.02), pz(1.2)));
    B.frame.push(slab(balc - bw, balc + bw, 4.9, 4.94, pz(1.18), pz(1.24)));
  }
  // the roof: the stair room at the back, two water tanks on it, condensers on the wing's roof, a dish
  const sx = flip ? main.x1 - 0.7 - 3.2 : main.x0 + 0.7, kz = front > 0 ? main.z0 + 0.7 : main.z1 - 0.7 - 3.6, sr: Rect = { x0: sx, x1: sx + 3.2, z0: kz, z1: kz + 3.6 };
  volume(B, sr, h2, 2.5, 0.2, c, { [F]: [{ a0: sr.x0 + 0.5, a1: sr.x0 + 1.4, y0: h2 + 0.02, y1: h2 + 2.05, kind: 'timber', depth: 0.1 }] } as Partial<Record<Side, Hole[]>>, '', 0.2);
  const ty = h2 + 2.7;
  for (const dx of [0.95, 2.25]) { B.white.push(new THREE.CylinderGeometry(0.56, 0.58, 1.35, 20).translate(sr.x0 + dx, ty + 0.2 + 0.675, sr.z0 + 1.2), new THREE.CylinderGeometry(0.2, 0.5, 0.16, 20).translate(sr.x0 + dx, ty + 1.63, sr.z0 + 1.2)); B.metal.push(slab(sr.x0 + dx - 0.6, sr.x0 + dx + 0.6, h2 + 2.5, ty + 0.2, sr.z0 + 0.6, sr.z0 + 1.8)); }
  const az = front > 0 ? wing.z0 + 1.0 : wing.z1 - 1.4, ax = toWing === 'e' ? wing.x0 + 0.5 : wing.x1 - 0.5 - 3.5;
  for (let i = 0; i < 3; i++) { const x = ax + i * 1.25; B.white.push(slab(x, x + 0.95, h1 + 0.12, h1 + 0.87, az, az + 0.38)); B.metal.push(slab(x + 0.05, x + 0.9, h1, h1 + 0.12, az + 0.04, az + 0.34), new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20).rotateX(Math.PI / 2).translate(x + 0.475, h1 + 0.5, az + (front > 0 ? -0.011 : 0.391))); }
  const dx = flip ? main.x0 + 1.2 : main.x1 - 1.2, dz = front > 0 ? main.z0 + 1.3 : main.z1 - 1.3;
  B.metal.push(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8).translate(dx, h2 + 0.65, dz));
  B.white.push(new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, 0.62).scale(1, 0.55, 1).rotateX(Math.PI).translate(0, 0.28, 0).rotateX(-front * 0.9).rotateY(flip ? 0.5 : -0.5).translate(dx, h2 + 1.3, dz));
}

/**
 * A slatted gate leaf standing open, in the plane x = `x`, from the hinge at `z0` inward: a box-section frame in the garden gate's
 * dark-bronze powder coat round vertical slats of the front door's smoked oak (fine straight grain up each slat, satin), every edge
 * eased 2–3 mm. The slats carry uv in metres with the grain along u = height (the veneer scan's grain runs along u), each slat
 * a different strip of the board.
 */
function gateLeaf(x: number, z0: number, len: number, H: number) {
  const z1 = z0 - len, f = 0.045, rb = (x0: number, x1: number, y0: number, y1: number, za: number, zb: number, r: number) => { const w = x1 - x0, h = y1 - y0, d = Math.abs(zb - za); return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).translate((x0 + x1) / 2, (y0 + y1) / 2, (za + zb) / 2); };
  const frame = [rb(x - 0.025, x + 0.025, 0.06, H, z0 - f, z0, 0.003), rb(x - 0.025, x + 0.025, 0.06, H, z1, z1 + f, 0.003), rb(x - 0.025, x + 0.025, 0.06, 0.06 + f, z1 + f - 0.002, z0 - f + 0.002, 0.003), rb(x - 0.025, x + 0.025, H - f, H, z1 + f - 0.002, z0 - f + 0.002, 0.003)];
  const n = Math.round((len - 2 * f) / 0.085), slats: Geo[] = [];
  for (let i = 0; i < n; i++) {
    const z = z0 - f - ((len - 2 * f) * (i + 0.5)) / n, g = rb(x - 0.016, x + 0.016, 0.06 + f + 0.004, H - f - 0.004, z - 0.03, z + 0.03, 0.002);
    const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv, off = (i * 0.618) % 1 * 3.7 + x;
    for (let k = 0; k < p.count; k++) { const ax = Math.abs(nn.getX(k)), az = Math.abs(nn.getZ(k)); uv.setXY(k, Math.abs(nn.getY(k)) > 0.7 ? p.getZ(k) * 4 : p.getY(k), (ax >= az ? p.getZ(k) : p.getX(k)) + off); }
    slats.push(g);
  }
  return { frame, slats };
}

export function buildStreet(tier: Tier, plot: { x0: number; x1: number; z0: number; z1: number }, _props?: Props): Street {
  const group = new THREE.Group(); group.name = 'street';
  const high = tier === 'high';
  const blocks: Street['blocks'] = [];
  const plaster = maps('plaster'), asphalt = maps('asphalt'), interlock = maps('interlock');
  const walnut = (() => { const t = new THREE.TextureLoader().load('/textures/interior/walnut_diff.webp'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();

  /* ---------- the plan ---------- */
  const A = 1.2, I = 0.5, Bd = 1.6; // the paver apron's width and inset (environment.ts makeApron), and the planting bed between it and the wall
  const cx0 = plot.x0 + I - A - Bd, cz0 = plot.z0 + I - A - Bd, cz1 = plot.z1 - I + A + Bd; // wall centre lines
  const gx0 = plot.x1 + 1.4, gx1 = gx0 + 3.6, gz0 = -1.4, gz1 = 3.5; // garage footprint
  const cx1 = gx1 + 1.6;
  const compound: Rect = { x0: cx0, x1: cx1, z0: cz0, z1: cz1 };
  const H = 1.75, T = 0.3, gate = [-2.75, 1.55] as const, drive = [gx0 - 0.1, gx1 + 0.1] as const; // wall height/thickness, gate and driveway openings along the front wall (between pilaster centres). The lens crosses the wall line at x −1.9, y 2.15 on its way in and at x −1.7 on its way out: the gate's left pilaster stands 0.6 m clear of it
  const wf = cz1 + T / 2, strip = 0.75, pz0 = wf + strip, rz0 = wf + 2.2, rz1 = rz0 + 7.5, X = 110; // wall face, planted frontage, pavement, carriageway
  const roadY = -0.13, paveY = 0.03, kw = 0.15;
  const road = { z0: rz0, z1: rz1 }, paved = { z0: pz0, z1: rz1 + 2.2 };

  const M = {
    render: surface(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, ...plaster, normalScale: new THREE.Vector2(0.55, 0.55), vertexColors: true, envMapIntensity: 0.9 }), { tile: 2.2, key: 'street-render', mean: 0.38, keep: 0.55, weather: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.95 }),
    stone: surface(new THREE.MeshStandardMaterial({ color: '#b9ab92', roughness: 0.62, map: plaster.map, normalMap: plaster.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.8 }), { tile: 1.3, key: 'street-stone', mean: 0.38, keep: 0.9, weather: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#1e2628', roughness: 0.05, metalness: 0, specularColor: new THREE.Color(2.6, 2.6, 2.6), transparent: true, opacity: 0.35, depthWrite: false }), // balustrade glass: see-through, a sheen of sky
    pane: windowGlass(),
    frame: new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: 0.8, roughness: 0.42 }),
    timber: surface(new THREE.MeshStandardMaterial({ color: '#7d5f47', roughness: 0.6, map: walnut, envMapIntensity: 0.6 }), { tile: 1.1, key: 'street-timber', mean: 0.2, keep: 0.9, extra: 'diffuseColor.rgb *= 0.78 + 0.22 * smoothstep(0.06, 0.12, abs(fract(vWp.y / 0.16) - 0.5));' }), // boarded doors and gates: a shadow line every 16 cm
    metal: new THREE.MeshStandardMaterial({ color: '#9a9a96', metalness: 0.75, roughness: 0.48 }),
    white: new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.55 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#2a1a0c', emissive: '#ffc078', emissiveIntensity: 5, roughness: 0.4 }),
    glow: new THREE.MeshStandardMaterial({ color: '#d9c7a8', emissive: '#ffb86a', emissiveIntensity: 1.6, roughness: 0.35 }), // frosted lantern glass: under the bloom threshold, a glow not a flare
    road: surface(new THREE.MeshStandardMaterial({ color: '#67635d', roughness: 1, ...asphalt, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.6 }), { tile: 3.2, key: 'street-road', mean: 0.23, keep: 1, uniforms: { uRoad: { value: new THREE.Vector4(rz0, rz1, drive[0], drive[1]) } }, extra: `{
        float z = vWp.z, mid = 0.5 * (uRoad.x + uRoad.y), n1 = texture2D(map, vWp.xz * 0.013).g / 0.23, n2 = texture2D(map, vWp.xz * 0.09 + 0.31).g / 0.23;
        // years of sun: the binder greys and the surface mottles in broad patches, warmer where dust has been ground in
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 1.02, 0.97), smoothstep(0.85, 1.2, n1)) * (0.9 + 0.2 * smoothstep(0.7, 1.3, texture2D(map, vWp.xz * 0.031 + 0.7).g / 0.23));
        // the aggregate: where traffic has worn the binder off, pale stone flecks on the dark (fading before they alias)
        float ag = texture2D(map, vWp.xz / 0.41 + 0.13).g / 0.23, agF = 1.0 - smoothstep(0.006, 0.02, length(fwidth(vWp.xz)));
        diffuseColor.rgb *= 1.0 + agF * (0.35 * smoothstep(1.08, 1.35, ag) - 0.18 * (1.0 - smoothstep(0.62, 0.85, ag)));
        // the two lanes: tyres polish and darken their paths, oil drips down the middle of each lane
        float lane = abs(abs(z - mid) - 1.9), path = exp(-pow((abs(lane - 0.8)) / 0.42, 2.0));
        diffuseColor.rgb *= 1.0 - 0.16 * path * (0.6 + 0.4 * n1) - 0.12 * exp(-pow(lane / 0.3, 2.0)) * smoothstep(0.9, 1.15, n2);
        // crack sealant: a black tar band wandering down the crown joint and along the gutter, and a few across the lanes
        float fz = fwidth(z), wob = texture2D(map, vec2(vWp.x * 0.021, 0.37)).g / 0.23 - 1.0;
        float seal = 1.0 - smoothstep(0.025, 0.025 + 1.5 * fz, abs(z - mid + 0.06 * wob));
        seal = max(seal, (1.0 - smoothstep(0.02, 0.02 + 1.5 * fz, abs(z - uRoad.x - 0.42 - 0.1 * wob))) * step(0.95, n2 + 0.2));
        { float cell = floor(vWp.x / 7.3 + 0.5), cxk = vWp.x - cell * 7.3 - 1.2 * (fract(sin(cell * 91.7) * 4375.5) - 0.5) + 0.25 * sin(z * 1.7 + cell), fx = fwidth(vWp.x);
          float span = step(0.35, fract(sin(cell * 17.3) * 1575.1)) * (1.0 - smoothstep(0.0, 0.3, abs(z - mid - (fract(sin(cell * 7.1) * 931.7) - 0.5) * 4.0) - 1.3 - 1.5 * fract(cell * 0.618)));
          seal = max(seal, (1.0 - smoothstep(0.02, 0.02 + 1.5 * fx, abs(cxk))) * span); }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.022, 0.02, 0.019), seal * 0.9);
        vec2 pt = vWp.xz - vec2(3.4, uRoad.x + 2.2); float cut = step(abs(pt.x), 0.55) * step(abs(pt.y), 1.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62 + 0.004, cut * 0.8); diffuseColor.rgb *= 1.0 - 0.3 * cut * (1.0 - smoothstep(0.0, 0.03, min(0.55 - abs(pt.x), 1.7 - abs(pt.y))));
        float mh = length(vWp.xz - vec2(-2.2, mid - 1.9)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.048, 0.045) * (0.8 + 0.4 * step(0.5, fract(atan(vWp.z - mid + 1.9, vWp.x + 2.2) * 2.546))), 1.0 - smoothstep(0.3, 0.31, mh)); diffuseColor.rgb *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.02, abs(mh - 0.34)));
        // sand blown into the gutters, thicker in the lee of the kerb, tracked out of the driveway
        float edge = min(z - uRoad.x, uRoad.y - z), drift = (1.0 - smoothstep(0.05, 0.5 + 0.5 * n1, edge)) * smoothstep(0.55, 1.2, n1 + 0.35 * n2);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.35, 0.26) * (0.85 + 0.2 * n2), clamp(drift * 0.85, 0.0, 1.0));
      }` }),
    // buff concrete pavers: each unit its own shade (the scan's own colour kept), sand in the joints in drifts, dust along the kerb, a few dark stains
    pavement: surface(new THREE.MeshStandardMaterial({ color: '#a8977f', roughness: 1, ...interlock, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 0.6 }), { tile: 1.8, key: 'street-pavement', mean: 0.125, keep: 0.9, uniforms: { uKerb: { value: rz0 } }, extra: `{ vec3 sc = texture2D(map, vMapUv).rgb; diffuseColor.rgb *= mix(vec3(1.0), sc / max(dot(sc, vec3(0.3333)), 1e-3), 0.35);
        float n = texture2D(map, vWp.xz * 0.021).g / 0.125, m = texture2D(map, vWp.xz * 0.063 + 0.5).g / 0.125;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.33, 0.25), 0.25 * smoothstep(0.8, 1.4, n));
        diffuseColor.rgb *= 1.0 - 0.14 * smoothstep(1.25, 1.6, m) - 0.08 * (1.0 - smoothstep(0.1, 0.9, abs(vWp.z - uKerb)));
        diffuseColor.rgb *= 0.88 + 0.12 * smoothstep(0.6, 1.2, texture2D(map, vWp.xz * 0.009 + 0.2).g / 0.125); }` }),
    driveway: surface(new THREE.MeshStandardMaterial({ color: '#bfa98a', roughness: 1, ...interlock, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.7 }), { tile: 1.8, key: 'street-driveway', mean: 0.125, keep: 0.85 }),
    kerb: surface(new THREE.MeshStandardMaterial({ color: '#9a9386', roughness: 0.9, map: plaster.map, normalMap: plaster.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }), { tile: 1.1, key: 'street-kerb', mean: 0.38, keep: 1, extra: `{ float u = vWp.x / 0.915, id = floor(u), j = abs(fract(u) - 0.5); diffuseColor.rgb *= (0.86 + 0.24 * fract(sin(id * 12.9898) * 43758.5453)) * (0.45 + 0.55 * (1.0 - smoothstep(0.485, 0.497, j)));
        float g = texture2D(map, vWp.xz * vec2(0.7, 3.0) + 0.21).g / 0.38; diffuseColor.rgb *= 0.8 + 0.2 * smoothstep(0.7, 1.2, g);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05), 0.45 * (1.0 - smoothstep(-0.12, -0.01, vWp.y)) * step(0.5, abs(vWn.z)) * (0.6 + 0.4 * g)); }` }), // precast units, a joint every 915 mm, grime in blotches, tyre scuffs low on the face
  };
  const B = buckets();
  const add = (geo: Geo | null, mat: THREE.Material, cast = true, recv = true) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = cast && high; m.receiveShadow = recv; group.add(m); return m; };
  const merge = (list: Geo[]) => (list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false) : null);

  /* ---------- our compound: perimeter wall, gates, garage ---------- */
  const OURS = new THREE.Color('#d3c8b4');
  // pilasters either side of both openings: taller and thicker than the wall, each with a recessed light slot
  const mine = new Set([gate[0], gate[1], drive[0], drive[1]].map((v) => +v.toFixed(4)));
  wallRun(B, { axis: 'x', at: cz1, a0: cx0 - T / 2, a1: cx1 + T / 2, H, T, c: OURS, gaps: [[gate[0], gate[1]], [drive[0], drive[1]]], ends: [false, false] }, (a) => mine.has(+a.toFixed(4)));
  wallRun(B, { axis: 'z', at: cx0, a0: cz0 + T / 2, a1: cz1 - T / 2, H, T, c: OURS, ends: [false, false], cope: -0.035 });
  wallRun(B, { axis: 'z', at: cx1, a0: cz0 + T / 2, a1: cz1 - T / 2, H, T, c: OURS, ends: [false, false], cope: -0.035 });
  wallRun(B, { axis: 'x', at: cz0, a0: cx0 - T / 2, a1: cx1 + T / 2, H, T, c: OURS, ends: [false, false] });
  for (const x of mine) {
    const top = H + 0.35, pw = 0.25;
    B.wall.push(tint(slab(x - pw, x + pw, -0.05, top, cz1 - 0.28, cz1 + 0.22), OURS));
    facade(B, { axis: 'z', at: cz1 + 0.28, out: 1, a0: x - pw, a1: x + pw, y0: -0.05, y1: top, t: 0.06 }, [{ a0: x - 0.045, a1: x + 0.045, y0: 0.62, y1: 1.62, kind: 'lamp', depth: 0.03 }], OURS);
    B.stone.push(slab(x - pw - 0.05, x + pw + 0.05, top, top + 0.08, cz1 - 0.33, cz1 + 0.33));
  }
  blocks.push([cx0 - 0.3, cx0 + 0.3, cz0, cz1], [cx1 - 0.3, cx1 + 0.3, cz0, cz1], [cx0, cx1, cz0 - 0.3, cz0 + 0.3], [cx0, cx1, cz1 - 0.4, wf + strip + 0.1]);
  { // the entrance gate stands open: two slatted leaves swung back against the path's edges (see gateLeaf)
    const leaves = [gateLeaf(gate[0] + 0.25 + 0.04, cz1 - 0.3, 1.85, H - 0.12), gateLeaf(gate[1] - 0.25 - 0.04, cz1 - 0.3, 1.85, H - 0.12)];
    const ld = (u: string, srgb = false) => { const t = new THREE.TextureLoader().load(u); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    const oak = new THREE.MeshPhysicalMaterial({ color: '#b39a80', roughness: 0.82, map: ld('/textures/interior/smoked_diff.webp', true), normalMap: ld('/textures/interior/smoked_nor.webp'), normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: ld('/textures/interior/smoked_rough.webp'), clearcoat: 0.3, clearcoatRoughness: 0.42, envMapIntensity: 0.8 }); // door.ts's veneer
    const powder = new THREE.MeshPhysicalMaterial({ color: '#2e2a26', metalness: 0.3, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45, normalMap: microNormal(), normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.9 }); // door.ts's gate
    add(merge(leaves.flatMap((l) => l.slats)), oak); add(merge(leaves.flatMap((l) => l.frame)), powder);
  }
  // the driveway's sliding gate: boarded, shut, running behind the wall
  B.timber.push(slab(drive[0] - 0.1, drive[1] + 0.35, 0.07, H - 0.06, cz1 - T / 2 - 0.09, cz1 - T / 2 - 0.04));
  B.frame.push(slab(drive[0] - 0.1, drive[1] + 0.35, 0.02, 0.07, cz1 - T / 2 - 0.1, cz1 - T / 2 - 0.03), slab(drive[0] - 0.1, drive[1] + 0.35, H - 0.06, H - 0.01, cz1 - T / 2 - 0.1, cz1 - T / 2 - 0.03));
  // the garage: a rendered block against the villa's east side, a boarded door set back in its opening, a sconce either side
  volume(B, { x0: gx0, x1: gx1, z0: gz0, z1: gz1 }, 0, 2.95, 0.3, OURS, { s: [{ a0: gx0 + 0.45, a1: gx1 - 0.45, y0: -0.05, y1: 2.45, kind: 'timber', depth: 0.2 }] });
  for (const x of [gx0 + 0.24, gx1 - 0.24]) { B.frame.push(slab(x - 0.05, x + 0.05, 1.95, 2.25, gz1, gz1 + 0.07)); B.lamp.push(slab(x - 0.035, x + 0.035, 1.93, 1.95, gz1 + 0.015, gz1 + 0.055), slab(x - 0.035, x + 0.035, 2.25, 2.27, gz1 + 0.015, gz1 + 0.055)); }
  if (high) for (const x of [gx0 + 0.24, gx1 - 0.24]) { const l = new THREE.PointLight('#ffc078', 1.2, 4, 2); l.position.set(x, 2.1, gz1 + 0.45); group.add(l); }
  blocks.push([gx0, gx1, gz0, gz1]);
  // driveway and path inside the wall (the street side of both belongs to the pavement below)
  const drives: Rect[] = [{ x0: drive[0] + 0.25, x1: drive[1] - 0.25, z0: gz1, z1: cz1 + T / 2 }, { x0: gate[0] + 0.25, x1: gate[1] - 0.25, z0: 3.2, z1: cz1 + T / 2 }];
  add(slab(drives[0].x0, drives[0].x1, -0.04, 0.02, drives[0].z0, drives[0].z1), M.driveway, false);
  add(slab(drives[1].x0, drives[1].x1, -0.04, 0.015, drives[1].z0, drives[1].z1), M.stone, false);
  blocks.push([drive[0], drive[1], gz1, cz1], [gate[0], gate[1], 3.0, cz1]);
  if (high) for (const x of [gate[0], gate[1]]) { const l = new THREE.PointLight('#ffc078', 1.6, 5, 2); l.position.set(x, 1.15, cz1 + 0.7); group.add(l); }
  // planted strips at the wall's foot, between the pilasters, held by a stone edging
  const beds: Rect[] = [{ x0: cx0 - T / 2, x1: gate[0] - 0.3, z0: wf, z1: pz0 }, { x0: gate[1] + 0.3, x1: drive[0] - 0.3, z0: wf, z1: pz0 }, { x0: drive[1] + 0.3, x1: cx1 + T / 2, z0: wf, z1: pz0 }];
  for (const b of beds) { B.stone.push(slab(b.x0, b.x1, -0.1, 0.11, b.z1 - 0.07, b.z1)); for (const x of [b.x0, b.x1]) B.stone.push(slab(x - (x === b.x0 ? 0 : 0.07), x + (x === b.x0 ? 0.07 : 0), -0.1, 0.11, b.z0, b.z1 - 0.07)); }
  // where the bougainvillea comes over: the front wall either side of the gate (well clear of the lens's way in), the west wall toward the open plot
  const spills: Spill[] = [{ axis: 'x', at: cz1, a0: cx0 + 0.2, a1: gate[0] - 0.75, top: H + 0.06, side: 1, thick: T, mine: true }, { axis: 'x', at: cz1, a0: gate[1] + 0.6, a1: drive[0] - 0.5, top: H + 0.06, side: 1, thick: T, mine: true }, { axis: 'z', at: cx0, a0: -3.5, a1: cz1 - 0.3, top: H + 0.06, side: -1, thick: T, mine: true }];

  /* ---------- the street: pavement, kerbs, the carriageway ---------- */
  // the driveway crossing: the pavement dips to a dropped kerb over the driveway's width, with a flare either side
  const dip = (x: number) => THREE.MathUtils.smoothstep(x, drive[0] - 0.75, drive[0] + 0.1) * (1 - THREE.MathUtils.smoothstep(x, drive[1] - 0.1, drive[1] + 0.75));
  const rampZ = rz0 - 1.05, low = roadY + 0.025;
  const surfY = (x: number, z: number) => paveY + (low - paveY) * dip(x) * THREE.MathUtils.smoothstep(z, rampZ, rz0 - kw);
  const rx0 = drive[0] - 0.8, rx1 = drive[1] + 0.8;
  const pave: Geo[] = [slab(-X, rx0, -0.25, paveY, pz0, rz0 - kw), slab(rx1, X, -0.25, paveY, pz0, rz0 - kw), slab(rx0, rx1, -0.25, paveY, pz0, rampZ), slab(-X, X, -0.25, paveY, rz1 + kw, rz1 + 2.2)];
  { // the ramp: a sheet over the dip
    const nx = 28, nz = 8, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = rx0 + ((rx1 - rx0) * i) / nx, z = rampZ + ((rz0 - kw - rampZ) * j) / nz; pos.push(x, surfY(x, z), z); uv.push(i / nx, j / nz); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); pave.push(g);
  }
  // the frontage between the pavement and the walls: paved at our gate and driveway (beds elsewhere, open ground at the open plots)
  pave.push(slab(gate[0] - 0.3, gate[1] + 0.3, -0.25, paveY, wf, pz0), slab(drive[0] - 0.3, drive[1] + 0.3, -0.25, paveY, wf, pz0));
  add(merge(pave), M.pavement, false);
  { // kerbs: a face to the carriageway and a top, following the dropped kerb
    const xs = uniq([-X, X, ...Array.from({ length: 41 }, (_, i) => rx0 + ((rx1 - rx0) * i) / 40)]), pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const quad = (p: number[][], n: number[]) => { for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...p[k]); nor.push(...n); uv.push(0, 0); } };
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1], ya = surfY(a, rz0), yb = surfY(b, rz0);
      quad([[a, roadY - 0.1, rz0], [b, roadY - 0.1, rz0], [b, yb, rz0], [a, ya, rz0]], [0, 0, 1]); quad([[a, ya, rz0], [b, yb, rz0], [b, yb, rz0 - kw], [a, ya, rz0 - kw]], [0, 1, 0]);
    }
    quad([[X, roadY - 0.1, rz1], [-X, roadY - 0.1, rz1], [-X, paveY, rz1], [X, paveY, rz1]], [0, 0, -1]); quad([[-X, paveY, rz1 + kw], [X, paveY, rz1 + kw], [X, paveY, rz1], [-X, paveY, rz1]], [0, 1, 0]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    add(g, M.kerb, false);
  }
  add(slab(-X, X, roadY - 0.2, roadY, rz0, rz1), M.road, false);

  /* ---------- the neighbourhood ---------- */
  const TINTS = ['#d9d4c9', '#d2c8b4', '#c9b999', '#d6cfc1', '#c7beae', '#cfc2a8'].map((c) => new THREE.Color(c)); // whites and sands as painted render reads in the open: albedo 0.5–0.65, never paper white
  const lots: Rect[] = [];
  /** One walled plot with its villa. `front` = the side its street is on (+1 = +Z). (The car shade that stood by one of them read as a white arc at eye level: gone.) */
  const plotAt = (r: Rect, front: 1 | -1, seed: number, o: { wallH?: number; lit?: number; /** a climber over the side wall that faces us */ spill?: 'w' | 'e' } = {}) => {
    const rnd = lcg(seed * 7 + 3), R = (a: number, b: number) => a + rnd() * (b - a);
    const c = TINTS[seed % TINTS.length], wc = rnd() < 0.5 ? c : TINTS[(seed + 3) % TINTS.length], WH = o.wallH ?? 2.25, WT = 0.25;
    const fz = front > 0 ? r.z1 : r.z0, bz = front > 0 ? r.z0 : r.z1, W = r.x1 - r.x0;
    // the street side: a vehicle gate and a pedestrian gate, both boarded and shut behind the wall
    const g0 = r.x0 + W * R(0.12, 0.2), car: [number, number] = [g0, g0 + 4.4], ped: [number, number] = [r.x1 - W * R(0.15, 0.3) - 1.5, 0]; ped[1] = ped[0] + 1.5;
    wallRun(B, { axis: 'x', at: fz, a0: r.x0, a1: r.x1, H: WH, T: WT, c: wc, gaps: [car, ped], every: 3.6 });
    wallRun(B, { axis: 'x', at: bz, a0: r.x0, a1: r.x1, H: WH, T: WT, c: wc, every: 3.6 });
    wallRun(B, { axis: 'z', at: r.x0, a0: Math.min(fz, bz), a1: Math.max(fz, bz), H: WH, T: WT, c: wc, every: 3.6, ends: [false, false], cope: -(WT / 2 + 0.06) });
    wallRun(B, { axis: 'z', at: r.x1, a0: Math.min(fz, bz), a1: Math.max(fz, bz), H: WH, T: WT, c: wc, every: 3.6, ends: [false, false], cope: -(WT / 2 + 0.06) });
    const gz = (d: number) => fz - front * d;
    // a lantern on each pillar of the car gate, lit early on a photocell: the warm points of the golden hour
    for (const a of car) { const y = WH + 0.21, L = 0.13; B.frame.push(slab(a - 0.16, a + 0.16, y, y + 0.03, fz - 0.16, fz + 0.16), slab(a - 0.17, a + 0.17, y + 0.45, y + 0.49, fz - 0.17, fz + 0.17), slab(a - 0.05, a + 0.05, y + 0.49, y + 0.56, fz - 0.05, fz + 0.05));
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.frame.push(slab(a + dx * L - 0.012, a + dx * L + 0.012, y + 0.03, y + 0.45, fz + dz * L - 0.012, fz + dz * L + 0.012));
      B.glow.push(slab(a - L + 0.01, a + L - 0.01, y + 0.04, y + 0.44, fz - L + 0.01, fz + L - 0.01)); }
    for (const [a, b] of [car, ped]) { B.timber.push(slab(a + 0.2, b - 0.2 + (b - a > 2 ? 0.5 : 0), 0.08, WH - 0.08, gz(WT / 2 + 0.04), gz(WT / 2 + 0.09))); B.frame.push(slab(a + 0.2, b - 0.2 + (b - a > 2 ? 0.5 : 0), WH - 0.08, WH - 0.03, gz(WT / 2 + 0.03), gz(WT / 2 + 0.1))); }
    // the villa, set back from the street with room either side
    const sw = R(3.2, 4.6), se = R(3.2, 4.6), sf = R(4.6, 5.8), D = Math.min(R(11, 12.5), Math.abs(fz - bz) - sf - 2.5);
    const v: Rect = { x0: r.x0 + sw, x1: r.x1 - se, z0: front > 0 ? fz - sf - D : fz + sf, z1: front > 0 ? fz - sf : fz + sf + D };
    villa(B, v, front, seed, c, o.lit ?? 0.3); // the sun is still up, but the lamps are coming on: one window in three
    if (o.spill) spills.push({ axis: 'z', at: o.spill === 'w' ? r.x0 : r.x1, a0: Math.max(r.z0, fz - 11), a1: fz - 1.2, top: WH + 0.06, side: o.spill === 'w' ? -1 : 1, thick: WT, mine: false });
    lots.push(r); blocks.push([v.x0 - 0.6, v.x1 + 0.6, v.z0 - 0.6, v.z1 + 1.6], [r.x0 - 0.4, r.x1 + 0.4, fz - 0.5, fz + 0.5], [r.x0 - 0.4, r.x1 + 0.4, bz - 0.5, bz + 0.5], [r.x0 - 0.4, r.x0 + 0.4, r.z0, r.z1], [r.x1 - 0.4, r.x1 + 0.4, r.z0, r.z1]);
  };
  const gapW = 8, lotW = 24;
  // our row, either side of the open plots beside us
  plotAt({ x0: cx0 - gapW - lotW, x1: cx0 - gapW, z0: -12, z1: cz1 }, 1, 11, { spill: 'e' }); plotAt({ x0: cx1 + gapW, x1: cx1 + gapW + lotW, z0: -12, z1: cz1 }, 1, 23, { lit: 0.22, spill: 'w' });
  plotAt({ x0: cx0 - gapW - lotW * 2 - 3.5, x1: cx0 - gapW - lotW - 3.5, z0: -13, z1: cz1 }, 1, 37); plotAt({ x0: cx1 + gapW + lotW + 3.5, x1: cx1 + gapW + lotW * 2 + 3.5, z0: -13, z1: cz1 }, 1, 41);
  // the row behind, across the back lane (it looks to the next street), and the row across our street
  for (const [x0, seed] of [[-62, 71], [-34, 73], [-6, 77], [24, 79], [52, 83]] as const) plotAt({ x0, x1: x0 + 25, z0: -48, z1: -24 }, -1, seed, { lit: 0.25 });
  if (tier !== 'low') for (const [x0, seed] of [[-64, 50], [-36, 53], [-8, 59], [20, 61], [48, 67]] as const) plotAt({ x0, x1: x0 + 25, z0: rz1 + 7, z1: rz1 + 30 }, -1, seed);
  const gaps: Rect[] = [{ x0: cx0 - gapW, x1: cx0, z0: -12, z1: cz1 }, { x0: cx1, x1: cx1 + gapW, z0: -12, z1: cz1 }];

  /* ---------- street lamps: tapered steel poles with a slim LED head, none in the headline's third of the hero ---------- */
  for (const x of [-46, -16.5, 17.5, 46, 76]) { // (17.5: just off the hero's right edge, where the Arabic headline sits)
    const z = rz0 - 0.55, h = 8;
    B.metal.push(new THREE.CylinderGeometry(0.055, 0.1, h, 14).translate(x, h / 2, z), new THREE.CylinderGeometry(0.12, 0.13, 0.9, 14).translate(x, 0.45, z), new THREE.CylinderGeometry(0.2, 0.2, 0.03, 14).translate(x, paveY + 0.015, z));
    const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(x, h - 0.05, z), new THREE.Vector3(x, h + 0.35, z + 0.5), new THREE.Vector3(x, h + 0.5, z + 1.3), new THREE.Vector3(x, h + 0.5, z + 1.9)]);
    B.metal.push(new THREE.TubeGeometry(arm, 20, 0.04, 8, false), slab(x - 0.16, x + 0.16, h + 0.46, h + 0.54, z + 1.85, z + 2.6));
    B.lamp.push(slab(x - 0.13, x + 0.13, h + 0.445, h + 0.46, z + 1.95, z + 2.55));
    blocks.push([x - 0.4, x + 0.4, z - 0.4, z + 0.4]);
  }

  add(merge(B.wall), M.render); add(merge(B.roof), M.roof, false); add(merge(B.stone), M.stone); add(merge(B.glass), M.glass, false, false); add(merge(B.pane), M.pane, false);
  add(merge(B.frame), M.frame); add(merge(B.timber), M.timber); add(merge(B.metal), M.metal); add(merge(B.white), M.white); add(merge(B.lamp), M.lamp, false, false); add(merge(B.glow), M.glow, false, false);

  return { group, blocks, compound, road, paved, beds, lots, gaps, spills, drives };
}
