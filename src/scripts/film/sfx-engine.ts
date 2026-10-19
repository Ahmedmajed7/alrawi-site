/**
 * The film's instrument (film/sfx.ts is the switch that loads it after the first tap). Nothing here is a recording: every
 * sound is built from oscillators, shaped noise and filters the moment it is asked for, so the site ships no audio files and
 * the page loads as it did without sound. The sounds are small and quiet on purpose: the film is the thing, the sound only
 * makes it feel inhabited. What there is:
 *   - the street (a low wind through the trees, a bird far off now and then) and the rooms (room tone, the faintest hum): the
 *     street is cut to nothing within a second of the lens crossing the threshold, and comes back the same way on the way out;
 *   - the camera's glide: a breath of air that rises and settles with each move;
 *   - the front door: the bolts drawing back and the heavy leaf swinging on the way in; on the way out the closer's sweep, the
 *     leaf landing on its seal, the bolts throwing, the lock's light;
 *   - the devices: the HUD arriving (one soft glass note, barely there), the panel waking, a real light switch's tock, the smoke
 *     detector's chirp and its test alarm, the lock reading each way in and granting it (at the minimum: a tick, a soft note, a
 *     quiet bolt; the curtain motor is silent: the client found its hum in the way, 19 Oct 2026);
 *   - the lounge: a quick, playful, clean little house tune (a plucked riff over a soft kick, a bouncing bass and chords, 118 to
 *     the minute) from the ceiling speaker, and quieter from the control panel's player;
 *   - the phone coming up and going down, its taps, the lights going on and off.
 * Everything goes through one gentle compressor so nothing can ever jump out of the mix.
 */
import type { Engine, Cue, Where } from './sfx';

type Opt = { to?: AudioNode; send?: number; pan?: number; a?: number; r?: number };
type ToneOpt = Opt & { f: number; f1?: number; type?: OscillatorType; dur: number; g: number };
type NoiseKind = 'white' | 'pink' | 'brown';
type NoiseOpt = Opt & { kind?: NoiseKind; dur: number; g: number; bp?: [number, number]; bp1?: number; lp?: number; lp1?: number; hp?: number };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function createEngine(ctx: AudioContext): Engine {
  const sr = ctx.sampleRate;
  const now = () => ctx.currentTime;
  const gain = (v: number, to?: AudioNode | AudioParam) => { const g = ctx.createGain(); g.gain.value = v; if (to instanceof AudioParam) g.connect(to); else if (to) g.connect(to); return g; };
  const filter = (type: BiquadFilterType, f: number, q = 1, to?: AudioNode) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b; };
  const osc = (type: OscillatorType, f: number, to?: AudioNode) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); return o; };

  /* ---------------- the desk: buses, a gentle compressor, a small room ---------------- */
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25; comp.connect(ctx.destination);
  const LEVEL = 0.85;
  const master = gain(LEVEL, comp);
  const bus = { sfx: gain(1, master), amb: gain(1, master), music: gain(0, master) };
  // a small, short reverb: a stereo impulse of decaying noise, used as a send so a chime or a thud sits in a room
  const impulse = (() => { const n = Math.floor(sr * 1.5), b = ctx.createBuffer(2, n, sr); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; const w = (Math.random() * 2 - 1) * Math.exp(-t * 4.2); lp += (w - lp) * 0.35; d[i] = (w - lp * 0.6) * (i < 200 ? i / 200 : 1); } } return b; })();
  const verb = ctx.createConvolver(); verb.buffer = impulse; verb.connect(gain(0.7, master));
  const route = (n: AudioNode, o: Opt) => { let m = n; if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); m.connect(p); m = p; } m.connect(o.to ?? bus.sfx); if (o.send) m.connect(gain(o.send, verb)); };

  /* ---------------- raw material ---------------- */
  const buffers: Partial<Record<NoiseKind, AudioBuffer>> = {};
  const noiseBuf = (kind: NoiseKind) => buffers[kind] ??= (() => {
    const n = Math.floor(sr * 3), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
      else { // Paul Kellet's pink filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
    return b;
  })();
  /** an envelope: up to `g` in `a`, held, then away over `r` (the tail is exponential: a sound ends the way a sound ends) */
  const env = (t: number, dur: number, g: number, a = 0.004, r = 0.05) => { const e = ctx.createGain(); const hold = Math.max(t + a, t + dur - r); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.setValueAtTime(g, hold); e.gain.setTargetAtTime(0, hold, r / 3); return e; };
  const tone = (t: number, o: ToneOpt) => {
    const s = osc(o.type ?? 'sine', o.f); s.frequency.setValueAtTime(o.f, t); if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const e = env(t, o.dur, o.g, o.a, o.r); s.connect(e); route(e, o); s.start(t); s.stop(t + o.dur + (o.r ?? 0.05) * 4 + 0.05); return e;
  };
  const noise = (t: number, o: NoiseOpt) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(o.kind ?? 'white'); s.loop = true; let n: AudioNode = s;
    const sweep = (p: AudioParam, f0: number, f1?: number) => { p.setValueAtTime(f0, t); if (f1) p.exponentialRampToValueAtTime(f1, t + o.dur); };
    if (o.hp) { const f = filter('highpass', o.hp, 0.7); n.connect(f); n = f; }
    if (o.bp) { const f = filter('bandpass', o.bp[0], o.bp[1]); sweep(f.frequency, o.bp[0], o.bp1); n.connect(f); n = f; }
    if (o.lp) { const f = filter('lowpass', o.lp, 0.7); sweep(f.frequency, o.lp, o.lp1); n.connect(f); n = f; }
    const e = env(t, o.dur, o.g, o.a ?? 0.002, o.r ?? 0.03); n.connect(e); route(e, o); s.start(t, rnd(0, 2)); s.stop(t + o.dur + (o.r ?? 0.03) * 4 + 0.05); return e;
  };
  /** a short mechanical click: a bright burst with a little body under it */
  const click = (t: number, bright: number, body: number, g: number, o: Opt = {}) => { noise(t, { bp: [bright, 2.5], dur: 0.01, g: g * 2.2, r: 0.012, ...o }); tone(t, { f: body, f1: body * 0.7, dur: 0.035, g: g * 0.8, r: 0.025, ...o }); };
  const beep = (t: number, f: number, dur: number, g: number, o: Opt = {}) => { tone(t, { f, dur, g, a: 0.004, r: 0.012, ...o }); tone(t, { f: f * 2, dur, g: g * 0.18, a: 0.004, r: 0.012, ...o }); };
  const chime = (t: number, notes: number[], gap: number, dur: number, g: number, send = 0.3) => notes.forEach((f, k) => { tone(t + k * gap, { f, dur, g, a: 0.006, r: dur * 0.6, send }); tone(t + k * gap, { f: f * 2, dur: dur * 0.7, g: g * 0.12, a: 0.006, r: dur * 0.4, send }); });
  /** a motorised bolt: a short buzz, then the clack as it seats */
  const bolt = (t: number, g: number, clacks = 1) => {
    const b = osc('sawtooth', 96); const f = filter('lowpass', 800, 1.5); b.connect(f); const e = env(t, 0.15, g * 0.5, 0.01, 0.04); f.connect(e); route(e, {}); b.start(t); b.stop(t + 0.35);
    for (let k = 0; k < clacks; k++) click(t + 0.15 + k * 0.11, 1900, 250, g * 1.6);
  };

  /* ---------------- the one-shots ---------------- */
  const CUES: Record<Cue, (t: number) => void> = {
    tap: (t) => { noise(t, { bp: [3200, 1.5], dur: 0.007, g: 0.1, r: 0.01 }); tone(t, { f: 1900, f1: 1500, dur: 0.03, g: 0.045, r: 0.02 }); },
    ui: (t) => { noise(t, { bp: [4200, 1.5], dur: 0.006, g: 0.1, r: 0.008 }); tone(t, { f: 2200, f1: 1800, dur: 0.018, g: 0.06, r: 0.015 }); },
    confirm: (t) => chime(t, [1046.5, 1568], 0.09, 0.2, 0.05, 0.25),
    // the HUD arriving: one soft glass note with a breath of air under it, felt more than heard
    holo: (t) => { tone(t, { f: 1046.5, dur: 0.3, g: 0.02, a: 0.02, r: 0.28, send: 0.4 }); tone(t, { f: 2093, dur: 0.2, g: 0.004, a: 0.02, r: 0.18, send: 0.4 }); noise(t, { bp: [3000, 0.8], dur: 0.16, g: 0.006, a: 0.04, r: 0.12 }); },
    // the front door on its way in (door.ts: 0.25 s of bolts drawing back, then a 1.9 s swing: a gentle push-off, a long settle)
    'door-open': (t) => {
      bolt(t, 0.06, 2); // the bolts draw back
      const s = t + 0.25;
      tone(s, { f: 130, f1: 95, dur: 0.09, g: 0.07, r: 0.05 }); noise(s, { lp: 900, dur: 0.03, g: 0.06 }); // the push-off
      noise(s, { kind: 'pink', lp: 380, lp1: 320, dur: 1.9, g: 0.09, a: 0.5, r: 0.8 }); // the leaf's air
      noise(s + 0.4, { kind: 'pink', bp: [700, 0.8], bp1: 500, dur: 1.2, g: 0.03, a: 0.3, r: 0.6 });
      noise(s + 1.9, { lp: 1500, dur: 0.02, g: 0.06 }); tone(s + 1.9, { f: 180, f1: 140, dur: 0.05, g: 0.045, r: 0.03 }); // onto the stay
    },
    // the front door closing in front of the lens (door.ts SWING.close over 2.2 s: off the stay, a steady sweep to the last
    // degrees, the landing on the seal at 88 %, then 0.2 s of bolts): the thud is the one weighty sound of the film
    'door-close': (t) => {
      noise(t, { lp: 1200, dur: 0.015, g: 0.03 }); // off the stay
      noise(t, { kind: 'pink', lp: 300, lp1: 600, dur: 1.0, g: 0.06, a: 0.5, r: 0.1 }); noise(t + 1.0, { kind: 'pink', lp: 600, lp1: 220, dur: 0.6, g: 0.06, a: 0.01, r: 0.5 }); // the closer's sweep
      const land = t + 1.936;
      tone(land, { f: 80, f1: 48, dur: 0.16, g: 0.3, a: 0.003, r: 0.09, send: 0.15 }); noise(land, { lp: 900, dur: 0.035, g: 0.12, r: 0.03, send: 0.2 }); tone(land, { f: 185, f1: 150, dur: 0.1, g: 0.1, r: 0.05 }); // lands on the seal
      bolt(t + 2.2, 0.08, 2); // the bolts throw
      beep(t + 2.45, 1760, 0.045, 0.03); beep(t + 2.54, 1760, 0.045, 0.03); // the lock's light
    },
    'panel-wake': (t) => chime(t, [1318.5, 1975.5], 0.11, 0.3, 0.045, 0.25),
    'switch-on': (t) => { click(t, 1500, 210, 0.12); tone(t, { f: 1100, f1: 700, dur: 0.025, g: 0.08, r: 0.02 }); },
    'switch-off': (t) => { click(t, 1200, 170, 0.12); tone(t, { f: 900, f1: 600, dur: 0.025, g: 0.07, r: 0.02 }); },
    'sensor-chirp': (t) => { for (let k = 0; k < 3; k++) beep(t + k * 0.14, 3150, 0.06, 0.08); },
    // the detector's test: the temporal-three pattern of a smoke alarm, twice (3.15 s, the LED's own 3.2 s)
    'sensor-alarm': (t) => { for (let c = 0; c < 2; c++) for (let k = 0; k < 3; k++) beep(t + c * 1.8 + k * 0.45, 3150, 0.28, 0.08, { send: 0.15 }); },
    // the smart lock's own sounds, at the minimum (the client, 19 Oct 2026): the faintest tick as each way in is read, a single
    // soft note and a quiet bolt when it is granted; the door's own closing and locking is the louder part, above
    'lock-card': (t) => beep(t, 2400, 0.05, 0.012),
    'lock-finger': (t) => tone(t + 0.5, { f: 2600, dur: 0.03, g: 0.01, r: 0.015 }),
    'lock-face': (t) => tone(t + 0.4, { f: 2200, dur: 0.03, g: 0.01, r: 0.015 }),
    'lock-key': (t) => beep(t, 1900, 0.04, 0.012),
    'lock-granted': (t) => { tone(t, { f: 1568, dur: 0.22, g: 0.016, a: 0.01, r: 0.18, send: 0.3 }); bolt(t + 0.2, 0.025); },
    'phone-up': (t) => { noise(t, { bp: [700, 1], bp1: 1600, dur: 0.32, g: 0.03, a: 0.08, r: 0.12 }); tone(t + 0.25, { f: 1300, f1: 900, dur: 0.05, g: 0.045, r: 0.03 }); },
    'phone-down': (t) => { noise(t, { bp: [1500, 1], bp1: 600, dur: 0.3, g: 0.025, a: 0.05, r: 0.12 }); tone(t, { f: 1000, f1: 700, dur: 0.05, g: 0.035, r: 0.03 }); },
    'lights-on': (t) => { click(t, 1500, 210, 0.12); tone(t, { f: 330, dur: 0.5, g: 0.028, a: 0.15, r: 0.25, send: 0.3 }); tone(t, { f: 660, dur: 0.4, g: 0.01, a: 0.15, r: 0.2, send: 0.3 }); },
    'lights-off': (t) => { click(t, 1200, 170, 0.12); tone(t, { f: 330, f1: 220, dur: 0.35, g: 0.022, a: 0.05, r: 0.2, send: 0.2 }); },
    end: (t) => { chime(t, [587.3, 880], 0.25, 0.6, 0.035, 0.5); tone(t, { f: 293.7, dur: 0.8, g: 0.015, a: 0.1, r: 0.5, send: 0.5 }); },
  };

  /* ---------------- the camera's glide ---------------- */
  const move = (T: number) => {
    if (T < 0.5) return; const t = now(), up = Math.min(0.75, T * 0.35), down = Math.min(0.95, T * 0.4);
    noise(t, { kind: 'pink', bp: [180, 0.6], bp1: 170, dur: T, g: 0.07, a: up, r: down });
    noise(t, { kind: 'brown', lp: 120, dur: T, g: 0.06, a: up, r: down });
    // the band of the air rises through the move and falls as it settles
    noise(t, { kind: 'pink', bp: [220, 0.7], bp1: 420, dur: T * 0.5, g: 0.03, a: up, r: T * 0.2 }); noise(t + T * 0.5, { kind: 'pink', bp: [420, 0.7], bp1: 200, dur: T * 0.5, g: 0.03, a: 0.01, r: down });
  };

  /* ---------------- the street and the rooms ---------------- */
  let amb: { out: GainNode; in: GainNode } | null = null, where: Where = 'none', birdsT = 0;
  const chirp = (t: number, pan: number, vol: number) => {
    const kind = Math.floor(rnd(0, 3)); const o = { to: amb!.out, pan, g: 0.03 * vol, a: 0.008, r: 0.02 };
    if (kind === 0) { const s = osc('sine', 3200); s.frequency.setValueAtTime(3200, t); s.frequency.exponentialRampToValueAtTime(4000, t + 0.05); s.frequency.exponentialRampToValueAtTime(3500, t + 0.1); const e = env(t, 0.1, o.g, o.a, o.r); s.connect(e); route(e, o); s.start(t); s.stop(t + 0.25); }
    else if (kind === 1) tone(t, { f: 4200, f1: 3300, dur: 0.06, ...o });
    else for (let k = 0; k < 3; k++) tone(t + k * 0.04, { f: k % 2 ? 4300 : 3600, dur: 0.03, ...o });
  };
  // one bird, far off, now and then: never a chorus (the client, 19 Oct 2026: too much random peeping)
  const birds = (first = false) => {
    clearTimeout(birdsT); if (where !== 'outdoor' || !amb) return;
    if (!first) { const t = now() + rnd(0.1, 0.4), pan = rnd(-0.7, 0.7), vol = rnd(0.25, 0.5), n = Math.floor(rnd(1, 3)); for (let k = 0; k < n; k++) chirp(t + k * rnd(0.12, 0.2), pan, vol); }
    birdsT = window.setTimeout(birds, rnd(9000, 16000));
  };
  const buildAmbience = () => {
    const out = gain(0, bus.amb), inn = gain(0, bus.amb);
    // outdoors: a low wind, breathing; a higher layer for the gusts in the trees
    const pink = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf('pink'); s.loop = true; s.start(now(), rnd(0, 2)); return s; };
    const lp = filter('lowpass', 380, 0.6); const wg = gain(0.06, out); pink().connect(lp); lp.connect(wg);
    const lfo1 = osc('sine', 0.07, gain(140, lp.frequency)); lfo1.start();
    const lfo2 = osc('sine', 0.11, gain(0.022, wg.gain)); lfo2.start();
    const hp = filter('bandpass', 900, 0.5); const hg = gain(0.008, out); pink().connect(hp); hp.connect(hg);
    const lfo3 = osc('sine', 0.05, gain(0.006, hg.gain)); lfo3.start();
    // indoors: room tone, the faintest mains hum, a thread of air
    const br = ctx.createBufferSource(); br.buffer = noiseBuf('brown'); br.loop = true; br.start(now(), rnd(0, 2)); br.connect(filter('lowpass', 220, 0.7, gain(0.05, inn)));
    osc('sine', 100, gain(0.004, inn)).start(); osc('sine', 200, gain(0.0012, inn)).start();
    pink().connect(filter('highpass', 4000, 0.7, gain(0.002, inn)));
    return { out, in: inn };
  };
  // a bed comes up gently and goes away completely: its gain is ramped to an exact 0 over `fade` (a target curve never arrives)
  const ambience = (w: Where, fade: number) => {
    where = w; if (w === 'none' && !amb) return; amb ??= buildAmbience();
    const t = now(), tau = Math.max(0.05, fade / 3);
    const set = (g: AudioParam, on: boolean) => { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); if (on) g.setTargetAtTime(1, t, tau); else g.linearRampToValueAtTime(0, t + Math.max(0.2, fade * 0.7)); };
    set(amb.out.gain, w === 'outdoor'); set(amb.in.gain, w === 'indoor');
    if (w === 'outdoor') birds(true); else clearTimeout(birdsT);
  };

  /* ---------------- the lounge: a quick, playful little tune ---------------- */
  // 118 to the minute, eight bars round (Dm · Bb · F · C, twice): a bright plucked riff with a dotted-eighth echo, a bouncing
  // bass, soft chords, a light kick, hats and a clap; nothing in it is a recording. Clean and elegant rather than loud: it is
  // heard from a ceiling speaker, and the panel's player has it quieter still
  const BPM = 118, STEP = 60 / BPM / 4, BARS = 8; // a step is a sixteenth
  const Hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note → Hz
  const CHORDS = [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67]]; // Dm, Bb, F, C (one bar each)
  const BASS = [38, 34, 41, 36]; // D2, Bb1, F2, C2
  const HOOK: [step: number, note: number, len: number][][] = [ // the riff, bar by bar (sixteenth, MIDI, sixteenths held)
    [[0, 69, 2], [3, 72, 2], [6, 74, 2], [8, 74, 1], [10, 72, 2], [12, 69, 2], [14, 67, 2]],
    [[0, 65, 2], [3, 69, 2], [6, 72, 2], [8, 74, 2], [11, 72, 2], [14, 69, 2]],
    [[0, 69, 2], [3, 72, 2], [6, 74, 2], [8, 77, 2], [10, 74, 2], [12, 72, 2], [14, 69, 2]],
    [[0, 67, 2], [2, 69, 2], [4, 72, 3], [8, 69, 2], [11, 67, 2], [14, 65, 2]],
  ];
  const RUN: [number, number, number][] = [[12, 72, 1], [13, 74, 1], [14, 77, 1], [15, 79, 1]]; // the last bar's little run up
  const musicIn = gain(1, bus.music); musicIn.connect(gain(0.18, verb));
  // the riff's echo: a dotted eighth behind, a little darker each time round
  const echo = ctx.createDelay(1); echo.delayTime.value = STEP * 3; const echoG = gain(0.3, echo); const echoLp = filter('lowpass', 2600, 0.7, echoG); echo.connect(echoLp); echo.connect(musicIn);
  const pluck = (t: number, f: number, len: number, vel: number) => { // two detuned saws through a closing filter: the house pluck
    const vcf = filter('lowpass', 4200, 2.2); vcf.frequency.setValueAtTime(4200, t); vcf.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const e = gain(0, vcf); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vel, t + 0.004); e.gain.setTargetAtTime(0, t + 0.004, Math.max(0.05, len * 0.35));
    for (const c of [-7, 7]) { const o = osc('sawtooth', f, e); o.detune.value = c; o.start(t); o.stop(t + len + 0.6); }
    vcf.connect(musicIn); vcf.connect(echoG);
  };
  const bass = (t: number, f: number, vel: number) => {
    const vcf = filter('lowpass', 900, 1.2, musicIn); vcf.frequency.setValueAtTime(900, t); vcf.frequency.exponentialRampToValueAtTime(220, t + 0.12);
    const e = gain(0, vcf); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vel, t + 0.005); e.gain.setTargetAtTime(0, t + 0.08, 0.05);
    for (const o of [osc('sawtooth', f, e), osc('sine', f, e)]) { o.start(t); o.stop(t + 0.5); }
  };
  const chord = (t: number, notes: number[], len: number) => { // soft, held under the bar
    const lp = filter('lowpass', 1400, 0.7, musicIn); const e = gain(0, lp); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.045, t + 0.08); e.gain.setValueAtTime(0.045, t + len - 0.15); e.gain.linearRampToValueAtTime(0, t + len);
    for (const n of notes) for (const c of [-5, 5]) { const o = osc('sawtooth', Hz(n), e); o.detune.value = c; o.start(t); o.stop(t + len + 0.1); }
  };
  const kick = (t: number) => { const o = osc('sine', 150, undefined); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.09); const e = env(t, 0.22, 0.4, 0.002, 0.12); o.connect(e); e.connect(musicIn); o.start(t); o.stop(t + 0.6); noise(t, { lp: 3000, dur: 0.008, g: 0.1, r: 0.006, to: musicIn }); };
  const hat = (t: number, open: boolean) => noise(t, { hp: 7500, dur: open ? 0.07 : 0.025, g: open ? 0.05 : 0.035, r: open ? 0.05 : 0.015, to: musicIn });
  const clap = (t: number) => { for (let k = 0; k < 3; k++) noise(t + k * 0.011, { bp: [1800, 1], dur: 0.012, g: 0.09, r: 0.01, to: musicIn, send: 0.25 }); noise(t + 0.03, { bp: [1800, 1], dur: 0.12, g: 0.06, a: 0.002, r: 0.08, to: musicIn, send: 0.25 }); };
  const bar = (t: number, b: number) => { // everything that happens in bar b (0 … 7) starting at t
    const k = b % 4, root = BASS[k]; chord(t, CHORDS[k], STEP * 16);
    for (const st of [0, 4, 8, 12]) kick(t + st * STEP);
    for (let st = 2; st < 16; st += 4) hat(t + st * STEP, st === 14); for (let st = 1; st < 16; st += 2) if (st % 4 !== 2) noise(t + st * STEP, { hp: 9000, dur: 0.015, g: 0.012, r: 0.01, to: musicIn });
    clap(t + 4 * STEP); clap(t + 12 * STEP);
    for (const st of [0, 3, 6, 8, 11, 14]) bass(t + st * STEP, Hz(root + (st === 3 || st === 11 ? 12 : 0)), 0.22);
    const riff = b === 7 ? [...HOOK[3].filter(([st]) => st < 12), ...RUN] : HOOK[k];
    for (const [st, n, len] of riff) pluck(t + st * STEP, Hz(n + (b >= 4 && b < 6 ? 12 : 0)), len * STEP, b >= 4 && b < 6 ? 0.1 : 0.14); // bars 5–6 take the riff up an octave
  };
  let music: { timer: number; next: number; bar: number } | null = null;
  const schedule = () => { if (!music) return; while (music.next < now() + 0.6) { bar(music.next, music.bar); music.bar = (music.bar + 1) % BARS; music.next += STEP * 16; } };
  const musicSet = (on: boolean, level = 1) => {
    const t = now();
    if (on) {
      if (!music) { music = { timer: window.setInterval(schedule, 150), next: t + 0.15, bar: 0 }; schedule(); }
      bus.music.gain.setTargetAtTime(0.24 * level, t, 0.25);
    } else if (music) { clearInterval(music.timer); music = null; bus.music.gain.setTargetAtTime(0, t, 0.2); }
  };

  /* ---------------- the desk's switches ---------------- */
  let held = false, muted = false;
  const settle = (to: number, tau: number) => master.gain.setTargetAtTime(to, now(), tau);
  return {
    play(cue) { if (muted) return; CUES[cue]?.(now() + 0.005); },
    move(T) { if (!muted) move(T); },
    ambience, music: musicSet,
    pause() { if (held) return; held = true; settle(0, 0.08); window.setTimeout(() => { if (held) void ctx.suspend().catch(() => {}); }, 400); },
    resume() { if (!held) return; held = false; void ctx.resume().catch(() => {}); if (!muted) settle(LEVEL, 0.15); },
    mute(on) { muted = on; if (on) { settle(0, 0.03); ambience('none', 0.1); musicSet(false); } else { void ctx.resume().catch(() => {}); settle(LEVEL, 0.1); } },
    dispose() { clearTimeout(birdsT); musicSet(false); void ctx.close().catch(() => {}); },
  };
}
