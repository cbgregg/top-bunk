#!/usr/bin/env python3
"""Fetch the CC0 PBR materials the game uses (Poly Haven and ambientCG) and pack each into three small WebP files:

    python3 tools/assets/fetch_pbr.py [--only floor] [--force]

assets/pbr/<name>_c.webp  colour (sRGB)
assets/pbr/<name>_n.webp  normal map (OpenGL, +Y up)
assets/pbr/<name>_a.webp  packed: R = ambient occlusion, G = roughness, B = metalness (what three.js reads)
assets/pbr/pbr.json       real-world size of one tile in metres, which the game uses to scale the texture

Both libraries are CC0: no attribution is required, but see CREDITS.md. Needs Python 3, Pillow.
"""
import io, json, os, sys, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'pbr')
UA = {'User-Agent': 'Mozilla/5.0'}

# name: (source, id, size in px, tile size in metres or None to use the library's value)
SETS = {
    'floor':    ('ph', 'wood_floor_worn', 1024, None),
    'roof':     ('ph', 'grey_roof_01', 1024, None),
    'siding':   ('acg', 'Planks022', 1024, 1.2),
    'concrete': ('ph', 'concrete_floor_worn_001', 512, None),
    'darkwood': ('ph', 'dark_wooden_planks', 512, None),
    'pine':     ('ph', 'coated_pine', 512, None),
    'plaid':    ('ph', 'gingham_check', 512, None),
    'linen':    ('ph', 'rough_linen', 512, None),
    'dirt':     ('ph', 'brown_mud_dry', 1024, None),
    'metal':    ('ph', 'rusty_metal_02', 512, None),
    'ceiling':  ('ph', 'white_stucco', 512, None),
    'wall':     ('acg', 'PaintedPlaster017', 1024, 1.8),
    'grass':    ('acg', 'Grass004', 1024, 2.0),
    'tile':     ('acg', 'Tiles105', 512, 0.9),
    'carpet':   ('acg', 'Carpet012', 512, 0.8),
    'panel':    ('ph', 'coated_pine', 512, 0.6),
}


def get(u, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read()
        except Exception:
            if i == tries - 1: raise


def img(b, mode='RGB'): return Image.open(io.BytesIO(b)).convert(mode)


def save(im, path, size, q):
    if im.size != (size, size): im = im.resize((size, size), Image.LANCZOS)
    im.save(path, 'WEBP', quality=q, method=6)


def pack_arm(ao, rough, metal, size):
    n = lambda im: im.resize((size, size), Image.LANCZOS).convert('L')
    z = Image.new('L', (size, size), 0)
    return Image.merge('RGB', (n(ao) if ao else Image.new('L', (size, size), 255), n(rough) if rough else Image.new('L', (size, size), 200), n(metal) if metal else z))


def ph(id_, size, name):
    f = json.loads(get(f'https://api.polyhaven.com/files/{id_}'))
    info = json.loads(get(f'https://api.polyhaven.com/info/{id_}'))
    pick = lambda k: (f.get(k, {}).get('1k') or f[k]['2k'])['jpg']['url']
    c, n = img(get(pick('Diffuse'))), img(get(pick('nor_gl')))
    arm = img(get(pick('arm'))) if 'arm' in f else None
    if arm is None:
        arm = pack_arm(img(get(pick('AO')), 'L') if 'AO' in f else None, img(get(pick('Rough')), 'L') if 'Rough' in f else None, None, size)
    return c, n, arm, info['dimensions'][0] / 1000.0


def acg(id_, size, name):
    z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={id_}_1K-JPG.zip')))
    find = lambda s: next((n for n in z.namelist() if n.endswith(s)), None)
    rd = lambda s, m='RGB': Image.open(io.BytesIO(z.read(find(s)))).convert(m) if find(s) else None
    return rd('_Color.jpg'), rd('_NormalGL.jpg'), pack_arm(rd('_AmbientOcclusion.jpg', 'L'), rd('_Roughness.jpg', 'L'), rd('_Metalness.jpg', 'L'), size), None


# colour maps recoloured to a target average colour (keeps the texture's light/dark detail): the carpet is dark brown
RECOLOR = {'carpet': (104, 74, 52), 'panel': (214, 168, 112)}


def recolor(c, rgb):
    from PIL import ImageStat
    g = c.convert('L'); m = ImageStat.Stat(g).mean[0] or 1
    k = [v / 255.0 for v in rgb]
    ch = [g.point(lambda p, kk=kk: min(255, int(p / m * 255 * kk))) for kk in k]
    return Image.merge('RGB', ch)


def one(name):
    src, id_, size, tile = SETS[name]
    c, n, a, dim = (ph if src == 'ph' else acg)(id_, size, name)
    if name in RECOLOR: c = recolor(c, RECOLOR[name])
    save(c, os.path.join(OUT, f'{name}_c.webp'), size, 80)
    save(n, os.path.join(OUT, f'{name}_n.webp'), size, 88)
    save(a, os.path.join(OUT, f'{name}_a.webp'), size, 80)
    return name, tile or dim


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    meta_path = os.path.join(OUT, 'pbr.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    jobs = [n for n in SETS if (not only or n == only) and (force or not os.path.exists(os.path.join(OUT, n + '_c.webp')))]
    with ThreadPoolExecutor(4) as pool:
        for name, tile in pool.map(one, jobs):
            meta[name] = round(float(tile), 3); print(name, meta[name], 'm', flush=True)
    json.dump(meta, open(meta_path, 'w'), indent=1); open(meta_path, 'a').write('\n')


if __name__ == '__main__':
    main()
