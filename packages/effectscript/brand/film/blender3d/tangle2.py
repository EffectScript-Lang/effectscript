"""Shot `tangle2` -- film 40.0-54.0 s, 420 frames (EEVEE).

The ceremony made physical: thousands of real cables knotting and looping in a
dark hazy void. Four families, each a separate Curves object meshed by a
geometry-node group:

* rubber   -- matte black insulated cable, fine surface noise, sheen, a thin coat
* braid    -- braided metal sleeving: procedural basket-weave normal, anisotropic
* copper   -- bare multi-strand wire (rendered neutral): helical twist normal
* fibre    -- dark fibre-optic filament carrying light pulses along its length
              (animated emission along the curve parameter); growing tips glow

Every strand is a seeded curvature-driven random walk steered through a chain
of knot centres. The tangle grows (strands extend from birth frames, newcomers
whip in with a flailing tip), the knots cinch (a stored per-point offset towards
the knot centre fades in), and the camera pushes through it with shallow depth
of field and handheld drift, accelerating over the last two seconds into an
overwhelming density. Frames ~60-170 keep a calmer, darker pocket round the
lens axis for the centred text.
"""

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fx  # noqa: E402

FRAMES = 420
STEP = 0.025  # metres between curve points
LENS = 30.0
POCKET = (60, 175)  # frames that carry the centred text


def cam_y(f):
    t = (f - 1) / fx.FPS
    return 0.2 * t + 1.7 * max(0.0, t - 12.0) ** 2


# --------------------------------------------------------------------------
# geometry


FAMILIES = {
    #          count points  radius (median, sigma, lo, hi)      curvature  profile
    "rubber": (820, 340, (0.0072, 0.40, 0.0035, 0.0180), 0.55, int(os.environ.get("RUBBER_RES", "0"))),
    "braid": (420, 360, (0.0030, 0.30, 0.0020, 0.0050), 0.8, 10),
    "copper": (480, 380, (0.0010, 0.30, 0.0006, 0.0016), 1.1, 0),
    "fibre": (520, 420, (0.0014, 0.20, 0.0010, 0.0018), 0.9, 0),
}


def knots(rng):
    """Knot centres along the push, kept off the lens axis."""
    ks = []
    y = -0.5
    while y < 24.0:
        r = rng.uniform(1.6, 2.8) if y < 10.0 else rng.uniform(0.55, 2.6)
        a = rng.uniform(0, 2 * math.pi)
        ks.append((r * math.cos(a), y, 0.7 * r * math.sin(a), rng.uniform(0.18, 0.5)))
        y += rng.uniform(0.7, 1.5)
    return np.array(ks)


def walk(rng, n, steps, tight, home, clear, K, calm):
    """Vectorised curvature random walk steered through knot chains."""
    kc, kr = K[:, :3], K[:, 3]
    # each strand visits 2-4 knots close to its home
    nk = rng.integers(2, 5, n)
    targets = np.zeros((n, 4), int)
    for i in range(n):
        cand = np.argsort(np.linalg.norm((kc - home[i]) * (0.6, 0.25, 0.6), axis=1))[:6]
        targets[i] = rng.choice(cand, 4, replace=False)
    start = home + rng.normal(0, 1, (n, 3)) * (1.2, 1.4, 0.8)
    p = start.copy()
    v = rng.normal(size=(n, 3))
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    w = rng.normal(size=(n, 3)) * tight[:, None]
    pts = np.zeros((n, steps, 3))
    seg = steps / nk
    for i in range(steps):
        pts[:, i] = p
        w += (-w / 0.5 + rng.normal(size=(n, 3)) * tight[:, None] * 2.4) * STEP
        v = v + np.cross(w, v) * STEP
        ti = np.minimum((i / seg).astype(int), nk - 1)
        tgt = kc[targets[np.arange(n), ti]]
        d = tgt - p
        dist = np.linalg.norm(d, axis=1, keepdims=True) + 1e-6
        # pull towards the knot, but orbit when close (wraps round it)
        rad = kr[targets[np.arange(n), ti]][:, None]
        pull = np.where(dist > rad, d / dist * 1.4, np.cross(d / dist, v) * 3.5 + d / dist * 0.5)
        hold = (home - p) * (0.12, 0.05, 0.18)
        radial = p * (1, 0, 1)
        rr = np.linalg.norm(radial, axis=1, keepdims=True) + 1e-6
        push = np.where(rr < clear[:, None], radial / rr * (clear[:, None] - rr) * 6.0, 0.0)
        # text pocket: strands visible during frames 60-175 keep out of a wide
        # flat ellipse round the lens axis (x 1.6 m, z 0.75 m) for y 0-9.5 m
        ex, ez = p[:, 0] / 1.6, p[:, 2] / 0.75
        er = np.sqrt(ex * ex + ez * ez) + 1e-6
        iny = np.clip(np.minimum(p[:, 1] + 0.5, 10.0 - p[:, 1]), 0, 1)
        inside = (calm * iny * np.clip(1.0 - er, 0, 1))[:, None]
        push = push + np.column_stack([ex / er / 1.6, np.zeros(n), ez / er / 0.75]) * inside * 14.0
        v = v + (pull * 0.9 + hold + push) * STEP * 3.0
        v /= np.linalg.norm(v, axis=1, keepdims=True)
        p = p + v * STEP
    # cinch: offset pulling each point towards the knots it passed (smoothly
    # blended, so overlapping knot zones never make the offset jump)
    acc = np.zeros_like(pts)
    wsum = np.zeros(pts.shape[:2])
    for j in range(targets.shape[1]):
        c = kc[targets[:, j]][:, None, :]
        r = kr[targets[:, j]][:, None]
        d = np.linalg.norm(pts - c, axis=2)
        wgt = 1.0 - np.clip((d - 0.4 * r) / (2.2 * r), 0, 1)
        wgt = wgt * wgt * (3 - 2 * wgt)
        acc += (c - pts) * (wgt * wgt)[..., None]
        wsum += wgt
    cinch = 0.62 * acc / np.maximum(wsum, 1.0)[..., None]
    return pts, cinch


def family(name, rng, K):
    count, steps, (rmed, rsig, rlo, rhi), curv, _ = FAMILIES[name]
    n = count
    u = rng.uniform(0, 1, n)
    pre = u < 0.12
    birth = np.where(pre, rng.uniform(-300, -60, n), 1 + 418 * rng.uniform(0, 1, n) ** 0.6)
    late = birth > 350
    grow = np.where(late, rng.uniform(14, 40, n), rng.uniform(25, 110, n))
    cy = np.array([cam_y(max(1.0, b)) for b in birth])
    ahead = np.where(late, rng.uniform(0.6, 4.0, n), rng.uniform(0.8, 10.0, n))
    hy = cy + ahead
    rr = np.where(late, 0.15 + 1.6 * np.sqrt(rng.uniform(0, 1, n)), 0.3 + 3.6 * np.sqrt(rng.uniform(0, 1, n)))
    a = rng.uniform(0, 2 * math.pi, n)
    home = np.column_stack([rr * np.cos(a), hy, 0.65 * rr * np.sin(a)])
    # calm pocket for the text: what the lens sees during frames 60-175
    py0, py1 = cam_y(POCKET[0]) - 0.5, cam_y(POCKET[1]) + 7.0
    in_pocket = (hy > py0) & (hy < py1) & (birth < POCKET[1] + 30)
    clear = np.where(late, 0.2, np.where(in_pocket, 1.15, 0.4))
    tight = np.clip(rng.lognormal(math.log(curv), 0.6, n), 0.2, 6.0)
    pts, cinch = walk(rng, n, steps, tight, home, clear, K, (birth < POCKET[1] + 25).astype(float))
    rad = np.clip(rng.lognormal(math.log(rmed), rsig, n), rlo, rhi)
    ul = np.repeat((np.arange(steps) * STEP)[None, :], n, 0)
    curve_attrs = {
        "birth": birth,
        "grow": grow,
        "rad": rad,
        "len": np.full(n, (steps - 1) * STEP),
        "seed": rng.uniform(0, 100, n),
        "speed": rng.uniform(1.4, 3.6, n) * rng.choice([-1, 1], n, p=[0.3, 0.7]),
        "sp": rng.uniform(2.0, 5.0, n),
        "amp": np.clip(rng.lognormal(0, 0.35, n), 0.4, 1.6) * np.where(in_pocket & ~late, 0.25, 1.0),
        "pocket": in_pocket.astype(float),
    }
    point_attrs = {"ul": ul.ravel(), "cinch": cinch.reshape(-1, 3)}
    return pts.reshape(-1, 3), [steps] * n, curve_attrs, point_attrs


# --------------------------------------------------------------------------
# geometry nodes: growth, whip, cinch, breathing, pulse phase, meshing


def cinch_amount(g, F):
    """Knots tighten over the shot, snapping hard in the last two seconds."""
    slow = g.mrange(F, 1, 360, 0.15, 0.7, "SMOOTHSTEP")
    snap = g.mrange(F, 360, 420, 0.0, 0.35, "SMOOTHSTEP")
    return g.math("ADD", slow, snap)


def strands_graph(name, material, resolution, fibre=False):
    g = fx.Graph("GN_" + name)
    F = g.frame()
    birth, grow, L = g.attr("birth"), g.attr("grow"), g.attr("len")
    k = g.node("ShaderNodeMapRange", {"Value": F, "From Min": birth, "From Max": g.math("ADD", birth, grow),
                                      "To Min": 0.0, "To Max": 1.0},
               interpolation_type="SMOOTHSTEP", clamp=True).outputs["Result"]
    k = g.math("POWER", k, 0.75)  # fast start, eased landing
    ul = g.attr("ul")
    end = g.math("MULTIPLY", k, L)
    # whip: the last 1.4 m of a growing strand flails, settling as it lands
    tipzone = g.mrange(ul, g.math("SUBTRACT", end, 1.4), end, 0.0, 1.0, "SMOOTHSTEP")
    swing = g.math("MULTIPLY", g.math("POWER", g.math("SUBTRACT", 1.0, k), 1.3), 0.45)
    wv = g.node("ShaderNodeCombineXYZ", {"X": g.math("MULTIPLY", ul, 0.9), "Y": g.attr("seed"), "Z": 0.0}).outputs[0]
    wn = g.node("ShaderNodeTexNoise", {"Vector": wv, "W": g.math("MULTIPLY", F, 0.06), "Scale": 1.0, "Detail": 1.0},
                noise_dimensions="4D").outputs["Color"]
    whip = g.vmath("SCALE", g.vmath("SUBTRACT", wn, (0.5, 0.5, 0.5)), scale=g.math("MULTIPLY", swing,
                                                                                  g.math("MULTIPLY", tipzone, 2.0)))
    # breathing: slow 4D noise so nothing ever sits still
    pos = g.position()
    bn = g.node("ShaderNodeTexNoise", {"Vector": pos, "W": g.math("MULTIPLY", F, 0.006), "Scale": 0.35,
                                       "Detail": 1.0}, noise_dimensions="4D").outputs["Color"]
    breathe = g.vmath("MULTIPLY", g.vmath("SUBTRACT", bn, (0.5, 0.5, 0.5)), (0.16, 0.12, 0.16))
    cin = g.vmath("SCALE", g.attr("cinch", "FLOAT_VECTOR"), scale=cinch_amount(g, F))
    off = g.vmath("ADD", g.vmath("ADD", whip, breathe), cin)
    geo = g.node("GeometryNodeSetPosition", {"Geometry": g.inp, "Offset": off}).outputs[0]
    geo = g.node("GeometryNodeDeleteGeometry", {"Geometry": geo, "Selection": g.math("LESS_THAN", k, 0.003)},
                 domain="CURVE").outputs[0]
    if fibre:
        # pulse phase (metres) -- linear in ul, so exact when interpolated
        ph = g.math("SUBTRACT", ul, g.math("MULTIPLY", g.attr("speed"), g.math("DIVIDE", F, fx.FPS)))
        geo = g.store(geo, "ph", ph)
        growing = g.math("LESS_THAN", k, 0.999)
        tip = g.mrange(ul, g.math("SUBTRACT", end, 0.16), end, 0.0, 1.0, "SMOOTHSTEP")
        geo = g.store(geo, "tip", g.math("MULTIPLY", tip, g.math("MULTIPLY_ADD", growing, 0.75, 0.25)))
    trim = g.node("GeometryNodeTrimCurve", {"Curve": geo}, mode="FACTOR")
    g.set(trim.inputs[2], 0.0)
    g.set(trim.inputs[3], k)
    curve = trim.outputs[0]
    if resolution:
        # smooth Catmull-Rom through the walk points, then a real tube mesh
        curve = g.node("GeometryNodeCurveSplineType", {"Curve": curve}, spline_type="CATMULL_ROM").outputs[0]
        curve = g.node("GeometryNodeSetSplineResolution", {"Geometry": curve, "Resolution": 2}).outputs[0]
        out = fx.tube(g, curve, g.attr("rad"), material, resolution)
    else:
        # thin wires stay curves: EEVEE shades them as true cylinders
        curve = g.node("GeometryNodeSetCurveRadius", {"Curve": curve, "Radius": g.attr("rad")}).outputs[0]
        out = g.node("GeometryNodeSetMaterial", {"Geometry": curve, "Material": material}).outputs[0]
    g.set(g.out, out)
    return g.ng


# --------------------------------------------------------------------------
# materials


def angle01(s):
    pc = s.vattr("pc")
    x, y, _ = s.sep(pc)
    return s.math("DIVIDE", s.math("ARCTAN2", y, x), 2 * math.pi)


def near(s, d0, d1):
    """1 close to the lens, 0 beyond d1: fades sub-pixel micro detail out so
    it does not alias into glitter."""
    vd = s.node("ShaderNodeCameraData").outputs["View Distance"]
    return s.mrange(vd, d0, d1, 1.0, 0.0, "SMOOTHSTEP")


def ridge(s, v):
    """Rounded ridge across each unit cell: sin(pi * fract(v))."""
    return s.math("SINE", s.math("MULTIPLY", s.math("FRACT", v), math.pi))


def rubber_material():
    s = fx.Shader("Rubber")
    co = s.node("ShaderNodeTexCoord").outputs["Object"]
    fine = s.noise(co, 900.0, 3.0, 0.6)
    mid = s.noise(co, 60.0, 4.0, 0.55)
    long_ = s.noise(co, 2.5, 2.0, 0.5)
    rough = s.math("ADD", s.mrange(long_, 0.3, 0.7, 0.30, 0.48), s.mrange(fine, 0.3, 0.7, -0.05, 0.05))
    h = s.math("ADD", s.math("MULTIPLY", fine, s.math("MULTIPLY", near(s, 0.5, 2.0), 0.6)),
               s.math("MULTIPLY", mid, 0.4))
    nrm = s.bump(h, 0.22, 0.0006)
    base = s.gray(s.mrange(long_, 0.3, 0.7, 0.014, 0.03))
    b = s.principled(base=base, rough=rough, spec=0.55, normal=nrm, sheen=0.35, sheen_rough=0.35, sheen_tint=1.0,
                     coat=0.18, coat_rough=0.12)
    return s.output(b.outputs[0])


def braid_material():
    s = fx.Shader("Braid")
    a = angle01(s)
    ul = s.attr("ul")
    N, pitch = 8.0, 0.014
    s1 = s.math("ADD", s.math("MULTIPLY", a, N), s.math("DIVIDE", ul, pitch))
    s2 = s.math("SUBTRACT", s.math("MULTIPLY", a, N), s.math("DIVIDE", ul, pitch))
    chk = s.math("FRACT", s.math("MULTIPLY", s.math("ADD", s.math("FLOOR", s1), s.math("FLOOR", s2)), 0.5))
    chk = s.math("GREATER_THAN", chk, 0.25)
    # within a carrier: a few parallel filaments
    f1 = s.math("MULTIPLY", ridge(s, s.math("MULTIPLY", s2, 4.0)), 0.25)
    f2 = s.math("MULTIPLY", ridge(s, s.math("MULTIPLY", s1, 4.0)), 0.25)
    h1 = s.math("ADD", ridge(s, s2), f1)
    h2 = s.math("ADD", ridge(s, s1), f2)
    h = s.node("ShaderNodeMix", {"Factor": chk, "A": h1, "B": h2}, data_type="FLOAT").outputs[0]
    fade = near(s, 0.8, 2.6)
    h = s.math("MULTIPLY_ADD", s.math("SUBTRACT", h, 0.6), fade, 0.6)
    nrm = s.bump(h, 0.65, 0.0004)
    co = s.node("ShaderNodeTexCoord").outputs["Object"]
    dirt = s.noise(co, 8.0, 3.0, 0.6)
    b = s.principled(base=s.gray(s.mrange(dirt, 0.3, 0.7, 0.28, 0.45)), metal=1.0,
                     rough=s.mrange(dirt, 0.3, 0.7, 0.22, 0.36), aniso=0.7, tangent=s.vattr("tg"), normal=nrm)
    # cavities between carriers go dark
    ao = s.mrange(h, 0.0, 0.5, 0.25, 1.0)
    mix = s.node("ShaderNodeMixShader", {"Fac": ao})
    dark = s.node("ShaderNodeBsdfDiffuse", {"Color": (0.004, 0.004, 0.004, 1)})
    s.set(mix.inputs[1], dark.outputs[0])
    s.set(mix.inputs[2], b.outputs[0])
    return s.output(mix.outputs[0])


def copper_material():
    s = fx.Shader("Copper")
    # rendered as EEVEE curves (true cylinder normals); the multi-strand lay
    # shows as a fine periodic roughness ripple along the wire when close
    ul = s.attr("ul")
    lay = s.math("MULTIPLY", ridge(s, s.math("DIVIDE", ul, 0.006)), near(s, 0.3, 1.2))
    co = s.node("ShaderNodeTexCoord").outputs["Object"]
    tar = s.noise(co, 14.0, 4.0, 0.6)
    rough = s.math("ADD", s.mrange(tar, 0.25, 0.75, 0.22, 0.38), s.math("MULTIPLY", lay, 0.12))
    b = s.principled(base=s.gray(s.mrange(tar, 0.3, 0.7, 0.35, 0.55)), metal=1.0, rough=rough)
    return s.output(b.outputs[0])


def fibre_material():
    s = fx.Shader("Fibre")
    ph = s.attr("ph")
    sp = s.attr("sp")
    x = s.math("FRACT", s.math("DIVIDE", ph, sp))
    behind = s.math("MULTIPLY", s.math("SUBTRACT", 1.0, x), sp)  # metres behind the head
    ahead = s.math("MULTIPLY", x, sp)
    tail = s.math("EXPONENT", s.math("DIVIDE", behind, -0.7))
    head = s.math("EXPONENT", s.math("MULTIPLY", s.math("POWER", s.math("DIVIDE", ahead, 0.05), 2.0), -1.0))
    pulse = s.math("MAXIMUM", tail, head)
    pulse = s.math("MULTIPLY", pulse, s.attr("amp"))
    em = s.math("ADD", s.math("MULTIPLY", pulse, 7.0), s.math("MULTIPLY", s.attr("tip"), 5.5))
    em = s.math("ADD", em, 0.04)
    b = s.principled(base=0.012, rough=0.12, spec=0.6, coat=1.0, coat_rough=0.05, emit_color=1.0, emit=em)
    return s.output(b.outputs[0])


# --------------------------------------------------------------------------
# scene


def build():
    scene = fx.new_scene(FRAMES, samples=32)
    scene.render.use_motion_blur = os.environ.get("NO_MB", "") == ""
    scene.render.motion_blur_shutter = 0.3
    scene.eevee.motion_blur_steps = int(os.environ.get("MB_STEPS", "1"))
    scene.eevee.volumetric_tile_size = "16"  # the haze is smooth here
    scene.eevee.volumetric_samples = 32
    fx.compositor(scene, bloom=0.5, bloom_size=0.62, threshold=1.3, vignette=0.38)
    fx.world(scene, 0.0, 0.016, anisotropy=0.55)

    # lights: a long soft top light catches the cable sheen; a back light far
    # down the tunnel rims everything and glows in the haze; a weak low fill
    fx.area(scene, "Top", (0.0, 9.0, 6.0), (0.0, 9.0, 0.0), 1000, size=1.2, size_y=26.0, volume=0.2)
    fx.spot(scene, "Back", (2.5, 40.0, 9.0), (0.0, 4.0, -0.5), 16000, 34, blend=1.0, radius=3.0, volume=0.6)
    kick = fx.spot(scene, "Kick", (-6.0, 2.0, -3.0), (0.0, 8.0, 0.5), 250, 50, blend=1.0, radius=2.0, volume=0.05)
    kick.data.use_shadow = False

    rng = np.random.default_rng(4040)
    K = knots(rng)
    mats = {"rubber": rubber_material(), "braid": braid_material(), "copper": copper_material(),
            "fibre": fibre_material()}
    only = os.environ.get("TANGLE_ONLY", "")
    for i, name in enumerate(FAMILIES):
        if only and name not in only.split(","):
            continue
        pts, counts, ca, pa = family(name, np.random.default_rng(4100 + i), K)
        obj = fx.curves_object(scene, name.capitalize(), pts, counts, ca, pa)
        ng = strands_graph(name, mats[name], FAMILIES[name][4], fibre=(name == "fibre"))
        obj.modifiers.new("Strands", "NODES").node_group = ng
        obj.cycles.use_deform_motion = False  # trimmed topology changes: camera blur only

    cam = fx.camera(scene, lens=LENS, fstop=2.0, focus=1.6, clip=(0.02, 120))
    rx, ry, rz = fx.SmoothNoise(11), fx.SmoothNoise(12), fx.SmoothNoise(13)
    px, pz = fx.SmoothNoise(14), fx.SmoothNoise(15)
    for f in range(1, FRAMES + 1):
        t = (f - 1) / fx.FPS
        late = fx.smoothstep(12.0, 14.0, t)
        shake = 0.003 + 0.02 * late
        jit = 1.0 + 2.5 * late
        y = cam_y(f)
        loc = (0.05 * px(t * 0.35) + 0.05 * shake * px(t * 6 * jit), y,
               0.04 * pz(t * 0.3) + 0.05 * shake * pz(t * 6 * jit))
        fx.look_at(cam, loc, (loc[0] + 0.25 * px(t * 0.2 + 4), y + 10.0, loc[2] + 0.2 * pz(t * 0.17 + 9)),
                   roll=0.04 * ry(t * 0.25) + shake * 0.6 * ry(t * 3 * jit))
        cam.rotation_euler.x += shake * rx(t * 3.1 * jit)
        cam.rotation_euler.z += shake * rz(t * 2.7 * jit)
        fx.key_camera(cam, f, 1.7 - 0.9 * fx.smoothstep(11.0, 14.0, t))
    # a soft lamp riding just above the lens keeps the nearest cables' sheen
    # alive once the camera is buried in the tangle
    lamp = fx.area(scene, "CamLamp", (0, 0, 0), (0, 0, -1), 6.0, size=0.6, volume=0.0)
    lamp.parent = cam
    lamp.data.use_shadow = False
    lamp.location = (0.0, 0.35, 0.1)
    lamp.rotation_euler = (math.radians(-35), 0, 0)
    fx.euler_unwrap(cam)
    fx.set_interp(cam)
    fx.set_interp(cam.data)
    return scene


if __name__ == "__main__":
    args = fx.parse_args()
    fx.finish(build(), "tangle2", args)
