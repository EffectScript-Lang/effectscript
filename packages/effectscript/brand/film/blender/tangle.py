"""Shot `tangle` — film 40.0–54.0 s, 420 frames.

The ceremony made physical: hundreds of thin glowing strands looping and
knotting in black haze under a high key light. The tangle keeps growing (new
strands are born and extend with a hot tip) while the camera pushes slowly
into it, then accelerates with handheld shake over the last two seconds until
it is overwhelming.

Strands are curvature-driven random walks (seeded), so they coil and loop
rather than wave. Growth, tips and a slow breathing wobble are computed in a
geometry-node group from scene time.
"""

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

FRAMES = 420
STRANDS = 640
POINTS = 320
STEP = 0.035  # metres between points
LENS = 32.0


def cam_y(f):
    """Camera position along the push (metres)."""
    t = (f - 1) / C.FPS
    y = 0.32 * t
    if t > 12.0:  # last two seconds: accelerate
        y += 0.5 * 2.6 * (t - 12.0) ** 2
    return y


def strands(seed=40):
    rng = np.random.default_rng(seed)
    n = STRANDS
    # births: a sparse tangle exists at frame 1, density climbs towards the end
    u = rng.uniform(0, 1, n)
    birth = np.where(u < 0.10, rng.uniform(-150, 0, n), 1 + 400 * rng.uniform(0, 1, n) ** 0.55)
    grow = rng.uniform(45, 170, n)
    # start each strand ahead of where the camera will be when it is born
    ahead = np.array([cam_y(max(1, b)) for b in birth]) + rng.uniform(0.6, 11.0, n)
    r = 0.5 + 4.5 * np.sqrt(rng.uniform(0, 1, n))
    a = rng.uniform(0, 2 * math.pi, n)
    p = np.column_stack([r * np.cos(a), ahead, 0.6 * r * np.sin(a)])
    v = rng.normal(size=(n, 3))
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    # angular velocity: an OU process gives loops, coils and long sweeps
    tight = rng.lognormal(0.3, 0.7, n)[:, None]  # curvature scale, 1/m
    w = rng.normal(size=(n, 3)) * tight
    pts = np.zeros((n, POINTS, 3))
    centre_y = ahead.copy()
    for i in range(POINTS):
        pts[:, i] = p
        w += (-w / 0.6 + rng.normal(size=(n, 3)) * tight * 2.2) * STEP
        v = v + np.cross(w, v) * STEP
        # soft containment: stay near the strand's home and off the lens axis
        home = np.column_stack([np.zeros(n), centre_y, np.zeros(n)])
        d = home - p
        d[:, 0] *= 0.10
        d[:, 1] *= 0.06
        d[:, 2] *= 0.16
        radial = np.column_stack([p[:, 0], np.zeros(n), p[:, 2]])
        rr = np.linalg.norm(radial, axis=1, keepdims=True) + 1e-6
        push = np.where(rr < 0.8, radial / rr * (0.8 - rr) * 4.0, 0.0)
        v = v + (d + push) * STEP * 3.0
        v /= np.linalg.norm(v, axis=1, keepdims=True)
        p = p + v * STEP
    glow = np.clip(rng.lognormal(-0.5, 0.9, n), 0.08, 4.0)
    radius = np.clip(rng.lognormal(math.log(0.0017), 0.55, n), 0.0005, 0.009)
    upar = np.repeat(np.linspace(0, 1, POINTS)[None, :], n, 0)
    return pts, {"u": upar, "birth": birth, "grow": grow, "glow0": glow, "rad0": radius}


def build():
    scene = C.new_scene(FRAMES, samples=48)
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    scene.eevee.motion_blur_steps = 1
    C.compositor(scene, bloom=0.55, bloom_size=0.6, threshold=0.9, vignette=0.4)
    C.world(scene, 0.0, 0.009, anisotropy=0.5)
    # high key light: a broad cone from above lighting the haze
    C.spot(scene, "Key", (0.0, 9.0, 16.0), (0.0, 7.0, 0.0), 3000, 40, blend=1.0, radius=1.5, volume=1.0)
    C.spot(scene, "Back", (2.0, 34.0, 7.0), (0.0, 0.0, 0.0), 1500, 14, blend=0.8, radius=0.5, volume=1.0)

    pts, attrs = strands()
    obj = C.curves_object(scene, "Tangle", pts, attrs)
    mat = C.emission_material("StrandGlow", attr="glow")

    g = C.Graph("Tangle")
    frame = g.frame()
    end = g.node(
        "ShaderNodeMapRange",
        {"Value": frame, "From Min": g.attr("birth"), "From Max": g.math("ADD", g.attr("birth"), g.attr("grow")),
         "To Min": 0.0, "To Max": 1.0},
        interpolation_type="SMOOTHSTEP",
        clamp=True,
    ).outputs["Result"]
    # the growing tip burns brighter
    tip = g.math("SUBTRACT", 1.0, g.math("DIVIDE", g.math("SUBTRACT", end, g.attr("u")), 0.06))
    tip = g.math("MULTIPLY", g.math("MAXIMUM", g.math("MINIMUM", tip, 1.0), 0.0), g.math("LESS_THAN", end, 0.999))
    glow = g.math("MULTIPLY", g.attr("glow0"), g.math("MULTIPLY_ADD", tip, 3.5, 1.0))
    glow = g.math("MINIMUM", glow, 6.0)  # HDR contract: hottest cores ~4-6 linear
    stored = g.node("GeometryNodeStoreNamedAttribute", {"Geometry": g.inp, "Name": "glow", "Value": glow},
                    data_type="FLOAT", domain="POINT")
    alive = g.node("GeometryNodeDeleteGeometry", {"Geometry": stored.outputs[0], "Selection": g.math("LESS_THAN", end, 0.002)},
                   domain="CURVE")
    trim = g.node("GeometryNodeTrimCurve", {"Curve": alive.outputs[0]}, mode="FACTOR")
    g.set(trim.inputs[2], 0.0)
    g.set(trim.inputs[3], end)
    # slow breathing so the tangle never sits still
    pos = g.node("GeometryNodeInputPosition").outputs[0]
    nz = g.node("ShaderNodeTexNoise", {"Vector": pos, "W": g.math("MULTIPLY", frame, 0.004), "Scale": 0.22, "Detail": 1.0},
                noise_dimensions="4D")
    wob = g.vmath("MULTIPLY_ADD", nz.outputs["Color"], (0.5, 0.5, 0.5), (-0.25, -0.25, -0.25))
    moved = g.node("GeometryNodeSetPosition", {"Geometry": trim.outputs[0], "Offset": wob})
    C.tube_tail(g, moved.outputs[0], g.attr("rad0"), mat, resolution=6)
    obj.modifiers.new("Tangle", "NODES").node_group = g.ng

    cam = C.camera(scene, lens=LENS, fstop=1.8, focus=3.2, clip=(0.02, 200))
    rx, rz, ry = C.SmoothNoise(1), C.SmoothNoise(2), C.SmoothNoise(3)
    px, pz = C.SmoothNoise(4), C.SmoothNoise(5)
    for f in range(1, FRAMES + 1):
        t = (f - 1) / C.FPS
        shake = 0.0025 + 0.016 * C.smoothstep(12.0, 14.0, t)
        jitter = 1.0 + 2.5 * C.smoothstep(12.0, 14.0, t)  # faster shake as it accelerates
        y = cam_y(f)
        loc = (0.02 * px(t * 0.7) + 0.05 * shake * px(t * 6 * jitter), y, 0.02 * pz(t * 0.6) + 0.05 * shake * pz(t * 6 * jitter))
        C.look_at(cam, loc, (loc[0], y + 10.0, loc[2] + 0.4), roll=shake * 0.6 * ry(t * 3 * jitter))
        cam.rotation_euler.x += shake * rx(t * 3.1 * jitter)
        cam.rotation_euler.z += shake * rz(t * 2.7 * jitter)
        C.key_camera(cam, f, 3.2 - 0.8 * C.smoothstep(11.5, 14.0, t))
    C.linear_fcurves(cam)
    C.linear_fcurves(cam.data)
    return scene


if __name__ == "__main__":
    args = C.parse_args()
    C.finish(build(), "tangle", args)
