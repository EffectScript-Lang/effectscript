"""Shot `converge` — film 58.0–68.0 s, 300 frames.

Side view of the ceremony tangle. Every strand eases from its chaotic path onto
one straight horizontal line, staggered per strand and zipped from right to
left, so mid-shot it looks like key-visuals/ceremony.jpg come to life. From
frame ~270 the frame holds exactly one bright line through the vertical centre
(y = 1080 px at 4K), full width, ~10 px thick with soft bloom, on black. `monolith` starts on that line.

Each strand is stored as its straight line position plus a `chaos` offset; a
geometry-node group blends them per point from scene time, so the .blend
replays without baked keys.
"""

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

FRAMES = 300
STRANDS = 210
POINTS = 420
DIST = 10.0  # camera distance to the line
LENS = 50.0
LINE_PX = 5.0 * C.PX  # final line thickness in pixels (10 px at 4K)
LINE_GLOW = 5.0  # final emission strength: ~5 linear core for HDR (shared with monolith)
HALF_W = DIST * 36 / LENS / 2  # half frame width at the line, metres
LINE_R = LINE_PX / 2 * (2 * HALF_W / C.W)
LINE_R /= math.sin(math.radians(60))  # a 6-sided tube is only sin(60) of its radius tall


def strands(seed=58):
    rng = np.random.default_rng(seed)
    u = np.linspace(0.0, 1.0, POINTS)
    span = HALF_W * 1.25
    line = np.zeros((STRANDS, POINTS, 3))
    line[:, :, 0] = np.linspace(-span, span, POINTS)
    chaos = np.zeros_like(line)
    for i in range(STRANDS):
        amp = rng.uniform(0.45, 1.25)
        for axis, a0 in ((0, 0.75), (1, 2.6), (2, 1.25)):
            for k in range(1, 8):
                f = k * rng.uniform(0.55, 1.45)
                a = a0 * amp * rng.uniform(0.4, 1.0) / k**0.85
                chaos[i, :, axis] += a * np.sin(2 * math.pi * f * u + rng.uniform(0, 2 * math.pi))
        chaos[i, :, 2] += rng.normal(0, 0.45)  # vertical spread so the tangle fills the frame
        chaos[i, :, 1] += rng.normal(0, 0.8)
        # heavier on the left, like the key visual
        chaos[i] *= (1.15 - 0.35 * u)[:, None]
    chaos[:, :, 1] = np.maximum(chaos[:, :, 1], -DIST + 2.0)  # keep strands off the lens

    # timing in normalised shot time T in [0, 1]: right end first, then the
    # convergence front sweeps left; everything is down by T = 0.88 (frame 264)
    start = rng.uniform(0.04, 0.30, STRANDS) ** 1.0
    dur = rng.uniform(0.22, 0.28, STRANDS)
    lag = 0.30
    t0 = start[:, None] + lag * (1.0 - u)[None, :]
    t1 = t0 + dur[:, None]
    assert t1.max() <= 0.89
    glow = np.clip(rng.lognormal(-0.5, 1.0, STRANDS), 0.06, 6.0)
    radius = np.clip(rng.lognormal(math.log(0.0011), 0.55, STRANDS), 0.0005, 0.006)
    per_point = lambda v: np.repeat(v[:, None], POINTS, 1)  # noqa: E731
    return line, {
        "chaos": chaos,
        "t0": t0,
        "t1": t1,
        "glow0": per_point(glow),
        "rad0": per_point(radius),
    }


def build():
    scene = C.new_scene(FRAMES, samples=64)
    C.compositor(scene, bloom=0.45, bloom_size=0.55, threshold=0.9, vignette=0.3)
    vol = C.world(scene, 0.0, 0.02, anisotropy=0.6)
    C.key_value(vol.inputs["Density"], "default_value", [(1, 0.02), (180, 0.012), (270, 0.0)])
    C.spot(scene, "Haze", (0.0, 3.0, 14.0), (0.0, 1.0, 0.0), 350, 55, blend=1.0, radius=1.0, volume=1.0)

    line, attrs = strands()
    obj = C.curves_object(scene, "Strands", line, attrs)
    mat = C.emission_material("StrandGlow", attr="glow")

    g = C.Graph("Converge")
    T = g.math("DIVIDE", g.math("SUBTRACT", g.frame(), 1.0), FRAMES - 1)
    k = g.node(
        "ShaderNodeMapRange",
        {"Value": T, "From Min": g.attr("t0"), "From Max": g.attr("t1"), "To Min": 1.0, "To Max": 0.0},
        interpolation_type="SMOOTHERSTEP",
        clamp=True,
    ).outputs["Result"]
    # chaos breathes slowly while it lasts
    pos = g.node("GeometryNodeInputPosition").outputs[0]
    nz = g.node("ShaderNodeTexNoise", {"Vector": pos, "W": g.math("MULTIPLY", T, 1.6), "Scale": 0.35, "Detail": 1.0},
                noise_dimensions="4D")
    wob = g.vmath("MULTIPLY_ADD", nz.outputs["Color"], (0.7, 0.9, 0.5), (-0.35, -0.45, -0.25))
    off = g.vmath("SCALE", g.vmath("ADD", g.attr("chaos", "FLOAT_VECTOR"), wob), scale=k)
    moved = g.node("GeometryNodeSetPosition", {"Geometry": g.inp, "Offset": off})
    # a strand only lights up to line brightness in the last stretch of its move
    glow = g.mix(g.math("POWER", k, 0.35), LINE_GLOW, g.attr("glow0"))
    stored = g.node("GeometryNodeStoreNamedAttribute", {"Geometry": moved.outputs[0], "Name": "glow", "Value": glow},
                    data_type="FLOAT", domain="POINT")
    C.tube_tail(g, stored.outputs[0], g.mix(k, LINE_R, g.attr("rad0")), mat, resolution=6)
    obj.modifiers.new("Converge", "NODES").node_group = g.ng

    cam = C.camera(scene, lens=LENS, fstop=1.4, focus=DIST)
    # the faintest push-in; the line stays on the optical axis (frame centre)
    for f, d in ((1, DIST + 0.6), (FRAMES, DIST)):
        C.look_at(cam, (0.0, -d, 0.0), (0.0, 0.0, 0.0))
        C.key_camera(cam, f, d)
    return scene


if __name__ == "__main__":
    args = C.parse_args()
    C.finish(build(), "converge", args)
