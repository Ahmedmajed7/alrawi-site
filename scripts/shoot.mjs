#!/usr/bin/env node
/**
 * Headless-Chrome screenshot helper (no puppeteer needed).
 * Usage: node scripts/shoot.mjs out.png URL [width height] [waitMs] [selector] [jsBeforeCapture]
 * e.g. OG image: node scripts/shoot.mjs public/og.jpg http://localhost:4321/en/ 1200 630 9000 '' "document.querySelectorAll('.nav,.wa-fab,.hero-scroll').forEach(e=>e.remove())"
 * Renders with the real GPU when possible so Three.js scenes complete.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [out, url, w = '1440', h = '900', waitMs = '6000', selector = '', preJs = ''] = process.argv.slice(2);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--window-size=${w},${h}`, `--user-data-dir=/tmp/alrawi-shoot-${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let info;
  for (let i = 0; i < 50 && !info; i++) { await sleep(200); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch {} }
  if (!info) throw new Error('chrome did not start');
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const ct = await send('Target.createTarget', { url: 'about:blank', newWindow: true, width: +w, height: +h });
  if (!ct.result) throw new Error('createTarget failed: ' + JSON.stringify(ct));
  const { targetId } = ct.result;
  const at = await send('Target.attachToTarget', { targetId, flatten: true });
  if (!at.result) throw new Error('attach failed: ' + JSON.stringify(at));
  const { sessionId } = at.result;
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 }, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(+waitMs);
  if (preJs) { await send('Runtime.evaluate', { expression: preJs }, sessionId); await sleep(400); }
  let clip;
  if (selector) {
    const { result } = await send('Runtime.evaluate', { expression: `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return JSON.stringify({x:r.left,y:r.top,width:r.width,height:r.height}); })()`, returnByValue: true }, sessionId);
    clip = { ...JSON.parse(result.result.value), scale: 1 };
  }
  const { result: shot } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) }, sessionId);
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  const { result: dbg } = await send('Runtime.evaluate', { expression: `JSON.stringify({is3d: !!document.querySelector('.is-3d'), errors: (window.__errs||[]).length})`, returnByValue: true }, sessionId);
  console.log(out, dbg.result.value);
  ws.close();
} finally { chrome.kill('SIGKILL'); }
