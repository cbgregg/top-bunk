#!/usr/bin/env node
'use strict';
// `npm run smoke`: runs `electron . --smoke` with whatever this host needs, keeps the 90 s budget and
// exits 0 only on SMOKE_OK. On Linux without a display it wraps the run in xvfb-run; as root or in CI
// it adds --no-sandbox (Chromium refuses to start as root, and ubuntu-24.04 runners restrict user
// namespaces). Extra arguments are passed through to Electron.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const electron = require('electron');   // from Node this is the path to the Electron binary
const root = path.join(__dirname, '..');
const args = ['.', '--smoke', ...process.argv.slice(2)];
const linux = process.platform === 'linux';
const onPath = (bin) => (process.env.PATH || '').split(path.delimiter).some((d) => { try { return fs.statSync(path.join(d, bin)).isFile(); } catch (e) { return false; } });

if (linux && !args.includes('--no-sandbox') && ((process.getuid && process.getuid() === 0) || process.env.CI)) args.push('--no-sandbox');
let cmd = electron, argv = args;
if (linux && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  if (!onPath('xvfb-run')) { console.log('SMOKE_FAIL no display and no xvfb-run (apt install xvfb)'); process.exit(1); }
  cmd = 'xvfb-run'; argv = ['-a', '-s', '-screen 0 1280x720x24', electron, ...args];
}

const env = { ...process.env };
delete env.NODE_OPTIONS;   // Electron rejects most Node flags (e.g. --use-openssl-ca from a proxy setup) with a loud error
const child = spawn(cmd, argv, { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
child.stdout.on('data', (d) => { process.stdout.write(d); out += d; });
const killer = setTimeout(() => { console.log('SMOKE_FAIL wrapper timeout (100 s)'); child.kill('SIGKILL'); }, 100e3);
child.on('error', (e) => { clearTimeout(killer); console.log(`SMOKE_FAIL could not start ${cmd}: ${e.message}`); process.exit(1); });
child.on('exit', (code, signal) => {
  clearTimeout(killer);
  const ok = /^SMOKE_OK\b/m.test(out);
  if (!ok && !/^SMOKE_FAIL\b/m.test(out)) console.log(`SMOKE_FAIL electron exited (${signal || code}) without a verdict`);
  process.exit(ok && code === 0 ? 0 : 1);
});
