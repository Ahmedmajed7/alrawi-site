/**
 * The Hajar behind the villa, from real elevation data (scripts/build-terrain.mjs → public/models/terrain-<hash>.bin):
 * a polar grid of heights around the villa out to 32 km with the golden-hour sun's shadows and the sky occlusion baked
 * per vertex. The data holds the ridges but not the rock (20–70 m per sample: on its own it shades like clay), so the
 * rock comes from two photographed sets (Poly Haven CC0, scripts/build-env-textures.mjs): bedded, fractured cliff
 * projected from the side — its beds run level, so they outcrop along the contours as strata do — and broken scree
 * projected from above, each read at two scales, with erosion gullies running down the fall line. Lit by the real sun
 * (its baked shadows), the blue sky in the shade and a warm bounce off the sunlit slopes; then the air: distance takes
 * contrast and warmth (the far ranges pale and cool), dust lies in a band over the plain at the mountains' feet, and
 * toward the sun the haze glows. Rendered in the background pass with its own long-range camera (renderer.ts), so
 * kilometres of depth never fight the villa's near plane.
 */
import * as THREE from 'three';

export interface TerrainOpts {
  sunDir: THREE.Vector3; sunColor: THREE.Color; sunIntensity: number;
  /** linear horizon / haze colour (the fog colour) */ horizon: THREE.Color;
  /** warm in-scatter tint toward the sun */ warm: THREE.Color;
  /** the sky light in the shadows */ skyLight: THREE.Color;
  /** rock textures (strata, scree); off on the low tier */ detail?: boolean;
  shade?: Partial<TerrainShade>;
  /** the photographed sky (environment.ts): the haze takes the colour of the sky just over the horizon behind each point, so far ranges melt into the real sky */
  sky?: { map: THREE.Texture; yaw: number; intensity: number };
}
/** house.json `terrain.shade`: the look of the range, all optional */
export interface TerrainShade {
  /** e-folding distance of the haze (m): smaller = the ranges pale sooner */ reach: number;
  /** thickness of the dust band over the plain (m) and its strength (0..1) */ band: number; bandK: number;
  /** strength of the rock's relief (normal detail) and of the gullies */ relief: number; gullies: number;
  /** overall rock albedo gain and how much of the scans' own colour is kept (0 = grey, 1 = as scanned) */ albedo: number; chroma: number;
  /** cool tint of the far haze, as a CSS colour multiplied into the horizon colour */ cool: string;
  /** metres of crag the vertex shader raises along the ridges (the elevation data is 14–90 m per sample: its crests are rounded) */ crag: number;
}
const SHADE: TerrainShade = { reach: 8000, band: 170, bandK: 0.5, relief: 2.2, gullies: 1.1, albedo: 0.9, chroma: 0.3, cool: '#dfe8ff', crag: 34 };
const TEX = '/textures/env/';

export async function loadTerrain(url: string, o: TerrainOpts) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TRN1') throw new Error('terrain: bad file');
  const hl = dv.getUint32(4, true); const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))) as { na: number; nr: number };
  let p = 8 + hl; p += (4 - (p % 4)) % 4;
  const { na, nr } = hdr, N = na * nr;
  const az = new Float32Array(buf, p, na); p += na * 4;
  const rr = new Float32Array(buf, p, nr); p += nr * 4;
  const H = new Int16Array(buf, p, N); p += N * 2; p += (4 - (p % 4)) % 4;
  const SUN = new Uint8Array(buf, p, N); p += N;
  const AO = new Uint8Array(buf, p, N);

  const pos = new Float32Array(N * 3);
  for (let j = 0; j < nr; j++) for (let i = 0; i < na; i++) { const k = j * na + i; pos[k * 3] = Math.sin(az[i]) * rr[j]; pos[k * 3 + 1] = H[k] / 10; pos[k * 3 + 2] = -Math.cos(az[i]) * rr[j]; }
  const idx = new Uint32Array((nr - 1) * na * 6); let q = 0;
  for (let j = 0; j < nr - 1; j++) for (let i = 0; i < na; i++) {
    const a = j * na + i, b = j * na + ((i + 1) % na), c = (j + 1) * na + i, d = (j + 1) * na + ((i + 1) % na);
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; // counter-clockwise seen from above: faces (and normals) point up
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSun', new THREE.BufferAttribute(new Uint8Array(SUN), 1, true));
  geo.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(AO), 1, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const S = { ...SHADE, ...(o.shade ?? {}) }, detail = o.detail !== false;
  const tl = new THREE.TextureLoader();
  const ld = (name: string, srgb = false) => { const t = tl.load(`${TEX}${name}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const uHaze = { value: 0 };
  const defines: Record<string, number> = {}; if (detail) defines.ROCK = 1; if (o.sky) defines.SKYHAZE = 1;
  const mat = new THREE.ShaderMaterial({
    defines,
    uniforms: {
      uSun: { value: o.sunDir.clone().normalize() }, uSunCol: { value: o.sunColor.clone().multiplyScalar(o.sunIntensity) },
      uHorizon: { value: o.horizon.clone() }, uWarm: { value: o.warm.clone() }, uSky: { value: o.skyLight.clone() }, uCool: { value: new THREE.Color(S.cool) }, uHaze,
      uReach: { value: S.reach }, uBand: { value: new THREE.Vector2(S.band, S.bandK) }, uRelief: { value: new THREE.Vector2(S.relief, S.gullies) }, uAlb: { value: new THREE.Vector2(S.albedo, S.chroma) }, uCrag: { value: S.crag }, // (vertex work only: the low tier keeps it)
      uCliff: { value: detail ? ld('cliff_diff', true) : null }, uCliffN: { value: detail ? ld('cliff_nor') : null }, uScree: { value: detail ? ld('scree_diff', true) : null }, uScreeN: { value: detail ? ld('scree_nor') : null },
      uSkyMap: { value: o.sky?.map ?? null }, uSkyYaw: { value: o.sky?.yaw ?? 0 }, uSkyK: { value: o.sky?.intensity ?? 1 },
    },
    // crags: ridged noise raises the crests of the steep ground (never the plain), so the skylines break into teeth and
    // notches instead of the data's rounded humps; the normal is tilted by the same field (finite differences)
    vertexShader: `attribute float aSun, aAO; uniform float uCrag; varying vec3 vW, vN; varying float vSun, vAO;
      float vh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(vh(i), vh(i + vec2(1, 0)), f.x), mix(vh(i + vec2(0, 1)), vh(i + vec2(1, 1)), f.x), f.y); }
      float crag(vec2 xz){ vec2 q = xz / 150.0; float s = 0.0, a = 1.0; for (int i = 0; i < 3; i++) { float r = 1.0 - abs(2.0 * vn(q) - 1.0); s += r * r * a; q = q * 2.07 + 7.1; a *= 0.5; } return s - 0.62; }
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * normal);
        float k = uCrag * smoothstep(40.0, 260.0, w.y) * (0.35 + 0.65 * smoothstep(0.04, 0.35, 1.0 - n.y));
        if (k > 0.0) { float h0 = crag(w.xz), e = 12.0; w.y += k * h0; vec2 g = vec2(crag(w.xz + vec2(e, 0.0)) - h0, crag(w.xz + vec2(0.0, e)) - h0) * k / e; n = normalize(vec3(n.x - g.x * n.y, n.y, n.z - g.y * n.y)); }
        vW = w.xyz; vN = n; vSun = aSun; vAO = aAO; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun, uSunCol, uHorizon, uWarm, uSky, uCool; uniform float uHaze, uReach; uniform vec2 uBand, uRelief, uAlb; varying vec3 vW, vN; varying float vSun, vAO;
      #ifdef ROCK
      uniform sampler2D uCliff, uCliffN, uScree, uScreeN;
      #endif
      #ifdef SKYHAZE
      uniform sampler2D uSkyMap; uniform float uSkyYaw, uSkyK;
      #endif
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
        vec3 N0 = normalize(vN); float d0 = length(vW - cameraPosition);
        float fp = length(fwidth(vW.xz));
        float slope = 1.0 - N0.y;
        float n1 = noise(vW.xz / 420.0), n2 = mix(0.5, noise(vW.xz / 70.0 + 13.1), 1.0 - smoothstep(10.0, 30.0, fp)), geo = noise(vW.xz / 1600.0 + 3.1);
        // erosion gullies that run down the fall line (noise stretched along the downhill direction), strongest on steep
        // ground, fading out once a gully is smaller than a pixel; four fixed orientations blended by how well each runs
        // downhill: stable world coordinates (no swirl where the slope turns). Three scales: ravines, gullies, rills.
        vec2 dh = N0.xz; float dl = length(dh); dh = dl > 1e-3 ? dh / dl : vec2(1.0, 0.0);
        float steep = smoothstep(0.05, 0.35, slope) * (1.0 - smoothstep(14000.0, 28000.0, d0));
        float oR = 1.0 - smoothstep(30.0, 80.0, fp), oA = 1.0 - smoothstep(10.0, 26.0, fp), oB = 1.0 - smoothstep(5.0, 14.0, fp);
        vec2 tilt = vec2(0.0); float gR = 0.0, gA = 0.0, gB = 0.0, wsum = 0.0;
        for (int i = 0; i < 4; i++) {
          float an = float(i) * 0.7853982; vec2 dir = vec2(cos(an), sin(an)), ac = vec2(-dir.y, dir.x);
          float w = pow(abs(dot(dir, dh)), 6.0) + 1e-4;
          float gu = dot(vW.xz, ac) + float(i) * 37.0, gv = dot(vW.xz, dir);
          float r0 = noise(vec2(gu / 150.0, gv / 800.0) + 2.7), r1 = noise(vec2((gu + 15.0) / 150.0, gv / 800.0) + 2.7);
          float a0 = noise(vec2(gu / 46.0, gv / 300.0)), a1 = noise(vec2((gu + 5.0) / 46.0, gv / 300.0));
          float b0 = noise(vec2(gu / 14.0, gv / 110.0) + 5.3), b1 = noise(vec2((gu + 1.6) / 14.0, gv / 110.0) + 5.3);
          float across = (r1 - r0) / 15.0 * 150.0 * 0.8 * oR + (a1 - a0) / 5.0 * 46.0 * oA + (b1 - b0) / 1.6 * 14.0 * 0.45 * oB;
          tilt += ac * across * w; gR += r0 * w; gA += a0 * w; gB += b0 * w; wsum += w;
        }
        tilt /= wsum; gR /= wsum; gA /= wsum; gB /= wsum;
        // 0 = a gully's floor, 1 = the rib between two; the ribs are sharpened (bare rock stands in knife-edged spurs)
        float gully = mix(0.5, gR * 0.45 + gA * 0.4 + gB * 0.15, max(oR, oA)); gully = smoothstep(0.18, 0.78, gully);
        vec3 bump = vec3(tilt.x, 0.0, tilt.y) * 0.6 * uRelief.y;
        float rock = smoothstep(0.07, 0.3, slope + (n1 - 0.5) * 0.16); // bedrock on the faces, scree and fans where the ground lies back
        vec3 alb;
        #ifdef ROCK
        { // the rock itself. Side projections (beds level in the world, so they follow the contours), blended by which way the face looks
          vec3 aw = abs(N0); float wx = aw.x / (aw.x + aw.z + 1e-4);
          float bed = vW.y + 38.0 * (noise(vW.xz / 900.0) - 0.5) + 0.06 * vW.x; // the beds dip a few degrees and wander
          vec2 xa = vec2(vW.z, bed) / vec2(1100.0, 520.0), za = vec2(vW.x, bed) / vec2(1100.0, 520.0), xb = vec2(vW.z, bed) / vec2(230.0, 120.0) + 0.37, zb = vec2(vW.x, bed) / vec2(230.0, 120.0) + 0.37;
          vec3 ca = mix(texture2D(uCliff, za).rgb, texture2D(uCliff, xa).rgb, wx), cb = mix(texture2D(uCliff, zb).rgb, texture2D(uCliff, xb).rgb, wx);
          vec3 cliff = ca * pow(clamp(dot(cb, LUM) / 0.111, 0.0, 2.5), 1.5) * 0.9; // the fine scan with its contrast raised: open joints go dark, faces stay lit
          vec2 ya = vW.xz / 640.0, yb = vW.xz / 150.0 + 0.19;
          vec3 scree = texture2D(uScree, ya).rgb * (0.5 + 0.5 * dot(texture2D(uScree, yb).rgb, LUM) / 0.072) * 1.45;
          alb = mix(scree, cliff, rock);
          vec3 ta = mix(texture2D(uCliffN, za).xyz, texture2D(uCliffN, xa).xyz, wx) * 2.0 - 1.0, tb = mix(texture2D(uCliffN, zb).xyz, texture2D(uCliffN, xb).xyz, wx) * 2.0 - 1.0;
          vec2 tc = ta.xy + tb.xy * 0.7; // along the face, up the face
          vec3 side = vec3(tc.x * (1.0 - wx), tc.y, tc.x * wx);
          vec3 ty = (texture2D(uScreeN, ya).xyz * 2.0 - 1.0) + (texture2D(uScreeN, yb).xyz * 2.0 - 1.0) * 0.7;
          bump += mix(vec3(ty.x, 0.0, ty.y) * 0.5, side, rock) * uRelief.x * (1.0 - smoothstep(16000.0, 30000.0, d0));
        }
        #else
        { float strata = noise(vec2(vW.y / 18.0, vW.x / 900.0));
          alb = mix(vec3(0.15, 0.125, 0.095), vec3(0.085, 0.06, 0.044), rock); alb = mix(alb, vec3(0.036, 0.033, 0.028), smoothstep(0.5, 0.9, strata) * 0.3 * smoothstep(0.3, 0.6, slope)); }
        #endif
        // the Semail ophiolite behind Muscat: weathered peridotite, chocolate to slate where desert varnish has darkened it, olive-grey
        // where it is fresher; pale bands where a bed of limestone or gabbro outcrops along the contours; pale gravel in the gully
        // floors and on the fans; a pale gravel plain at the foot
        alb = mix(vec3(dot(alb, LUM)), alb, uAlb.y) * uAlb.x;
        alb *= mix(vec3(1.0, 0.93, 0.86), vec3(0.8, 0.83, 0.78), smoothstep(0.35, 0.75, geo + (n1 - 0.5) * 0.4));
        float band = noise(vec2((vW.y + 30.0 * (noise(vW.xz / 700.0) - 0.5)) / 26.0, vW.x / 3000.0 + vW.z / 5000.0));
        alb *= 1.0 + 0.4 * smoothstep(0.62, 0.8, band) * rock * (1.0 - smoothstep(25.0, 60.0, fp));
        alb *= (0.74 + 0.52 * n2) * mix(1.0, 0.5 + 0.62 * gully, steep);
        alb = mix(alb, vec3(0.2, 0.175, 0.14), (1.0 - gully) * steep * 0.35 * (1.0 - rock * 0.5)); // gravel washed into the floors
        alb = mix(vec3(0.27, 0.225, 0.17), alb, smoothstep(20.0, 150.0, vW.y + n1 * 60.0)); // the gravel plain at the foot of the range
        vec3 N = normalize(N0 + bump * steep);
        // light: the low sun (baked shadows from the real ridges), the sky in the shade, the sunlit slopes' warm bounce into it
        float ndl = max(dot(N, uSun), 0.0), lit = ndl * vSun;
        float ao = vAO * vAO * (0.4 + 0.6 * gully);
        vec3 V = vW - cameraPosition; float d = length(V); V /= d;
        float rim = pow(1.0 - max(dot(N, -V), 0.0), 3.0) * max(dot(N0, uSun), 0.0) * vSun; // low sun raking the ridges that turn away from the lens
        vec3 col = alb * (uSunCol * (lit * (0.8 + 0.2 * ao) + rim * 0.45) + uSky * (0.55 + 0.45 * N.y) * ao + uSunCol * vec3(1.0, 0.8, 0.62) * 0.04 * ao * (1.0 - vSun));
        // the air. Distance takes the contrast first, then the colour: the haze is the sky just over the horizon behind the point
        // (sampled from the photographed sky, blurred), so each range further back is paler, cooler and closer to the sky behind it;
        // dust hangs in a band over the plain, so every range stands in it up to its knees, warmer and denser
        float f = 1.0 - exp(-d / (uReach * (1.0 - uHaze * 2.0)));
        float dust = uBand.y * exp(-max(vW.y, 0.0) / uBand.x) * (1.0 - exp(-d / 2600.0));
        f = 1.0 - (1.0 - f) * (1.0 - dust);
        float toSun = pow(max(dot(V, uSun), 0.0), 3.0);
        #ifdef SKYHAZE
          float su = (atan(V.z, V.x) + uSkyYaw) / 6.2831853 + 0.5;
          vec3 haze = textureLod(uSkyMap, vec2(fract(su), 0.03), 6.0).rgb * uSkyK * mix(uCool, vec3(1.0), 0.5);
          haze = mix(haze, haze * uWarm * 1.05, clamp(toSun * 0.9 + dust * 0.6, 0.0, 1.0));
        #else
          vec3 haze = uHorizon * mix(uCool, uWarm * 1.08, clamp(toSun * 0.9 + dust * 0.5, 0.0, 1.0));
        #endif
        haze = mix(haze, haze * vec3(0.92, 0.97, 1.08), (1.0 - vSun) * 0.4);
        col = mix(col, haze, clamp(f, 0.0, 0.95));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'terrain'; mesh.frustumCulled = false; mesh.renderOrder = -8;
  const group = new THREE.Group(); group.name = 'mountains'; group.add(mesh);
  return { group, hazeUniforms: [uHaze], dispose() { geo.dispose(); mat.dispose(); for (const k of ['uCliff', 'uCliffN', 'uScree', 'uScreeN']) (mat.uniforms[k].value as THREE.Texture | null)?.dispose(); } };
}
