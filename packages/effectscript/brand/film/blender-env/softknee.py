"""Apply envlib's highlight soft-knee (identity below 4.0, asymptotic to 6.5)
to finished EXR frames in place, keeping half-float RGB DWAA. Used for `plain`,
which was rendered before the knee moved into the compositor.

    blender -b --factory-startup -P softknee.py -- build/blender/plain/*.exr
"""
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import envlib as E  # noqa: E402

files = sys.argv[sys.argv.index("--") + 1 :]
sc = bpy.context.scene
E.exr_settings(sc.render.image_settings)
sc.view_settings.view_transform = "Standard"
sc.display_settings.display_device = "sRGB"
for f in files:
    im = bpy.data.images.load(f)
    im.colorspace_settings.name = "Linear Rec.709"
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    before = px[:, :3].max()
    px[:, :3] = E.softknee_np(px[:, :3])
    px[:, 3] = 1.0
    out = bpy.data.images.new("knee", w, h, float_buffer=True, alpha=False)
    out.colorspace_settings.name = "Linear Rec.709"
    out.pixels.foreach_set(px.ravel())
    tmp = f + ".tmp.exr"
    out.save_render(tmp, scene=sc)
    os.replace(tmp, f)
    print(f"{os.path.basename(f)}: max {before:.2f} -> {px[:, :3].max():.2f}", flush=True)
    bpy.data.images.remove(im)
    bpy.data.images.remove(out)
