"""Shot `plain` - film 151.8-154.4 s, 80 frames.

A colossal monolith of the exact ƒx mark (30 m tall, pale board-formed
concrete) on an endless wet salt flat at blue hour. Overcast sky with a break
of light directly behind the mark: the low sun sits in the counter of the f,
its beams fanning through the haze around the stroke edges. Low mist, a small
crowd of silhouettes at the base, mirror reflections in a thin water layer.
Low camera, slow push.

    blender -b -P film/blender-env/plain.py -- --stills 1,40,80 --res 960
    blender -b -P film/blender-env/plain.py -- --lookdev
    blender -b -P film/blender-env/plain.py --            # full 4K sequence
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import envlib as E  # noqa: E402

M = E.M
FRAMES = 80
MH = 30.0  # mark height (m)
MD = 3.9  # mark depth
MB = 0.16  # bevel
LENS = 50.0

# the sun sits in the counter of the f (between stem, hook and crossbar)
CTR_X, CTR_Z = E.mark_point(1330, 1215, MH)
CAM0 = Vector((0.9, -122.0, 1.38))
CAM1 = Vector((0.35, -111.0, 1.22))
ROT = math.radians(-11.0)  # the mark is turned slightly so its side faces read


def counter_world():
    return Vector((CTR_X * math.cos(ROT), CTR_X * math.sin(ROT), CTR_Z))


def sun_direction():
    """Unit vector towards the sun: the f's counter as seen from mid-shot."""
    mid = (CAM0 + CAM1) / 2
    return (counter_world() + Vector((0, 0, 0.6)) - mid).normalized()


SUN = sun_direction()


# --------------------------------------------------------------------------
# sky


def world(scene):
    """Procedural overcast sky with a break of light around the sun.

    Camera and glossy rays see the dramatic sky; diffuse rays see a smoother,
    brighter overcast so the pale concrete reads (the 'bounce' a real flat
    gives off a wet, sky-mirroring floor)."""
    w = bpy.data.worlds.new("Sky")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    b = E.NB(nt)
    out = b.new("ShaderNodeOutputWorld")
    D = b.coord("Generated")  # direction
    dx, dy, dz = b.xyz(D)
    cos_a = b.v("DOT_PRODUCT", D, tuple(SUN), out="Value")

    def glow(sigma_deg, k):
        s = math.radians(sigma_deg)
        return b.mul(b.m("EXPONENT", b.mul(b.add(cos_a, -1.0), 1.0 / (s * s))), k)

    core = glow(0.5, 3.2)
    halo = glow(2.2, 2.2)
    wide = glow(6.5, 0.85)
    broad = glow(20.0, 0.16)

    # cloud plane projection (perspective-correct layer receding to horizon)
    inv = b.m("DIVIDE", 1.0, b.m("MAXIMUM", b.add(dz, 0.035), 0.035))
    px, py = b.mul(dx, inv), b.mul(dy, inv)
    P = b.combine(b.mul(px, 0.7), py, 0.37)
    warp = b.noise(P, 0.45, 3.0, 0.5, out="Color")
    Pw = b.v("ADD", P, b.v("SCALE", b.v("SUBTRACT", warp, (0.5, 0.5, 0.5)), scale=1.1))
    def puff_at(vec):
        big_ = b.noise(vec, 0.33, 5.0, 0.6, distort=0.25)
        fine_ = b.noise(vec, 1.9, 7.0, 0.66)
        return big_, fine_, b.m("ADD", big_, b.mul(b.add(fine_, -0.5), 0.5))

    big, fine, puff = puff_at(Pw)
    # a second sample nudged towards the sun's position on the cloud plane:
    # where density falls off towards the sun, the cloud edge is sunlit
    inv_s = 1.0 / (SUN.z + 0.035)
    psun = (SUN.x * inv_s * 0.7, SUN.y * inv_s, 0.37)
    tow = b.v("NORMALIZE", b.v("SUBTRACT", psun, P))
    _, _, puff2 = puff_at(b.v("ADD", Pw, b.v("SCALE", tow, scale=0.22)))
    # coverage thins out around the sun: the break
    brk = b.mr(cos_a, math.cos(math.radians(15)), math.cos(math.radians(2)), 0.0, 1.0, interp="SMOOTHSTEP")
    brk2 = b.mr(cos_a, math.cos(math.radians(6)), math.cos(math.radians(0.8)), 0.0, 1.0, interp="SMOOTHSTEP")
    ragged = b.mr(b.noise(Pw, 0.9, 4.0, 0.6), 0.3, 0.7, 0.45, 1.25)
    thr = b.add(b.add(0.29, b.mul(b.mul(brk, ragged), 0.16)), b.mul(brk2, 0.13))
    dens = b.mr(b.m("SUBTRACT", puff, thr), -0.03, 0.1, 0.0, 1.0, interp="SMOOTHSTEP")
    dens2 = b.mr(b.m("SUBTRACT", puff2, thr), -0.03, 0.1, 0.0, 1.0, interp="SMOOTHSTEP")
    edge_lit = b.m("POWER", b.m("SUBTRACT", dens, dens2, clamp=True), 0.7)
    # clouds fade into a uniform overcast deck near the horizon
    hor = b.mr(dz, 0.0, 0.16, 1.0, 0.0, interp="SMOOTHSTEP")
    dens = b.mixf(b.mul(hor, 0.55), dens, 0.72)

    # sky behind the clouds
    sky = b.add(b.add(0.04, b.mul(b.mr(dz, 0.0, 0.4, 0.05, 0.0), 1.0)), b.add(b.add(core, halo), b.add(b.mul(wide, 1.6), b.mul(broad, 2.4))))
    # cloud body: billows (fine noise), dark undersides, lit thin edges near
    # the sun (silver lining)
    bill = b.noise(Pw, 5.5, 4.0, 0.6)
    tone = b.add(b.mr(fine, 0.3, 0.7, 0.012, 0.045), b.mr(bill, 0.35, 0.7, -0.006, 0.016))
    tone = b.mul(tone, b.mr(dz, 0.05, 0.45, 1.0, 0.55))
    thin = b.m("POWER", b.m("SUBTRACT", 1.0, dens, clamp=True), 1.8)
    lining = b.mul(b.add(b.mul(halo, 1.0), b.add(b.mul(wide, 2.2), b.mul(broad, 1.6))), b.add(b.add(thin, 0.04), b.mul(edge_lit, 1.1)))
    cloud = b.add(b.add(tone, lining), b.mul(b.mr(dz, 0.0, 0.12, 0.04, 0.0), 1.0))
    L = b.mixf(dens, sky, cloud)

    # distant crepuscular rays fanning from the break (noise over the polar
    # angle around the sun, fading with distance from it)
    e1 = SUN.cross(Vector((0, 0, 1))).normalized()
    e2 = e1.cross(SUN).normalized()
    u = b.v("NORMALIZE", b.v("SUBTRACT", D, b.v("SCALE", tuple(SUN), scale=cos_a)))
    cphi = b.v("DOT_PRODUCT", u, tuple(e1), out="Value")
    sphi = b.v("DOT_PRODUCT", u, tuple(e2), out="Value")
    ang = b.m("ARCCOSINE", b.m("MINIMUM", cos_a, 1.0))
    rv = b.combine(b.mul(cphi, 9.0), b.mul(sphi, 9.0), b.mul(ang, 1.2))
    rays = b.noise(rv, 1.0, 3.0, 0.55)
    rays = b.m("POWER", b.mr(rays, 0.42, 0.75, 0.0, 1.0), 1.3)
    rays2 = b.mr(b.noise(b.v("MULTIPLY", rv, (2.6, 2.6, 0.3)), 1.0, 2.0, 0.5), 0.4, 0.75, 0.0, 1.0)
    rays = b.mul(rays, b.add(0.6, b.mul(rays2, 0.5)))
    fade = b.mul(b.m("EXPONENT", b.mul(ang, -1.0 / 0.13)), b.mr(ang, 0.01, 0.07, 0.0, 1.0, interp="SMOOTHSTEP"))
    up_only = b.mr(dz, 0.0, 0.06, 0.25, 1.0)
    ray_l = b.mul(b.mul(b.mul(rays, fade), up_only), float(os.environ.get("RAYS", "0.85")))
    L = b.add(L, b.mul(ray_l, b.m("SUBTRACT", 1.0, b.mul(dens, 0.7))))

    # haze band at the horizon
    hz = b.mr(dz, -0.01, 0.07, 1.0, 0.0, interp="SMOOTHSTEP")
    haze_col = b.add(0.09, b.add(b.mul(wide, 0.5), b.mul(broad, 1.2)))
    L = b.mixf(b.mul(hz, 0.8), L, haze_col)

    # distant mountains: a low ragged band, darker away from the sun
    az = b.m("ARCTAN2", dx, dy)
    ridge = b.noise(b.combine(b.mul(az, 3.2), 7.3, 0.0), 1.0, 6.0, 0.62, dims="3D")
    ridge2 = b.noise(b.combine(b.mul(az, 0.9), 2.1, 0.0), 1.0, 2.0, 0.5, dims="3D")
    h = b.add(b.mul(b.mr(ridge, 0.35, 0.75, 0.0, 1.0), 0.02), b.mul(b.mr(ridge2, 0.3, 0.7, 0.0, 1.0), 0.038))
    h = b.mul(h, b.mr(cos_a, math.cos(math.radians(35)), math.cos(math.radians(8)), 1.0, 0.35))
    mtn = b.m("LESS_THAN", dz, b.add(h, 0.001))
    mcol = b.add(b.add(0.03, b.mul(b.mr(dz, 0.0, 0.05, 1.0, 0.0), 0.04)), b.mul(broad, 0.3))
    L = b.mixf(b.mul(mtn, b.m("GREATER_THAN", dz, -0.002)), L, mcol)
    # below the horizon: haze
    below = b.m("LESS_THAN", dz, -0.002)
    L = b.mixf(below, L, haze_col)

    # diffuse-ray environment: soft overcast, brighter towards the camera side
    fill = b.add(b.mul(b.mr(dz, -0.2, 1.0, 0.18, 0.42), 1.0), b.mul(b.mr(dy, 0.4, -1.0, 0.0, 0.55), 1.0))
    fill = b.add(fill, b.mul(broad, 2.0))
    lp = b.new("ShaderNodeLightPath")
    is_diff = lp.outputs["Is Diffuse Ray"]
    Lout = b.mixf(is_diff, L, fill)

    bg = b.new("ShaderNodeBackground")
    b.set(bg.inputs["Color"], b.grey(Lout))
    bg.inputs["Strength"].default_value = 1.0
    b.ln.new(bg.outputs[0], out.inputs["Surface"])
    w.cycles.sampling_method = "MANUAL"
    w.cycles.sample_map_resolution = 2048
    w.cycles_visibility.diffuse = True
    return w


# --------------------------------------------------------------------------
# materials


def concrete_material():
    """Pale board-formed concrete at monument scale (object coords = metres):
    formwork panels 2.4 x 1.2 m with recessed seams and tie holes, per-panel
    tone, rain streaks, a damp band where it stands in water, sand and pores."""
    mat, b, out = E.material("Concrete")
    co = b.coord("Object")
    x, y, z = b.xyz(co)
    u = b.add(x, y)  # runs along front faces (x) and side faces (y)

    def seam(coord, period, width):
        f = b.m("FRACT", b.m("DIVIDE", coord, period))
        d = b.m("MINIMUM", f, b.m("SUBTRACT", 1.0, f))
        return b.mr(b.mul(d, period), width * 0.5, width, 1.0, 0.0, interp="SMOOTHSTEP")

    sh = seam(z, 1.5, 0.03)
    sv = b.mul(seam(b.add(u, b.mul(b.m("FLOOR", b.m("DIVIDE", z, 1.5)), 2.1)), 4.2, 0.025), 0.55)
    seams = b.m("MAXIMUM", sh, sv)
    # tie holes on a 0.6 x 0.6 grid inside each panel
    hole_g = b.combine(b.m("FRACT", b.m("DIVIDE", b.add(u, 0.35), 1.05)), b.m("FRACT", b.m("DIVIDE", b.add(z, 0.375), 0.75)), 0.0)
    hd = b.v("LENGTH", b.v("MULTIPLY", b.v("SUBTRACT", hole_g, (0.5, 0.5, 0.0)), (1.05, 0.75, 0.0)), out="Value")
    holes = b.mr(hd, 0.02, 0.03, 1.0, 0.0)
    # per-panel tone
    cell = b.combine(b.m("FLOOR", b.m("DIVIDE", b.add(u, b.mul(b.m("FLOOR", b.m("DIVIDE", z, 1.5)), 2.1)), 4.2)), b.m("FLOOR", b.m("DIVIDE", z, 1.5)), 3.0)
    lift = b.white(b.combine(b.m("FLOOR", b.m("DIVIDE", z, 1.5)), 1.0, 7.0))
    panel = b.add(b.mr(b.white(cell), 0.0, 1.0, -0.012, 0.012), b.mr(lift, 0.0, 1.0, -0.025, 0.02))

    mottle = b.noise(co, 0.18, 6.0, 0.6)
    blotch = b.noise(co, 1.1, 8.0, 0.62)
    sand = b.noise(co, 38.0, 4.0, 0.7)
    # rain streaks: noise stretched along z
    streak_co = b.v("MULTIPLY", co, (1.0, 1.0, 0.06))
    streak = b.noise(streak_co, 2.2, 6.0, 0.6)
    pores = b.voronoi(co, 55.0)
    pores = b.mul(b.mr(pores, 0.0, 0.11, 1.0, 0.0), b.mr(b.noise(co, 2.0, 3.0), 0.42, 0.62))
    damp = b.mr(z, 0.0, 2.6, 1.0, 0.0, interp="SMOOTHSTEP")
    damp = b.mul(damp, b.mr(b.noise(b.v("MULTIPLY", co, (1, 1, 3.0)), 1.4, 4.0), 0.3, 0.7, 0.6, 1.0))

    tone = b.add(b.mr(mottle, 0.3, 0.7, 0.47, 0.62), b.mr(blotch, 0.35, 0.65, -0.06, 0.035))
    tone = b.add(tone, b.mr(z, 2.0, 28.0, -0.03, 0.03))
    tone = b.add(tone, panel)
    tone = b.add(tone, b.mr(sand, 0.3, 0.7, -0.03, 0.03))
    tone = b.add(tone, b.mr(streak, 0.42, 0.75, 0.0, -0.16))
    stain = b.noise(b.v("MULTIPLY", co, (1.0, 1.0, 0.35)), 0.09, 5.0, 0.6)
    tone = b.add(tone, b.mr(stain, 0.5, 0.72, 0.0, -0.1))
    bloom_ = b.mr(b.noise(co, 0.4, 6.0, 0.65), 0.62, 0.78, 0.0, 0.06)
    tone = b.add(tone, b.mul(bloom_, b.mr(z, 0.5, 6.0, 1.0, 0.2)))
    tone = b.add(tone, b.mul(seams, -0.035))
    tone = b.add(tone, b.mul(holes, -0.22))
    tone = b.add(tone, b.mul(pores, -0.22))
    tone = b.mixf(b.mul(damp, 0.75), tone, b.mul(tone, 0.42))

    rough = b.add(b.mr(mottle, 0.3, 0.7, 0.62, 0.86), b.mul(damp, -0.38))
    height = b.add(b.mul(sand, 0.35), b.mul(blotch, 0.4))
    height = b.add(height, b.mul(seams, -0.45))
    height = b.add(height, b.mul(holes, -1.5))
    height = b.add(height, b.mul(pores, -0.8))
    nrm = b.bump(height, 0.55, 0.02)
    p = b.principled(base=b.grey(tone), rough=rough, normal=nrm, spec=0.4)
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


def flat_material(t_node_frames):
    """Thin water layer over a salt crust: mirror water with soft ripples,
    a polygon network of salt ridges breaking the surface, dry crust islands
    and dark grit."""
    mat, b, out = E.material("SaltFlat")
    co = b.coord("Object")
    x, y, z = b.xyz(co)
    tval = b.new("ShaderNodeValue")
    tval.outputs[0].default_value = 0.0
    for f, v in t_node_frames:
        tval.outputs[0].default_value = v
        tval.outputs[0].keyframe_insert("default_value", frame=f)
    t = tval.outputs[0]

    # salt polygon ridges (Uyuni hexagons), ~1.6 m cells
    wco = b.v("ADD", co, b.v("SCALE", b.v("SUBTRACT", b.noise(co, 0.6, 2.0, out="Color"), (0.5, 0.5, 0.5)), scale=0.5))
    edge = b.voronoi(wco, 0.95, feature="DISTANCE_TO_EDGE", out="Distance", rand=1.0)
    wob = b.noise(co, 3.0, 3.0)
    ridge = b.mr(b.add(edge, b.mul(b.add(wob, -0.5), 0.05)), 0.0, 0.028, 0.6, 0.0, interp="SMOOTHSTEP")
    # how much crust pokes through: patches
    shallow = b.mr(b.noise(co, 0.035, 4.0, 0.55), 0.5, 0.66, 0.0, 1.0, interp="SMOOTHSTEP")
    islands = b.mr(b.noise(co, 0.11, 5.0, 0.6), 0.66, 0.71, 0.0, 1.0, interp="SMOOTHSTEP")
    grit = b.mr(b.noise(co, 4.5, 5.0, 0.7), 0.68, 0.73, 0.0, 1.0)
    chunks = b.voronoi(co, 1.7, feature="F1", out="Distance")
    chunks = b.mul(b.mr(chunks, 0.05, 0.16, 1.0, 0.0), b.mr(b.noise(co, 0.25, 3.0), 0.55, 0.65))
    grit = b.m("MAXIMUM", grit, chunks)
    dry = b.m("MAXIMUM", b.mul(ridge, b.mul(shallow, 0.7)), b.mul(islands, 0.8))

    salt_tone = b.mr(b.noise(co, 1.5, 6.0), 0.3, 0.7, 0.1, 0.2)
    # pools: mirror water; elsewhere a film of water over dark mud
    pool = b.add(b.mul(b.noise(co, 0.3, 6.0, 0.62), 0.6), b.mul(b.noise(co, 0.04, 3.0), 0.4))
    # more open water towards the monolith, more mud towards the lens
    pool = b.add(pool, b.mr(y, -100.0, -25.0, -0.07, 0.03))
    pool = b.mr(pool, 0.44, 0.56, 0.0, 1.0, interp="SMOOTHSTEP")
    water_tone = b.mixf(pool, b.mr(b.noise(co, 0.8, 5.0), 0.3, 0.7, 0.012, 0.035), 0.008)
    base = b.mixf(dry, water_tone, salt_tone)
    base = b.mixf(grit, base, 0.012)

    # ripples: two drifting noise fields, tiny amplitude
    rco = b.combine(x, b.mul(y, 1.0), t)
    rip = b.noise(b.v("MULTIPLY", co, (1.0, 0.55, 1.0)), 1.6, 3.0, 0.5, dims="4D", w=b.mul(t, 0.35))
    rip2 = b.noise(rco, 9.0, 2.0, 0.5, dims="4D", w=b.mul(t, 0.9))
    wrough = b.mixf(pool, b.mr(b.noise(co, 0.5, 3.0), 0.3, 0.7, 0.3, 0.55), b.mr(b.noise(co, 0.06, 3.0), 0.35, 0.7, 0.008, 0.05))
    rough = b.mixf(dry, wrough, 0.75)
    rough = b.mixf(grit, rough, 0.85)
    height = b.add(b.mul(rip, 1.0), b.mul(rip2, 0.35))
    height = b.mixf(dry, height, b.add(b.mul(ridge, 6.0), b.mul(b.noise(co, 30.0, 3.0), 2.0)))
    height = b.add(height, b.mul(grit, 8.0))
    nrm = b.bump(height, 0.05, 0.02)
    p = b.principled(base=b.grey(base), rough=rough, normal=nrm, spec=0.5)
    p.inputs["IOR"].default_value = 1.33
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


# --------------------------------------------------------------------------
# crowd


def person(scene, name, loc, height, yaw, stride, arm, mat, seed):
    """A stylised standing figure: legs, tapered torso, shoulders, arms, head."""
    import bmesh
    from mathutils import Matrix

    rng = np.random.default_rng(seed)
    s = height / 1.75
    bm = bmesh.new()

    def capsule(p0, p1, r0, r1, seg=8):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        L = d.length
        mtx = Matrix.Translation(p0) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4() @ Matrix.Translation((0, 0, L / 2))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=L, matrix=mtx)
        for p, r in ((p0, r0), (p1, r1)):
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=r, matrix=Matrix.Translation(p))

    hip = 0.92
    sx = stride
    capsule((-0.085, -sx, 0.04), (-0.09, 0.0, hip), 0.045, 0.07)
    capsule((0.085, sx * 0.6, 0.04), (0.09, 0.0, hip), 0.045, 0.07)
    capsule((0.0, 0.0, hip - 0.02), (0.0, 0.0, 1.36), 0.13, 0.15)
    capsule((-0.17, 0.0, 1.38), (0.17, 0.0, 1.38), 0.055, 0.055)
    capsule((-0.19, 0.0, 1.38), (-0.22, arm, 0.84), 0.042, 0.036)
    capsule((0.19, 0.0, 1.38), (0.22, -arm * 0.5, 0.84), 0.042, 0.036)
    capsule((0.0, 0.0, 1.38), (0.0, 0.0, 1.5), 0.045, 0.045)
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.1, matrix=Matrix.Translation((0, 0.01, 1.6)))
    bmesh.ops.scale(bm, vec=(s * rng.uniform(0.95, 1.08), s, s), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, yaw)
    me.materials.append(mat)
    return ob


def crowd(scene):
    mat = E.simple_material("Silhouette", 0.025, 0.6, 0.3)
    rng = np.random.default_rng(1531)
    xs = []
    # clustered along the base, denser between the f foot and the x
    centres = [-9.5, -6.0, -2.5, 0.5, 3.0, 6.5, 9.0]
    for c in centres:
        for _ in range(rng.integers(1, 4)):
            xs.append(c + rng.normal(0, 0.9))
    xs = sorted(xs)
    figs = []
    for i, x in enumerate(xs):
        y = -9.0 + rng.normal(0, 1.6)
        figs.append(
            person(
                scene,
                f"Person{i:02d}",
                (x, y, 0.0),
                rng.uniform(1.62, 1.86),
                math.radians(rng.uniform(150, 210)),  # facing the mark
                rng.choice([0.0, 0.0, 0.12, 0.2]),
                rng.uniform(-0.08, 0.08),
                mat,
                1000 + i,
            )
        )
    return figs


# --------------------------------------------------------------------------
# volumes


def volumes(scene, t_frames):
    # aerial haze over the whole flat (homogeneous: cheap, carries the rays)
    mat, b, v, out = E.volume_material("Air", density=float(os.environ.get("AIR", "0.00005")), anisotropy=float(os.environ.get("AIRG", "0.9")))
    # starts ~45 m in front of the camera: shafts that pass right by the lens
    # would streak across the whole frame
    air = E.box(scene, "Air", (520, 570, 150), (0, 215, 75), mat)
    air.visible_shadow = False

    # ground mist: thicker towards and beyond the mark, wisps drifting
    mat, b, out = E.material("Mist")
    vol = b.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = E.gray(1.0)
    vol.inputs["Anisotropy"].default_value = 0.35
    co = b.coord("Object")
    x, y, z = b.xyz(co)
    tval = b.new("ShaderNodeValue")
    for f, val in t_frames:
        tval.outputs[0].default_value = val
        tval.outputs[0].keyframe_insert("default_value", frame=f)
    drift = b.combine(b.mul(tval.outputs[0], 1.6), b.mul(tval.outputs[0], 0.3), 0.0)
    pco = b.v("ADD", b.v("MULTIPLY", co, (1.0, 1.0, 3.2)), drift)
    wisp = b.noise(pco, 0.045, float(os.environ.get("MISTD", "3")), 0.6)
    wisp = b.mr(wisp, 0.38, 0.72, 0.05, 1.0)
    fall = b.m("EXPONENT", b.mul(z, -1.0 / 1.5))
    depth = b.mr(y, -40.0, 20.0, 0.04, 1.0, interp="SMOOTHSTEP")
    dens = b.mul(b.mul(b.mul(fall, wisp), depth), 0.006)
    b.set(vol.inputs["Density"], dens)
    b.ln.new(vol.outputs[0], out.inputs["Volume"])
    mist = E.box(scene, "Mist", (500, 450, 12), (0, 150, 6.0), mat)
    mist.visible_shadow = False
    return air, mist


def cloud_cookie(scene):
    """A shadow-only cloud layer between the sun and the scene: its gaps cut
    the sunlight into the shafts that fan from the break."""
    mat, b, out = E.material("Cookie")
    co = b.coord("Object")
    deck = b.noise(co, 0.006, 2.0, 0.5)  # where the cloud deck is open at all
    n2 = b.noise(co, 0.055, 2.0, 0.55)
    hole = b.mul(b.mr(n2, 0.5, 0.62, 0.12, 1.0, interp="SMOOTHSTEP"), b.mr(deck, 0.35, 0.6, 0.3, 1.0))
    tr = b.new("ShaderNodeBsdfTransparent")
    df = b.new("ShaderNodeBsdfDiffuse")
    df.inputs["Color"].default_value = E.gray(0.0)
    mix = b.new("ShaderNodeMixShader")
    b.set(mix.inputs[0], hole)
    b.ln.new(df.outputs[0], mix.inputs[1])
    b.ln.new(tr.outputs[0], mix.inputs[2])
    b.ln.new(mix.outputs[0], out.inputs["Surface"])
    ob = E.mesh_object(scene, "Cookie", [(-700, -350, 0), (700, -350, 0), (700, 350, 0), (-700, 350, 0)], [(0, 1, 2, 3)], mat)
    ob.location = SUN * 420.0
    ob.rotation_euler = SUN.to_track_quat("Z", "Y").to_euler()
    E.hide_from_rays(ob, camera=True, diffuse=True, glossy=True, transmission=True, scatter=True, shadow=False)
    return ob


# --------------------------------------------------------------------------


def build():
    scene = E.new_scene(FRAMES, samples=32, adaptive=0.03, bounces=(4, 2, 3, 4))
    c = scene.cycles
    c.volume_bounces = 0
    c.volume_biased = True  # ray marching: ~2x faster than null scattering here
    c.volume_step_rate = 4.0
    c.volume_max_steps = 256
    E.compositor(scene, bloom=0.22, bloom_size=0.7, threshold=2.5, vignette=0.32, gain=1.2)
    world(scene)

    t_frames = [(1, 0.0), (FRAMES, (FRAMES - 1) / 30.0)]

    flat = E.mesh_object(scene, "Flat", [(-1500, -300, 0), (1500, -300, 0), (1500, 1500, 0), (-1500, 1500, 0)], [(0, 1, 2, 3)], flat_material(t_frames))
    for ob in E.build_mark(scene, MH, MD, MB, concrete_material()):
        ob.data.transform(__import__("mathutils").Matrix.Rotation(ROT, 4, "Z"))
    crowd(scene)
    dbg = os.environ.get("PLAIN_DBG", "")
    air, mist = volumes(scene, t_frames)
    if "noair" in dbg:
        bpy.data.objects.remove(air)
    if "nomist" in dbg:
        bpy.data.objects.remove(mist)
    if "biased" in dbg:
        scene.cycles.volume_biased = True
        scene.cycles.volume_step_rate = float(os.environ.get("STEP", "4"))
    if "nocookie" not in dbg:
        cloud_cookie(scene)
    if "flatworld" in dbg:
        scene.world.node_tree.nodes.clear()
        o = scene.world.node_tree.nodes.new("ShaderNodeOutputWorld")
        bgn = scene.world.node_tree.nodes.new("ShaderNodeBackground")
        bgn.inputs[0].default_value = (0.2, 0.2, 0.2, 1)
        scene.world.node_tree.links.new(bgn.outputs[0], o.inputs[0])

    sd = bpy.data.lights.new("Sun", "SUN")
    sd.energy = 7.0
    sd.angle = math.radians(1.4)
    sd.color = (1, 1, 1)
    sun = bpy.data.objects.new("Sun", sd)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (-SUN).to_track_quat("-Z", "Y").to_euler()
    sun.visible_glossy = False  # the sky's own sun core is what the water mirrors
    sun.visible_diffuse = True

    cam = E.camera(scene, lens=LENS)
    # keep the mark's optical centre horizontally centred, horizon at ~76%
    tgt_z = 9.5
    for f in range(1, FRAMES + 1):
        t = (f - 1) / (FRAMES - 1)
        loc = CAM0.lerp(CAM1, t)
        pitch_target = Vector((0.0, 0.0, 0.0))
        dist = MD / 2 - loc.y
        pitch = math.atan((0.26 * 20.25) / LENS)  # horizon 26% below centre
        pitch_target = Vector((0.0, MD / 2, loc.z + dist * math.tan(pitch)))
        E.look_at(cam, loc, pitch_target)
        E.key_camera(cam, f)
    E.set_interp(cam, "LINEAR")
    del tgt_z
    return scene


if __name__ == "__main__":
    args = E.parse_args()
    E.finish(build(), "plain", args, FRAMES)
