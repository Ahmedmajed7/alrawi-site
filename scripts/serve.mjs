#!/usr/bin/env node
/**
 * Serve dist/ the way Cloudflare Pages will: the rules in public/_headers (immutable caching for /film, /_astro, …),
 * brotli/gzip for text, byte ranges for video, trailing-slash index pages. `astro preview` sends everything
 * uncompressed with `Cache-Control: no-cache`, which makes the film look far slower locally than it is in production.
 *
 *   npm run serve            (node scripts/serve.mjs [--port=4331])
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(args.port || 4331);

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.hdr': 'application/octet-stream' };
const TEXT = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

/** public/_headers → [{ re, headers }] (Cloudflare syntax: a path line, then indented "Name: value" lines; `*` is a splat) */
const rules = [];
{
  const src = existsSync(join(DIST, '_headers')) ? readFileSync(join(DIST, '_headers'), 'utf8') : '';
  let cur = null;
  for (const line of src.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), headers: {} }; rules.push(cur); continue; }
    const m = line.trim().match(/^([^:]+):\s*(.*)$/); if (cur && m) cur.headers[m[1]] = m[2];
  }
}
const compressed = new Map(); // path+encoding → Buffer (dist is static while serving)

createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); let path = decodeURIComponent(url.pathname);
  let file = normalize(join(DIST, path)); if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) { res.writeHead(308, { Location: path + '/' + url.search }).end(); return; }
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) { const nf = join(DIST, '404.html'); res.writeHead(404, { 'Content-Type': TYPES['.html'] }); if (existsSync(nf)) createReadStream(nf).pipe(res); else res.end('Not found'); return; }
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=0, must-revalidate' };
  for (const r of rules) if (r.re.test(path)) Object.assign(headers, r.headers);
  const size = statSync(file).size;

  const accept = String(req.headers['accept-encoding'] || '');
  const enc = TEXT.test(type) && size > 1024 ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null) : null;
  if (enc) {
    const key = file + '|' + enc + '|' + statSync(file).mtimeMs; // a rebuild changes the file: never serve a stale compressed copy
    if (!compressed.has(key)) { const raw = readFileSync(file); compressed.set(key, enc === 'br' ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : gzipSync(raw, { level: 9 })); }
    const body = compressed.get(key);
    res.writeHead(200, { ...headers, 'Content-Encoding': enc, 'Content-Length': body.length, Vary: 'Accept-Encoding' });
    res.end(req.method === 'HEAD' ? undefined : body); return;
  }
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    end = Math.min(end, size - 1); start = Math.max(0, start);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file, { start, end }).pipe(res); return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`dist/ served like Cloudflare Pages at http://localhost:${PORT}/  (_headers: ${rules.length} rules, brotli, ranges)`));
