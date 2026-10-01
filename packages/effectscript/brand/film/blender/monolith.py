"""Shot `monolith` — film 68.0–80.0 s, 360 frames.

  1–60    The single line from `converge` (frame centre, full width) contracts
          and thickens into the shared stroke's crossbar. Frame 60 (film 70.0 s,
          the musical impact) locks it in with a flash.
  60–120  The rest of the mark draws on in light: the f grows up and down from
          the crossbar along F_CENTRELINE, the thick diagonal runs down-right,
          the thin diagonal slides in behind the shared stroke and settles
          with its gap.
  120–300 The light cools into pale concrete; the camera pulls back and arcs to
          reveal a sculpture on a wet black floor, a top light sweeps across,
          dust drifts in a light shaft.
  300–360 The mark settles: optical centre at (1920, 1000), ~840 px tall (4K), the
          camera almost still, ready for a crossfade to the 2D lockup.

The geometry is the exact extruded mark from the first frame it appears. The
draw-on is a shader reveal: a precomputed map gives every point of the mark
the moment it appears (its distance along the stroke centrelines), and an
animated `progress` value cuts the mesh at that front.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

M = C.M
FRAMES = 360
LOCK = 60  # the impact frame
DRAWN = 118  # draw-on complete
LENS = 50.0
LINE_PX = 5.0 * C.PX
LINE_GLOW = 5.0  # as in converge
MARK_GLOW = 3.0  # emission while the mark is light (HDR: ~3-5 linear)
D_DRAW = 9.5  # camera distance while drawing (mark ~560 px tall)
FINAL_CENTRE = (960.0 * C.PX, 500.0 * C.PX)
FINAL_HEIGHT = 420.0 * C.PX


# --------------------------------------------------------------------------
# reveal map


def _nearest_line(px, py, a, b):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / (L * L), 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy)), t * L, L


def _nearest_arc(px, py, p0, r, p1, sweep):
    pts = C._arc(p0, r, p1, sweep, step=1e9)  # just to recover the centre
    (x1, y1), (x2, y2) = p0, p1
    xp, yp = (x1 - x2) / 2, (y1 - y2) / 2
    sign = 1 if sweep else -1
    coef = sign * math.sqrt(max(r * r - xp * xp - yp * yp, 0) / (xp * xp + yp * yp))
    cx, cy = coef * yp + (x1 + x2) / 2, -coef * xp + (y1 + y2) / 2
    t1 = math.atan2(y1 - cy, x1 - cx)
    dt = math.atan2(y2 - cy, x2 - cx) - t1
    if sweep and dt < 0:
        dt += 2 * math.pi
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    ang = np.arctan2(py - cy, px - cx) - t1
    ang = (ang + math.pi) % (2 * math.pi) - math.pi  # relative angle in (-pi, pi]
    frac = np.clip(ang / dt, 0, 1)
    qx, qy = cx + r * np.cos(t1 + dt * frac), cy + r * np.sin(t1 + dt * frac)
    del pts
    return np.hypot(px - qx, py - qy), frac * abs(dt) * r, abs(dt) * r


def _nearest_path(px, py, cmds):
    """Distance to and arc length along an M/L/A centreline."""
    best_d = np.full(px.shape, np.inf)
    best_s = np.zeros(px.shape)
    pos, s0 = None, 0.0
    for c in cmds:
        if c[0] == "M":
            pos = (c[1], c[2])
            continue
        if c[0] == "L":
            end = (c[1], c[2])
            d, s, L = _nearest_line(px, py, pos, end)
        else:
            end = (c[2], c[3])
            d, s, L = _nearest_arc(px, py, pos, c[1], end, c[4])
        closer = d < best_d
        best_d = np.where(closer, d, best_d)
        best_s = np.where(closer, s0 + s, best_s)
        pos, s0 = end, s0 + L
    return best_d, best_s, s0


def _inside_convex(px, py, poly):
    inside = np.ones(px.shape, bool)
    sgn = None
    n = len(poly)
    for i in range(n):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % n]
        cr = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
        sgn = np.sign((bx - ax) * (poly[(i + 2) % n][1] - ay) - (by - ay) * (poly[(i + 2) % n][0] - ax))
        inside &= cr * sgn >= -2.0
    return inside


PAD = 24
X0, Y0 = M.BBOX_X0 - PAD, M.BBOX_Y0 - PAD
MW, MH = int(M.BBOX_W + 2 * PAD), int(M.BBOX_H + 2 * PAD)

# reveal times (in units of `progress`)
F_START = 0.10  # the f waits a beat so the bar first flows into the diagonal
F_END = 0.84  # f hook complete
DIAG_END = 0.72  # thick diagonal complete
F_ANCHOR = 226 + math.pi / 2 * 236 + (1367 - 1245)  # crossbar height on the stem
F_BAND = 66  # the stem slice inside the crossbar is there at the lock
DIAG_HEAD = 0


def reveal_map():
    xs = X0 + np.arange(MW) + 0.5
    ys = Y0 + MH - (np.arange(MH) + 0.5)  # image rows go bottom-up
    px, py = np.meshgrid(xs, ys)
    df, sf, _ = _nearest_path(px, py, M.F_CENTRELINE)
    ds, ss, _ = _nearest_path(px, py, M.SHARED_CENTRELINE)
    bar = 1503 - 1040
    diag = math.hypot(497, 621)
    up, down = F_ANCHOR, M.F_CENTRELINE_LEN - F_ANCHOR
    reach = np.where(sf < F_ANCHOR, (F_ANCHOR - sf) / up, (sf - F_ANCHOR) / down)
    band = F_BAND / max(up, down)
    t_f = F_START + (F_END - F_START) * np.clip((reach - band) / (1 - band), 0, 1)
    # the diagonal grows downward with a horizontal front, like its own base cut
    t_s = np.where(ss <= bar, 0.012, 0.012 + (DIAG_END - 0.012) * np.clip((py - M.BAR_B) / (M.BASE - M.BAR_B), 0, 1))
    t = np.where(df < ds, t_f, t_s)
    # the crossbar present at the lock: stem edge to the miter bisector
    # (A_TR-A_IN). A clearly negative time keeps the cut exact at progress 0.
    (ax, ay), (bx, by) = M.A_TR, M.A_IN
    left_of_miter = (bx - ax) * (py - ay) - (by - ay) * (px - ax) > 0
    lock = (py >= M.XH - 1) & (py <= M.BAR_B + 1) & (px >= M.STEM_L - 1) & left_of_miter
    t = np.where(lock, -0.05, t)
    upper, lower = M._thin(M.GAP)
    thin = _inside_convex(px, py, upper) | _inside_convex(px, py, lower)
    t = np.where(thin, -0.05, t)
    img = bpy.data.images.new("RevealTime", MW, MH, float_buffer=True, is_data=True)
    rgba = np.zeros((MH, MW, 4), np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = t
    rgba[..., 3] = 1
    img.pixels.foreach_set(rgba.ravel())  # is_data already makes it Non-Color
    path = os.path.join(C.BUILD, "monolith_reveal.exr")
    os.makedirs(C.BUILD, exist_ok=True)
    img.filepath_raw = path
    img.file_format = "OPEN_EXR"
    img.save()
    return img


# --------------------------------------------------------------------------
# materials


def mark_material(reveal):
    """Concrete <-> white light, cut by the reveal front.

    Animated values: `progress` (reveal), `glow` (1 = light, 0 = concrete),
    `flash` (impact boost). Object alpha (obj.color[3]) fades whole pieces."""
    mat = bpy.data.materials.new("MarkConcreteLight")
    mat.surface_render_method = "DITHERED"
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    n, ln = nt.nodes, nt.links

    def value(name, v):
        nd = n.new("ShaderNodeValue")
        nd.name = nd.label = name
        nd.outputs[0].default_value = v
        return nd

    def math_(op, a, b):
        nd = n.new("ShaderNodeMath")
        nd.operation = op
        for i, x in enumerate((a, b)):
            if isinstance(x, (int, float)):
                nd.inputs[i].default_value = x
            else:
                ln.new(x, nd.inputs[i])
        return nd.outputs[0]

    tc = n.new("ShaderNodeTexCoord")
    concrete = C.concrete_nodes(nt, tc.outputs["Object"])

    # object-space (metres) -> master units -> reveal-map UV
    mp = n.new("ShaderNodeMapping")
    mp.vector_type = "POINT"
    sx, sy = 1 / (C.S * MW), 1 / (C.S * MH)
    mp.inputs["Scale"].default_value = (sx, sy, 0)
    mp.inputs["Location"].default_value = ((M.CENTER[0] - X0) / MW, (Y0 + MH - M.BASE) / MH, 0)
    ln.new(tc.outputs["Object"], mp.inputs["Vector"])
    tex = n.new("ShaderNodeTexImage")
    tex.image = reveal
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    ln.new(mp.outputs[0], tex.inputs["Vector"])
    t = tex.outputs["Color"]
    sep = n.new("ShaderNodeSeparateColor")
    ln.new(t, sep.inputs[0])
    t = sep.outputs[0]

    progress = value("progress", 1.0).outputs[0]
    glow = value("glow", 0.0).outputs[0]
    flash = value("flash", 0.0).outputs[0]
    diff = math_("SUBTRACT", progress, t)
    shown = math_("GREATER_THAN", diff, -0.0015)
    edge = n.new("ShaderNodeMapRange")  # hot leading edge of the draw
    edge.inputs["From Min"].default_value = 0.0
    edge.inputs["From Max"].default_value = 0.07
    edge.inputs["To Min"].default_value = 0.8
    edge.inputs["To Max"].default_value = 0.0
    ln.new(diff, edge.inputs["Value"])
    strength = math_("MULTIPLY", math_("ADD", math_("ADD", edge.outputs["Result"], flash), 1.0), MARK_GLOW)

    em = n.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = C.gray(1.0)
    ln.new(strength, em.inputs["Strength"])
    mix = n.new("ShaderNodeMixShader")
    ln.new(glow, mix.inputs["Fac"])
    ln.new(concrete, mix.inputs[1])
    ln.new(em.outputs[0], mix.inputs[2])

    oi = n.new("ShaderNodeObjectInfo")
    alpha = math_("MULTIPLY", shown, oi.outputs["Alpha"])
    cut = n.new("ShaderNodeMixShader")
    ln.new(alpha, cut.inputs["Fac"])
    ln.new(n.new("ShaderNodeBsdfTransparent").outputs[0], cut.inputs[1])
    ln.new(mix.outputs[0], cut.inputs[2])
    out = n.new("ShaderNodeOutputMaterial")
    ln.new(cut.outputs[0], out.inputs["Surface"])
    return mat


def key_node(mat, name, pairs, interp="LINEAR"):
    sock = mat.node_tree.nodes[name].outputs[0]
    for f, v in pairs:
        sock.default_value = v
        sock.keyframe_insert("default_value", frame=f)


# --------------------------------------------------------------------------
# the shot


def build():
    scene = C.new_scene(FRAMES, samples=80)
    C.compositor(scene, bloom=0.45, bloom_size=0.55, threshold=0.9, vignette=0.3)

    mat = mark_material(reveal_map())
    st = C.stage(scene, haze=0.0, mark_material=mat, dust_count=900, dust_box=((-1.0, 3.5), (-2.0, 2.5), (0, 4.8)))
    pieces = st["mark"]

    # ---- 1-60: the line becomes the crossbar --------------------------------
    px_per_m = C.W * LENS / 36 / (D_DRAW - C.MARK_DEPTH / 2)
    line_t = LINE_PX / px_per_m
    lmesh = bpy.data.meshes.new("Line")
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(lmesh)
    bm.free()
    line = bpy.data.objects.new("Line", lmesh)
    scene.collection.objects.link(line)
    # shape key that shears the right end into the crossbar's miter
    line.shape_key_add(name="Basis")
    miter = line.shape_key_add(name="Miter")
    miter.slider_max = 10.0
    for v, kv in zip(lmesh.vertices, miter.data):
        if v.co.x > 0:
            kv.co.x = v.co.x + 0.5 * (1 if v.co.z > 0 else -1)
    lmat = C.emission_material("LineGlow", LINE_GLOW)
    lmesh.materials.append(lmat)
    lstr = lmat.node_tree.nodes["Emission"].inputs["Strength"]

    bar_l = C.to_local(M.STEM_L, 0)[0]
    bar_r = C.to_local(1503, 0)[0]
    bar_h = (M.BAR_B - M.XH) * C.S
    for f in range(1, LOCK + 1):
        t = (f - 1) / (LOCK - 1)
        e = C.ease_in(t, 2.4)  # slow gather, then a slam into place
        xl = C.lerp(-6.0, bar_l, e)
        xr = C.lerp(6.0, bar_r, e)
        h = C.lerp(line_t, bar_h, C.ease_in(t, 3.2))
        line.location = ((xl + xr) / 2, 0.0, C.CROSSBAR_Z)
        line.scale = (xr - xl, C.MARK_DEPTH, h)
        line.keyframe_insert("location", frame=f)
        line.keyframe_insert("scale", frame=f)
        half_skew = (M.A_TR[0] - 1503) * C.S * (h / bar_h)  # 45 units at full thickness
        miter.value = 2 * half_skew / (xr - xl)
        miter.keyframe_insert("value", frame=f)
        # the box reads ~10% hotter than converge's tube at equal strength
        lstr.default_value = C.lerp(LINE_GLOW, MARK_GLOW * 1.6, C.ease_in(t, 2.0))
        lstr.keyframe_insert("default_value", frame=f)
    line.hide_render = False
    line.keyframe_insert("hide_render", frame=LOCK - 1)
    line.hide_render = True
    line.keyframe_insert("hide_render", frame=LOCK)

    # ---- 60-120: draw-on -----------------------------------------------------
    key_node(mat, "progress", [(1, -0.01), (LOCK - 1, -0.01)])
    for f in range(LOCK, DRAWN + 1):
        t = (f - LOCK) / (DRAWN - LOCK)
        key_node(mat, "progress", [(f, C.ease_out(t, 2.2) * 1.0 - 0.0 if t > 0 else 0.0)])
    key_node(mat, "progress", [(DRAWN + 2, 1.05)])
    for f in range(LOCK, LOCK + 20):
        key_node(mat, "flash", [(f, 1.0 * math.exp(-(f - LOCK) / 4.5))])
    key_node(mat, "flash", [(LOCK - 1, 0.0), (LOCK + 20, 0.0)])
    for p in pieces.values():
        p.color = (1, 1, 1, 0)
        p.keyframe_insert("color", index=3, frame=1)
    body = pieces["body"]
    body.color = (1, 1, 1, 0)
    body.keyframe_insert("color", index=3, frame=LOCK - 1)
    body.color = (1, 1, 1, 1)
    body.keyframe_insert("color", index=3, frame=LOCK)

    # the thin diagonal: one stroke sliding down its own axis behind the
    # shared stroke, then stepping forward into the plane with its gap
    kx, ky = M.KB, 1.0
    norm = math.hypot(kx, ky)
    slide = 520 * C.S
    ax, az = -kx / norm * slide, ky / norm * slide  # up-right along the axis, world x/z
    for name in ("thin_upper", "thin_lower"):
        p = pieces[name]
        a, b, c = 76, 104, 116
        for f in range(a, c + 1):
            t = (f - a) / (b - a)
            e = C.ease_out(min(t, 1.0), 3)
            back = 0.55 * (1 - C.smoothstep(b - 6, c, f))
            p.location = (ax * (1 - e), back, az * (1 - e))
            p.keyframe_insert("location", frame=f)
            p.color = (1, 1, 1, C.smoothstep(a, a + 14, f))
            p.keyframe_insert("color", index=3, frame=f)
        p.location = (ax, 0.55, az)
        p.keyframe_insert("location", frame=1)
    # ---- 120+: light cools into concrete ----------------------------------------
    key_node(mat, "glow", [(1, 1.0), (124, 1.0)])
    for f in range(124, 181, 4):
        key_node(mat, "glow", [(f, 1 - C.ease_in_out((f - 124) / 56))])

    # floor wetness and haze come up with the light
    spec = st["floor_spec"]
    for f, v in ((1, 0.0), (LOCK, 0.0), (130, 0.5)):
        spec.default_value = v
        spec.keyframe_insert("default_value", frame=f)
    vol = st["volume"].inputs["Density"]
    for f, v in ((1, 0.0), (110, 0.0), (210, 0.016)):
        vol.default_value = v
        vol.keyframe_insert("default_value", frame=f)

    lights = [
        (C.spot(scene, "Key", (-0.5, -1.2, 6.8), (0.15, 0.0, 1.0), 3400, 30, blend=0.85, radius=0.4, volume=0.5), 125, 200),
        (C.area(scene, "Fill", (-2.5, -9.0, 2.6), (0.0, 0.0, 1.0), 850, size=5.0, volume=0.0), 130, 210),
        (C.spot(scene, "Back", (2.5, 8.5, 6.5), (0.0, -1.0, 0.5), 2400, 18, blend=0.4, radius=0.05, volume=1.6), 150, 240),
    ]
    for obj, a, b in lights:
        e = obj.data.energy * 1.3  # HDR contract: lit concrete ~0.8-1.2 linear
        for f, v in ((1, 0.0), (a, 0.0), (b, e)):
            obj.data.energy = v
            obj.data.keyframe_insert("energy", frame=f)
    C.slats(scene, (2.5, 8.5, 6.5), (0.0, -1.0, 0.5), 1.5, seed=11)

    # the sweep: a long soft strip passing over the mark from left to right
    sweep = C.area(scene, "Sweep", (-7, -1.5, 4.5), (0, 0, 1.0), 900, size=0.5, size_y=5.0, volume=0.25)
    sweep.visible_glossy = False
    for f, x in ((150, -7.0), (290, 7.0)):
        C.look_at(sweep, (x, -1.6, 4.4), (x * 0.25, 0.0, 1.0))
        sweep.keyframe_insert("location", frame=f)
        sweep.keyframe_insert("rotation_euler", frame=f)
    for f, v in ((1, 0.0), (150, 0.0), (190, 900.0), (260, 900.0), (290, 0.0)):
        sweep.data.energy = v
        sweep.data.keyframe_insert("energy", frame=f)

    # ---- camera --------------------------------------------------------------
    cam = C.camera(scene, lens=LENS, fstop=2.8)
    target = (0.0, 0.0, C.MARK_CENTER_Z)
    front = (0.0, -C.MARK_DEPTH / 2, C.MARK_CENTER_Z)

    def place(f, az_deg, dist, height, sx=None, sy=None, shake=0.0):
        az = math.radians(az_deg)
        loc = (math.sin(az) * dist, -math.cos(az) * dist, height)
        if sx is None:
            # drawing: optical axis level with the crossbar, mark centred in x
            C.look_at(cam, loc, (0.0, 0.0, height))
        else:
            C.aim_at_screen(scene, cam, loc, target, sx, sy)
        if shake:
            cam.rotation_euler.x += shake * NX(f / C.FPS * 9)
            cam.rotation_euler.z += shake * NZ(f / C.FPS * 9)
        C.key_camera(cam, f, math.dist(loc, front))

    NX, NZ = C.SmoothNoise(60), C.SmoothNoise(61)

    # solve the final pose: optical centre at FINAL_CENTRE, FINAL_HEIGHT tall
    AZ_END, H_END = 6.0, 0.62
    dist_end = 12.5
    top, bottom = (0.0, -C.MARK_DEPTH / 2, 2.0), (0.0, -C.MARK_DEPTH / 2, 0.0)
    for _ in range(6):
        place(FRAMES, AZ_END, dist_end, H_END, *FINAL_CENTRE)
        h = C.project(scene, cam, bottom)[1] - C.project(scene, cam, top)[1]
        dist_end *= h / FINAL_HEIGHT
    print(f"[monolith] final distance {dist_end:.3f} m, mark height {h:.1f} px")

    for f in range(1, FRAMES + 1):
        if f <= 120:
            # locked off; a tiny breath after the impact
            kick = 0.0035 * math.exp(-(f - LOCK) / 6) if f >= LOCK else 0.0
            d = D_DRAW - 0.25 * C.smoothstep(LOCK, 120, f)
            place(f, 0.0, d, C.CROSSBAR_Z, shake=kick)
        else:
            t = (f - 120) / (FRAMES - 120)
            e = C.ease_in_out(min(1.0, (f - 120) / 180))
            swing = math.sin(math.pi * C.ease_in_out(min(1.0, (f - 120) / 185)) ** 0.8)
            az = C.lerp(0.0, AZ_END, e) - 30.0 * swing
            dist = C.lerp(D_DRAW - 0.25, dist_end, e) + 0.06 * (1 - t)  # still drifting in at the end
            height = C.lerp(C.CROSSBAR_Z, H_END, e) - 0.3 * swing
            # hand over from the level drawing framing to the solved framing
            sx0, sy0 = C.W / 2, C.H / 2 + (C.CROSSBAR_Z - C.MARK_CENTER_Z) * C.W * LENS / 36 / D_DRAW
            k = C.ease_in_out(min(1.0, (f - 120) / 120))
            place(f, az, dist, height, C.lerp(sx0, FINAL_CENTRE[0], k), C.lerp(sy0, FINAL_CENTRE[1], k))
    C.linear_fcurves(cam)
    C.linear_fcurves(cam.data)
    return scene


if __name__ == "__main__":
    args = C.parse_args()
    C.finish(build(), "monolith", args)
