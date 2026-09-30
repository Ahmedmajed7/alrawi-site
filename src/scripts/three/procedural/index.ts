/**
 * Procedural product models. Each recipe returns a THREE.Group centred on the origin,
 * roughly 1–2.5 units across, built from physically based materials so the viewer's
 * environment lighting does the work. Used when no GLB exists for a product.
 * Convention: -Z is the mounting face (wall / ceiling / door), +Z faces the room.
 */
import * as THREE from 'three';

import { num, str, bool, off, microNormal, roughVar, plastic, piano, glass, metal, brushed, emissive, screenMat, canvasTex, screenTexture, lcdTexture, keypadTexture, grilleTexture, detectorTop, slotsAlpha, rbox, roundedCylinder, domedPuck, mesh, led, type Params, type Ctx } from './kit';
export type { Params } from './kit';
import { wallPanel } from './devices/panel';
import { keySwitch } from './devices/switch';
import { doorLock } from './devices/lock';
import { ceilingSpeaker } from './devices/speaker';
import { smokeDetector } from './devices/detector';
import { curtainTrack } from './devices/curtain';

/* ---------- recipes ---------- */
/**
 * Wall control panel after the catalogue unit: a landscape black-glass slab, edge to edge, with a brushed-aluminium
 * strip down its right edge carrying three shallow buttons. No frame, no back box on the wall.
 */
function panel({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const w = num(p, 'w', 1.7), h = num(p, 'h', 1.05), d = num(p, 'd', 0.07), bezel = num(p, 'bezel', 0.05), dark = bool(p, 'dark');
  const hex = '#' + accent.getHexString();
  const sw = w * 0.085; // the button strip
  g.add(mesh(rbox(w, h, d, 0.015), plastic(dark ? '#111215' : '#15171b', 0.5)));                                    // body
  g.add(mesh(rbox(w - sw - 0.004, h - 0.004, 0.006, 0.006), glass('#05060a'), -sw / 2, 0, d / 2 + 0.002));            // edge-to-edge glass
  // brushed strip: cool anodised aluminium, a touch rougher and darker than raw metal so the warm room does not turn it cream;
  // each button sits in a dark shadow gap (the seam is what makes a machined key read as a key)
  // (a low environment weight: the walkthrough gives indoor devices the bright, even room environment, and a metal at full
  // weight mirrors it back as one flat cream bar instead of silver)
  const alu = brushed('#8d9196'); alu.roughness = 0.46; alu.envMapIntensity = 0.32; const key = brushed('#7b7f84'); key.roughness = 0.4; key.envMapIntensity = 0.36;
  g.add(mesh(rbox(sw, h, d + 0.006, 0.006), alu, w / 2 - sw / 2, 0, 0));
  g.add(mesh(rbox(0.006, h - 0.004, d + 0.004, 0.002), plastic('#050506', 0.6), w / 2 - sw, 0, 0.001));             // seam between glass and strip
  for (let i = -1; i <= 1; i++) {
    g.add(mesh(rbox(sw * 0.68, h * 0.215, 0.004, 0.005), plastic('#0b0c0e', 0.7), w / 2 - sw / 2, i * h * 0.26, d / 2 + 0.004)); // shadow gap
    g.add(mesh(rbox(sw * 0.6, h * 0.2, 0.006, 0.004), key, w / 2 - sw / 2, i * h * 0.26, d / 2 + 0.006));                     // the key
  }
  if (p.screen !== false) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - sw - bezel * 2, h - bezel * 2), screenMat(screenTexture(), 1.15)); // always on, bright like the real unit
    screen.name = 'screen'; screen.position.set(-sw / 2, 0, d / 2 + 0.0055); g.add(screen); // `screen`: the landing pins its live HTML UI onto these corners
    // cover glass: a whisper of clearcoat reflection over the pixels, so the display reads as glass, not a sticker
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(w - sw - 0.01, h - 0.01), new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2.2 }));
    cover.position.set(-sw / 2, 0, d / 2 + 0.0068); cover.renderOrder = 2; g.add(cover);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.003, 16).rotateX(Math.PI / 2), plastic('#0a0b0e', 0.3), -sw / 2, h / 2 - bezel * 0.45, d / 2 + 0.0055)); // light sensor
  const l = led(accent, 0.006); l.position.set(-w / 2 + bezel * 0.5, -h / 2 + bezel * 0.5, d / 2 + 0.007); g.add(l);
  // the leader lands on the button strip, not on the screen (the landing makes the screen itself live and tappable)
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(w / 2 - sw / 2, h * 0.26, d / 2 + 0.006); g.add(hs);
  return g;
}
function puck({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const r = num(p, 'r', 0.5), h = num(p, 'h', 0.22), color = str(p, 'color', '#f6f6f4');
  const glossy = bool(p, 'glossy'), vents = bool(p, 'vents');
  g.add(mesh(glossy ? roundedCylinder(r, h, Math.min(0.08, h * 0.45)) : domedPuck(r, h, 72, vents ? 0.36 : 0.28), glossy ? glass() : plastic(color, 0.5)));
  if (vents) {
    const topY = h / 2 - h * 0.36 * 0.28 + 0.0015;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.84, 96), new THREE.MeshStandardMaterial({ map: detectorTop(), roughness: 0.5, color: '#ffffff', envMapIntensity: 1.1 }));
    top.rotation.x = -Math.PI / 2; top.position.y = topY; g.add(top);
    const slots = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.001, r * 1.001, h * 0.3, 72, 1, true), new THREE.MeshStandardMaterial({ color: '#6b6d70', roughness: 0.85, alphaMap: slotsAlpha(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    slots.position.y = -h * 0.08; slots.scale.y = 0.6; g.add(slots);
    const btn = mesh(rbox(r * 0.06, h * 0.06, r * 0.17, r * 0.03), plastic('#d5d5d1', 0.5), 0, topY + 0.004, -r * 0.62); btn.name = 'btn_test'; g.add(btn); // the pill mute / test button on the face
    g.add(mesh(new THREE.TorusGeometry(r * 0.842, 0.0035, 8, 120).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9d9e9c', roughness: 0.8 }), 0, topY - 0.001, 0)); // the seam where the cap meets the body
    const st = led('#46d17a', 0.012); (st.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4; st.name = 'led_0'; st.position.set(r * 0.2, topY + 0.004, -r * 0.62); g.add(st); // green status LED beside it
  }
  if (bool(p, 'ring')) g.add(mesh(new THREE.TorusGeometry(r + 0.01, 0.018, 12, 96).rotateX(Math.PI / 2), emissive(accent, 2.2), 0, -h * 0.15, 0));
  if (bool(p, 'display')) {
    const disp = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 48), screenMat(lcdTexture('24.5°', '#' + accent.getHexString()), 0.9));
    disp.rotation.x = -Math.PI / 2; disp.position.y = h / 2 + 0.004; g.add(disp);
  }
  if (bool(p, 'recessed')) {
    g.add(mesh(new THREE.SphereGeometry(r * 0.35, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass(), 0, h / 2 - 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.03, 64), plastic('#f6f6f4', 0.6), 0, -h / 2 + 0.015, 0));
  }
  if (!vents) { const l = led(accent, glossy ? 0.015 : 0.009); l.position.set(glossy ? 0 : r * 0.62, h / 2 - (glossy ? -0.005 : h * 0.3), glossy ? r * 0.6 : r * 0.5); g.add(l); } // the smoke detector's LED is off until it alarms
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, h / 2, 0); g.add(hs);
  // product viewer: tilt so the top reads; mounted (tilt:false): dome faces +Z, the room side
  g.rotation.x = off(p, 'tilt') ? Math.PI / 2 : 0.35;
  return g;
}
/** In-ceiling speaker after the catalogue unit: a slim white bezel, a flush, slightly domed, all-white fine perforated grille and a small black badge. */
function disc({ p }: Ctx) {
  const g = new THREE.Group();
  const r = num(p, 'r', 0.75), d = num(p, 'd', 0.12);
  const white = plastic('#f4f4f1', 0.5);
  // bezel: narrow flat ring with a soft outer roll, a few millimetres proud of the ceiling
  const ri = r * 0.9, prof: THREE.Vector2[] = [new THREE.Vector2(ri, d * 0.18), new THREE.Vector2(ri, d * 0.34)];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(ri + (r - ri) * Math.sin(t * Math.PI / 2), d * 0.34 + (1 - Math.cos(t * Math.PI / 2)) * d * 0.14)); }
  prof.push(new THREE.Vector2(r, d * 0.5), new THREE.Vector2(r * 0.985, d * 0.5), new THREE.Vector2(r * 0.985, 0), new THREE.Vector2(ri * 0.98, 0));
  g.add(mesh(new THREE.LatheGeometry(prof, 128).rotateX(Math.PI / 2), white));
  // grille: a gently domed disc, opaque paint with the hole pattern in colour + bump
  const dome = new THREE.RingGeometry(0.001, ri * 0.995, 128, 8); dome.rotateX(0); // RingGeometry lies in xy with planar UVs
  { const pos = dome.attributes.position as THREE.BufferAttribute; const hgt = d * 0.16; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), q = (x * x + y * y) / (ri * ri); pos.setZ(i, d * 0.3 + hgt * (1 - q)); } dome.computeVertexNormals(); }
  const grilleMat = new THREE.MeshStandardMaterial({ color: '#f2f2ee', map: grilleTexture(true, 2048, 120), bumpMap: grilleTexture(false, 2048, 120), bumpScale: 0.6, roughness: 0.55, metalness: 0.12, envMapIntensity: 1.0 }); // powder-coated perforated steel
  const grille = mesh(dome, grilleMat); grille.name = 'grille'; g.add(grille);
  const sl = led('#8fd3ff', 0.008); (sl.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2; sl.name = 'led_0'; sl.position.set(0, -(ri + (r - ri) * 0.5), d * 0.5 + 0.002); g.add(sl);
  const badge = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: canvasTex(256, 64, (gg, w, h) => { gg.fillStyle = '#101114'; gg.fillRect(0, 0, w, h); gg.fillStyle = 'rgba(220,222,226,0.85)'; gg.font = `500 ${h * 0.42}px "Jost", system-ui, sans-serif`; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.letterSpacing = '6px'; gg.fillText('AL RAWI', w / 2, h / 2 + 1); }), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  g.add(mesh(rbox(r * 0.16, r * 0.045, 0.004, 0.012), badge, 0, 0, d * 0.3 + d * 0.16 + 0.002)); // small black badge with a silver logotype
  if (!off(p, 'can')) { // back can (product viewer only; mounted flush in the walkthrough)
    g.add(mesh(new THREE.CylinderGeometry(ri, ri, r * 0.3, 64).rotateX(Math.PI / 2), plastic('#e0e0dc', 0.8), 0, 0, -r * 0.15));
  }
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, 0, d * 0.46); g.add(hs);
  return g;
}
const FINISH: Record<string, string> = { white: '#f2f0eb', champagne: '#c8b28d', black: '#1d1e21', grey: '#3a3d42', graphite: '#3e4147' };
/** A key's face after the catalogue's dark switch: satin graphite, a touch lighter at the top, a thin white bulb icon near the foot. */
function keyFace(color: string, icon: boolean) {
  return canvasTex(256, 512, (g, w, h) => {
    const c = new THREE.Color(color), top = c.clone().offsetHSL(0, 0, 0.07), bot = c.clone().offsetHSL(0, 0, -0.05);
    const grd = g.createLinearGradient(0, 0, w * 0.35, h); grd.addColorStop(0, '#' + top.getHexString()); grd.addColorStop(1, '#' + bot.getHexString()); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    if (icon) { g.save(); g.translate(w / 2, h * 0.8); g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.arc(0, -6, 13, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(6, 14); g.lineTo(-6, 14); g.closePath(); g.stroke(); // bulb
      g.beginPath(); g.moveTo(-5, 19); g.lineTo(5, 19); g.moveTo(-3.5, 23); g.lineTo(3.5, 23); g.stroke(); // screw base
      for (const a of [-2.3, -1.9, -1.57, -1.24, -0.84]) { g.beginPath(); g.moveTo(Math.cos(a) * 19, -6 + Math.sin(a) * 19); g.lineTo(Math.cos(a) * 25, -6 + Math.sin(a) * 25); g.stroke(); } // rays
      g.restore(); }
  });
}
/** the icon alone, for the backlight (emissive) */
function keyGlow() { return canvasTex(256, 512, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h * 0.8); g.strokeStyle = '#fff'; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.arc(0, -6, 13, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(6, 14); g.lineTo(-6, 14); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(-5, 19); g.lineTo(5, 19); g.moveTo(-3.5, 23); g.lineTo(3.5, 23); g.stroke(); for (const a of [-2.3, -1.9, -1.57, -1.24, -0.84]) { g.beginPath(); g.moveTo(Math.cos(a) * 19, -6 + Math.sin(a) * 19); g.lineTo(Math.cos(a) * 25, -6 + Math.sin(a) * 25); g.stroke(); } g.restore(); }); }

/** Multi-gang switch after the catalogue unit: a square plate with full-height rockers, a tiny status dot low on each, in the chosen finish. */
function sw({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const size = num(p, 'size', 1.1), gangs = num(p, 'gangs', 3), color = FINISH[str(p, 'finish', '')] ?? str(p, 'color', '#3a3d42'), dark = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
  const glassy = bool(p, 'glass'); // a satin glass front: the catalogue's premium finish, it catches the room's light
  const face = new THREE.MeshPhysicalMaterial({ color, roughness: glassy ? 0.2 : 0.62, metalness: 0, clearcoat: glassy ? 1 : 0.06, clearcoatRoughness: glassy ? 0.08 : 0.6, envMapIntensity: glassy ? 1.3 : 0.9 });
  const seam = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.35), roughness: 0.9 });
  const slim = str(p, 'finish', '') === 'graphite' || bool(p, 'icons');
  g.add(mesh(rbox(size, size, slim ? 0.05 : 0.075, slim ? 0.012 : 0.03), face));
  if (!slim) g.add(mesh(rbox(size * 0.88, size * 0.88, 0.02, 0.01), seam, 0, 0, 0.032)); // the dark recess the rockers sit in
  g.add(mesh(rbox(size * 0.9, size * 0.9, 0.05, 0.02), plastic('#cfd2d6', 0.7), 0, 0, -0.05));
  if (bool(p, 'dial')) {
    g.add(mesh(new THREE.TorusGeometry(size * 0.28, 0.025, 16, 96), brushed('#e8e8ea'), 0, 0, 0.04));
    const f = new THREE.Mesh(new THREE.CircleGeometry(size * 0.25, 64), screenMat(lcdTexture('88%', '#' + accent.getHexString()), 0.9)); f.position.z = 0.04; g.add(f);
    for (const [x, y] of [[-0.32, -0.36], [0.32, -0.36]]) { const l = led(accent, 0.012); l.position.set(x * size, y * size, 0.04); g.add(l); }
  } else if (bool(p, 'wireless') || gangs === 4) {
    const bw = size * 0.4, gap = size * 0.04;
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], i) => {
      g.add(mesh(rbox(bw, bw, 0.05, 0.03), plastic(dark ? '#45484f' : '#ffffff', 0.4), sx * (bw / 2 + gap / 2), sy * (bw / 2 + gap / 2), 0.045));
      const l = led(i === 0 ? accent : '#d0d3d8', 0.012); l.position.set(sx * (bw * 0.75), sy * (bw * 0.75), 0.075); g.add(l);
    });
  } else if (str(p, 'finish', '') === 'graphite' || bool(p, 'icons')) {
    // the catalogue's dark unit: keys edge to edge over the plate (a hairline between them), satin graphite, each with a
    // thin white bulb icon near its foot that glows softly (the backlight); the plate only shows as a thin rim at the edges
    const n = Math.max(1, gangs), gap = size * 0.012, bw = (size * 0.985 - gap * (n - 1)) / n, bh = size * 0.985;
    const glow = keyGlow();
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) / 2) * (bw + gap) + i * (bw + gap);
      const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: keyFace(color, true), roughness: 0.42, metalness: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 1.15, emissive: '#ffe7c4', emissiveMap: glow, emissiveIntensity: 0.55, normalMap: microNormal(), normalScale: new THREE.Vector2(0.04, 0.04), roughnessMap: roughVar() });
      const key = mesh(rbox(bw, bh, 0.034, 0.008), mat, x, 0, 0.045); key.scale.z = 1.12; g.add(key); // slightly convex
      const f = new THREE.Object3D(); f.name = `led_${i}`; f.position.set(x, -bh * 0.3, 0.07); g.add(f); // where the icon glows: the landing's tappable backlight
    }
  } else {
    const n = Math.max(1, gangs), gap = size * 0.018, bw = (size * 0.86 - gap * (n - 1)) / n, bh = size * 0.86;
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) / 2) * (bw + gap) + i * (bw + gap);
      const rocker = mesh(rbox(bw, bh, 0.05, 0.018), face, x, 0, 0.045); rocker.scale.z = 1.25; g.add(rocker); // slightly convex
      const dot = mesh(new THREE.CylinderGeometry(size * 0.013, size * 0.013, 0.004, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f4e2c4', emissive: '#ffd9a0', emissiveIntensity: dark ? 0.9 : 1.6, roughness: 0.5 }), x, -bh * 0.38, 0.045 + 0.032); dot.name = `led_${i}`; g.add(dot); // backlit status dot (warm, on every finish)
      if (bool(p, 'led')) { const r = led('#ff5a3d', 0.016); r.position.set(x, bh * 0.4, 0.078); g.add(r); }
    }
  }
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, 0, 0.08); g.add(hs);
  return g;
}
/**
 * Smart door lock after the catalogue unit: a gloss piano-black push-pull lock — a face-recognition module with
 * three lenses at the top, a camera below it, a glass keypad, and a long full-width pull handle over the lower half.
 */
function lock({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const w = num(p, 'w', 0.36), h = num(p, 'h', 1.7), d = num(p, 'd', 0.16);
  const hex = '#' + accent.getHexString();
  // the catalogue unit is gloss obsidian black: a dimmer environment reflection keeps the walnut door from tinting it bronze
  const obsidian = piano('#050506'); obsidian.envMapIntensity = 0.55; obsidian.clearcoatRoughness = 0.06;
  g.add(mesh(rbox(w, h, d, 0.05), obsidian));                                                                      // slim piano-black bar
  g.add(mesh(rbox(w - 0.05, h * 0.15, 0.008, 0.02), glass('#03040a'), 0, h * 0.405, d / 2 + 0.003));            // face-recognition module
  for (const [x, y, r] of [[-w * 0.22, h * 0.41, 0.02], [0, h * 0.41, 0.02], [w * 0.22, h * 0.41, 0.02], [0, h * 0.325, 0.03]] as const) g.add(mesh(new THREE.CylinderGeometry(r, r, 0.006, 24).rotateX(Math.PI / 2), r > 0.025 ? glass('#151033') : glass('#000'), x, y, d / 2 + 0.008));
  const kp = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h * 0.27), screenMat(keypadTexture(hex), 1.25)); kp.name = 'keypad'; kp.position.set(0, h * 0.1, d / 2 + 0.0062); g.add(kp); // in front of the glass cover, so the digits read
  g.add(mesh(rbox(w - 0.05, h * 0.3, 0.006, 0.02), glass('#05070c'), 0, h * 0.1, d / 2 + 0.002));                // glass over the keypad
  g.add(mesh(rbox(w * 1.05, h * 0.45, d * 1.35, 0.05), obsidian, 0, -h * 0.27, d * 0.18));                        // the full-width pull handle
  g.add(mesh(new THREE.CylinderGeometry(w * 0.13, w * 0.13, 0.006, 32).rotateX(Math.PI / 2), glass('#1a1c22'), 0, -h * 0.1, d * 0.18 + d * 0.675 + 0.002)); // fingerprint reader on the handle's face
  g.add(mesh(new THREE.TorusGeometry(w * 0.13, 0.004, 8, 48), metal('#8e9096', 0.3), 0, -h * 0.1, d * 0.18 + d * 0.675 + 0.004)); // its satin ring
  { const trim = metal('#6d6f75', 0.28); const t = 0.006, z = d / 2 + 0.001; // a satin trim framing the front face
    for (const [x, y, ww, hh] of [[0, h / 2 - 0.02, w - 0.04, t], [-w / 2 + 0.02, h * 0.23, t, h * 0.5], [w / 2 - 0.02, h * 0.23, t, h * 0.5]] as const) g.add(mesh(rbox(ww, hh, 0.006, 0.002), trim, x, y, z)); }
  g.add(mesh(rbox(w * 0.5, 0.008, 0.004, 0.002), plastic('#1c1d22', 0.4), 0, -h * 0.485, d * 0.18 + d * 0.675 + 0.001)); // key-cover seam at the handle's foot
  const l = led('#3fa9ff', 0.005); (l.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9; l.name = 'led_0'; l.position.set(0, h * 0.475, d / 2 + 0.004); g.add(l); // standby dot
  if (!off(p, 'back')) g.add(mesh(rbox(w * 0.8, h * 1.02, 0.02, 0.01), plastic('#8a5a2b', 0.8), 0, 0, -d / 2 - 0.01)); // door hint (product viewer only)
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(0, h * 0.1, d / 2); g.add(hs);
  return g;
}
/** Motorised curtain track after the catalogue unit: a slim white aluminium profile with the square-section motor body at its end (brushed end plate, four screws, the drive boss), gliders below. */
function rail({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const L = num(p, 'length', 2.4), ml = Math.min(Math.max(num(p, 'motor', 0.7) * 0.42, 0.24), L * 0.2);
  const white = plastic('#f3f3f0', 0.4), grey = brushed('#c6c8ca'), dark = new THREE.MeshStandardMaterial({ color: '#25272b', roughness: 0.8 }), screw = metal('#7d8087', 0.35);
  const H = 0.056, D = 0.046, MH = 0.092, MD = 0.08;
  g.add(mesh(rbox(L, H, D, 0.008), white));                                                                     // the profile
  g.add(mesh(new THREE.BoxGeometry(L - 0.08, 0.006, 0.016), dark, 0, -H / 2 + 0.001, 0));                          // glider slot
  // motor body: a longer square-section housing over the profile's -X end, brushed end plate with four screws and the drive boss
  const mx = -L / 2, mcx = mx + ml / 2;
  g.add(mesh(rbox(ml, MH, MD, 0.01), white, mcx, -0.006, 0));
  g.add(mesh(rbox(0.006, MH * 0.96, MD * 0.96, 0.004), grey, mx - 0.003, -0.006, 0));
  for (const [sy, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 12).rotateZ(Math.PI / 2), screw, mx - 0.007, -0.006 + sy * MH * 0.34, sz * MD * 0.3));
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16).rotateZ(Math.PI / 2), screw, mx - 0.011, -0.006, 0));
  g.add(mesh(rbox(0.006, H * 0.96, D * 0.96, 0.004), white, L / 2 + 0.003, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(ml * 0.45, 0.008, 0.002), dark, mcx, -MH * 0.22, MD / 2 + 0.001));               // the motor's status window
  const l = led(accent, 0.005); l.name = 'led_0'; l.position.set(mcx + ml * 0.28, -MH * 0.22, MD / 2 + 0.003); g.add(l);
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 8).rotateX(Math.PI / 2), dark, mx + 0.05, -0.02, -MD / 2 - 0.07)); // power lead into the wall
  // wall brackets (the mounting face is -Z)
  for (let i = -1; i <= 1; i++) g.add(mesh(rbox(0.05, 0.024, 0.09, 0.008), white, i * L * 0.38, H / 2 - 0.012, -D / 2 - 0.04));
  // gliders with hooks
  const n = Math.max(8, Math.round(L * 6)), x0 = mx + ml + 0.08, x1 = L / 2 - 0.08;
  for (let i = 0; i < n; i++) { const x = x0 + (i / (n - 1)) * (x1 - x0); g.add(mesh(rbox(0.016, 0.022, 0.012, 0.004), white, x, -H / 2 - 0.011, 0)); g.add(mesh(new THREE.TorusGeometry(0.006, 0.0012, 6, 16), screw, x, -H / 2 - 0.028, 0)); }
  if (!off(p, 'cloth')) { // product viewer: a sheer to say what it does
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.55, 1.4, 24, 1), new THREE.MeshPhysicalMaterial({ color: '#d7e4ff', roughness: 0.95, transmission: 0.35, opacity: 0.55, transparent: true, side: THREE.DoubleSide }));
    const pos = cloth.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.05);
    cloth.geometry.computeVertexNormals();
    cloth.position.set(L * 0.2, -0.8, 0.02); g.add(cloth);
  }
  const hs = new THREE.Object3D(); hs.name = 'hotspot'; hs.position.set(mcx, -0.006, MD / 2); g.add(hs);
  return g;
}
function box({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const w = num(p, 'w', 0.9), h = num(p, 'h', 0.6), d = num(p, 'd', 0.3);
  g.add(mesh(rbox(w, h, d, 0.04), plastic('#f4f4f2', 0.45)));
  if (bool(p, 'terminals')) {
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(w / 8, h * 0.28, 0.06), plastic('#2ea44f', 0.6), -w / 2 + w / 12 + i * (w / 7.2), -h * 0.3, d / 2 + 0.02));
    g.add(mesh(new THREE.BoxGeometry(w * 0.5, h * 0.06, 0.005), new THREE.MeshStandardMaterial({ color: '#1c1e23' }), 0, h * 0.2, d / 2 + 0.003));
  }
  if (bool(p, 'magnet')) {
    g.add(mesh(rbox(w * 0.45, h * 0.8, d * 0.8, 0.03), plastic('#f4f4f2', 0.45), w * 0.95, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(w * 0.16, 0.008, 8, 48), new THREE.MeshStandardMaterial({ color: '#d0d0cc' }), 0, h * 0.15, d / 2 + 0.002));
  }
  const l = led(accent, 0.016); l.position.set(w * 0.35, h * 0.35, d / 2 + 0.004); g.add(l);
  return g;
}
function orb({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const r = num(p, 'r', 0.45);
  g.add(mesh(new THREE.SphereGeometry(r, 64, 48), plastic('#f6f6f4', 0.4)));
  g.add(mesh(new THREE.SphereGeometry(r * 1.005, 64, 48, -Math.PI / 3, Math.PI * 0.66, Math.PI * 0.32, Math.PI * 0.36), new THREE.MeshPhysicalMaterial({ color: '#0e1118', roughness: 0.2, clearcoat: 1 })));
  g.add(mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.6, r * 0.3, 48), plastic('#f0f0ee', 0.5), 0, -r * 1.05, 0));
  g.add(mesh(new THREE.SphereGeometry(r * 0.3, 24, 24), metal('#cfd2d6'), 0, -r * 0.85, 0));
  const l = led(accent, 0.02); l.position.set(0, r * 0.45, r * 0.9); g.add(l);
  return g;
}

// the film's six devices are modelled one file each after the catalogue unit; a device recipe returns null for a parameter
// set it does not cover (the other products that share the shape), which then falls back to the generic recipe above
const recipes: Record<string, (c: Ctx) => THREE.Group> = {
  panel: (c) => wallPanel(c) ?? panel(c), puck: (c) => smokeDetector(c) ?? puck(c), disc: (c) => ceilingSpeaker(c) ?? disc(c),
  switch: (c) => keySwitch(c) ?? sw(c), lock: (c) => doorLock(c) ?? lock(c), rail: (c) => curtainTrack(c) ?? rail(c), box, orb,
};

export function buildProduct(shape: string, params: Params, accentHex: string) {
  const ctx: Ctx = { accent: new THREE.Color(accentHex || '#2f80ff'), p: params ?? {} };
  const g = (recipes[shape] ?? box)(ctx);
  // centre on origin
  const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3());
  g.position.sub(c);
  const wrap = new THREE.Group(); wrap.add(g);
  return wrap;
}
