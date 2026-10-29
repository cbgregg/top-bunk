'use strict';
// Serves the repo root (index.html, js/, css/, assets/, vendor/) over the privileged app:// scheme.
// Plain Node, no Electron: desktop/check.js exercises it headlessly. Files stream from disk (or from
// app.asar when packaged; Electron patches fs for that), with the MIME types ES modules, import maps,
// fetch() and Web Audio need. Single byte ranges are honoured so <audio>/<video> seeking would work too.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', hdr: 'image/vnd.radiance', exr: 'image/x-exr', ktx2: 'image/ktx2',
  bin: 'application/octet-stream', wasm: 'application/wasm', drc: 'application/octet-stream',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
};

const mimeFor = (file) => MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';

// Maps a request URL onto a file under root; null when the path escapes root or the URL is malformed.
// A trailing slash means the directory's index.html. Query and hash are ignored.
function resolve(root, url) {
  let p;
  try { p = decodeURIComponent(new URL(url).pathname); } catch (e) { return null; }
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const file = path.resolve(root, '.' + path.posix.normalize('/' + p));
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return file;
}

// "bytes=a-b" | "bytes=a-" | "bytes=-n" -> { start, end } (inclusive), null for no/invalid header, 416 when unsatisfiable.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  let end = m[2] === '' || m[1] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 416;
  return { start, end };
}

const text = (status, body) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

// protocol.handle() callback: Request -> Response.
async function respond(root, request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed');
  let file = resolve(root, request.url);
  if (!file) return text(403, 'Forbidden');
  let st;
  try { st = await fs.promises.stat(file); } catch (e) { return text(404, 'Not found'); }
  if (st.isDirectory()) { file = path.join(file, 'index.html'); try { st = await fs.promises.stat(file); } catch (e) { return text(404, 'Not found'); } }
  const headers = { 'Content-Type': mimeFor(file), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const range = parseRange(request.headers.get('range'), st.size);
  if (range === 416) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
  let status = 200, opts;
  if (range) { status = 206; opts = range; headers['Content-Range'] = `bytes ${range.start}-${range.end}/${st.size}`; headers['Content-Length'] = String(range.end - range.start + 1); }
  else headers['Content-Length'] = String(st.size);
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  if (st.size === 0) return new Response(new Uint8Array(0), { status, headers });
  return new Response(Readable.toWeb(fs.createReadStream(file, opts)), { status, headers });
}

module.exports = { MIME, mimeFor, resolve, parseRange, respond };
