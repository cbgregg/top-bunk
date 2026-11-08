#!/usr/bin/env python3
"""Fetch the Sketchfab props (CC BY 4.0, listed in CREDITS.md) and slim each into one small GLB in assets/props.

    SKETCHFAB_API_KEY=... python3 tools/assets/fetch_sketchfab.py [--manifest rows.json] [--only name] [--force] [--credits]

The key is read from the environment only; it is never printed or written anywhere.
Each archive is unpacked in a temp folder and handed to tools/assets/slim_models.mjs (meshopt, WebP textures, a triangle budget).
--credits prints the attribution lines for CREDITS.md.
--manifest reads the rows from a JSON file instead of the MODELS table below: an array of objects of the same shape as a MODELS row plus
its name, e.g. [{"name": "car_kiri", "uid": "...", "by": "...", "title": "...", "tex": 512, "tris": 9000}] (keep, drop optional; "license"
"by" (CC BY 4.0, the default) or "cc0"). Each part of the game keeps its own rows in tools/assets/manifests/<part>.json.
"""
import io, json, os, shutil, subprocess, sys, tempfile, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'props')
API = 'https://api.sketchfab.com/v3'

# name: uid, author, title, texture size, triangle budget; keep/drop are optional node-name regexes for models that come as a pack
# every model here is CC BY 4.0 (the 'by' license on Sketchfab), which is checked against the API before anything is downloaded
MODELS = {
    # your room
    'bunk':         dict(uid='9fb7c54715dd41b98b3dc67b367cf81d', by='Blender3D', title='Simple Bunk Bed', tex=512, tris=6000),
    'teddy':        dict(uid='1b99b250bced4666b709b6d911f1f152', by='maestronoov', title='teddy bear', tex=256, tris=2000),
    # kitchen and bathroom
    'fridge':       dict(uid='2fdaa56bbd85404cb4206dcaedc16658', by='whitend.3d', title='House Props : Fridge', tex=1024, tris=2000),
    'stove':        dict(uid='056ccf898f9e49acb6e3e370deabf184', by='longtail', title='Gas Stove', tex=512, tris=3000),
    'toilet':       dict(uid='132a8ee2af3a40d39d270fbed3d3666c', by='hippostance', title='Toilet', tex=512, tris=4000),
    # utility room
    'washer':       dict(uid='a27aa928a6664473a0ebfbe2c7f72b23', by='goldie', title='Washing Machine', tex=1024, tris=4000, drop='cable|thing'),
    'dryer':        dict(uid='ea0080f2433b41578145944a3d0b350c', by='glowbox3d', title='Modern Clothes Dryer', tex=512, tris=2000),
    'dresser_old':  dict(uid='ccf38598539f4bde9864c84c13255901', by='justincrazyeyes', title='Old Dresser with Mirror', tex=512, tris=5000),
    'mirror':       dict(uid='908260e1319b47f5a9ffa60d4a9544f4', by='jonestudio', title='Stand mirror', tex=512, tris=3000),
    # the office
    'crt_pc':       dict(uid='ea9faf1298d24497b916c27a4ea38636', by='MadeByYeshe', title='Retro CRT Computer (1990s Desktop PC)', tex=1024, tris=3000),
    'desk':         dict(uid='05353724b7884bfb81211c7033a57fd4', by='felixawani', title='Computer Desk', tex=512, tris=1000),
    'office_chair': dict(uid='b228a29fa84544c2be501c295653ffe7', by='nokillnando', title='Office Chair', tex=512, tris=4000),
    'filing':       dict(uid='f0742791a0ea432db1f432c24de83867', by='LtxxwSibeRia', title='File Cabinet', tex=512, tris=2500),
    'bookcase':     dict(uid='d0618ac16b2a4a87b9b6c7d5e6765626', by='mtcollings', title='Wooden Bookcases with Books', tex=1024, tris=6000, drop='Small'),
    'desk_lamp':    dict(uid='d934c6b791c34e0fafc30e9625b4c55c', by='maxdragon', title='office lamp', tex=512, tris=2000),
    # the parents' room
    'dresser':      dict(uid='25134a84c07e420b93cae181731fd7a0', by='mozillareality', title='Dresser - modern light wood', tex=512, tris=1000),
    'sofa_plaid':   dict(uid='9feaf83034ca4382a099c18cec5aecb3', by='lena-wachs', title='Old Plaid Sofa', tex=1024, tris=8000),
    'table_lamp':   dict(uid='6c395859886f405fb065b31b3e41d680', by='nickhavas', title='Table Lamp 01', tex=512, tris=1500),
    # wall plates (one pack, split in two)
    'outlet':       dict(uid='2bb10b5967624d659c83e5ee1701fe56', by='denniswoo1993', title='Free Wall outlets and switches pack', tex=512, tris=800, keep='Wall outlet'),
    'switch':       dict(uid='2bb10b5967624d659c83e5ee1701fe56', by='denniswoo1993', title='Free Wall outlets and switches pack', tex=512, tris=800, keep='Light switch'),
    # the road: cars that pass the house (fictional makes, 80s and 90s), the mailbox and the cans at the end of the drive
    'car_sedan':    dict(uid='d604871eee5b4181bb298163b0b675b7', by='DanielZhabotinsky', title="Illinois '90 - Low poly model", tex=512, tris=9000),
    'car_sedan2':   dict(uid='8509a7f82665442592627940b7a1cfab', by='DanielZhabotinsky', title="Riverside '88 - Low poly model", tex=512, tris=9000),
    'car_pickup':   dict(uid='6c48c94be8974dc7a5932f697c0ba68f', by='DanielZhabotinsky', title="Conquer '89 Pickup - Low poly model", tex=512, tris=9000),
    'car_wagon':    dict(uid='aa0becb6e854422596cac6b21bf79787', by='DanielZhabotinsky', title="Fairheaven SW '84 - Low poly model", tex=512, tris=9000),
    # the living room
    'grandfather':  dict(uid='cef39f1bd3df43578236f273f273a873', by='longtail', title='Grandfather Clock', tex=1024, tris=9000),
    'mailbox':      dict(uid='132c790ac74c42a0bb1a5fc7e3d43d7e', by='glowbox3d', title='Home US Mailbox', tex=512, tris=2000),
    'trash_can':    dict(uid='69400e2f969f4c44882a398ef583334c', by='AndreyUEDev', title='Trash cans (low poly)', tex=512, tris=1800, keep='Object_2|Object_3'),
    # the yard: the moving truck on the drive, the shrubs along the house
    'truck':        dict(uid='663a0953c038434a918cb85725c88ffa', by='DanielZhabotinsky', title="LCT 3000 '95 - Low poly model", tex=512, tris=14000),
    'shrub':        dict(uid='f6ed4c70fc024ac88e8e6a19991695af', by='yanix', title='Small bush', tex=512, tris=400),
    # the field: the barn out past the fence, the firs of the shelter belt and the treeline (two trees from one pack), the maples by the house
    'barn':         dict(uid='1d0b768a8e2449de990b3f69f94c5db6', by='andrewriddle', title='American Old Barn', tex=1024, tris=4600),
    'fir1':         dict(uid='f58e8b6d733e4b0586e5b7db847b89e7', by='lolipop_1707', title='Realistic fir trees pack (LODS, gameready)', tex=512, tris=9000, keep='Christmas tree_LOD0_'),
    'fir2':         dict(uid='f58e8b6d733e4b0586e5b7db847b89e7', by='lolipop_1707', title='Realistic fir trees pack (LODS, gameready)', tex=512, tris=9000, keep='Christmas tree_2_LOD0_'),
    'fir1_far':     dict(uid='f58e8b6d733e4b0586e5b7db847b89e7', by='lolipop_1707', title='Realistic fir trees pack (LODS, gameready)', tex=256, tris=2500, keep='Christmas tree_LOD2_'),
    'fir2_far':     dict(uid='f58e8b6d733e4b0586e5b7db847b89e7', by='lolipop_1707', title='Realistic fir trees pack (LODS, gameready)', tex=256, tris=2500, keep='Christmas tree_2_LOD2_'),
    'maple':        dict(uid='b5d2833c258f4054a01ee2b4ef85adf0', by='lolipop_1707', title='Maple trees pack (lowpoly, game ready, LODs)', tex=512, tris=10000, keep='Acer_large_1_LOD0_'),
    'tree_bare':    dict(uid='33ccce6111604656a4b5709483670ec3', by='MaX3Dd', title='Dead Tree', tex=512, tris=3300),
    # the kid's own arms in the bottom of the view (rigged, with finger bones)
    'fp_arms':      dict(uid='76f4c7ae0b3e4cf9a57613ab991fad06', by='mrgyarmati', title='Rigged Arms', tex=1024, tris=9000),
}
LICENSE_SLUG = 'by'
LICENSE_NAME = 'CC BY 4.0'
LICENSES = {'by': 'CC BY 4.0', 'cc0': 'CC0'}


class FetchError(Exception):
    pass


def api(path, key):
    request = urllib.request.Request(API + path, headers={'Authorization': 'Token ' + key, 'User-Agent': 'Mozilla/5.0'})
    return json.loads(urllib.request.urlopen(request, timeout=60).read())


def load_manifest(path):
    """The rows of a manifest file, as a MODELS-shaped dict (name: row), checked for the fields the fetch needs."""
    with open(path, encoding='utf-8') as f:
        rows = json.load(f)
    if not isinstance(rows, list):
        raise SystemExit(f'{path}: a manifest is a JSON array of rows')
    models = {}
    for row in rows:
        missing = [k for k in ('name', 'uid', 'by', 'title', 'tex', 'tris') if k not in row]
        if missing:
            raise SystemExit(f"{path}: row {row.get('name', '?')} has no {', '.join(missing)}")
        if row.get('license', LICENSE_SLUG) not in LICENSES:
            raise SystemExit(f"{path}: row {row['name']}: licence {row['license']} is not one the game ships ({', '.join(LICENSES)})")
        models[row['name']] = {k: v for k, v in row.items() if k != 'name'}
    return models


def fetch(name, key, force):
    """Download one model and slim it; returns the slimmer's summary line, or 'kept' if the file is already there."""
    model = MODELS[name]
    out = os.path.join(OUT, name + '.glb')
    if os.path.exists(out) and not force:
        return 'kept'
    info = api(f"/models/{model['uid']}", key)
    slug = (info.get('license') or {}).get('slug')
    want = model.get('license', LICENSE_SLUG)
    if slug != want:
        raise FetchError(f'license on Sketchfab is {slug}, not {want}')
    link = api(f"/models/{model['uid']}/download", key)['gltf']['url']
    data = urllib.request.urlopen(urllib.request.Request(link, headers={'User-Agent': 'Mozilla/5.0'}), timeout=300).read()
    tmp = tempfile.mkdtemp(prefix='skf_')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for entry in archive.namelist():
                if entry.startswith('/') or '..' in entry.split('/'):
                    raise FetchError('bad path in archive')
            archive.extractall(tmp)
        gltf = None
        for folder, _, files in os.walk(tmp):
            for f in files:
                if f.endswith(('.gltf', '.glb')):
                    gltf = os.path.join(folder, f)
                    break
            if gltf:
                break
        if not gltf:
            raise FetchError('no glTF in archive')
        cmd = ['node', os.path.join(HERE, 'slim_models.mjs'), '--in', gltf, '--out', out, '--tris', str(model['tris']), '--tex', str(model['tex'])]
        for flag in ('keep', 'drop'):
            if model.get(flag):
                cmd += ['--' + flag, model[flag]]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode:
            raise FetchError(result.stderr[-400:])
        return result.stdout.strip()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def credits():
    for name, m in MODELS.items():
        print(f"  - `{name}`: [{m['title']}](https://sketchfab.com/3d-models/{m['uid']}) by [{m['by']}](https://sketchfab.com/{m['by']}), {LICENSES[m.get('license', LICENSE_SLUG)]}")


def main():
    global MODELS
    if '--manifest' in sys.argv:
        i = sys.argv.index('--manifest')
        if i + 1 >= len(sys.argv):
            sys.exit('--manifest needs the path of a rows file')
        MODELS = load_manifest(sys.argv[i + 1])
    if '--credits' in sys.argv:
        return credits()
    key = os.environ.get('SKETCHFAB_API_KEY')
    if not key:
        sys.exit('set SKETCHFAB_API_KEY in the environment (an API token from your Sketchfab settings)')
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    if only and only not in MODELS:
        sys.exit(f'no row named {only}')
    for name in MODELS:
        if only and name != only:
            continue
        try:
            result = fetch(name, key, force)
        except Exception as e:
            result = 'FAIL ' + str(e)[:200]
        print(f'{name}: {result}', flush=True)


if __name__ == '__main__':
    main()
