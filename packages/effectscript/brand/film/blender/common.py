"""Shared setup for the EffectScript launch-film Blender shots.

Every shot script imports this module, builds its scene from nothing and calls
`finish()`. Run a shot headless with

    blender -b -P film/blender/<shot>.py -- [--stills 1,150,300] [--scale 50]
                                            [--range 1-300] [--samples 64]

Output is the 4K HDR master: 3840x2160 half-float OpenEXR (DWAA), scene-linear
(no view transform baked in). Without `--stills`, the full sequence is written
to `film/build/blender/<shot>/0001.exr ...` and the scene is saved as
`film/build/blender/<shot>.blend`. Stills go to `film/build/blender/_stills/`
as EXR plus an AgX-tonemapped PNG preview.

Exposure contract (linear): lit concrete highlights ~0.8-1.2, emissive cores
and shaft hot spots up to ~4-6, floor/haze 0.001-0.02, blacks not lifted.

The mark comes from `brand/scripts/mark.py` (master units, y down). In Blender
the mark stands on the floor (z = 0), its optical centre on x = 0, its front
face towards -y, at MARK_HEIGHT metres tall.
"""

import argparse
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.normpath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(BRAND, "film", "build", "blender")
sys.path.insert(0, os.path.join(BRAND, "scripts"))
import mark as M  # noqa: E402

W, H, FPS = 3840, 2160, 30  # 4K HDR master
PX = W / 1920  # brief pixel positions were written for 1080p
INK = (0x09, 0x09, 0x0B)

MARK_HEIGHT = 2.0  # metres
S = MARK_HEIGHT / M.BBOX_H  # metres per master unit
MARK_DEPTH = 0.36
MARK_BEVEL = 0.011


# --------------------------------------------------------------------------
# arguments


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--stills", default="", help="comma-separated frames to render as stills")
    p.add_argument("--range", default="", help="a-b subrange of the sequence")
    p.add_argument("--scale", type=int, default=100, help="resolution percentage")
    p.add_argument("--samples", type=int, default=0, help="override render samples")
    p.add_argument("--no-save", action="store_true")
    return p.parse_args(argv)


# --------------------------------------------------------------------------
# maths


def clamp01(x):
    return max(0.0, min(1.0, x))


def smoothstep(a, b, x):
    t = clamp01((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def ease_in_out(t):
    t = clamp01(t)
    return 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out(t, p=3):
    return 1 - (1 - clamp01(t)) ** p


def ease_in(t, p=3):
    return clamp01(t) ** p


def lerp(a, b, t):
    return a + (b - a) * t


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def gray(v):
    """Linear grey RGBA."""
    return (v, v, v, 1.0)


class SmoothNoise:
    """Deterministic 1D value noise for camera shake (sum of random sines)."""

    def __init__(self, seed, octaves=4):
        rng = np.random.default_rng(seed)
        self.f = rng.uniform(0.6, 1.4, octaves) * (2.0 ** np.arange(octaves))
        self.a = 1.0 / (2.0 ** np.arange(octaves))
        self.p = rng.uniform(0, 2 * math.pi, octaves)

    def __call__(self, t):
        return float(np.sum(self.a * np.sin(self.f * t + self.p)) / np.sum(self.a))


# --------------------------------------------------------------------------
# scene and render settings


def new_scene(frames, engine="BLENDER_EEVEE", samples=64):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Shot"
    r = scene.render
    r.engine = engine
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    r.fps, r.fps_base = FPS, 1.0
    scene.frame_start, scene.frame_end = 1, frames
    exr_settings(r.image_settings)
    r.dither_intensity = 1.0
    r.film_transparent = False
    r.use_persistent_data = True

    vs = scene.view_settings
    vs.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            vs.look = look
            break
        except TypeError:
            pass
    vs.exposure = 0.0
    vs.gamma = 1.0

    e = scene.eevee
    e.taa_render_samples = samples
    e.use_raytracing = True
    e.ray_tracing_method = "SCREEN"
    e.ray_tracing_options.resolution_scale = "1"
    e.ray_tracing_options.trace_max_roughness = 0.6
    e.ray_tracing_options.screen_trace_quality = 0.75
    e.use_shadows = True
    e.shadow_ray_count = 2
    e.shadow_step_count = 8
    e.volumetric_tile_size = "8"  # 4 px at 1080p; same froxel density at 4K
    e.volumetric_samples = 64
    e.volumetric_sample_distribution = 0.8
    e.use_volumetric_shadows = True
    e.volumetric_shadow_samples = 32
    e.volumetric_start = 0.1
    e.volumetric_end = 60.0
    e.bokeh_max_size = 160
    e.use_fast_gi = False
    e.clamp_surface_indirect = 10.0

    if engine == "CYCLES":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "METAL"
        c = scene.cycles
        c.device = "GPU"
        c.samples = samples
        c.use_adaptive_sampling = True
        c.adaptive_threshold = 0.02
        c.use_denoising = True
        c.denoiser = "OPENIMAGEDENOISE"
        c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        c.max_bounces = 6
        c.volume_bounces = 0
        c.sample_clamp_indirect = 4.0
        c.volume_step_rate = 4.0
    return scene


def exr_settings(im):
    """Half-float RGB OpenEXR, DWAA. EXR stores scene-linear values: no view
    transform is baked in, the compositor result (bloom included) is what is
    written."""
    im.file_format = "OPEN_EXR"
    im.color_mode = "RGB"
    im.color_depth = "16"
    im.exr_codec = "DWAA"


def world(scene, color=0.0, density=0.0, anisotropy=0.4):
    """Near-black world with an optional homogeneous haze volume.

    Returns the Principled Volume node so shots can animate the density."""
    w = bpy.data.worlds.new("World")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = gray(color)
    bg.inputs["Strength"].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = gray(1.0)
    vol.inputs["Density"].default_value = density
    vol.inputs["Anisotropy"].default_value = anisotropy
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return vol


def compositor(scene, bloom=0.7, bloom_size=0.6, threshold=0.8, fog=0.0, vignette=0.35, gain=1.0):
    """Bloom + soft fog glow, forced monochrome, a gentle vignette and an
    overall linear gain. Output stays scene-linear for the HDR master; blacks
    are not lifted (the editor grades to ink)."""
    r = scene.render
    r.use_compositing = True
    tree = bpy.data.node_groups.new("Grade", "CompositorNodeTree")
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    scene.compositing_node_group = tree
    n, ln = tree.nodes, tree.links

    rl = n.new("CompositorNodeRLayers")
    cur = rl.outputs["Image"]

    def glare(src, kind, strength, size, thr):
        g = n.new("CompositorNodeGlare")
        g.inputs["Type"].default_value = kind
        g.inputs["Quality"].default_value = "High"
        g.inputs["Threshold"].default_value = thr
        g.inputs["Smoothness"].default_value = 0.5
        g.inputs["Strength"].default_value = strength
        g.inputs["Size"].default_value = size
        ln.new(src, g.inputs["Image"])
        return g.outputs["Image"]

    if bloom > 0:
        cur = glare(cur, "Bloom", bloom, bloom_size, threshold)
    if fog > 0:
        cur = glare(cur, "Fog Glow", fog, 0.9, threshold * 2)

    hs = n.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 0.0
    ln.new(cur, hs.inputs["Image"])
    cur = hs.outputs["Image"]

    if vignette > 0:
        ell = n.new("CompositorNodeEllipseMask")
        ell.inputs["Size"].default_value = (1.25, 1.35)
        blur = n.new("CompositorNodeBlur")
        blur.inputs["Size"].default_value = (int(420 * PX), int(420 * PX))
        ln.new(ell.outputs["Mask"], blur.inputs["Image"])
        mr = n.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = 1.0 - vignette
        mr.inputs["To Max"].default_value = 1.0
        ln.new(blur.outputs["Image"], mr.inputs["Value"])
        mul = n.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        ln.new(cur, mul.inputs[6])
        ln.new(mr.outputs["Result"], mul.inputs[7])
        cur = mul.outputs[2]

    if gain != 1.0:
        mul = n.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        ln.new(cur, mul.inputs[6])
        mul.inputs[7].default_value = (gain, gain, gain, 1.0)
        cur = mul.outputs[2]

    out = n.new("NodeGroupOutput")
    ln.new(cur, out.inputs[0])
    return tree


def camera(scene, lens=50, fstop=0.0, focus=10.0, clip=(0.05, 300)):
    cd = bpy.data.cameras.new("Camera")
    cd.lens = lens
    cd.sensor_width = 36
    cd.clip_start, cd.clip_end = clip
    if fstop > 0:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus
        cd.dof.aperture_blades = 0
    cam = bpy.data.objects.new("Camera", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.rotation_mode = "XYZ"
    return cam


def look_at(cam, loc, target, roll=0.0):
    from mathutils import Vector

    cam.location = loc
    d = Vector(target) - Vector(loc)
    q = d.to_track_quat("-Z", "Y")
    e = q.to_euler("XYZ")
    if roll:
        from mathutils import Matrix

        m = q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, "Z")
        e = m.to_euler("XYZ")
    cam.rotation_euler = e


def key_camera(cam, frame, focus=None):
    cam.keyframe_insert("location", frame=frame)
    cam.keyframe_insert("rotation_euler", frame=frame)
    if focus is not None:
        cam.data.dof.focus_distance = focus
        cam.data.dof.keyframe_insert("focus_distance", frame=frame)


def linear_fcurves(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action:
        return
    for fc in fcurves(ad.action):
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"


def fcurves(action):
    """Every F-curve of an action (layered actions in 4.4+, flat before)."""
    if hasattr(action, "layers") and action.layers:
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
        return out
    return list(action.fcurves)


def key_value(socket_or_obj, path, frames_values, interp="BEZIER"):
    """Keyframe a property on a socket/ID at several (frame, value) pairs."""
    for f, v in frames_values:
        if path == "default_value":
            socket_or_obj.default_value = v
        else:
            setattr(socket_or_obj, path, v)
        socket_or_obj.keyframe_insert(path, frame=f)


def set_interpolation(idblock, interp):
    ad = idblock.animation_data
    if ad and ad.action:
        for fc in fcurves(ad.action):
            for k in fc.keyframe_points:
                k.interpolation = interp


# --------------------------------------------------------------------------
# materials


def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    return nt, nt.nodes, nt.links


def emission_material(name, strength=6.0, attr=None, attr_scale=1.0):
    """Pure white emission. With `attr`, strength = attr * attr_scale."""
    mat = bpy.data.materials.new(name)
    nt, n, ln = _nodes(mat)
    out = n.new("ShaderNodeOutputMaterial")
    em = n.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = gray(1.0)
    em.inputs["Strength"].default_value = strength
    if attr:
        a = n.new("ShaderNodeAttribute")
        a.attribute_name = attr
        a.attribute_type = "GEOMETRY"
        m = n.new("ShaderNodeMath")
        m.operation = "MULTIPLY"
        m.inputs[1].default_value = attr_scale
        ln.new(a.outputs["Fac"], m.inputs[0])
        ln.new(m.outputs[0], em.inputs["Strength"])
    ln.new(em.outputs[0], out.inputs["Surface"])
    return mat


def concrete_nodes(nt, coord):
    """Pale procedural concrete: large mottling, fine sand, sparse pores.
    Returns the Principled BSDF output socket."""
    n, ln = nt.nodes, nt.links

    def noise(scale, detail, rough=0.6, dims="3D", vec=coord):
        t = n.new("ShaderNodeTexNoise")
        t.noise_dimensions = dims
        t.inputs["Scale"].default_value = scale
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        ln.new(vec, t.inputs["Vector"])
        return t.outputs["Factor"]

    def mrange(src, a, b, c, d):
        m = n.new("ShaderNodeMapRange")
        m.inputs["From Min"].default_value = a
        m.inputs["From Max"].default_value = b
        m.inputs["To Min"].default_value = c
        m.inputs["To Max"].default_value = d
        ln.new(src, m.inputs["Value"])
        return m.outputs["Result"]

    def add(a, b, op="ADD"):
        m = n.new("ShaderNodeMath")
        m.operation = op
        ln.new(a, m.inputs[0])
        if isinstance(b, float):
            m.inputs[1].default_value = b
        else:
            ln.new(b, m.inputs[1])
        return m.outputs[0]

    mottle = noise(1.6, 6, 0.55)  # cloudy tone variation
    blotch = noise(7.0, 8, 0.62)  # mid-scale stains and trowel marks
    sand = noise(140.0, 4, 0.7)  # fine aggregate
    vor = n.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = 220.0
    vor.inputs["Randomness"].default_value = 1.0
    ln.new(coord, vor.inputs["Vector"])
    pores = mrange(vor.outputs["Distance"], 0.0, 0.13, 1.0, 0.0)  # 1 inside a pore
    pmask = noise(6.0, 3, 0.5)
    pores = add(pores, mrange(pmask, 0.40, 0.62, 0.0, 1.0), "MULTIPLY")

    tone = add(mrange(mottle, 0.3, 0.7, 0.50, 0.70), mrange(blotch, 0.35, 0.65, -0.07, 0.05))
    tone = add(tone, mrange(sand, 0.3, 0.7, -0.05, 0.05))
    tone = add(tone, add(pores, -0.32, "MULTIPLY"))
    base = n.new("ShaderNodeCombineColor")
    for i in range(3):
        ln.new(tone, base.inputs[i])

    rough = add(mrange(mottle, 0.3, 0.7, 0.58, 0.88), mrange(sand, 0.2, 0.8, -0.08, 0.08))

    height = add(add(sand, 0.5, "MULTIPLY"), add(pores, -1.0, "MULTIPLY"))
    height = add(height, add(blotch, 0.6, "MULTIPLY"))
    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4
    bump.inputs["Distance"].default_value = 0.0015
    ln.new(height, bump.inputs["Height"])

    bsdf = n.new("ShaderNodeBsdfPrincipled")
    ln.new(base.outputs[0], bsdf.inputs["Base Color"])
    ln.new(rough, bsdf.inputs["Roughness"])
    ln.new(bump.outputs[0], bsdf.inputs["Normal"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    return bsdf.outputs[0]


def concrete_material(name="Concrete"):
    mat = bpy.data.materials.new(name)
    nt, n, ln = _nodes(mat)
    tc = n.new("ShaderNodeTexCoord")
    out = n.new("ShaderNodeOutputMaterial")
    ln.new(concrete_nodes(nt, tc.outputs["Object"]), out.inputs["Surface"])
    return mat


def floor_material(name="WetFloor"):
    """Black polished concrete with wet patches: dark diffuse, glossy
    reflections broken up by puddle-shaped roughness noise. Returns
    (material, specular socket) so shots can fade the wetness in."""
    mat = bpy.data.materials.new(name)
    nt, n, ln = _nodes(mat)
    tc = n.new("ShaderNodeTexCoord")
    co = tc.outputs["Object"]

    def noise(scale, detail, rough=0.6):
        t = n.new("ShaderNodeTexNoise")
        t.inputs["Scale"].default_value = scale
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        ln.new(co, t.inputs["Vector"])
        return t.outputs["Factor"]

    def mrange(src, a, b, c, d):
        m = n.new("ShaderNodeMapRange")
        m.inputs["From Min"].default_value = a
        m.inputs["From Max"].default_value = b
        m.inputs["To Min"].default_value = c
        m.inputs["To Max"].default_value = d
        ln.new(src, m.inputs["Value"])
        return m.outputs["Result"]

    puddles = mrange(noise(0.35, 5, 0.55), 0.42, 0.58, 0.0, 1.0)  # 1 = wet
    micro = noise(60.0, 6, 0.65)
    rough = n.new("ShaderNodeMix")
    rough.data_type = "FLOAT"
    ln.new(puddles, rough.inputs["Factor"])
    ln.new(mrange(micro, 0.3, 0.7, 0.30, 0.48), rough.inputs[2])
    ln.new(mrange(micro, 0.3, 0.7, 0.04, 0.10), rough.inputs[3])

    tone = mrange(noise(2.5, 6, 0.6), 0.3, 0.7, 0.0035, 0.0075)
    base = n.new("ShaderNodeCombineColor")
    for i in range(3):
        ln.new(tone, base.inputs[i])

    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.002
    ln.new(micro, bump.inputs["Height"])

    bsdf = n.new("ShaderNodeBsdfPrincipled")
    ln.new(base.outputs[0], bsdf.inputs["Base Color"])
    ln.new(rough.outputs[0], bsdf.inputs["Roughness"])
    ln.new(bump.outputs[0], bsdf.inputs["Normal"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    out = n.new("ShaderNodeOutputMaterial")
    ln.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat, bsdf.inputs["Specular IOR Level"]


def floor(scene, size=80.0):
    mesh = bpy.data.meshes.new("Floor")
    h = size / 2
    mesh.from_pydata([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new("Floor", mesh)
    scene.collection.objects.link(obj)
    mat, spec = floor_material()
    mesh.materials.append(mat)
    return obj, spec


# --------------------------------------------------------------------------
# the mark


def _arc(p0, r, p1, sweep, step=6.0):
    """Points (excluding p0) of an SVG circular arc, large-arc flag 0."""
    (x1, y1), (x2, y2) = p0, p1
    xp, yp = (x1 - x2) / 2, (y1 - y2) / 2
    sign = 1 if sweep else -1  # large-arc 0: sign = +1 when flags differ
    num = max(r * r - xp * xp - yp * yp, 0.0)
    coef = sign * math.sqrt(num / (xp * xp + yp * yp))
    cx, cy = coef * yp + (x1 + x2) / 2, -coef * xp + (y1 + y2) / 2
    t1 = math.atan2(y1 - cy, x1 - cx)
    dt = math.atan2(y2 - cy, x2 - cx) - t1
    if sweep and dt < 0:
        dt += 2 * math.pi
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    n = max(4, math.ceil(abs(dt) * r / step))
    return [(cx + r * math.cos(t1 + dt * k / n), cy + r * math.sin(t1 + dt * k / n)) for k in range(1, n + 1)]


def mark_polygons(step=6.0):
    """The mark as three simple polygons in master units (y down):
    the f with the shared stroke spliced into its stem, and the two halves of
    the thin diagonal. Same silhouette as mark.path_d() (nonzero fill)."""
    body = []
    splice_at = (M.STEM_R, M.CB_OUT[1])
    splice = [(M.STEM_R, M.BAR_B), M.A_IN, M.A_BL, M.A_BR, M.A_TR, (M.STEM_R, M.XH)]
    for c in M._f_cmds():
        if c[0] in "ML":
            body.append((c[1], c[2]))
        elif c[0] == "A":
            body.extend(_arc(body[-1], c[1], (c[2], c[3]), c[4], step))
        if body and abs(body[-1][0] - splice_at[0]) < 1e-6 and abs(body[-1][1] - splice_at[1]) < 1e-6:
            body.extend(splice)
    upper, lower = M._thin(M.GAP)
    return {"body": body, "thin_upper": list(upper), "thin_lower": list(lower)}


def to_local(x, y):
    """Master units -> mark-local 2D metres (x right, y up, origin at the
    optical-centre x and the baseline)."""
    return ((x - M.CENTER[0]) * S, (M.BASE - y) * S)


def mark_point(x, y, depth_y=0.0):
    """Master units -> world position on the front plane of the mark."""
    lx, lz = to_local(x, y)
    return (lx, depth_y, lz)


MARK_CENTER_Z = (M.BASE - M.CENTER[1]) * S  # optical centre height
CROSSBAR_Z = (M.BASE - (M.XH + M.BAR_B) / 2) * S


def mark_piece(scene, name, poly, material, depth=MARK_DEPTH, bevel=MARK_BEVEL, smooth_angle=35.0):
    """Extrude one polygon into a bevelled slab mesh standing on the floor.

    Built as a 2D curve (exact outline, `offset` pulls the bevel back inside
    the silhouette), then converted to a mesh with angle-based smoothing."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = depth / 2 - bevel
    cu.bevel_depth = bevel
    cu.bevel_resolution = 3
    cu.offset = -bevel
    sp = cu.splines.new("POLY")
    pts = [to_local(x, y) for x, y in poly]
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, 0.0, 1.0)
    sp.use_cyclic_u = True
    tmp = bpy.data.objects.new(name + "_curve", cu)
    scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    mesh.name = name
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=math.radians(smooth_angle))
    obj = bpy.data.objects.new(name, mesh)
    obj.rotation_euler = (math.radians(90), 0, 0)  # local y -> world z, extrude along world y
    scene.collection.objects.link(obj)
    mesh.materials.append(material)
    return obj


def build_mark(scene, material, depth=MARK_DEPTH):
    polys = mark_polygons()
    return {k: mark_piece(scene, "Mark_" + k, p, material, depth) for k, p in polys.items()}


# --------------------------------------------------------------------------
# dust


def dust(scene, count=1600, box=((-4, 4), (-3, 3), (0, 5)), radius=0.0025, seed=7, drift=0.06, material=None):
    """Floating dust motes: points instanced with tiny spheres, drifting on
    4D noise driven by scene time (no keyframes needed)."""
    rng = np.random.default_rng(seed)
    pts = np.column_stack([rng.uniform(*box[i], count) for i in range(3)])
    mesh = bpy.data.meshes.new("DustPoints")
    mesh.from_pydata([tuple(p) for p in pts], [], [])
    sizes = mesh.attributes.new("size", "FLOAT", "POINT")
    sizes.data.foreach_set("value", rng.lognormal(0.0, 0.45, count).astype(np.float32))
    obj = bpy.data.objects.new("Dust", mesh)
    scene.collection.objects.link(obj)

    ng = bpy.data.node_groups.new("DustDrift", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n, ln = ng.nodes, ng.links
    gi, go = n.new("NodeGroupInput"), n.new("NodeGroupOutput")
    t = n.new("GeometryNodeInputSceneTime")
    pos = n.new("GeometryNodeInputPosition")
    nz = n.new("ShaderNodeTexNoise")
    nz.noise_dimensions = "4D"
    nz.inputs["Scale"].default_value = 0.35
    nz.inputs["Detail"].default_value = 1.0
    ln.new(pos.outputs[0], nz.inputs["Vector"])
    tw = n.new("ShaderNodeMath")
    tw.operation = "MULTIPLY"
    tw.inputs[1].default_value = 0.05
    ln.new(t.outputs["Seconds"], tw.inputs[0])
    ln.new(tw.outputs[0], nz.inputs["W"])
    centre = n.new("ShaderNodeVectorMath")
    centre.operation = "MULTIPLY_ADD"
    centre.inputs[1].default_value = (2 * drift * 10, 2 * drift * 10, 2 * drift * 10)
    centre.inputs[2].default_value = (-drift * 10, -drift * 10, -drift * 10)
    ln.new(nz.outputs["Color"], centre.inputs[0])
    # slow downward settle + sideways drift
    fall = n.new("ShaderNodeVectorMath")
    fall.operation = "SCALE"
    fall.inputs[0].default_value = (0.012, 0.004, -0.018)
    ln.new(t.outputs["Seconds"], fall.inputs["Scale"])
    off = n.new("ShaderNodeVectorMath")
    off.operation = "ADD"
    ln.new(centre.outputs[0], off.inputs[0])
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
    if material is None:
        material = bpy.data.materials.new("Dust")
        nt, nn, l2 = _nodes(material)
        b = nn.new("ShaderNodeBsdfPrincipled")
        b.inputs["Base Color"].default_value = gray(0.12)
        b.inputs["Roughness"].default_value = 0.6
        b.inputs["Emission Color"].default_value = gray(1.0)
        b.inputs["Emission Strength"].default_value = 0.0
        o = nn.new("ShaderNodeOutputMaterial")
        l2.new(b.outputs[0], o.inputs["Surface"])
    setm.inputs["Material"].default_value = material
    ln.new(iop.outputs[0], setm.inputs["Geometry"])
    ln.new(setm.outputs[0], go.inputs[0])
    mod = obj.modifiers.new("Drift", "NODES")
    mod.node_group = ng
    return obj


# --------------------------------------------------------------------------
# lights


def spot(scene, name, loc, target, energy, angle_deg, blend=0.6, radius=0.1, volume=1.0):
    ld = bpy.data.lights.new(name, "SPOT")
    ld.energy = energy
    ld.spot_size = math.radians(angle_deg)
    ld.spot_blend = blend
    ld.shadow_soft_size = radius
    ld.color = (1, 1, 1)
    ld.volume_factor = volume
    obj = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(obj)
    look_at(obj, loc, target)
    return obj


def area(scene, name, loc, target, energy, size=1.0, size_y=None, volume=1.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.shape = "RECTANGLE" if size_y else "SQUARE"
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.volume_factor = volume
    obj = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(obj)
    look_at(obj, loc, target)
    return obj


# --------------------------------------------------------------------------
# output


def finish(scene, shot, args):
    import time

    if args.samples:
        scene.eevee.taa_render_samples = args.samples
        if scene.render.engine == "CYCLES":
            scene.cycles.samples = args.samples
    scene.render.resolution_percentage = args.scale
    os.makedirs(BUILD, exist_ok=True)
    if not args.no_save and not args.stills:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, f"{shot}.blend"), compress=True)

    t0 = time.time()
    if args.stills:
        outdir = os.path.join(BUILD, "_stills", shot)
        os.makedirs(outdir, exist_ok=True)
        for f in [int(x) for x in args.stills.split(",")]:
            t = time.time()
            scene.frame_set(f)
            scene.render.filepath = os.path.join(outdir, f"{f:04d}.exr")
            bpy.ops.render.render(write_still=True)
            # tonemapped (AgX) preview for looking at, next to the linear EXR
            im = scene.render.image_settings
            im.file_format, im.color_depth = "PNG", "8"
            bpy.data.images["Render Result"].save_render(os.path.join(outdir, f"{f:04d}.png"), scene=scene)
            exr_settings(im)
            print(f"[{shot}] still {f} in {time.time() - t:.1f}s", flush=True)
    else:
        if args.range:
            a, b = (int(x) for x in args.range.split("-"))
            scene.frame_start, scene.frame_end = a, b
        outdir = os.path.join(BUILD, shot)
        os.makedirs(outdir, exist_ok=True)
        scene.render.filepath = os.path.join(outdir, "####")
        scene.render.use_file_extension = True
        bpy.ops.render.render(animation=True)
    print(f"[{shot}] render time {time.time() - t0:.1f}s", flush=True)


# --------------------------------------------------------------------------
# the concrete stage shared by `monolith` and `hero`


def stage(scene, haze=0.025, mark_material=None, dust_count=2200, dust_box=((-5, 5), (-5, 3), (0, 5))):
    """Wet black floor, hazy world, the concrete mark and drifting dust.
    Returns a dict with the handles shots animate."""
    vol = world(scene, 0.0, haze, anisotropy=0.55)
    fl, spec = floor(scene)
    mat = mark_material or concrete_material()
    pieces = build_mark(scene, mat)
    d = dust(scene, count=dust_count, box=dust_box)
    return {"volume": vol, "floor": fl, "floor_spec": spec, "mark": pieces, "material": mat, "dust": d}


def slats(scene, light_from, light_to, distance, seed=0, count=9, width=1.4, length=2.2):
    """A grille of uneven bars just in front of a light, hidden from camera
    and reflections, so the light's beam breaks into god-ray shafts."""
    from mathutils import Vector

    rng = np.random.default_rng(seed)
    a, b = Vector(light_from), Vector(light_to)
    d = (b - a).normalized()
    centre = a + d * distance
    verts, faces = [], []
    x = -width / 2
    while x < width / 2:
        bar = rng.uniform(0.04, 0.16)
        gap = rng.uniform(0.03, 0.12)
        i = len(verts)
        verts += [(x, -length / 2, 0), (x + bar, -length / 2, 0), (x + bar, length / 2, 0), (x, length / 2, 0)]
        faces.append((i, i + 1, i + 2, i + 3))
        x += bar + gap
    mesh = bpy.data.meshes.new("Slats")
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new("Slats", mesh)
    scene.collection.objects.link(obj)
    obj.location = centre
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    obj.rotation_euler.rotate_axis("Z", math.radians(rng.uniform(-25, 25)))
    obj.visible_camera = False
    obj.visible_glossy = False
    obj.visible_diffuse = False
    mat = bpy.data.materials.new("SlatBlack")
    mat.diffuse_color = (0, 0, 0, 1)
    mesh.materials.append(mat)
    return obj


def aim_at_screen(scene, cam, loc, point, sx, sy, roll=0.0, iterations=4):
    """Place the camera at `loc` and rotate it so world `point` lands at
    screen position (sx, sy) in pixels (origin top-left)."""
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Matrix, Vector

    look_at(cam, loc, point, roll)
    base = cam.rotation_euler.to_matrix()
    ax, ay = 0.0, 0.0
    for _ in range(iterations):
        cam.rotation_euler = (base @ Matrix.Rotation(ay, 3, "Y") @ Matrix.Rotation(ax, 3, "X")).to_euler("XYZ")
        bpy.context.view_layer.update()
        v = world_to_camera_view(scene, cam, Vector(point))
        ex = v.x - sx / W
        ey = v.y - (1 - sy / H)
        fx = cam.data.lens / cam.data.sensor_width  # focal length in frame widths
        ay -= math.atan(ex / fx)
        ax += math.atan(ey * (H / W) / fx)
    cam.rotation_euler = (base @ Matrix.Rotation(ay, 3, "Y") @ Matrix.Rotation(ax, 3, "X")).to_euler("XYZ")


def project(scene, cam, point):
    """World point -> (x, y) pixels, origin top-left."""
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector

    bpy.context.view_layer.update()
    v = world_to_camera_view(scene, cam, Vector(point))
    return v.x * W, (1 - v.y) * H


# --------------------------------------------------------------------------
# geometry-node helpers


class Graph:
    """Tiny builder for geometry-node groups: `g.node(type, inputs...)`
    returns the node; `g.math(op, a, b)` returns an output socket."""

    def __init__(self, name):
        self.ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
        self.ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
        self.ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
        self.n, self.ln = self.ng.nodes, self.ng.links
        self.inp = self.n.new("NodeGroupInput").outputs[0]
        self.out = self.n.new("NodeGroupOutput").inputs[0]

    def node(self, kind, inputs=None, **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        for k, v in (inputs or {}).items():
            self.set(nd.inputs[k], v)
        return nd

    def set(self, socket, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.ln.new(v, socket)
        else:
            socket.default_value = v

    def math(self, op, a, b=None, c=None):
        nd = self.n.new("ShaderNodeMath")
        nd.operation = op
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(nd.inputs[i], v)
        return nd.outputs[0]

    def vmath(self, op, a, b=None, c=None, scale=None):
        nd = self.n.new("ShaderNodeVectorMath")
        nd.operation = op
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(nd.inputs[i], v)
        if scale is not None:
            self.set(nd.inputs["Scale"], scale)
        return nd.outputs[0]

    def attr(self, name, data_type="FLOAT"):
        nd = self.n.new("GeometryNodeInputNamedAttribute")
        nd.data_type = data_type
        nd.inputs["Name"].default_value = name
        return nd.outputs["Attribute"]

    def mix(self, fac, a, b):
        nd = self.n.new("ShaderNodeMix")
        nd.data_type = "FLOAT"
        self.set(nd.inputs["Factor"], fac)
        self.set(nd.inputs[2], a)
        self.set(nd.inputs[3], b)
        return nd.outputs[0]

    def frame(self):
        return self.n.new("GeometryNodeInputSceneTime").outputs["Frame"]


def tube_tail(g, curve, scale, material, resolution=6):
    """Curve -> tubes with `scale` radius field, smooth shaded, material set."""
    circ = g.node("GeometryNodeCurvePrimitiveCircle", {"Resolution": resolution, "Radius": 1.0})
    c2m = g.node("GeometryNodeCurveToMesh", {"Curve": curve, "Profile Curve": circ.outputs["Curve"], "Scale": scale})
    sm = g.node("GeometryNodeSetShadeSmooth", {"Mesh": c2m.outputs[0]})
    mat = g.node("GeometryNodeSetMaterial", {"Geometry": sm.outputs[0], "Material": material})
    g.set(g.out, mat.outputs[0])


def curves_object(scene, name, points, attrs):
    """A Curves object from an (n_curves, n_points, 3) array plus attributes
    {name: array}: (n_curves,) per curve, (n_curves, n_points[, 3]) per point."""
    nc, npt, _ = points.shape
    cv = bpy.data.hair_curves.new(name)
    cv.add_curves([npt] * nc)
    cv.position_data.foreach_set("vector", points.astype(np.float32).ravel())
    cv.set_types(type="POLY")
    for k, v in attrs.items():
        v = np.asarray(v, dtype=np.float32)
        kind = "FLOAT_VECTOR" if v.ndim == 3 else "FLOAT"
        domain = "CURVE" if v.ndim == 1 else "POINT"
        a = cv.attributes.new(k, kind, domain)
        a.data.foreach_set("vector" if kind == "FLOAT_VECTOR" else "value", v.ravel())
    obj = bpy.data.objects.new(name, cv)
    scene.collection.objects.link(obj)
    return obj
