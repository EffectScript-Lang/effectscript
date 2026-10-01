#!/bin/zsh
# Full 4K render of `thread` (Cycles, 16 samples + OIDN). Resumable.
cd "$(dirname "$0")"
LOG=${LOG:-/tmp/thread_render.log}
st=$(date +%s)
RESUME=1 /opt/homebrew/bin/blender -b -P thread.py -- --samples 16 > $LOG.a 2>&1
echo "done $(( $(date +%s) - st ))s" >> $LOG
