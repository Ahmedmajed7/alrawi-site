import * as THREE from 'three';
import { gsap } from 'gsap';
import type { V3 } from './types';

const v = (a: V3) => new THREE.Vector3(...a);

/** Scripted camera: travels along Catmull-Rom paths, holds still, allows a clamped look-around. */
export class CameraRig {
  pos = new THREE.Vector3(); look = new THREE.Vector3();
  private yaw = 0; private pitch = 0; private yawT = 0; private pitchT = 0;
  private breathe = 0; private breatheAmp = 0; private t = 0;
  private tween: gsap.core.Tween | null = null;
  lookLimit = { yaw: 0.18, pitch: 0.1 };
  constructor(public camera: THREE.PerspectiveCamera) {}

  set(pos: V3, look: V3, breathe = 0) { this.pos.copy(v(pos)); this.look.copy(v(look)); this.breatheAmp = breathe; this.apply(); }
  /** Fly along [current, ...via, target] while the look target eases to `look`. */
  travel(via: V3[], target: V3, look: V3, duration: number, onDone?: () => void, ease = 'power2.inOut') {
    this.tween?.kill();
    const pts = [this.pos.clone(), ...via.map(v), v(target)];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const look0 = this.look.clone(), look1 = v(look);
    this.breatheAmp = 0; this.yawT = 0; this.pitchT = 0;
    const state = { p: 0 };
    this.tween = gsap.to(state, { p: 1, duration, ease, onUpdate: () => {
      this.pos.copy(curve.getPointAt(state.p));
      this.look.lerpVectors(look0, look1, gsap.parseEase('power1.inOut')(state.p));
      this.apply();
    }, onComplete: () => { this.tween = null; onDone?.(); } });
  }
  get travelling() { return !!this.tween; }
  /** Drag-driven look offsets (radians), clamped; spring back when released. */
  nudge(dx: number, dy: number) { if (this.tween) return; this.yawT = THREE.MathUtils.clamp(this.yawT - dx, -this.lookLimit.yaw, this.lookLimit.yaw); this.pitchT = THREE.MathUtils.clamp(this.pitchT - dy, -this.lookLimit.pitch, this.lookLimit.pitch); }
  release() { this.yawT = 0; this.pitchT = 0; }
  update(dt: number) {
    this.t += dt;
    this.yaw += (this.yawT - this.yaw) * Math.min(1, dt * 6); this.pitch += (this.pitchT - this.pitch) * Math.min(1, dt * 6);
    this.breathe = this.breatheAmp ? Math.sin(this.t * 0.5) * this.breatheAmp : 0;
    this.apply();
  }
  private apply() {
    const c = this.camera;
    c.position.copy(this.pos); c.position.y += this.breathe * 0.4; c.position.x += this.breathe;
    c.lookAt(this.look);
    if (this.yaw || this.pitch) { c.rotateY(this.yaw); c.rotateX(this.pitch); }
  }
  dispose() { this.tween?.kill(); }
}
