#!/bin/sh
# Mix the score with the Foley and mux it under the pictures.
# Deliverables (in ../build/deliver):
#   introducing-effectscript-4k-hdr10.mp4   HEVC Main10, PQ / BT.2020, HDR10 metadata
#   introducing-effectscript-4k-sdr.mp4     H.264, BT.709
#   introducing-effectscript-1080p.mp4      H.264, BT.709, for X and other social uploads
set -eu
cd "$(dirname "$0")/../build"
mkdir -p deliver
if [ -f vo.wav ] && [ -f duck.wav ]; then
  # music dips under the narrator; Foley and voice sit on top
  music=score.wav; [ -f music.wav ] && music=music.wav
  ffmpeg -y -loglevel error -i "$music" -i duck.wav -i sfx.wav -i vo.wav \
    -filter_complex "[0:a][1:a]amultiply[m];[2:a]volume=0.8[f];[3:a]volume=1.0[v];[m][f][v]amix=inputs=3:normalize=0:duration=first,volume=2dB,alimiter=limit=0.891:level=false" \
    -c:a pcm_s24le mix.wav
else
  ffmpeg -y -loglevel error -i score.wav -i sfx.wav \
    -filter_complex "[0:a]volume=1.0[m];[1:a]volume=0.9[f];[m][f]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.891:level=false" \
    -c:a pcm_s24le mix.wav
fi
name=introducing-effectscript
ffmpeg -y -loglevel error -i picture-hdr.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -tag:v hvc1 \
  -c:a aac -b:a 320k -movflags +faststart -shortest "deliver/$name-4k-hdr10.mp4"
ffmpeg -y -loglevel error -i picture-sdr.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 320k -movflags +faststart -shortest "deliver/$name-4k-sdr.mp4"
ffmpeg -y -loglevel error -i picture-sdr.mp4 -i mix.wav -map 0:v -map 1:a \
  -vf "scale=1920:1080:flags=lanczos" -c:v libx264 -preset slow -crf 17 -tune grain -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 320k -movflags +faststart -shortest "deliver/$name-1080p.mp4"
ffmpeg -hide_banner -i mix.wav -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tr -s ' '
ls -lh deliver
