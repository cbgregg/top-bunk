#!/usr/bin/env python3
"""Fetch the public-domain photographs that hang in the picture frames (Wikimedia Commons, US-government / old public-domain works).

    python3 tools/assets/fetch_photos.py [name ...] [--force]

Writes assets/photos/<name>.webp (about 512 px) and assets/photos/credits.json (title, author, licence, source page), which CREDITS.md
summarises. Only files whose Commons licence is Public domain / CC0 are kept.
"""
import io, json, os, sys, time, urllib.parse, urllib.request
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'photos')
UA = {'User-Agent': 'TopBunkAssetFetcher/1.0 (https://github.com/cbgregg/top-bunk; hobby game, CC0 assets only)'}
API = 'https://commons.wikimedia.org/w/api.php'
OK = ('public domain', 'cc0', 'pd', 'cc-zero')

# name: the Commons file. All are public domain / CC0 (US-government and old works); old family photographs and Pacific Northwest landscapes.
WANTS = {
    'family1': 'File:Family in a wagon, Lee County, Mississippi, 1935.jpg',
    'family2': 'File:About three hunded people attended the annual renuion of the England family. This family has been in this area over... - NARA - 540764.jpg',
    'rainier': "File:Mount Rainier's wildflowers (6851616406).jpg",
    'reflection': 'File:Mount Rainier and lake reflection.jpg',
    'moraine': 'File:Moraine Lake 17092005.jpg',
    'sunset': 'File:Sailing at Sunset New Dorp Beach, Staten Island, N.Y. (sailboat on ocean at sunset) (NYPL b15279351-104467).tiff',
}


def get(url, tries=6):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception as e:
            code = getattr(e, 'code', 0)
            time.sleep(8 * (i + 1) if code in (429, 503, 0) else 2)
    raise RuntimeError('failed ' + url)


def info(title):
    p = {'action': 'query', 'format': 'json', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 640}
    d = json.loads(get(API + '?' + urllib.parse.urlencode(p)))
    pg = next(iter(d['query']['pages'].values())); ii = pg['imageinfo'][0]; m = ii.get('extmetadata', {})
    lic = (m.get('LicenseShortName', {}).get('value') or '')
    if not any(lic.lower().startswith(k) for k in OK): raise RuntimeError('not public domain: ' + lic)
    strip = lambda k: __import__('re').sub('<[^>]+>', '', m.get(k, {}).get('value', '')).strip()
    return {'title': pg['title'], 'thumb': ii['thumburl'], 'license': lic, 'author': strip('Artist') or strip('Credit'), 'page': ii['descriptionurl']}


def main():
    os.makedirs(OUT, exist_ok=True)
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    meta_path = os.path.join(OUT, 'credits.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for name, title in WANTS.items():
        if only and name not in only: continue
        if os.path.exists(os.path.join(OUT, name + '.webp')) and name in meta and '--force' not in sys.argv: continue
        try:
            c = info(title)
            im = Image.open(io.BytesIO(get(c['thumb']))).convert('RGB')
        except Exception as e:   # the Commons API rate-limits hard: carry on with the rest
            print(name, 'failed', e); time.sleep(15); continue
        if im.width > 640: im = im.resize((640, int(im.height * 640 / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=82, method=6)
        meta[name] = {k: c[k] for k in ('title', 'author', 'license', 'page')}
        print(name, c['title'], c['license'], im.size, flush=True)
        json.dump(meta, open(meta_path, 'w'), indent=1); time.sleep(6)
    json.dump(meta, open(meta_path, 'w'), indent=1); open(meta_path, 'a').write('\n')


if __name__ == '__main__':
    main()
