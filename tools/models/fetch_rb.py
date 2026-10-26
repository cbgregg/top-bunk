import sys, os, re, subprocess, urllib.request
from concurrent.futures import ThreadPoolExecutor
R = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Adults'
OUT = sys.argv[1]; names = sys.argv[2:]
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    with urllib.request.urlopen(url, timeout=120) as r, open(path, 'wb') as f: f.write(r.read())
def one(n):
    try:
        d = os.path.join(OUT, n); os.makedirs(d, exist_ok=True)
        fbx = os.path.join(OUT, n + '.fbx'); get(f'{R}/{n}/Export/{n}.fbx', fbx)
        m = re.search(rb'textures\\([mf]\d{3})_body_color', open(fbx, 'rb').read())
        code = m.group(1).decode()
        for t in ('body', 'head', 'opacity'):
            tga = os.path.join(d, f'{code}_{t}_color.tga'); get(f'{R}/{n}/Textures/{code}_{t}_color.tga', tga)
            if t == 'opacity': out, vf = os.path.join(d, f'{t}.png'), 'scale=1024:1024'
            else: out, vf = os.path.join(d, f'{t}.jpg'), 'scale=1024:1024'
            if not os.path.exists(out):
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tga, '-vf', vf, '-q:v', '3', out], check=True)
            os.remove(tga)
        return n, code
    except Exception as e:
        return n, 'FAIL ' + str(e)[:80]
with ThreadPoolExecutor(6) as p:
    for r in p.map(one, names): print(r, flush=True)
