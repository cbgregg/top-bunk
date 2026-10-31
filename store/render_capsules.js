#!/usr/bin/env node
'use strict';
// Renders every capsule template in store/capsules/ to store/out/ at exactly the size Steam wants, with Playwright at device scale 1.
//
//   node store/render_capsules.js                          -> store/out/*.png (+ .jpg / .ico where Steam wants those)
//   node store/render_capsules.js --only header,logo       -> some of them (substring match on the name)
//   node store/render_capsules.js --shots DIR --src DIR    -> take the screenshots / capsule sources from other folders (a preview set)
//   node store/render_capsules.js --port 8801 --out DIR
//
// The repo root is served on a local port so the templates reach css/fonts.css and store/screenshots/; the network is blocked, so a
// missing local font shows up as a fallback face. `icon` is the desktop app's icon (desktop/build/icon.png, which electron-builder
// turns into the .ico and .icns), not a Steam asset.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const opt = (name, def) => { const i = ARGS.indexOf('--' + name); return i >= 0 && ARGS[i + 1] && !ARGS[i + 1].startsWith('--') ? ARGS[i + 1] : def; };
const PORT = +opt('port', 8801);
const OUT = path.resolve(opt('out', path.join(__dirname, 'out')));
const SHOTS = opt('shots', '') && path.resolve(opt('shots', ''));
const SRC = opt('src', '') && path.resolve(opt('src', ''));
const ONLY = (opt('only', '') || '').split(',').filter(Boolean);

// name -> template, size, format. `scale` renders the same template at that zoom (Steam has doubled some capsules since the templates' base sizes).
const CAPSULES = [
  { name: 'header_capsule', file: 'header_capsule.html', w: 460, h: 215 },
  { name: 'header_capsule_2x', file: 'header_capsule.html', w: 460, h: 215, scale: 2 },
  { name: 'small_capsule', file: 'small_capsule.html', w: 462, h: 174 },
  { name: 'main_capsule', file: 'main_capsule.html', w: 616, h: 353 },
  { name: 'main_capsule_2x', file: 'main_capsule.html', w: 616, h: 353, scale: 2 },
  { name: 'vertical_capsule', file: 'vertical_capsule.html', w: 748, h: 896 },
  { name: 'library_capsule', file: 'library_capsule.html', w: 600, h: 900 },
  { name: 'library_header', file: 'header_capsule.html', w: 460, h: 215, scale: 2 },
  { name: 'library_hero', file: 'library_hero.html', w: 3840, h: 1240 },
  { name: 'library_logo', file: 'library_logo.html', w: 1280, h: 720, transparent: true },
  { name: 'page_background', file: 'page_background.html', w: 1438, h: 810 },
  { name: 'community_icon', file: 'community_icon.html', w: 184, h: 184, jpg: true },
  { name: 'client_icon', file: 'client_icon.html', w: 32, h: 32, ico: true },
  { name: 'icon', file: 'community_icon.html', w: 184, h: 184, scale: 1024 / 184, dir: path.join(ROOT, 'desktop', 'build') },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
function serve(port) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const url = decodeURIComponent(q.url.split('?')[0].split('#')[0]);
      let f = path.join(ROOT, url);
      if (SHOTS && url.startsWith('/store/screenshots/')) f = path.join(SHOTS, url.slice('/store/screenshots/'.length));
      if (SRC && url.startsWith('/store/capsules/src/')) f = path.join(SRC, url.slice('/store/capsules/src/'.length));
      if (!f.startsWith(ROOT) && !(SHOTS && f.startsWith(SHOTS)) && !(SRC && f.startsWith(SRC))) { r.writeHead(403); r.end(); return; }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
    }).listen(port, '127.0.0.1', () => res(s));
  });
}

// a .ico that wraps the 32x32 PNG as-is (Windows has read PNG-compressed icons since Vista; it is what electron-builder and Steam accept)
function icoFromPng(png) {
  const head = Buffer.alloc(6 + 16);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

(async () => {
  const list = CAPSULES.filter((c) => !ONLY.length || ONLY.some((o) => c.name.includes(o)));
  if (!list.length) { console.error('no capsule matches', ONLY); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, 'css', 'fonts.css'))) console.log('warning: css/fonts.css is missing, the title will render in a fallback face');
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());   // (local only: no Google Fonts, no anything)
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  const missing = new Set();
  page.on('response', (r) => { if (r.status() === 404) missing.add(r.url().replace(/^https?:\/\/[^/]+/, '')); });
  let bad = 0;
  for (const c of list) {
    const scale = c.scale || 1, W = Math.round(c.w * scale), H = Math.round(c.h * scale);
    await page.setViewportSize({ width: W, height: H });
    await page.goto(`http://127.0.0.1:${PORT}/store/capsules/${c.file}${scale !== 1 ? `?s=${scale}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
    await page.waitForTimeout(150);
    const ext = c.jpg ? 'jpg' : 'png', out = path.join(c.dir && !opt('out', '') ? c.dir : OUT, `${c.name}.${ext}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const buf = await page.screenshot(c.jpg ? { type: 'jpeg', quality: 92 } : { type: 'png', omitBackground: !!c.transparent });
    fs.writeFileSync(out, buf);
    let size = [W, H];
    if (!c.jpg) { size = pngSize(buf); if (size[0] !== W || size[1] !== H) { bad++; console.log('SIZE MISMATCH', c.name, size); } }
    if (c.ico) fs.writeFileSync(path.join(OUT, `${c.name}.ico`), icoFromPng(buf));
    console.log(`${path.relative(ROOT, out)}${c.ico ? ' + .ico' : ''}  ${size[0]}x${size[1]}${c.transparent ? '  (transparent)' : ''}`);
  }
  await browser.close(); srv.close();
  if (missing.size) console.log('missing files (a template fell back or showed nothing):', [...missing].join(', '));
  if (bad) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
