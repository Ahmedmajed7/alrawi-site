/**
 * How the designed interior is shaded. Every large surface of interior.ts goes through `shade()`, which patches the standard
 * material so that a room behaves like a room:
 *  - the sun only arrives along rays that pass through a real opening (the windows, the front door). The openings are
 *    rectangles, so the test is analytic: soft-edged, exact, and it cannot leak. The sun's shadow map is still read for what
 *    stands in the light (garden, porch, furniture, drapes), but with 16 taps and a receiver-plane depth bias: at a low sun the
 *    floor's depth changes four texels per texel, and the stock 5-tap filter shadows itself in texel-sized blocks;
 *  - every lamp is hidden by the walls between it and the surface (its ray against the wall planes, soft at the wall ends);
 *  - the concealed LED strips (the ceiling coves, the wall grazer, the picture light) are line lights evaluated in the shader;
 *  - bounced light comes from the probe lattice (interior-gi.ts), read so that a lookup never blends across a wall;
 *  - limewash, stone and veneer are mapped in world space (no stretch, one texture runs through every piece of a wall) and
 *    never show their repeat: two scales of relief, a slow tonal mottle, tiles cut from different parts of the block.
 */
import * as THREE from 'three';
import { GI } from './interior-gi';

type V3 = [number, number, number];
export interface Rooms { a: THREE.Vector4; b: THREE.Vector4; pier: THREE.Vector3; fc: THREE.Vector2 }
/** An opening the sun can enter by: cut in a wall along z at x = `at` (axis 'x') or along x at z = `at` (axis 'z'), through to `out`. */
export interface Aperture { axis: 'x' | 'z'; at: number; out: number; a0: number; a1: number; y0: number; y1: number; /** the opening at the outer face, where it differs */ b0?: number; b1?: number; /** the frame's width inside the opening, the glazing bars' centres and width */ frame?: number; bars?: number[]; barW?: number }
/** A wall, a header or a ceiling slab as the plane a light ray must not cross: `axis` = its normal; u/v = x|z and y for walls, x and z for slabs. */
export interface Pane { axis: 'x' | 'y' | 'z'; at: number; u0: number; u1: number; v0: number; v1: number }
/** A concealed linear source with optics: a beam of half-width `spread` (radians) about `aim`; `power` per metre; reaches `reach` metres.
 *  `peak` = the strip is dimmed along its length: full power at `at`, falling to `floor` over `width` metres either side. */
export interface Strip { a: V3; b: V3; aim: V3; spread: number; power: number; reach: number; color: string; peak?: { at: V3; width: number; floor: number } }
/** A cove: an LED strip on top of the dropped ceiling's edge. It lights what can see it; the wall below glows with what the trough gives back. */
export interface Cove { a: V3; b: V3 }
export interface KitConfig { rooms: Rooms; apertures: Aperture[]; panes: Pane[]; strips: Strip[]; coves: Cove[]; cove: { power: number; bounce: number; /** how far down a wall the glow carries (metres, e-folding) */ fall: number; color: string; /** the dropped ceiling's underside */ y: number }; /** the probes hold the first bounces; this is the rest of them in rooms this light (a multiplier on what the probes give) */ gi: number; /** what is left of the sky's own fill (hemisphere light, sky map) once the probes are in: the rooms' ambient is what the rooms give back */ fill: number; /** the sun on what stands indoors, against the sun outdoors: the rooms are exposed for their lamps, a stop under the garden, and the sun patch is the brightest thing in them all the same */ sun: number; /** sun shadow taps (16 live, 32 when recording) */ taps: number; /** the tight crease darkening in every corner (0 = off) */ tight?: number }
export type Look = 'plain' | 'limewash' | 'tiles';
export interface ShadeOpts {
  /** metres per texture tile, mapped by world position */ worldUv?: number; /** u runs up the wall: a veneer's grain stands upright */ grainUp?: boolean;
  /** corner darkening 0..1 */ strength?: number; look?: Look; /** tiles: size along x and z, joint width (m) */ tile?: [number, number, number];
  /** this surface's share of the bounced light (1 = all of it) */ gi?: number;
  /** limewash: the paint's fine stipple (a second normal map, `tile` metres per repeat, slopes × `scale`) and how much of the tonal
   *  mottle is kept (1 = the full ±14 % clouds; walls read those as dirt at arm's length) */
  fine?: { tex: THREE.Texture; tile: number; scale: number }; mottle?: number;
}
export interface SurfaceKit { shade<T extends THREE.MeshStandardMaterial>(m: T, o?: ShadeOpts): T; /** 0 = stand-in ambient, 1 = the probe lattice is baked */ uGI: { value: number } }

const f = (v: number) => v.toFixed(4);
const vec3 = (a: readonly number[]) => `vec3(${a.map(f).join(', ')})`;
const lin = (hex: string) => { const c = new THREE.Color(hex); return vec3([c.r, c.g, c.b]); };

/** The sun through the openings: 1 inside a patch of sun, 0 anywhere a wall is in the way. */
function sunCode(aps: Aperture[]) {
  const inset = 0.03; // the analytic edge sits just inside the shadow map's own (blocky) edge of the same opening, and hides it
  return aps.map((w) => {
    const P = w.axis, U = w.axis === 'z' ? 'x' : 'z', fw = w.frame ?? 0;
    const rect = (d: number, a0 = w.a0, a1 = w.a1) => `vec4(${f(a0 + d)}, ${f(w.y0 + d)}, ${f(a1 - d)}, ${f(w.y1 - d)})`;
    const bars = (w.bars ?? []).map((c) => `m *= 1.0 - roomBar(g.${U}, ${f(c)}, ${f((w.barW ?? 0.04) / 2)}, s);`).join(' ');
    return `if (abs(L.${P}) > 0.001) { float ti = (${f(w.at)} - p.${P}) / L.${P}, to = (${f(w.out)} - p.${P}) / L.${P};
      if (ti > 0.0 && to > 0.0) { float tg = 0.5 * (ti + to), s = 0.004 + 0.011 * tg; vec3 hi = p + L * ti, ho = p + L * to, g = p + L * tg;
        float m = roomWin(vec2(hi.${U}, hi.y), ${rect(inset)}, s) * roomWin(vec2(ho.${U}, ho.y), ${rect(inset, w.b0 ?? w.a0, w.b1 ?? w.a1)}, s)${fw > 0 ? ` * roomWin(vec2(g.${U}, g.y), ${rect(fw)}, s)` : ''}; ${bars}
        lit = max(lit, m); } }`;
  }).join('\n      ');
}
/** Walls between a surface and a lamp: the ray against each wall plane, soft over the last 5 cm before a wall's free end. */
function visCode(panes: Pane[]) {
  return panes.map((w) => {
    const [U, V] = w.axis === 'x' ? ['z', 'y'] : w.axis === 'z' ? ['x', 'y'] : ['x', 'z'];
    return `t = (${f(w.at)} - p.${w.axis}) / d.${w.axis}; if (t > 0.0 && t < 1.0) { h = p + d * t; e = min(vec2(h.${U} - ${f(w.u0)}, h.${V} - ${f(w.v0)}), vec2(${f(w.u1)} - h.${U}, ${f(w.v1)} - h.${V})); v *= 1.0 - smoothstep(0.0, 0.05, min(e.x, e.y)); }`;
  }).join('\n      ');
}
const nearest = (a: V3, b: V3) => `{ vec3 sa = ${vec3(a)}, ab = ${vec3([b[0] - a[0], b[1] - a[1], b[2] - a[2]])}; q = sa + ab * clamp(dot(p - sa, ab) / dot(ab, ab), 0.0, 1.0); }`;
function stripCode(strips: Strip[]) {
  return strips.map((s) => {
    const aim = new THREE.Vector3(...s.aim).normalize();
    return `{ vec3 p = roomP, q; ${nearest(s.a, s.b)} vec3 Lw = q - p; float r = length(Lw); Lw /= max(r, 1e-4); r = max(r, 0.1); // nearer than a hand the strip is no line any more: the light stops growing
      if (r < ${f(s.reach)}) { float off = acos(clamp(dot(-Lw, ${vec3([aim.x, aim.y, aim.z])}), -1.0, 1.0)) / ${f(s.spread)};
        float e = ${f(s.power)} * exp(-off * off) / r * (1.0 - smoothstep(${f(s.reach * 0.6)}, ${f(s.reach)}, r));${s.peak ? `
        { vec3 pk = q - ${vec3(s.peak.at)}; e *= mix(${f(s.peak.floor)}, 1.0, exp(-dot(pk, pk) / ${f(s.peak.width * s.peak.width)})); }` : ''}
        if (e > 0.002) { e *= roomVis(p, q); directLight.color = ${lin(s.color)} * e; directLight.direction = normalize((viewMatrix * vec4(Lw, 0.0)).xyz); directLight.visible = true;
          RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight ); } } }`;
  }).join('\n    ');
}
function coveCode(c: KitConfig) {
  const each = c.coves.map((s) => `{ ${nearest(s.a, s.b)} vec3 Lw = q - p; float r = length(Lw), hd = length(Lw.xz); Lw /= max(r, 1e-4); r = max(r, 0.12);
        if (r < 1.5) { float e = max(dot(n, Lw), 0.0) / r * (1.0 - smoothstep(0.9, 1.5, r)); if (e > 0.002) sum += e * roomVis(p, q); }
        glow = max(glow, 1.0 - smoothstep(0.34, 0.62, hd)); }`).join('\n      ');
  return `vec3 roomCove(vec3 p, vec3 n) {
      if (p.y < 0.9) return vec3(0.0);
      float sum = 0.0, glow = 0.0; vec3 q;
      ${each}
      // what the lit trough gives back to the wall under it: the soft gradient down from the ceiling gap
      float back = glow * step(p.y, ${f(c.cove.y + 0.03)}) * (1.0 - abs(n.y)) * exp(-max(${f(c.cove.y)} - p.y, 0.0) / ${f(c.cove.fall)});
      return ${lin(c.cove.color)} * (sum * ${f(c.cove.power)} + back * ${f(c.cove.bounce)});
    }`;
}

/** World-space mapping alone, for what stands outdoors (the porch): none of the room logic, so the real sun and sky light it. */
export function worldMapped<T extends THREE.MeshStandardMaterial>(mat: T, metres: number, grainUp = false): T {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      { vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; vec3 an = abs(mat3(modelMatrix) * normal);
        vec2 wuv = (an.y > 0.5 ? wp.xz : an.x > an.z ? ${grainUp ? 'vec2(wp.y, wp.z)' : 'vec2(wp.z, wp.y)'} : ${grainUp ? 'vec2(wp.y, wp.x)' : 'wp.xy'}) * ${f(1 / metres)};
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
  };
  mat.customProgramCacheKey = () => `world-mapped-${metres}-${grainUp ? 'up' : 'along'}`;
  return mat;
}

// dev: ?nan paints what is not a number (or below zero) in the bounced light: from the probes blue, from the coves red, from the fill
// green, anything else in the material's own colour
const bad = (v: string) => `( any( isnan( ${v} ) ) || any( isinf( ${v} ) ) || any( lessThan( ${v}, vec3( -0.001 ) ) ) )`;
const DEBUG_NAN = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nan') ? `
      { vec3 flag = vec3( -1.0 );
        if ${bad('reflectedLight.indirectDiffuse')} flag = diffuseColor.rgb * 3.0 + 0.05;
        if ${bad('dbgFill')} flag = vec3( 0.0, 8.0, 0.0 ); if ${bad('dbgCove')} flag = vec3( 8.0, 0.0, 0.0 ); if ${bad('dbgGI')} flag = vec3( 0.0, 0.0, 8.0 );
        if ( ! ( dot( normal, normal ) > 0.25 && dot( normal, normal ) < 4.0 ) ) flag = vec3( 0.0, 8.0, 8.0 ); if ( ! ( dot( vRN, vRN ) > 0.25 && dot( vRN, vRN ) < 4.0 ) ) flag = vec3( 8.0, 0.0, 8.0 );
        if ( flag.x >= 0.0 ) { reflectedLight.directDiffuse = flag; reflectedLight.directSpecular = reflectedLight.indirectDiffuse = reflectedLight.indirectSpecular = vec3( 0.0 ); } }` : '';

export function createSurfaceKit(cfg: KitConfig): SurfaceKit {
  const uGI = { value: 0 };
  const shared = { uRoomA: { value: cfg.rooms.a }, uRoomB: { value: cfg.rooms.b }, uPier: { value: cfg.rooms.pier }, uFC: { value: cfg.rooms.fc }, uGI };
  const pars = /* glsl */`
    uniform vec4 uRoomA, uRoomB; uniform vec3 uPier; uniform vec2 uFC; uniform float uShade, uGI, uGIK, uMottle, uFineK, uFineS, uTight;
    #ifdef ROOM_FINE
    uniform sampler2D uFine;
    #endif
    varying vec3 vRW; varying vec3 vRN; vec3 dbgGI = vec3( 0.0 ), dbgCove = vec3( 0.0 ), dbgFill = vec3( 0.0 );
    vec3 roomDirW(vec3 v) { return normalize((vec4(v, 0.0) * viewMatrix).xyz); }
    vec3 roomPosW(vec3 v) { return (vec4(v, 0.0) * viewMatrix).xyz + cameraPosition; }
    float roomHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float roomNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u); return mix(mix(roomHash(i), roomHash(i + vec2(1.0, 0.0)), u.x), mix(roomHash(i + vec2(0.0, 1.0)), roomHash(i + vec2(1.0, 1.0)), u.x), u.y); }
    float roomAO(vec3 p, vec3 n) {
      vec4 r = p.z < uRoomA.w ? uRoomA : uRoomB;
      float dx = max(min(p.x - r.x, r.y - p.x), 0.0), dz = max(min(p.z - r.z, r.w - p.z), 0.0);
      float dp = (p.z > uPier.y && p.z < uPier.z) ? max(abs(p.x - uPier.x) - 0.06, 0.0) : 99.0;
      float dw = min(min(dx, dz), dp);
      float df = max(p.y - uFC.x, 0.0), dc = max(uFC.y - p.y, 0.0);
      float ao = 1.0 - 0.5 * exp(-(dw + df) / 0.42) - 0.32 * exp(-(dw + dc) / 0.38) - 0.3 * exp(-(min(dx, dp) + dz) / 0.4);
      ao -= 0.12 * (1.0 - smoothstep(0.0, 1.4, df)) * step(0.5, 1.0 - abs(n.y)); // walls darken gently toward the floor
      // the crease itself: where two planes meet, the few centimetres either side of the line see half a room less (what a photo shows
      // as a crisp, soft-edged darkening in every corner), for walls against walls and for the floor and the ceiling along the walls
      ao -= uTight * (0.16 * exp(-(min(dx, dp) + dz) / 0.07) + 0.1 * exp(-(dw + df) / 0.05) + 0.1 * exp(-(dw + dc) / 0.06));
      return clamp(mix(1.0, ao, uShade), 0.2, 1.0);
    }
    float roomWin(vec2 q, vec4 r, float s) { vec2 a = smoothstep(r.xy - s, r.xy + s, q), b = 1.0 - smoothstep(r.zw - s, r.zw + s, q); return a.x * a.y * b.x * b.y; }
    float roomBar(float u, float c, float hw, float s) { return clamp((min(u + s, c + hw) - max(u - s, c - hw)) / (2.0 * s), 0.0, 1.0); } // the share of the sun's disc a bar covers
    float roomSun(vec3 p, vec3 L) {
      float lit = 0.0;
      ${sunCode(cfg.apertures)}
      return lit;
    }
    float roomVis(vec3 p, vec3 q) {
      vec3 d = q - p, h; vec2 e; float t, v = 1.0;
      ${visCode(cfg.panes)}
      return v;
    }
    ${coveCode(cfg)}
    #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
    float roomSunShadow(sampler2DShadow shadowMap, vec2 size, float intensity, float bias, float radius, vec4 coord) {
      vec3 c = coord.xyz / coord.w; c.z += bias;
      if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
      // receiver-plane depth bias: how the surface's own depth changes across the shadow map, so a wide filter compares each tap with
      // the depth the surface has there (capped: at a silhouette the derivatives mean nothing)
      vec3 dx = dFdx(c), dy = dFdy(c); float det = dx.x * dy.y - dx.y * dy.x; vec2 slope = vec2(0.0);
      if (abs(det) > 1e-12) slope = clamp(vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / det, vec2(-4.0), vec2(4.0));
      float r = radius * 1.6 / size.x, phi = interleavedGradientNoise(gl_FragCoord.xy) * PI2, lit = 0.0, texel = 1.5 / size.x * (abs(slope.x) + abs(slope.y)); // a stored depth stands for a whole texel
      for (int i = 0; i < ${cfg.taps}; i++) { vec2 o = vogelDiskSample(i, ${cfg.taps}, phi) * r; lit += texture(shadowMap, vec3(c.xy + o, c.z + dot(slope, o) - texel)); }
      return mix(1.0, lit / ${f(cfg.taps)}, intensity);
    }
    #endif
    #ifdef USE_LIGHT_PROBES_GRID
    vec3 roomGI(vec3 p, vec3 n) {
      vec3 half_ = (probesMax - probesMin) / (probesResolution - 1.0) * 0.5;
      vec3 s = clamp(p + n * half_, ${vec3(GI.safeMin)}, ${vec3(GI.safeMax)});
      // the plan is an L: where a lookup would blend the probes of the porch court into a room, it stays with the room's own
      if (p.z > ${f(GI.split)}) s.x = clamp(s.x, ${f(GI.wingX[0])}, ${f(GI.wingX[1])});
      else s.z = mix(s.z, min(s.z, ${f(GI.mainZ)}), max(1.0 - smoothstep(${f(GI.wingX[0] - 0.3)}, ${f(GI.wingX[0])}, s.x), smoothstep(${f(GI.wingX[1])}, ${f(GI.wingX[1] + 0.3)}, s.x)));
      return getLightProbeGridIrradiance(s - n * half_, n);
    }
    #endif
  `;

  // the standard light loop, patched once: walls hide lamps, openings gate the sun, the probes are read room by room, the strips are added
  let loop = THREE.ShaderChunk.lights_fragment_begin, ok = true;
  const patch = (from: string, to: string) => { if (!loop.includes(from)) { ok = false; console.warn('[interior] three changed its light loop; the rooms fall back to stock shading:', from.slice(0, 48)); return; } loop = loop.replace(from, to); };
  patch('getPointLightInfo( pointLight, geometryPosition, directLight );', 'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tif ( directLight.visible ) directLight.color *= roomVis( roomP, roomPosW( pointLight.position ) );');
  patch('getSpotLightInfo( spotLight, geometryPosition, directLight );', 'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tif ( directLight.visible ) directLight.color *= roomVis( roomP, roomPosW( spotLight.position ) );');
  patch('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= roomSun( vRW, roomDirW( directionalLight.direction ) ) * ROOM_SUN; directLight.visible = ( directLight.color != vec3( 0.0 ) );');
  patch('getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )',
    '\n\t\t#ifdef SHADOWMAP_TYPE_PCF\n\t\troomSunShadow\n\t\t#else\n\t\tgetShadow\n\t\t#endif\n\t\t( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )');
  patch('RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
    '{ vec3 rd0 = reflectedLight.directDiffuse, rs0 = reflectedLight.directSpecular;\n\t\tRE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t\tfloat rv = roomVis( roomP, roomPosW( rectAreaLight.position ) ); reflectedLight.directDiffuse = mix( rd0, reflectedLight.directDiffuse, rv ); reflectedLight.directSpecular = mix( rs0, reflectedLight.directSpecular, rv ); }');
  // with the probes in, the hemisphere light is only a trace of fill: the rooms' ambient is what the rooms themselves give back
  patch('irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );', 'dbgFill = irradiance; dbgGI = roomGI( vRW, probeWorldNormal ); irradiance = irradiance * mix( 1.0, ROOM_FILL, uGI ) + dbgGI * uGI * uGIK;');
  // a fragment whose normal has no length cannot be lit (seen as black slivers, a sample wide, that the resolve spreads over the pixel): it is not drawn
  loop = `{ float rn = dot( vRN, vRN ); if ( ! ( rn > 0.25 && rn < 4.0 ) ) discard; }\nvec3 roomP = vRW + vRN * 0.012;\n${loop}
    #if defined( RE_Direct )
    ${stripCode(cfg.strips)}
    #endif
    #if defined( RE_IndirectDiffuse )
    dbgCove = roomCove( roomP, transformNormalByInverseViewMatrix( geometryNormal, viewMatrix ) ); irradiance += dbgCove;
    #endif`;

  const looks: Record<Look, { map: string; rough: string; normal: string }> = {
    plain: { map: '#include <map_fragment>', rough: '#include <roughnessmap_fragment>', normal: '#include <normal_fragment_maps>' },
    // limewash: `map` is only a tonal mottle (clouds, ±4 % at most) read at two scales (3.4 m and 1 m, the second turned a quarter)
    // plus a slow drift in world space; the trowel relief is read at two scales as well, so neither the tone nor the relief ever
    // repeats on a wall. The relief map holds slopes of 0.1 r.m.s.: normalScale 0.15 = the 2 % of a wall closed with a steel trowel
    limewash: {
      map: `#ifdef USE_MAP
        { float m1 = texture2D( map, vMapUv * 0.47 + vec2( 0.13, 0.71 ) ).g, m2 = texture2D( map, vec2( vMapUv.y, -vMapUv.x ) * 1.63 + vec2( 0.57, 0.29 ) ).g;
          float drift = roomNoise( vec2( vRW.x + vRW.z, vRW.y ) * 0.6 ) + 0.5 * roomNoise( vec2( vRW.x - vRW.z, vRW.y ) * 1.7 + 7.0 );
          diffuseColor.rgb *= 1.0 + ( ( m1 - 0.5 ) * 0.14 + ( m2 - 0.5 ) * 0.06 + ( drift - 0.75 ) * 0.03 ) * uMottle; }
      #endif`,
      rough: `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= mix( 0.9, 1.06, texture2D( roughnessMap, vRoughnessMapUv * 0.61 + vec2( 0.3, 0.6 ) ).g );
      #endif`,
      normal: `#ifdef USE_NORMALMAP_TANGENTSPACE
        { vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0, wide = texture2D( normalMap, vNormalMapUv * 0.37 + vec2( 0.41, 0.23 ) ).xyz * 2.0 - 1.0;
          mapN = vec3( ( mapN.xy + wide.xy * 0.8 ) * normalScale, mapN.z );
          #ifdef ROOM_FINE
          // the paint's stipple, read twice (0.6 m, and 0.83 m turned a quarter) so no repeat can line up; it fades out where a texel of it
          // is smaller than the pixel, so it never sparkles
          { vec2 fu = vNormalMapUv * uFineK; vec2 f1 = texture2D( uFine, fu ).xy * 2.0 - 1.0, f2 = texture2D( uFine, vec2( fu.y, -fu.x ) * 0.72 + vec2( 0.31, 0.67 ) ).xy * 2.0 - 1.0;
            f2 = vec2( -f2.y, f2.x ); // the second read's slopes turned back into the surface's frame
            float fp = length( fwidth( fu ) ) * 1024.0; mapN.xy += ( f1 + f2 * 0.7 ) * uFineS * ( 1.0 - smoothstep( 1.5, 5.0, fp ) ); }
          #endif
          normal = normalize( tbn * mapN ); }
      #endif`,
    },
    // stone slabs: every slab is cut from another part of the block (its own offset into the scan, half of them turned end for end),
    // carries its own tone (±2 %) and sits a hair out of plane; the joints (grouted in the stone's colour, a shade down) are
    // filtered by their true coverage of the pixel, so a 2 mm joint neither shimmers nor turns into a drawn line in the distance
    tiles: {
      map: `vec2 tq = vec2( vRW.x / TILE_X, vRW.z / TILE_Z ); tq.y += floor( tq.x ) * 0.3333;
      vec2 tid = floor( tq ), tfr = fract( tq ); float th1 = roomHash( tid ), th2 = roomHash( tid + 17.3 ), tflip = step( 0.5, fract( th1 * 7.13 ) );
      vec2 tdx = dFdx( vMapUv ), tdy = dFdy( vMapUv ), tuv = vec2( mix( vMapUv.x, -vMapUv.x, tflip ), vMapUv.y ) + vec2( th1, th2 );
      vec2 tdj = min( tfr, 1.0 - tfr ) * vec2( TILE_X, TILE_Z ); float tj = min( tdj.x, tdj.y ), tpx = max( fwidth( vRW.x ), fwidth( vRW.z ) ) + 1e-5;
      float joint = clamp( ( min( tj + tpx * 0.5, TILE_J ) - max( tj - tpx * 0.5, -TILE_J ) ) / tpx, 0.0, 1.0 );
      #ifdef USE_MAP
        diffuseColor *= textureGrad( map, tuv, tdx, tdy );
      #endif
      diffuseColor.rgb *= ( 0.975 + 0.045 * fract( th2 * 5.31 ) ) * mix( 1.0, 0.5, joint );`,
      rough: `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= textureGrad( roughnessMap, tuv, tdx, tdy ).g;
      #endif
      roughnessFactor = mix( roughnessFactor * mix( 0.88, 1.12, roomNoise( vRW.xz * 1.3 ) * 0.6 + roomNoise( vRW.xz * 5.1 + 3.0 ) * 0.4 ), 0.95, joint );`,
      normal: `#ifdef USE_NORMALMAP_TANGENTSPACE
        { vec3 mapN = textureGrad( normalMap, tuv, tdx, tdy ).xyz * 2.0 - 1.0; mapN.x = mix( mapN.x, -mapN.x, tflip );
          mapN.xy = mapN.xy * normalScale + ( vec2( th1, th2 ) - 0.5 ) * 0.004; normal = normalize( tbn * mapN ); }
      #endif`,
    },
  };

  function shade<T extends THREE.MeshStandardMaterial>(mat: T, o: ShadeOpts = {}): T {
    const look = looks[o.look ?? 'plain'], tile = o.tile ?? [0.6, 1.2, 0.002];
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      Object.assign(sh.uniforms, shared, { uShade: { value: o.strength ?? 1 }, uGIK: { value: cfg.gi * (o.gi ?? 1) }, uMottle: { value: o.mottle ?? 1 }, uTight: { value: cfg.tight ?? 0 },
        uFineK: { value: o.fine ? (o.worldUv ?? 1) / o.fine.tile : 0 }, uFineS: { value: o.fine?.scale ?? 0 }, uFine: { value: o.fine?.tex ?? null } });
      sh.vertexShader = 'varying vec3 vRW;\nvarying vec3 vRN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vRW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRN = normalize(mat3(modelMatrix) * objectNormal);`);
      if (o.worldUv) {
        const k = f(1 / o.worldUv);
        // floors and ceilings: a stone's veins (the scan's u) run along z, into the house; walls: along the wall, or upright for veneer
        sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      { vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; vec3 an = abs(mat3(modelMatrix) * normal);
        vec2 wuv = (an.y > 0.5 ? wp.zx : an.x > an.z ? ${o.grainUp ? 'vec2(wp.y, wp.z)' : 'vec2(wp.z, wp.y)'} : ${o.grainUp ? 'vec2(wp.y, wp.x)' : 'wp.xy'}) * ${k};
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
      }
      let fs = sh.fragmentShader.replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>\n${pars}`)
        .replace('#include <map_fragment>', look.map).replace('#include <roughnessmap_fragment>', look.rough).replace('#include <normal_fragment_maps>', look.normal)
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n      iblIrradiance *= mix( 1.0, ROOM_FILL, uGI );')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float rao = roomAO(vRW, vRN); reflectedLight.indirectDiffuse *= rao; reflectedLight.indirectSpecular *= rao; reflectedLight.directDiffuse *= mix(1.0, rao, 0.4); }${DEBUG_NAN}`);
      if (ok) fs = fs.replace('#include <lights_fragment_begin>', loop);
      sh.fragmentShader = `${o.fine && o.look === 'limewash' ? '#define ROOM_FINE\n' : ''}#define ROOM_FILL ${f(cfg.fill)}\n#define ROOM_SUN ${f(cfg.sun)}\n#define TILE_X ${f(tile[0])}\n#define TILE_Z ${f(tile[1])}\n#define TILE_J ${f(tile[2] / 2)}\n` + fs;
    };
    const key = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => `${key ? key.call(mat) : ''}room-${o.look ?? 'plain'}-${o.fine && o.look === 'limewash' ? 'fine-' : ''}${o.worldUv ?? 0}-${o.grainUp ? 'up' : 'along'}-${tile.join('x')}`; // uShade and uGIK are uniforms: materials that differ only in them share a program
    return mat;
  }
  return { shade, uGI };
}
