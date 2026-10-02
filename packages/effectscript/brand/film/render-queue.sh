#!/bin/zsh
# Local render queue: one Blender job at a time so shots never share the GPU.
# Each finished shot gets an SDR review clip in build/deliver/shot-<name>-1080p.mp4.
set -u
cd "$(dirname "$0")"
B=/opt/homebrew/bin/blender
OUT=build/blender
LOG=$OUT/_logs/queue.log
mkdir -p $OUT/_logs
clip() { uv run --quiet --with numpy --with OpenEXR --with skia-python --with uharfbuzz --with fonttools python compose/shotclip.py "$@" >> $LOG 2>&1; }
stamp() { echo "$(date +%T) $*" | tee -a $LOG; }

# 1. salt plain v2 (no people): Modal rendered 1-60 into plain_v2; the Mac renders 61-80
stamp "plain v2 61-80 start"
[ -d $OUT/plain_v1 ] || cp -R $OUT/plain $OUT/plain_v1
$B -b -P blender-env/plain.py -- --range 61-80 --no-save > $OUT/_logs/plain_v2_61-80.log 2>&1
for f in $(seq -f "%04g" 61 80); do mv $OUT/plain/$f.exr $OUT/plain_v2/$f.exr; done
if [ "$(ls $OUT/plain_v2/*.exr | wc -l | tr -d ' ')" = 80 ]; then
  rm -rf $OUT/plain && mv $OUT/plain_v2 $OUT/plain
  stamp "plain v2 complete (80 frames), swapped in; old version kept as plain_v1"
  clip plain
else
  stamp "plain v2 INCOMPLETE, left in plain_v2"
fi

# 2. wire cathedral (EEVEE, 105 frames)
stamp "wirehall start"
RESUME=1 $B -b -P blender3d/wirehall.py > $OUT/_logs/wirehall.log 2>&1
stamp "wirehall done: $(ls $OUT/wirehall/*.exr 2>/dev/null | wc -l | tr -d ' ') frames"
clip wirehall
stamp "queue finished"
