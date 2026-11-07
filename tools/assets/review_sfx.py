#!/usr/bin/env python3
"""A review of the recorded library's takes: for each key, every take's length, peak, loudness, the band its energy sits in, and whether
any stretch of it is silent or clipped. The numbers the "Reviewed takes" section of assets/sfx/lib/SOURCES.md stands on.

  python3 tools/assets/review_sfx.py                 every key in assets/sfx/lib.json
  python3 tools/assets/review_sfx.py rattle floor_slap

A take is flagged when it is shorter than 40 ms, when its loudest tenth of a second is under -40 dBFS (nothing in it), when more than a
fifth of it is dead silence (a cut that caught the gap between takes), or when it clips (over 1 % of its samples at full scale).
"""
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SR = 44100


def decode(path):
  out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
  return np.frombuffer(out, dtype=np.float32)


def db(x): return 20 * np.log10(max(x, 1e-9))


def review(path):
  x = decode(path); n = len(x)
  if n < 1: return {'len': 0, 'flags': ['empty']}
  w = max(1, SR // 10); hop = max(1, w // 4)
  rms = [np.sqrt(np.mean(x[i:i + w] ** 2)) for i in range(0, max(1, n - w + 1), hop)]
  loud = max(rms); quiet = sum(1 for r in rms if r < 10 ** (-60 / 20)) / len(rms)
  peak = float(np.abs(x).max()); clip = float(np.mean(np.abs(x) > 0.985))
  # where the energy sits: the frequency under which half of it lies, and the band holding the middle 80 %
  spec = np.abs(np.fft.rfft(x * np.hanning(n))) ** 2; f = np.fft.rfftfreq(n, 1 / SR); c = np.cumsum(spec) / spec.sum()
  lo, mid, hi = f[np.searchsorted(c, 0.1)], f[np.searchsorted(c, 0.5)], f[np.searchsorted(c, 0.9)]
  flags = []
  if n < 0.04 * SR: flags.append('short')
  if db(loud) < -40: flags.append('silent')
  if quiet > 0.2 and n > SR: flags.append(f'{quiet * 100:.0f}% dead')
  if clip > 0.01: flags.append('clips')
  return {'len': n / SR, 'peak': db(peak), 'loud': db(loud), 'rms': db(float(np.sqrt(np.mean(x ** 2)))), 'band': (lo, mid, hi), 'flags': flags}


def main():
  lib = json.load(open(os.path.join(ROOT, 'assets', 'sfx', 'lib.json')))
  keys = sys.argv[1:] or sorted(lib)
  bad = 0
  for key in keys:
    m = lib.get(key)
    if not m: print(f'{key}: not in lib.json'); bad += 1; continue
    print(f'{key} ({len(m["files"])} takes, {"loop" if m.get("loop") else "hit"})')
    for f in m['files']:
      p = os.path.join(ROOT, f)
      if not os.path.exists(p): print(f'  {os.path.basename(f):24s} MISSING'); bad += 1; continue
      r = review(p)
      lo, mid, hi = r['band']
      print(f'  {os.path.basename(f):24s} {r["len"]:6.2f} s  peak {r["peak"]:6.1f} dB  loudest {r["loud"]:6.1f} dB  rms {r["rms"]:6.1f} dB  band {lo:5.0f}-{mid:5.0f}-{hi:5.0f} Hz  {" ".join(r["flags"])}')
      bad += bool(r['flags'])
  print(f'{bad} take(s) flagged' if bad else 'nothing flagged')
  sys.exit(1 if bad else 0)


if __name__ == '__main__':
  main()
