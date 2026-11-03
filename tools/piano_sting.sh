#!/usr/bin/env bash
# Builds assets/sfx/piano_sting.mp3: a grand piano's bottom A struck as hard as it goes (doubled and a hair detuned for weight),
# with D#1 under it, the hammer's knock, a sub thump and a dark room's reverb. Samples: Salamander Grand Piano (Alexander Holm, CC BY 3.0).
# Needs curl, ffmpeg and python3. Run from the repo root.
set -euo pipefail
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
for n in A0 Ds1; do curl -sfL -o "$W/$n.mp3" "https://tonejs.github.io/audio/salamander/$n.mp3"; done
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "anoisesrc=d=4.5:c=pink:r=48000:a=0.5" -af "volume='exp(-t*1.5)':eval=frame,lowpass=f=2500,highpass=f=40,aformat=channel_layouts=stereo" "$W/ir.wav"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=f=34:d=1.2:r=48000" -af "volume='0.9*exp(-t*5)':eval=frame,aformat=channel_layouts=stereo" "$W/thump.wav"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "anoisesrc=d=0.08:c=brown:r=48000:a=0.9" -af "volume='exp(-t*60)':eval=frame,lowpass=f=1800,aformat=channel_layouts=stereo" "$W/hammer.wav"
ffmpeg -hide_banner -loglevel error -y -i "$W/A0.mp3" -i "$W/Ds1.mp3" -i "$W/A0.mp3" -i "$W/thump.wav" -i "$W/hammer.wav" -i "$W/ir.wav" -filter_complex "
[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.6[a];
[1:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=2|2,volume=0.75[b];
[2:a]aformat=sample_rates=48000:channel_layouts=stereo,asetrate=48000*0.994,aresample=48000,adelay=4|9,volume=0.7[c];
[3:a]volume=1.4[t];[4:a]volume=0.8[h];
[a][b][c][t][h]amix=inputs=5:normalize=0,acompressor=threshold=0.2:ratio=3:attack=25:release=300:makeup=2,asoftclip=type=tanh:threshold=0.9,asplit[d][w];
[w][5:a]afir=dry=0:wet=1[r];[d][r]amix=inputs=2:weights='1 0.6':normalize=0,lowshelf=f=70:g=6,atrim=0:7,afade=t=out:st=5.2:d=1.8" -ar 48000 "$W/raw.wav"
pk=$(ffmpeg -hide_banner -i "$W/raw.wav" -af volumedetect -f null - 2>&1 | grep -oP "max_volume: \K[-0-9.]+")
ffmpeg -hide_banner -loglevel error -y -i "$W/raw.wav" -af "volume=$(python3 -c "print(-0.5-($pk))")dB" -b:a 160k assets/sfx/piano_sting.mp3
echo "assets/sfx/piano_sting.mp3"
