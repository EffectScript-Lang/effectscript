"""AgX preview PNGs of EXR frames (run with Blender):
    blender -b --factory-startup -P exrpreview.py -- out_dir width a.exr [b.exr ...]
"""
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
out, width, files = argv[0], int(argv[1]), argv[2:]
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
sc.view_settings.view_transform = "AgX"
try:
    sc.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
sc.render.image_settings.file_format = "PNG"
for f in files:
    im = bpy.data.images.load(f)
    w, h = im.size
    im.scale(width, round(h * width / w))
    im.save_render(os.path.join(out, os.path.basename(f).replace(".exr", ".png")), scene=sc)
