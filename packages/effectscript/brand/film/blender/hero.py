"""Shot `hero` — film 144.0–152.0 s, 240 frames.

The concrete ƒx monolith in the finale: a slow, low dolly-orbit, god rays from
behind and above cutting through haze, the wet black floor mirroring the mark,
drifting dust, shallow depth of field. The mark sits in the right third; the
left half stays dark for the headline composited over it.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

FRAMES = 240


def build():
    scene = C.new_scene(FRAMES, samples=96)
    C.compositor(scene, bloom=0.45, bloom_size=0.75, threshold=1.6, vignette=0.45, gain=1.6)
    st = C.stage(scene, haze=0.022, dust_count=900, dust_box=((-1.5, 4.0), (-3.5, 2.5), (0, 4.5)))

    # god rays: a hard spot behind and above, aimed back through the mark,
    # broken into shafts by a slatted occluder the camera never sees
    rays_from, rays_to = (4.5, 11.0, 8.5), (0.6, -1.6, 0.0)
    C.spot(scene, "Rays", rays_from, rays_to, 6500, 17, blend=0.3, radius=0.03, volume=2.6)
    C.slats(scene, rays_from, rays_to, 1.6, seed=3)
    # top key: the pool of light from above that grazes the faces
    C.spot(scene, "Key", (-0.4, -1.8, 6.0), (0.2, 0.0, 1.0), 2000, 30, blend=0.9, radius=0.5, volume=0.1)
    # soft front fill so the concrete reads pale, kept out of the haze
    C.area(scene, "Fill", (-4.5, -6.5, 1.6), (0.0, 0.0, 1.2), 160, size=3.0, volume=0.0)
    # rim from behind left, catching the f's edges and the floor
    rim = C.area(scene, "Rim", (-3.2, 3.0, 1.6), (0.3, 0.0, 1.0), 220, size=1.0, volume=0.0)
    rim.visible_glossy = False

    cam = C.camera(scene, lens=55, fstop=2.0)
    for f in range(1, FRAMES + 1):
        t = (f - 1) / (FRAMES - 1)
        e = C.ease_in_out(t) * 0.7 + t * 0.3
        az = math.radians(C.lerp(-30.0, -20.0, e))
        dist = C.lerp(10.4, 9.4, e)
        height = C.lerp(0.42, 0.56, e)
        loc = (math.sin(az) * dist, -math.cos(az) * dist, height)
        # the mark's optical centre sits on the right-third line
        C.aim_at_screen(scene, cam, loc, (0.0, 0.0, C.MARK_CENTER_Z), C.lerp(1430, 1460, e) * C.PX, C.lerp(560, 548, e) * C.PX)
        focus = math.dist(loc, (0.0, -C.MARK_DEPTH / 2, 1.0))
        C.key_camera(cam, f, focus)
    C.linear_fcurves(cam)
    C.linear_fcurves(cam.data)
    return scene


if __name__ == "__main__":
    args = C.parse_args()
    C.finish(build(), "hero", args)
