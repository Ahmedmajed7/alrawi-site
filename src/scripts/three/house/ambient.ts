/**
 * Ambient life in the sky, all of it periodic on the hero loop (4π s) so the loop seams:
 *  - a loose flock of feral pigeons wheeling over the rooftops behind the villa, the way they do over every Muscat
 *    neighbourhood at dusk: each bird follows the flock's path at its own lag, drifts inside the flock on its own slow
 *    rhythm (the flock's shape breathes, never a rigid V), banks into the turns by the physics of the turn (roll =
 *    atan(a_lateral / g)), and alternates bursts of wingbeats with glides on its own schedule; banking birds glide, and
 *    as they bank their wings catch the low sun and the flock flashes pale and dark as real pigeon flocks do;
 *  - collared doves crossing high over the street, a pair one way and a single bird the other, leaving the frame and
 *    re-entering (their paths wrap only while they are out of the picture).
 * One draw call: an instanced bird (body, tail fan, two-part wings hinged at the shoulder and the wrist; the vertex shader
 * folds each wing by two per-bird angles written every frame), lit like everything else (sun, sky), no shadows.
 * Hidden indoors. Rates: flock laps 1 rad/s, drifts 0.5–1.5 rad/s, wingbeats 24–28 rad/s: all multiples of 0.5 rad/s.
 */
import * as THREE from 'three';

const LOOP = 4 * Math.PI;

/** One bird, 0.68 m span (a rock dove): forward +Z, up +Y, the wings along ±X. `aSeg` 0 = body and tail (rigid), 1 = wing. */
function birdGeometry() {
  const pos: number[] = [], col: number[] = [], seg: number[] = [];
  const C = (h: string) => new THREE.Color(h);
  const body = C('#8a8a90'), inner = C('#a4a4aa'), bar = C('#4a4a50'), tip = C('#34343a'), tail = C('#77777d'), band = C('#303036');
  const tri = (a: number[], b: number[], c: number[], ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, sg: number) => { pos.push(...a, ...b, ...c); for (const k of [ca, cb, cc]) col.push(k.r, k.g, k.b); seg.push(sg, sg, sg); };
  // the body: a lathed spindle (6 sides), a touch flatter than round
  const lathe = new THREE.LatheGeometry([[0, -0.1], [0.026, -0.07], [0.044, 0], [0.04, 0.06], [0.026, 0.115], [0.019, 0.15], [0, 0.185]].map(([r, y]) => new THREE.Vector2(r, y)), 6).rotateX(Math.PI / 2).scale(1, 0.82, 1).toNonIndexed();
  const lp = lathe.attributes.position; for (let i = 0; i < lp.count; i++) { pos.push(lp.getX(i), lp.getY(i), lp.getZ(i)); col.push(body.r, body.g, body.b); seg.push(0); }
  lathe.dispose();
  // the tail: a fan, with the dark terminal band
  const t0 = [0.022, 0, -0.07], t1 = [0.056, 0, -0.17], t2 = [0.06, 0, -0.205], m = [0, 0, -0.215];
  for (const s of [1, -1]) { const X = (v: number[]) => [v[0] * s, v[1], v[2]]; tri(X(t0), X(t1), [0, 0, -0.07], tail, tail, tail, 0); tri([0, 0, -0.07], X(t1), m, tail, tail, tail, 0); tri(X(t1), X(t2), m, band, band, band, 0); }
  // each wing: the arm (shoulder → wrist, with the two dark wing bars) and the hand (wrist → a swept, pointed tip, primaries dark)
  const SL = [0.04, 0.004, 0.06], ST = [0.04, 0, -0.075], WL = [0.17, 0.008, 0.052], WT = [0.17, 0, -0.1], TIP = [0.34, -0.004, -0.07], PT = [0.27, 0, -0.125], PM = [0.3, 0, -0.11];
  for (const s of [1, -1]) {
    const X = (v: number[]) => [v[0] * s, v[1], v[2]];
    tri(X(SL), X(WL), X(WT), inner, inner, bar, 1); tri(X(SL), X(WT), X(ST), inner, bar, bar, 1);
    tri(X(WL), X(TIP), X(PM), inner, tip, tip, 1); tri(X(WL), X(PM), X(PT), inner, tip, tip, 1); tri(X(WL), X(PT), X(WT), inner, tip, bar, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  g.computeVertexNormals();
  return g;
}

interface Bird { pos: (t: number, out: THREE.Vector3) => void; scale: number; tint: THREE.Color; /** wingbeat, rad/s */ flap: number; phase: number; /** flap/glide alternation, rad/s, and its phase */ rhythm: number; rphase: number; /** −1 … 1: higher glides more */ duty: number; /** wingbeat amplitude */ amp: number }

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The birds. `centre` is where the pigeons wheel (radii rx, rz, `laps` laps per loop), `n` how many; `doves` a crossing line
 * (a point on it and its direction, the camera's right in the hero) along which the doves pass.
 */
export function makeBirds(uTime: { value: number }, centre = new THREE.Vector3(18, 20, -17), rx = 8, rz = 6, n = 16, laps = 2, doves: { at: THREE.Vector3; dir: THREE.Vector3 } | null = { at: new THREE.Vector3(4, 20, -10), dir: new THREE.Vector3(0.94, 0, 0.342) }) {
  const g = birdGeometry();
  const birds: Bird[] = [];
  const rnd = (() => { let a = 20260929; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const R = (a: number, b: number) => a + rnd() * (b - a), pick = <T,>(v: T[]) => v[Math.floor(rnd() * v.length)];
  const w = laps * (2 * Math.PI / LOOP); // the flock's angular speed round its path (laps × 0.5 rad/s)
  const up = new THREE.Vector3(0, 1, 0);
  // the flock's path: an ellipse that bulges and dips, its centre wandering on the loop
  const path = (a: number, t: number, out: THREE.Vector3) => {
    const rr = 1 + 0.18 * Math.sin(2 * a + 0.5);
    return out.set(centre.x + 2.5 * Math.sin(0.5 * t) + rx * rr * Math.cos(a), centre.y + 1.2 * Math.sin(t + 0.7) + 1.6 * Math.sin(a + 1.3) + 0.7 * Math.sin(2 * a), centre.z + 1.8 * Math.cos(0.5 * t) + rz * rr * Math.sin(a));
  };
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), side = new THREE.Vector3();
  const pigeonTints = ['#ffffff', '#f2f0ee', '#d8d6d4', '#b8b4b0', '#8e8a88', '#c9b9a8'].map((h) => new THREE.Color(h));
  for (let i = 0; i < n; i++) {
    const lag = R(0, 0.95), L = R(-3.6, 3.6), V = R(-1.6, 1.6), k1 = pick([1, 2, 3]), k2 = pick([1, 2]), f1 = R(0, 6.28), f2 = R(0, 6.28), a0 = -lag;
    birds.push({
      pos: (t, out) => {
        const a = w * t + a0; path(a, t, out); path(a + 0.01, t, pA); pA.sub(out);
        side.crossVectors(up, pA).setY(0).normalize(); // horizontal, across the path
        return void out.addScaledVector(side, L + 1.1 * Math.sin(0.5 * k1 * t + f1)).addScaledVector(up, V + 0.55 * Math.sin(0.5 * k2 * t + f2));
      },
      scale: R(0.92, 1.08), tint: pick(pigeonTints), flap: pick([24, 25, 26]), phase: R(0, 6.28), rhythm: pick([1, 1.5, 2]), rphase: R(0, 6.28), duty: R(-0.2, 0.35), amp: R(0.9, 1.05),
    });
  }
  if (doves) {
    // a pair right to left, a single bird left to right half a loop later; 11 m/s, a gentle undulation
    const dv = (off: number, dirSign: number, lateral: number, dy: number, lead: number) => (t: number, out: THREE.Vector3) => {
      const u = (((t + off) % LOOP) + LOOP) % LOOP, s = dirSign * (58 - 11 * u) + lead;
      out.copy(doves.at).addScaledVector(doves.dir, s); out.y += dy + 0.5 * Math.sin(1.5 * t + off);
      out.x += -doves.dir.z * lateral; out.z += doves.dir.x * lateral;
    };
    const doveTint = new THREE.Color('#e9d8c4');
    birds.push({ pos: dv(0, 1, 0, 0, 0), scale: 0.78, tint: doveTint, flap: 28, phase: 0, rhythm: 1.5, rphase: 0.3, duty: 0.15, amp: 1 });
    birds.push({ pos: dv(0, 1, -1.4, 0.45, 2.1), scale: 0.76, tint: doveTint, flap: 28, phase: 2.2, rhythm: 1.5, rphase: 1.1, duty: 0.1, amp: 1 });
    birds.push({ pos: dv(6.3, -1, 3, -1.2, 0), scale: 0.8, tint: doveTint, flap: 27, phase: 1.0, rhythm: 1, rphase: 2.0, duty: 0.2, amp: 1 });
  }
  const N = birds.length;
  const wing = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2); wing.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aWing', wing);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.9 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = `attribute vec2 aWing; attribute float aSeg;
      // fold a wing point about the shoulder (x 0.04) by a1 and, past the wrist (x 0.17), about the wrist by a2 first
      void birdFold(inout vec3 p, inout vec3 nrm) {
        if (aSeg < 0.5) return;
        float s = p.x < 0.0 ? -1.0 : 1.0; vec2 q = vec2(abs(p.x), p.y), nq = vec2(nrm.x * s, nrm.y);
        if (q.x > 0.1705) { float c = cos(aWing.y), n = sin(aWing.y); q -= vec2(0.17, 0.0); q = vec2(q.x * c - q.y * n, q.x * n + q.y * c) + vec2(0.17, 0.0); nq = vec2(nq.x * c - nq.y * n, nq.x * n + nq.y * c); }
        { float c = cos(aWing.x), n = sin(aWing.x); q -= vec2(0.04, 0.0); q = vec2(q.x * c - q.y * n, q.x * n + q.y * c) + vec2(0.04, 0.0); nq = vec2(nq.x * c - nq.y * n, nq.x * n + nq.y * c); }
        p.xy = vec2(q.x * s, q.y); nrm.xy = vec2(nq.x * s, nq.y);
      }
      ` + sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 birdP = position; birdFold(birdP, objectNormal);`).replace('#include <begin_vertex>', 'vec3 transformed = birdP;');
  };
  mat.customProgramCacheKey = () => 'birds-v2';
  const mesh = new THREE.InstancedMesh(g, mat, N); mesh.frustumCulled = false; mesh.name = 'birds'; mesh.castShadow = false; mesh.receiveShadow = false;
  for (let i = 0; i < N; i++) mesh.setColorAt(i, birds[i].tint);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  const vel = new THREE.Vector3(), acc = new THREE.Vector3(), fwd = new THREE.Vector3(), left = new THREE.Vector3(), upB = new THREE.Vector3(), rightB = new THREE.Vector3(), basis = new THREE.Matrix4();
  const E = 0.05;
  const update = () => {
    const t = uTime.value;
    for (let i = 0; i < N; i++) {
      const b = birds[i];
      b.pos(t, p); b.pos(t - E, p0); b.pos(t + E, p1);
      vel.subVectors(p1, p0).divideScalar(2 * E);
      if (vel.lengthSq() > 3600 || vel.lengthSq() < 1e-6) { mesh.getMatrixAt(i, M); M.setPosition(p); mesh.setMatrixAt(i, M); continue; } // a crossing bird wrapping round, off screen
      acc.copy(p1).add(p0).addScaledVector(p, -2).divideScalar(E * E);
      fwd.copy(vel).normalize();
      left.crossVectors(up, fwd).normalize(); upB.crossVectors(fwd, left);
      rightB.copy(left).negate();
      const roll = Math.max(-0.95, Math.min(0.95, Math.atan2(acc.dot(rightB), 9.81)));
      // bank into the turn: the bird's up tips toward the turn's centre
      upB.multiplyScalar(Math.cos(roll)).addScaledVector(rightB, Math.sin(roll)).normalize(); left.crossVectors(upB, fwd).normalize();
      basis.makeBasis(left, upB, fwd); q.setFromRotationMatrix(basis);
      s.setScalar(b.scale); M.compose(p, q, s); mesh.setMatrixAt(i, M);
      // flap or glide: its own rhythm, gliding through steep banks, beating harder when climbing
      let env = smooth(b.duty - 0.35, b.duty + 0.35, Math.sin(b.rhythm * t + b.rphase));
      env *= 1 - smooth(0.35, 0.7, Math.abs(roll)); env = Math.max(env, smooth(0.6, 1.8, vel.y));
      const ph = b.flap * t + b.phase;
      const a1 = 0.2 + env * (b.amp * (-0.02 + 0.72 * Math.sin(ph)) - 0.2), a2 = -0.12 + env * (b.amp * (-0.02 + 0.5 * Math.sin(ph - 1.2)) + 0.12);
      wing.setXY(i, a1, a2);
    }
    mesh.instanceMatrix.needsUpdate = true; wing.needsUpdate = true;
  };
  update();
  return { mesh, update };
}

/** Tileable high cloud: value-noise wisps with soft edges, alpha only. */
function cloudTexture(size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!;
  const img = g.createImageData(size, size); const d = img.data;
  let seed = 977; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const oct = 5, grids: Float32Array[] = []; const P = 4;
  for (let o = 0; o < oct; o++) { const w = P << o, gr = new Float32Array(w * w); for (let i = 0; i < gr.length; i++) gr[i] = rnd(); grids.push(gr); }
  const noise = (u: number, v: number) => { let sum = 0, amp = 0.5, norm = 0; for (let o = 0; o < oct; o++) { const w = P << o, gr = grids[o]; const x = u * w, y = v * w; const xi = Math.floor(x), yi = Math.floor(y); const tx = x - xi, ty = y - yi; const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const x0 = ((xi % w) + w) % w, x1 = (x0 + 1) % w, y0 = ((yi % w) + w) % w, y1 = (y0 + 1) % w; const a = gr[y0 * w + x0] + (gr[y0 * w + x1] - gr[y0 * w + x0]) * sx, b = gr[y1 * w + x0] + (gr[y1 * w + x1] - gr[y1 * w + x0]) * sx; sum += (a + (b - a) * sy) * amp; norm += amp; amp *= 0.55; } return sum / norm; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = noise(x / size, y / size); const a = Math.max(0, (n - 0.5) / 0.34); const i = (y * size + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, a * a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

export function makeClouds(tint: THREE.Color, altitude = 120, opacity = 0.6, tilesPerLoop = 1, repeat = 5, seedShift = 0) {
  const tex = cloudTexture(); tex.repeat.set(repeat, repeat); tex.offset.set(seedShift, seedShift * 0.7);
  const mat = new THREE.MeshBasicMaterial({ color: tint, alphaMap: tex, transparent: true, depthWrite: false, fog: false, opacity });
  // fade the layer out toward the horizon so it never conflicts with the photographed clouds low in the sky
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vCloudW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCloudW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vCloudW;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n { float r = length(vCloudW.xz - cameraPosition.xz); diffuseColor.a *= 1.0 - smoothstep(180.0, 520.0, r); }');
  };
  mat.customProgramCacheKey = () => 'high-cloud';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mat); mesh.rotation.x = Math.PI / 2; mesh.position.y = altitude; mesh.renderOrder = -9.5; mesh.frustumCulled = false; mesh.name = 'clouds';
  // a texture offset only wraps at whole units (uv' = uv·repeat + offset), so exactly `tilesPerLoop` whole textures per hero loop is what seams
  return { mesh, altitude, update(dt: number) { tex.offset.x = (tex.offset.x + (dt / LOOP) * tilesPerLoop) % 1; } };
}
