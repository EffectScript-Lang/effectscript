"""Drawing toolkit for the launch film: brand constants, easing, HarfBuzz-shaped
type as Skia paths, the exact mark and lockup, photographic plates, code
panels, and the token morph that turns TypeScript+Effect into EffectScript."""

import difflib
import math
import os
import re
import sys
from functools import cache
from pathlib import Path

import numpy as np
import skia
import uharfbuzz as hb
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

FILM = Path(__file__).resolve().parent.parent
BRAND = FILM.parent
REPO = BRAND.parents[2]
sys.path.insert(0, str(BRAND / "scripts"))
import brand as B  # noqa: E402
import mark as M  # noqa: E402

W, H, FPS = 1920, 1080, 30  # layout units; frames render at SCALE x this
# PREVIEW=1 renders a fast 1080p SDR cut; the master is 4K HDR
PREVIEW = os.environ.get("PREVIEW") == "1"
SCALE = 1 if PREVIEW else 2
OW, OH = W * SCALE, H * SCALE
DURATION = 160.0

INK = 0xFF09090B
TILE = 0xFF18181A
LINE = 0xFF27272A
MUTED = 0xFF71717A
SUBTLE = 0xFFA1A1AA
Z300 = 0xFFD4D4D8
Z600 = 0xFF52525B
WHITE = 0xFFFFFFFF

FONTS = BRAND / "fonts"
DISPLAY = "InterDisplay-Bold.otf"
DISPLAY_SEMI = "InterDisplay-SemiBold.otf"
BODY = "Inter-Regular.otf"
BODY_MED = "Inter-Medium.otf"
MONO = "JetBrainsMono-Regular.ttf"
MONO_MED = "JetBrainsMono-Medium.ttf"


# ---------------------------------------------------------------- easing


def clamp(v, a=0.0, b=1.0):
    return a if v < a else b if v > b else v


def phase(t, a, b):
    return clamp((t - a) / (b - a))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out(x, p=3):
    return 1 - (1 - clamp(x)) ** p


def ease_in(x, p=3):
    return clamp(x) ** p


def ease_in_out(x):
    x = clamp(x)
    return 4 * x**3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_out_expo(x):
    x = clamp(x)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def lerp(a, b, x):
    return a + (b - a) * x


def window(t, a, b, fade_in=0.4, fade_out=0.4):
    """1 inside [a, b], easing in and out over the fade lengths."""
    if t < a or t > b:
        return 0.0
    i = 1.0 if fade_in <= 0 else smooth((t - a) / fade_in)
    o = 1.0 if fade_out <= 0 else smooth((b - t) / fade_out)
    return min(i, o)


def hash01(*xs):
    h = 0
    for x in xs:
        h = (h * 1000003) ^ int(x * 7919 + 17)
        h &= 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5BD1E995) & 0xFFFFFFFF
    h ^= h >> 15
    return (h & 0xFFFFFF) / 0xFFFFFF


def argb(c, alpha=1.0):
    a = int(((c >> 24) & 0xFF) * clamp(alpha))
    return (a << 24) | (c & 0xFFFFFF)


def mix(c1, c2, x):
    x = clamp(x)
    out = 0xFF000000
    for sh in (16, 8, 0):
        v = int(lerp((c1 >> sh) & 0xFF, (c2 >> sh) & 0xFF, x))
        out |= v << sh
    return out


def paint(color=WHITE, alpha=1.0, blur=0.0, stroke=None, blend=None):
    p = skia.Paint(AntiAlias=True, Color=argb(color, alpha))
    if blur > 0.05:
        p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style)
        p.setStrokeWidth(stroke)
    if blend is not None:
        p.setBlendMode(blend)
    return p


# ---------------------------------------------------------------- type


class _SkiaPen(BasePen):
    def __init__(self, glyphs, path, s, ox, oy):
        super().__init__(glyphs)
        self.path, self.s, self.ox, self.oy = path, s, ox, oy

    def _p(self, p):
        return self.ox + p[0] * self.s, self.oy - p[1] * self.s

    def _moveTo(self, p):
        self.path.moveTo(*self._p(p))

    def _lineTo(self, p):
        self.path.lineTo(*self._p(p))

    def _curveToOne(self, a, b, c):
        self.path.cubicTo(*self._p(a), *self._p(b), *self._p(c))

    def _qCurveToOne(self, a, b):
        self.path.quadTo(*self._p(a), *self._p(b))

    def _closePath(self):
        self.path.close()


@cache
def _font(name):
    path = FONTS / name
    face = hb.Face(hb.Blob.from_file_path(str(path)))
    tt = TTFont(str(path))
    return tt, hb.Font(face), face.upem, tt.getGlyphSet(), tt.getGlyphOrder()


def cap_height(name, size):
    tt, _, upem, _, _ = _font(name)
    return tt["OS/2"].sCapHeight * size / upem


class Shaped:
    """A line of text as one Skia path per glyph, baseline at y=0, x from 0."""

    def __init__(self, glyphs, width, size):
        self.glyphs = glyphs  # [(path, x, char_index)]
        self.width = width
        self.size = size


@cache
def shape(text, name=DISPLAY, size=96.0, tracking=None):
    if tracking is None:
        tracking = -0.025 if name.startswith("InterDisplay") else 0.0
    tt, font, upem, glyphset, order = _font(name)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    code = name.startswith("JetBrainsMono")
    hb.shape(font, buf, {"kern": True, "liga": not code, "calt": not code})
    s = size / upem
    cursor = 0.0
    glyphs = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        path = skia.Path()
        gx = (cursor + pos.x_offset) * s
        glyphset[order[info.codepoint]].draw(_SkiaPen(glyphset, path, s, gx, -pos.y_offset * s))
        if not path.isEmpty():
            glyphs.append((path, gx, info.cluster))
        cursor += pos.x_advance + tracking * upem
    return Shaped(glyphs, (cursor - tracking * upem) * s, size)


def text(
    c,
    s,
    x,
    y,
    size=96,
    name=DISPLAY,
    color=WHITE,
    alpha=1.0,
    align="left",
    gradient=False,
    reveal=None,
    tracking=None,
    blur=0.0,
    glow=0.0,
):
    """Draw a line of shaped text with its baseline at y.

    `reveal` (0..1) animates glyphs in one by one: each rises a little, sharpens
    from a blur and fades up. `gradient` applies the effect.website headline
    fade from white to muted over the last 40% of the line."""
    if not s or alpha <= 0.002:
        return 0.0
    sh = shape(s, name, float(size), tracking)
    x0 = x - (sh.width if align == "right" else sh.width / 2 if align == "center" else 0)
    shader = None
    if gradient:
        end = argb(MUTED if gradient is True else gradient)
        shader = skia.GradientShader.MakeLinear(
            [skia.Point(x0, 0), skia.Point(x0 + sh.width, 0)], [argb(color), argb(color), end], [0.0, 0.58, 1.0]
        )
    n = max(1, len(sh.glyphs))
    for i, (path, gx, _) in enumerate(sh.glyphs):
        a, dy, gb = alpha, 0.0, blur
        if reveal is not None:
            span = 0.45
            local = clamp((reveal - (1 - span) * i / max(1, n - 1)) / span)
            e = ease_out(local)
            a *= e
            dy = (1 - e) * size * 0.28
            gb += (1 - e) * size * 0.08
        if a <= 0.002:
            continue
        c.save()
        c.translate(x0, y + dy)
        if glow > 0:
            p = paint(color, a * glow * 0.6, blur=size * 0.22)
            c.drawPath(path, p)
        p = paint(color, a, blur=gb)
        if shader is not None:
            p.setShader(shader.makeWithLocalMatrix(skia.Matrix.Translate(-x0, 0)))
            p.setAlphaf(clamp(a))
        c.drawPath(path, p)
        c.restore()
    return sh.width


def text_width(s, size=96, name=DISPLAY, tracking=None):
    return shape(s, name, float(size), tracking).width if s else 0.0


# ---------------------------------------------------------------- mark and lockup


def svg_path(d):
    """Parse the absolute M/L/H/V/C/Q/A/Z subset that mark.py and fontTools emit."""
    path = skia.Path()
    toks = re.findall(r"[MLAZCQHV]|-?[\d.]+(?:e-?\d+)?", d)
    i, cmd, cx, cy = 0, None, 0.0, 0.0

    def nums(k):
        return [float(v) for v in toks[i : i + k]]

    while i < len(toks):
        if toks[i] in "MLAZCQHV":
            cmd = toks[i]
            i += 1
            if cmd == "Z":
                path.close()
                continue
        if cmd == "M":
            cx, cy = nums(2)
            path.moveTo(cx, cy)
            i += 2
            cmd = "L"
        elif cmd == "L":
            cx, cy = nums(2)
            path.lineTo(cx, cy)
            i += 2
        elif cmd == "H":
            cx = float(toks[i])
            path.lineTo(cx, cy)
            i += 1
        elif cmd == "V":
            cy = float(toks[i])
            path.lineTo(cx, cy)
            i += 1
        elif cmd == "C":
            v = nums(6)
            path.cubicTo(*v)
            cx, cy = v[4], v[5]
            i += 6
        elif cmd == "Q":
            v = nums(4)
            path.quadTo(*v)
            cx, cy = v[2], v[3]
            i += 4
        elif cmd == "A":
            rx, ry, rot, large, sweep, cx, cy = nums(7)
            path.arcTo(
                rx,
                ry,
                rot,
                skia.Path.kLarge_ArcSize if large else skia.Path.kSmall_ArcSize,
                skia.PathDirection.kCW if sweep else skia.PathDirection.kCCW,
                cx,
                cy,
            )
            i += 7
        else:
            raise ValueError(f"unsupported path command {cmd!r}")
    return path


@cache
def mark_paths(height):
    """The mark at `height` px, top-left at the origin: whole + parts."""
    s = height / M.BBOX_H
    parts = M.parts_d(s, 0, 0)
    return {
        "all": svg_path(M.path_d(s, 0, 0)),
        "f": svg_path(parts["f"]),
        "shared": svg_path(parts["shared"]),
        "thin": svg_path(parts["thin"]),
        "w": M.BBOX_W * s,
        "h": height,
    }


@cache
def lockup(cap):
    """Horizontal lockup at wordmark cap height `cap`: (mark path, word path, width, height)."""
    mh = cap * B.MARK_H_PER_CAP
    md, mw = B.mark_d(mh, 0, 0)
    xh_mid = (M.XH + M.BASE) / 2 - M.BBOX_Y0
    baseline = xh_mid * mh / M.BBOX_H + cap / 2
    wd, ww = B.wordmark(cap, mw + cap * B.GAP_PER_CAP, baseline)
    return svg_path(md), svg_path(wd), mw + cap * B.GAP_PER_CAP + ww, mh, mw


def draw_lockup(c, cx, cy, cap, alpha=1.0, word=1.0, mark_alpha=None):
    """Lockup centred on (cx, cy). `word` (0..1) wipes the wordmark in from the mark."""
    mp, wp, w, h, mw = lockup(cap)
    x0, y0 = cx - w / 2, cy - h / 2
    c.save()
    c.translate(x0, y0)
    c.drawPath(mp, paint(WHITE, alpha if mark_alpha is None else mark_alpha))
    if word > 0:
        c.save()
        gx = mw + cap * B.GAP_PER_CAP
        c.clipRect(skia.Rect(gx - 2, -h, gx + (w - gx) * ease_out(word, 4) + 4, h * 2))
        c.translate((1 - ease_out(word, 4)) * -cap * 0.6, 0)
        c.drawPath(wp, paint(WHITE, alpha * ease_out(word, 2)))
        c.restore()
    c.restore()
    return w, h


# ---------------------------------------------------------------- plates


# HDR plates: a gentle inverse tone map lifts each photo's own highlights
# (the sun, a monitor, a phone screen) above SDR white; shadows stay put.
PLATE_HDR = {
    "night-desk": 2.6,
    "hands": 1.0,
    "threads-hall": 2.2,
    "paper-avalanche": 1.6,
    "one-thread": 3.2,
    "phone-night": 3.0,
    "dawn": 3.0,
    "monolith-plain": 2.2,
}
KNEE = 0.5  # linear level where the expansion starts


@cache
def plate(name, width=2304):
    """A still, decoded once, resized for Ken Burns at output resolution and
    returned as an extended-range F16 image."""
    for p in [FILM / "images" / "select" / f"{name}.png", FILM / "images" / "select" / f"{name}.jpg", BRAND / "key-visuals" / f"{name}.jpg"]:
        if p.exists():
            img = skia.Image.open(str(p))
            w = width * SCALE
            h = round(img.height() * w / img.width())
            img = img.resize(w, h, skia.SamplingOptions(skia.CubicResampler.Mitchell()))
            rgb = img.toarray(colorType=skia.kRGBA_8888_ColorType)[..., :3].astype(np.float32) / 255
            lin = srgb_decode(rgb)
            k = PLATE_HDR.get(name, 0.0)
            if k:
                lin = lin + k * np.clip((lin - KNEE) / (1 - KNEE), 0, None) ** 2
            return f16_image(srgb_encode(lin))
    raise FileNotFoundError(name)


SAMPLING = skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kNone)


def kenburns(c, img, x, s0=1.0, s1=1.1, c0=(0.5, 0.5), c1=(0.5, 0.5), alpha=1.0, exposure=1.0, shake=0.0, t=0.0):
    """Cover-fit `img` and push from scale s0 to s1 while the focus point
    drifts from c0 to c1 (fractions of the image). `x` is progress 0..1.
    `exposure` below 1 darkens without clamping HDR highlights."""
    if alpha <= 0.002:
        return
    e = smooth(x) * 0.25 + x * 0.75
    s = lerp(s0, s1, e)
    fx, fy = lerp(c0[0], c1[0], e), lerp(c0[1], c1[1], e)
    base = max(W / img.width(), H / img.height())
    sw, sh = W / (base * s), H / (base * s)
    sx = clamp(fx * img.width() - sw / 2, 0, img.width() - sw)
    sy = clamp(fy * img.height() - sh / 2, 0, img.height() - sh)
    if shake:
        sx += (math.sin(t * 37.1) + math.sin(t * 23.7)) * shake * SCALE
        sy += (math.cos(t * 31.3) + math.sin(t * 19.9)) * shake * SCALE
    p = skia.Paint(AntiAlias=True)
    p.setAlphaf(clamp(alpha))
    c.drawImageRect(img, skia.Rect.MakeXYWH(sx, sy, sw, sh), skia.Rect.MakeWH(W, H), SAMPLING, p)
    if exposure < 0.99:
        c.drawRect(skia.Rect.MakeWH(W, H), paint(0xFF000000, alpha * (1 - exposure)))


def _read_exr(path):
    import OpenEXR

    with OpenEXR.File(str(path)) as f:
        ch = f.channels()
        if "RGB" in ch:
            rgb = ch["RGB"].pixels
        elif "RGBA" in ch:
            rgb = ch["RGBA"].pixels[..., :3]
        else:
            rgb = np.dstack([ch[k].pixels for k in ("R", "G", "B")])
    return np.asarray(rgb, dtype=np.float32)


@cache
def _frames(directory):
    """Numbered frames in a folder: {n: path}, EXR preferred over PNG."""
    out = {}
    if directory.exists():
        for p in sorted(directory.iterdir()):
            if p.stem.isdigit() and p.suffix in (".exr", ".png"):
                if int(p.stem) not in out or p.suffix == ".exr":
                    out[int(p.stem)] = p
    return out


# per-shot HDR highlight lift for renders that sit too low: linear values above
# the knee expand quadratically, so shadows and the text side stay untouched
SHOT_LIFT = {"hero": 1.5}


def _load(p):
    if p.suffix == ".exr":
        lin = np.clip(_read_exr(p), 0, None) * BLENDER_GAIN
        k = SHOT_LIFT.get(p.parent.name, 0.0)
        if k:
            lin = lin + k * np.clip((lin - KNEE) / (1 - KNEE), 0, None) ** 2
        return f16_image(srgb_encode(lin))
    return skia.Image.open(str(p))


def blender_frame(shot, n):
    """A Blender frame: scene-linear EXR (HDR) when present, else an SDR PNG.

    In PREVIEW mode, missing frames fall back to older 1080p renders and then
    to the nearest look-dev still, so a rough cut can be watched before the
    3D finishes rendering."""
    n = max(1, n)
    root = FILM / "build" / "blender"
    p = root / shot / f"{n:04d}.exr"
    if p.exists():
        return _load(p)
    if not PREVIEW:
        p = p.with_suffix(".png")
        return _load(p) if p.exists() else None
    for d in (root / shot, root / "_legacy_1080p" / shot):
        fr = _frames(d) if d != root / shot else None
        if fr and n in fr:
            return _load(fr[n])
    pool = {**_frames(root / "_stills" / shot), **_frames(root / "_legacy_1080p" / shot)}
    live = _frames.__wrapped__(root / shot)
    pool.update(live)
    if not pool:
        return None
    k = min(pool, key=lambda m: abs(m - n))
    return _load(pool[k])


BLENDER_GAIN = 1.0


def draw_frame(c, img, alpha=1.0, scale=1.0, blend=None):
    if img is None or alpha <= 0.002:
        return
    p = skia.Paint(AntiAlias=True)
    p.setAlphaf(clamp(alpha))
    if blend is not None:
        p.setBlendMode(blend)
    w, h = W * scale, H * scale
    c.drawImageRect(img, skia.Rect.MakeXYWH((W - w) / 2, (H - h) / 2, w, h), SAMPLING, p)


def fill(c, color=INK, alpha=1.0):
    c.drawRect(skia.Rect.MakeWH(W, H), paint(color, alpha))


FX = {"flash": 0.0}


def flash(c, amount, color=WHITE):
    """Full-frame light. Accumulated per frame and added in linear light by
    `post`, so in HDR it can go far above SDR white."""
    if amount > 0.002:
        FX["flash"] += amount


# ---------------------------------------------------------------- shaders

LIGHT_FIELD = skia.RuntimeEffect.MakeForShader(
    """
uniform float2 res;
uniform float t;
uniform float amp;

float h(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float n(float2 p) {
  float2 i = floor(p), f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + float2(1, 0)), u.x), mix(h(i + float2(0, 1)), h(i + float2(1, 1)), u.x), u.y);
}
float fbm(float2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + float2(1.7, 9.2); a *= 0.5; }
  return v;
}
half4 main(float2 fc) {
  float2 uv = (fc - 0.5 * res) / res.y;
  float2 q = float2(fbm(uv * 1.6 + float2(0.0, t * 0.05)), fbm(uv * 1.6 + float2(5.2, -t * 0.04)));
  float v = fbm(uv * 2.2 + 2.5 * q + float2(t * 0.03, 0.0));
  float ribbons = smoothstep(0.55, 0.95, v) * 0.9 + smoothstep(0.35, 0.75, v) * 0.25;
  float fall = exp(-dot(uv * float2(0.9, 1.6), uv * float2(0.9, 1.6)) * 1.4);
  float l = ribbons * fall * amp;
  return half4(half3(l), 1.0);
}
"""
)
if LIGHT_FIELD is None:
    raise RuntimeError("light field shader failed to compile")


@cache
def _shader_surface(w, h):
    return skia.Surface(w, h)


def light_field(c, t, amp=0.35, alpha=1.0, scale=4):
    """Monochrome fbm light ribbons, rendered at 1/scale and upsampled."""
    w, h = W // scale, H // scale
    surf = _shader_surface(w, h)
    sc = surf.getCanvas()
    u = skia.Data.MakeWithCopy(np.array([w, h, t, amp], dtype=np.float32).tobytes())
    p = skia.Paint(Shader=LIGHT_FIELD.makeShader(u))
    sc.drawRect(skia.Rect.MakeWH(w, h), p)
    img = surf.makeImageSnapshot()
    q = skia.Paint(AntiAlias=True)
    q.setAlphaf(clamp(alpha))
    q.setBlendMode(skia.BlendMode.kPlus)
    c.drawImageRect(img, skia.Rect.MakeWH(w, h), skia.Rect.MakeWH(W, H), skia.SamplingOptions(skia.FilterMode.kLinear), q)


def grid(c, alpha=1.0, step=64, ox=0.0, oy=0.0, glow=None):
    """The effect.website grid: hairlines, faded toward the edges."""
    if alpha <= 0.002:
        return
    p = paint(LINE, alpha * 0.55, stroke=1)
    x = (ox % step) - step
    while x < W + step:
        c.drawLine(x, 0, x, H, p)
        x += step
    y = (oy % step) - step
    while y < H + step:
        c.drawLine(0, y, W, y, p)
        y += step
    # vignette the grid back into the ink
    g = skia.GradientShader.MakeRadial(
        skia.Point(W / 2, H / 2), W * 0.62, [argb(INK, 0.0), argb(INK, 0.0), argb(INK, 1.0)], [0.0, 0.45, 1.0]
    )
    c.drawRect(skia.Rect.MakeWH(W, H), skia.Paint(Shader=g))


def radial_glow(c, x, y, r, alpha, color=WHITE):
    if alpha <= 0.002:
        return
    g = skia.GradientShader.MakeRadial(skia.Point(x, y), r, [argb(color, alpha), argb(color, 0)], [0.0, 1.0])
    # source-over, not plus: plus clamps, which would flatten HDR highlights underneath
    c.drawRect(skia.Rect.MakeWH(W, H), skia.Paint(Shader=g))


def tilt(c, ry=0.0, rx=0.0, dist=2200.0, cx=W / 2, cy=H / 2):
    """Concat a perspective rotation (degrees) about the frame centre, so a flat
    layer swings in 3D like a keynote slide."""
    ay, ax = math.radians(ry), math.radians(rx)
    src, dst = [], []
    for x, y in [(0, 0), (W, 0), (W, H), (0, H)]:
        px, py, pz = x - cx, y - cy, 0.0
        px, pz = px * math.cos(ay) + pz * math.sin(ay), -px * math.sin(ay) + pz * math.cos(ay)
        py, pz = py * math.cos(ax) - pz * math.sin(ax), py * math.sin(ax) + pz * math.cos(ax)
        k = dist / (dist + pz)
        src.append(skia.Point(x, y))
        dst.append(skia.Point(cx + px * k, cy + py * k))
    m = skia.Matrix()
    m.setPolyToPoly(src, dst)
    c.concat(m)


# ---------------------------------------------------------------- code

KEYWORDS = set(
    """effect error service schema match when throws await defer using try catch finally return const let
    export function yield class extends static readonly if new import from layer main default declare type
    async of for continue get""".split()
)
TOKEN_RE = re.compile(
    r"(?P<ws>[ \t]+)|(?P<nl>\n)|(?P<comment>//[^\n]*)|(?P<str>\"[^\"\n]*\"|'[^'\n]*'|`[^`\n]*`)"
    r"|(?P<num>\d+(?:\.\d+)?)|(?P<op>\|>|=>|\*\*|===|\?\?|yield\*|function\*)|(?P<id>[A-Za-z_$][\w$]*)|(?P<p>[^\sA-Za-z_$\d])"
)

CEREMONY = {
    "yield*",
    "function*",
    "gen",
    "pipe",
    "fn",
    "Layer",
    "Context",
    "Service",
    "Schema",
    "TaggedError",
    "TaggedClass",
    "String",
    "Number",
    "catchTags",
    "catchTag",
    "addFinalizer",
    "scoped",
    "sync",
    "valueTags",
    "fnUntraced",
    "of",
    "use",
    "Return",
    "ensuring",
    "Effect",
    "succeed",
    "provide",
    "Match",
}


class Tok:
    __slots__ = ("kind", "text", "line", "col")

    def __init__(self, kind, text, line, col):
        self.kind, self.text, self.line, self.col = kind, text, line, col

    def color(self):
        k = self.kind
        if k == "comment":
            return Z600
        if k == "str" or k == "num":
            return SUBTLE
        if k == "op":
            return WHITE
        if k == "id":
            return WHITE if self.text in KEYWORDS else Z300
        return MUTED


def lex(code):
    out, line, col = [], 0, 0
    for m in TOKEN_RE.finditer(code):
        kind, s = m.lastgroup, m.group()
        if kind == "nl":
            line, col = line + 1, 0
            continue
        if kind != "ws":
            out.append(Tok(kind, s, line, col))
        col += len(s)
    return out


@cache
def mono(size, name=MONO):
    return skia.Font(skia.Typeface.MakeFromFile(str(FONTS / name)), size)


def mono_advance(size):
    return mono(size).measureText("M")


def code_size(code, max_w, max_h, lh=1.62, cap=34):
    lines = code.split("\n")
    cols = max(len(s) for s in lines)
    adv_per_px = mono_advance(100) / 100
    return min(cap, max_w / (cols * adv_per_px), max_h / (len(lines) * lh))


def draw_code(c, code, x, y, size, alpha=1.0, chars=None, lh=1.62, highlight=0.0, dim=0.0):
    """Monospace code with brand-monochrome highlighting. `chars` limits how
    much has been typed; `highlight` lifts ceremony tokens while `dim` sinks the rest."""
    f = mono(size)
    fb = mono(size, MONO_MED)
    adv = mono_advance(size)
    typed = 0
    line_lengths = [len(s) + 1 for s in code.split("\n")]
    starts = np.cumsum([0] + line_lengths)
    for tok in lex(code):
        pos = starts[tok.line] + tok.col
        s = tok.text
        if chars is not None:
            if pos >= chars:
                break
            s = s[: int(chars - pos)]
        cer = tok.text in CEREMONY
        col = tok.color()
        a = alpha
        if highlight > 0 and cer:
            col = mix(col, WHITE, highlight)
        elif dim > 0:
            a *= 1 - 0.65 * dim
        font = fb if (cer and highlight > 0.5) or (tok.kind == "id" and tok.text in KEYWORDS) else f
        c.drawString(s, x + tok.col * adv, y + (tok.line + 0.8) * size * lh, font, paint(col, a))
        if highlight > 0 and cer:
            r = skia.Rect.MakeXYWH(
                x + tok.col * adv - size * 0.15, y + tok.line * size * lh + size * 0.02, adv * len(s) + size * 0.3, size * 1.18
            )
            c.drawRRect(skia.RRect.MakeRectXY(r, size * 0.18, size * 0.18), paint(WHITE, a * 0.10 * highlight))
        typed = pos + len(s)
    return typed


def caret(c, x, y, size, t, alpha=1.0, solid=False):
    on = solid or (t % 1.0) < 0.5
    if on:
        c.drawRect(skia.Rect.MakeXYWH(x, y - size * 0.82, size * 0.55, size * 1.02), paint(WHITE, alpha * 0.9))


def window_panel(c, r, title="", alpha=1.0, title2="", tmix=0.0, right=""):
    """An editor window: tile fill, hairline border, traffic dots, a tab."""
    if alpha <= 0.002:
        return
    rr = skia.RRect.MakeRectXY(r, 18, 18)
    shadow = paint(0xFF000000, alpha * 0.6, blur=40)
    c.drawRRect(skia.RRect.MakeRectXY(r.makeOffset(0, 24), 18, 18), shadow)
    c.drawRRect(rr, paint(TILE, alpha))
    c.drawRRect(rr, paint(LINE, alpha, stroke=1.5))
    bar = 56
    c.drawLine(r.left(), r.top() + bar, r.right(), r.top() + bar, paint(LINE, alpha, stroke=1.5))
    for i in range(3):
        c.drawCircle(r.left() + 28 + i * 22, r.top() + bar / 2, 6.5, paint(0xFF3F3F46, alpha))
    if title:
        tx = r.left() + 110
        tab = skia.Rect.MakeXYWH(tx - 18, r.top() + 10, 230, bar - 10)
        c.drawRRect(skia.RRect.MakeRectXY(tab, 10, 10), paint(0xFF202023, alpha))
        f = mono(19)
        c.drawString(title, tx, r.top() + bar / 2 + 7, f, paint(SUBTLE, alpha * (1 - tmix)))
        if title2:
            c.drawString(title2, tx, r.top() + bar / 2 + 7, f, paint(WHITE, alpha * tmix))
    if right:
        f = mono(17)
        w = f.measureText(right)
        c.drawString(right, r.right() - 28 - w, r.top() + bar / 2 + 6, f, paint(MUTED, alpha))


def label(c, s, x, y, alpha=1.0, size=20, color=MUTED, chars=None, align="left"):
    """`// UPPERCASE` labels in JetBrains Mono, +6% tracking."""
    if chars is not None:
        s = s[: max(0, int(chars))]
    if not s:
        return
    return text(c, s, x, y, size, MONO_MED, color, alpha, align=align, tracking=0.06)


# ---------------------------------------------------------------- morph


class Morph:
    """Token-level transition from one snippet to another.

    Tokens that survive glide to their new place; tokens only in the source
    dissolve upward like dust; new tokens condense in with a flash. Replaced
    runs are paired one-to-one so `yield*` visibly becomes `await`."""

    def __init__(self, a, b, size, origin_a, origin_b, lh=1.62):
        self.a, self.b = lex(a), lex(b)
        self.size, self.lh = size, lh
        self.oa, self.ob = origin_a, origin_b
        self.adv = mono_advance(size)
        sm = difflib.SequenceMatcher(None, [t.text for t in self.a], [t.text for t in self.b], autojunk=False)
        self.moves, self.gone, self.new, self.swaps = [], [], [], []
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                self.moves += list(zip(self.a[i1:i2], self.b[j1:j2]))
            elif op == "replace" and (i2 - i1) == (j2 - j1) and (i2 - i1) <= 3:
                self.swaps += list(zip(self.a[i1:i2], self.b[j1:j2]))
            else:
                self.gone += self.a[i1:i2]
                self.new += self.b[j1:j2]

    def pos(self, tok, origin):
        return origin[0] + tok.col * self.adv, origin[1] + (tok.line + 0.8) * self.size * self.lh

    def draw(self, c, m, alpha=1.0, highlight=0.0):
        f, fb = mono(self.size), mono(self.size, MONO_MED)
        nlines = max(t.line for t in self.a) + 1
        for tok in self.gone:
            x, y = self.pos(tok, self.oa)
            d = 0.35 * tok.line / nlines
            k = clamp((m - d) / 0.4)
            e = ease_in(k, 2)
            a = alpha * (1 - e)
            if a <= 0.003:
                continue
            col = mix(tok.color(), WHITE, highlight) if tok.text in CEREMONY else tok.color()
            dx = (hash01(tok.line, tok.col) - 0.5) * 60 * e
            dy = -e * (40 + 80 * hash01(tok.col, tok.line, 3))
            p = paint(col, a, blur=e * self.size * 0.35)
            c.drawString(tok.text, x + dx, y + dy, fb if tok.text in CEREMONY else f, p)
        for ta, tb in self.moves + self.swaps:
            xa, ya = self.pos(ta, self.oa)
            xb, yb = self.pos(tb, self.ob)
            d = 0.12 * ta.line / nlines
            k = ease_in_out(clamp((m - 0.18 - d) / 0.55))
            x, y = lerp(xa, xb, k), lerp(ya, yb, k)
            if ta.text == tb.text:
                c.drawString(tb.text, x, y, f, paint(tb.color(), alpha))
            else:
                c.drawString(ta.text, x, y, f, paint(ta.color(), alpha * (1 - k), blur=k * 4))
                c.drawString(tb.text, x, y, fb, paint(WHITE, alpha * k, blur=(1 - k) * 4))
                if 0 < k < 1:
                    c.drawString(tb.text, x, y, fb, paint(WHITE, alpha * math.sin(k * math.pi) * 0.8, blur=self.size * 0.5))
        for tok in self.new:
            x, y = self.pos(tok, self.ob)
            k = clamp((m - 0.55 - 0.05 * hash01(tok.col, tok.line)) / 0.35)
            e = ease_out(k)
            if e <= 0.003:
                continue
            col = tok.color()
            c.drawString(tok.text, x, y + (1 - e) * 14, fb, paint(col, alpha * e, blur=(1 - e) * 6))
            glow = math.sin(k * math.pi) * alpha
            if glow > 0.01:
                c.drawString(tok.text, x, y, fb, paint(WHITE, glow * 0.9, blur=self.size * 0.45))


# ---------------------------------------------------------------- post

SDR_WHITE_NITS = 203.0  # ITU-R BT.2408 reference white
PEAK_NITS = 1000.0
FLASH_HDR_GAIN = 3.0
F16_CS = skia.ColorSpace.MakeSRGB()


def srgb_decode(e):
    """Extended sRGB → linear; values above 1 continue the curve."""
    e = np.asarray(e, dtype=np.float32)
    return np.where(e <= 0.04045, e / 12.92, ((np.maximum(e, 0.04045) + 0.055) / 1.055) ** 2.4)


def srgb_encode(lin):
    lin = np.asarray(lin, dtype=np.float32)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.maximum(lin, 0.0031308) ** (1 / 2.4) - 0.055)


def f16_image(rgb):
    a = np.empty(rgb.shape[:2] + (4,), np.float16)
    a[..., :3] = rgb
    a[..., 3] = 1
    return skia.Image.fromarray(a, colorType=skia.kRGBA_F16_ColorType, colorSpace=F16_CS)


def surface():
    info = skia.ImageInfo.Make(OW, OH, skia.kRGBA_F16_ColorType, skia.kPremul_AlphaType, F16_CS)
    return skia.Surface.MakeRaster(info)


_PQ = dict(m1=2610 / 16384, m2=2523 / 4096 * 128, c1=3424 / 4096, c2=2413 / 4096 * 32, c3=2392 / 4096 * 32)


def _pq_lut():
    """16-bit LUT from nits (0..PEAK, linear steps) to 16-bit PQ code values."""
    nits = np.linspace(0, PEAK_NITS, 65536, dtype=np.float64)
    y = (nits / 10000.0) ** _PQ["m1"]
    v = ((_PQ["c1"] + _PQ["c2"] * y) / (1 + _PQ["c3"] * y)) ** _PQ["m2"]
    return np.round(v * 65535).astype(np.uint16)


PQ_LUT = _pq_lut()
# linear BT.709 → BT.2020 primaries (our palette is near-neutral, but be exact)
M709_2020 = np.array(
    [[0.6274040, 0.3292820, 0.0433136], [0.0690970, 0.9195400, 0.0113612], [0.0163916, 0.0880132, 0.8955950]],
    dtype=np.float32,
)

_rng = np.random.default_rng(7)
_GRAIN = [_rng.standard_normal((OH // 2, OW // 2)).astype(np.float32) for _ in range(12)]
_yy, _xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
_r = np.sqrt(((_xx - OW / 2) / (OW / 2)) ** 2 * 0.85 + ((_yy - OH / 2) / (OH / 2)) ** 2)
VIGNETTE = (1 - 0.32 * np.clip(_r - 0.35, 0, None) ** 1.6).astype(np.float32)[..., None]
del _yy, _xx, _r


def post(f16, frame, flash=0.0, grain=1.0):
    """Grade one frame. Returns (hdr, sdr): HDR10 as 16-bit PQ BT.2020 RGB,
    SDR as 8-bit sRGB/BT.709 RGB, both from the same linear-light image."""
    e = f16[..., :3].astype(np.float32)
    if grain:
        g = _GRAIN[frame % len(_GRAIN)]
        g = np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)
        if frame % 2:
            g = g[::-1, ::-1]
        lum = np.clip(e.mean(axis=2, keepdims=True), 0, 1)
        e += g[..., None] * ((2.2 + 9.0 * lum * (1.15 - lum)) * grain / 255.0)
    lin = srgb_decode(e) * VIGNETTE
    fl = float(srgb_decode(np.float32(min(flash, 1.0)))) if flash > 0 else 0.0
    # HDR10
    hdr = (lin + fl * FLASH_HDR_GAIN) @ M709_2020.T
    nits = np.clip(hdr, 0, None) * SDR_WHITE_NITS
    knee = 600.0
    over = nits > knee
    nits[over] = knee + (PEAK_NITS - knee) * np.tanh((nits[over] - knee) / (PEAK_NITS - knee))
    hdr16 = PQ_LUT[np.minimum(np.round(nits * (65535 / PEAK_NITS)), 65535).astype(np.uint16)]
    # SDR: soft shoulder from 0.8 to white
    sdr = lin + fl
    hi = sdr > 0.8
    sdr[hi] = 0.8 + 0.2 * np.tanh((sdr[hi] - 0.8) / 0.2)
    sdr8 = np.clip(srgb_encode(np.clip(sdr, 0, 1)) * 255 + 0.5, 0, 255).astype(np.uint8)
    return hdr16, sdr8
