"""Shared helpers for the environment shots `plain`, `dawn` and `paper`.

Each shot script builds its scene from nothing (deterministic seeds) and calls
`finish()`. Run headless:

    blender -b -P film/blender-env/<shot>.py -- [--stills 1,40,80] [--res 960]
                                                [--lookdev] [--range 1-80]
                                                [--samples 64] [--no-save]

Masters are 3840x2160 half-float OpenEXR (DWAA, RGB), scene-linear: no view
transform is baked in, the compositor (gentle bloom, forced monochrome) is.
`--stills` writes EXR + AgX PNG previews into the scratch dir given by
`--out` (default build/blender/_lookdev/_iter/<shot>); `--lookdev` writes the
1920x1080 AgX review stills to build/blender/_lookdev/<shot>-NNNN.png.

Exposure contract (linear): lit diffuse 0.6-1.2, sun/lamp/shafts/sky break
3-6, deep blacks 0.001-0.02.
"""

import argparse
import math
import os
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.normpath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(BRAND, "film", "build", "blender")
LOOKDEV = os.path.join(BUILD, "_lookdev")
sys.path.insert(0, os.path.join(BRAND, "scripts"))
import mark as M  # noqa: E402

W, H, FPS = 3840, 2160, 30


# --------------------------------------------------------------------------
# arguments and maths


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--stills", default="")
    p.add_argument("--lookdev", action="store_true", help="first/middle/last at 1920x1080 AgX PNG")
    p.add_argument("--res", type=int, default=0, help="output width for stills (keeps 16:9)")
    p.add_argument("--range", default="")
    p.add_argument("--samples", type=int, default=0)
    p.add_argument("--out", default="")
    p.add_argument("--no-save", action="store_true")
    p.add_argument("--tag", default="")
    return p.parse_args(argv)


def clamp01(x):
    return max(0.0, min(1.0, x))


def smoothstep(a, b, x):
    t = clamp01((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def ease_in_out(t):
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def gray(v, a=1.0):
    return (v, v, v, a)


class SmoothNoise:
    """Deterministic 1D noise (sum of random sines), roughly in [-1, 1]."""

    def __init__(self, seed, octaves=4, base=1.0):
        rng = np.random.default_rng(seed)
        self.f = base * rng.uniform(0.7, 1.3, octaves) * (2.0 ** np.arange(octaves))
        self.a = 1.0 / (1.8 ** np.arange(octaves))
        self.p = rng.uniform(0, 2 * math.pi, octaves)

    def __call__(self, t):
        return float(np.sum(self.a * np.sin(self.f * t + self.p)) / np.sum(self.a) * 1.6)


# --------------------------------------------------------------------------
# scene


def new_scene(frames, samples=64, adaptive=0.02, bounces=(6, 4, 4, 8), clamp_ind=6.0):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Shot"
    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    r.fps, r.fps_base = FPS, 1.0
    scene.frame_start, scene.frame_end = 1, frames
    exr_settings(r.image_settings)
    r.film_transparent = False
    r.use_persistent_data = True

    vs = scene.view_settings
    vs.view_transform = "AgX"
    try:
        vs.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    c = scene.cycles
    c.device = "GPU"
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = adaptive
    c.adaptive_min_samples = 0
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    c.denoising_prefilter = "ACCURATE"
    try:
        c.denoising_quality = "HIGH"
    except Exception:
        pass
    c.denoising_use_gpu = True
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces, c.transparent_max_bounces = bounces
    c.transmission_bounces = 4
    c.volume_bounces = 0
    c.sample_clamp_direct = 0.0
    c.sample_clamp_indirect = clamp_ind
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 1.0
    c.use_animated_seed = False  # fixed noise pattern -> calmer denoised motion
    c.seed = 7
    c.use_light_tree = True
    c.tile_size = 2048
    return scene


def exr_settings(im):
    im.file_format = "OPEN_EXR"
    im.color_mode = "RGB"
    im.color_depth = "16"
    im.exr_codec = "DWAA"


KNEE, LIMIT = 4.0, 6.5


def softknee_np(x, k=KNEE, lim=LIMIT):
    """Highlight rolloff: identity below k, then asymptotic to lim."""
    import numpy as _np

    p = _np.maximum(x - k, 0.0)
    return x - p + p / (1.0 + p / (lim - k))


def compositor(scene, bloom=0.25, bloom_size=0.6, threshold=2.0, vignette=0.25, gain=1.0, knee=True):
    """Gentle bloom on the HDR highlights, forced monochrome, a soft vignette,
    a linear gain and a highlight soft-knee (identity below 4.0, asymptotic
    to 6.5) so sun discs and bulbs stay inside the 3-6 contract.
    Scene-linear out; blacks are not lifted."""
    scene.render.use_compositing = True
    tree = bpy.data.node_groups.new("Grade", "CompositorNodeTree")
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    scene.compositing_node_group = tree
    n, ln = tree.nodes, tree.links
    rl = n.new("CompositorNodeRLayers")
    cur = rl.outputs["Image"]
    if bloom > 0:
        g = n.new("CompositorNodeGlare")
        g.inputs["Type"].default_value = "Bloom"
        g.inputs["Quality"].default_value = "High"
        g.inputs["Threshold"].default_value = threshold
        g.inputs["Smoothness"].default_value = 0.6
        g.inputs["Strength"].default_value = bloom
        g.inputs["Size"].default_value = bloom_size
        ln.new(cur, g.inputs["Image"])
        cur = g.outputs["Image"]
    hs = n.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 0.0
    ln.new(cur, hs.inputs["Image"])
    cur = hs.outputs["Image"]
    if vignette > 0:
        ell = n.new("CompositorNodeEllipseMask")
        ell.inputs["Size"].default_value = (1.3, 1.4)
        blur = n.new("CompositorNodeBlur")
        blur.inputs["Size"].default_value = (int(0.22 * W), int(0.22 * W))
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
    if knee:
        sep = n.new("CompositorNodeSeparateColor")
        ln.new(cur, sep.inputs[0])
        x = sep.outputs[0]  # monochrome: R == G == B

        def m(op, a_, b_):
            nd = n.new("ShaderNodeMath")
            nd.operation = op
            for i, v in enumerate((a_, b_)):
                if isinstance(v, float):
                    nd.inputs[i].default_value = v
                else:
                    ln.new(v, nd.inputs[i])
            return nd.outputs[0]

        pexc = m("MAXIMUM", m("SUBTRACT", x, KNEE), 0.0)
        y = m("ADD", m("SUBTRACT", x, pexc), m("DIVIDE", pexc, m("ADD", m("DIVIDE", pexc, LIMIT - KNEE), 1.0)))
        comb = n.new("CompositorNodeCombineColor")
        for i in range(3):
            ln.new(y, comb.inputs[i])
        comb.inputs[3].default_value = 1.0
        cur = comb.outputs[0]
    out = n.new("NodeGroupOutput")
    ln.new(cur, out.inputs[0])
    return tree


def camera(scene, lens=50, fstop=0.0, focus=10.0, clip=(0.05, 5000), sensor=36.0):
    cd = bpy.data.cameras.new("Camera")
    cd.lens = lens
    cd.sensor_fit = "HORIZONTAL"
    cd.sensor_width = sensor
    cd.clip_start, cd.clip_end = clip
    if fstop > 0:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus
        cd.dof.aperture_blades = 7
        cd.dof.aperture_rotation = math.radians(12)
    cam = bpy.data.objects.new("Camera", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.rotation_mode = "XYZ"
    return cam


def look_at(obj, loc, target, roll=0.0):
    from mathutils import Matrix, Vector

    obj.location = loc
    d = Vector(target) - Vector(loc)
    q = d.to_track_quat("-Z", "Y")
    m = q.to_matrix().to_4x4()
    if roll:
        m = m @ Matrix.Rotation(roll, 4, "Z")
    obj.rotation_euler = m.to_euler("XYZ")


def key_camera(cam, frame, focus=None):
    cam.keyframe_insert("location", frame=frame)
    cam.keyframe_insert("rotation_euler", frame=frame)
    if focus is not None:
        cam.data.dof.focus_distance = focus
        cam.data.dof.keyframe_insert("focus_distance", frame=frame)


def fcurves(action):
    if hasattr(action, "layers") and action.layers:
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
        return out
    return list(action.fcurves)


def set_interp(idblock, interp="LINEAR"):
    ad = idblock.animation_data
    if ad and ad.action:
        for fc in fcurves(ad.action):
            for k in fc.keyframe_points:
                k.interpolation = interp


def hide_from_rays(obj, camera=True, diffuse=True, glossy=True, transmission=True, scatter=True, shadow=False):
    obj.visible_camera = not camera
    obj.visible_diffuse = not diffuse
    obj.visible_glossy = not glossy
    obj.visible_transmission = not transmission
    obj.visible_volume_scatter = not scatter
    obj.visible_shadow = not shadow


def link(scene, obj, coll=None):
    (coll or scene.collection).objects.link(obj)
    return obj


def mesh_object(scene, name, verts, faces, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    if mat:
        me.materials.append(mat)
    return ob


def bevel(obj, width, segments=3, angle=40):
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    return m


def box(scene, name, size, loc=(0, 0, 0), mat=None, bevel_w=0.0, rot=(0, 0, 0)):
    sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = mesh_object(scene, name, v, f, mat)
    ob.location = loc
    ob.rotation_euler = rot
    if bevel_w > 0:
        bevel(ob, bevel_w, 2)
        ob.data.shade_smooth()
        ob.data.set_sharp_from_angle(angle=math.radians(40))
    return ob


# --------------------------------------------------------------------------
# shader-node builder


class NB:
    """Small builder for shader node trees: methods return output sockets."""

    def __init__(self, nt):
        self.nt, self.n, self.ln = nt, nt.nodes, nt.links

    def new(self, kind, **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        return nd

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.ln.new(v, sock)
        elif v is not None:
            sock.default_value = v

    def noise(self, vec, scale, detail=4.0, rough=0.55, dims="3D", w=None, distort=0.0, lac=2.0, out="Fac", ntype=None):
        t = self.new("ShaderNodeTexNoise")
        t.noise_dimensions = dims
        if ntype:
            t.noise_type = ntype
        self.set(t.inputs["Vector"], vec)
        self.set(t.inputs["Scale"], scale)
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        t.inputs["Lacunarity"].default_value = lac
        t.inputs["Distortion"].default_value = distort
        if w is not None:
            self.set(t.inputs["W"], w)
        return t.outputs["Color" if out == "Color" else 0]

    def voronoi(self, vec, scale, feature="F1", out="Distance", rand=1.0, dims="3D", w=None, metric="EUCLIDEAN"):
        t = self.new("ShaderNodeTexVoronoi")
        t.voronoi_dimensions = dims
        t.feature = feature
        t.distance = metric
        self.set(t.inputs["Vector"], vec)
        self.set(t.inputs["Scale"], scale)
        t.inputs["Randomness"].default_value = rand
        if w is not None:
            self.set(t.inputs["W"], w)
        return t.outputs[out]

    def wave(self, vec, scale, kind="BANDS", direction="Z", distortion=0.0, detail=2.0, profile="SIN", phase=0.0):
        t = self.new("ShaderNodeTexWave")
        t.wave_type = kind
        if kind == "BANDS":
            t.bands_direction = direction
        else:
            t.rings_direction = direction
        t.wave_profile = profile
        self.set(t.inputs["Vector"], vec)
        self.set(t.inputs["Scale"], scale)
        t.inputs["Distortion"].default_value = distortion
        t.inputs["Detail"].default_value = detail
        self.set(t.inputs["Phase Offset"], phase)
        return t.outputs[1]  # Fac

    def white(self, vec, dims="3D"):
        t = self.new("ShaderNodeTexWhiteNoise")
        t.noise_dimensions = dims
        self.set(t.inputs["Vector"], vec)
        return t.outputs["Value"]

    def mr(self, v, a, b, c=0.0, d=1.0, clamp=True, interp="LINEAR"):
        m = self.new("ShaderNodeMapRange")
        m.interpolation_type = interp
        m.clamp = clamp
        self.set(m.inputs["Value"], v)
        self.set(m.inputs["From Min"], a)
        self.set(m.inputs["From Max"], b)
        self.set(m.inputs["To Min"], c)
        self.set(m.inputs["To Max"], d)
        return m.outputs["Result"]

    def m(self, op, a, b=None, c=None, clamp=False):
        nd = self.new("ShaderNodeMath")
        nd.operation = op
        nd.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(nd.inputs[i], v)
        return nd.outputs[0]

    def add(self, a, b):
        return self.m("ADD", a, b)

    def mul(self, a, b):
        return self.m("MULTIPLY", a, b)

    def v(self, op, a, b=None, c=None, scale=None, out=0):
        nd = self.new("ShaderNodeVectorMath")
        nd.operation = op
        for i, val in enumerate((a, b, c)):
            if val is not None:
                self.set(nd.inputs[i], val)
        if scale is not None:
            self.set(nd.inputs["Scale"], scale)
        return nd.outputs[out]

    def mixf(self, fac, a, b):
        nd = self.new("ShaderNodeMix")
        nd.data_type = "FLOAT"
        self.set(nd.inputs["Factor"], fac)
        self.set(nd.inputs[2], a)
        self.set(nd.inputs[3], b)
        return nd.outputs[0]

    def mixc(self, fac, a, b, blend="MIX"):
        nd = self.new("ShaderNodeMix")
        nd.data_type = "RGBA"
        nd.blend_type = blend
        self.set(nd.inputs["Factor"], fac)
        self.set(nd.inputs[6], a)
        self.set(nd.inputs[7], b)
        return nd.outputs[2]

    def grey(self, v):
        c = self.new("ShaderNodeCombineColor")
        for i in range(3):
            self.set(c.inputs[i], v)
        return c.outputs[0]

    def xyz(self, vec):
        s = self.new("ShaderNodeSeparateXYZ")
        self.set(s.inputs[0], vec)
        return s.outputs

    def combine(self, x, y, z):
        c = self.new("ShaderNodeCombineXYZ")
        self.set(c.inputs[0], x)
        self.set(c.inputs[1], y)
        self.set(c.inputs[2], z)
        return c.outputs[0]

    def mapping(self, vec, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        mp = self.new("ShaderNodeMapping")
        self.set(mp.inputs["Vector"], vec)
        self.set(mp.inputs["Location"], loc)
        self.set(mp.inputs["Rotation"], rot)
        self.set(mp.inputs["Scale"], scale)
        return mp

    def bump(self, height, strength=0.3, distance=0.002, normal=None):
        b = self.new("ShaderNodeBump")
        self.set(b.inputs["Height"], height)
        b.inputs["Strength"].default_value = strength
        b.inputs["Distance"].default_value = distance
        if normal is not None:
            self.set(b.inputs["Normal"], normal)
        return b.outputs[0]

    def principled(self, base=None, rough=None, normal=None, spec=0.5, coat=0.0, metal=0.0, **kw):
        b = self.new("ShaderNodeBsdfPrincipled")
        self.set(b.inputs["Base Color"], base)
        self.set(b.inputs["Roughness"], rough)
        self.set(b.inputs["Normal"], normal)
        b.inputs["Specular IOR Level"].default_value = spec
        b.inputs["Metallic"].default_value = metal
        if coat:
            b.inputs["Coat Weight"].default_value = coat
        for k, v in kw.items():
            self.set(b.inputs[k], v)
        return b

    def coord(self, kind="Object"):
        return self.new("ShaderNodeTexCoord").outputs[kind]

    def time_value(self, scene_frames=None):
        """A Value node driven by #frame (seconds), for animated textures."""
        val = self.new("ShaderNodeValue")
        d = val.outputs[0].driver_add("default_value").driver
        d.expression = "frame/30.0"
        return val.outputs[0]


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return mat, NB(nt), out


def simple_material(name, color=0.5, rough=0.5, spec=0.5, metal=0.0):
    mat, b, out = material(name)
    p = b.principled(base=gray(color), rough=rough, spec=spec, metal=metal)
    b.ln.new(p.outputs[0], out.inputs["Surface"])
    return mat


def emission_material(name, strength=5.0, color=1.0):
    mat, b, out = material(name)
    e = b.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = gray(color)
    e.inputs["Strength"].default_value = strength
    b.ln.new(e.outputs[0], out.inputs["Surface"])
    return mat


def volume_material(name, density=0.01, anisotropy=0.6, color=1.0):
    mat, b, out = material(name)
    v = b.new("ShaderNodeVolumePrincipled")
    v.inputs["Color"].default_value = gray(color)
    v.inputs["Density"].default_value = density
    v.inputs["Anisotropy"].default_value = anisotropy
    b.ln.new(v.outputs[0], out.inputs["Volume"])
    return mat, b, v, out


# --------------------------------------------------------------------------
# the mark (exact geometry from brand/scripts/mark.py)


def _arc(p0, r, p1, sweep, step=6.0):
    (x1, y1), (x2, y2) = p0, p1
    xp, yp = (x1 - x2) / 2, (y1 - y2) / 2
    sign = 1 if sweep else -1
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
    """Three simple polygons in master units (y down): the f with the shared
    stroke spliced into its stem, and the two halves of the thin diagonal.
    Same silhouette as mark.path_d() under nonzero fill."""
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


def build_mark(scene, height, depth, bevel_w, material, step=4.0, name="Mark"):
    """The extruded mark standing on z=0, optical centre on x=0, front face
    at y=-depth/2 facing -y. Object coordinates equal world metres (handy for
    world-scale procedural textures). Returns the list of objects."""
    from mathutils import Matrix

    s = height / M.BBOX_H
    objs = []
    for key, poly in mark_polygons(step).items():
        cu = bpy.data.curves.new(name + key, "CURVE")
        cu.dimensions = "2D"
        cu.fill_mode = "BOTH"
        cu.extrude = depth / 2 - bevel_w
        cu.bevel_depth = bevel_w
        cu.bevel_resolution = 4
        cu.offset = -bevel_w
        sp = cu.splines.new("POLY")
        pts = [((x - M.CENTER[0]) * s, (M.BASE - y) * s) for x, y in poly]
        sp.points.add(len(pts) - 1)
        for p, (x, y) in zip(sp.points, pts):
            p.co = (x, y, 0.0, 1.0)
        sp.use_cyclic_u = True
        tmp = bpy.data.objects.new(name + key + "_c", cu)
        scene.collection.objects.link(tmp)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        bpy.data.objects.remove(tmp)
        bpy.data.curves.remove(cu)
        me.transform(Matrix.Rotation(math.radians(90), 4, "X"))
        me.name = name + "_" + key
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(35))
        ob = bpy.data.objects.new(name + "_" + key, me)
        scene.collection.objects.link(ob)
        me.materials.append(material)
        objs.append(ob)
    return objs


def mark_point(x, y, height):
    """Master units -> world (x, z) on the mark's front plane."""
    s = height / M.BBOX_H
    return ((x - M.CENTER[0]) * s, (M.BASE - y) * s)


# --------------------------------------------------------------------------
# output


def _write_png(scene, path):
    im = scene.render.image_settings
    im.file_format, im.color_mode, im.color_depth = "PNG", "RGB", "8"
    bpy.data.images["Render Result"].save_render(path, scene=scene)
    exr_settings(im)


def finish(scene, shot, args, frames):
    if args.samples:
        scene.cycles.samples = args.samples
    os.makedirs(BUILD, exist_ok=True)
    r = scene.render
    if args.stills or args.lookdev:
        if args.lookdev:
            r.resolution_x, r.resolution_y = 1920, 1080
            outdir = LOOKDEV
            picks = [1, (frames + 1) // 2, frames]
        else:
            if args.res:
                r.resolution_x, r.resolution_y = args.res, round(args.res * 9 / 16)
            outdir = args.out or os.path.join(LOOKDEV, "_iter", shot)
            picks = [int(x) for x in args.stills.split(",")]
        os.makedirs(outdir, exist_ok=True)
        for f in picks:
            t = time.time()
            scene.frame_set(f)
            tag = f"-{args.tag}" if args.tag else ""
            if args.lookdev:
                bpy.ops.render.render(write_still=False)
                _write_png(scene, os.path.join(outdir, f"{shot}-{f:04d}.png"))
            else:
                r.filepath = os.path.join(outdir, f"{shot}{tag}-{f:04d}.exr")
                bpy.ops.render.render(write_still=True)
                _write_png(scene, os.path.join(outdir, f"{shot}{tag}-{f:04d}.png"))
            print(f"[{shot}] still {f} {r.resolution_x}x{r.resolution_y} in {time.time() - t:.1f}s", flush=True)
        return
    if not args.no_save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, f"{shot}.blend"), compress=True)
    if args.range:
        a, b = (int(x) for x in args.range.split("-"))
        scene.frame_start, scene.frame_end = a, b
    outdir = os.path.join(BUILD, shot)
    os.makedirs(outdir, exist_ok=True)
    r.filepath = os.path.join(outdir, "####")
    r.use_file_extension = True
    t0 = time.time()
    last = [t0]

    def post(sc, *_):
        now = time.time()
        print(f"[{shot}] frame {sc.frame_current} done in {now - last[0]:.1f}s", flush=True)
        last[0] = now

    bpy.app.handlers.render_post.append(post)
    bpy.ops.render.render(animation=True)
    print(f"[{shot}] total render time {time.time() - t0:.1f}s", flush=True)
