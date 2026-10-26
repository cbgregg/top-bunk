#!/usr/bin/env python3
"""Fetch the CC0 props the game uses from Poly Haven and shrink each into one small GLB.

    python3 tools/assets/fetch_models.py [--only sofa] [--force]

Needs gltf-transform (npm i -g @gltf-transform/cli) and sharp for the WebP textures; set GLTF_TRANSFORM to its path if it isn't on PATH.
Writes assets/props/<name>.glb (meshopt-compressed geometry, WebP textures), which the game loads with GLTFLoader + MeshoptDecoder.
"""
import json, os, shutil, subprocess, sys, tempfile, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'props')
UA = {'User-Agent': 'Mozilla/5.0'}
GT = os.environ.get('GLTF_TRANSFORM', 'gltf-transform')

# name: (Poly Haven id, texture size in px[, simplify ratio]). The trees are photogrammetry-grade (millions of triangles): they are simplified hard.
MODELS = {
    # interior
    'sofa': ('Sofa_01', 1024), 'armchair': ('ArmChair_01', 1024), 'tv': ('Television_01', 1024), 'rocker': ('Rockingchair_01', 1024),
    'cabinet': ('vintage_cabinet_01', 1024), 'drawers': ('vintage_wooden_drawer_01', 1024), 'cabinet_blue': ('painted_wooden_cabinet_02', 1024),
    'stove': ('electric_stove', 1024), 'chair': ('painted_wooden_chair_01', 512), 'table_round': ('round_wooden_table_01', 512),
    'table': ('WoodenTable_01', 512), 'coffee_table': ('coffee_table_round_01', 512), 'lamp': ('vintage_oil_lamp', 512),
    'plant1': ('potted_plant_01', 512), 'plant2': ('potted_plant_02', 512),
    'clock_mantel': ('mantel_clock_01', 512), 'clock_grandfather': ('vintage_grandfather_clock_01', 1024), 'clock_wall': ('wall_clock', 512),
    'frame1': ('hanging_picture_frame_01', 512), 'frame2': ('hanging_picture_frame_02', 512), 'frame3': ('hanging_picture_frame_03', 512),
    'kettle': ('vintage_electric_kettle', 512), 'pot': ('brass_pot_01', 512), 'books': ('decorative_book_set_01', 512), 'pillows': ('throw_pillows_01', 512),
    # outdoors (the conifer models are photogrammetry-grade and don't survive simplification, so the forest stays procedural)
    'tree_small': ('tree_small_02', 1024, 0.015), 'shrub2': ('shrub_02', 512), 'grass1': ('grass_medium_01', 512, 0.05), 'grass2': ('grass_medium_02', 512, 0.15),
    'rock1': ('boulder_01', 512, 0.08), 'rock2': ('rock_07', 512, 0.1), 'stump': ('tree_stump_01', 512),
}


def get(u, tries=3):
    for i in range(tries):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=180).read()
        except Exception:
            if i == tries - 1: raise


def one(name):
    id_, size, *r = MODELS[name]; ratio = r[0] if r else None
    files = json.loads(get(f'https://api.polyhaven.com/files/{id_}')).get('gltf')
    if not files: return name, 'FAIL no glTF for ' + id_
    res = files.get('1k') or files['2k']; g = res['gltf']
    tmp = tempfile.mkdtemp(prefix='ph_')
    try:
        main = os.path.join(tmp, id_ + '.gltf'); open(main, 'wb').write(get(g['url']))
        for rel, v in g['include'].items():
            p = os.path.join(tmp, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'wb').write(get(v['url']))
        out = os.path.join(OUT, name + '.glb')
        simp = ['--simplify', 'true', '--simplify-ratio', str(ratio), '--simplify-error', '0.02'] if ratio else ['--simplify', 'false']
        subprocess.run([GT, 'optimize', main, out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', str(size), *simp],
                       check=True, capture_output=True)
        return name, os.path.getsize(out)
    except subprocess.CalledProcessError as e:
        return name, 'FAIL ' + (e.stderr or b'').decode()[-200:]
    except Exception as e:
        return name, 'FAIL ' + str(e)[:200]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    jobs = [n for n in MODELS if (not only or n == only) and (force or not os.path.exists(os.path.join(OUT, n + '.glb')))]
    with ThreadPoolExecutor(3) as pool:
        for name, size in pool.map(one, jobs):
            print(f'{name}: {size // 1024 if isinstance(size, int) else size} KB' if isinstance(size, int) else f'{name}: {size}', flush=True)


if __name__ == '__main__':
    main()
