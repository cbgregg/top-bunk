#!/usr/bin/env python3
"""Recorded sound effects for the house, from BigSoundBank (Joseph Sardin, CC0 1.0: https://bigsoundbank.com/licenses.html).

  python3 tools/assets/fetch_sfx.py            fetch, cut and encode everything into assets/sfx/lib/, and write assets/sfx/lib.json
  python3 tools/assets/fetch_sfx.py --only creak,door_creak

Every sound's own page is read first and the sound is used only if the page says
"CC0 (public domain): Free and royalty-free"; anything else is skipped and reported.
The originals (FLAC) are cached in tools/assets/.cache/bsb/ (not committed).

Each recipe line is (bigsoundbank id, mode, args):
  whole            the whole file, silence trimmed off both ends
  split n          the takes in the file cut apart at its silences, up to n of them
  onsets n len gap the n strongest hits in a continuous recording (steps, heartbeats), len seconds from each, at least gap apart
  cut start dur    one stretch of the file, from start (s; negative counts back from the end), dur seconds long
  loop start dur   a stretch made seamless (its end crossfaded into its start), for beds
and an optional dict of extras: rate (playback speed, so pitch), rev (reversed), lp / hp (filter Hz), gain (dB).
"""
import json, os, re, subprocess, sys, urllib.request, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'sfx', 'lib')
CACHE = os.path.join(ROOT, 'tools', 'assets', '.cache', 'bsb')
UA = {'User-Agent': 'curl/8.5'}   # the site answers a plain client
SR = 44100

# kind: 'bed' loops (stereo, -23 LUFS) or 'hit' one-shots (mono, peak -1 dBTP)
LIB = {
  # ---- house foley ----
  'creak':        ('hit', [(i, 'whole', ()) for i in range(3051, 3061)] + [('0518', 'split', (8,))]),
  'creak_heavy':  ('hit', [('0518', 'split', (6,), {'rate': 0.8, 'lp': 2500}), (3053, 'whole', (), {'rate': 0.75}), (3060, 'whole', (), {'rate': 0.7})]),
  'door_creak':   ('hit', [(i, 'whole', ()) for i in range(3205, 3212)] + [('0302', 'whole', ()), ('0306', 'whole', ())]),
  'door_open':    ('hit', [(1702, 'whole', ()), (1703, 'whole', ()), ('0224', 'split', (5,))]),
  'door_close':   ('hit', [(1704, 'onsets', (1, 1.4, 1)), (1500, 'onsets', (1, 1.4, 1), {'rate': 0.8}), (1704, 'onsets', (1, 1.4, 1), {'rate': 0.9})]),   # from the moment it meets the frame
  'door_slam':    ('hit', [('0103', 'onsets', (1, 2.2, 1)), ('0223', 'whole', ()), (1501, 'whole', ())]),
  'door_lock':    ('hit', [('0037', 'whole', ()), (1320, 'cut', (0, 2.2))]),
  'knock':        ('hit', [('0015', 'split', (6,)), ('0374', 'cut', (2.2, 4.8))]),
  'cabinet':      ('hit', [('0046', 'split', (4,)), ('0787', 'split', (4,))]),
  'drawer':       ('hit', [(1499, 'whole', ()), (1500, 'whole', ()), (1267, 'split', (4,))]),
  'switch':       ('hit', [('0026', 'split', (4,)), ('0540', 'split', (6,)), ('0321', 'split', (5,))]),
  'breaker':      ('hit', [(1092, 'split', (4,)), (3061, 'whole', ()), (3062, 'whole', ()), (3063, 'whole', ())]),
  'fridge_door':  ('hit', [(1158, 'split', (4,))]),
  'washer_lid':   ('hit', [('0809', 'split', (4,))]),
  'metal_tap':    ('hit', [('0053', 'split', (6,))]),
  'chair_scrape': ('hit', [('0666', 'split', (6,)), ('0516', 'cut', (0, 3))]),
  'toy_squeak':   ('hit', [('0879', 'split', (4,)), ('0364', 'whole', ())]),
  'crayon':       ('hit', [(3233, 'onsets', (2, 1.4, 2), {'rate': 0.85}), (3234, 'onsets', (2, 1.4, 2), {'rate': 0.85}), (3235, 'onsets', (2, 1.4, 2), {'rate': 0.85}), ('0541', 'cut', (2, 2))]),
  'page_turn':    ('hit', [(2210, 'whole', ()), (2212, 'whole', ()), (2213, 'whole', ()), (2214, 'whole', ()), (2216, 'whole', ()), ('0164', 'whole', ()), ('0362', 'whole', ())]),
  'paper_tear':   ('hit', [(1225, 'whole', ()), (3239, 'whole', ()), (3241, 'whole', ())]),
  'cloth':        ('hit', [(1104, 'split', (5,)), ('0399', 'cut', (2, 3))]),
  'cloth_tear':   ('hit', [('0013', 'split', (4,))]),
  'match':        ('hit', [('0004', 'split', (2,)), (1271, 'cut', (4, 4))]),
  # the grandfather clock. 3360 and 3361 are the works releasing (a clunk and a whir) and then the bell
  'clock_gear':   ('hit', [(3360, 'cut', (0, 2.9)), (3361, 'cut', (0, 2.4))]),
  'clock_strike': ('hit', [(3360, 'cut', (2.95, 7.5)), (3361, 'cut', (3.95, 12)), (1568, 'cut', (3.55, 9.5))]),   # one bell each: the game strikes the count itself
  'clock_tick':   ('hit', [(1567, 'onsets', (14, 0.4, 0.6))]),                # single beats of the pendulum
  'clock_works':  ('hit', [(3357, 'cut', (0, 4)), (3358, 'cut', (0, 4)), (3359, 'whole', ())]),
  'drip':         ('hit', [(1384, 'split', (8,)), (1383, 'split', (6,))]),
  # ---- the phone, the tv, the radio ----
  'phone_ring':   ('hit', [(3301, 'split', (4,)), ('0001', 'cut', (0, 9))]),
  'phone_hangup': ('hit', [('0001', 'cut', (22.5, 4.5)), (2645, 'whole', ())]),
  'dial_tone':    ('bed', [('0766', 'loop', (0.3, 3.2))]),
  'busy_tone':    ('hit', [(1610, 'cut', (0, 4))]),
  'crt_off':      ('hit', [(1783, 'whole', ()), (1784, 'whole', ()), (1785, 'whole', ()), (1786, 'whole', ())]),
  'zap':          ('hit', [(2134, 'whole', ())]),
  'radio_static': ('hit', [('0312', 'whole', ()), ('0313', 'whole', ()), ('0310', 'cut', (0, 4)), (2512, 'cut', (0, 4))]),
  'radio_tune':   ('hit', [(2617, 'whole', ()), (2618, 'cut', (0, 6))]),
  # ---- the camera ----
  'shutter':      ('hit', [(2821, 'whole', ()), (2822, 'whole', ()), (3022, 'whole', ())]),
  'winder':       ('hit', [(1674, 'split', (4,))]),
  # ---- feet ----
  'step_wood':    ('hit', [('0165', 'split', (12,)), ('0373', 'split', (10,), {'gain': 2})]),
  'step_carpet':  ('hit', [('0373', 'split', (10,), {'lp': 900, 'gain': 3}), ('0181', 'split', (8,), {'lp': 1100})]),
  'step_tile':    ('hit', [('0606', 'split', (10,)), ('0514', 'split', (6,), {'rate': 0.9})]),
  'step_gravel':  ('hit', [('0510', 'split', (8,)), ('0085', 'split', (4,)), (3216, 'split', (8,))]),
  'step_grass':   ('hit', [('0854', 'onsets', (8, 0.45, 0.4)), (1253, 'onsets', (8, 0.45, 0.4))]),
  'step_stairs':  ('hit', [('0181', 'split', (10,)), (3212, 'split', (6,))]),
  'step_heavy':   ('hit', [('0165', 'split', (8,), {'rate': 0.72, 'lp': 900, 'gain': 3})]),
  # ---- body ----
  'breath':       ('hit', [(2195, 'onsets', (8, 2.4, 2.6)), (1404, 'cut', (0, 4.4)), (1405, 'cut', (0, 4.4))]),
  'heartbeat':    ('hit', [('0243', 'whole', ()), ('0244', 'whole', ()), ('0218', 'onsets', (6, 0.75, 0.8))]),
  'whisper':      ('hit', [(3255, 'split', (6,)), (3256, 'split', (6,))]),
  # ---- the thing ----
  'bone_crack':   ('hit', [('0596', 'split', (8,)), (1408, 'whole', ()), (1409, 'whole', ()), (2593, 'whole', ()), (2594, 'whole', ()), (2595, 'whole', ()), (2596, 'whole', ())]),
  'wet_click':    ('hit', [(2582, 'whole', (), {'lp': 3000}), (2583, 'whole', (), {'lp': 3000}), (2588, 'cut', (0, 3), {'lp': 3000}), (2598, 'whole', (), {'lp': 3000}), (2602, 'whole', (), {'lp': 3000}), ('0334', 'whole', ())]),
  'wall_knock':   ('hit', [(1427, 'cut', (0, 4), {'lp': 600, 'gain': 4}), (1429, 'cut', (0, 4), {'lp': 600, 'gain': 4}), ('0015', 'split', (4,), {'lp': 450, 'gain': 6})]),
  'wall_scratch': ('hit', [('0663', 'cut', (2, 5), {'lp': 1800, 'gain': 4}), ('0541', 'cut', (8, 4), {'lp': 1400, 'gain': 3})]),
  'crawl':        ('hit', [(1318, 'cut', (4, 5), {'rate': 1.15, 'lp': 1400}), (1254, 'cut', (2, 5), {'lp': 1200}), (1104, 'cut', (0, 4), {'rate': 1.3})]),
  'drag':         ('hit', [(1104, 'cut', (0, 5), {'rate': 0.7, 'lp': 1500}), ('0858', 'cut', (2, 4), {'rate': 0.6, 'lp': 1200})]),
  # ---- stingers and textures ----
  'bowed_metal':  ('hit', [(1483, 'cut', (0, 10), {'rate': 0.45}), (1482, 'cut', (0, 10), {'rate': 0.5})]),                   # a gong slowed into a long, low ring
  'metal_swell':  ('hit', [(1482, 'cut', (-9, 9), {'rate': 0.5, 'rev': True}), (1485, 'cut', (-9, 9), {'rate': 0.4, 'rev': True})]),   # the same, reversed: it rises into a hit
  'sub_rumble':   ('hit', [(3113, 'cut', (0, 10), {'rate': 0.5, 'lp': 160}), (3114, 'cut', (0, 10), {'rate': 0.5, 'lp': 160})]),
  'thunder':      ('hit', [(2718, 'whole', ()), (3113, 'whole', ()), (3114, 'whole', ()), (3115, 'whole', ()), (3116, 'whole', ()), (3179, 'whole', ()), (3180, 'whole', ()), (3181, 'whole', ()), (3184, 'whole', ())]),
  # ---- outside ----
  'car_pass':     ('hit', [(i, 'whole', ()) for i in range(2990, 2997)]),
  'dog_far':      ('hit', [(2352, 'whole', (), {'lp': 1600}), (2353, 'cut', (0, 6), {'lp': 1600}), ('0288', 'cut', (0, 4), {'lp': 1400})]),
  'owl':          ('hit', [(1763, 'whole', ()), (1764, 'whole', ()), (3459, 'whole', ()), (3460, 'whole', ())]),
  # ---- beds ----
  'bed_house':    ('bed', [(2458, 'loop', (10, 40))]),
  'bed_fridge':   ('bed', [(1157, 'loop', (4, 28))]),
  'bed_heater':   ('bed', [('0203', 'loop', (30, 30))]),
  'bed_vent':     ('bed', [('0174', 'loop', (4, 26))]),
  'bed_drip':     ('bed', [(1386, 'loop', (1, 18))]),
  'bed_tick':     ('bed', [(2816, 'loop', (2, 24))]),
  'bed_wind_in':  ('bed', [('0147', 'loop', (10, 40))]),
  'bed_storm_in': ('bed', [(1714, 'loop', (10, 40))]),
  'bed_rain':     ('bed', [(1019, 'loop', (10, 40))]),
  'bed_rain_glass': ('bed', [(1297, 'loop', (10, 40))]),
  'bed_night':    ('bed', [('0110', 'loop', (5, 40))]),
  'bed_crickets': ('bed', [('0426', 'loop', (1, 18))]),
  'bed_road':     ('bed', [('0621', 'loop', (5, 40))]),
  'bed_buzz':     ('bed', [(2118, 'loop', (1, 8))]),
  'bed_chimes':   ('bed', [(2687, 'loop', (20, 40))]),
  'bed_snore':    ('bed', [('0170', 'loop', (0, 40))]),
}


def get(url):
  return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def licence(i):
  """the sound's page: its title, and whether it says CC0"""
  s = get(f'https://bigsoundbank.com/x-s{i}.html').decode('utf8', 'ignore')
  t = re.search(r'<title>([^<]+?)\s*—', s)
  return (t.group(1).strip() if t else f'#{i}'), 'CC0 (public domain): Free and royalty-free' in s


def source(i):
  os.makedirs(CACHE, exist_ok=True)
  for ext in ('flac', 'ogg', 'mp3'):   # the best copy the site has (not every sound has every format)
    p = os.path.join(CACHE, f'{i}.{ext}')
    if os.path.exists(p): return p
    try: data = get(f'https://bigsoundbank.com/UPLOAD/{ext}/{i}.{ext}')
    except Exception: continue
    open(p, 'wb').write(data); return p
  raise IOError(f'no download for {i}')


def decode(path, ch, extras):
  af = []
  if extras.get('rate'): af.append(f"asetrate={SR}*{extras['rate']},aresample={SR}")
  if extras.get('hp'): af.append(f"highpass=f={extras['hp']}")
  if extras.get('lp'): af.append(f"lowpass=f={extras['lp']}")
  if extras.get('rev'): af.append('areverse')
  cmd = ['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', str(SR)] + (['-af', ','.join(af)] if af else []) + ['-f', 'f32le', '-']
  return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, ch).copy()


def env(x, win=0.01):
  n = max(1, int(SR * win)); e = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(n) / n, 'same')); return e


def trim(x, thr_db=-50):
  e = env(x); thr = max(e.max() * 10 ** (thr_db / 20), 1e-5); idx = np.where(e > thr)[0]
  if not len(idx): return x
  a, b = max(0, idx[0] - int(0.01 * SR)), min(len(x), idx[-1] + int(0.05 * SR))
  return x[a:b]


def takes(x, n):
  """the takes in a file, cut at the gaps between them"""
  e = env(x, 0.02); thr = e.max() * 10 ** (-32 / 20); on = e > thr
  segs, i = [], 0
  while i < len(on):
    if on[i]:
      j = i
      while j < len(on) and (on[j] or (j + int(0.12 * SR) < len(on) and on[j:j + int(0.12 * SR)].any())): j += 1
      if j - i > 0.06 * SR: segs.append((max(0, i - int(0.015 * SR)), min(len(x), j + int(0.06 * SR))))
      i = j
    i += 1
  segs = sorted(segs, key=lambda s: -(env(x[s[0]:s[1]]).max()))[:n]
  return [x[a:b] for a, b in sorted(segs)]


def onsets(x, n, length, gap):
  """the strongest attacks, at least gap seconds apart, length seconds from each"""
  e = env(x, 0.03); d = np.diff(e, prepend=e[0]); floor = np.percentile(e, 30)
  w, out = int(gap * SR), []
  for i in np.argsort(-d):
    if e[min(len(e) - 1, i + int(0.05 * SR))] < floor * 2.5: continue   # a rise out of the room tone, not a wobble in it
    if any(abs(i - j) < w for j in out): continue
    out.append(i)
    if len(out) >= n: break
  return [x[max(0, i - int(0.015 * SR)):i + int(length * SR)] for i in sorted(out)]


def fade(x, a=0.006, b=0.02):
  x = x.copy(); na, nb = min(len(x) // 3, int(a * SR)), min(len(x) // 3, int(b * SR))
  if na: x[:na] *= np.linspace(0, 1, na)[:, None]
  if nb: x[-nb:] *= np.linspace(1, 0, nb)[:, None]
  return x


def looped(x, xf=2.0):
  n = min(int(xf * SR), len(x) // 4); body, tail = x[:-n].copy(), x[-n:]
  w = np.linspace(0, 1, n)[:, None]
  body[:n] = body[:n] * w + tail * (1 - w)
  return body


def encode(x, path, kind, gain_db=0):
  x = x * (10 ** (gain_db / 20))
  tmp = path + '.wav'
  with wave.open(tmp, 'wb') as w:
    w.setnchannels(x.shape[1]); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
  if kind == 'bed':
    af = 'loudnorm=I=-23:TP=-1:LRA=11,aresample=44100'; br = '96k'
  else:
    af = 'loudnorm=I=-20:TP=-1:LRA=20,aresample=44100' if len(x) > SR * 3 else 'alimiter=limit=0.89:level=false,aresample=44100'; br = '80k'
  subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', af, '-c:a', 'libmp3lame', '-b:a', br, path], check=True)
  os.remove(tmp)


def peak_norm(x, db=-1.0):
  p = np.abs(x).max()
  return x * (10 ** (db / 20) / p) if p > 0 else x


def write_sources(credits):
  """assets/sfx/lib/SOURCES.md: every recording used, its page and the keys made from it"""
  used = {}
  for key, (_, recipe) in LIB.items():
    for e in recipe: used.setdefault(str(e[0]).zfill(4), []).append(key)
  lines = ['# Sound sources', '', 'Every file in this folder is cut from a recording by Joseph Sardin on [BigSoundBank](https://bigsoundbank.com),',
           'released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain, no attribution required; credited anyway).',
           'Made by `tools/assets/fetch_sfx.py`, which checks each page for the CC0 notice before using a sound.', '',
           '| # | Recording | Used for |', '|---|---|---|']
  for sid in sorted(credits):
    if sid in used: lines.append(f'| {sid} | [{credits[sid]}](https://bigsoundbank.com/x-s{sid}.html) | {", ".join(sorted(set(used[sid])))} |')
  open(os.path.join(OUT, 'SOURCES.md'), 'w').write('\n'.join(lines) + '\n')


def main():
  only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
  os.makedirs(OUT, exist_ok=True)
  manifest_path = os.path.join(ROOT, 'assets', 'sfx', 'lib.json')
  manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
  cpath = os.path.join(CACHE, 'credits.json')
  credits, refused = (json.load(open(cpath)) if os.path.exists(cpath) else {}), []
  for key, (kind, recipe) in LIB.items():
    if only and key not in only: continue
    files = []
    for f in os.listdir(OUT):
      if re.fullmatch(re.escape(key) + r'_\d\d\.mp3', f): os.remove(os.path.join(OUT, f))
    for entry in recipe:
      i, mode, args = entry[0], entry[1], entry[2]; extras = entry[3] if len(entry) > 3 else {}
      sid = str(i).zfill(4)
      try:
        title, ok = licence(sid)
      except Exception as e:
        refused.append(f'{sid}: page not reachable ({e})'); continue
      if not ok: refused.append(f'{sid} {title}: not marked CC0'); continue
      try: x = decode(source(sid), 2 if kind == 'bed' else 1, extras)
      except Exception as e: refused.append(f'{sid} {title}: {e}'); continue
      credits[sid] = title
      if mode == 'whole': parts = [trim(x)]
      elif mode == 'split': parts = takes(x, args[0])
      elif mode == 'onsets': parts = onsets(x, *args)
      elif mode == 'cut':
        a = args[0] if args[0] >= 0 else len(x) / SR + args[0]   # a negative start counts back from the end
        parts = [trim(x[int(a * SR):int((a + args[1]) * SR)])]
      else: parts = [looped(x[int(args[0] * SR):int((args[0] + args[1] + 2) * SR)])]
      for p in parts:
        if len(p) < 0.04 * SR: continue
        if kind == 'hit': p = fade(peak_norm(p))
        name = f'{key}_{len(files) + 1:02d}.mp3'
        encode(p, os.path.join(OUT, name), kind, extras.get('gain', 0) if kind == 'bed' else 0)
        files.append(f'assets/sfx/lib/{name}')
    manifest[key] = {'kind': 'noise' if kind == 'bed' else 'sfx', 'loop': kind == 'bed', 'files': files}
    print(f'{key:16s} {len(files):3d}', flush=True)
  json.dump(manifest, open(manifest_path, 'w'), indent=1)
  json.dump(credits, open(cpath, 'w'), indent=1)
  write_sources(credits)
  for r in refused: print('skipped', r)


if __name__ == '__main__':
  main()
