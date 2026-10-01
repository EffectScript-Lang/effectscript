"""Check the 3D mark against the vector mark.

Renders the extruded mark head-on through an orthographic camera, rasterises
mark.path_d() at the same scale with resvg, and reports the pixel mismatch.

    blender -b -P film/blender/verify_mark.py
"""

import math
import os
import subprocess
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

M = C.M
PX = 0.9  # pixels per master unit
OUT = os.path.join(C.BUILD, "_verify")


def main():
    os.makedirs(OUT, exist_ok=True)
    scene = C.new_scene(1, samples=16)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.use_compositing = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    C.world(scene, 0.0)
    C.build_mark(scene, C.emission_material("White", 1.0))

    cx, cy = (M.BBOX_X0 + M.BBOX_X1) / 2, (M.BBOX_Y0 + M.BBOX_Y1) / 2
    cam = C.camera(scene, clip=(0.1, 100))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = C.W / PX * C.S
    C.look_at(cam, C.mark_point(cx, cy, -20.0), C.mark_point(cx, cy, 0.0))
    scene.render.filepath = os.path.join(OUT, "render.png")
    bpy.ops.render.render(write_still=True)

    dx = C.W / 2 - (cx - M.BBOX_X0) * PX
    dy = C.H / 2 - (cy - M.BBOX_Y0) * PX
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{C.W}" height="{C.H}">'
        f'<rect width="100%" height="100%" fill="#000"/>'
        f'<path fill="#fff" d="{M.path_d(PX, dx, dy)}"/></svg>'
    )
    svg_path = os.path.join(OUT, "mark.svg")
    with open(svg_path, "w") as fh:
        fh.write(svg)
    subprocess.run(["resvg", svg_path, os.path.join(OUT, "svg.png")], check=True)

    a = load(os.path.join(OUT, "render.png")) > 0.5
    b = load(os.path.join(OUT, "svg.png")) > 0.5
    diff = a ^ b
    iou = (a & b).sum() / (a | b).sum()
    print(f"VERIFY pixels render={a.sum()} svg={b.sum()} xor={diff.sum()} IoU={iou:.5f}")
    # boundary disagreement thicker than one pixel means a real shape error
    thick = diff[1:-1, 1:-1] & diff[:-2, 1:-1] & diff[2:, 1:-1] & diff[1:-1, :-2] & diff[1:-1, 2:]
    print(f"VERIFY interior mismatch pixels (not boundary AA) = {thick.sum()}")
    img = np.stack([a * 1.0, b * 1.0, diff * 1.0], -1)
    save(img, os.path.join(OUT, "diff.png"))


def load(path):
    im = bpy.data.images.load(path)
    px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], -1)
    return px[::-1, :, 0]


def save(rgb, path):
    h, w, _ = rgb.shape
    im = bpy.data.images.new("diff", w, h)
    rgba = np.concatenate([rgb[::-1], np.ones((h, w, 1))], -1).astype(np.float32)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()


main()
