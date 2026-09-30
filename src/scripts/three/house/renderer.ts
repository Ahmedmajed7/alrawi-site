import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { gsap } from 'gsap';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createRenderer, type Tier } from '../common';
import { WORLD_TIME } from './wind';
import { createEnvironment, type Environment } from './environment';
import { createGradePass, LOOKS, type Grade } from './grade';
import type { HouseConfig } from './types';
import villaJson from '@/data/villa.json';

export interface Stage {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight; composer: EffectComposer | null; gtao: GTAOPass | null; bloom: UnrealBloomPass | null; grade: Grade | null; env: Environment;
  /** true while the camera is inside the villa's plan (drives the AO, grade and logo switches) */
  readonly inside: boolean;
  setSize(w: number, h: number): void; render(): void; update(dt: number): void; fitShadows(bounds: THREE.Box3): void; dispose(): void;
  /** Rack the (recording-only) depth of field to a distance in metres over `dur` seconds; ≥ 20 m means deep focus. */
  focusOn(dist: number, dur: number): void;
  /** Cross-fade the film grade to the indoor / outdoor look over `dur` seconds. */
  setLook(inside: boolean, dur: number): void;
}

/* ------------------------------------------------------------------ the sun's shadow */
const SUN_DISC = 0.0052; // angular radius the filter gives the sun (rad): the real disc (0.00465) and a breath of haze. Wider washed the palms off the walls
const PEN_MAX = 0.07;    // widest penumbra radius (m): a street palm 30 m up-sun would throw 16 cm; capped, its fronds still read as fronds
const REACH = 90;        // how far up-sun a caster may stand and still shade the plot (a 20 m palm under a 13.7° sun throws 82 m)
/**
 * three r186 ships two shadow filters and neither holds up on a wall one metre from the lens: PCF is five taps turned per pixel by
 * a screen-space noise (grainy, stepped penumbrae; "soft" PCF was removed) and VSM bleeds light where walls overlap. The villa
 * brings its own in the slot of the unfiltered type, which hands the shader the raw depth map:
 *  - the sun gets contact-hardening shadows (PCSS): a blocker search measures how far the caster stands from the receiver and the
 *    penumbra grows with that distance, as the real one does (crisp at a door casing, soft under a palm);
 *  - every texel is tested against the receiver's own plane, so a wide kernel on a floor the low sun grazes neither
 *    self-shadows nor needs a fat bias (a fat bias is what leaks light at wall junctions);
 *  - the taps sit on a fixed disc when recording: the result belongs to the surface, not to the screen, so nothing swims or
 *    flickers under a moving camera (live, fewer taps are turned per pixel instead); every tap reads four texels (bilinear in the
 *    filter, 2 x 2 in the blocker search), so a fixed disc neither steps nor lets a one-texel leaflet slip between its taps;
 *  - only the penumbra pays: a pixel whose whole neighbourhood is lit, or blocked, is settled by the search alone, and a
 *    surface turned away from the light is not asked at all (it has no direct light to shade);
 *  - shadows fade out over the last few percent of the map, so its edge is never a line on the ground.
 * The sun's `shadow.radius` carries two numbers for it (see `packSun`); spots keep `radius` = texels.
 */
function installShadowFilter(record: boolean): boolean {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (chunk.includes('villaTap')) return true; // a second stage on the same page
  // the slot: the `#else` that opens the unfiltered getShadow, up to the sun-cascade block after it (the build strips three's comments)
  const vsm = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )'), m = vsm < 0 ? null : /#else[^\n]*\n\s*float getShadow\(/.exec(chunk.slice(vsm));
  const a = m ? vsm + m.index : -1, b = a < 0 ? -1 : chunk.indexOf('#if NUM_SUN_LIGHT_SHADOWS > 0', a);
  if (a < 0 || b < 0) { console.warn('[stage] three\'s shadow chunk has changed: keeping its own PCF filter'); return false; }
  const taps = (new URLSearchParams(location.search).get('vtaps') || (record ? '12,24,16' : '6,12,8')).split(',').map(Number); // dev: ?vtaps=search,taps,spot
  const phi = record ? '0.0' : 'fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) * 6.2831853';
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, a) + /* glsl */`#else // the unfiltered slot carries the villa's filter (house/renderer.ts)

		#define VILLA_SEARCH ${taps[0]}
		#define VILLA_TAPS ${taps[1]}
		#define VILLA_SPOT ${taps[2]}
		#define VILLA_DENSITY ${record ? '1.6' : '0.6'}
		#define VILLA_SUN ${SUN_DISC.toFixed(5)}

		vec2 villaDisc( int i, int n, float phi ) { // Vogel disc: even cover for any tap count
			float r = sqrt( ( float( i ) + 0.5 ) / float( n ) ), t = float( i ) * 2.399963229728653 + phi;
			return vec2( cos( t ), sin( t ) ) * r;
		}

		// a texel tested against the receiver's plane at its own centre
		float villaNear( sampler2D map, vec2 size, vec2 uv0, float z0, vec2 grad, float lim, vec2 uv ) {
			ivec2 t = ivec2( floor( uv * size ) );
			float z = z0 + clamp( dot( ( vec2( t ) + 0.5 ) / size - uv0, grad ), - lim, lim );
			return step( z, texelFetch( map, clamp( t, ivec2( 0 ), ivec2( size ) - 1 ), 0 ).r );
		}

		// one tap = four texels with bilinear weights (what hardware PCF does), each tested against the plane at its centre
		float villaTap( sampler2D map, vec2 size, vec2 uv0, float z0, vec2 grad, float lim, vec2 uv ) {
			vec2 p = uv * size - 0.5, f = fract( p ); ivec2 i = ivec2( floor( p ) ), hi = ivec2( size ) - 1;
			float s[ 4 ];
			for ( int k = 0; k < 4; k ++ ) {
				ivec2 t = i + ivec2( k & 1, k >> 1 );
				float z = z0 + clamp( dot( ( vec2( t ) + 0.5 ) / size - uv0, grad ), - lim, lim );
				s[ k ] = step( z, texelFetch( map, clamp( t, ivec2( 0 ), hi ), 0 ).r );
			}
			return mix( mix( s[ 0 ], s[ 1 ], f.x ), mix( s[ 2 ], s[ 3 ], f.x ), f.y );
		}

		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

			shadowCoord.xyz /= shadowCoord.w;
			vec3 sc = shadowCoord.xyz;
			// the receiver's plane in shadow-map space (depth per uv), from screen-space derivatives taken before any branch
			vec3 dx = dFdx( sc ), dy = dFdy( sc );
			float det = dx.x * dy.y - dx.y * dy.x;
			vec2 grad = abs( det ) > 1e-14 ? vec2( dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det : vec2( 0.0 );
			float shadow = 1.0;

			if ( sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0 && sc.z <= 1.0 ) {

				vec2 texel = 1.0 / shadowMapSize;
				float phi = ${phi};
				float z0 = sc.z + shadowBias;

				if ( shadowRadius < 0.0 ) { // the sun (orthographic: depth is linear, so a depth gap is a distance)

					float K = floor( - shadowRadius ) * 1e-4, maxR = fract( - shadowRadius ) * 0.01; // uv of penumbra per unit of depth gap; widest penumbra (uv)
					float unit = VILLA_SUN / K;                   // one metre of depth per metre across, in depth per uv
					float g = length( grad ), gmax = 10.0 * unit; // past 84° off the light a surface gets no sun worth a shadow: cap the plane there
					if ( g > gmax ) grad *= gmax / g;
					float minR = 1.25 * texel.x;
					// the blocker search reads 2 x 2 texels per tap, the pixel's own four first: a leaflet one texel wide cannot slip
					// between the taps and leave its shadow out (single texels over a wide disc missed half a palm frond)
					float gap = 0.0, nb = 0.0; ivec2 hi = ivec2( shadowMapSize ) - 1;
					for ( int i = 0; i <= VILLA_SEARCH; i ++ ) {
						vec2 o = i == 0 ? vec2( 0.0 ) : villaDisc( i - 1, VILLA_SEARCH, phi ) * maxR;
						ivec2 t0 = ivec2( floor( ( sc.xy + o ) * shadowMapSize - 0.5 ) );
						for ( int k = 0; k < 4; k ++ ) {
							ivec2 t = t0 + ivec2( k & 1, k >> 1 );
							vec2 c = ( vec2( t ) + 0.5 ) * texel - sc.xy;
							float zr = z0 + dot( c, grad ) - 0.3 * unit * length( c ); // a blocker stands proud of the receiver's plane (a curved receiver is not its own blocker)
							float d = texelFetch( shadowMap, clamp( t, ivec2( 0 ), hi ), 0 ).r;
							if ( d < zr ) { gap += zr - d; nb += 1.0; }
						}
					}
					if ( nb > 4.0 * float( VILLA_SEARCH + 1 ) - 0.5 ) shadow = 0.0; // every direction is blocked: the umbra
					else if ( nb > 0.5 ) {
						// every tap bilinear (four texels, each against the receiver's plane): the estimate is a smooth function of the
						// surface point, so a fixed disc neither steps nor paints the texel grid onto a wall (point taps did: fine striations)
						float r = clamp( K * gap / nb, minR, maxR ), rt = r * shadowMapSize.x, lit = 0.0;
						int n = rt < 3.0 ? 8 : clamp( int( ceil( rt * VILLA_DENSITY ) ), min( 12, VILLA_TAPS ), VILLA_TAPS );
						for ( int i = 0; i < n; i ++ ) lit += villaTap( shadowMap, shadowMapSize, sc.xy, z0, grad, 1.0, sc.xy + villaDisc( i, n, phi ) * r );
						shadow = lit / float( n );
					}
					float edge = min( min( sc.x, 1.0 - sc.x ), min( sc.y, 1.0 - sc.y ) );
					shadow = mix( 1.0, shadow, smoothstep( 0.0, 0.05, edge ) );

				} else { // spots: a soft disc of \`radius\` texels

					float g = length( grad ); if ( g > 2.0 ) grad *= 2.0 / g;
					float r = max( shadowRadius, 1.0 ) * texel.x, lit = 0.0;
					for ( int i = 0; i < 5; i ++ ) // probe the rim and the centre first: most pixels are wholly lit or wholly shaded
						lit += villaNear( shadowMap, shadowMapSize, sc.xy, z0, grad, 0.02, sc.xy + ( i < 4 ? vec2( float( i & 1 ) * 2.0 - 1.0, float( i >> 1 ) * 2.0 - 1.0 ) * 0.75 * r : vec2( 0.0 ) ) );
					if ( lit < 0.5 ) shadow = 0.0;
					else if ( lit < 4.5 ) {
						lit = 0.0;
						for ( int i = 0; i < VILLA_SPOT; i ++ ) lit += villaNear( shadowMap, shadowMapSize, sc.xy, z0, grad, 0.02, sc.xy + villaDisc( i, VILLA_SPOT, phi ) * r );
						shadow = lit / float( VILLA_SPOT );
					}

				}

			}

			return mix( 1.0, shadow, shadowIntensity );

		}

	#endif

	` + chunk.slice(b);
  // a surface facing away from a light receives none of it: do not filter a shadow for it (half the pixels of a room)
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(/\( directLight\.visible && receiveShadow \) \? getShadow\(/g, '( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow(');
  return true;
}

/**
 * The beauty render: the sky and the range, then the villa over them, into one multisampled target that is resolved once and
 * handed to the composer. Only geometry needs the four samples; with the composer's own buffers multisampled every
 * full-screen pass after it (occlusion, bloom, tone curve, SMAA, grade) filled and resolved 4x HDR samples for nothing —
 * about two fifths of a recorded frame.
 */
class BeautyPass extends Pass {
  private target: THREE.WebGLRenderTarget; private quad: FullScreenQuad;
  constructor(private bg: THREE.Scene, private bgCam: THREE.Camera, private scene: THREE.Scene, private camera: THREE.Camera, samples: number) {
    super();
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, blending: THREE.NoBlending, depthTest: false, depthWrite: false }));
  }
  setSize(w: number, h: number) { this.target.setSize(w, h); }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    const auto = renderer.autoClear; renderer.autoClear = false;
    renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(this.bg, this.bgCam); renderer.clearDepth(); renderer.render(this.scene, this.camera);
    (this.quad.material as THREE.ShaderMaterial).uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
    renderer.autoClear = auto;
  }
  dispose() { this.target.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
}

export async function createStage(canvas: HTMLCanvasElement, tier: Tier, cfg: HouseConfig, plot: { x0: number; x1: number; z0: number; z1: number }, opts: { record?: boolean } = {}): Promise<Stage> {
  const record = !!opts.record; // frame-exact film capture: spend what a live frame never could
  const q = new URLSearchParams(location.search);
  const renderer = createRenderer(canvas, tier);
  // film frames render at 2x and are box-filtered down in __rec.step: sub-pixel fronds and specks no longer crawl. A larger film
  // passes a smaller ?pr (record-film.mjs: 1.5 for --size=2560x1440) so the buffer stays about 3840 px wide
  const pr = record ? Math.max(1, Math.min(2, Number(q.get('pr')) || 2)) : 0;
  if (record) renderer.setPixelRatio(pr);
  if (record) renderer.transmissionResolutionScale = 1 / pr; // what shows through glass is drawn at the film's own size, not at the 2x it is sampled down from (a second full scene pass otherwise)
  renderer.toneMapping = THREE.AgXToneMapping; // filmic: keeps colour in the highlights where ACES goes chalky
  renderer.shadowMap.enabled = tier === 'high';
  const ownFilter = tier === 'high' && q.get('shadows') !== 'stock' && installShadowFilter(record); // dev: ?shadows=stock
  renderer.shadowMap.type = ownFilter ? THREE.BasicShadowMap : THREE.PCFShadowMap;
  renderer.toneMappingExposure = cfg.exposure.exterior;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.06, 900);

  // sun + sky fill (the sky dome, IBL, lawn, trees and clouds live in environment.ts)
  const maxTex = renderer.capabilities.maxTextureSize;
  const shadowSize = Math.min(maxTex, 4096); // 8K shadow maps crashed the headless recorder on long segments
  const sun = new THREE.DirectionalLight(cfg.sun.color, cfg.sun.intensity);
  sun.position.set(...cfg.sun.dir); sun.castShadow = tier === 'high';
  sun.shadow.mapSize.set(shadowSize, shadowSize); sun.shadow.normalBias = 0.003;
  const hemi = new THREE.HemisphereLight(cfg.hemi?.sky ?? '#dfe9f5', cfg.hemi?.ground ?? '#7d8a5c', cfg.hemi?.intensity ?? 0.12); const hemi0 = hemi.intensity;
  scene.add(sun, sun.target, hemi);

  // The shadow map is fitted, not flung over the neighbourhood: two fixed squares in the sun's own frame — WIDE holds what the
  // hero sees (the street, the compounds either side), NEAR the villa's plot to its full height, rooms included (4 mm texels
  // where the old 50 m map had 12). Neither follows the camera, so a shadow never crawls while it moves; the map only zooms
  // between the two on the way in and out (by the camera's distance from the plot, when the whole frame is moving anyway),
  // and the penumbra is kept in metres so the zoom does not change how soft a shadow is. The square may roll about the sun's
  // direction: each fit takes the roll that makes it smallest, and its centre sits on whole texels.
  const L = new THREE.Vector3(...cfg.sun.dir).normalize();
  const ax0 = new THREE.Vector3(0, 1, 0).cross(L).normalize(), ay0 = L.clone().cross(ax0);
  interface Fit { c: THREE.Vector3; half: number; roll: number }
  const span = (b: THREE.Box3, a: THREE.Vector3): [number, number] => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < 8; i++) { const v = a.x * (i & 1 ? b.max.x : b.min.x) + a.y * (i & 2 ? b.max.y : b.min.y) + a.z * (i & 4 ? b.max.z : b.min.z); lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };
  const axes = (roll: number) => ({ ax: ax0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(ay0, Math.sin(roll)), ay: ay0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(ax0, -Math.sin(roll)) });
  const fitBox = (b: THREE.Box3, pad: number): Fit => {
    let best: Fit | null = null;
    for (let d = 0; d < 180; d += 2) { const roll = (d * Math.PI) / 180, { ax, ay } = axes(roll), [x0, x1] = span(b, ax), [y0, y1] = span(b, ay); const half = (Math.max(x1 - x0, y1 - y0) / 2) * pad; if (!best || half < best.half - 1e-6) best = { c: ax.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(ay, (y0 + y1) / 2), half, roll }; }
    return best!;
  };
  const fits: { wide: Fit; near: Fit; depth: [number, number]; foot: THREE.Box3 } = { wide: { c: new THREE.Vector3(), half: 25, roll: 0 }, near: { c: new THREE.Vector3(), half: 9, roll: 0 }, depth: [-35, 30], foot: new THREE.Box3() };
  const setFits = (top: number) => {
    const near = new THREE.Box3(new THREE.Vector3(plot.x0 - 0.2, -0.1, plot.z0 - 0.2), new THREE.Vector3(plot.x1 + 0.2, top, plot.z1 + 0.25));
    const wide = new THREE.Box3(new THREE.Vector3(-24, -0.1, -14), new THREE.Vector3(30, Math.max(top, 10), 13)); // the ground the hero frame shows, and a storey of the neighbours
    fits.near = fitBox(near, 1.06); fits.wide = fitBox(wide, 1.06); fits.depth = span(wide, L); fits.foot = near; // (6 % spare: the map's edge fades over its last 5 %)
  };
  const fitForced = q.get('fit'); // dev: ?fit=wide | near
  let zoom = -1, applied = -1;
  /** 0 = WIDE, 1 = NEAR: by the camera's distance from the plot on the ground (inside it, NEAR). */
  const zoomFor = (p: THREE.Vector3) => { if (fitForced) return fitForced === 'near' ? 1 : 0; const b = fits.foot, d = Math.hypot(Math.max(b.min.x - p.x, 0, p.x - b.max.x), Math.max(b.min.z - p.z, 0, p.z - b.max.z)); return 1 - THREE.MathUtils.smoothstep(d, 1, 9); };
  const applyFit = (k: number) => {
    if (Math.abs(k - applied) < 1e-5) return; applied = k;
    const a = fits.wide, b = fits.near, half = THREE.MathUtils.lerp(a.half, b.half, k), roll = THREE.MathUtils.lerp(a.roll, b.roll, k), { ax, ay } = axes(roll);
    const texel = (2 * half) / shadowSize, c = a.c.clone().lerp(b.c, k);
    const cx = Math.round(c.dot(ax) / texel) * texel, cy = Math.round(c.dot(ay) / texel) * texel; // whole texels: a fit that comes back is the same map
    const base = ax.clone().multiplyScalar(cx).addScaledVector(ay, cy), [d0, d1] = fits.depth, range = d1 - d0 + REACH + 2;
    sun.target.position.copy(base).addScaledVector(L, d0); sun.position.copy(base).addScaledVector(L, d1 + REACH);
    const sc = sun.shadow.camera; sc.up.copy(ay); sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 0.5; sc.far = range + 0.5; sc.updateProjectionMatrix();
    if (ownFilter) { sun.shadow.bias = -0.0025 / range; sun.shadow.radius = packSun((SUN_DISC * range) / (2 * half), PEN_MAX / (2 * half)); }
    else { sun.shadow.bias = -0.012 / range; sun.shadow.radius = THREE.MathUtils.clamp(0.02 / texel, 1, 6); } // three's own filter: a 2 cm disc
  };
  /** The sun's `shadow.radius` as the filter reads it: −(penumbra uv per unit of depth gap × 10⁴, whole) − (widest penumbra uv × 100, the fraction). */
  const packSun = (k: number, maxR: number) => -(Math.max(1, Math.round(k * 1e4)) + Math.min(0.999, maxR * 100));
  setFits(9); applyFit(0);

  const env = await createEnvironment(scene, renderer, cfg, tier, plot);
  const breathe = !(q.get('env') || '').split(',').includes('breathe'); // the sky fill pulses ±2.5 % on the hero loop's period (environment.ts breathes the fog and haze)

  // the background (sky, 30 km of terrain) renders with its own camera: same pose and lens as the scripted camera, but a far
  // plane of 60 km and a near plane of 20 m, so the range has depth precision and the villa's 6 cm near plane is untouched
  const bgCam = new THREE.PerspectiveCamera(50, 1, 20, 60000);
  const syncBg = () => { bgCam.position.copy(camera.position); bgCam.quaternion.copy(camera.quaternion); if (bgCam.fov !== camera.fov || bgCam.aspect !== camera.aspect) { bgCam.fov = camera.fov; bgCam.aspect = camera.aspect; bgCam.updateProjectionMatrix(); } bgCam.updateMatrixWorld(); };
  let composer: EffectComposer | null = null, gtao: GTAOPass | null = null, smaa: SMAAPass | null = null, bloom: UnrealBloomPass | null = null, dof: BokehPass | null = null, grade: Grade | null = null;
  // ambient occlusion is contact shading only: the rooms' broad corner shading is analytic (interior.ts) and a wide screen-space
  // AO on top of it greys flat walls and rings every wall device with a halo. Indoors the reach is a hand's width, with a
  // steep fall-off; outdoors it is wider (eaves, the foot of the garden wall, under the shrubs)
  const aoOut = { radius: 0.34, distanceExponent: 1.4, thickness: 0.4, scale: 0.85, distanceFallOff: 1 }, aoIn = { radius: 0.16, distanceExponent: 2, thickness: 0.2, scale: 1, distanceFallOff: 1 }; // thickness ≈ reach: a chair half a metre in front of a wall is not that wall's occluder
  const aoBlend = { out: 0.62, in: 0.72 };
  if (tier === 'high') {
    // 4x MSAA on the beauty render: SMAA alone cannot hold sub-pixel geometry (palm leaflets, merlons, railings), which shimmered.
    // The sky + the real range go first (beauty only, no AO, their own long-range camera), the villa over them
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    composer.addPass(new BeautyPass(env.background, bgCam, scene, camera, 4));
    if (!q.has('noao')) { // dev: ?noao, ?ao=view shows the occlusion alone
      gtao = new GTAOPass(scene, camera, 1, 1); gtao.output = q.get('ao') === 'view' ? GTAOPass.OUTPUT.Denoise : GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({ ...aoOut, samples: record ? 32 : 12, screenSpaceRadius: false });
      // the denoiser must not carry occlusion across an edge: a device stands 1-3 cm proud of its wall, so a sample more than a
      // few centimetres off the pixel's own plane does not count (three's default, 2 m, smears the contact line into a halo)
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 0.04, normalPhi: 4, radius: 6, radiusExponent: 1.5, rings: 2, samples: record ? 16 : 12 });
      gtao.blendIntensity = aoBlend.out;
      composer.addPass(gtao);
    }
    if (record && !q.has('nodof')) { // a lens: shallow focus on each device, deep focus outdoors (dev: ?nodof)
      dof = new BokehPass(scene, camera, { focus: 40, aperture: 0, maxblur: 0.0028 }); composer.addPass(dof);
    }
    // bloom, in scene light before the tone curve: only what is brighter than any lit wall glows (lamp discs, the cove, lantern
    // glass, the sun's glint on brass). A sunlit limewash wall is ~1.0 and the sky ~2 here, the threshold sits above both, so a
    // bright window or the sky never veils the frame (dev: ?bloom=0)
    if (q.get('bloom') !== '0') { bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.14, 0.42, 2.6); composer.addPass(bloom); }
    // tone curve first, then SMAA: its edge detection is built for display values (in scene light it misses edges in the shade and
    // over-reads the bright ones); MSAA's resolve averages scene light, so a roof edge against the sky needs this second look
    composer.addPass(new OutputPass());
    smaa = new SMAAPass(); composer.addPass(smaa);
    if (!q.has('nograde')) { grade = createGradePass({ aberration: 0, grain: record ? 0 : 1 }); composer.addPass(grade.pass); } // dev: ?nograde. The film is recorded clean: per-frame grain and lens fringing shimmered once compressed
  }
  let wasInside: boolean | null = null, aoK = -1, aoApplied = -1;
  const lens = { focus: 40, aperture: 0 };
  const applyLens = () => { if (!dof) return; const u = dof.uniforms as Record<string, { value: number }>; u.focus.value = lens.focus; u.aperture.value = lens.aperture; };
  const stage: Stage = {
    renderer, scene, camera, sun, composer, gtao, bloom, grade, env,
    get inside() { return !!wasInside; },
    // the occlusion and the bloom are computed at CSS size: for the film that is the size of the published frame
    setSize(w, h) { composer?.setSize(w, h); gtao?.setSize(w, h); bloom?.setSize(w, h); grade?.setAspect(w / Math.max(1, h)); },
    render() {
      camera.updateMatrixWorld(); syncBg();
      if (composer) { composer.render(); return; }
      renderer.autoClear = false; renderer.clear(); renderer.render(env.background, bgCam); renderer.clearDepth(); renderer.render(scene, camera);
    },
    update(dt) {
      env.update(dt, camera);
      if (breathe) hemi.intensity = hemi0 * (1 + 0.025 * Math.sin(0.5 * WORLD_TIME.value + 2.0) * env.wind.value);
      grade?.tick(dt);
      // indoors: tighter ambient occlusion (see aoIn). Also hide the logo and the sky-bound ambient life (birds) from inside.
      const p = camera.position, pl = villaJson.plan; const inside = p.x > pl.x0 && p.x < pl.x1 && p.z > pl.z0 && p.z < pl.wing.z1 && p.y < pl.slabY;
      if (inside !== wasInside) { wasInside = inside; env.setInside(inside); }
      // the occlusion eases between its outdoor and indoor reach over ~0.7 s (switched on the threshold, the contact shading
      // popped in the middle of the walk through the door); a jump cut lands at once
      const aoWant = inside ? 1 : 0; aoK = aoK < 0 || dt <= 0 ? aoWant : aoK + THREE.MathUtils.clamp(aoWant - aoK, -1.4 * dt, 1.4 * dt);
      if (gtao && aoK !== aoApplied) {
        aoApplied = aoK; const k = aoK * aoK * (3 - 2 * aoK), mix = (a: number, b: number) => a + (b - a) * k;
        gtao.updateGtaoMaterial({ radius: mix(aoOut.radius, aoIn.radius), distanceExponent: mix(aoOut.distanceExponent, aoIn.distanceExponent), thickness: mix(aoOut.thickness, aoIn.thickness), scale: mix(aoOut.scale, aoIn.scale), distanceFallOff: mix(aoOut.distanceFallOff, aoIn.distanceFallOff) });
        gtao.blendIntensity = mix(aoBlend.out, aoBlend.in);
      }
      // the shadow map's zoom follows the camera's place (a jump cut — a still, a deep link — lands at once; otherwise at most 2.2/s)
      const want = zoomFor(p); zoom = zoom < 0 || dt <= 0 ? want : zoom + THREE.MathUtils.clamp(want - zoom, -2.2 * dt, 2.2 * dt);
      applyFit(zoom);
    },
    setLook(inside, dur) {
      if (!grade) return;
      const to = LOOKS[inside ? 'interior' : 'exterior'];
      gsap.killTweensOf(grade.look);
      if (dur <= 0) { Object.assign(grade.look, to); grade.apply(); return; }
      gsap.to(grade.look, { ...to, duration: dur, ease: 'sine.inOut', onUpdate: () => grade!.apply() });
    },
    focusOn(dist, dur) {
      if (!dof) return;
      // aperture falls with distance so the blur stays a hint of a lens, never a smear; deep focus beyond ~20 m
      const aperture = dist >= 20 ? 0 : THREE.MathUtils.clamp(0.011 / Math.max(0.4, dist), 0.0012, 0.012);
      gsap.killTweensOf(lens); if (dur <= 0) { lens.focus = dist; lens.aperture = aperture; applyLens(); return; }
      gsap.to(lens, { focus: dist, aperture, duration: dur, ease: 'power2.inOut', onUpdate: applyLens });
    },
    fitShadows(bounds) { setFits(bounds.max.y + 0.3); applied = -1; applyFit(zoom < 0 ? zoomFor(camera.position) : zoom); },
    dispose() { composer?.dispose(); env.dispose(); renderer.dispose(); },
  };
  grade?.apply();
  if (q.has('stagedebug')) (window as unknown as { __stage?: Stage }).__stage = stage; // dev: the stage on the console (timing passes, trying values)
  return stage;
}
