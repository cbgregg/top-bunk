#!/usr/bin/env python3
"""Generate TOP BUNK's ambience, jump scares and horror instruments.

    ELEVENLABS_API_KEY=... python3 tools/gen_sfx.py [--only scare_synth] [--force]

Writes assets/sfx/<id>.mp3 and assets/sfx/sfx.json, which the game reads. Three kinds:
  noise  the night brown-noise bed, made locally with ffmpeg (no key, no credits); a seamless loop
  sfx    ElevenLabs sound effects: jump-scare stingers, the shove off the bunk
  music  ElevenLabs Music: the creepy horror instruments (waterphone, detuned music box)
The key is read from the environment only. Stingers are levelled loud on purpose; beds sit very low.
"""
import json, os, subprocess, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'sfx')

# id: (kind, prompt, seconds, loudness LUFS, loops)
SFX = {
    # the night bed: brown noise, low-passed, with a very slow swell (30 s period in a 60 s clip, so the loop is seamless)
    'night_brown_noise': ('noise', None, 60, -30, True),
    'scare_synth': ('sfx', 'Loud sudden horror jump scare stinger: a massive distorted analog synthesizer blast with a harsh '
                    'dissonant screech and a deep sub-bass boom, then an abrupt cut-off', 2.5, -9, False),
    'scare_strings': ('sfx', 'Horror movie jump scare: shrieking violin glissando slam, stabbing dissonant string cluster and a '
                      'deep impact hit, very loud and sudden', 2.5, -9, False),
    'scare_bang': ('sfx', 'A sudden, extremely loud impact boom slam with a big reverb tail, like a door being thrown shut '
                   'in an empty house', 2.0, -9, False),
    # from a childhood memory: a huge pale face drifting past each bedroom window at night, moaning; and the car it might have been
    'face_wail': ('sfx', 'A faint, haunting, distant ghostly male voice drawn out in one long wavering "eeeeyyyeeee" wail, slowly rising and falling, airy and eerie, with a little reverb, as if drifting past outside a window at night', 8.0, -17, False),
    'car_pass': ('sfx', 'A single car driving past a house on a quiet rural road at night, tires on asphalt and engine whoosh, doppler pass from one side to the other, muffled and distant as heard from inside a bedroom', 6.0, -23, False),
    'bunk_shove': ('sfx', 'A heavy thud of a child falling from a top bunk bed onto a wooden floor, wooden bed frame rattling, '
                   'then a short gasp of air', 2.5, -14, False),
    # the screaming strings (Insidious / Paranormal Activity): the thing stands there and the violins go insane
    'violin_storm': ('sfx', 'Relentless shrieking horror violins in the style of the Insidious soundtrack: extreme high screeching string glissandi, harsh '
                     'sul ponticello tremolo, dissonant clusters piling on top of each other, frantic and terrifying, no melody, no drums, '
                     'continuous and constant intensity from start to finish', 22, -13, True),
    'violin_stab': ('sfx', 'A single sudden shrieking violin stab: a harsh, very high dissonant screech with a razor sharp attack and a short reverb tail, '
                    'like a horror movie jump scare', 3.0, -9, False),
    'violin_swell': ('sfx', 'A slow terrifying swell of dissonant high violins over a low cello drone, rising from near silence to a painful shrieking '
                     'peak, then an abrupt cut to silence', 12.0, -14, False),
    'low_drone': ('sfx', 'A deep ominous dissonant drone with slow sub bass pulses, like the night tension in the Paranormal Activity films, '
                  'quiet, slowly throbbing, constant', 22, -26, True),
    'whispers': ('sfx', 'A faint chorus of creepy unintelligible whispers in an empty house at night, close and breathy, drifting left and right', 20, -27, True),
    'closet_scratch': ('sfx', 'Slow dry scratching of fingernails on the inside of a wooden closet door at night, quiet and unsettling', 6.0, -20, False),
    'ceiling_thump': ('sfx', 'A single deep heavy thump from the ceiling of a quiet house at night, then silence', 2.5, -16, False),
    'door_slam_far': ('sfx', 'A distant heavy door slamming somewhere deep in a big quiet house at night, with a long echo', 3.0, -15, False),
    # the creepy horror-movie instruments
    'waterphone': ('music', 'Instrumental only. A single creepy horror-movie instrument: a waterphone with bowed metal, eerie '
                   'rising and falling glissando whines and shimmering overtones, very sparse, lots of silence between '
                   'phrases, unsettling, quiet. Even throughout so it can loop.', 60, -26, True),
    'music_box': ('music', 'Instrumental only. A haunted detuned music box playing a slow, simple lullaby melody, slightly out '
                  'of tune, winding down and slowing, with faint reverb and a cold distant atmosphere. Quiet and eerie. '
                  'Even throughout so it can loop.', 45, -24, True),
}


def key():
    return os.environ['ELEVENLABS_API_KEY']


def post(url, body, timeout):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={'xi-api-key': key(), 'Content-Type': 'application/json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(4 * (attempt + 1))
                continue
            raise RuntimeError(f'{e.code} {e.read()[:300]}')


def ff(*args):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *args], check=True)


def finish(path, lufs):
    tmp = path + '.tmp.mp3'
    f = f'silenceremove=start_periods=1:start_threshold=-55dB,loudnorm=I={lufs}:TP=-1.0:LRA=14'
    ff('-i', path, '-af', f, '-ar', '44100', '-ac', '2', '-b:a', '128k', tmp)
    os.replace(tmp, path)


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout)


def make(id_):
    kind, prompt, secs, lufs, loops = SFX[id_]
    path = os.path.join(OUT, id_ + '.mp3')
    if kind == 'noise':
        # brown noise, rumble only (no hiss), swelling slowly: volume swell with a 30 s period fits the 60 s loop exactly
        ff('-f', 'lavfi', '-i', f'anoisesrc=d={secs}:c=brown:r=44100:a=0.8',
           '-af', "highpass=f=25,lowpass=f=500,volume='0.8+0.2*sin(2*PI*t/30)':eval=frame", '-ac', '2', '-b:a', '128k', path)
        # loudnorm would pump the swell flat; just set the level
        tmp = path + '.tmp.mp3'
        ff('-i', path, '-af', f'loudnorm=I={lufs}:TP=-1.5:LRA=20', '-ar', '44100', '-b:a', '128k', tmp)
        os.replace(tmp, path)
    else:
        if kind == 'sfx':
            audio = post('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
                         {'text': prompt, 'duration_seconds': secs, 'prompt_influence': 0.6, 'model_id': 'eleven_text_to_sound_v2'}, 120)
        else:
            audio = post('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
                         {'prompt': prompt, 'music_length_ms': int(secs * 1000)}, 600)
        if len(audio) < 800:
            raise RuntimeError(f'{id_}: suspiciously short audio ({len(audio)} bytes)')
        with open(path, 'wb') as f:
            f.write(audio)
        finish(path, lufs)
    return id_, {'file': f'assets/sfx/{id_}.mp3', 'kind': kind, 'loop': loops, 'len': round(duration(path), 3)}


def main():
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(OUT, 'sfx.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    jobs = [i for i, v in SFX.items() if (not only or i == only) and (force or not os.path.exists(os.path.join(OUT, i + '.mp3')))]
    if any(SFX[i][0] != 'noise' for i in jobs) and not os.environ.get('ELEVENLABS_API_KEY'):
        sys.exit('set ELEVENLABS_API_KEY')
    def safe(id_):
        try:
            return make(id_)
        except Exception as e:   # one failure must not lose the others
            print(f'{id_}: FAILED {e}', flush=True)
            return id_, None
    with ThreadPoolExecutor(3) as pool:
        for id_, m in pool.map(safe, jobs):
            if m:
                meta[id_] = m
                print(f'{id_}: {m}', flush=True)
    for id_, (kind, _, _, _, loops) in SFX.items():   # clips that exist but aren't listed yet
        path = os.path.join(OUT, id_ + '.mp3')
        if id_ not in meta and os.path.exists(path):
            meta[id_] = {'file': f'assets/sfx/{id_}.mp3', 'kind': kind, 'loop': loops, 'len': round(duration(path), 3)}
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
