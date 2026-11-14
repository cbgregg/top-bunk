#!/usr/bin/env python3
"""Fetch the two flashlights from Poly Haven (CC0) and slim each into one small GLB in assets/props:

    python3 tools/assets/fetch_polyhaven.py [--only flashlight] [--force] [--list] [--manifest f_vintage_flashlight.json]

flashlight.glb   Grandpa's torch, the one the kid carries: Poly Haven `vintage_flashlight` (Omar M. El-Safy)
torch_dad.glb    Dad's own torch for his night walks: Poly Haven `small_plastic_torch` (Abiyyu Panggalih)
d_*.glb          the things a family has about the house (js/decor.js): cushions, shelves, a laundry basket, the garage's shelves and tools

Each model's licence and authors are read from the Poly Haven API (api.polyhaven.com/info/<id>) before anything is downloaded, and the
script stops if the asset is not CC0 (every Poly Haven asset is; the check is there so a changed listing cannot slip through). The glTF
at 1k and its textures are downloaded into a temporary folder, then tools/assets/slim_models.mjs welds, simplifies to the triangle budget,
resizes the textures to WebP and meshopt-compresses the result. --manifest reads the file listing from a saved copy of
api.polyhaven.com/files/<id> instead of asking the API. --list prints the node tree and stops (to choose what to keep).

Needs Python 3 and the slimming tools (cd tools && npm install). No key: Poly Haven's API is public.
"""
import json, os, shutil, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'props')
SLIM = os.path.join(HERE, 'slim_models.mjs')
UA = {'User-Agent': 'Mozilla/5.0 (top-bunk asset fetch)'}

# name: (Poly Haven id, triangle budget, texture size in px[, node-name regex to keep (for a model that comes as a set)])
MODELS = {
    'flashlight': ('vintage_flashlight', 3000, 512),
    'torch_dad': ('small_plastic_torch', 3000, 512),
    # the house lived in (js/decor.js)
    'd_cushion': ('throw_pillows_01', 700, 256, 'pillow01'),
    'd_cushion2': ('throw_pillows_01', 700, 256, 'pillow02'),
    'd_shelves': ('wooden_display_shelves_01', 2400, 512),
    'd_kidshelf': ('painted_wooden_shelves', 524, 512),
    'd_kidtable': ('small_wooden_table_01', 900, 512),
    'd_stool': ('painted_wooden_stool', 676, 256),
    'd_alarm': ('alarm_clock_01', 1500, 256),
    'd_bowl': ('wooden_bowl_01', 900, 256),
    'd_lemon': ('lemon', 300, 256),
    'd_frame': ('standing_picture_frame_01', 600, 256),
    'd_vase': ('ceramic_vase_03', 600, 256),
    'd_vase2': ('brass_vase_03', 600, 256),
    'd_jug': ('jug_01', 800, 256),
    'd_boombox': ('boombox', 2200, 512),
    'd_football': ('american_football', 500, 256),
    'd_bat': ('baseball_bat', 400, 256),
    'd_ball': ('baseball_01', 200, 256),
    'd_duck': ('rubber_duck_toy', 600, 256),
    'd_plunger': ('plunger', 500, 256),
    'd_suitcase': ('vintage_suitcase', 1200, 512, 'suitcase_02'),
    'd_cardbox': ('cardboard_box_01', 1500, 512),
    'd_notepads': ('office_notepads', 666, 256),
    'd_clipboard': ('clipboard', 700, 256),
    'd_bleach': ('bleach_bottle', 700, 256),
    'd_cleaner': ('multi_cleaner_5_litre', 700, 256),
    'd_gallon': ('plastic_bottle_gallon', 800, 256),
    'd_spray': ('all_purpose_cleaner', 700, 256),
    'd_gshelves': ('steel_frame_shelves_01', 2500, 512),
    'd_ladder': ('wooden_ladder_02', 1500, 512),
    'd_toolbox': ('metal_toolbox', 1800, 512),
    'd_spraycans': ('spray_paint_bottles', 1200, 256),
    'd_tin': ('cleaner_tin_01', 600, 256),
    'd_oiltin': ('oil_tin', 600, 256),
    'd_saw': ('handsaw_wood', 500, 512),
    'd_hammer': ('cross_pein_hammer', 400, 256),
    'd_wrench': ('combination_wrench', 400, 256),
    'd_screwdriver': ('flathead_screwdriver', 400, 256),
    'd_jerrycan': ('plastic_jerrycan', 900, 256),
    'd_cement': ('cement_bag', 844, 256),
    'd_handtruck': ('hand_truck', 2500, 512),
    'd_wateringcan': ('watering_can_metal_01', 1500, 256),
    'd_porchchair': ('plastic_monobloc_chair_01', 2000, 512),
    'd_claypot': ('planter_pot_clay', 800, 256),
    'd_boots': ('rubber_boots', 1200, 256, 'boots_dirt'),
    'd_bin': ('metal_trash_can', 1400, 512, '^metal_trash_can(_handle_(left|right))?$'),
    'd_crate': ('plastic_crate_02', 900, 256),
}


# the small ones (a tin, a bottle, a hammer) keep only their colour map: slim_models.mjs --plain
PLAIN = {'d_alarm', 'd_bowl', 'd_lemon', 'd_frame', 'd_vase', 'd_vase2', 'd_jug', 'd_football', 'd_bat', 'd_ball', 'd_duck', 'd_plunger', 'd_notepads', 'd_clipboard',
         'd_bleach', 'd_cleaner', 'd_gallon', 'd_spray', 'd_spraycans', 'd_tin', 'd_oiltin', 'd_saw', 'd_hammer', 'd_wrench', 'd_screwdriver', 'd_jerrycan', 'd_cement',
         'd_wateringcan', 'd_claypot', 'd_boots', 'd_crate'}

def get(u, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=180).read()
        except Exception:
            if i == tries - 1:
                raise


def licence(id_):
    """The asset's listing: its name and authors. Poly Haven publishes everything as CC0; a listing that says otherwise stops the fetch."""
    info = json.loads(get(f'https://api.polyhaven.com/info/{id_}'))
    lic = info.get('license', 'CC0')
    if str(lic).upper().replace(' ', '').replace('-', '') not in ('CC0', 'CC01.0', 'PUBLICDOMAIN'):
        raise SystemExit(f'{id_}: licence {lic!r} is not CC0')
    return info.get('name', id_), ', '.join(info.get('authors', {}).keys())


def one(name, force, list_only, manifest):
    id_, tris, tex, *keep = MODELS[name]
    out = os.path.join(OUT, name + '.glb')
    if os.path.exists(out) and not force and not list_only:
        print(f'{name}: already there ({os.path.getsize(out) // 1024} KB); --force fetches it again')
        return
    title, authors = licence(id_)
    files = json.load(open(manifest)) if manifest else json.loads(get(f'https://api.polyhaven.com/files/{id_}'))
    g = (files.get('gltf') or {}).get('1k', {}).get('gltf')
    if not g:
        raise SystemExit(f'{id_}: no 1k glTF in the listing')
    tmp = tempfile.mkdtemp(prefix='ph_')
    try:
        main = os.path.join(tmp, id_ + '.gltf')
        open(main, 'wb').write(get(g['url']))
        for rel, v in g.get('include', {}).items():
            p = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, 'wb').write(get(v['url']))
        args = ['node', SLIM, '--in', main, '--out', out, '--tris', str(tris), '--tex', str(tex)]
        if keep:
            args += ['--keep', keep[0]]
        if name in PLAIN:
            args.append('--plain')
        if list_only:
            args.append('--list')
        r = subprocess.run(args, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f'{name}: slimming failed: {r.stderr[-400:]}')
        print(r.stdout.strip())
        if not list_only:
            print(f'{name}: "{title}" by {authors}, CC0, https://polyhaven.com/a/{id_}')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    a = sys.argv[1:]
    only = a[a.index('--only') + 1] if '--only' in a else ''
    manifest = a[a.index('--manifest') + 1] if '--manifest' in a else ''
    if manifest and not only:
        raise SystemExit('--manifest is for one model: give --only too')
    os.makedirs(OUT, exist_ok=True)
    for name in MODELS:
        if not only or name == only:
            one(name, '--force' in a, '--list' in a, manifest)


if __name__ == '__main__':
    main()
