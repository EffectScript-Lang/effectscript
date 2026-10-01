"""Value ranges of a rendered EXR sequence (sampled), for the HDR report.

    blender -b -P film/blender3d/exrstats.py -- <shot> [step]

Prints per-sampled-frame luminance percentiles, the overall range, and for
`thread` the row of the brightest horizontal line (should be y = 1080).
"""

import glob
import os
import sys

import numpy as np
import OpenImageIO as oiio

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.normpath(os.path.join(HERE, "..", "build", "blender"))

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
shot = argv[0]
step = int(argv[1]) if len(argv) > 1 else 20
files = sorted(glob.glob(os.path.join(BUILD, shot, "*.exr")))
print(f"[{shot}] {len(files)} frames")
lo, hi = [], []
for f in files[::step] + [files[-1]]:
    a = oiio.ImageBuf(f).get_pixels(oiio.FLOAT)[..., :3]
    lum = a.mean(axis=2)
    q = np.percentile(lum, [0.1, 1, 50, 99, 99.9])
    lo.append(q[0])
    hi.append(lum.max())
    sat = float(np.abs(a - lum[..., None]).max())
    line = ""
    if shot == "thread":
        rows = lum.mean(axis=1)
        line = f" brightest row {int(rows.argmax())} (mean {rows.max():.3f})"
    print(f"  {os.path.basename(f)} p0.1 {q[0]:.4f} p1 {q[1]:.4f} p50 {q[2]:.4f} p99 {q[3]:.3f} "
          f"p99.9 {q[4]:.3f} max {lum.max():.2f} chroma {sat:.4f}{line}", flush=True)
print(f"[{shot}] overall p0.1 min {min(lo):.4f}  max {max(hi):.2f}")
