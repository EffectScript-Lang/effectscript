"""Shared module for the physical-cable shots of the EffectScript launch film
(`tangle2`, `wirehall`, `thread`).

Each shot script builds its scene from nothing and calls `finish()`:

    blender -b -P film/blender3d/<shot>.py -- [--stills 1,210,420] [--scale 25]
                                             [--range 1-420] [--samples 32]
                                             [--lookdev] [--no-save]

* full render (no --stills): 3840x2160 half-float OpenEXR (DWAA, RGB),
  scene-linear, to film/build/blender/<shot>/0001.exr ..., plus
  film/build/blender/<shot>.blend.
* --stills: EXR + AgX PNG previews in film/build/blender/_lookdev/<shot>/.
* --lookdev: the review stills, 1920x1080 AgX PNG, written as
  film/build/blender/_lookdev/<shot>-NNNN.png.

Exposure contract (linear): lit cable sheen ~0.6-1.2, pulses / fibre tips /
shaft hot spots 3-6, deep blacks 0.001-0.02, blacks never lifted.

Helpers here are adapted from film/blender/common.py (another agent's module,
kept independent so either can change without breaking the other).
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

W, H, FPS = 3840, 2160, 30


# --------------------------------------------------------------------------
# arguments and maths


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--stills", default="")
    p.add_argument("--range", default="")
    p.add_argument("--scale", type=int, default=100)
    p.add_argument("--samples", type=int, default=0)
    p.add_argument("--lookdev", action="store_true")
    p.add_argument("--no-save", action="store_true")
    p.add_argument("--tag", default="")
    p.add_argument("--out", default="", help="override the sequence folder (previews)")
    p.add_argument("--step", type=int, default=1)
    p.add_argument("--png", action="store_true", help="AgX PNG frames instead of EXR (previews)")
    return p.parse_args(argv)


def clamp01(x):
    return max(0.0, min(1.0, x))


def smoothstep(a, b, x):
    t = clamp01((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def gray(v):
    return (v, v, v, 1.0)


class SmoothNoise:
    """Deterministic 1D noise (sum of random sines) for handheld drift."""

    def __init__(self, seed, octaves=4):
        rng = np.random.default_rng(seed)
        self.f = rng.uniform(0.6, 1.4, octaves) * (2.0 ** np.arange(octaves))
        self.a = 1.0 / (2.0 ** np.arange(octaves))
        self.p = rng.uniform(0, 2 * math.pi, octaves)

    def __call__(self, t):
        return float(np.sum(self.a * np.sin(self.f * t + self.p)) / np.sum(self.a))


# --------------------------------------------------------------------------
# scene


def exr_settings(im):
    im.file_format = "OPEN_EXR"
    im.color_mode = "RGB"
    im.color_depth = "16"
    im.exr_codec = "DWAA"


def new_scene(frames, engine="BLENDER_EEVEE", samples=32):
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
    r.hair_type = "STRIP"  # curves honour their radius, shaded as cylinders
    r.hair_subdiv = 1
    vs = scene.view_settings
    vs.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            vs.look = look
            break
        except TypeError:
            pass

    e = scene.eevee
    e.taa_render_samples = samples
    e.use_raytracing = True
    e.ray_tracing_method = "SCREEN"
    e.ray_tracing_options.resolution_scale = "2"
    e.ray_tracing_options.trace_max_roughness = 0.5
    e.use_shadows = True
    e.shadow_ray_count = 1
    e.shadow_step_count = 6
    e.volumetric_tile_size = "8"
    e.volumetric_samples = 64
    e.volumetric_sample_distribution = 0.85
    e.use_volumetric_shadows = True
    e.volumetric_shadow_samples = 16
    e.volumetric_start = 0.05
    e.volumetric_end = 80.0
    e.bokeh_max_size = 200
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
        c.adaptive_threshold = 0.03
        c.use_denoising = True
        c.denoiser = "OPENIMAGEDENOISE"
        c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        c.denoising_prefilter = "ACCURATE"
        c.denoising_use_gpu = True
        c.max_bounces = 6
        c.diffuse_bounces = 2
        c.glossy_bounces = 3
        c.transmission_bounces = 4
        c.volume_bounces = 0
        c.transparent_max_bounces = 8
        c.sample_clamp_indirect = 4.0
        c.volume_step_rate = 4.0
        c.seed = 7
        c.use_animated_seed = True
    return scene


def world(scene, color=0.0, density=0.0, anisotropy=0.4):
    w = bpy.data.worlds.new("World")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = gray(color)
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    vol = None
    if density > 0:
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = gray(1.0)
        vol.inputs["Density"].default_value = density
        vol.inputs["Anisotropy"].default_value = anisotropy
        nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return vol


def compositor(scene, bloom=0.5, bloom_size=0.6, threshold=1.0, fog=0.0, fog_size=0.9, fog_threshold=2.0,
               vignette=0.3, gain=1.0):
    """Bloom (+ optional fog glow), forced monochrome, vignette, gain.
    Output stays scene-linear."""
    scene.render.use_compositing = os.environ.get("NO_COMP", "") == ""
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
        g.inputs["Smoothness"].default_value = 0.6
        g.inputs["Strength"].default_value = strength
        g.inputs["Size"].default_value = size
        ln.new(src, g.inputs["Image"])
        return g.outputs["Image"]

    if bloom > 0:
        cur = glare(cur, "Bloom", bloom, bloom_size, threshold)
    if fog > 0:
        cur = glare(cur, "Fog Glow", fog, fog_size, fog_threshold)

    hs = n.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = 0.0
    ln.new(cur, hs.inputs["Image"])
    cur = hs.outputs["Image"]

    if vignette > 0:
        ell = n.new("CompositorNodeEllipseMask")
        ell.inputs["Size"].default_value = (1.25, 1.35)
        blur = n.new("CompositorNodeBlur")
        blur.inputs["Size"].default_value = (840, 840)
        ln.new(ell.outputs["Mask"], blur.inputs["Image"])
        mr = n.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = 1.0 - vignette
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


# --------------------------------------------------------------------------
# camera and animation


def camera(scene, lens=35, fstop=0.0, focus=10.0, clip=(0.01, 300), sensor=36.0):
    cd = bpy.data.cameras.new("Camera")
    cd.lens = lens
    cd.sensor_width = sensor
    cd.sensor_fit = "HORIZONTAL"
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


def look_at(obj, loc, target, roll=0.0):
    from mathutils import Matrix, Vector

    obj.location = loc
    d = Vector(target) - Vector(loc)
    q = d.to_track_quat("-Z", "Y")
    m = q.to_matrix().to_4x4()
    if roll:
        m = m @ Matrix.Rotation(roll, 4, "Z")
    obj.rotation_euler = m.to_euler("XYZ")


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


def key_camera(cam, frame, focus=None):
    cam.keyframe_insert("location", frame=frame)
    cam.keyframe_insert("rotation_euler", frame=frame)
    if focus is not None:
        cam.data.dof.focus_distance = focus
        cam.data.dof.keyframe_insert("focus_distance", frame=frame)


def euler_unwrap(cam):
    """Make keyed Euler rotations continuous (no 2*pi flips)."""
    ad = cam.animation_data
    if not ad or not ad.action:
        return
    for fc in fcurves(ad.action):
        if fc.data_path != "rotation_euler":
            continue
        prev = None
        for k in fc.keyframe_points:
            v = k.co[1]
            if prev is not None:
                while v - prev > math.pi:
                    v -= 2 * math.pi
                while v - prev < -math.pi:
                    v += 2 * math.pi
            k.co[1] = v
            k.handle_left[1] = v
            k.handle_right[1] = v
            prev = v


# --------------------------------------------------------------------------
# lights


def _light_obj(scene, name, ld, loc, target):
    obj = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(obj)
    look_at(obj, loc, target)
    return obj


def spot(scene, name, loc, target, energy, angle_deg, blend=0.6, radius=0.1, volume=1.0, diffuse=1.0, specular=1.0):
    ld = bpy.data.lights.new(name, "SPOT")
    ld.energy = energy
    ld.spot_size = math.radians(angle_deg)
    ld.spot_blend = blend
    ld.shadow_soft_size = radius
    ld.volume_factor = volume
    ld.diffuse_factor = diffuse
    ld.specular_factor = specular
    return _light_obj(scene, name, ld, loc, target)


def area(scene, name, loc, target, energy, size=1.0, size_y=None, volume=1.0, spread=180.0, diffuse=1.0,
         specular=1.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.shape = "RECTANGLE" if size_y else "SQUARE"
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.volume_factor = volume
    ld.spread = math.radians(spread)
    ld.diffuse_factor = diffuse
    ld.specular_factor = specular
    return _light_obj(scene, name, ld, loc, target)


# --------------------------------------------------------------------------
# shader-node builder


class Shader:
    """Small builder for material node trees: `s.math(op, a, b)` returns a
    socket, constants are accepted wherever a socket is."""

    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = self.mat.node_tree
        self.nt.nodes.clear()
        self.n, self.ln = self.nt.nodes, self.nt.links
        self.out = self.n.new("ShaderNodeOutputMaterial")

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.ln.new(v, sock)
        else:
            sock.default_value = v

    def node(self, kind, inputs=None, **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        for k, v in (inputs or {}).items():
            self.set(nd.inputs[k], v)
        return nd

    def math(self, op, a, b=None, c=None, clamp=False):
        nd = self.n.new("ShaderNodeMath")
        nd.operation = op
        nd.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(nd.inputs[i], v)
        return nd.outputs[0]

    def vmath(self, op, a, b=None, c=None, scale=None, out=0):
        nd = self.n.new("ShaderNodeVectorMath")
        nd.operation = op
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(nd.inputs[i], v)
        if scale is not None:
            self.set(nd.inputs["Scale"], scale)
        return nd.outputs[out]

    def attr(self, name, out="Fac"):
        nd = self.n.new("ShaderNodeAttribute")
        nd.attribute_name = name
        nd.attribute_type = "GEOMETRY"
        return nd.outputs[out]

    def vattr(self, name):
        return self.attr(name, "Vector")

    def sep(self, v):
        nd = self.node("ShaderNodeSeparateXYZ", {"Vector": v})
        return nd.outputs[0], nd.outputs[1], nd.outputs[2]

    def comb(self, x, y, z):
        return self.node("ShaderNodeCombineXYZ", {"X": x, "Y": y, "Z": z}).outputs[0]

    def mrange(self, v, a, b, c, d, interp="LINEAR", clamp=True):
        return self.node("ShaderNodeMapRange", {"Value": v, "From Min": a, "From Max": b, "To Min": c, "To Max": d},
                         interpolation_type=interp, clamp=clamp).outputs["Result"]

    def noise(self, vec, scale, detail=2.0, rough=0.5, dims="3D", w=None, out="Fac"):
        nd = self.node("ShaderNodeTexNoise", {"Vector": vec, "Scale": scale, "Detail": detail, "Roughness": rough},
                       noise_dimensions=dims)
        if w is not None:
            self.set(nd.inputs["W"], w)
        return nd.outputs["Factor" if out == "Fac" else out]

    def gray(self, v):
        nd = self.n.new("ShaderNodeCombineColor")
        for i in range(3):
            self.set(nd.inputs[i], v)
        return nd.outputs[0]

    def bump(self, height, strength=1.0, distance=0.001, normal=None):
        nd = self.node("ShaderNodeBump", {"Height": height, "Strength": strength, "Distance": distance})
        if normal is not None:
            self.set(nd.inputs["Normal"], normal)
        return nd.outputs[0]

    def principled(self, **kw):
        names = {
            "base": "Base Color", "metal": "Metallic", "rough": "Roughness", "ior": "IOR",
            "spec": "Specular IOR Level", "aniso": "Anisotropic", "aniso_rot": "Anisotropic Rotation",
            "tangent": "Tangent", "normal": "Normal", "coat": "Coat Weight", "coat_rough": "Coat Roughness",
            "coat_normal": "Coat Normal", "sheen": "Sheen Weight", "sheen_rough": "Sheen Roughness",
            "sheen_tint": "Sheen Tint", "sss": "Subsurface Weight", "sss_radius": "Subsurface Radius",
            "sss_scale": "Subsurface Scale", "emit": "Emission Strength", "emit_color": "Emission Color",
            "trans": "Transmission Weight", "alpha": "Alpha",
        }
        b = self.n.new("ShaderNodeBsdfPrincipled")
        for k, v in kw.items():
            sock = b.inputs[names[k]]
            if k in ("base", "emit_color", "sheen_tint") and not isinstance(v, bpy.types.NodeSocket):
                v = gray(v) if isinstance(v, (int, float)) else v
            self.set(sock, v)
        return b

    def output(self, surface):
        self.set(self.out.inputs["Surface"], surface)
        return self.mat


# --------------------------------------------------------------------------
# geometry-node builder


class Graph:
    def __init__(self, name, inputs=()):
        self.ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
        self.ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
        for nm, kind in inputs:
            self.ng.interface.new_socket(nm, in_out="INPUT", socket_type=kind)
        self.ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
        self.n, self.ln = self.ng.nodes, self.ng.links
        self.gi = self.n.new("NodeGroupInput")
        self.inp = self.gi.outputs[0]
        self.out = self.n.new("NodeGroupOutput").inputs[0]

    def input(self, name):
        return self.gi.outputs[name]

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

    def vmath(self, op, a, b=None, c=None, scale=None, out=0):
        nd = self.n.new("ShaderNodeVectorMath")
        nd.operation = op
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(nd.inputs[i], v)
        if scale is not None:
            self.set(nd.inputs["Scale"], scale)
        return nd.outputs[out]

    def attr(self, name, data_type="FLOAT"):
        nd = self.n.new("GeometryNodeInputNamedAttribute")
        nd.data_type = data_type
        nd.inputs["Name"].default_value = name
        return nd.outputs["Attribute"]

    def store(self, geo, name, value, data_type="FLOAT", domain="POINT"):
        return self.node("GeometryNodeStoreNamedAttribute", {"Geometry": geo, "Name": name, "Value": value},
                         data_type=data_type, domain=domain).outputs[0]

    def mrange(self, v, a, b, c, d, interp="LINEAR", clamp=True):
        return self.node("ShaderNodeMapRange", {"Value": v, "From Min": a, "From Max": b, "To Min": c, "To Max": d},
                         interpolation_type=interp, clamp=clamp).outputs["Result"]

    def mix(self, fac, a, b):
        nd = self.n.new("ShaderNodeMix")
        nd.data_type = "FLOAT"
        self.set(nd.inputs["Factor"], fac)
        self.set(nd.inputs[2], a)
        self.set(nd.inputs[3], b)
        return nd.outputs[0]

    def frame(self):
        return self.n.new("GeometryNodeInputSceneTime").outputs["Frame"]

    def position(self):
        return self.n.new("GeometryNodeInputPosition").outputs[0]


def tube(g, curve, radius, material, resolution=8, store_profile=True):
    """Curve -> smooth tube mesh. Stores, for the shader:
    `pc`  profile-circle position (cos, sin, 0) -> angle around the cable,
    `tg`  curve tangent (for anisotropy),
    curve point attributes (e.g. `ul`, length along the cable) carry over."""
    circ = g.node("GeometryNodeCurvePrimitiveCircle", {"Resolution": resolution, "Radius": 1.0}).outputs["Curve"]
    if store_profile:
        circ = g.store(circ, "pc", g.position(), "FLOAT_VECTOR")
    tan = g.node("GeometryNodeInputTangent").outputs[0]
    curve = g.store(curve, "tg", tan, "FLOAT_VECTOR")
    c2m = g.node("GeometryNodeCurveToMesh", {"Curve": curve, "Profile Curve": circ, "Scale": radius})
    sm = g.node("GeometryNodeSetShadeSmooth", {"Mesh": c2m.outputs[0]})
    mat = g.node("GeometryNodeSetMaterial", {"Geometry": sm.outputs[0], "Material": material})
    return mat.outputs[0]


def curves_object(scene, name, points, counts, curve_attrs=None, point_attrs=None):
    """Curves object from flat (N, 3) points split into curves by `counts`.
    `curve_attrs` / `point_attrs`: {name: array}, (n,) or (n, 3)."""
    cv = bpy.data.hair_curves.new(name)
    cv.add_curves([int(c) for c in counts])
    cv.position_data.foreach_set("vector", np.asarray(points, np.float32).ravel())
    cv.set_types(type="POLY")
    for domain, attrs in (("CURVE", curve_attrs or {}), ("POINT", point_attrs or {})):
        for k, v in attrs.items():
            v = np.asarray(v, dtype=np.float32)
            kind = "FLOAT_VECTOR" if v.ndim == 2 else "FLOAT"
            a = cv.attributes.new(k, kind, domain)
            a.data.foreach_set("vector" if kind == "FLOAT_VECTOR" else "value", v.ravel())
    obj = bpy.data.objects.new(name, cv)
    scene.collection.objects.link(obj)
    return obj


def mesh_object(scene, name, verts, faces, material=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    if smooth:
        me.shade_smooth()
    if material is not None:
        me.materials.append(material)
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    return obj


def frame_value(node_socket, frames):
    """Keyframe a Value socket so it equals the scene frame (linear, with
    linear extrapolation) -- scene time for shader trees without drivers."""
    node_socket.default_value = 1.0
    node_socket.keyframe_insert("default_value", frame=1)
    node_socket.default_value = float(frames)
    node_socket.keyframe_insert("default_value", frame=frames)


def linearize_all():
    for coll in (bpy.data.materials, bpy.data.node_groups, bpy.data.worlds, bpy.data.cameras, bpy.data.objects):
        for idb in coll:
            target = idb.node_tree if hasattr(idb, "node_tree") and idb.node_tree else idb
            for blk in (idb, target):
                ad = getattr(blk, "animation_data", None)
                if ad and ad.action:
                    for fc in fcurves(ad.action):
                        if fc.data_path.endswith("default_value"):
                            fc.extrapolation = "LINEAR"
                            for k in fc.keyframe_points:
                                k.interpolation = "LINEAR"


# --------------------------------------------------------------------------
# output


def exr_stats(path):
    import OpenImageIO as oiio

    buf = oiio.ImageBuf(path)
    a = buf.get_pixels(oiio.FLOAT)[..., :3]
    lum = a.mean(axis=2)
    q = np.percentile(lum, [1, 5, 50, 95, 99, 99.9])
    return "min %.4f p1 %.4f p5 %.4f p50 %.4f p95 %.3f p99 %.3f p99.9 %.3f max %.2f" % (
        lum.min(), *q, lum.max())


def finish(scene, shot, args):
    if args.samples:
        scene.eevee.taa_render_samples = args.samples
        if scene.render.engine == "CYCLES":
            scene.cycles.samples = args.samples
    linearize_all()
    os.makedirs(BUILD, exist_ok=True)
    t0 = time.time()
    if args.lookdev or args.stills:
        frames = [int(x) for x in args.stills.split(",")] if args.stills else [scene.frame_start]
        scene.render.resolution_percentage = 50 if args.lookdev else args.scale
        outdir = LOOKDEV if args.lookdev else os.path.join(LOOKDEV, shot + (("-" + args.tag) if args.tag else ""))
        os.makedirs(outdir, exist_ok=True)
        for f in frames:
            t = time.time()
            scene.frame_set(f)
            stem = os.path.join(outdir, f"{shot}-{f:04d}" if args.lookdev else f"{f:04d}")
            scene.render.filepath = stem + ".exr"
            bpy.ops.render.render(write_still=True)
            im = scene.render.image_settings
            im.file_format, im.color_depth, im.color_mode = "PNG", "8", "RGB"
            bpy.data.images["Render Result"].save_render(stem + ".png", scene=scene)
            exr_settings(im)
            dt = time.time() - t
            print(f"[{shot}] still {f} in {dt:.1f}s  {exr_stats(stem + '.exr')}", flush=True)
            if args.lookdev:
                os.remove(stem + ".exr")
    else:
        scene.render.resolution_percentage = args.scale
        if not args.no_save:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, f"{shot}.blend"), compress=True)
        if args.range:
            a, b = (int(x) for x in args.range.split("-"))
            scene.frame_start, scene.frame_end = a, b
        outdir = args.out or os.path.join(BUILD, shot)
        os.makedirs(outdir, exist_ok=True)
        scene.frame_step = args.step
        if args.png:
            im = scene.render.image_settings
            im.file_format, im.color_depth, im.color_mode = "PNG", "8", "RGB"
        scene.render.filepath = os.path.join(outdir, "####")
        scene.render.use_file_extension = True
        bpy.ops.render.render(animation=True)
    print(f"[{shot}] render time {time.time() - t0:.1f}s", flush=True)
