import * as THREE from 'three';
import { gsap } from 'gsap';
import type { V3 } from './types';

const v = (a: V3) => new THREE.Vector3(...a);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const RAD = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
/** yaw / pitch (radians) of a direction: yaw 0 looks down −Z, a positive yaw turns left; pitch up is positive */
const anglesOf = (d: THREE.Vector3) => ({ yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) });

/**
 * What the body and the head may do, whatever the script asks: a move that would break one of these is simply given more
 * time (every rate scales with 1/T, every acceleration with 1/T²), so no pan can whip and no start can kick.
 * Angles in radians, lengths in metres. `lat` caps v²·κ in bends, `tan` how hard the cruise speed may change along the path.
 */
export const LIMITS = { yawRate: 70 * RAD, yawAcc: 140 * RAD, pitchRate: 45 * RAD, pitchAcc: 100 * RAD, acc: 8, lat: 4.2, tan: 4.5 };

/** An orientation key inside a move: where (`at` = share of the path length, or `via` = the n-th control point, 1 = the first
 *  via) and what the lens sees there (`look` = a point, or `yaw` / `pitch` in degrees; a missing angle is interpolated). */
export interface Aim { at?: number; via?: number; look?: V3; yaw?: number; pitch?: number }
export interface MoveSpec {
  via?: V3[]; pos: V3; look: V3;
  /** cruise speed along the path (m/s): one number, or a field of the position (fast over the lawn, slower through a door) */
  speed: number | ((p: THREE.Vector3) => number);
  /** seconds to reach the cruise speed and to come to rest; omitted = the whole move is one minimum-jerk bell */
  ramp?: [number, number];
  aims?: Aim[];
}
export interface Plan {
  /** duration (s) and path length (m) */ T: number; L: number;
  /** the pose at time t (written into `o`); returns the share of the path covered */
  at(t: number, o: { pos: THREE.Vector3; yaw: number; pitch: number }): number;
  /** the first time the lens is somewhere `test` accepts (T when it never is): how the choreography times doors and fades */
  timeWhen(test: (p: THREE.Vector3) => boolean): number;
  /** the share of the path length (0..1) at which control point n sits (0 = the start, 1 = the first via, …) */
  uOfControl(n: number): number;
}

// the ramp of a minimum-jerk move: R rises 0 → 1 with no slope at either end, IR is its integral (IR(1) = 8/15). Two of them
// back to back are exactly the classic quintic 10τ³ − 15τ⁴ + 6τ⁵; with a cruise between them the speed is a flat-topped bell
const IR = (x: number) => x * x * x * (4 / 3 - x + (x * x) / 5), IR1 = 8 / 15;

/** Box filter (half-width h samples, `passes` times). The ends are mirrored through the end value, so they stay where they are. */
function smooth(a: Float64Array, h: number, passes = 2): Float64Array {
  const n = a.length; if (h < 1 || n < 3) return a;
  let src = a;
  for (let k = 0; k < passes; k++) {
    const out = new Float64Array(n), a0 = src[0], a1 = src[n - 1];
    const get = (i: number) => (i < 0 ? 2 * a0 - src[Math.min(n - 1, -i)] : i >= n ? 2 * a1 - src[Math.max(0, 2 * (n - 1) - i)] : src[i]);
    let sum = 0; for (let j = -h; j <= h; j++) sum += get(j);
    for (let i = 0; i < n; i++) { out[i] = sum / (2 * h + 1); sum += get(i + h + 1) - get(i - h); }
    src = out;
  }
  return src;
}
/** Monotone cubic (Fritsch–Carlson) through the keys, sampled on a grid of m + 1 values over 0..1: it never overshoots a key,
 *  so a head that is asked to turn from A to B never swings past B and back. */
function pchip(xs: number[], ys: number[], m: number): Float64Array {
  const n = xs.length, out = new Float64Array(m + 1), d = new Array<number>(n).fill(0), del: number[] = [];
  for (let i = 0; i < n - 1; i++) del.push((ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]));
  d[0] = del[0]; d[n - 1] = del[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (del[i - 1] * del[i] <= 0) { d[i] = 0; continue; }
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    d[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]);
  }
  for (let j = 0, i = 0; j <= m; j++) {
    const x = j / m; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = Math.max(1e-9, xs[i + 1] - xs[i]), t = clamp((x - xs[i]) / h, 0, 1), t2 = t * t, t3 = t2 * t;
    out[j] = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * d[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * d[i + 1];
  }
  return out;
}
/** A table read with a cubic through its four neighbours (x in samples). */
function cubicAt(a: Float64Array, x: number) {
  const n = a.length - 1, i = clamp(Math.floor(x), 0, n - 1), t = clamp(x - i, 0, 1);
  const p1 = a[i], p2 = a[i + 1], p0 = i > 0 ? a[i - 1] : 2 * p1 - p2, p3 = i + 2 <= n ? a[i + 2] : 2 * p2 - p1;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
}

/**
 * Plan a whole move before the first frame of it is shown (pure: no clock, no renderer; the simulator runs the same code).
 *
 * Body: a centripetal Catmull-Rom through [start, …via, end], resampled by arc length and smoothed, so bends have a generous
 * radius and the curvature has no steps at the via points. The pace is a minimum-jerk progress over the path's *nominal
 * time* (length weighed by the cruise speed wanted at each place): speed and acceleration start and end at zero.
 * Head: yaw and pitch are a curve over the path length through the start pose, the scripted keys and the final aim. It is
 * monotone between keys and tied to the body's progress, so head and body start together, come to rest together, and the last
 * frame is exactly the authored pose. Nothing chases anything: there is no lag to catch up after the stop.
 */
export function planMove(p0: THREE.Vector3, yaw0: number, pitch0: number, spec: MoveSpec): Plan {
  const end = v(spec.pos), ctrl = [p0.clone()];
  for (const q of (spec.via ?? []).map(v)) if (q.distanceTo(ctrl[ctrl.length - 1]) > 0.03) ctrl.push(q);
  if (end.distanceTo(ctrl[ctrl.length - 1]) > 0.03) ctrl.push(end); else if (ctrl.length > 1) ctrl[ctrl.length - 1] = end;
  const still = ctrl.length < 2; // a turn on the spot
  const cruise = typeof spec.speed === 'number' ? () => spec.speed as number : spec.speed;

  // ---- the path, as a table of points evenly spaced along it ----
  let N = 1, L = 0; let px: Float64Array = new Float64Array([p0.x, end.x]), py: Float64Array = new Float64Array([p0.y, end.y]), pz: Float64Array = new Float64Array([p0.z, end.z]);
  const uCtrl = [0];
  if (!still) {
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal', 0.5); curve.arcLengthDivisions = 200 * (ctrl.length - 1);
    const len = curve.getLengths(); for (let i = 1; i < ctrl.length; i++) uCtrl.push(len[200 * i] / len[len.length - 1]);
    const L0 = curve.getLength(); N = clamp(Math.round(L0 / 0.02), 80, 1600);
    const pts = curve.getSpacedPoints(N); px = new Float64Array(N + 1); py = new Float64Array(N + 1); pz = new Float64Array(N + 1);
    pts.forEach((p, i) => { px[i] = p.x; py[i] = p.y; pz[i] = p.z; });
    const h = Math.min(Math.round(0.3 / (L0 / N)), Math.floor(N / 8)); // a 0.6 m window, twice: corners are cut by a few centimetres at most
    px = smooth(px, h); py = smooth(py, h); pz = smooth(pz, h);
  }
  const sT = new Float64Array(N + 1); for (let i = 1; i <= N; i++) sT[i] = sT[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1], pz[i] - pz[i - 1]);
  L = still ? 0 : sT[N];
  /** table index (fractional) of arc length s: the samples stay almost evenly spaced after smoothing, so the search starts at the guess */
  const idxOf = (s: number) => { let i = clamp(Math.floor((s / Math.max(1e-9, L)) * N), 0, N - 1); while (i > 0 && sT[i] > s) i--; while (i < N - 1 && sT[i + 1] < s) i++; return i + clamp((s - sT[i]) / Math.max(1e-9, sT[i + 1] - sT[i]), 0, 1); };
  const posAt = (s: number, o: THREE.Vector3) => { const x = idxOf(s); return o.set(cubicAt(px, x), cubicAt(py, x), cubicAt(pz, x)); };

  // ---- the head: yaw / pitch over the share of the path ----
  const fin = anglesOf(v(spec.look).sub(end)), tmp = new THREE.Vector3();
  const keys = [{ u: 0, yaw: yaw0, pitch: pitch0 as number | undefined }];
  for (const a of [...(spec.aims ?? [])].map((a) => ({ a, u: clamp(a.via !== undefined ? (uCtrl[a.via] ?? 1) : (a.at ?? 0.5), 0.02, 0.98) })).sort((p, q) => p.u - q.u)) {
    if (a.u - keys[keys.length - 1].u < 0.01) continue;
    const at = a.a.look ? anglesOf(v(a.a.look).sub(posAt(a.u * L, tmp))) : null;
    keys.push({ u: a.u, yaw: a.a.yaw !== undefined ? a.a.yaw * RAD : at ? at.yaw : NaN, pitch: a.a.pitch !== undefined ? a.a.pitch * RAD : at ? at.pitch : undefined });
  }
  keys.push({ u: 1, yaw: fin.yaw, pitch: fin.pitch });
  const yk = keys.filter((k) => !isNaN(k.yaw)), pk = keys.filter((k) => k.pitch !== undefined);
  for (let i = 1; i < yk.length; i++) yk[i].yaw = yk[i - 1].yaw + wrap(yk[i].yaw - yk[i - 1].yaw); // always the short way round from key to key
  const M = 512, hs = Math.round(M * 0.04);
  let Y = pchip(yk.map((k) => k.u), yk.map((k) => k.yaw), M), P = pchip(pk.map((k) => k.u), pk.map((k) => k.pitch as number), M);
  if (yk.length > 2) Y = smooth(Y, hs); if (pk.length > 2) P = smooth(P, hs); // round the keys: the turn rate has no corners

  // ---- the pace: nominal time along the path ----
  const sig = new Float64Array(N + 1), pace = new Float64Array(N + 1); let Sigma = 0.3; // a turn on the spot: the limits below set its real duration
  if (!still) {
    const ds = L / N, vd = new Float64Array(N + 1), q = new THREE.Vector3(), e = 2 / M;
    // where the head has a lot of turning to do per metre the body takes its time: a cap on the pace there, not a longer move everywhere
    const cap = (A: Float64Array, u: number, rate: number, acc: number) => {
      const c = clamp(u, e, 1 - e), a0 = cubicAt(A, (c - e) * M), a1 = cubicAt(A, c * M), a2 = cubicAt(A, (c + e) * M), d1 = Math.abs(a2 - a0) / (2 * e * L), d2 = Math.abs(a2 - 2 * a1 + a0) / (e * e * L * L);
      return Math.min(0.96 * rate / Math.max(d1, 1e-6), Math.sqrt(0.6 * acc / Math.max(d2, 1e-6)));
    };
    for (let i = 0; i <= N; i++) {
      const a = clamp(i, 1, N - 1), k = Math.hypot(px[a + 1] - 2 * px[a] + px[a - 1], py[a + 1] - 2 * py[a] + py[a - 1], pz[a + 1] - 2 * pz[a] + pz[a - 1]) / (ds * ds), u = sT[i] / L;
      vd[i] = Math.max(0.2, Math.min(cruise(q.set(px[i], py[i], pz[i])), Math.sqrt(LIMITS.lat / Math.max(k, 1e-4)), cap(Y, u, LIMITS.yawRate, LIMITS.yawAcc), cap(P, u, LIMITS.pitchRate, LIMITS.pitchAcc))); // ease off in bends too
    }
    for (let i = 1; i <= N; i++) vd[i] = Math.min(vd[i], Math.sqrt(vd[i - 1] ** 2 + 2 * LIMITS.tan * ds));
    for (let i = N - 1; i >= 0; i--) vd[i] = Math.min(vd[i], Math.sqrt(vd[i + 1] ** 2 + 2 * LIMITS.tan * ds));
    const sm = smooth(vd, Math.min(Math.round(0.25 / ds), Math.floor(N / 8))); // no corners in the pace either
    for (let i = 0; i <= N; i++) pace[i] = Math.max(0.2, sm[i]);
    for (let i = 1; i <= N; i++) sig[i] = sig[i - 1] + (sT[i] - sT[i - 1]) * 2 / (pace[i] + pace[i - 1]);
    Sigma = sig[N];
  }
  let [rin, rout] = spec.ramp ?? [Infinity, Infinity], c = 0;
  if (!isFinite(rin + rout) || IR1 * (rin + rout) >= Sigma) { const share = isFinite(rin + rout) ? rin / (rin + rout) : 0.5, tot = Sigma / IR1; rin = tot * share; rout = tot - rin; } else c = Sigma - IR1 * (rin + rout);
  const T0 = rin + c + rout;
  const sigmaAt = (t: number) => (t <= 0 ? 0 : t >= T0 ? Sigma : t < rin ? rin * IR(t / rin) : t <= rin + c ? IR1 * rin + (t - rin) : Sigma - rout * IR((T0 - t) / rout));
  const sAt = (t: number) => { // arc length at (unstretched) time t
    if (still) return 0; const g = sigmaAt(t); let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sig[m] <= g) lo = m; else hi = m; }
    const h = Math.max(1e-12, sig[hi] - sig[lo]), f = clamp((g - sig[lo]) / h, 0, 1), f2 = f * f, f3 = f2 * f; // a Hermite span between the two samples: the speed has no steps either
    return (2 * f3 - 3 * f2 + 1) * sT[lo] + (f3 - 2 * f2 + f) * h * pace[lo] + (3 * f2 - 2 * f3) * sT[hi] + (f3 - f2) * h * pace[hi];
  };
  const uAt = (t: number) => (still ? sigmaAt(t) / Sigma : sAt(t) / L);

  // ---- give the move the time it needs ----
  let k = 1;
  { const dt = 1 / 120, n = Math.max(4, Math.ceil(T0 / dt)), a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    let y0 = 0, y1 = 0, q0 = 0, q1 = 0, yr = 0, ya = 0, pr = 0, pa = 0, acc = 0;
    for (let i = 0; i <= n; i++) {
      const t = Math.min(T0, i * dt), u = uAt(t), y = cubicAt(Y, u * M), q = cubicAt(P, u * M); cc.copy(b); b.copy(a); posAt(u * L, a);
      if (i > 0) { yr = Math.max(yr, Math.abs(y - y1) / dt); pr = Math.max(pr, Math.abs(q - q1) / dt); }
      if (i > 1) { ya = Math.max(ya, Math.abs(y - 2 * y1 + y0) / (dt * dt)); pa = Math.max(pa, Math.abs(q - 2 * q1 + q0) / (dt * dt)); acc = Math.max(acc, cc.add(a).addScaledVector(b, -2).length() / (dt * dt)); }
      y0 = y1; y1 = y; q0 = q1; q1 = q;
    }
    k = Math.max(1, yr / LIMITS.yawRate, Math.sqrt(ya / LIMITS.yawAcc), pr / LIMITS.pitchRate, Math.sqrt(pa / LIMITS.pitchAcc), Math.sqrt(acc / LIMITS.acc));
  }
  const T = T0 * k;
  const plan: Plan = {
    T, L,
    at(t, o) {
      if (t >= T) { o.pos.copy(end); o.yaw = Y[M]; o.pitch = P[M]; return 1; }
      const u = uAt(Math.max(0, t) / k); posAt(u * L, o.pos); if (still) o.pos.copy(p0);
      o.yaw = cubicAt(Y, u * M); o.pitch = cubicAt(P, u * M); return u;
    },
    timeWhen(test) { const o = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 }; for (let t = 0; t < T; t += 1 / 120) { plan.at(t, o); if (test(o.pos)) return t; } return T; },
    uOfControl: (n) => uCtrl[clamp(n, 0, uCtrl.length - 1)] ?? 1,
  };
  return plan;
}

/**
 * Scripted camera. Every move is planned in full when it starts (`planMove`) and then simply played back against the clock:
 * the body follows the path, the head follows its own planned track, and both arrive on the same frame. At rest the head
 * carries two small offsets for the live page (a drag to look around, the hero's pointer parallax) that ease back to zero.
 */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  pos = new THREE.Vector3(); look = new THREE.Vector3();
  private yaw = 0; private pitch = 0;
  private dragYaw = 0; private dragPitch = 0; private dragYawT = 0; private dragPitchT = 0;
  /** pointer parallax (radians): a tiny look offset that follows the mouse in the hero, so the still frame is never dead */
  private parYaw = 0; private parPitch = 0; private parYawT = 0; private parPitchT = 0;
  parallaxLimit = { yaw: 0.012, pitch: 0.007 };
  private breathe = 0; private breatheAmp = 0; private t = 0;
  private tween: gsap.core.Tween | null = null;
  lookLimit = { yaw: 0.18, pitch: 0.1 };
  /** hero lens breathe: fov drifts by this many degrees over one loop (0 = off) */
  fovBreathe = 0; private fov0: number;
  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera; this.fov0 = camera.fov; }
  /** The lens the hero breathe returns to (call after changing camera.fov by hand). */
  setFov(fov: number) { this.fov0 = fov; if (Math.abs(this.camera.fov - fov) > 1e-3) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); } }

  /** Snap to a pose (no easing). */
  set(pos: V3, look: V3, breathe = 0) {
    this.tween?.kill(); this.tween = null;
    this.pos.copy(v(pos)); this.look.copy(v(look)); this.breatheAmp = breathe;
    const a = anglesOf(this.look.clone().sub(this.pos)); this.yaw = a.yaw; this.pitch = a.pitch;
    this.apply();
  }
  /**
   * Fly to `spec.pos` looking at `spec.look`, through `spec.via`. The move starts from what the lens shows right now (the hero's
   * breathe, a drag or the parallax included, so nothing jumps) and ends exactly on the authored pose. Returns the plan: its
   * duration `T`, and `timeWhen` to hang doors and fades on the places the lens passes.
   */
  move(spec: MoveSpec, onDone?: () => void, onStep?: (pos: THREE.Vector3, u: number) => void): Plan {
    this.tween?.kill();
    this.apply(); this.pos.copy(this.camera.position); this.yaw = wrap(this.yaw + this.dragYaw + this.parYaw); this.pitch += this.dragPitch + this.parPitch;
    this.breatheAmp = this.breathe = 0; this.dragYaw = this.dragPitch = this.dragYawT = this.dragPitchT = 0; this.parYaw = this.parPitch = this.parYawT = this.parPitchT = 0;
    const plan = planMove(this.pos, this.yaw, this.pitch, spec), state = { t: 0 }, o = { pos: this.pos, yaw: 0, pitch: 0 };
    this.look.copy(v(spec.look));
    const put = () => { const u = plan.at(state.t, o); this.yaw = o.yaw; this.pitch = o.pitch; onStep?.(this.pos, u); };
    this.tween = gsap.to(state, { t: plan.T, duration: plan.T, ease: 'none', onUpdate: put, onComplete: () => { state.t = plan.T; put(); this.yaw = wrap(this.yaw); this.tween = null; onDone?.(); } });
    return plan;
  }
  get travelling() { return !!this.tween; }
  /** degrees, for the debug read-out */
  get angles() { return { yaw: this.yaw / RAD, pitch: this.pitch / RAD }; }
  /** Drag-driven look offsets (radians), clamped; spring back when released. */
  nudge(dx: number, dy: number) { if (this.tween) return; this.dragYawT = clamp(this.dragYawT - dx, -this.lookLimit.yaw, this.lookLimit.yaw); this.dragPitchT = clamp(this.dragPitchT - dy, -this.lookLimit.pitch, this.lookLimit.pitch); }
  release() { this.dragYawT = 0; this.dragPitchT = 0; }
  /** Pointer parallax target from the pointer's position in the frame (−1..1 each axis); (0, 0) recentres. */
  parallax(nx: number, ny: number) { if (this.tween) return; this.parYawT = -clamp(nx, -1, 1) * this.parallaxLimit.yaw; this.parPitchT = -clamp(ny, -1, 1) * this.parallaxLimit.pitch; }
  /** Advance the rig's own clock by dt seconds (the look-around offsets, the hero breathe) and pose the camera. */
  update(dt: number) {
    this.t += dt;
    const kd = 1 - Math.exp(-dt * 6), kp = 1 - Math.exp(-dt * 4); // frame-rate independent: a recorded frame and a live one ease alike
    this.dragYaw += (this.dragYawT - this.dragYaw) * kd; this.dragPitch += (this.dragPitchT - this.dragPitch) * kd;
    this.parYaw += (this.parYawT - this.parYaw) * kp; this.parPitch += (this.parPitchT - this.parPitch) * kp;
    this.breathe = this.breatheAmp ? Math.sin(this.t * 0.5) * this.breatheAmp : 0;
    this.apply();
  }
  private apply() {
    const c = this.camera;
    c.position.copy(this.pos); c.position.y += this.breathe * 0.4; c.position.x += this.breathe;
    c.rotation.set(this.pitch + this.dragPitch + this.parPitch, this.yaw + this.dragYaw + this.parYaw, 0, 'YXZ'); // yaw, then pitch, never roll
    if (this.fovBreathe) { const f = this.fov0 - this.fovBreathe * (0.5 - 0.5 * Math.cos(this.t * 0.5)); if (Math.abs(f - c.fov) > 1e-3) { c.fov = f; c.updateProjectionMatrix(); } }
  }
  dispose() { this.tween?.kill(); }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The tour's moves, from house.json. Kept here, away from the DOM, so the offline simulator plans exactly what the page plays. */

type Pose = { pos: V3; look: V3 };
export interface TourConfig {
  exterior: Pose; approach: Pose & { via: V3[] }; hall: V3[];
  stops: { id: string; via: V3[]; camera: Pose & { aims?: Aim[] } }[];
  exitOut: Pose & { via: V3[]; aims?: Aim[] }; exit: Pose & { via?: V3[]; aims?: Aim[] };
}
/** cruise speeds (m/s): a brisk glide indoors, a drone over the lawn; doors are taken a little slower so the jambs glide by */
export const PACE = { indoor: 3.7, door: 2.9, lawn: 11, street: 11 };
/** seconds an indoor move takes to reach its pace and to come to rest (a short move shrinks them into one minimum-jerk bell) */
const RAMP: [number, number] = [0.75, 0.95];
const ss = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
/** the front door's clear passage (x 0.18, z −0.3…0.06) and the cased opening in the pier (x 1.6, z −0.95): metres around them where the pace eases */
const DOORS: [number, number, number][] = [[0.18, -0.1, 1.1], [1.6, -0.95, 0.9]];
const nearDoor = (p: THREE.Vector3) => DOORS.reduce((k, [x, z, r]) => Math.min(k, ss(Math.hypot(p.x - x, p.z - z), r * 0.3, r)), 1);
const indoor = (p: THREE.Vector3) => lerp(PACE.door, PACE.indoor, nearDoor(p));
const mirror = (aims: Aim[] | undefined, n: number): Aim[] => (aims ?? []).map((a) => ({ ...a, at: a.at !== undefined ? 1 - a.at : undefined, via: a.via !== undefined ? n + 1 - a.via : undefined }));

export function tourMoves(cfg: TourConfig) {
  const lock = cfg.stops.length - 1, S = (i: number) => cfg.stops[i];
  return {
    /** street → gate → up the steps → through the door → the first device: one unbroken push-in */
    enter(): MoveSpec {
      const via = [...cfg.approach.via, cfg.approach.pos, ...cfg.hall, ...S(0).via];
      return { via, pos: S(0).camera.pos, look: S(0).camera.look, ramp: [2.0, 1.3], aims: [{ via: cfg.approach.via.length + 1, look: cfg.approach.look }, ...(S(0).camera.aims ?? [])],
        speed: (p) => lerp(indoor(p), PACE.lawn, ss(p.z, 1.5, 9)) };
    },
    /** stop i−1 → stop i indoors; `back` walks the same path the other way (from stop i+1 to stop i) */
    goTo(i: number, back = false): MoveSpec {
      const s = S(i); if (!back) return { via: s.via, pos: s.camera.pos, look: s.camera.look, aims: s.camera.aims, ramp: RAMP, speed: indoor };
      const n = S(i + 1); return { via: [...n.via].reverse(), pos: s.camera.pos, look: s.camera.look, aims: mirror(n.camera.aims, n.via.length), ramp: RAMP, speed: indoor };
    },
    /** last indoor stop → backwards out through the front door, straight onto the lock's frame; the door then closes in front of the lens */
    leave(): MoveSpec {
      const via = [...cfg.exitOut.via, cfg.exitOut.pos];
      return { via, pos: S(lock).camera.pos, look: S(lock).camera.look, ramp: [0.85, 1.1], aims: [...(cfg.exitOut.aims ?? []), { via: via.length, look: cfg.exitOut.look }], speed: indoor };
    },
    /** the lock → back in to the last indoor stop (the way out, reversed) */
    reenter(): MoveSpec {
      const via = [cfg.exitOut.pos, ...[...cfg.exitOut.via].reverse()], s = S(lock - 1);
      return { via, pos: s.camera.pos, look: s.camera.look, aims: [{ via: 1, look: cfg.exitOut.look }, ...mirror(cfg.exitOut.aims, via.length)], ramp: RAMP, speed: indoor };
    },
    /** the lock → back down the path, through the gate and up to the opening frame, eyes on the villa the whole way */
    outro(): MoveSpec {
      return { via: cfg.exit.via ?? [], pos: cfg.exit.pos, look: cfg.exit.look, ramp: [1.5, 1.9], aims: cfg.exit.aims, speed: (p) => lerp(PACE.door, PACE.street, ss(p.z, 1, 7)) };
    },
  };
}
