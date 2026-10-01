"""Shot `paper` - film 38.0-40.0 s, 60 frames (random frames are reused as
flash cuts at 52.5-54 s, so every frame has to stand alone).

A small office in a dark room, buried under towering stacks of printed
paper. An avalanche in progress: sheets slide off the stack tops and flutter
down (falling-leaf zigzag, rocking, tumbling, flexing), others already lie
everywhere. An old articulated desk lamp is the only warm-neutral key, its
light glowing through the falling pages; an empty office chair pushed back.
Pages carry illegible grey "printed code" (rows of short dashes, indented
like code, no glyphs). Slow push in with a slight handheld shake.

Sheet motion is procedural, written to a PC2 point cache (one sample per
frame plus pre/post roll) and played back with a Mesh Cache modifier, so
Cycles' deformation motion blur interpolates it.

    blender -b -P film/blender-env/paper.py -- --stills 1,30,60 --res 960
"""

import math
import os
import struct
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import envlib as E  # noqa: E402

FRAMES = 60
CACHE = os.path.join(E.HERE, "_cache")
A4 = (0.21, 0.297)
DESK = dict(x=(-0.85, 0.85), y=(-0.1, 0.75), top=0.76)
LAMP_POS = Vector((-0.55, 0.42, DESK["top"]))
BULB = Vector((-0.28, 0.12, 1.22))  # where the shade's bulb sits


# --------------------------------------------------------------------------
# materials


def page_material(name="Page", attr="page"):
    """Off-white paper with procedural printed code: per-page random lines of
    dashes, indented in steps, ragged right, blank lines; ink is never a
    glyph. Slight translucency so the lamp glows through hanging sheets."""
    mat, b, out = E.material(name)
    uv = b.coord("UV")
    u, v, _ = b.xyz(uv)
    pid = b.new("ShaderNodeAttribute")
    pid.attribute_name = attr
    pid.attribute_type = "GEOMETRY"
    pg = pid.outputs["Fac"]
    # text block inside the margins
    bu = b.mr(u, 0.11, 0.9, 0.0, 1.0, clamp=False)
    bv = b.mr(v, 0.93, 0.08, 0.0, 1.0, clamp=False)  # top to bottom
    inside = b.mul(b.mul(b.m("GREATER_THAN", bu, 0.0), b.m("LESS_THAN", bu, 1.0)), b.mul(b.m("GREATER_THAN", bv, 0.0), b.m("LESS_THAN", bv, 1.0)))
    nlines, ncols = 40.0, 64.0
    line = b.m("FLOOR", b.mul(bv, nlines))
    fl = b.m("FRACT", b.mul(bv, nlines))
    col = b.mul(bu, ncols)
    ci = b.m("FLOOR", col)
    fc = b.m("FRACT", col)
    r1 = b.white(b.combine(line, pg, 1.0))
    r2 = b.white(b.combine(line, pg, 2.0))
    r3 = b.white(b.combine(line, pg, 3.0))
    # indentation drifts like nested code: a smooth random walk down the page
    walk = b.noise(b.combine(b.mul(line, 0.21), pg, 4.0), 1.0, 1.0, 0.5)
    indent = b.mul(b.m("FLOOR", b.mr(b.add(walk, b.mul(r1, 0.15)), 0.32, 0.72, 0.0, 5.0)), 2.0)
    length = b.add(indent, b.add(5.0, b.mul(b.m("POWER", r2, 0.7), 46.0)))
    blank = b.m("LESS_THAN", r3, 0.14)
    # tokens: words of 2-9 chars separated by a space, some punctuation gaps
    tok = b.white(b.combine(line, b.m("FLOOR", b.mul(ci, 0.2)), b.add(pg, 5.0)))
    gap = b.m("LESS_THAN", b.white(b.combine(line, ci, b.add(pg, 6.0))), b.add(0.12, b.mul(tok, 0.14)))
    ink = b.mul(b.m("GREATER_THAN", ci, b.add(indent, -0.5)), b.m("LESS_THAN", ci, length))
    ink = b.mul(ink, b.m("SUBTRACT", 1.0, gap))
    ink = b.mul(ink, b.m("SUBTRACT", 1.0, blank))
    # each "character" is a short dash: a band in the line, inset in the cell
    band = b.mul(b.mr(fl, 0.26, 0.32, 0.0, 1.0), b.mr(fl, 0.66, 0.72, 1.0, 0.0))
    cell = b.mul(b.mr(fc, 0.04, 0.12, 0.0, 1.0), b.mr(fc, 0.88, 0.96, 1.0, 0.0))
    ink = b.mul(b.mul(b.mul(ink, band), cell), inside)
    weight = b.mr(b.white(b.combine(ci, line, b.add(pg, 7.0))), 0.0, 1.0, 0.55, 0.95)
    ink = b.mul(ink, weight)
    fibre = b.noise(b.coord("Object"), 900.0, 3.0, 0.6)
    grime = b.noise(b.combine(u, v, pg), 3.0, 4.0, 0.6)
    paper = b.add(b.mr(grime, 0.3, 0.7, 0.66, 0.76), b.mr(fibre, 0.3, 0.7, -0.015, 0.015))
    tone = b.mixf(ink, paper, 0.09)
    p = b.principled(base=b.grey(tone), rough=b.mixf(ink, 0.72, 0.5), normal=b.bump(fibre, 0.05, 0.0002), spec=0.35)
    tr = b.new("ShaderNodeBsdfTranslucent")
    b.set(tr.inputs["Color"], b.grey(b.mul(tone, 0.9)))
    mix = b.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.22
    b.ln.new(p.outputs[0], mix.inputs[1])
    b.ln.new(tr.outputs[0], mix.inputs[2])
    b.ln.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def ream_material():
    """Stack sides show sheet edges: fine horizontal lines with irregular
    tone; tops show the top sheet's print (via the page material's look)."""
    mat, b, out = E.material("ReamEdges")
    co = b.coord("Object")
    x, y, z = b.xyz(co)
    pos = b.new("ShaderNodeNewGeometry").outputs["Position"]
    wx, wy, wz = b.xyz(pos)
    nrm = b.new("ShaderNodeNewGeometry").outputs["Normal"]
    up = b.mr(b.xyz(nrm)[2], 0.6, 0.9)
    lines = b.noise(b.combine(b.mul(wx, 2.0), b.mul(wy, 2.0), b.mul(wz, 1400.0)), 1.0, 2.0, 0.5)
    wav = b.noise(b.combine(b.mul(wx, 8.0), b.mul(wy, 8.0), b.mul(wz, 40.0)), 1.0, 3.0, 0.6)
    edge = b.add(b.mr(lines, 0.3, 0.7, 0.42, 0.7), b.mr(wav, 0.3, 0.7, -0.06, 0.06))
    grime = b.noise(pos, 4.0, 4.0, 0.6)
    top = b.mr(grime, 0.3, 0.7, 0.6, 0.72)
    # faint print hint on tops (dash rows), no glyphs
    rows = b.m("FRACT", b.mul(b.add(wx, wy), 170.0))
    hint = b.mul(b.mr(rows, 0.35, 0.45, 0.0, 1.0), b.mr(rows, 0.55, 0.65, 1.0, 0.0))
    hint = b.mul(hint, b.mr(b.noise(b.combine(b.mul(wx, 60.0), b.mul(wy, 60.0), 0.0), 1.0, 2.0), 0.45, 0.5))
    top = b.mixf(b.mul(hint, 0.5), top, 0.2)
    tone = b.mixf(up, edge, top)
    p = b.principled(base=b.grey(tone), rough=0.75, normal=b.bump(lines, 0.25, 0.0004), spec=0.3)
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


def old_wood(name="DeskWood", tone=0.07):
    mat, b, out = E.material(name)
    co = b.coord("Object")
    x, y, z = b.xyz(co)
    rc = b.combine(b.mul(x, 0.6), b.mul(y, 14.0), b.mul(z, 14.0))
    warp = b.noise(rc, 1.5, 4.0, 0.6)
    ring = b.wave(b.combine(x, b.add(y, b.mul(warp, 0.08)), z), 32.0, kind="BANDS", direction="Y", distortion=3.0, detail=4.0)
    fib = b.noise(b.combine(b.mul(x, 2.0), b.mul(y, 200.0), b.mul(z, 200.0)), 1.0, 5.0, 0.6)
    wear = b.noise(co, 3.0, 5.0, 0.6)
    t = b.add(b.mr(ring, 0.0, 1.0, tone * 1.25, tone * 0.75), b.mr(fib, 0.3, 0.7, -tone * 0.15, tone * 0.15))
    t = b.add(t, b.mr(wear, 0.55, 0.75, 0.0, tone * 0.5))
    rough = b.add(b.mr(wear, 0.3, 0.7, 0.28, 0.5), b.mr(fib, 0.3, 0.7, -0.05, 0.05))
    p = b.principled(base=b.grey(t), rough=rough, normal=b.bump(b.add(fib, b.mul(ring, 0.3)), 0.12, 0.0005), spec=0.5, coat=0.3)
    p.inputs["Coat Roughness"].default_value = 0.25
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


# --------------------------------------------------------------------------
# paper geometry


def sheet_grid(nx=6, ny=8):
    xs = np.linspace(-A4[0] / 2, A4[0] / 2, nx)
    ys = np.linspace(-A4[1] / 2, A4[1] / 2, ny)
    X, Y = np.meshgrid(xs, ys, indexing="xy")
    local = np.column_stack([X.ravel(), Y.ravel(), np.zeros(X.size)])
    uv = np.column_stack([(X.ravel() / A4[0]) + 0.5, (Y.ravel() / A4[1]) + 0.5])
    faces = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            faces.append((a, a + 1, a + nx + 1, a + nx))
    return local, uv, faces


def sheets_mesh(scene, name, n, mat, nx=6, ny=8, seed=0):
    """n sheets in one mesh (rest pose: all at origin), per-face `page` id."""
    local, uv, faces = sheet_grid(nx, ny)
    nv = len(local)
    verts = np.tile(local, (n, 1))
    allf = [tuple(i + k * nv for i in f) for k in range(n) for f in faces]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], allf)
    uvl = me.uv_layers.new(name="UVMap")
    loop_v = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", loop_v)
    uvall = np.tile(uv, (n, 1))
    uvl.data.foreach_set("uv", uvall[loop_v].astype(np.float32).ravel())
    rng = np.random.default_rng(seed)
    pid = rng.uniform(0, 1000, n).astype(np.float32)
    a = me.attributes.new("page", "FLOAT", "FACE")
    a.data.foreach_set("value", np.repeat(pid, len(faces)))
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob, local, nv


def rot_matrices(yaw, pitch, roll):
    """Batched rotation matrices R = Rz(yaw) @ Rx(pitch) @ Ry(roll)."""
    cy, sy = np.cos(yaw), np.sin(yaw)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cr, sr = np.cos(roll), np.sin(roll)
    n = yaw.shape[0]
    Rz = np.zeros((n, 3, 3))
    Rz[:, 0, 0], Rz[:, 0, 1], Rz[:, 1, 0], Rz[:, 1, 1], Rz[:, 2, 2] = cy, -sy, sy, cy, 1
    Rx = np.zeros((n, 3, 3))
    Rx[:, 0, 0], Rx[:, 1, 1], Rx[:, 1, 2], Rx[:, 2, 1], Rx[:, 2, 2] = 1, cp, -sp, sp, cp
    Ry = np.zeros((n, 3, 3))
    Ry[:, 0, 0], Ry[:, 0, 2], Ry[:, 1, 1], Ry[:, 2, 0], Ry[:, 2, 2] = cr, sr, 1, -sr, cr
    return Rz @ Rx @ Ry


class Flutter:
    """Procedural falling-sheet motion.

    Each sheet rests on a stack top (or starts above frame), slides off with
    growing speed and tips over the edge, then falls like a leaf: a pendulum
    zigzag (sideways swing with the sheet rocking into the swing, gliding up a
    little at the ends), slow yaw spin, some sheets tumbling end over end,
    the paper flexing and its edges fluttering; it lands and settles flat."""

    def __init__(self, n, sources, seed=3):
        rng = np.random.default_rng(seed)
        self.n = n
        src = np.array([s[0] for s in sources])
        k = rng.integers(0, len(sources), n)
        self.start = src[k] + np.column_stack([rng.normal(0, 0.06, n), rng.normal(0, 0.06, n), rng.uniform(0, 0.03, n)])
        out = np.array([s[1] for s in sources])[k]  # outward slide direction
        ang = rng.normal(0, 0.5, n)
        ca, sa = np.cos(ang), np.sin(ang)
        self.dir = np.column_stack([out[:, 0] * ca - out[:, 1] * sa, out[:, 0] * sa + out[:, 1] * ca])
        self.dir /= np.linalg.norm(self.dir, axis=1, keepdims=True)
        self.t0 = rng.uniform(-3.4, 1.6, n)  # release times (s); film frame 1 is t=0
        self.slide = rng.uniform(0.18, 0.4, n)
        self.vt = rng.uniform(0.55, 1.25, n)  # terminal sink speed
        self.vh = rng.uniform(0.12, 0.5, n)
        self.A = rng.uniform(0.08, 0.32, n)  # swing amplitude
        self.w = rng.uniform(3.2, 6.5, n)  # swing rate (rad/s)
        self.ph = rng.uniform(0, 2 * math.pi, n)
        self.rock = rng.uniform(0.35, 0.95, n)  # rocking amplitude (rad)
        self.yaw0 = rng.uniform(0, 2 * math.pi, n)
        self.yawr = rng.normal(0, 1.2, n)
        self.tumble = rng.random(n) < 0.28
        self.spin = rng.uniform(4.0, 9.0, n) * rng.choice([-1, 1], n)
        self.c0 = rng.normal(0, 0.05, n)
        self.c1 = rng.uniform(0.01, 0.035, n)
        self.w2 = rng.uniform(5.0, 11.0, n)
        self.fl = rng.uniform(0.002, 0.008, n)
        self.floor = np.where(rng.random(n) < 0.15, DESK["top"] + 0.06, 0.004) + rng.uniform(0, 0.03, n)

    def frame(self, t, local):
        n = self.n
        tau = t - self.t0
        # phase A/B: rest then slide (constant acceleration) and tip
        sl = np.clip(tau, 0, None)
        ts = np.minimum(sl, self.slide)
        d_slide = 0.5 * (0.35 / self.slide) * ts**2 * 2.0  # ~0.35 m over the slide time
        tip = np.clip(ts / self.slide, 0, 1) ** 2 * 0.6
        # phase C: flutter fall
        tc = np.clip(tau - self.slide, 0, None)
        tauc = 0.28
        sink = self.vt * (tc - tauc * (1 - np.exp(-tc / tauc)))
        swing = self.A * (np.sin(self.w * tc + self.ph) - np.sin(self.ph)) * np.clip(tc / 0.4, 0, 1)
        glide = 0.12 * self.A * (np.cos(2 * self.w * tc + 2 * self.ph) - np.cos(2 * self.ph))
        drift = self.vh * tc
        perp = np.column_stack([-self.dir[:, 1], self.dir[:, 0]])
        xy = self.start[:, :2] + self.dir * (d_slide + drift)[:, None] + perp * swing[:, None]
        z = self.start[:, 2] - sink + glide - 0.02 * tip
        # landing: clamp and settle flat
        landed = z <= self.floor
        z = np.maximum(z, self.floor)
        yaw = self.yaw0 + self.yawr * tc
        rockang = self.rock * np.cos(self.w * tc + self.ph) * np.clip(tc / 0.5, 0, 1)
        pitch = np.where(self.tumble, self.spin * tc, rockang) + tip * np.sign(self.dir[:, 0] + 1e-6)
        roll = 0.35 * self.rock * np.sin(self.w * tc + self.ph + 1.0) * np.clip(tc / 0.5, 0, 1)
        flatten = np.where(landed, 1.0, 0.0)
        pitch = np.where(landed, np.round(pitch / math.pi) * math.pi * 0 + 0.02 * np.sin(self.ph), pitch)
        roll = np.where(landed, 0.02 * np.cos(self.ph), roll)
        R = rot_matrices(yaw, pitch, roll)
        # flex: curl along the long axis plus a travelling flutter wave
        lx, ly = local[:, 0], local[:, 1]
        moving = (tc > 0) & ~landed
        c = self.c0 + self.c1 * np.sin(self.w2 * tc + self.ph) * moving
        c = np.where(landed, self.c0 * 0.3, np.where(tau > 0, c, 0.0))
        wave = self.fl[:, None] * np.sin(18.0 * lx[None, :] + 25.0 * ly[None, :] - self.w2[:, None] * 2.2 * tc[:, None]) * moving[:, None]
        zl = c[:, None] * (ly[None, :] / 0.15) ** 2 * 0.15 + c[:, None] * 0.4 * (lx[None, :] / 0.1) ** 2 * 0.1 + wave
        zl = zl * (1 - flatten[:, None] * 0.8)
        P = np.stack([np.broadcast_to(lx, zl.shape), np.broadcast_to(ly, zl.shape), zl], axis=-1)
        W = np.einsum("nij,nvj->nvi", R, P)
        W[:, :, 0] += xy[:, 0:1]
        W[:, :, 1] += xy[:, 1:2]
        W[:, :, 2] += z[:, None]
        return W.reshape(-1, 3)


def write_pc2(path, frames_pts, start=0.0):
    nf = len(frames_pts)
    npnt = frames_pts[0].shape[0]
    with open(path, "wb") as f:
        f.write(b"POINTCACHE2\0")
        f.write(struct.pack("<iiffi", 1, npnt, float(start), 1.0, nf))
        for p in frames_pts:
            f.write(p.astype("<f4").tobytes())


# --------------------------------------------------------------------------
# set pieces


def ream_stack(scene, verts, faces, base, height, rng, lean=0.0):
    """A column of reams with uneven offsets and twists, leaning a little."""
    z = base[2]
    k = 0
    while z < base[2] + height:
        t = rng.uniform(0.008, 0.028)
        w, d = A4[0] + rng.uniform(-0.002, 0.006), A4[1] + rng.uniform(-0.002, 0.006)
        cx = base[0] + rng.normal(0, 0.006) + lean * (z - base[2])
        cy = base[1] + rng.normal(0, 0.006)
        a = base[3] + rng.normal(0, 0.035)
        if rng.random() < 0.06:  # a loose bundle jutting out
            cx += rng.normal(0, 0.03)
            cy += rng.normal(0, 0.03)
            a += rng.normal(0, 0.25)
        ca, sa = math.cos(a), math.sin(a)
        i = len(verts)
        for dz in (0.0, t):
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                px, py = sx * w / 2, sy * d / 2
                verts.append((cx + px * ca - py * sa, cy + px * sa + py * ca, z + dz))
        faces.extend([(i, i + 3, i + 2, i + 1), (i + 4, i + 5, i + 6, i + 7), (i, i + 1, i + 5, i + 4), (i + 1, i + 2, i + 6, i + 5), (i + 2, i + 3, i + 7, i + 6), (i + 3, i, i + 4, i + 7)])
        z += t
        k += 1
    return z


def stacks(scene, mat):
    """Towering stacks around the room; returns the list of stack tops with
    an outward direction for the avalanche sources."""
    rng = np.random.default_rng(77)
    verts, faces = [], []
    tops = []
    spots = []
    # left and right walls of stacks, a back row, a few near the desk
    for i in range(16):
        spots.append((-2.1 + rng.normal(0, 0.15), -2.4 + i * 0.36 + rng.normal(0, 0.05), rng.uniform(1.2, 2.7), (1.0, -0.2)))
    for i in range(16):
        spots.append((2.0 + rng.normal(0, 0.15), -2.4 + i * 0.36 + rng.normal(0, 0.05), rng.uniform(1.0, 2.8), (-1.0, -0.2)))
    for i in range(12):
        spots.append((-1.9 + i * 0.36 + rng.normal(0, 0.05), 2.6 + rng.normal(0, 0.12), rng.uniform(1.6, 2.6), (0.0, -1.0)))
    for i in range(10):
        spots.append((-1.6 + rng.normal(0, 0.12), -2.0 + i * 0.4, rng.uniform(0.5, 1.8), (1.0, 0.0)))
        spots.append((1.55 + rng.normal(0, 0.12), -2.0 + i * 0.4, rng.uniform(0.4, 1.9), (-1.0, 0.0)))
    for i in range(7):
        spots.append((-1.2 + i * 0.4 + rng.normal(0, 0.06), 2.1 + rng.normal(0, 0.1), rng.uniform(1.0, 2.2), (0.0, -1.0)))
    for x, y, h, out in spots:
        for dx in (0.0, 0.25) if rng.random() < 0.5 else (0.0,):
            top = ream_stack(scene, verts, faces, (x + dx, y, 0.0, rng.uniform(-0.3, 0.3)), h, rng, lean=rng.normal(0, 0.012))
            tops.append(((x + dx, y, top), out))
    # piles on the desk
    for x, y, h in ((0.45, 0.45, 0.42), (0.7, 0.2, 0.3), (-0.1, 0.55, 0.22), (0.25, 0.6, 0.55)):
        top = ream_stack(scene, verts, faces, (x, y, DESK["top"], rng.uniform(-0.4, 0.4)), h, rng)
        tops.append(((x, y, top), (0.0, -1.0)))
    ob = E.mesh_object(scene, "Stacks", verts, faces, mat)
    return tops


def lamp(scene, metal, bulb_mat):
    """Old articulated desk lamp: weighted base, two arms, conical shade
    with the bulb inside."""
    base = LAMP_POS
    parts = []
    parts.append(E.box(scene, "LampBase", (0.17, 0.13, 0.03), base + Vector((0, 0, 0.015)), metal, bevel_w=0.008))
    joint1 = base + Vector((0, 0, 0.05))
    elbow = base + Vector((0.06, -0.05, 0.42))
    head = BULB + Vector((-0.06, 0.05, 0.08))
    from envlib import mesh_object  # noqa: F401

    def rod(a, b_, r=0.009):
        import dawn  # reuse the tube builder

        return dawn.tube(scene, "LampArm", [a, a.lerp(b_, 0.5), b_], r, metal, 10)

    parts.append(rod(joint1, elbow))
    parts.append(rod(elbow, head))
    # shade: an open cone pointing down towards the desk front
    axis = (Vector((0.05, -0.2, DESK["top"])) - BULB).normalized()
    prof = [(0.012, 0.0), (0.03, 0.01), (0.06, 0.05), (0.09, 0.13), (0.094, 0.135)]
    verts, faces = [], []
    seg = 48
    for s in range(seg):
        a = 2 * math.pi * s / seg
        for r, z in prof:
            verts.append((r * math.cos(a), r * math.sin(a), -z))
    n = len(prof)
    for s in range(seg):
        s2 = (s + 1) % seg
        for i in range(n - 1):
            faces.append((s * n + i, s2 * n + i, s2 * n + i + 1, s * n + i + 1))
    shade = E.mesh_object(scene, "Shade", verts, faces, metal, smooth=True)
    sol = shade.modifiers.new("Thick", "SOLIDIFY")
    sol.thickness = 0.002
    q = axis.to_track_quat("-Z", "Y")
    shade.rotation_euler = q.to_euler()
    shade.location = BULB - axis * 0.03 + Vector((0, 0, 0.0))
    bpy.ops.object.select_all(action="DESELECT")
    import dawn

    bulb = dawn.lathe(scene, "Bulb", [(0.0, -0.03), (0.022, -0.02), (0.028, 0.0), (0.02, 0.02), (0.008, 0.035), (0.0, 0.036)], bulb_mat, 32)
    bulb.rotation_euler = q.to_euler()
    bulb.location = BULB + axis * 0.035
    bulb.visible_shadow = False  # the key light sits inside it
    return axis


def chair(scene, mat_seat, metal):
    """Office chair pushed back from the desk, slightly turned."""
    root = bpy.data.objects.new("OfficeChair", None)
    scene.collection.objects.link(root)
    import dawn

    parts = [
        E.box(scene, "Seat", (0.48, 0.46, 0.08), (0, 0, 0.48), mat_seat, bevel_w=0.03),
        E.box(scene, "Back", (0.46, 0.07, 0.58), (0, 0.24, 0.86), mat_seat, bevel_w=0.03),
        E.box(scene, "ArmL", (0.05, 0.36, 0.04), (-0.27, 0.02, 0.66), mat_seat, bevel_w=0.015),
        E.box(scene, "ArmR", (0.05, 0.36, 0.04), (0.27, 0.02, 0.66), mat_seat, bevel_w=0.015),
    ]
    parts[1].rotation_euler = (math.radians(-10), 0, 0)
    parts.append(dawn.tube(scene, "Column", [(0, 0, 0.1), (0, 0, 0.25), (0, 0, 0.44)], 0.025, metal, 16))
    for k in range(5):
        a = 2 * math.pi * k / 5
        parts.append(dawn.tube(scene, "Spoke", [(0, 0, 0.1), (0.15 * math.cos(a), 0.15 * math.sin(a), 0.08), (0.3 * math.cos(a), 0.3 * math.sin(a), 0.06)], 0.014, metal, 8))
        parts.append(dawn.lathe(scene, "Caster", [(0.0, 0.0), (0.025, 0.005), (0.026, 0.03), (0.0, 0.035)], metal, 12, loc=(0.3 * math.cos(a), 0.3 * math.sin(a), 0.0)))
    for p in parts:
        p.parent = root
    for k in (2, 3):
        parts[k].location.y -= 0.0
    root.location = (0.85, -0.72, 0.0)
    root.rotation_euler = (0, 0, math.radians(28))
    return root


def desk(scene, wood, metal):
    x0, x1 = DESK["x"]
    y0, y1 = DESK["y"]
    top = DESK["top"]
    E.box(scene, "DeskTop", (x1 - x0, y1 - y0, 0.04), ((x0 + x1) / 2, (y0 + y1) / 2, top - 0.02), wood, bevel_w=0.006)
    for sx in (x0 + 0.22, x1 - 0.22):
        E.box(scene, "Pedestal", (0.42, y1 - y0 - 0.06, top - 0.06), (sx, (y0 + y1) / 2 + 0.02, (top - 0.06) / 2 + 0.02), wood, bevel_w=0.004)
        for i, (za, zb) in enumerate(((0.06, 0.26), (0.28, 0.48), (0.5, 0.68))):
            E.box(scene, "Drawer", (0.38, 0.01, zb - za - 0.012), (sx, y0 + 0.025, (za + zb) / 2), wood, bevel_w=0.003)
            E.box(scene, "Pull", (0.09, 0.015, 0.012), (sx, y0 + 0.016, zb - 0.05), metal, bevel_w=0.004)
    E.box(scene, "Modesty", (x1 - x0 - 0.86, 0.02, top - 0.25), ((x0 + x1) / 2, y1 - 0.06, top - 0.04 - (top - 0.25) / 2), wood)


def room(scene, wall, floor_mat, frame_mat):
    E.box(scene, "Floor", (8, 9, 0.1), (0, 0, -0.05), floor_mat)
    E.box(scene, "BackWall", (8, 0.2, 4), (0, 3.4, 2), wall)
    E.box(scene, "WallL", (0.2, 9, 4), (-2.6, 0, 2), wall)
    E.box(scene, "WallR", (0.2, 9, 4), (2.6, 0, 2), wall)
    E.box(scene, "Ceiling", (8, 9, 0.2), (0, 0, 3.4), wall)
    E.box(scene, "BehindCam", (8, 0.2, 4), (0, -4.6, 2), wall)
    # a tall window in the back wall: a cold night glow, mullion grid
    wx0, wx1, wz0, wz1 = -0.55, 0.65, 1.2, 2.9
    glow = E.emission_material("NightGlass", 0.06)
    E.mesh_object(scene, "NightGlass", [(wx0, 3.29, wz0), (wx1, 3.29, wz0), (wx1, 3.29, wz1), (wx0, 3.29, wz1)], [(0, 3, 2, 1)], glow)
    for i in range(4):
        x = wx0 + (wx1 - wx0) * i / 3
        E.box(scene, "WinV", (0.04, 0.05, wz1 - wz0), (x, 3.27, (wz0 + wz1) / 2), frame_mat)
    for j in range(5):
        z = wz0 + (wz1 - wz0) * j / 4
        E.box(scene, "WinH", (wx1 - wx0, 0.05, 0.035), ((wx0 + wx1) / 2, 3.27, z), frame_mat)


def floor_litter(scene, mat, n=520, seed=9):
    """Sheets lying on the floor and desk, overlapping, slightly bent."""
    ob, local, nv = sheets_mesh(scene, "Litter", n, mat, 4, 5, seed=seed + 1)
    rng = np.random.default_rng(seed)
    pts = []
    for k in range(n):
        if k < 60:
            x, y, z = rng.uniform(-0.8, 0.8), rng.uniform(-0.05, 0.7), DESK["top"] + 0.003 + k * 0.0004
        else:
            r = rng.random()
            x = rng.normal(0, 0.9)
            y = rng.uniform(-2.5, 2.2)
            z = 0.003 + rng.uniform(0, 0.06) * r
        yaw = rng.uniform(0, 2 * math.pi)
        tilt = rng.normal(0, 0.12)
        R = Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(tilt, 3, "X")
        bend = rng.normal(0, 0.03)
        for lx, ly, _ in local:
            v = R @ Vector((lx, ly, bend * (ly / 0.15) ** 2 * 0.15 + abs(tilt) * 0.1))
            pts.append((v.x + x, v.y + y, v.z + z + k * 0.00002))
    ob.data.vertices.foreach_set("co", np.array(pts, np.float32).ravel())
    ob.data.update()
    return ob


# --------------------------------------------------------------------------


def build():
    scene = E.new_scene(FRAMES, samples=int(os.environ.get("SAMPLES", "48")), adaptive=0.035, bounces=(6, 3, 2, 12), clamp_ind=4.0)
    c = scene.cycles
    c.volume_biased = True
    c.volume_step_rate = 4.0
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    scene.render.motion_blur_position = "CENTER"
    E.compositor(scene, bloom=0.35, bloom_size=0.75, threshold=2.0, vignette=0.4, gain=float(os.environ.get("GAIN", "1.3")))

    w = bpy.data.worlds.new("Dark")
    scene.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = E.gray(0.0)

    page = page_material()
    wall = E.simple_material("WallDark", 0.12, 0.85, 0.3)
    floor_mat = old_wood("Floor", 0.05)
    wood = old_wood("DeskWood", 0.06)
    metal = E.simple_material("LampMetal", 0.05, 0.3, 0.5, metal=0.6)
    bulb_mat = E.emission_material("Bulb", 6.0)
    seat = E.simple_material("Leather", 0.03, 0.45, 0.5)

    room(scene, wall, floor_mat, E.simple_material("WinFrame", 0.02, 0.5))
    desk(scene, wood, metal)
    tops = stacks(scene, ream_material())
    axis = lamp(scene, metal, bulb_mat)
    chair(scene, seat, metal)
    floor_litter(scene, page)
    import dawn

    dawn.mug(scene, (-0.05, 0.12, DESK["top"] + 0.003), math.radians(30), dawn.ceramic_material("MugPaper", 0.03, 0.15))

    # falling sheets: sources are the tall stack tops (inside the view) plus
    # an unseen collapse above frame
    rng = np.random.default_rng(4)
    srcs = [t for t in tops if t[0][2] > 1.3]
    for _ in range(14):
        srcs.append(((rng.uniform(-1.6, 1.6), rng.uniform(-1.0, 2.4), rng.uniform(2.9, 3.3)), (rng.normal(0, 1), rng.normal(-0.5, 0.5))))
    n = int(os.environ.get("SHEETS", "420"))
    fl = Flutter(n, srcs, seed=8)
    ob, local, nv = sheets_mesh(scene, "Falling", n, page, 6, 8, seed=12)
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "paper_falling.pc2")
    pre = 2
    samples = [fl.frame((f - 1) / E.FPS, local) for f in range(1 - pre, FRAMES + 1 + pre)]
    write_pc2(path, samples, start=float(1 - pre))
    mc = ob.modifiers.new("Flutter", "MESH_CACHE")
    mc.cache_format = "PC2"
    mc.filepath = path
    mc.frame_start = float(1 - pre)
    mc.interpolation = "LINEAR"

    # the lamp: a spot inside the shade plus the glowing bulb
    sd = bpy.data.lights.new("LampKey", "SPOT")
    sd.energy = float(os.environ.get("LAMP", "90"))
    sd.color = (1.0, 0.92, 0.8)
    sd.spot_size = math.radians(84)
    sd.spot_blend = 0.35
    sd.shadow_soft_size = 0.02
    key = bpy.data.objects.new("LampKey", sd)
    scene.collection.objects.link(key)
    key.location = BULB + axis * 0.03
    key.rotation_euler = axis.to_track_quat("-Z", "Y").to_euler()
    pt = bpy.data.lights.new("LampSpill", "POINT")
    pt.energy = 14.0
    pt.color = (1.0, 0.92, 0.8)
    pt.shadow_soft_size = 0.02
    spill = bpy.data.objects.new("LampSpill", pt)
    scene.collection.objects.link(spill)
    spill.location = BULB + axis * 0.03 - axis * 0.06

    # cold moon/streetlight through the back window: rims the stacks
    ad = bpy.data.lights.new("Night", "AREA")
    ad.energy = 40.0
    ad.size, ad.size_y = 1.2, 1.7
    ad.shape = "RECTANGLE"
    ad.color = (0.85, 0.9, 1.0)
    night = bpy.data.objects.new("Night", ad)
    scene.collection.objects.link(night)
    E.look_at(night, (0.05, 3.25, 2.05), (0.0, 0.0, 0.6))

    # a faint warm bounce off the ceiling above the lamp, lifting the floor
    bd = bpy.data.lights.new("Bounce", "AREA")
    bd.energy = 11.0
    bd.size = 2.5
    bd.color = (1.0, 0.95, 0.88)
    bounce = bpy.data.objects.new("Bounce", bd)
    scene.collection.objects.link(bounce)
    E.look_at(bounce, (-0.2, -0.6, 3.25), (-0.2, -0.6, 0.0))
    bounce.visible_glossy = False
    # haze
    vmat, vb, vol, vout = E.volume_material("Haze", density=float(os.environ.get("HAZE", "0.03")), anisotropy=0.6)
    hz = E.box(scene, "Haze", (5.0, 7.8, 3.3), (0, -0.6, 1.65), vmat)
    hz.visible_shadow = False

    # camera: slow push in, slight handheld shake
    cam = E.camera(scene, lens=32, fstop=3.2, focus=4.0)
    nx_, ny_, nr_ = E.SmoothNoise(31, 4, 1.0), E.SmoothNoise(32, 4, 1.0), E.SmoothNoise(33, 4, 1.0)
    p0, p1 = Vector((0.22, -3.7, 1.45)), Vector((0.16, -3.25, 1.4))
    tg = Vector((-0.12, 0.6, 1.05))
    for f in range(1, FRAMES + 1):
        t = (f - 1) / (FRAMES - 1)
        s = f / E.FPS
        loc = p0.lerp(p1, t) + Vector((0.004 * nx_(s * 7), 0.0, 0.004 * ny_(s * 7.5)))
        E.look_at(cam, loc, tg + Vector((0.006 * nx_(s * 5 + 3), 0, 0.006 * ny_(s * 5.5 + 9))), roll=math.radians(0.25 * nr_(s * 3)))
        E.key_camera(cam, f, focus=(Vector((-0.1, 0.35, 0.95)) - loc).length)
    E.set_interp(cam, "BEZIER")
    return scene


if __name__ == "__main__":
    args = E.parse_args()
    E.finish(build(), "paper", args, FRAMES)
