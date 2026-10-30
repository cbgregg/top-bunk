import sys, os, re, subprocess, urllib.request
from concurrent.futures import ThreadPoolExecutor
R = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Adults'
OUT = sys.argv[1]; names = sys.argv[2:]
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    with urllib.request.urlopen(url, timeout=120) as r, open(path, 'wb') as f: f.write(r.read())
def shrink(src, dst, px):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-vf', f'scale={px}:{px}', '-q:v', '3', dst], check=True)
def one(n):
    try:
        d = os.path.join(OUT, n); os.makedirs(d, exist_ok=True)
        fbx = os.path.join(OUT, n + '.fbx'); get(f'{R}/{n}/Export/{n}.fbx', fbx)
        m = re.search(rb'textures\\([mf]\d{3})_body_color', open(fbx, 'rb').read())
        code = m.group(1).decode()
        for t in ('body', 'head', 'opacity'):
            out = os.path.join(d, f'{t}.png' if t == 'opacity' else f'{t}.jpg')
            if os.path.exists(out): continue
            tga = os.path.join(d, f'{code}_{t}_color.tga'); get(f'{R}/{n}/Textures/{code}_{t}_color.tga', tga)
            if t == 'opacity':
                # the hair cards get 512 px, by way of a 1024 px copy: the shipped models were made that way, so a rebuild matches them byte for byte
                big = os.path.join(d, 'opacity_1024.png'); shrink(tga, big, 1024); shrink(big, out, 512); os.remove(big)
            else: shrink(tga, out, 1024)
            os.remove(tga)
        return n, code
    except Exception as e:
        return n, 'FAIL ' + str(e)[:80]
with ThreadPoolExecutor(6) as p:
    for r in p.map(one, names): print(r, flush=True)
