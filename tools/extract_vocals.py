#!/usr/bin/env python3
"""Pull the singing out of a full recording and write it as a MIDI melody for robot-voice.html.

    python tools/extract_vocals.py song.mp3 [--out DIR] [--device auto|cpu|cuda] [--model htdemucs] [--dry-run]

Two steps: demucs separates the vocals (vocals.wav), then basic-pitch transcribes them (song.vocals.mid). Both are heavy
models; extract-vocals.cmd sets them up in tools/.venv on Windows. The result is a starting point: open the .mid in the
page, listen, and fix the notes it got wrong on the piano roll. A transcription of a copyrighted song is still the song:
fine for your own experiments, a sync licence before it goes in the trailer, and keep such files out of the repository.
"""
import argparse
import os
import shutil
import subprocess
import sys


def run(cmd, dry):
    print('  ' + ' '.join(cmd), flush=True)
    if dry:
        return 0
    return subprocess.call(cmd)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('song', help='the recording (mp3, wav, flac, m4a...)')
    ap.add_argument('--out', help='where to write (default: next to the recording)')
    ap.add_argument('--device', default='auto', choices=['auto', 'cpu', 'cuda'], help='auto uses the graphics card when torch sees one')
    ap.add_argument('--model', default='htdemucs', help='the demucs model (htdemucs, htdemucs_ft, mdx_extra)')
    ap.add_argument('--dry-run', action='store_true', help='print the steps without running the models')
    a = ap.parse_args()

    song = os.path.abspath(a.song)
    if not os.path.isfile(song):
        sys.exit(f'{a.song}: no such file')
    name = os.path.splitext(os.path.basename(song))[0]
    out = os.path.abspath(a.out or os.path.dirname(song))
    os.makedirs(out, exist_ok=True)
    work = os.path.join(out, name + '.separated')
    vocals = os.path.join(work, a.model, name, 'vocals.wav')
    device = a.device
    if device == 'auto':
        try:
            import torch  # noqa: the venv has it once demucs is installed
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
        except ImportError:
            device = 'cpu'
    print(f'{a.song}: vocals with {a.model} on {device}, then the melody with basic-pitch')

    # 1. the vocal stem
    if os.path.isfile(vocals) and not a.dry_run:
        print(f'  {os.path.relpath(vocals, out)} is already there, keeping it')
    else:
        rc = run([sys.executable, '-m', 'demucs', '--two-stems=vocals', '-n', a.model, '-d', device, '-o', work, song], a.dry_run)
        if rc:
            sys.exit(f'demucs failed ({rc})')
    stem = os.path.join(out, name + '.vocals.wav')
    if not a.dry_run:
        shutil.copyfile(vocals, stem)

    # 2. the melody. basic-pitch writes <name>_basic_pitch.mid into the folder it is given
    mid = os.path.join(out, name + '.vocals.mid')
    rc = run([sys.executable, '-m', 'basic_pitch', out, stem, '--save-midi', '--minimum-note-length', '80', '--onset-threshold', '0.6', '--frame-threshold', '0.4'], a.dry_run)
    if rc:
        sys.exit(f'basic-pitch failed ({rc})')
    if not a.dry_run:
        written = os.path.join(out, name + '.vocals_basic_pitch.mid')
        if os.path.isfile(written):
            os.replace(written, mid)
        elif not os.path.isfile(mid):
            sys.exit('basic-pitch wrote no MIDI file')
    print(f'\nwrote {os.path.relpath(stem, os.getcwd())} and {os.path.relpath(mid, os.getcwd())}')
    print('drop the .mid into tools/robot-voice.html, type the words, and fix any notes it heard wrong on the piano roll')


if __name__ == '__main__':
    main()
