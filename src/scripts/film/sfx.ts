/**
 * The film's sound: this is the switch; the instrument is film/sfx-engine.ts. Everything that plays is synthesised in Web
 * Audio at the moment it is needed (nothing is downloaded, so the page loads exactly as it did without sound), and the engine
 * itself is a separate chunk fetched only after the visitor's first tap: the gesture a browser needs before a page may make a
 * sound. Until it is in, or with the sound off, every call here is a no-op; the few cues that arrive while the chunk is still on
 * its way (the first tap's own) are kept for a moment and played the instant it lands.
 *
 * What the film asks for:
 *   play(cue)              one-shot sounds: taps, the HUD unfolding, the door, the switch, the beeps, the lock's ways in …
 *   move(seconds)          the glide of a camera move (a low breath of air, rising and settling with the move)
 *   ambience(where, fade)  the street (wind, birds) or the rooms (room tone), crossed at the threshold; `none` is silence
 *   music(on, level)       the lounge music from the ceiling speaker (and, quieter, from the control panel's player)
 *   pause() / resume()     the hero scrolled away or the tab hidden: everything continuous is held and taken up again
 *   mute(on)               the visitor's switch in the brand row; remembered for the next visit
 */
export type Cue =
  | 'tap' | 'holo' | 'ui' | 'confirm'
  | 'door-open' | 'door-close'
  | 'panel-wake' | 'switch-on' | 'switch-off'
  | 'sensor-chirp' | 'sensor-alarm'
  | 'lock-card' | 'lock-finger' | 'lock-face' | 'lock-key' | 'lock-granted'
  | 'phone-up' | 'phone-down' | 'lights-on' | 'lights-off' | 'end';
export type Where = 'outdoor' | 'indoor' | 'none';
export interface Engine {
  play(cue: Cue): void; move(seconds: number): void; ambience(where: Where, fade: number): void;
  music(on: boolean, level?: number): void;
  pause(): void; resume(): void; mute(on: boolean): void; dispose(): void;
}
const KEY = 'alrawi-sound';
const PENDING_FOR = 600; // ms a cue waits for the engine's chunk before it is dropped

let engine: Engine | null = null, loading: Promise<void> | null = null, ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } })();
let paused = false;
// what the film asked of the continuous sounds before the engine was in (and the engine's own memory while it is paused)
const want: { where: Where; fade: number; music: [boolean, number]; move: number } = { where: 'none', fade: 1, music: [false, 1], move: 0 };
const pending: { cue: Cue; at: number }[] = [];
const subs = new Set<(muted: boolean) => void>();

const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
const load = () => {
  if (engine || loading || !ctx) return;
  loading = import('./sfx-engine').then(({ createEngine }) => {
    if (!ctx) return;
    engine = createEngine(ctx);
    engine.ambience(want.where, Math.min(want.fade, 0.6)); engine.music(...want.music);
    const now = performance.now(); for (const p of pending.splice(0)) if (now - p.at < PENDING_FOR) engine.play(p.cue);
    if (want.move > 0) { engine.move(want.move); want.move = 0; }
    if (paused) engine.pause();
  }).catch(() => { loading = null; });
};

export const sfx = {
  /** call from a user gesture (a tap, a key): makes the audio context, and fetches the engine the first time */
  unlock() {
    if (muted || !AC) return;
    if (!ctx) { try { ctx = new AC(); } catch { return; } }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    load();
  },
  play(cue: Cue) { if (muted) return; if (engine) engine.play(cue); else if (loading) pending.push({ cue, at: performance.now() }); },
  move(seconds: number) { if (muted) return; if (engine) engine.move(seconds); else want.move = seconds; },
  ambience(where: Where, fade = 1) { want.where = where; want.fade = fade; if (!muted) engine?.ambience(where, fade); },
  music(on: boolean, level = 1) { want.music = [on, level]; if (!muted) engine?.music(on, level); },
  pause() { paused = true; engine?.pause(); },
  resume() { paused = false; if (!muted) engine?.resume(); },
  /** everything continuous off (the tour is over or was skipped) */
  silence(fade = 1) { this.ambience('none', fade); this.music(false); },
  get muted() { return muted; },
  /** the visitor's switch: off stops everything at once; on (a gesture) starts the engine if it never was */
  mute(on: boolean) {
    if (on === muted) return; muted = on;
    try { localStorage.setItem(KEY, on ? 'off' : 'on'); } catch { /* private mode */ }
    if (on) engine?.mute(true); else { this.unlock(); engine?.mute(false); engine?.ambience(want.where, 0.8); engine?.music(...want.music); }
    for (const f of subs) f(muted);
  },
  onMute(f: (muted: boolean) => void) { subs.add(f); },
};
