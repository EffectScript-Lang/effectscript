"""Shot `wirehall` -- film 46.0-49.5 s, 105 frames (EEVEE).

A cathedral-scale hall strung floor to ceiling with tens of thousands of
sagging cables: catenaries between junction knots, wall anchors and the
vault, gathered in bundles with cable ties, dangling ends and coils piled on
a wet reflective floor. One tiny figure (~1/20 of frame height) stands at
bottom centre; a single volumetric shaft falls from an opening high above,
cut into rays by the cables. The camera, low by the floor, tilts slowly up
from the figure into the tangle. The frame centre stays mid-dark for the
headline composited over it.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fx  # noqa: E402

FRAMES = 105
LENS = 24.0
CAM_H = 1.0
FIG_Y = 45.0  # figure distance (m): 1.8 m tall -> ~1/20 of frame height
HALL_X = 30.0
HALL_Z = 46.0
Y0, Y1 = 8.0, 110.0
SEG = 28  # points per cable


# --------------------------------------------------------------------------
# cable network


def catenary(a, b, sag, n=SEG):
    """Points of a hanging cable from a to b (parabolic sag, slight sway)."""
    t = np.linspace(0, 1, n)[:, None]
    p = a[None, :] * (1 - t) + b[None, :] * t
    p[:, 2] -= 4 * sag * (t[:, 0] * (1 - t[:, 0]))
    return p


def network(rng):
    """Junction knots floating in the hall plus wall / vault / pillar anchors."""
    knots = []
    for _ in range(170):
        x = rng.uniform(-HALL_X + 3, HALL_X - 3)
        y = rng.uniform(Y0 + 4, Y1 - 5)
        z = rng.uniform(8.0, HALL_Z - 4)
        knots.append((x, y, z, rng.uniform(0.5, 1.6)))
    knots = np.array(knots)
    anchors = []
    for _ in range(260):  # side walls
        s = rng.choice([-1, 1])
        anchors.append((s * HALL_X, rng.uniform(Y0, Y1), rng.uniform(6, HALL_Z)))
    for _ in range(200):  # vault
        anchors.append((rng.uniform(-HALL_X, HALL_X), rng.uniform(Y0, Y1), HALL_Z + rng.uniform(-2, 3)))
    for _ in range(60):  # back wall
        anchors.append((rng.uniform(-HALL_X, HALL_X), Y1, rng.uniform(4, HALL_Z)))
    return knots, np.array(anchors)


def cables(seed=4600):
    rng = np.random.default_rng(seed)
    knots, anchors = network(rng)
    nodes = np.vstack([knots[:, :3], anchors])
    nk = len(knots)
    pts, rad, tone = [], [], []

    def add(curve, r, g):
        pts.append(curve)
        rad.append(r)
        tone.append(g)

    # bundles between nodes: each bundle is many cables, fanned at the ends
    for _ in range(1150):
        i = rng.integers(0, nk)
        d = np.linalg.norm(nodes - nodes[i], axis=1)
        cand = np.where((d > 4.0) & (d < 26.0))[0]
        if len(cand) == 0:
            continue
        j = rng.choice(cand)
        a, b = nodes[i], nodes[j]
        span = d[j]
        sag = span * rng.uniform(0.08, 0.32)
        count = int(np.clip(rng.lognormal(math.log(8), 0.7), 2, 40))
        spread = rng.uniform(0.15, 0.6)
        for _ in range(count):
            oa = rng.normal(0, spread, 3) * (1, 1, 0.5)
            ob = rng.normal(0, spread, 3) * (1, 1, 0.5)
            c = catenary(a + oa, b + ob, sag * rng.uniform(0.85, 1.25))
            # bundle cables part a little mid-span
            t = np.linspace(0, 1, SEG)[:, None]
            c += rng.normal(0, spread * 0.6, 3)[None, :] * np.sin(np.pi * t) * rng.uniform(0.2, 1.0)
            add(c, rng.uniform(0.008, 0.03), rng.uniform(0.0, 1.0))
    # dangling ends from knots, some reaching the floor and pooling there
    for i in range(nk):
        for _ in range(rng.integers(2, 12)):
            a = knots[i, :3] + rng.normal(0, 0.4, 3)
            length = rng.uniform(3.0, a[2] + 3.0)
            t = np.linspace(0, 1, SEG)
            drift = rng.normal(0, 1.0, 2)
            x = a[0] + drift[0] * t ** 1.5
            y = a[1] + drift[1] * t ** 1.5
            z = a[2] - length * t
            # pool on the floor: once below 0, slide sideways and lie flat
            under = np.maximum(-z, 0.0)
            ang = rng.uniform(0, 2 * math.pi)
            x = x + np.cos(ang) * under
            y = y + np.sin(ang) * under
            z = np.maximum(z, 0.0) + 0.02
            add(np.column_stack([x, y, z]), rng.uniform(0.007, 0.022), rng.uniform(0.0, 1.0))
    # floor coils: random walks lying on the floor, clear of the figure's aisle
    for _ in range(500):
        p = np.array([rng.uniform(-HALL_X, HALL_X), rng.uniform(Y0, Y1), 0.02])
        if abs(p[0]) < 3.0 + 0.04 * p[1]:
            p[0] += np.sign(p[0] + 1e-3) * (3.0 + 0.04 * p[1])
        v = rng.normal(size=2)
        v /= np.linalg.norm(v)
        w = rng.normal(0, 0.8)
        c = []
        for _k in range(SEG):
            c.append(p.copy())
            ang = w * 0.5
            v = np.array([v[0] * math.cos(ang) - v[1] * math.sin(ang), v[0] * math.sin(ang) + v[1] * math.cos(ang)])
            w += rng.normal(0, 0.4)
            p[:2] += v * 0.45
            p[2] = 0.02 + 0.03 * rng.uniform()
        add(np.array(c), rng.uniform(0.01, 0.025), rng.uniform(0.0, 1.0))
    # knot balls: short curves wound tightly round each junction
    for i in range(nk):
        c0, r0 = knots[i, :3], knots[i, 3]
        for _ in range(int(30 * r0)):
            axis = rng.normal(size=3)
            axis /= np.linalg.norm(axis)
            u = np.cross(axis, rng.normal(size=3))
            u /= np.linalg.norm(u)
            v = np.cross(axis, u)
            t = np.linspace(0, rng.uniform(1.2, 2.2) * math.pi, SEG)
            rr = r0 * rng.uniform(0.35, 0.8) * (1 + 0.15 * np.sin(3 * t))
            c = c0 + (np.outer(np.cos(t), u) + np.outer(np.sin(t), v)) * rr[:, None] + np.outer(t / t[-1] - 0.5, axis) * r0 * 0.6
            add(c, rng.uniform(0.012, 0.03), rng.uniform(0.0, 1.0))
    pts = np.array(pts)
    return pts, np.array(rad), np.array(tone), knots


# --------------------------------------------------------------------------
# materials


def cable_material():
    """Pale-to-charcoal rubber: per-cable tone, fine noise, soft sheen."""
    s = fx.Shader("HallCable")
    tone = s.attr("tone")
    co = s.node("ShaderNodeTexCoord").outputs["Object"]
    grime = s.noise(co, 3.0, 4.0, 0.6)
    base = s.math("ADD", s.mrange(s.math("POWER", tone, 0.3), 0.0, 1.0, 0.03, 0.6), s.mrange(grime, 0.3, 0.7, -0.03, 0.03))
    rough = s.mrange(grime, 0.3, 0.7, 0.38, 0.58)
    b = s.principled(base=s.gray(base), rough=rough, spec=0.45, sheen=0.4, sheen_rough=0.4, sheen_tint=1.0)
    return s.output(b.outputs[0])


def floor_material():
    s = fx.Shader("HallFloor")
    co = s.node("ShaderNodeTexCoord").outputs["Object"]
    puddles = s.mrange(s.noise(co, 0.08, 5.0, 0.55), 0.42, 0.6, 0.0, 1.0)
    micro = s.noise(co, 25.0, 6.0, 0.6)
    rough = s.node("ShaderNodeMix", {"Factor": puddles, "A": s.mrange(micro, 0.3, 0.7, 0.28, 0.45),
                                     "B": s.mrange(micro, 0.3, 0.7, 0.03, 0.08)}, data_type="FLOAT").outputs[0]
    # flagstones: a faint grid of grooves
    tiles = s.node("ShaderNodeTexBrick", {"Vector": co, "Scale": 0.35, "Mortar Size": 0.004})
    tone = s.mrange(s.noise(co, 0.6, 4.0, 0.6), 0.3, 0.7, 0.006, 0.016)
    nrm = s.bump(s.math("ADD", tiles.outputs["Fac"], s.math("MULTIPLY", micro, 0.1)), 0.2, 0.01)
    b = s.principled(base=s.gray(tone), rough=rough, spec=0.5, normal=nrm)
    return s.output(b.outputs[0])


def stone_material():
    s = fx.Shader("HallStone")
    co = s.node("ShaderNodeTexCoord").outputs["Object"]
    n1 = s.noise(co, 0.8, 6.0, 0.6)
    n2 = s.noise(co, 9.0, 4.0, 0.6)
    flute = s.node("ShaderNodeTexWave", {"Vector": co, "Scale": 1.4, "Distortion": 0.3},
                   wave_type="RINGS", rings_direction="Z").outputs["Fac"]
    tone = s.math("ADD", s.mrange(n1, 0.3, 0.7, 0.06, 0.13), s.mrange(n2, 0.3, 0.7, -0.015, 0.015))
    nrm = s.bump(s.math("ADD", flute, s.math("MULTIPLY", n2, 0.5)), 0.5, 0.05)
    b = s.principled(base=s.gray(tone), rough=0.8, spec=0.3, normal=nrm)
    return s.output(b.outputs[0])


def figure_material():
    s = fx.Shader("Figure")
    b = s.principled(base=0.012, rough=0.55, spec=0.4, sheen=0.3)
    return s.output(b.outputs[0])


def haze_material():
    """Haze volume, denser high up so the shaft burns hottest at the top and
    the middle of the frame stays mid-dark."""
    s = fx.Shader("Haze")
    co = s.node("ShaderNodeTexCoord").outputs["Generated"]
    _, _, z = s.sep(co)
    dens = s.mrange(z, 0.0, 1.0, 0.0012, 0.009, "SMOOTHSTEP")  # object z: 0 floor .. 1 vault
    wisp = s.noise(s.vmath("MULTIPLY", co, (6.0, 6.0, 3.0)), 1.0, 3.0, 0.55)
    dens = s.math("MULTIPLY", dens, s.mrange(wisp, 0.3, 0.7, 0.5, 1.5))
    v = s.node("ShaderNodeVolumePrincipled", {"Density": dens, "Anisotropy": 0.65})
    s.set(v.inputs["Color"], (1, 1, 1, 1))
    s.set(s.out.inputs["Volume"], v.outputs[0])
    return s.mat


# --------------------------------------------------------------------------
# set pieces


def box(scene, name, lo, hi, mat):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return fx.mesh_object(scene, name, v, f, mat)


def pillar(scene, x, y, mat, r=1.3, h=HALL_Z + 4):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=h, location=(x, y, h / 2))
    ob = bpy.context.active_object
    ob.name = "Pillar"
    ob.data.materials.append(mat)
    ob.data.shade_smooth()
    return ob


def figure(scene, mat, at=(0.0, FIG_Y, 0.0)):
    """A simple stylised standing figure, 1.8 m: long coat, legs, head."""
    parts = []

    def add_prim(kind, loc, scale, rot=(0, 0, 0)):
        if kind == "cyl":
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=1, location=loc, rotation=rot)
        elif kind == "cone":
            bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=1, radius2=0.72, depth=1, location=loc, rotation=rot)
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=loc)
        o = bpy.context.active_object
        o.scale = scale
        parts.append(o)

    x, y, z = at
    add_prim("cyl", (x - 0.09, y, 0.42), (0.075, 0.075, 0.84))  # legs
    add_prim("cyl", (x + 0.09, y, 0.42), (0.075, 0.075, 0.84))
    add_prim("cone", (x, y, 1.08), (0.25, 0.16, 0.86))  # coat
    add_prim("cyl", (x, y, 1.45), (0.22, 0.13, 0.12))  # shoulders
    add_prim("cyl", (x - 0.24, y, 1.08), (0.06, 0.06, 0.66))  # arms
    add_prim("cyl", (x + 0.24, y, 1.08), (0.06, 0.06, 0.66))
    add_prim("cyl", (x, y, 1.57), (0.05, 0.05, 0.1))  # neck
    add_prim("sph", (x, y, 1.69), (0.1, 0.11, 0.12))  # head
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = "Figure"
    ob.data.materials.append(mat)
    ob.data.shade_smooth()
    return ob


# --------------------------------------------------------------------------
# scene


def build():
    scene = fx.new_scene(FRAMES, samples=32)
    e = scene.eevee
    e.volumetric_end = 160.0
    e.volumetric_tile_size = "8"
    e.volumetric_samples = 96
    e.volumetric_shadow_samples = 32
    e.volumetric_light_clamp = 0.0
    e.ray_tracing_options.trace_max_roughness = 0.35
    fx.compositor(scene, bloom=0.45, bloom_size=0.6, threshold=1.5, vignette=0.4)
    fx.world(scene, 0.0)

    # haze filling the hall
    haze = box(scene, "Haze", (-HALL_X - 2, -5, 0), (HALL_X + 2, Y1 + 5, HALL_Z + 6), haze_material())

    floor = fx.mesh_object(scene, "Floor", [(-60, -20, 0), (60, -20, 0), (60, 140, 0), (-60, 140, 0)],
                           [(0, 1, 2, 3)], floor_material())
    stone = stone_material()
    for s in (-1, 1):
        for y in np.arange(14.0, Y1, 12.0):
            pillar(scene, s * 21.0, y, stone, r=0.95)
        box(scene, "Wall", (s * HALL_X - (0.5 if s > 0 else -0.5) - 0.5, -5, 0),
            (s * HALL_X + (0.5 if s > 0 else -0.5) + 0.5, Y1 + 5, HALL_Z + 6), stone)
    box(scene, "BackWall", (-HALL_X - 2, Y1, 0), (HALL_X + 2, Y1 + 1, HALL_Z + 6), stone)
    # vault with an opening for the shaft
    box(scene, "VaultL", (-HALL_X - 2, -5, HALL_Z + 6), (-3.0, Y1 + 5, HALL_Z + 7), stone)
    box(scene, "VaultR", (3.0, -5, HALL_Z + 6), (HALL_X + 2, Y1 + 5, HALL_Z + 7), stone)
    box(scene, "VaultF", (-3.0, -5, HALL_Z + 6), (3.0, FIG_Y + 2.0, HALL_Z + 7), stone)
    box(scene, "VaultB", (-3.0, FIG_Y + 8.0, HALL_Z + 6), (3.0, Y1 + 5, HALL_Z + 7), stone)

    pts, rad, tone, knots = cables()
    n = len(pts)
    obj = fx.curves_object(scene, "Cables", pts.reshape(-1, 3), [SEG] * n,
                           curve_attrs={"rad": rad, "tone": tone, "seed": np.random.default_rng(1).uniform(0, 100, n)})
    g = fx.Graph("GN_Cables")
    # a very slow sway so the hall is not frozen
    F = g.frame()
    pos = g.position()
    nz = g.node("ShaderNodeTexNoise", {"Vector": g.vmath("SCALE", pos, scale=0.05), "W": g.math("MULTIPLY", F, 0.004),
                                       "Scale": 1.0, "Detail": 1.0}, noise_dimensions="4D").outputs["Color"]
    sway = g.vmath("MULTIPLY", g.vmath("SUBTRACT", nz, (0.5, 0.5, 0.5)), (0.25, 0.25, 0.08))
    moved = g.node("GeometryNodeSetPosition", {"Geometry": g.inp, "Offset": sway}).outputs[0]
    cur = g.node("GeometryNodeSetCurveRadius", {"Curve": moved, "Radius": g.attr("rad")}).outputs[0]
    g.set(g.out, g.node("GeometryNodeSetMaterial", {"Geometry": cur, "Material": cable_material()}).outputs[0])
    obj.modifiers.new("Cables", "NODES").node_group = g.ng

    figure(scene, figure_material())

    # the shaft: one tight spot through the vault opening, landing just
    # behind the figure; volumetric shadows cut it into rays
    fx.spot(scene, "Shaft", (-1.0, FIG_Y + 5.0, HALL_Z + 30.0), (0.0, FIG_Y + 3.5, 0.0), 1.2e5, 8.5,
            blend=0.35, radius=0.6, volume=15.0)
    # glow at the far end of the hall behind the figure (silhouette, floor sheen)
    fx.spot(scene, "Far", (0.0, Y1 - 2.0, 6.0), (0.0, 20.0, 0.0), 3.0e4, 40, blend=1.0, radius=3.0, volume=0.6)
    # soft high fill so the upper cables read as pale silhouettes
    fx.area(scene, "Vault", (0.0, FIG_Y + 10.0, HALL_Z + 2.0), (0.0, FIG_Y + 10.0, 0.0), 1.0e5, size=16.0,
            size_y=50.0, volume=0.08, spread=75.0)
    # skylight falling through the vault: dappled light on every cable top
    sun = bpy.data.lights.new("Sky", "SUN")
    sun.energy = 0.4
    sun.angle = math.radians(6.0)
    sun.volume_factor = 0.0
    so = bpy.data.objects.new("Sky", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(14.0), math.radians(-8.0), 0.0)

    cam = fx.camera(scene, lens=LENS, fstop=4.0, focus=FIG_Y, clip=(0.1, 400))
    for f in range(1, FRAMES + 1):
        t = (f - 1) / (FRAMES - 1)
        k = t * t * (3 - 2 * t)
        pitch = math.radians(17.4 + 19.0 * k)
        y = 0.0 + 3.0 * t  # a slight creep forward
        cam.location = (0.0, y, CAM_H)
        cam.rotation_euler = (math.radians(90.0) + pitch, 0.0, 0.0)
        cam.data.dof.focus_distance = FIG_Y - y + 4.0 * k
        fx.key_camera(cam, f, cam.data.dof.focus_distance)
    fx.set_interp(cam)
    fx.set_interp(cam.data)
    return scene


if __name__ == "__main__":
    args = fx.parse_args()
    fx.finish(build(), "wirehall", args)
