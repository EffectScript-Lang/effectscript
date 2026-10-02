"""Shot `dawn` - film 137.0-144.4 s, 222 frames.

A calm small home office at dawn, high above a hazy city. The window (far
wall, left of frame) frames a skyline of procedural towers against a low sun;
sunlight rakes through the window across the desk wall and the wooden desk,
printing the window's mullions as long slanted shapes, with volumetric shafts
and slow dust motes. Closed laptop, ceramic mug, potted plant, chair pushed
in. The lower-left stays dark for the two lines of type (baselines y~1720 and
1900 at 4K, from x=300). Slow sideways dolly; the sun rises a little and the
light grows over the shot.

    blender -b -P film/blender-env/dawn.py -- --stills 1,111,222 --res 960
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import envlib as E  # noqa: E402

FRAMES = 222
DBG = os.environ.get("DAWN_DBG", "")

# room: far (window) wall at y = WY, desk wall at x = 0, floor z = 0
WY = 3.0
WT = 0.22  # wall thickness (window reveal depth)
CEIL = 2.75
WIN_X = (-4.2, -1.25)
WIN_Z = (0.88, 2.5)
MULL_U = 0.3  # vertical mullion at 30% of the width
TRAN_V = 0.64  # transom at 64% of the height

# the visible sun (sky) and the key light direction (towards the sun)
SUN_VIS_AZ0, SUN_VIS_EL0 = math.radians(5.0), math.radians(6.6)
SUN_VIS_EL1 = math.radians(7.9)
GROUND_Z = -95.0  # the office is ~30 floors up
KEY_AZ = math.radians(-48.0)  # azimuth from +y towards -x is negative
KEY_EL0, KEY_EL1 = math.radians(19.0), math.radians(21.5)


def dir_from(az, el):
    return Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))


# --------------------------------------------------------------------------
# materials


def plaster_material():
    mat, b, out = E.material("Plaster")
    co = b.coord("Object")
    n1 = b.noise(co, 2.0, 6.0, 0.6)
    n2 = b.noise(co, 60.0, 4.0, 0.7)
    n3 = b.noise(co, 300.0, 2.0, 0.6)
    tone = b.add(b.mr(n1, 0.3, 0.7, 0.56, 0.64), b.mr(n2, 0.3, 0.7, -0.02, 0.02))
    height = b.add(b.add(b.mul(n1, 0.2), b.mul(n2, 0.6)), b.mul(n3, 0.25))
    p = b.principled(base=b.grey(tone), rough=b.mr(n2, 0.3, 0.7, 0.75, 0.92), normal=b.bump(height, 0.25, 0.0015), spec=0.35)
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


def wood_material(name="Wood", along="X", dark=0.0, plank=0.14, gloss=0.25):
    """Procedural oak-like boards: growth rings from a distorted wave along the
    board's long axis, per-board tone, pores, a satin oil finish."""
    mat, b, out = E.material(name)
    co = b.coord("Object")
    x, y, z = b.xyz(co)
    if along == "X":
        L, Wc = x, y
    else:
        L, Wc = y, x
    board = b.m("FLOOR", b.m("DIVIDE", Wc, plank))
    bseed = b.white(b.combine(board, 3.0, 1.0))
    # rings: concentric bands around an offset log centre, stretched along L
    rc = b.combine(b.mul(L, 0.08), b.add(b.mul(Wc, 1.0), b.mul(bseed, 7.0)), b.add(z, b.mul(bseed, 3.0)))
    warp = b.noise(rc, 3.0, 4.0, 0.55)
    ring_co = b.combine(b.mul(L, 0.03), b.add(Wc, b.mul(warp, 0.06)), b.add(z, b.mul(bseed, 0.4)))
    rings = b.wave(ring_co, 1.0, kind="RINGS", direction="X", distortion=0.0, profile="SAW")
    ringf = b.wave(b.v("MULTIPLY", ring_co, (1, 1, 1)), 38.0, kind="RINGS", direction="X", distortion=2.0, detail=3.0, profile="SAW")
    fib = b.noise(b.combine(b.mul(L, 1.5), b.mul(Wc, 160.0), b.mul(z, 160.0)), 1.0, 6.0, 0.6)
    pores = b.noise(b.combine(b.mul(L, 8.0), b.mul(Wc, 400.0), b.mul(z, 400.0)), 1.0, 2.0, 0.5)
    tone = b.mr(ringf, 0.0, 1.0, 0.26, 0.18)
    tone = b.add(tone, b.mr(fib, 0.3, 0.7, -0.05, 0.05))
    tone = b.add(tone, b.mr(bseed, 0.0, 1.0, -0.05, 0.05))
    tone = b.add(tone, b.mr(pores, 0.62, 0.75, 0.0, -0.06))
    tone = b.add(tone, b.mr(rings, 0.0, 1.0, 0.0, 0.0))
    tone = b.mul(tone, 1.0 - dark)
    seam = b.m("FRACT", b.m("DIVIDE", Wc, plank))
    seam = b.mr(b.m("MINIMUM", seam, b.m("SUBTRACT", 1.0, seam)), 0.0, 0.006, 1.0, 0.0)
    tone = b.add(tone, b.mul(seam, -0.12))
    rough = b.add(b.mr(fib, 0.3, 0.7, gloss - 0.05, gloss + 0.08), b.mul(b.mr(pores, 0.62, 0.75, 0.0, 1.0), 0.15))
    height = b.add(b.add(b.mul(fib, 0.3), b.mul(b.mr(pores, 0.62, 0.75, 0.0, 1.0), -0.6)), b.mul(seam, -1.0))
    p = b.principled(base=b.grey(tone), rough=rough, normal=b.bump(height, 0.2, 0.0006), spec=0.5, coat=0.25)
    p.inputs["Coat Roughness"].default_value = 0.18
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


def ceramic_material(name, tone=0.06, rough=0.12):
    mat, b, out = E.material(name)
    co = b.coord("Object")
    n = b.noise(co, 30.0, 4.0, 0.6)
    speck = b.mr(b.noise(co, 220.0, 2.0, 0.5), 0.7, 0.76, 0.0, 1.0)
    base = b.add(b.mr(n, 0.3, 0.7, tone * 0.85, tone * 1.15), b.mul(speck, 0.08))
    p = b.principled(base=b.grey(base), rough=b.mr(n, 0.3, 0.7, rough * 0.7, rough * 1.4), normal=b.bump(n, 0.05, 0.001), spec=0.5)
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


def pot_material():
    """Unglazed stoneware: matte, speckled, a little grain."""
    mat, b, out = E.material("Stoneware")
    co = b.coord("Object")
    n = b.noise(co, 25.0, 6.0, 0.6)
    speck = b.mr(b.noise(co, 300.0, 2.0, 0.5), 0.68, 0.74, 0.0, 1.0)
    base = b.add(b.mr(n, 0.3, 0.7, 0.36, 0.46), b.mul(speck, -0.18))
    p = b.principled(base=b.grey(base), rough=0.8, normal=b.bump(b.add(n, speck), 0.3, 0.0008), spec=0.3)
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


def leaf_material():
    mat, b, out = E.material("Leaf")
    co = b.coord("UV")
    u, v, _ = b.xyz(co)
    vein = b.mr(b.m("ABSOLUTE", b.add(v, -0.5)), 0.0, 0.025, 1.0, 0.0)
    side = b.mr(b.m("ABSOLUTE", b.m("SINE", b.add(b.mul(u, 22.0), b.mul(b.m("ABSOLUTE", b.add(v, -0.5)), 18.0)))), 0.0, 0.12, 1.0, 0.0)
    n = b.noise(b.coord("Object"), 40.0, 4.0, 0.6)
    tone = b.add(b.mr(n, 0.3, 0.7, 0.07, 0.11), b.add(b.mul(vein, 0.05), b.mul(side, 0.015)))
    p = b.principled(base=b.grey(tone), rough=0.38, normal=b.bump(b.add(vein, b.mul(side, 0.4)), 0.15, 0.0005), spec=0.5)
    p.inputs["Transmission Weight"].default_value = 0.0
    p.inputs["Subsurface Weight"].default_value = 0.0
    tr = b.new("ShaderNodeBsdfTranslucent")
    b.set(tr.inputs["Color"], b.grey(b.mul(tone, 2.2)))
    mix = b.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.3
    b.ln.new(p.outputs[0], mix.inputs[1])
    b.ln.new(tr.outputs[0], mix.inputs[2])
    b.ln.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def glass_material():
    """Window glass: a faint reflection, fully transparent to shadow rays."""
    mat, b, out = E.material("Glass")
    tr = b.new("ShaderNodeBsdfTransparent")
    gl = b.new("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = 0.02
    fr = b.new("ShaderNodeLayerWeight")
    fr.inputs["Blend"].default_value = 0.08
    lp = b.new("ShaderNodeLightPath")
    fac = b.mul(b.m("SUBTRACT", 1.0, lp.outputs["Is Shadow Ray"]), b.add(b.mul(fr.outputs["Fresnel"], 0.9), 0.04))
    mix = b.new("ShaderNodeMixShader")
    b.set(mix.inputs[0], fac)
    b.ln.new(tr.outputs[0], mix.inputs[1])
    b.ln.new(gl.outputs[0], mix.inputs[2])
    b.ln.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def building_material():
    """Distant towers: dark facades with faint window grids, dissolving into
    the dawn haze with distance (aerial perspective, done in the shader)."""
    mat, b, out = E.material("Tower")
    co = b.coord("Object")
    pos = b.new("ShaderNodeNewGeometry").outputs["Position"]
    x, y, z = b.xyz(pos)
    cam = b.new("ShaderNodeCameraData")
    dist = cam.outputs["View Distance"]
    # facade grid (floors 3.5 m, bays 2.2 m)
    nrm = b.new("ShaderNodeNewGeometry").outputs["Normal"]
    roof = b.mr(b.xyz(nrm)[2], 0.5, 0.9)
    bid = b.white(b.combine(b.m("FLOOR", b.mul(x, 0.03)), b.m("FLOOR", b.mul(y, 0.03)), 2.0))
    fpitch = b.add(3.2, b.mul(bid, 1.0))
    fl = b.m("FRACT", b.m("DIVIDE", z, fpitch))
    bay = b.m("FRACT", b.m("DIVIDE", b.add(x, y), b.add(1.5, b.mul(bid, 1.6))))
    win = b.mul(b.mr(fl, 0.28, 0.34, 0.0, 1.0), b.mr(fl, 0.82, 0.88, 1.0, 0.0))
    win = b.mul(win, b.mr(bay, 0.1, 0.18, 0.0, 1.0))
    win = b.mul(win, b.m("SUBTRACT", 1.0, roof))
    cellw = b.white(b.combine(b.m("FLOOR", b.m("DIVIDE", b.add(x, y), 1.8)), b.m("FLOOR", b.m("DIVIDE", z, 3.4)), 5.0))
    lit = b.mul(win, b.mr(cellw, 0.985, 0.988, 0.0, 1.0))
    wall_tone = b.add(0.05, b.mul(bid, 0.07))
    tone = b.mixf(win, wall_tone, 0.018)
    tone = b.mixf(roof, tone, b.add(0.06, b.mul(bid, 0.05)))
    p = b.principled(base=b.grey(tone), rough=b.mixf(win, 0.8, 0.12), spec=0.4)
    b.set(p.inputs["Emission Color"], E.gray(1.0))
    b.set(p.inputs["Emission Strength"], b.mul(lit, 0.12))
    # haze: luminance rises towards the horizon glow
    fog = b.m("SUBTRACT", 1.0, b.m("EXPONENT", b.mul(b.m("MAXIMUM", b.add(dist, -350.0), 0.0), -1.0 / 1700.0)))
    fog = b.mul(fog, b.mr(z, GROUND_Z, 250.0, 1.0, 0.6))
    em = b.new("ShaderNodeEmission")
    b.set(em.inputs["Strength"], 1.0)
    inc = b.new("ShaderNodeNewGeometry").outputs["Incoming"]
    sd = dir_from(SUN_VIS_AZ0, SUN_VIS_EL0)
    cs = b.v("DOT_PRODUCT", inc, tuple(-sd), out="Value")
    toward = b.mul(b.m("EXPONENT", b.mul(b.add(cs, -1.0), 1.0 / (0.3 * 0.3))), 1.6)
    hz = b.mul(b.mr(z, GROUND_Z, 200.0, 0.55, 0.32), b.add(0.45, b.mul(toward, 0.8)))
    b.set(em.inputs["Color"], b.grey(b.mul(hz, b.new("ShaderNodeValue").outputs[0])))
    hv = [nd for nd in b.n if nd.bl_idname == "ShaderNodeValue"][-1]
    hv.name = "HazeLevel"
    hv.outputs[0].default_value = 1.0
    mix = b.new("ShaderNodeMixShader")
    b.set(mix.inputs[0], fog)
    b.ln.new(p.outputs[0], mix.inputs[1])
    b.ln.new(em.outputs[0], mix.inputs[2])
    b.ln.new(mix.outputs[0], out.inputs["Surface"])
    return mat, hv


# --------------------------------------------------------------------------
# geometry helpers


def lathe(scene, name, profile, mat, segments=64, loc=(0, 0, 0)):
    """Revolve a (r, z) profile around z."""
    verts, faces = [], []
    n = len(profile)
    for s in range(segments):
        a = 2 * math.pi * s / segments
        ca, sa = math.cos(a), math.sin(a)
        for r, z in profile:
            verts.append((r * ca, r * sa, z))
    for s in range(segments):
        s2 = (s + 1) % segments
        for i in range(n - 1):
            faces.append((s * n + i, s2 * n + i, s2 * n + i + 1, s * n + i + 1))
    ob = E.mesh_object(scene, name, verts, faces, mat, smooth=True)
    ob.location = loc
    return ob


def tube(scene, name, pts, radius, mat, seg=12, loc=(0, 0, 0)):
    """A tube along a polyline (parallel-transported frames)."""
    pts = [Vector(p) for p in pts]
    verts, faces = [], []
    prev_n = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev_n is None:
            prev_n = t.orthogonal().normalized()
        n = (prev_n - t * prev_n.dot(t)).normalized()
        bnm = t.cross(n)
        prev_n = n
        r = radius(i / (len(pts) - 1)) if callable(radius) else radius
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append(tuple(p + (n * math.cos(a) + bnm * math.sin(a)) * r))
    for i in range(len(pts) - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((i * seg + k, i * seg + k2, (i + 1) * seg + k2, (i + 1) * seg + k))
    ob = E.mesh_object(scene, name, verts, faces, mat, smooth=True)
    ob.location = loc
    return ob


# --------------------------------------------------------------------------
# room


def room(scene, plaster, floor_mat, frame_mat, glass):
    x0, x1 = WIN_X
    z0, z1 = WIN_Z
    # far wall in pieces around the window opening
    W = 5.6
    xl, xr = -W, 0.25
    yb = WY + WT / 2
    pieces = [
        ((xl, z0 - 0.0), (xr, 0.0)),  # placeholder (unused)
    ]
    del pieces
    E.box(scene, "WallBelow", (xr - xl, WT, z0), ((xl + xr) / 2, yb, z0 / 2), plaster)
    E.box(scene, "WallAbove", (xr - xl, WT, CEIL - z1 + 0.3), ((xl + xr) / 2, yb, (z1 + CEIL + 0.3) / 2), plaster)
    E.box(scene, "WallLeft", (x0 - xl, WT, z1 - z0), ((xl + x0) / 2, yb, (z0 + z1) / 2), plaster)
    E.box(scene, "WallRight", (xr - x1, WT, z1 - z0), ((x1 + xr) / 2, yb, (z0 + z1) / 2), plaster)
    # desk wall, back wall, left wall, floor, ceiling
    E.box(scene, "DeskWall", (0.2, 7.0, CEIL + 0.3), (0.1, WY - 3.4, CEIL / 2), plaster)
    E.box(scene, "BackWall", (W + 0.4, 0.2, CEIL + 0.3), (-W / 2, -3.6, CEIL / 2), plaster)
    E.box(scene, "SideWall", (0.2, 7.0, CEIL + 0.3), (-W - 0.1, WY - 3.4, CEIL / 2), plaster)
    E.box(scene, "Ceiling", (W + 0.4, 7.0, 0.2), (-W / 2, WY - 3.4, CEIL + 0.1), plaster)
    fl = E.box(scene, "Floor", (W + 0.4, 7.0, 0.1), (-W / 2, WY - 3.4, -0.05), floor_mat)
    del fl
    # skirting on the desk wall and far wall
    E.box(scene, "Skirt1", (0.015, 6.9, 0.08), (-0.0075, WY - 3.4, 0.04), plaster)
    E.box(scene, "Skirt2", (W, 0.015, 0.08), (-W / 2, WY - 0.0075, 0.04), plaster)
    # sill (interior), protruding
    E.box(scene, "Sill", (x1 - x0 + 0.16, WT + 0.08, 0.035), ((x0 + x1) / 2, WY + WT / 2 - 0.04, z0 - 0.0175), plaster, bevel_w=0.006)
    # metal frame, mullion, transom, set in the middle of the reveal
    fy = WY + WT * 0.55
    fw, fd = 0.055, 0.06
    mx = x0 + (x1 - x0) * MULL_U
    tz = z0 + (z1 - z0) * TRAN_V
    E.box(scene, "FrameL", (fw, fd, z1 - z0), (x0 + fw / 2, fy, (z0 + z1) / 2), frame_mat, bevel_w=0.004)
    E.box(scene, "FrameR", (fw, fd, z1 - z0), (x1 - fw / 2, fy, (z0 + z1) / 2), frame_mat, bevel_w=0.004)
    E.box(scene, "FrameB", (x1 - x0, fd, fw), ((x0 + x1) / 2, fy, z0 + fw / 2), frame_mat, bevel_w=0.004)
    E.box(scene, "FrameT", (x1 - x0, fd, fw), ((x0 + x1) / 2, fy, z1 - fw / 2), frame_mat, bevel_w=0.004)
    E.box(scene, "Mullion", (0.045, fd, z1 - z0), (mx, fy, (z0 + z1) / 2), frame_mat, bevel_w=0.004)
    E.box(scene, "Transom", (x1 - x0, fd, 0.045), ((x0 + x1) / 2, fy, tz), frame_mat, bevel_w=0.004)
    gl = E.mesh_object(scene, "Glass", [(x0, fy + 0.01, z0), (x1, fy + 0.01, z0), (x1, fy + 0.01, z1), (x0, fy + 0.01, z1)], [(0, 1, 2, 3)], glass)
    return gl


def desk(scene, wood, dark_wood, metal):
    top_z, th = 0.76, 0.04
    xa, xb = -0.78, -0.02
    ya, yb = 0.15, WY - 0.03
    E.box(scene, "DeskTop", (xb - xa, yb - ya, th), ((xa + xb) / 2, (ya + yb) / 2, top_z - th / 2), wood, bevel_w=0.004)
    # drawer pedestal at the near end, two legs at the far end
    E.box(scene, "Pedestal", (0.66, 0.42, top_z - th - 0.01), ((xa + xb) / 2, ya + 0.24, (top_z - th) / 2), dark_wood, bevel_w=0.003)
    for i, (z0, z1) in enumerate(((0.05, 0.33), (0.36, 0.7))):
        E.box(scene, f"DrawerFront{i}", (0.006, 0.38, z1 - z0 - 0.01), (xa + 0.05, ya + 0.24, (z0 + z1) / 2), dark_wood, bevel_w=0.002)
        E.box(scene, f"Pull{i}", (0.012, 0.12, 0.012), (xa + 0.045, ya + 0.24, z1 - 0.06), metal, bevel_w=0.003)
    for y in (yb - 0.06,):
        for x in (xa + 0.05, xb - 0.05):
            E.box(scene, "Leg", (0.045, 0.045, top_z - th), (x, y, (top_z - th) / 2), dark_wood, bevel_w=0.003)
    E.box(scene, "Apron", (0.02, yb - ya - 0.5, 0.08), (xa + 0.06, (ya + yb) / 2 + 0.2, top_z - th - 0.04), dark_wood)
    return top_z


def laptop(scene, loc, yaw, alu):
    w, d, t = 0.312, 0.221, 0.0075
    base = E.box(scene, "LaptopBase", (w, d, t), (0, 0, t / 2), alu, bevel_w=0.0035)
    lid = E.box(scene, "LaptopLid", (w, d - 0.002, 0.0055), (0, 0.001, t + 0.0007 + 0.00275), alu, bevel_w=0.003)
    hinge = E.box(scene, "Hinge", (w * 0.82, 0.008, 0.009), (0, d / 2 - 0.004, t + 0.003), E.simple_material("HingeBlack", 0.02, 0.5))
    root = bpy.data.objects.new("Laptop", None)
    scene.collection.objects.link(root)
    for ob in (base, lid, hinge):
        ob.parent = root
    root.location = loc
    root.rotation_euler = (0, 0, yaw)
    return root


def mug(scene, loc, yaw, mat):
    r, h, wall = 0.041, 0.096, 0.0045
    prof = [(0.0, 0.0), (r - 0.006, 0.0), (r - 0.001, 0.002), (r, 0.008), (r + 0.0008, h - 0.004), (r - 0.0005, h), (r - wall + 0.0005, h), (r - wall, h - 0.004), (r - wall, 0.012), (r - wall - 0.004, 0.0085), (0.0, 0.0085)]
    body = lathe(scene, "Mug", prof, mat, 72)
    pts = []
    for i in range(25):
        a = -math.pi / 2 + math.pi * i / 24
        pts.append((r + 0.006 + 0.026 * math.cos(a) * 1.0, 0.0, h * 0.52 - 0.031 * math.sin(a)))
    handle = tube(scene, "MugHandle", pts, 0.0058, mat, 12)
    root = bpy.data.objects.new("MugRoot", None)
    scene.collection.objects.link(root)
    body.parent = root
    handle.parent = root
    root.location = loc
    root.rotation_euler = (0, 0, yaw)
    return root


def leaf_mesh(length, width, curl, fold, seed):
    """A heart-shaped (pothos-like) leaf: grid along the midrib, folded along
    it and curled along its length. Returns verts, faces, uvs (u along)."""
    nu, nv = 14, 7
    verts, uvs = [], []
    for i in range(nu + 1):
        u = i / nu
        wv = width * (math.sin(math.pi * min(1.0, u * 1.08)) ** 0.75) * (1.0 - 0.25 * u) + 1e-4
        for j in range(nv + 1):
            v = j / nv
            s = (v - 0.5) * 2
            x = u * length
            y = s * wv / 2
            z = -abs(s) * fold * wv * 0.5 + curl * (u**2) * length
            verts.append((x, y, z))
            uvs.append((u, v))
    faces = []
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            faces.append((a, a + nv + 1, a + nv + 2, a + 1))
    return verts, faces, uvs


def plant(scene, loc, pot_mat, leaf_mat, stem_mat, soil_mat, seed=11, n_leaves=26, scale=1.0, trailing=False):
    rng = np.random.default_rng(seed)
    root = bpy.data.objects.new("Plant", None)
    scene.collection.objects.link(root)
    pr, ph = 0.075 * scale, 0.14 * scale
    prof = [(0.0, 0.0), (pr * 0.78, 0.0), (pr * 0.8, 0.004), (pr, ph - 0.004), (pr - 0.002, ph), (pr - 0.008, ph), (pr * 0.86, ph - 0.012), (pr * 0.86, ph * 0.86), (0.0, ph * 0.86)]
    pot = lathe(scene, "Pot", prof, pot_mat, 64)
    pot.parent = root
    soil = lathe(scene, "Soil", [(0.0, ph * 0.88), (pr * 0.86, ph * 0.87)], soil_mat, 48)
    soil.parent = root
    all_v, all_f, all_uv = [], [], []
    for k in range(n_leaves):
        az = rng.uniform(0, 2 * math.pi)
        if trailing and k % 3 == 0:
            reach, rise = rng.uniform(0.15, 0.4) * scale, -rng.uniform(0.1, 0.45) * scale
        else:
            reach = rng.uniform(0.03, 0.2) * scale
            rise = rng.uniform(0.04, 0.3) * scale
        tip = Vector((math.cos(az) * reach, math.sin(az) * reach, ph * 0.86 + rise))
        mid = Vector((math.cos(az) * reach * 0.35, math.sin(az) * reach * 0.35, ph * 0.86 + rise * 0.75 + 0.02))
        pts = [Vector((math.cos(az) * 0.01, math.sin(az) * 0.01, ph * 0.86))]
        for i in range(1, 9):
            t = i / 8
            pts.append((1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * mid + t * t * tip)
        st = tube(scene, f"Stem{k}", pts, 0.0022 * scale, stem_mat, 6)
        st.parent = root
        L = rng.uniform(0.08, 0.14) * scale
        v, f, uv = leaf_mesh(L, L * rng.uniform(0.55, 0.7), rng.uniform(-0.25, 0.15), rng.uniform(0.1, 0.35), k)
        # orient: leaf points outward from the stem tip, drooping
        droop = rng.uniform(-0.9, 0.2)
        R = Matrix.Rotation(az, 3, "Z") @ Matrix.Rotation(-droop, 3, "Y") @ Matrix.Rotation(rng.uniform(-0.6, 0.6), 3, "X")
        base = len(all_v)
        for p in v:
            all_v.append(tuple(R @ Vector(p) + tip))
        for face in f:
            all_f.append(tuple(i + base for i in face))
        all_uv.extend(uv)
    me = bpy.data.meshes.new("Leaves")
    me.from_pydata(all_v, [], all_f)
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uvl.data[li].uv = all_uv[me.loops[li].vertex_index]
    me.shade_smooth()
    leaves = bpy.data.objects.new("Leaves", me)
    scene.collection.objects.link(leaves)
    me.materials.append(leaf_mat)
    leaves.parent = root
    root.location = loc
    return root


def chair(scene, loc, yaw, fabric, metal):
    root = bpy.data.objects.new("Chair", None)
    scene.collection.objects.link(root)
    parts = []
    parts.append(E.box(scene, "Seat", (0.46, 0.44, 0.07), (0, 0, 0.465), fabric, bevel_w=0.025))
    back = E.box(scene, "Back", (0.44, 0.06, 0.36), (0, 0.0, 0.0), fabric, bevel_w=0.025)
    back.location = (0, 0.215, 0.78)
    back.rotation_euler = (math.radians(-8), 0, 0)
    parts.append(back)
    for sx in (-0.2, 0.2):
        for sy in (-0.19, 0.19):
            leg = E.box(scene, "ChairLeg", (0.022, 0.022, 0.45), (sx, sy, 0.215), metal, bevel_w=0.008)
            parts.append(leg)
        up = E.box(scene, "BackPost", (0.022, 0.022, 0.42), (sx, 0.205, 0.66), metal, bevel_w=0.008)
        up.rotation_euler = (math.radians(-8), 0, 0)
        parts.append(up)
    for ob in parts:
        ob.parent = root
    root.location = loc
    root.rotation_euler = (0, 0, yaw)
    return root


def books(scene, loc, yaw, cover, pages):
    root = bpy.data.objects.new("Books", None)
    scene.collection.objects.link(root)
    z = 0.0
    rng = np.random.default_rng(5)
    for i, (w, d, t) in enumerate(((0.24, 0.17, 0.028), (0.22, 0.155, 0.022), (0.2, 0.14, 0.018))):
        c = E.box(scene, f"Book{i}", (w, d, t), (rng.uniform(-0.008, 0.008), rng.uniform(-0.006, 0.006), z + t / 2), cover, bevel_w=0.0015)
        p = E.box(scene, f"Pages{i}", (w - 0.008, d - 0.004, t - 0.004), (c.location.x + 0.004, c.location.y, z + t / 2), pages)
        c.rotation_euler = p.rotation_euler = (0, 0, rng.uniform(-0.06, 0.06))
        c.parent = p.parent = root
        z += t
    root.location = loc
    root.rotation_euler = (0, 0, yaw)
    return root


# --------------------------------------------------------------------------
# outside


def skyline(scene, mat):
    """Towers between ~250 m and 3 km in the window's view sector, standing on
    a ground 40 m below the room."""
    rng = np.random.default_rng(2026)
    verts, faces = [], []

    def add_box(cx, cy, w, d, h, z0=GROUND_Z):
        i = len(verts)
        x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
        verts.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z0 + h), (x1, y0, z0 + h), (x1, y1, z0 + h), (x0, y1, z0 + h)])  # noqa: E501
        faces.extend([(i + 0, i + 1, i + 5, i + 4), (i + 1, i + 2, i + 6, i + 5), (i + 2, i + 3, i + 7, i + 6), (i + 3, i + 0, i + 4, i + 7), (i + 4, i + 5, i + 6, i + 7)])

    for k in range(2200):
        dist = 240 + (rng.random() ** 1.15) * 3800
        az = math.radians(rng.uniform(-60, 45))
        cx, cy = math.sin(az) * dist - 2.0, math.cos(az) * dist + WY
        if 1150 < dist < 1450:  # the river
            continue
        tall = rng.random()
        dt = math.exp(-(((az - math.radians(13)) / 0.16) ** 2)) * math.exp(-(((dist - 2300) / 700) ** 2))
        near = dist < 1100
        h = (10 + 38 * tall**2) if near else (14 + 60 * tall**2)
        if not near and rng.random() < 0.8:
            h += dt * rng.uniform(80, 340)
        w = rng.uniform(14, 38) * (0.75 if h > 140 else 1.0)
        d = rng.uniform(14, 38) * (0.75 if h > 140 else 1.0)
        # tiers with setbacks
        tiers = 1 if h < 60 else rng.integers(2, 4)
        z0, hh, ww, dd = GROUND_Z, h, w, d
        for ti in range(tiers):
            seg_h = hh * (0.62 if ti < tiers - 1 else 1.0) if tiers > 1 else hh
            add_box(cx, cy, ww, dd, seg_h, z0)
            z0 += seg_h
            hh -= seg_h
            ww *= rng.uniform(0.62, 0.85)
            dd *= rng.uniform(0.62, 0.85)
            if hh <= 1:
                break
        top = z0
        if h > 160 and rng.random() < 0.45:
            add_box(cx, cy, 1.0, 1.0, rng.uniform(25, 70), top)
        # rooftop clutter on the low blocks we look down on
        if h < 80:
            for _ in range(rng.integers(0, 4)):
                add_box(cx + rng.uniform(-w, w) * 0.3, cy + rng.uniform(-d, d) * 0.3, rng.uniform(2, 6), rng.uniform(2, 6), rng.uniform(1.5, 4.5), top)
    ob = E.mesh_object(scene, "Skyline", verts, faces, mat)
    gnd = E.mesh_object(scene, "CityGround", [(-8000, 0, GROUND_Z), (8000, 0, GROUND_Z), (8000, 8000, GROUND_Z), (-8000, 8000, GROUND_Z)], [(0, 1, 2, 3)], mat)
    return ob, gnd


def world(scene):
    """Dawn sky: bright horizon band, thin stratus streaks, sun glow. Returns
    (sun direction socket node, strength value node) for animation."""
    w = bpy.data.worlds.new("Dawn")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    b = E.NB(nt)
    out = b.new("ShaderNodeOutputWorld")
    D = b.coord("Generated")
    dx, dy, dz = b.xyz(D)
    sunv = b.new("ShaderNodeCombineXYZ")
    sunv.name = "SunDir"
    sd = dir_from(SUN_VIS_AZ0, SUN_VIS_EL0)
    for i in range(3):
        sunv.inputs[i].default_value = sd[i]
    cos_a = b.v("DOT_PRODUCT", D, sunv.outputs[0], out="Value")

    def glow(sig_deg, k):
        s = math.radians(sig_deg)
        return b.mul(b.m("EXPONENT", b.mul(b.add(cos_a, -1.0), 1.0 / (s * s))), k)

    disc = b.mul(b.mr(cos_a, math.cos(math.radians(0.4)), math.cos(math.radians(0.32)), 0.0, 1.0), 6.0)
    halo = glow(1.3, 1.6)
    wide = glow(7.0, 1.0)
    broad = glow(28.0, 0.45)
    grad = b.add(b.mr(dz, -0.02, 0.3, 0.75, 0.16, interp="SMOOTHSTEP"), b.mr(dz, 0.0, 0.05, 0.3, 0.0))
    sky = b.add(b.add(grad, broad), b.add(wide, halo))
    # stratus streaks
    inv = b.m("DIVIDE", 1.0, b.m("MAXIMUM", b.add(dz, 0.03), 0.03))
    P = b.combine(b.mul(dx, inv), b.mul(b.mul(dy, inv), 2.2), 1.7)
    st = b.noise(P, 0.5, 7.0, 0.62, distort=0.9)
    st = b.mr(st, 0.42, 0.66, 0.0, 1.0, interp="SMOOTHSTEP")
    st = b.mul(st, b.mr(dz, 0.01, 0.06, 0.0, 1.0))
    # streaks are darker away from the sun, glowing near it
    cl = b.add(b.mul(sky, 0.55), b.mul(b.add(wide, halo), 0.9))
    sky = b.mixf(b.mul(st, 0.85), sky, cl)
    sky = b.add(sky, disc)  # the disc burns through the thin stratus
    lvl = b.new("ShaderNodeValue")
    lvl.name = "SkyLevel"
    lvl.outputs[0].default_value = 1.0
    bg = b.new("ShaderNodeBackground")
    b.set(bg.inputs["Color"], b.grey(b.mul(sky, lvl.outputs[0])))
    b.ln.new(bg.outputs[0], out.inputs["Surface"])
    w.cycles.sampling_method = "MANUAL"
    w.cycles.sample_map_resolution = 1024
    return sunv, lvl


def dust(scene, count, box, seed, radius):
    rng = np.random.default_rng(seed)
    pts = np.column_stack([rng.uniform(*box[i], count) for i in range(3)])
    me = bpy.data.meshes.new("DustPts")
    me.from_pydata([tuple(p) for p in pts], [], [])
    a = me.attributes.new("size", "FLOAT", "POINT")
    a.data.foreach_set("value", rng.lognormal(0.0, 0.5, count).astype(np.float32))
    ob = bpy.data.objects.new("Dust", me)
    scene.collection.objects.link(ob)
    g = bpy.data.node_groups.new("DustDrift", "GeometryNodeTree")
    g.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    g.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n, ln = g.nodes, g.links
    gi, go = n.new("NodeGroupInput"), n.new("NodeGroupOutput")
    t = n.new("GeometryNodeInputSceneTime")
    pos = n.new("GeometryNodeInputPosition")
    nz = n.new("ShaderNodeTexNoise")
    nz.noise_dimensions = "4D"
    nz.inputs["Scale"].default_value = 1.2
    nz.inputs["Detail"].default_value = 1.0
    ln.new(pos.outputs[0], nz.inputs["Vector"])
    tw = n.new("ShaderNodeMath")
    tw.operation = "MULTIPLY"
    tw.inputs[1].default_value = 0.06
    ln.new(t.outputs["Seconds"], tw.inputs[0])
    ln.new(tw.outputs[0], nz.inputs["W"])
    c = n.new("ShaderNodeVectorMath")
    c.operation = "MULTIPLY_ADD"
    c.inputs[1].default_value = (0.24, 0.24, 0.24)
    c.inputs[2].default_value = (-0.12, -0.12, -0.12)
    ln.new(nz.outputs["Color"], c.inputs[0])
    fall = n.new("ShaderNodeVectorMath")
    fall.operation = "SCALE"
    fall.inputs[0].default_value = (0.008, -0.004, -0.006)
    ln.new(t.outputs["Seconds"], fall.inputs["Scale"])
    off = n.new("ShaderNodeVectorMath")
    off.operation = "ADD"
    ln.new(c.outputs[0], off.inputs[0])
    ln.new(fall.outputs[0], off.inputs[1])
    sp = n.new("GeometryNodeSetPosition")
    ln.new(gi.outputs[0], sp.inputs["Geometry"])
    ln.new(off.outputs[0], sp.inputs["Offset"])
    m2p = n.new("GeometryNodeMeshToPoints")
    ln.new(sp.outputs[0], m2p.inputs["Mesh"])
    ico = n.new("GeometryNodeMeshIcoSphere")
    ico.inputs["Radius"].default_value = radius
    ico.inputs["Subdivisions"].default_value = 1
    sz = n.new("GeometryNodeInputNamedAttribute")
    sz.data_type = "FLOAT"
    sz.inputs["Name"].default_value = "size"
    iop = n.new("GeometryNodeInstanceOnPoints")
    ln.new(m2p.outputs[0], iop.inputs["Points"])
    ln.new(ico.outputs["Mesh"], iop.inputs["Instance"])
    ln.new(sz.outputs["Attribute"], iop.inputs["Scale"])
    setm = n.new("GeometryNodeSetMaterial")
    mat, bb, o = E.material("Mote")
    p = bb.principled(base=E.gray(0.6), rough=0.5, spec=0.5)
    tr = bb.new("ShaderNodeBsdfTranslucent")
    tr.inputs["Color"].default_value = E.gray(0.9)
    mx = bb.new("ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.6
    bb.ln.new(p.outputs[0], mx.inputs[1])
    bb.ln.new(tr.outputs[0], mx.inputs[2])
    bb.ln.new(mx.outputs[0], o.inputs["Surface"])
    setm.inputs["Material"].default_value = mat
    ln.new(iop.outputs[0], setm.inputs["Geometry"])
    ln.new(setm.outputs[0], go.inputs[0])
    mod = ob.modifiers.new("Drift", "NODES")
    mod.node_group = g
    ob.visible_shadow = False
    return ob


# --------------------------------------------------------------------------


def build():
    scene = E.new_scene(FRAMES, samples=int(os.environ.get("SAMPLES", "12")), adaptive=0.04, bounces=(4, 2, 2, 8), clamp_ind=3.0)
    c = scene.cycles
    c.volume_biased = True
    c.volume_step_rate = 4.0
    c.volume_bounces = 0
    E.compositor(scene, bloom=0.3, bloom_size=0.7, threshold=2.2, vignette=0.3, gain=1.0)

    plaster = plaster_material()
    floor_mat = wood_material("FloorWood", along="Y", dark=0.55, plank=0.19, gloss=0.35)
    desk_wood = wood_material("DeskWood", along="Y", dark=0.0, plank=0.16, gloss=0.22)
    dark_wood = wood_material("DarkWood", along="Y", dark=0.45, plank=0.5, gloss=0.3)
    frame_mat = E.simple_material("FrameMetal", 0.03, 0.35, 0.5)
    alu = E.simple_material("Aluminium", 0.75, 0.3, 0.5, metal=1.0)
    steel = E.simple_material("Steel", 0.4, 0.35, 0.5, metal=1.0)
    blackmetal = E.simple_material("ChairMetal", 0.025, 0.3, 0.5)
    fabric = E.simple_material("Fabric", 0.05, 0.9, 0.2)
    glaze = ceramic_material("MugGlaze", 0.05, 0.1)
    potm = pot_material()
    leafm = leaf_material()
    stemm = E.simple_material("Stem", 0.06, 0.5)
    soil = E.simple_material("Soil", 0.02, 0.95, 0.2)
    cover = E.simple_material("BookCover", 0.08, 0.6, 0.3)
    pages = E.simple_material("Pages", 0.6, 0.85, 0.3)

    room(scene, plaster, floor_mat, frame_mat, glass_material())
    top = desk(scene, desk_wood, dark_wood, steel)
    laptop(scene, (-0.42, 1.5, top), math.radians(84), alu)
    mug(scene, (-0.6, 1.1, top), math.radians(200), glaze)
    plant(scene, (-0.2, 1.0, top), potm, leafm, stemm, soil, seed=11, n_leaves=40, scale=1.15)
    plant(scene, (-3.75, WY + 0.02, WIN_Z[0]), potm, leafm, stemm, soil, seed=23, n_leaves=20, scale=0.9, trailing=True)
    books(scene, (-0.2, 2.6, top), math.radians(92), cover, pages)
    chair(scene, (-0.92, 2.05, 0.0), math.radians(-96), fabric, blackmetal)

    tmat, haze_level = building_material()
    skyline(scene, tmat)
    sunv, sky_level = world(scene)

    # key light (sun) through the window
    ld = bpy.data.lights.new("Sun", "SUN")
    ld.angle = math.radians(2.0)
    sun = bpy.data.objects.new("Sun", ld)
    scene.collection.objects.link(sun)
    sun.visible_glossy = True

    # room air: a faint haze everywhere, thicker (dust) along the sunbeam so
    # the shafts read without veiling the room. Near-isotropic phase: we see
    # the beam side-on.
    vmat, vb, vol, vout = E.volume_material("RoomAir", density=0.0, anisotropy=0.25)
    pos = vb.new("ShaderNodeNewGeometry").outputs["Position"]
    px, py, pz = vb.xyz(pos)
    # back-project along the key direction onto the window plane: dust only
    # where the sunbeam is (both elevation extremes covered by the margins)
    kd = dir_from(KEY_AZ, (KEY_EL0 + KEY_EL1) / 2)
    s_ = vb.mul(vb.add(py, -WY), -1.0 / kd.y)
    qx = vb.add(px, vb.mul(s_, kd.x))
    qz = vb.add(pz, vb.mul(s_, kd.z))
    m = 0.12
    inx = vb.mul(vb.mr(qx, WIN_X[0] - m, WIN_X[0] + m), vb.mr(qx, WIN_X[1] - m, WIN_X[1] + m, 1.0, 0.0))
    inz = vb.mul(vb.mr(qz, WIN_Z[0] - 0.25, WIN_Z[0] + 0.05), vb.mr(qz, WIN_Z[1] - m, WIN_Z[1] + 0.25, 1.0, 0.0))
    beam = vb.mul(inx, inz)
    # keep the shaft up and to the right: the lower left stays clean for type
    beam = vb.mul(beam, vb.mul(vb.mr(pz, 0.85, 1.6), vb.mr(px, -3.3, -2.0)))
    dn = vb.noise(pos, 1.6, 3.0, 0.55)
    beam = vb.mul(beam, vb.mr(dn, 0.3, 0.72, 0.35, 1.35))
    dens = vb.add(float(os.environ.get("AIR", "0.004")), vb.mul(beam, float(os.environ.get("BEAM", "0.32"))))
    vb.set(vol.inputs["Density"], dens)
    air = E.box(scene, "RoomAir", (5.5, 6.7, CEIL - 0.02), (-2.8, WY - 3.4, CEIL / 2), vmat)
    air.visible_shadow = False
    dust(scene, 1800, ((-2.9, -0.15), (0.4, WY - 0.15), (1.05, 2.5)), 5, 0.0004)

    # animation: sun rises a little, light grows
    for f in (1, FRAMES):
        t = (f - 1) / (FRAMES - 1)
        el = E.lerp(KEY_EL0, KEY_EL1, t)
        kd = dir_from(KEY_AZ, el)
        sun.rotation_euler = (-kd).to_track_quat("-Z", "Y").to_euler()
        sun.keyframe_insert("rotation_euler", frame=f)
        ld.energy = E.lerp(6.0, 8.5, t)
        ld.keyframe_insert("energy", frame=f)
        vd = dir_from(SUN_VIS_AZ0 + math.radians(0.6) * t, E.lerp(SUN_VIS_EL0, SUN_VIS_EL1, t))
        for i in range(3):
            sunv.inputs[i].default_value = vd[i]
            sunv.inputs[i].keyframe_insert("default_value", frame=f)
        sky_level.outputs[0].default_value = E.lerp(0.85, 1.15, t)
        sky_level.outputs[0].keyframe_insert("default_value", frame=f)
        haze_level.outputs[0].default_value = E.lerp(0.75, 1.0, t)
        haze_level.outputs[0].keyframe_insert("default_value", frame=f)
    for idb in (sun, ld, scene.world.node_tree, tmat.node_tree):
        E.set_interp(idb, "LINEAR")

    # camera: slow sideways dolly with a hint of push
    cam = E.camera(scene, lens=30, fstop=2.8, focus=3.0)
    c0, c1 = Vector((-3.05, -0.55, 1.34)), Vector((-2.75, -0.42, 1.33))
    tg0, tg1 = Vector((-1.05, 2.6, 1.02)), Vector((-0.95, 2.62, 1.0))
    for f in (1, FRAMES):
        t = (f - 1) / (FRAMES - 1)
        E.look_at(cam, c0.lerp(c1, t), tg0.lerp(tg1, t))
        E.key_camera(cam, f, focus=(Vector((-0.42, 1.5, 0.78)) - c0.lerp(c1, t)).length)
    E.set_interp(cam, "LINEAR")
    E.set_interp(cam.data, "LINEAR")
    return scene


if __name__ == "__main__":
    args = E.parse_args()
    E.finish(build(), "dawn", args, FRAMES)
