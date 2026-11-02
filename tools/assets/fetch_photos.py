#!/usr/bin/env python3
"""Fetch the public-domain photographs that hang in the picture frames (Wikimedia Commons and the Library of Congress, US-government /
old public-domain works).

    python3 tools/assets/fetch_photos.py [name ...] [--force]

Writes assets/photos/<name>.webp (about 512 px) and assets/photos/credits.json (title, author, licence, source page), which CREDITS.md
summarises. Only files whose Commons licence is Public domain / CC0 are kept, and Library of Congress photos marked "No known restrictions"
(Farm Security Administration and Bain News Service negatives). The family photos on the living-room wall are cropped, toned like old
prints, and a few are spoiled on purpose: faces scratched out, a figure standing where nobody stood.
"""
import io, json, os, random, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageOps

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'photos')
UA = {'User-Agent': 'TopBunkAssetFetcher/1.0 (https://github.com/cbgregg/top-bunk; hobby game, CC0 assets only) curl/8.5.0'}
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

# name: (Library of Congress item id, crop box in the 1024 px "large" scan, what is done to it)
LOC = {
    'grandma': ('2017735128', (362, 268, 604, 560), {}),                     # the framed portrait on the Rowe family's wall
    'porch': ('2017736409', (16, 14, 1008, 704), {}),
    'boy': ('2017745274', (18, 36, 1008, 698), {'figure': (868, 300, 640)}),   # someone standing in the trees behind him
    'knitting': ('2014699784', (25, 78, 998, 672), {}),
    'ellis': ('2014710706', (240, 100, 965, 650), {'scratch': [(424, 205, 30)]}),
    'fence': ('2017774124', (60, 92, 888, 962), {}),                           # hung upside down
    'rocker': ('2017781719', (25, 35, 728, 985), {'scratch': [(395, 140, 34), (245, 385, 32), (330, 440, 28), (500, 405, 26)]}),
    'sofa': ('2017780654', (34, 44, 990, 750), {}),
}


def scratch(im, x, y, r, rnd):
    # a face gouged out with a key: dense pale strokes, a few dark ones
    d = ImageDraw.Draw(im)
    for i in range(110):
        a = rnd.uniform(-r, r), rnd.uniform(-r * 1.2, r * 1.2)
        b = a[0] + rnd.uniform(-r, r), a[1] + rnd.uniform(-r * 0.6, r * 0.6)
        v = rnd.randint(205, 245) if i % 6 else rnd.randint(20, 50)
        d.line([(x + a[0], y + a[1]), (x + b[0], y + b[1])], fill=v, width=rnd.choice((1, 2, 2, 3)))


def figure(im, x, y, foot):
    # a dark, faceless figure back in the trees: head, narrow shoulders, a long coat lost in the brush, soft like something out of focus
    m = Image.new('L', im.size, 0); d = ImageDraw.Draw(m)
    d.ellipse((x - 13, y - 17, x + 13, y + 16), fill=255)
    d.polygon([(x - 6, y + 13), (x + 6, y + 13), (x + 30, y + 36), (x + 34, foot), (x - 34, foot), (x - 30, y + 36)], fill=255)
    fade = Image.linear_gradient('L').resize(im.size).point(lambda v: 255 if v < 150 else max(0, 255 - (v - 150) * 3))
    m = Image.composite(m, Image.new('L', im.size, 0), fade).filter(ImageFilter.GaussianBlur(4)).point(lambda v: v * 0.7)
    im.paste(Image.new('L', im.size, 34), (0, 0), m)


def old_print(im):
    # silver print gone yellow: a warm tone, lifted blacks, softened whites
    g = ImageOps.autocontrast(im.convert('L'), cutoff=0.5).point(lambda v: 22 + v * 0.84)
    return ImageOps.colorize(g, black=(34, 26, 20), white=(236, 222, 190), mid=(140, 118, 92))


def loc(name, pk, crop, edits):
    d = json.loads(get(f'https://www.loc.gov/pictures/item/{pk}/?fo=json'))
    it, res = d['item'], d['resources'][0]
    if not (it.get('rights_information') or '').lower().startswith('no known restrictions'): raise RuntimeError('rights: ' + it.get('rights_information', '')[:60])
    im = Image.open(io.BytesIO(get(res['large']))).convert('L')
    rnd = random.Random(name)
    for x, y, r in edits.get('scratch', []): scratch(im, x, y, r, rnd)
    if 'figure' in edits: figure(im, *edits['figure'])
    im = old_print(im.crop(crop))
    who = (it.get('creators') or [{}])[0].get('title', '') or 'Library of Congress'
    return im, {'title': it['title'], 'author': who, 'license': 'Public domain (no known restrictions)', 'page': f'https://www.loc.gov/pictures/item/{pk}/'}


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
    for name, (pk, crop, edits) in LOC.items():
        if only and name not in only: continue
        if os.path.exists(os.path.join(OUT, name + '.webp')) and name in meta and '--force' not in sys.argv: continue
        im, meta[name] = loc(name, pk, crop, edits)
        if im.width > 512: im = im.resize((512, int(im.height * 512 / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=82, method=6)
        print(name, meta[name]['title'][:60], im.size, flush=True); time.sleep(1)
    json.dump(meta, open(meta_path, 'w'), indent=1); open(meta_path, 'a').write('\n')


if __name__ == '__main__':
    main()
