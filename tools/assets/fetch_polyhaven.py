#!/usr/bin/env python3
"""Fetch the two flashlights from Poly Haven (CC0) and slim each into one small GLB in assets/props:

    python3 tools/assets/fetch_polyhaven.py [--only flashlight] [--force] [--list] [--manifest f_vintage_flashlight.json]

flashlight.glb   Grandpa's torch, the one the kid carries: Poly Haven `vintage_flashlight` (Omar M. El-Safy)
torch_dad.glb    Dad's own torch for his night walks: Poly Haven `small_plastic_torch` (Abiyyu Panggalih)

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

# name: (Poly Haven id, triangle budget, texture size in px)
MODELS = {
    'flashlight': ('vintage_flashlight', 3000, 512),
    'torch_dad': ('small_plastic_torch', 3000, 512),
}


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
    id_, tris, tex = MODELS[name]
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
