#!/usr/bin/env python3
"""Generate TOP BUNK's voice lines with ElevenLabs.

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


# the same account voices Breachpoint uses: Lily for Mom, Bill for Dad
MOM = el('pFZP5JQG7iQjIQuC4Bku', 1.0)
DAD = el('pqHfZKP75CvOlQylNhV4', 1.0)

# id -> (voice, line). Takes: several ways of saying one thing, as vo/mom/<id>_<n>.
LINES = {}


def add(id_, voice, line):
    LINES[id_] = (voice, line)


# moving day: the kitchen, Mom is calm and busy
for n, line in enumerate([
    '[warm, tired] Easy with that box, sweetie. Top bunk is yours if you want it.',
    '[warm] Almost everything is in. Go see your room, it has a window.',
    '[cheerful, tired] Thanks for carrying. The hall is long, isn\'t it?',
], 1):
    add(f'vo/mom/moving_{n}', MOM, line)
for n, line in enumerate([
    "[calm] Don't touch the crayon drawing in the hall, honey. It's the old tenant's. We'll take it down later.",
    '[calm, distracted] Oh, the drawing. Kids find everything in an old house.',
], 1):
    add(f'vo/mom/drawing_{n}', MOM, line)
add('vo/dad/moving_1', DAD, '[tired, joking] The truck is empty. That means we did it, or it means we left something behind.')
add('vo/dad/moving_2', DAD, '[calm] Lamp goes in the living room. Careful, the shade is cracked.')

# morning: sunlight, birds, breakfast
for n, line in enumerate([
    '[bright, calling up the stairs] Breakfast! Come on, sleepyhead!',
    '[bright] Pancakes are ready. Hurry up before your brother eats them all.',
], 1):
    add(f'vo/mom/breakfast_{n}', MOM, line)
for n, line in enumerate([
    '[concerned, teasing] Did you fall out of bed again?',
    '[concerned] Honey, you have a bruise on your arm. Did you fall out of bed again?',
], 1):
    add(f'vo/mom/fell_out_{n}', MOM, line)
add('vo/dad/breakfast_1', DAD, '[calm] Your mom made pancakes. Eat before they go cold.')

# night: hallway whispers the family makes in their sleep, and Dad at the door
add('vo/dad/night_check_1', DAD, '[whispering, tired] Go back to bed. It\'s just the house settling.')
add('vo/mom/night_check_1', MOM, '[whispering, sleepy] Sweetie? Is everything okay?')


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
