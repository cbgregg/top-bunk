#!/usr/bin/env node
// Puts sing_core.js and the demo song into robot-voice.html, so the page is one file that works from a server or opened
// straight from disk. Run it after changing sing_core.js:  node tools/build_robot_voice.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..');
const page = path.join(here, 'robot-voice.html');
const core = fs.readFileSync(path.join(here, 'sing_core.js'), 'utf8');
const names = [...core.matchAll(/^export (?:function|const|class) (\w+)/gm)].map((m) => m[1]);
const body = core.replace(/^export /gm, '');
const inlined = `const SingCore = (() => {\n${body}\nreturn { ${names.join(', ')} };\n})();`;
const song = fs.readFileSync(path.join(root, 'trailer/music/robot_song.json'), 'utf8');
const words = fs.readFileSync(path.join(root, 'trailer/music/robot_lyrics_example.txt'), 'utf8');
const demo = `const DEMO = ${JSON.stringify({ name: 'little-window', song: JSON.parse(song), words })};`;
const put = (html, mark, text) => {
  const a = `<!-- ${mark}:start -->`, b = `<!-- ${mark}:end -->`;
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`robot-voice.html has no ${mark} markers`);
  return html.slice(0, i + a.length) + '\n' + text.replace(/<\/script/gi, '<\\/script') + '\n' + html.slice(j);
};
let html = fs.readFileSync(page, 'utf8');
html = put(html, 'core', inlined);
html = put(html, 'demo', demo);
fs.writeFileSync(page, html);
console.log(`robot-voice.html: core ${(inlined.length / 1024).toFixed(0)} KB (${names.length} functions), demo ${(demo.length / 1024).toFixed(0)} KB`);
