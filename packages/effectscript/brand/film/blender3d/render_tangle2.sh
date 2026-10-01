#!/bin/zsh
# Full 4K render of tangle2: frames 1-360 with single-step motion blur, the
# accelerating last two seconds (361-420) with 4 accumulated motion-blur steps.
# Resumable (RESUME=1 skips frames already written).
cd "$(dirname "$0")"
LOG=${LOG:-/tmp/tangle2_render.log}
st=$(date +%s)
RESUME=1 /opt/homebrew/bin/blender -b -P tangle2.py -- --range 1-360 > $LOG.a 2>&1
echo "A done $(( $(date +%s) - st ))s" >> $LOG
st=$(date +%s)
RESUME=1 MB_STEPS=4 /opt/homebrew/bin/blender -b -P tangle2.py -- --range 361-420 --no-save > $LOG.b 2>&1
echo "B done $(( $(date +%s) - st ))s" >> $LOG
