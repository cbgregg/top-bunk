#!/usr/bin/env python3
"""Generate TOP BUNK's voice lines (Mom and Dad) with ElevenLabs.

    ELEVENLABS_API_KEY=... python3 tools/gen_voice.py [--only vo/mom] [--force]

Writes assets/audio/<id>.mp3 (24 kHz, 48 kbit/s mono MP3, padding trimmed, long pauses shortened, loudness matched)
and assets/audio/manifest.json, which lists every file that exists and is what the game loads. Lines that already have
a file are skipped unless --force. The key is read from the environment only: never put it in this file.

Acting tags in front of a line ([whispering], [panicked]...) set the delivery and are never spoken.
"""
import json, os, re, subprocess, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'audio')
EL_MODEL = 'eleven_v4'


def el(voice_id, speed=1.0):
    return (voice_id, speed)


# account voices (the same ones Breachpoint uses): Sarah for Mom, Chris for Dad
MOM = el('EXAVITQu4vr4xnSDxMaL', 1.0)
DAD = el('iP95p4xoKVk53GoZ742B', 1.0)

# id -> (voice, line). These are exactly the lines the game shows as subtitles (js/main.js); the game plays
# sfx.say('<mom|dad>/<name>') next to each one. Change the wording in both places.
LINES = {}


def add(id_, voice, line):
    LINES[id_] = (voice, line)


# moving day
add('vo/dad/welcome', DAD, "[warm, cheerful] Welcome home, bud! Grab your boxes off the truck behind you. Your room's at the very end of the hall.")
add('vo/dad/line_1', DAD, '[warm] Three boxes with your name on them. Go on.')
add('vo/dad/line_2', DAD, '[dry, amused] Landlord says the place has "character." I think that means creaky floors.')
add('vo/dad/line_3', DAD, "[warm] End of the hall, bud. Can't miss it.")
add('vo/dad/mom_looking', DAD, "[warm] Your mom's looking for you.")
add('vo/mom/boxes_first', MOM, '[warm, gentle] Boxes first, kiddo. Then you can explore.')
add('vo/mom/helper', MOM, "[warm, tired] There's my helper. All unpacked?")
add('vo/mom/landlord', MOM, '[thoughtful, a little uneasy] The landlord said the last family left in a real hurry. Left half their things behind.')
add('vo/dad/cheap', DAD, "[dry, deadpan] Can't imagine why. Cheapest rent in the county.")
add('vo/mom/teeth', MOM, '[warm, firm] Okay, mister. Teeth, then bed. Big day tomorrow.')

# morning
add('vo/mom/breakfast', MOM, "[bright, calling up the stairs] Breakfast's ready! Come on down, sleepyhead!")
add('vo/mom/thump', MOM, '[concerned] Honey? What was that thump?')
add('vo/mom/again', MOM, '[teasing, concerned] Did you fall out of bed again?')
add('vo/mom/bottom_bunk', MOM, '[gentle, amused] Maybe you should sleep on the bottom bunk tonight.')


def ssml_safe(s):
    return re.sub(r'\s+', ' ', s).strip()


def synth(voice, text):
    vid, speed = voice
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128',
                                 data=json.dumps({'text': text, 'model_id': EL_MODEL, 'voice_settings': {'speed': speed}}).encode(),
                                 headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            code = getattr(e, 'code', 0)
            if code in (0, 429, 500, 502, 503, 504) and attempt < 5:
                time.sleep(2 ** attempt + 1)
                continue
            raise RuntimeError(f'{code} {e}')


def finish(path):
    # cut the padding to 40 ms at each end, shorten pauses inside a line to about 0.2 s, match loudness (-16 LUFS)
    tmp = path + '.tmp.mp3'
    f = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,'
         'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,'
         'silenceremove=stop_periods=-1:stop_threshold=-45dB:stop_duration=0.22:stop_silence=0.18,'
         'loudnorm=I=-16:TP=-1.5:LRA=11')
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', f, '-ar', '24000', '-ac', '1', '-b:a', '48k', tmp])
    if r.returncode == 0 and os.path.getsize(tmp) > 400:
        os.replace(tmp, path)
    elif os.path.exists(tmp):
        os.remove(tmp)


def make(id_):
    voice, line = LINES[id_]
    path = os.path.join(OUT, id_ + '.mp3')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    audio = synth(voice, ssml_safe(line))
    if len(audio) < 800:
        raise RuntimeError(f'{id_}: suspiciously short audio ({len(audio)} bytes)')
    with open(path, 'wb') as f:
        f.write(audio)
    finish(path)
    return id_


def write_manifest():
    files = sorted(os.path.relpath(os.path.join(d, f), OUT)[:-4].replace(os.sep, '/')
                   for d, _, fs in os.walk(OUT) for f in fs if f.endswith('.mp3'))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'files': files}, f, indent=0)
        f.write('\n')
    return len(files)


def main():
    if not os.environ.get('ELEVENLABS_API_KEY'):
        sys.exit('set ELEVENLABS_API_KEY')
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    jobs = [id_ for id_ in LINES if (not only or id_.startswith(only))
            and (force or not os.path.exists(os.path.join(OUT, id_ + '.mp3')))]
    with ThreadPoolExecutor(4) as pool:
        for n, id_ in enumerate(pool.map(make, jobs), 1):
            print(f'[{n}/{len(jobs)}] {id_}', flush=True)
    print(f'{len(jobs)} made, {write_manifest()} in the manifest')


if __name__ == '__main__':
    main()
