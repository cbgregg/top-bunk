#!/usr/bin/env python3
"""Generate TOP BUNK's voice lines (Mom and Dad, the late news, Grandpa and the bedtime cartoon's announcer and Mister Buttons' barks) with ElevenLabs.

    ELEVENLABS_API_KEY=... python3 tools/gen_voice.py [--only vo/mom] [--force]
    python3 tools/gen_voice.py --room [--only vo/mom]     # no new speech: the existing files through the room filter again

Writes assets/audio/<id>.mp3 (24 kHz, 48 kbit/s mono MP3, padding trimmed, long pauses shortened, put in a small room,
loudness matched) and assets/audio/manifest.json, which lists every file that exists and is what the game loads. Lines that
already have a file are skipped unless --force. The key is read from the environment only: never put it in this file.

Acting tags in front of a line ([whispering], [panicked]...) set the delivery and are never spoken; use them sparingly, the
voices are set to a steady delivery and the words carry the rest. Lines in SCENES are read with their neighbours as context.
"""
import json, os, re, subprocess, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'audio')
EL_MODEL = os.environ.get('EL_MODEL', 'eleven_v4')

# (voice id, speed). ElevenLabs library voices: Andrea (kind, calm) for Mom, Jerry B (off-the-cuff, unpolished) for Dad
MOM = ('wVZ5qbJFYF3snuC65nb4', 0.95)
DAD = ('1t1EeRixsJrKbiF1zwM6', 0.9)
# the late news on the TV and the kitchen radio: a broadcast reader (David Castlemore, newsreader), read flat and even
NEWS = ('XjLkpWUlnhS8i7gGz3lZ', 0.92)
# the bedtime cartoon's announcer: a fast, bright 1940s newsreel voice, made for this game with ElevenLabs Voice Design
ANNOUNCER = ('c63MdyQeiUD31wJu8xsi', 1.12)
# Mister Buttons himself: a tiny, high, squeaky 1930s cartoon teddy, also made for this game with Voice Design (barks only, no lines)
BUTTONS = ('tEQGD01rwp6wAvBDVpvm', 1.0)
# steady, low-style delivery: these are people talking in a kitchen, not a radio play
SETTINGS = {'stability': 1.0, 'similarity_boost': 0.8, 'style': 0.0}
# the announcer is the opposite: a showman, so the delivery is left free to bounce
SHOW = {'stability': 0.35, 'similarity_boost': 0.85, 'style': 0.6}
# lines that are one conversation, in order; each is read with its neighbours as context so it is not delivered as an announcement
SCENES = [
    ['dad/welcome', 'dad/line_1', 'dad/line_2', 'dad/line_3', 'mom/boxes_first', 'mom/boxes_again', 'dad/mom_looking',
     'mom/helper', 'you/box4', 'dad/box4', 'mom/gift_a', 'you/gift', 'dad/gift', 'mom/gift_b', 'mom/landlord', 'dad/cheap', 'dad/leftovers', 'mom/teeth'],
    ['mom/n1_call_a', 'mom/n1_call_b'], ['mom/n1_door_a', 'mom/n1_door_b'],
    ['you/m1_a', 'mom/m1_a', 'you/m1_b', 'dad/m1_a', 'mom/m1_b'],
    ['you/m2_a', 'mom/m2_a', 'dad/m2_a', 'mom/m2_b'], ['you/m3_a', 'mom/m3_a', 'dad/m3_a'], ['mom/m4_a', 'dad/m4_a', 'you/m4_a', 'mom/m4_b'],
    ['dad/m5_a', 'mom/m5_a', 'dad/m5_b', 'mom/m5_b'], ['mom/m6_a', 'dad/m6_a', 'mom/m6_b'], ['dad/m7_a', 'you/m7_a', 'mom/m7_a', 'dad/m7_b'],
    ['mom/m8_a', 'dad/m8_a', 'mom/m8_b'], ['mom/m9_a', 'dad/m9_a', 'you/m9_a', 'mom/m9_b'],
    # the photos on the breakfast table: brushed off, then uneasy, then scared
    ['mom/ph_low_a', 'dad/ph_low_a', 'mom/ph_low_b', 'dad/ph_low_b'], ['mom/ph_mid_a', 'dad/ph_mid_a', 'mom/ph_mid_b', 'dad/ph_mid_b'],
    ['mom/ph_high_a', 'dad/ph_high_a', 'mom/ph_high_b', 'dad/ph_high_b'],
    # Dad calling through the dark house, and the late bulletins, each read as one run
    ['dad/call_a', 'dad/call_b', 'dad/call_c', 'dad/call_d', 'dad/call_e', 'dad/call_f'],
    ['news/n1', 'news/n2', 'news/n3', 'news/n4', 'news/n5'], ['news/n6', 'news/n7', 'news/n8'],
    # the bedtime cartoon, read as one patter
    ['cartoon/c_hello', 'cartoon/c_creep', 'cartoon/c_duck', 'cartoon/c_hold', 'cartoon/c_quiet', 'cartoon/c_meter', 'cartoon/c_try', 'cartoon/c_holdit'],
    ['cartoon/c_good', 'cartoon/c_night', 'cartoon/c_remember'],
]
# Grandpa: a slower, older voice. Set GRAMPS_VOICE to an ElevenLabs voice id (defaults to Chris, slowed down).
GRAMPS = (os.environ.get('GRAMPS_VOICE', DAD[0]), 0.85)

# The lines live in assets/audio/lines.json, which the game reads too (subtitles and voice stay in sync): {id: {voice, say, html}}.
# id -> (voice, line). Lines without a voice (what the kid says, shown as subtitles only) are skipped.
LINES = {}
_ALL = json.load(open(os.path.join(OUT, 'lines.json')))
for _id, _l in _ALL.items():
    if _l.get('voice'):
        LINES['vo/' + _id] = ({'mom': MOM, 'gramps': GRAMPS, 'news': NEWS, 'announcer': ANNOUNCER, 'buttons': BUTTONS}.get(_l['voice'], DAD), _l['say'])


def ssml_safe(s):
    return re.sub(r'\s+', ' ', s).strip()


def plain(id_):
    # a line's words with the acting tags taken out (the kid's lines have only a caption)
    l = _ALL.get(id_, {})
    return re.sub(r'\[[^\]]*\]', '', l.get('say') or re.sub(r'<[^>]+>', '', l.get('html', ''))).strip()


def context(id_):
    # what was said just before and after this line in its scene
    for scene in SCENES:
        if id_ in scene:
            i = scene.index(id_)
            return (plain(scene[i - 1]) if i > 0 else ''), (plain(scene[i + 1]) if i + 1 < len(scene) else '')
    return '', ''


def synth(voice, text, prev='', nxt=''):
    vid, speed = voice
    body = {'text': text, 'model_id': EL_MODEL, 'voice_settings': {'speed': speed, **(SHOW if voice in (ANNOUNCER, BUTTONS) else SETTINGS)}}
    if prev:
        body['previous_text'] = prev
    if nxt:
        body['next_text'] = nxt
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128',
                                 data=json.dumps(body).encode(),
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


# the room: a studio take sounds like a booth, so every line gets the kitchen. The boom below 110 Hz goes, the top is shelved down
# a little, light compression, and three small early reflections (12, 26 and 40 ms) at low level
ROOM = ('highpass=f=110,treble=g=-3:f=6000,'
        'acompressor=threshold=-18dB:ratio=2:attack=10:release=120:makeup=1,'
        'aecho=1:0.4:12|26|40:0.25|0.12|0.06')


# the cartoon's soundtrack is an optical track on old film: thin (300 Hz to 3.6 kHz), a little driven, and no room around it
FILM = ('highpass=f=300,lowpass=f=3600,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2,'
        'asoftclip=type=tanh:threshold=0.8')


# lines bent after the room: the cartoon's sign-off runs down like a projector losing power, slower and lower
BEND = {'vo/cartoon/c_remember': 'asetrate=24000*0.84,aresample=24000,atempo=0.86'}
# his scream starts as a cartoon scream and turns real: after half a second it drops in pitch, stretches out and tears
TEAR = {'vo/buttons/b_scream': ('[0]asplit=2[a][b];[a]atrim=0:0.5,afade=t=out:st=0.42:d=0.08[a1];'
                                '[b]atrim=0.42,asetpts=PTS-STARTPTS,asetrate=24000*0.62,aresample=24000,atempo=0.7,'
                                'acrusher=bits=5:mix=0.55,vibrato=f=9:d=0.35,volume=1.6,afade=t=in:d=0.08[b1];[a1][b1]concat=n=2:v=0:a=1')}


def finish(path, trim=True, fx=None):
    # cut the padding to 40 ms at each end, shorten pauses inside a line to about 0.2 s, put it in the room, match loudness (-16 LUFS)
    tmp = path + '.tmp.mp3'
    f = ((('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,'
           'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,'
           'silenceremove=stop_periods=-1:stop_threshold=-45dB:stop_duration=0.22:stop_silence=0.18,') if trim else '')
         + ((fx or ROOM) + ',' if not os.environ.get('NO_ROOM') else '')
         + 'loudnorm=I=-16:TP=-1.5:LRA=11')
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', f, '-ar', '24000', '-ac', '1', '-b:a', '48k', tmp])
    if r.returncode == 0 and os.path.getsize(tmp) > 400:
        os.replace(tmp, path)
    elif os.path.exists(tmp):
        os.remove(tmp)


def make(id_):
    voice, line = LINES[id_]
    path = os.path.join(OUT, id_ + '.mp3')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    prev, nxt = context(id_[3:])
    audio = synth(voice, ssml_safe(line), prev, nxt)
    if len(audio) < 800:
        raise RuntimeError(f'{id_}: suspiciously short audio ({len(audio)} bytes)')
    with open(path, 'wb') as f:
        f.write(audio)
    finish(path, fx=FILM if voice in (ANNOUNCER, BUTTONS) else None)
    if id_ in TEAR:
        tmp = path + '.tear.mp3'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-filter_complex', TEAR[id_], '-ar', '24000', '-ac', '1', '-b:a', '48k', tmp], check=True)
        os.replace(tmp, path)
    if id_ in BEND:
        tmp = path + '.bend.mp3'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', BEND[id_], '-ar', '24000', '-ac', '1', '-b:a', '48k', tmp], check=True)
        os.replace(tmp, path)
    return id_


def write_manifest():
    files = sorted(os.path.relpath(os.path.join(d, f), OUT)[:-4].replace(os.sep, '/')
                   for d, _, fs in os.walk(OUT) for f in fs if f.endswith('.mp3'))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'files': files}, f, indent=0)
        f.write('\n')
    return len(files)


def main():
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    if '--room' in sys.argv:
        # no new speech: run the existing files through the room again (after a change to ROOM)
        files = [f for f in (os.path.join(d, n) for d, _, ns in os.walk(OUT) for n in ns if n.endswith('.mp3'))
                 if not only or os.path.relpath(f, OUT)[:-4].replace(os.sep, '/').startswith(only)]
        for f in files:
            finish(f, trim=False, fx=FILM if ('/cartoon/' in f.replace(os.sep, '/') or '/buttons/' in f.replace(os.sep, '/')) else None)
        print(f'{len(files)} files through the room')
        return
    if not os.environ.get('ELEVENLABS_API_KEY'):
        sys.exit('set ELEVENLABS_API_KEY')
    force = '--force' in sys.argv
    jobs = [id_ for id_ in LINES if (not only or id_.startswith(only))
            and (force or not os.path.exists(os.path.join(OUT, id_ + '.mp3')))]
    with ThreadPoolExecutor(4) as pool:
        for n, id_ in enumerate(pool.map(make, jobs), 1):
            print(f'[{n}/{len(jobs)}] {id_}', flush=True)
    print(f'{len(jobs)} made, {write_manifest()} in the manifest')


if __name__ == '__main__':
    main()
