/**
 * The film grade: one full-screen pass after tone mapping (display-referred sRGB) that gives the render the finish of a
 * graded photograph instead of a raw render. Golden hour, not teal-and-orange: the tone curve is an S about a pivot below
 * mid-grey whose toe and shoulder roll off (deep shadows that stay open, highlights that hold: a linear contrast clipped
 * the sunlit limewash), the mids carry a little more density, the shadows take a breath of cool sky and the highlights a
 * breath of warmth (multiplied in, so black stays black: a lift is what made the old frame milky), a light radial
 * vignette, fine luminance-weighted grain live and, when asked, a hair of chromatic aberration at the frame edges. A
 * fixed one-step dither keeps the plain walls and the sky from banding in 8 bits (it does not move, so it cannot flicker).
 * All strengths are uniforms so the look can be cross-faded indoors/outdoors.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export interface GradeLook {
  vignette: number; grain: number; /** black floor (0 = true black) */ lift: number; gain: number; saturation: number;
  /** slope of the S-curve at its pivot (1 = none) */ contrast: number; /** gamma on the mids: above 1 the frame is denser (darker mids, same black and white) */ density: number;
  /** cool sky in the shadows, 0..1 */ cool: number; /** warmth in the highlights, 0..1 */ warm: number;
  /** near-neutral mids (ceilings, plaster) pulled toward a clean warm white, 0..1 */ neutral: number;
}
export const LOOKS: Record<'exterior' | 'interior', GradeLook> = {
  // outside: the low sun's warmth against cool, open shade; inside: calm and a little moody — denser mids, no colour in the
  // shadows (teal in a limewash room reads as a filter), a slightly closer vignette
  exterior: { vignette: 0.12, grain: 0.012, lift: 0, gain: 1, saturation: 1.06, contrast: 1.22, density: 1.06, cool: 0.65, warm: 0.5, neutral: 0 },
  // (dusk indoors: the mids a little denser and the curve steeper than outside, so the plain walls sit in half light and the
  // darks — smoked walnut, bronze, the firebox — go down to black; little warmth: the lamps are warm already)
  interior: { vignette: 0.15, grain: 0.014, lift: 0, gain: 1, saturation: 1.05, contrast: 1.24, density: 1.12, cool: 0.12, warm: 0.14, neutral: 0.55 },
};

export function createGradePass(opts: { aberration: number; grain?: number }) {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.15 }, uGrain: { value: 0.012 }, uLift: { value: 0 }, uGain: { value: 1 }, uSat: { value: 1.05 }, uContrast: { value: 1.15 }, uDensity: { value: 1.05 }, uCool: { value: 0 }, uWarm: { value: 0 }, uNeutral: { value: 0 }, uAberration: { value: opts.aberration }, uAspect: { value: 1.78 },
      // both tints weigh 1.0 in luminance: they turn the colour, not the exposure
      uCoolCol: { value: new THREE.Vector3(0.93, 1.0, 1.16) }, uWarmCol: { value: new THREE.Vector3(1.075, 0.99, 0.845) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uLift, uGain, uSat, uContrast, uDensity, uCool, uWarm, uNeutral, uAberration, uAspect; uniform vec3 uCoolCol, uWarmCol; varying vec2 vUv;
      const float PIVOT = 0.4; // the curve turns about a tone below mid-grey: the shade deepens more than the lights lift
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec3 curve(vec3 x, float a) { // slope a at the pivot, 0 and 1 stay put, toe and shoulder roll off
        vec3 lo = PIVOT * pow(clamp(x / PIVOT, 0.0, 1.0), vec3(a)), hi = 1.0 - (1.0 - PIVOT) * pow(clamp((1.0 - x) / (1.0 - PIVOT), 0.0, 1.0), vec3(a));
        return mix(lo, hi, step(PIVOT, x));
      }
      void main() {
        vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r2 = dot(q, q);
        vec3 c;
        if (uAberration > 0.0) { // lateral colour: the red and blue channels drift apart toward the corners (a real lens, not a clean render)
          vec2 d = (vUv - 0.5) * r2 * uAberration;
          c = vec3(texture2D(tDiffuse, vUv + d).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d).b);
        } else c = texture2D(tDiffuse, vUv).rgb;
        c = clamp(c * uGain, 0.0, 1.0);
        c = curve(pow(c, vec3(uDensity)), uContrast);
        // split tone, multiplied: cool in the shade, warm in the lights, nothing added to black. The ranges sit where a sunlit
        // frame keeps them (open shade reads 0.25-0.45 on screen, lit render 0.6-0.85): below 0.25 alone the tint missed the shade
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c *= mix(vec3(1.0), uCoolCol, uCool * (1.0 - smoothstep(0.12, 0.6, l))) * mix(vec3(1.0), uWarmCol, uWarm * smoothstep(0.42, 0.95, l));
        c = c * (1.0 - uLift) + uLift;
        // near-neutral mids: the warm bounce turns a white ceiling brown; bring it back toward a clean warm white (luminance kept)
        { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), chroma = (mx - mn) / max(mx, 1e-4), ln = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float k = uNeutral * (1.0 - smoothstep(0.16, 0.34, chroma)) * smoothstep(0.12, 0.35, ln) * (1.0 - smoothstep(0.8, 0.95, ln));
          c = mix(c, ln * vec3(1.035, 1.0, 0.93), k); } // the walls' own warm white
        l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        // soft radial vignette, wider than the frame so it never reads as a hard oval: nothing on the upper and lower middle,
        // ~9 % at the sides, ~12 % in the corners (the old ramp took 18 % off both sides of a plain wall: it read as a dark oval)
        c *= 1.0 - uVignette * smoothstep(0.3, 1.7, r2 * 1.6);
        // grain: finer and weaker in the highlights, a little stronger in the mids and shadows
        float g = (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 137.0) - 0.5) * uGrain * (1.0 - 0.65 * l);
        float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
        gl_FragColor = vec4(clamp(c + g + dither, 0.0, 1.0), 1.0);
      }`,
  });
  const u = pass.uniforms as Record<string, { value: number | THREE.Vector3 }>;
  return {
    pass,
    setAspect(a: number) { u.uAspect.value = a; },
    tick(dt: number) { (u.uTime.value as number) += dt; },
    /** Current look values (tweenable object): write to it, then `apply()`. */
    look: { ...LOOKS.exterior },
    apply() { const k = this.look; u.uVignette.value = k.vignette; u.uGrain.value = k.grain * (opts.grain ?? 1); u.uLift.value = k.lift; u.uGain.value = k.gain; u.uSat.value = k.saturation; u.uContrast.value = k.contrast; u.uDensity.value = k.density; u.uCool.value = k.cool; u.uWarm.value = k.warm; u.uNeutral.value = k.neutral; },
  };
}
export type Grade = ReturnType<typeof createGradePass>;
