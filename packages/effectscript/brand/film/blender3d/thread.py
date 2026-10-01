"""Shot `thread` -- film 55.0-61.63 s, 200 frames (Cycles + Metal, OIDN).

Black void. One perfectly taut thread (1 mm, three plied strands of twisted
fibres with fuzz) runs along world x at z = 0. The camera always sits at
z = 0 with zero pitch and roll, so the thread projects exactly onto the
horizon row -- y = 1080 px of the 4K frame -- whatever the camera's yaw.

Frames 1-120: macro (100 mm lens, 9 cm away, f/2.8), the camera yawed 38
degrees so the thread recedes in depth and the focus falls off along it,
drifting slowly sideways along the thread. Dust motes drift in the thin top
light. Frames 120-185: the camera swings square to the thread and pulls back
to ~1 m while stopping down, the thread warming to an emissive white, so by
frame ~175 the frame holds one clean bright line across the full width,
~10 px thick (matching `converge`, which the editor crossfades into).
The upper third stays dark for two lines of text at y ~ 660 and 880 px.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fx  # noqa: E402

FRAMES = 200
LENS = 100.0
R_THREAD = 0.0005  # 1 mm thread
PLY_R = 0.00026  # ply radius
PLY_OFF = 0.00024  # ply centre distance from the axis
PLY_PITCH = 0.0032  # one full twist of the plies (m)
X0, X1 = -2.0, 2.0  # thread extent (m)
FINAL_D = 1.07  # final camera distance: 1 mm -> ~10 px at 4K


# --------------------------------------------------------------------------
# camera path (pure functions of the frame, so every frame is exact)


def ease(t):
    t = fx.clamp01(t)
    return t * t * t * (t * (6 * t - 15) + 10)


def cam_state(f):
    """(focus point x, yaw radians, distance, f-stop)"""
    t = (f - 1) / (FRAMES - 1)
    # pull-out: frames 112-182
    k = ease((f - 112) / 70.0)
    yaw = math.radians(38.0 - 10.0 * fx.smoothstep(1, 112, f)) * (1 - k)
    d = math.exp(math.log(0.09) + (math.log(FINAL_D) - math.log(0.09)) * k)
    fstop = 2.8 + (11.0 - 2.8) * k
    x = -0.006 + 0.018 * t  # slow lateral drift along the thread
    return x, yaw, d, fstop


def place_camera(cam, f):
    x, yaw, d, fstop = cam_state(f)
    # camera at z = 0, looking horizontally at the focus point on the thread
    loc = (x + d * math.sin(yaw), -d * math.cos(yaw), 0.0)
    cam.location = loc
    cam.rotation_euler = (math.radians(90.0), 0.0, yaw)
    cam.data.dof.focus_distance = d
    cam.data.dof.aperture_fstop = fstop
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_euler", frame=f)
    cam.data.dof.keyframe_insert("focus_distance", frame=f)
    cam.data.dof.keyframe_insert("aperture_fstop", frame=f)


# --------------------------------------------------------------------------
# geometry


def ply_curves():
    """Three helices around the x axis (centre at z = 0)."""
    n = int((X1 - X0) / PLY_PITCH * 28)
    x = np.linspace(X0, X1, n)
    pts, counts = [], []
    for i in range(3):
        a = 2 * math.pi * (x / PLY_PITCH + i / 3)
        pts.append(np.column_stack([x, PLY_OFF * np.cos(a), PLY_OFF * np.sin(a)]))
        counts.append(n)
    ul = np.concatenate([x - X0] * 3)
    return np.concatenate(pts), counts, ul


def fuzz_curves(seed=55, count=14000, steps=7):
    """Short stray fibres rooted on the thread surface, curling outwards.
    Denser where the macro lens looks (x in -4..+6 cm)."""
    rng = np.random.default_rng(seed)
    near = rng.uniform(0, 1, count) < 0.75
    x = np.where(near, rng.uniform(-0.05, 0.07, count), rng.uniform(-0.6, 0.6, count))
    a = rng.uniform(0, 2 * math.pi, count)
    radial = np.column_stack([np.zeros(count), np.cos(a), np.sin(a)])
    root = np.column_stack([x, np.zeros(count), np.zeros(count)]) + radial * R_THREAD * 0.92
    length = np.clip(rng.lognormal(math.log(0.0006), 0.6, count), 0.00015, 0.004)
    # direction: lifted off the surface, leaning along the thread (laid fibres)
    lean = rng.normal(0, 1, count)
    d = radial * rng.uniform(0.35, 1.0, count)[:, None] + np.column_stack(
        [lean, np.zeros(count), np.zeros(count)]) * 0.9
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    curl = rng.normal(0, 1, (count, 3)) * rng.uniform(0.5, 3.0, count)[:, None]
    pts = np.zeros((count, steps, 3))
    p = root.copy()
    for i in range(steps):
        pts[:, i] = p
        d = d + np.cross(curl, d) * (1.0 / steps)
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        p = p + d * (length / (steps - 1))[:, None]
    # keep every fibre outside the thread body (roughly)
    r = np.linalg.norm(pts[:, :, 1:], axis=2, keepdims=True)
    pts[:, :, 1:] *= np.maximum(1.0, R_THREAD * 0.9 / np.maximum(r, 1e-9))
    rad = np.clip(rng.lognormal(math.log(0.0000045), 0.3, count), 0.000003, 0.000009)
    return pts.reshape(-1, 3), [steps] * count, rad


def dust_points(seed=56, count=420):
    rng = np.random.default_rng(seed)
    x = rng.uniform(-0.05, 0.07, count)
    y = rng.uniform(-0.085, 0.07, count)
    # mostly below the thread; few in the upper third (text lives there)
    z = np.where(rng.uniform(0, 1, count) < 0.8, rng.uniform(-0.03, 0.002, count), rng.uniform(0.002, 0.012, count))
    size = np.clip(rng.lognormal(math.log(0.000022), 0.45, count), 0.000008, 0.00007)
    return np.column_stack([x, y, z]), size


# --------------------------------------------------------------------------
# materials


def glow_ramp(s):
    """Emission factor 0 -> 1 over frames 128-180 (a keyed Value node, keyed
    densely end to end so extrapolation never matters)."""
    v = s.node("ShaderNodeValue")
    sock = v.outputs[0]
    for f in list(range(1, 128, 30)) + list(range(128, 181, 4)) + [200]:
        sock.default_value = ease((f - 128) / 52.0)
        sock.keyframe_insert("default_value", frame=f)
    return sock


def thread_material():
    s = fx.Shader("Thread")
    pc = s.vattr("pc")
    x, y, _ = s.sep(pc)
    ang = s.math("DIVIDE", s.math("ARCTAN2", y, x), 2 * math.pi)
    ul = s.attr("ul")
    # fibres inside each ply twist the opposite way to the ply itself
    fib = s.math("ADD", s.math("MULTIPLY", ang, 22.0), s.math("DIVIDE", ul, -0.0011))
    ridge = s.math("SINE", s.math("MULTIPLY", s.math("FRACT", fib), math.pi))
    co = s.node("ShaderNodeTexCoord").outputs["Object"]
    vec = s.vmath("MULTIPLY", co, (300.0, 3000.0, 3000.0))
    irregular = s.noise(vec, 1.0, 4.0, 0.6)
    h = s.math("ADD", s.math("MULTIPLY", ridge, 0.75), s.math("MULTIPLY", irregular, 0.5))
    nrm = s.bump(h, 0.8, 0.00004)
    tone = s.mrange(irregular, 0.3, 0.7, 0.62, 0.86)
    b = s.principled(base=s.gray(tone), rough=0.72, spec=0.3, normal=nrm, sheen=0.8, sheen_rough=0.4,
                     sheen_tint=1.0, sss=0.35, sss_radius=(0.6, 0.6, 0.6), sss_scale=0.0003, emit_color=1.0,
                     emit=s.math("MULTIPLY", glow_ramp(s), 3.2))
    return s.output(b.outputs[0])


def fuzz_material():
    s = fx.Shader("Fuzz")
    b = s.principled(base=0.8, rough=0.6, sheen=0.5, emit_color=1.0, emit=s.math("MULTIPLY", glow_ramp(s), 1.0))
    return s.output(b.outputs[0])


def dust_material():
    s = fx.Shader("Mote")
    b = s.principled(base=0.5, rough=0.5, sheen=0.5)
    return s.output(b.outputs[0])


# --------------------------------------------------------------------------
# scene


def build():
    scene = fx.new_scene(FRAMES, engine="CYCLES", samples=96)
    c = scene.cycles
    c.adaptive_threshold = 0.025
    c.adaptive_min_samples = 16
    scene.cycles_curves.shape = os.environ.get("CURVE_SHAPE", "RIBBONS")
    scene.cycles_curves.subdivisions = 2
    scene.render.film_transparent = False
    fx.compositor(scene, bloom=0.32, bloom_size=0.45, threshold=1.4, fog=0.0, vignette=0.25)
    fx.world(scene, 0.0)

    skip = os.environ.get("THREAD_SKIP", "").split(",")
    # thread: three plies meshed with a fine profile
    pts, counts, ul = ply_curves()
    plies = fx.curves_object(scene, "Plies", pts, counts, point_attrs={"ul": ul})
    g = fx.Graph("GN_Plies")
    g.set(g.out, fx.tube(g, g.inp, PLY_R, thread_material(), resolution=14))
    plies.modifiers.new("Tube", "NODES").node_group = g.ng
    plies.hide_render = "plies" in skip

    fp, fc, frad = fuzz_curves()
    fuzz = fx.curves_object(scene, "Fuzz", fp, fc, curve_attrs={"rad": frad})
    g = fx.Graph("GN_Fuzz")
    cur = g.node("GeometryNodeSetCurveRadius", {"Curve": g.inp, "Radius": g.attr("rad")}).outputs[0]
    g.set(g.out, g.node("GeometryNodeSetMaterial", {"Geometry": cur, "Material": fuzz_material()}).outputs[0])
    fuzz.modifiers.new("Fuzz", "NODES").node_group = g.ng
    fuzz.hide_render = "fuzz" in skip

    # dust motes: points instanced with spheres, drifting on time noise and
    # fading away during the pull-out
    dp, dsize = dust_points()
    me = bpy.data.meshes.new("Motes")
    me.from_pydata([tuple(p) for p in dp], [], [])
    a = me.attributes.new("size", "FLOAT", "POINT")
    a.data.foreach_set("value", dsize.astype(np.float32))
    motes = bpy.data.objects.new("Motes", me)
    scene.collection.objects.link(motes)
    g = fx.Graph("GN_Motes")
    F = g.frame()
    pos = g.position()
    nz = g.node("ShaderNodeTexNoise", {"Vector": g.vmath("SCALE", pos, scale=60.0), "W": g.math("MULTIPLY", F, 0.01),
                                       "Scale": 1.0, "Detail": 1.0}, noise_dimensions="4D").outputs["Color"]
    drift = g.vmath("ADD", g.vmath("MULTIPLY", g.vmath("SUBTRACT", nz, (0.5, 0.5, 0.5)), (0.006, 0.006, 0.004)),
                    g.vmath("SCALE", (0.00002, 0.0, -0.00003), scale=F))
    moved = g.node("GeometryNodeSetPosition", {"Geometry": g.inp, "Offset": drift}).outputs[0]
    m2p = g.node("GeometryNodeMeshToPoints", {"Mesh": moved}).outputs[0]
    fade = g.mrange(F, 120, 165, 1.0, 0.0, "SMOOTHSTEP")
    ico = g.node("GeometryNodeMeshIcoSphere", {"Radius": 1.0, "Subdivisions": 2}).outputs["Mesh"]
    inst = g.node("GeometryNodeInstanceOnPoints", {"Points": m2p, "Instance": ico,
                                                   "Scale": g.math("MULTIPLY", g.attr("size"), fade)}).outputs[0]
    g.set(g.out, g.node("GeometryNodeSetMaterial", {"Geometry": inst, "Material": dust_material()}).outputs[0])
    motes.modifiers.new("Drift", "NODES").node_group = g.ng
    motes.hide_render = "motes" in skip

    # thin top light: a long narrow strip right above the thread, plus a
    # faint back rim that makes the fuzz halo glow
    top = fx.area(scene, "Top", (0.0, 0.004, 0.06), (0.0, 0.004, 0.0), 4.0, size=1.2, size_y=0.006)
    top.data.spread = math.radians(60)
    rim = fx.area(scene, "Rim", (0.0, 0.10, 0.03), (0.0, 0.0, 0.0), 1.2, size=1.2, size_y=0.01)
    rim.data.spread = math.radians(40)

    cam = fx.camera(scene, lens=LENS, fstop=2.8, focus=0.09, clip=(0.002, 50))
    for f in range(1, FRAMES + 1):
        place_camera(cam, f)
    fx.set_interp(cam)
    fx.set_interp(cam.data)
    return scene


if __name__ == "__main__":
    args = fx.parse_args()
    fx.finish(build(), "thread", args)
