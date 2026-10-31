#!/usr/bin/env python3
"""Fetch the Sketchfab props (CC0 and CC-BY, listed in CREDITS.md) and slim each into one small GLB in assets/props.

    SKETCHFAB_API_KEY=... python3 tools/assets/fetch_sketchfab.py [--only name] [--force] [--credits]

The key is read from the environment only; it is never printed or written anywhere.
Each archive is unpacked in a temp folder and handed to tools/assets/slim_models.mjs (meshopt, WebP textures, a triangle budget).
--credits prints the attribution lines for CREDITS.md.
"""
import io, json, os, shutil, subprocess, sys, tempfile, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'props')
API = 'https://api.sketchfab.com/v3'

# name: uid, author, title, licence ('cc0' or 'by'), texture size, triangle budget, keep/drop node regexes for packs
MODELS = {
    # your room
    'bunk':         dict(uid='9fb7c54715dd41b98b3dc67b367cf81d', by='Blender3D', title='Simple Bunk Bed', lic='by', tex=512, tris=6000),
    'teddy':        dict(uid='1b99b250bced4666b709b6d911f1f152', by='maestronoov', title='teddy bear', lic='by', tex=256, tris=2000),
    # kitchen and bathroom
    'fridge':       dict(uid='2fdaa56bbd85404cb4206dcaedc16658', by='whitend.3d', title='House Props : Fridge', lic='by', tex=1024, tris=2000),
    'stove':        dict(uid='056ccf898f9e49acb6e3e370deabf184', by='longtail', title='Gas Stove', lic='by', tex=512, tris=3000),
    'toilet':       dict(uid='132a8ee2af3a40d39d270fbed3d3666c', by='hippostance', title='Toilet', lic='by', tex=512, tris=4000),
    # utility room
    'washer':       dict(uid='a27aa928a6664473a0ebfbe2c7f72b23', by='goldie', title='Washing Machine', lic='by', tex=1024, tris=4000, drop='cable|thing'),
    'dryer':        dict(uid='ea0080f2433b41578145944a3d0b350c', by='glowbox3d', title='Modern Clothes Dryer', lic='by', tex=512, tris=2000),
    'dresser_old':  dict(uid='ccf38598539f4bde9864c84c13255901', by='justincrazyeyes', title='Old Dresser with Mirror', lic='by', tex=512, tris=5000),
    'mirror':       dict(uid='908260e1319b47f5a9ffa60d4a9544f4', by='jonestudio', title='Stand mirror', lic='by', tex=512, tris=3000),
    # the office
    'crt_pc':       dict(uid='ea9faf1298d24497b916c27a4ea38636', by='MadeByYeshe', title='Retro CRT Computer (1990s Desktop PC)', lic='by', tex=1024, tris=3000),
    'desk':         dict(uid='05353724b7884bfb81211c7033a57fd4', by='felixawani', title='Computer Desk', lic='by', tex=512, tris=1000),
    'office_chair': dict(uid='b228a29fa84544c2be501c295653ffe7', by='nokillnando', title='Office Chair', lic='by', tex=512, tris=4000),
    'filing':       dict(uid='f0742791a0ea432db1f432c24de83867', by='LtxxwSibeRia', title='File Cabinet', lic='by', tex=512, tris=2500),
    'bookcase':     dict(uid='d0618ac16b2a4a87b9b6c7d5e6765626', by='mtcollings', title='Wooden Bookcases with Books', lic='by', tex=1024, tris=6000, drop='Small'),
    'desk_lamp':    dict(uid='d934c6b791c34e0fafc30e9625b4c55c', by='maxdragon', title='office lamp', lic='by', tex=512, tris=2000),
    # the parents' room
    'dresser':      dict(uid='25134a84c07e420b93cae181731fd7a0', by='mozillareality', title='Dresser - modern light wood', lic='by', tex=512, tris=1000),
    'table_lamp':   dict(uid='6c395859886f405fb065b31b3e41d680', by='nickhavas', title='Table Lamp 01', lic='by', tex=512, tris=1500),
    # wall plates (one pack, split in two)
    'outlet':       dict(uid='2bb10b5967624d659c83e5ee1701fe56', by='denniswoo1993', title='Free Wall outlets and switches pack', lic='by', tex=512, tris=800, keep='Wall outlet'),
    'switch':       dict(uid='2bb10b5967624d659c83e5ee1701fe56', by='denniswoo1993', title='Free Wall outlets and switches pack', lic='by', tex=512, tris=800, keep='Light switch'),
}
LICENCE = {'cc0': 'CC0 1.0', 'by': 'CC BY 4.0'}


def api(path, key):
    r = urllib.request.Request(API + path, headers={'Authorization': 'Token ' + key, 'User-Agent': 'Mozilla/5.0'})
    return json.loads(urllib.request.urlopen(r, timeout=60).read())


def fetch(name, key, force):
    m = MODELS[name]; out = os.path.join(OUT, name + '.glb')
    if os.path.exists(out) and not force: return name, 'kept'
    info = api(f"/models/{m['uid']}", key)
    lic = (info.get('license') or {}).get('slug')
    if lic != m['lic']: return name, f'FAIL licence on Sketchfab is {lic}, not {m["lic"]}'
    dl = api(f"/models/{m['uid']}/download", key)['gltf']
    data = urllib.request.urlopen(urllib.request.Request(dl['url'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=300).read()
    tmp = tempfile.mkdtemp(prefix='skf_')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for n in z.namelist():
                if n.startswith('/') or '..' in n.split('/'): return name, 'FAIL bad path in archive'
            z.extractall(tmp)
        gltf = next((os.path.join(r, f) for r, _, fs in os.walk(tmp) for f in fs if f.endswith(('.gltf', '.glb'))), None)
        if not gltf: return name, 'FAIL no glTF in archive'
        args = ['node', os.path.join(HERE, 'slim_models.mjs'), '--in', gltf, '--out', out, '--tris', str(m['tris']), '--tex', str(m['tex'])]
        if m.get('keep'): args += ['--keep', m['keep']]
        if m.get('drop'): args += ['--drop', m['drop']]
        p = subprocess.run(args, capture_output=True, text=True)
        if p.returncode: return name, 'FAIL ' + p.stderr[-400:]
        return name, p.stdout.strip()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def credits():
    for name, m in MODELS.items():
        print(f"  - `{name}`: [{m['title']}](https://sketchfab.com/3d-models/{m['uid']}) by [{m['by']}](https://sketchfab.com/{m['by']}), {LICENCE[m['lic']]}")


def main():
    if '--credits' in sys.argv: return credits()
    key = os.environ.get('SKETCHFAB_API_KEY')
    if not key: sys.exit('set SKETCHFAB_API_KEY in the environment (an API token from your Sketchfab settings)')
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    for name in MODELS:
        if only and name != only: continue
        try: n, r = fetch(name, key, '--force' in sys.argv)
        except Exception as e: n, r = name, 'FAIL ' + str(e)[:200]
        print(f'{n}: {r}', flush=True)


if __name__ == '__main__':
    main()
