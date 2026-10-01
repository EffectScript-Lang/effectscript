"""Print luminance statistics of EXR files (run with Blender's Python):

    blender -b --factory-startup -P exrstats.py -- a.exr [b.exr ...] [--grid 4]
"""
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1 :]
grid = 0
if "--grid" in argv:
    i = argv.index("--grid")
    grid = int(argv[i + 1])
    del argv[i : i + 2]
for path in argv:
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[::-1, :, :3]  # top row first
    lum = px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    q = np.percentile(lum, [0.1, 1, 5, 25, 50, 75, 95, 99, 99.9])
    print(f"{path.split('/')[-1]} {w}x{h} min {lum.min():.4f} max {lum.max():.3f} mean {lum.mean():.3f}")
    print("  pct 0.1/1/5/25/50/75/95/99/99.9: " + " ".join(f"{v:.3f}" for v in q))
    sat = np.abs(px - px.mean(axis=2, keepdims=True)).max()
    print(f"  max channel deviation from grey: {sat:.4f}")
    if grid:
        gh, gw = h // grid, w // grid
        for r in range(grid):
            row = []
            for c in range(grid):
                blk = lum[r * gh : (r + 1) * gh, c * gw : (c + 1) * gw]
                row.append(f"{np.median(blk):6.3f}/{blk.max():6.2f}")
            print("  " + "  ".join(row))
