#!/usr/bin/env python3
"""Generate TOP BUNK's music with ElevenLabs Music.

    ELEVENLABS_API_KEY=... python3 tools/gen_music.py [--only night] [--force]

Writes assets/music/<id>.mp3 (leading silence trimmed, loudness matched) and assets/music/tracks.json, which the game
reads. Loops end on their last moment at full level, so the game can cross-fade the join. No vocals.
"""
import json, os, subprocess, sys, time, urllib.error, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'music')
STYLE = ('Instrumental only, no vocals. Quiet independent horror score: sparse, dissonant, analog. Restrained, '
         'not cheesy, not a jump-scare sting. ')

# id: (prompt, seconds, loudness LUFS, loops)
TRACKS = {
    'moving_day': (STYLE + 'Uneasy but hopeful, a family settling into an old farmhouse. Warm acoustic guitar with a '
                   'slightly out-of-tune piano, soft room tone, distant creaks. 90 BPM, D minor. Even throughout so it can loop.',
                   120, -20, True),
    'night': (STYLE + 'Late night in an empty house. Low detuned drone, a ticking clock texture, faint distant footsteps '
              'on wood, long silences between soft pulses. Very quiet and slow. Even throughout so it can loop.',
              120, -22, True),
    'chase': (STYLE + 'A child running down a long hallway, something tall is following. Pounding low heartbeat, '
              'fast tremolo strings, metallic scrapes, rising tension. 140 BPM. Steady intensity throughout so it can loop.',
              120, -17, True),
    'morning': ('Instrumental only, no vocals. Gentle sunny morning in a farmhouse: soft acoustic guitar, light '
                'whistling-style synth, birdsong-like textures, warm and bright, with a faint unease underneath. '
                'Even throughout so it can loop.', 120, -20, True),
}


def compose(prompt, seconds):
    body = json.dumps({'prompt': prompt, 'music_length_ms': int(seconds * 1000)}).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', data=body,
                                 headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(4 * (attempt + 1))
                continue
            raise RuntimeError(f'{e.code} {e.read()[:300]}')


def finish(path, lufs):
    tmp = path + '.tmp.mp3'
    f = f'silenceremove=start_periods=1:start_threshold=-55dB,loudnorm=I={lufs}:TP=-1.5:LRA=14'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', f, '-ar', '44100', '-ac', '2', '-b:a', '128k', tmp], check=True)
    os.replace(tmp, path)


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout)


def main():
    if not os.environ.get('ELEVENLABS_API_KEY'):
        sys.exit('set ELEVENLABS_API_KEY')
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(OUT, 'tracks.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for id_, (prompt, secs, lufs, loops) in TRACKS.items():
        if only and id_ != only:
            continue
        path = os.path.join(OUT, id_ + '.mp3')
        if os.path.exists(path) and not force:
            continue
        print(f'{id_}: composing {secs} s...', flush=True)
        with open(path, 'wb') as f:
            f.write(compose(prompt, secs))
        finish(path, lufs)
        meta[id_] = {'file': f'assets/music/{id_}.mp3', 'loop': loops, 'len': round(duration(path), 3)}
        print(f'  {meta[id_]}', flush=True)
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
