#!/usr/bin/env python3
"""Fetch the sky used for the day background and the image-based lighting (CC0, Poly Haven).

    python3 tools/assets/fetch_sky.py

assets/sky/day.jpg         4096x2048 equirectangular sky, tone-mapped for the background
assets/sky/day_env.hdr     1k HDR for reflections and ambient light (day)
assets/sky/night_env.hdr   1k HDR for reflections and ambient light (night)
assets/sky/sky.json        where the sun is in the day sky (so the game's sun light can match it)
Needs Python 3, numpy, opencv-python-headless.
"""
import json, math, os, urllib.request
import cv2, numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'sky')
UA = {'User-Agent': 'Mozilla/5.0'}
DAY, NIGHT = 'kloofendal_48d_partly_cloudy_puresky', 'moonless_golf'


def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=300).read()


def hdr_url(name, res): return json.loads(get(f'https://api.polyhaven.com/files/{name}'))['hdri'][res]['hdr']['url']


def aces(x):   # Narkowicz fit
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, res, dst in ((DAY, '1k', 'day_env.hdr'), (NIGHT, '1k', 'night_env.hdr')):
        open(os.path.join(OUT, dst), 'wb').write(get(hdr_url(name, res))); print(dst)
    # sun direction from the 1k day HDR: brightest pixel (equirectangular: x -> longitude, y -> latitude)
    im = cv2.imread(os.path.join(OUT, 'day_env.hdr'), cv2.IMREAD_UNCHANGED)[:, :, ::-1].astype(np.float32)
    lum = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    k = cv2.GaussianBlur(lum, (0, 0), 4); y, x = np.unravel_index(np.argmax(k), k.shape)
    h, w = lum.shape
    lon, lat = (x / w) * 2 * math.pi, (0.5 - y / h) * math.pi
    json.dump({'sunU': round(x / w, 4), 'sunV': round(y / h, 4), 'elevation_deg': round(math.degrees(lat), 1), 'peak': float(lum.max())}, open(os.path.join(OUT, 'sky.json'), 'w'))
    print('sun at u,v', x / w, y / h, 'elev', math.degrees(lat))
    # background: the 4k HDR, exposed and tone-mapped to an 8-bit JPEG
    tmp = os.path.join(OUT, '_day4k.hdr'); open(tmp, 'wb').write(get(hdr_url(DAY, '4k')))
    big = cv2.imread(tmp, cv2.IMREAD_UNCHANGED)[:, :, ::-1].astype(np.float32); os.remove(tmp)
    big = big * 0.55                                              # exposure
    ldr = (np.power(aces(big), 1 / 2.2) * 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'day.jpg'), ldr[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 82]); print('day.jpg', ldr.shape)


if __name__ == '__main__':
    main()
