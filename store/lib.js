'use strict';
// the static server the render scripts share: serves a folder on a local port, so the game and the templates load as they do in a browser
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.wasm': 'application/wasm', '.md': 'text/markdown',
};

// serve(port, { root, mounts, headers, rewrite }) resolves with the listening server.
//   mounts   { '/url/prefix/': 'folder' }: those urls are read from another folder
//   headers  added to every response
//   rewrite  (url, bytes) -> bytes or string, to change a file on its way out
function serve(port, { root, mounts = {}, headers = {}, rewrite = null }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      let base = root, rel = url;
      for (const [prefix, dir] of Object.entries(mounts)) {
        if (dir && url.startsWith(prefix)) { base = dir; rel = url.slice(prefix.length); }
      }
      let file = path.join(base, rel);
      if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
      if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
      fs.readFile(file, (err, bytes) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', ...headers });
        res.end(rewrite ? rewrite(url === '/' ? '/index.html' : url, bytes) : bytes);
      });
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { MIME, serve };
