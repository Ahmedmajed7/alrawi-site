/**
 * Procedural product models. Each recipe returns a THREE.Group centred on the origin,
 * roughly 1–2.5 units across, built from physically based materials so the viewer's
 * environment lighting does the work. Used when no GLB exists for a product.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Params = Record<string, unknown>;
type Ctx = { accent: THREE.Color; p: Params };

const num = (p: Params, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
const str = (p: Params, k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);
const bool = (p: Params, k: string) => p[k] === true;

/* ---------- materials ---------- */
const plastic = (color: string | THREE.Color, rough = 0.42) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });
const glass = () => new THREE.MeshPhysicalMaterial({ color: '#0a0d14', roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
const metal = (color = '#c9ccd2') => new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.9 });
const emissive = (color: THREE.Color | string, intensity = 1.6) => new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: intensity, roughness: 0.6 });

/* ---------- canvas textures ---------- */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** A smart-home dashboard UI for panel screens. */
function screenTexture(accent: string, w = 1024, h = 768) {
  return canvasTex(w, h, (g) => {
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#101a33');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const orb = g.createRadialGradient(w * 0.8, h * 0.15, 0, w * 0.8, h * 0.15, w * 0.5); orb.addColorStop(0, accent + '66'); orb.addColorStop(1, accent + '00');
    g.fillStyle = orb; g.fillRect(0, 0, w, h);
    g.fillStyle = '#eef3ff'; g.font = `700 ${h * 0.2}px Manrope, system-ui, sans-serif`; g.textBaseline = 'top'; g.fillText('22:40', w * 0.06, h * 0.07);
    g.fillStyle = 'rgba(238,243,255,0.65)'; g.font = `500 ${h * 0.045}px Manrope, system-ui, sans-serif`; g.fillText('Living room · 24°C · 48%', w * 0.065, h * 0.3);
    const tiles = [['Lighting', 'ON', true], ['Climate', '24°', true], ['Curtains', 'OPEN', false], ['Security', 'ARMED', true], ['Audio', 'PLAY', false], ['Scenes', 'NIGHT', false]] as const;
    const cols = 3, gap = w * 0.025, tw = (w * 0.88 - gap * (cols - 1)) / cols, th = h * 0.24, x0 = w * 0.06, y0 = h * 0.4;
    tiles.forEach(([name, val, on], i) => {
      const x = x0 + (i % cols) * (tw + gap), y = y0 + Math.floor(i / cols) * (th + gap);
      roundRect(g, x, y, tw, th, h * 0.03); g.fillStyle = on ? accent + 'cc' : 'rgba(255,255,255,0.08)'; g.fill();
      g.fillStyle = on ? '#fff' : 'rgba(238,243,255,0.8)'; g.font = `600 ${h * 0.05}px Manrope, system-ui, sans-serif`; g.fillText(name, x + tw * 0.08, y + th * 0.14);
      g.font = `700 ${h * 0.085}px Manrope, system-ui, sans-serif`; g.fillText(val, x + tw * 0.08, y + th * 0.5);
    });
  });
}
function lcdTexture(text: string, accent: string) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0a0d14'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.font = '700 120px Manrope, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
  });
}
function keypadTexture(accent: string) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#0a0d14'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.font = '600 46px Manrope, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    keys.forEach((k, i) => g.fillText(k, w * (0.22 + (i % 3) * 0.28), h * (0.14 + Math.floor(i / 3) * 0.2)));
  });
}
function grilleAlpha(size = 512, holes = 22) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; const step = w / holes;
    for (let y = 0; y < holes; y++) for (let x = 0; x < holes; x++) {
      const cx = (x + 0.5) * step, cy = (y + 0.5) * step, dx = cx - w / 2, dy = cy - h / 2;
      if (dx * dx + dy * dy < (w * 0.48) ** 2) { g.beginPath(); g.arc(cx, cy, step * 0.26, 0, Math.PI * 2); g.fill(); }
    }
  });
}

/* ---------- helpers ---------- */
const rbox = (w: number, h: number, d: number, r = 0.04, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2.2));
function roundedCylinder(r: number, h: number, edge = 0.05, seg = 64) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
  const e = Math.min(edge, r * 0.5, h * 0.5);
  pts.push(new THREE.Vector2(r - e, -h / 2));
  for (let i = 1; i <= 6; i++) { const a = (-Math.PI / 2) + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e)); }
  pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, seg);
}
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const led = (accent: THREE.Color | string, r = 0.02) => mesh(new THREE.SphereGeometry(r, 16, 16), emissive(accent, 2.5));

/* ---------- recipes ---------- */
function panel({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const w = num(p, 'w', 1.6), h = num(p, 'h', 1.1), d = num(p, 'd', 0.09), bezel = num(p, 'bezel', 0.07), dark = bool(p, 'dark');
  g.add(mesh(rbox(w, h, d, 0.05), plastic(dark ? '#15171b' : '#f3f3f1', 0.5)));
  g.add(mesh(rbox(w - 0.02, h - 0.02, 0.012, 0.03), glass(), 0, 0, d / 2 + 0.002));
  if (p.screen !== false) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - bezel * 2, h - bezel * 2), new THREE.MeshStandardMaterial({ map: screenTexture('#' + accent.getHexString()), emissiveMap: screenTexture('#' + accent.getHexString()), emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.25 }));
    screen.position.z = d / 2 + 0.012; g.add(screen);
  }
  const l = led(accent, 0.012); l.position.set(w / 2 - bezel / 2, -h / 2 + bezel / 2, d / 2 + 0.012); g.add(l);
  // wall plate behind
  g.add(mesh(rbox(w * 0.6, h * 0.6, 0.04, 0.02), plastic('#dcdcd8', 0.7), 0, 0, -d / 2 - 0.02));
  return g;
}
function puck({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const r = num(p, 'r', 0.5), h = num(p, 'h', 0.22), color = str(p, 'color', '#f6f6f4');
  const body = mesh(roundedCylinder(r, h, Math.min(0.08, h * 0.45)), bool(p, 'glossy') ? glass() : plastic(color, 0.45));
  g.add(body);
  if (bool(p, 'vents')) {
    const n = 40, hole = new THREE.CylinderGeometry(r * 0.03, r * 0.03, 0.02, 8);
    const inst = new THREE.InstancedMesh(hole, new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.9 }), n * 2);
    const m = new THREE.Matrix4();
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = r * (0.55 + ring * 0.2);
      m.makeTranslation(Math.cos(a) * rr, h / 2, Math.sin(a) * rr); inst.setMatrixAt(ring * n + i, m);
    }
    g.add(inst);
    g.add(mesh(new THREE.TorusGeometry(r * 0.32, 0.008, 8, 64).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d8d8d4', roughness: 0.8 }), 0, h / 2 + 0.002, 0));
  }
  if (bool(p, 'ring')) {
    g.add(mesh(new THREE.TorusGeometry(r + 0.01, 0.018, 12, 96).rotateX(Math.PI / 2), emissive(accent, 2.2), 0, -h * 0.15, 0));
  }
  if (bool(p, 'display')) {
    const disp = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 48), new THREE.MeshStandardMaterial({ map: lcdTexture('24.5°', '#' + accent.getHexString()), emissiveMap: lcdTexture('24.5°', '#' + accent.getHexString()), emissive: '#fff', emissiveIntensity: 0.8, roughness: 0.3 }));
    disp.rotation.x = -Math.PI / 2; disp.position.y = h / 2 + 0.004; g.add(disp);
  }
  if (bool(p, 'recessed')) {
    g.add(mesh(new THREE.SphereGeometry(r * 0.35, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass(), 0, h / 2 - 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.03, 64), plastic('#f6f6f4', 0.6), 0, -h / 2 + 0.015, 0));
  }
  if (bool(p, 'glossy')) {
    const l = led(accent, 0.015); l.position.set(0, h / 2 + 0.005, r * 0.6); g.add(l);
  } else {
    const l = led(accent, 0.02); l.position.set(r * 0.6, h / 2 + 0.005, 0); g.add(l);
  }
  g.rotation.x = 0.35; // tilt towards camera so the top reads
  return g;
}
function disc({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const r = num(p, 'r', 0.75), d = num(p, 'd', 0.12);
  g.add(mesh(new THREE.TorusGeometry(r, d * 0.5, 16, 96), plastic('#f4f4f2', 0.5)));
  const grille = new THREE.Mesh(new THREE.CircleGeometry(r - d * 0.3, 96), new THREE.MeshStandardMaterial({ color: '#f0f0ee', roughness: 0.7, alphaMap: grilleAlpha(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  grille.position.z = d * 0.25; g.add(grille);
  g.add(mesh(new THREE.CylinderGeometry(r - d * 0.3, r - d * 0.3, 0.02, 96).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.9 }), 0, 0, d * 0.22));
  g.add(mesh(new THREE.SphereGeometry(r * 0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), metal('#3a3d44'), 0, 0, d * 0.24));
  g.add(mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, r * 0.45, 48).rotateX(Math.PI / 2), plastic('#e2e2df', 0.8), 0, 0, -r * 0.25));
  const l = led(accent, 0.015); l.position.set(r * 0.55, -r * 0.55, d * 0.28); g.add(l);
  return g;
}
function sw({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const size = num(p, 'size', 1.1), gangs = num(p, 'gangs', 3), color = str(p, 'color', '#3a3d42'), dark = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
  g.add(mesh(rbox(size, size, 0.07, 0.04), plastic(color, 0.35)));
  g.add(mesh(rbox(size * 0.9, size * 0.9, 0.05, 0.02), plastic('#cfd2d6', 0.7), 0, 0, -0.05));
  if (bool(p, 'dial')) {
    g.add(mesh(new THREE.TorusGeometry(size * 0.28, 0.025, 16, 96), metal('#e8e8ea'), 0, 0, 0.04));
    const face = new THREE.Mesh(new THREE.CircleGeometry(size * 0.25, 64), new THREE.MeshStandardMaterial({ map: lcdTexture('88%', '#' + accent.getHexString()), emissiveMap: lcdTexture('88%', '#' + accent.getHexString()), emissive: '#fff', emissiveIntensity: 0.9, roughness: 0.3 }));
    face.position.z = 0.04; g.add(face);
    for (const [x, y] of [[-0.32, -0.36], [0.32, -0.36]]) { const l = led(accent, 0.012); l.position.set(x * size, y * size, 0.04); g.add(l); }
  } else if (bool(p, 'wireless') || gangs === 4) {
    const bw = size * 0.4, gap = size * 0.04;
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], i) => {
      g.add(mesh(rbox(bw, bw, 0.05, 0.03), plastic(dark ? '#45484f' : '#ffffff', 0.4), sx * (bw / 2 + gap / 2), sy * (bw / 2 + gap / 2), 0.045));
      const l = led(i === 0 ? accent : '#d0d3d8', 0.012); l.position.set(sx * (bw * 0.75), sy * (bw * 0.75), 0.075); g.add(l);
    });
  } else {
    const n = Math.max(1, gangs), bw = (size * 0.86) / n - 0.03, bh = size * 0.86;
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) / 2) * (bw + 0.03) + i * (bw + 0.03);
      g.add(mesh(rbox(bw, bh, 0.05, 0.03), plastic(dark ? '#45484f' : '#ffffff', 0.4), x, 0, 0.045));
      const l = led(i === 0 ? accent : '#c9ccd2', 0.012); l.position.set(x, -bh * 0.4, 0.075); g.add(l);
      if (bool(p, 'led')) { const r = led('#ff5a3d', 0.016); r.position.set(x, bh * 0.4, 0.075); g.add(r); }
    }
  }
  return g;
}
function lock({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const w = num(p, 'w', 0.36), h = num(p, 'h', 1.7), d = num(p, 'd', 0.16);
  g.add(mesh(rbox(w, h, d, 0.06), plastic('#1c1e23', 0.35)));
  g.add(mesh(rbox(w - 0.04, h * 0.28, 0.01, 0.03), glass(), 0, h * 0.32, d / 2 + 0.004)); // face-ID screen
  const kp = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h * 0.3), new THREE.MeshStandardMaterial({ map: keypadTexture('#' + accent.getHexString()), emissiveMap: keypadTexture('#' + accent.getHexString()), emissive: '#fff', emissiveIntensity: 0.7, roughness: 0.3 }));
  kp.position.set(0, h * 0.0, d / 2 + 0.006); g.add(kp);
  g.add(mesh(new THREE.TorusGeometry(w * 0.2, 0.012, 12, 48), metal('#8fd7ff'), 0, -h * 0.22, d / 2 + 0.006)); // fingerprint ring
  g.add(mesh(new THREE.CylinderGeometry(w * 0.12, w * 0.12, 0.02, 32).rotateX(Math.PI / 2), glass(), 0, -h * 0.22, d / 2 + 0.006));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 24).rotateX(Math.PI / 2), metal('#2b2e35'), w * 0.75, -h * 0.05, d * 0.9));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 24), metal('#2b2e35'), w * 0.75, -h * 0.05, d * 0.9 + 0.2)); // handle
  g.add(mesh(rbox(w * 0.8, h * 1.02, 0.02, 0.01), plastic('#8a5a2b', 0.8), 0, 0, -d / 2 - 0.01)); // door hint
  const l = led(accent, 0.012); l.position.set(0, h * 0.47, d / 2 + 0.006); g.add(l);
  return g;
}
function rail({ accent, p }: Ctx) {
  const g = new THREE.Group();
  const L = num(p, 'length', 2.4), ml = num(p, 'motor', 0.7);
  g.add(mesh(rbox(L, 0.09, 0.09, 0.02), metal('#d9dbe0'), 0, 0.25, 0));
  g.add(mesh(rbox(0.16, 0.5, 0.16, 0.05), plastic('#f4f4f2', 0.4), -L / 2 + 0.1, -0.05, 0));
  g.add(mesh(rbox(0.13, ml * 0.5, 0.13, 0.04), plastic('#f4f4f2', 0.4), -L / 2 + 0.1, -0.5, 0));
  const l = led(accent, 0.014); l.position.set(-L / 2 + 0.1, -0.15, 0.085); g.add(l);
  for (let i = 0; i < 9; i++) g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), plastic('#ffffff', 0.6), -L / 2 + 0.5 + i * (L - 0.7) / 8, 0.13, 0));
  // sheer curtain hint
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.55, 1.4, 24, 1), new THREE.MeshPhysicalMaterial({ color: '#d7e4ff', roughness: 0.95, transmission: 0.35, opacity: 0.55, transparent: true, side: THREE.DoubleSide }));
  const pos = cloth.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.05);
  cloth.geometry.computeVertexNormals();
  cloth.position.set(L * 0.2, -0.55, 0.02); g.add(cloth);
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

const recipes: Record<string, (c: Ctx) => THREE.Group> = { panel, puck, disc, switch: sw, lock, rail, box, orb };

export function buildProduct(shape: string, params: Params, accentHex: string) {
  const ctx: Ctx = { accent: new THREE.Color(accentHex || '#2f80ff'), p: params ?? {} };
  const g = (recipes[shape] ?? box)(ctx);
  // centre on origin
  const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3());
  g.position.sub(c);
  const wrap = new THREE.Group(); wrap.add(g);
  return wrap;
}
