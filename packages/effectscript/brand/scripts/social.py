"""Social, web and media assets: exact vector logo and type composited over
the generated key visuals in `key-visuals/`."""

import re
import subprocess
from pathlib import Path

from PIL import Image

import brand as b
import mark
from text import text_path

KV = b.ROOT / "key-visuals"
CROPS = b.ROOT / ".gen/crops"

DISPLAY = "InterDisplay-Bold.otf"
DISPLAY_SEMI = "InterDisplay-SemiBold.otf"
SANS = "Inter-Regular.otf"
SANS_MED = "Inter-Medium.otf"
MONO = "JetBrainsMono-Regular.ttf"
MONO_MED = "JetBrainsMono-Medium.ttf"

LABEL = "// TYPESCRIPT, WITH EFFECT BUILT IN"
INSTALL = "npm install effectscript"

EFX_CODE = """export effect getUser(id: UserId): User throws UserNotFound {
  const users = await Users
  return await users.find(id)
} |> retry({ times: 3 })"""

TS_CODE = """import { Effect } from "effect"

export const getUser = Effect.fn("getUser")(
  function* (id: UserId): Effect.fn.Return<User, UserNotFound> {
    const users = yield* Users
    return yield* users.find(id)
  },
  Effect.retry({ times: 3 })
)"""

KEYWORDS = {"export", "effect", "const", "return", "await", "throws", "function", "import", "from", "yield"}


# ---------------------------------------------------------------- primitives


def T(text, font, size, x, y, fill=b.WHITE, tracking=0.0, anchor="start", opacity=None):
    _, w = text_path(text, font, size, 0, 0, tracking)
    if anchor == "end":
        x -= w
    elif anchor == "middle":
        x -= w / 2
    d, _ = text_path(text, font, size, x, y, tracking)
    op = f' fill-opacity="{opacity}"' if opacity is not None else ""
    return f'<path fill="{fill}"{op} d="{d}"/>', w


def width(text, font, size, tracking=0.0):
    return text_path(text, font, size, 0, 0, tracking)[1]


def cap_of(font, size):
    m = b.metrics(font)
    return size * m["cap"] / m["upem"]


def size_for_cap(font, cap):
    m = b.metrics(font)
    return cap * m["upem"] / m["cap"]


def headline_gradient(gid, x0, x1):
    """Effect-style headline fill: white that turns zinc-500 at the far end."""
    return (
        f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{x0:.1f}" y1="0" x2="{x1:.1f}" y2="0">'
        f'<stop offset="0" stop-color="#fff"/><stop offset=".62" stop-color="#fff"/>'
        f'<stop offset="1" stop-color="{b.GRAY_500}"/></linearGradient>'
    )


def cover(src, w, h, fx=0.5, fy=0.5, name=None):
    """Cover-crop `src` to w×h around the focal point (fx, fy)."""
    CROPS.mkdir(parents=True, exist_ok=True)
    out = CROPS / f"{name or Path(src).stem}-{w}x{h}.png"
    im = Image.open(src).convert("RGB")
    s = max(w / im.width, h / im.height)
    rw, rh = round(im.width * s), round(im.height * s)
    im = im.resize((rw, rh), Image.LANCZOS)
    left = min(max(round(fx * rw - w / 2), 0), rw - w)
    top = min(max(round(fy * rh - h / 2), 0), rh - h)
    im.crop((left, top, left + w, top + h)).save(out)
    return out.relative_to(b.ROOT)


def image(href, w, h, x=0, y=0):
    return f'<image href="{href}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="none"/>'


def grid(w, h, step, color="#FFFFFF", opacity=0.035, x0=0, y0=0):
    d = "".join(f"M{x:.1f} 0V{h}" for x in _range(x0, w, step))
    d += "".join(f"M0 {y:.1f}H{w}" for y in _range(y0, h, step))
    return f'<path d="{d}" stroke="{color}" stroke-opacity="{opacity}" stroke-width="1"/>'


def _range(start, stop, step):
    v = start
    while v <= stop:
        yield v
        v += step


def lockup(x, y_center, cap, color=b.WHITE):
    """Horizontal lockup with the cap band centred on y_center. Returns (svg, width)."""
    body, w, h = b.lockup_horizontal(cap, color)
    xh_mid = ((mark.XH + mark.BASE) / 2 - mark.BBOX_Y0) * (cap * b.MARK_H_PER_CAP) / mark.BBOX_H
    return f'<g transform="translate({x:.1f} {y_center - xh_mid:.1f})">{body}</g>', w


def lockup_width(cap):
    return b.lockup_horizontal(cap, b.WHITE)[1]


def mark_at(cx, cy, w, color=b.WHITE, gap=mark.GAP):
    s = w / mark.BBOX_W
    dx = cx - (mark.CENTER[0] - mark.BBOX_X0) * s
    dy = cy - (mark.CENTER[1] - mark.BBOX_Y0) * s
    return f'<path fill="{color}" d="{mark.path_d(s, dx, dy, gap)}"/>'


def chip(x, y, text, size, font=MONO, prompt="$"):
    """Effect-style install box: hairline border, mono text."""
    pad_x, h = size * 1.1, size * 2.6
    pw = width(prompt + " ", font, size)
    tw = width(text, font, size)
    w = pad_x * 2 + pw + tw
    base = y + h / 2 + cap_of(font, size) / 2
    p1, _ = T(prompt, font, size, x + pad_x, base, b.GRAY_500)
    p2, _ = T(text, font, size, x + pad_x + pw, base, "#E4E4E7")
    r = size * 0.45
    return (
        f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h:.1f}" rx="{r:.1f}" fill="#0F0F11" fill-opacity=".85" '
        f'stroke="{b.GRAY_800}" stroke-width="{max(1, size / 14):.1f}"/>{p1}{p2}',
        w,
        h,
    )


def code_block(code, x, y, size, line_h=1.6, font=MONO):
    """Grayscale syntax highlighting: keywords white, names light, punctuation dim."""
    out = []
    for i, line in enumerate(code.split("\n")):
        base = y + (i + 1) * size * line_h
        cx = x
        for tok in re.findall(r'"[^"]*"|\w+|\s+|[^\w\s]+', line):
            if tok.isspace():
                cx += width(tok.replace(" ", " "), font, size) if tok else 0
                continue
            if tok in KEYWORDS:
                fill = b.WHITE
            elif tok.startswith('"'):
                fill = "#A1A1AA"
            elif re.match(r"\w", tok):
                fill = "#D4D4D8" if tok[0].islower() else "#E4E4E7"
            else:
                fill = b.GRAY_500
            p, w = T(tok, font, size, cx, base, fill)
            out.append(p)
            cx += w
    return "".join(out)


def mono_width(text, size, font=MONO):
    return width(text.replace(" ", " "), font, size)


def window(x, y, w, h, title, size, accent=False):
    """Editor card with traffic-light dots and a tab title."""
    bar = size * 2.6
    r = size * 0.7
    dots = "".join(
        f'<circle cx="{x + size * (1.4 + i * 1.3):.1f}" cy="{y + bar / 2:.1f}" r="{size * 0.36:.1f}" fill="#3F3F46"/>'
        for i in range(3)
    )
    t, _ = T(title, MONO, size * 0.92, x + w / 2, y + bar / 2 + cap_of(MONO, size * 0.92) / 2, "#A1A1AA", anchor="middle")
    stroke = "#52525B" if accent else b.GRAY_800
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r:.1f}" fill="#0C0C0E" stroke="{stroke}" stroke-width="1.5"/>'
        f'<path d="M{x} {y + bar:.1f}H{x + w}" stroke="{b.GRAY_800}" stroke-width="1.5"/>{dots}{t}'
    )


def save(name, w, h, body, defs="", fmt="png", bg=b.INK):
    svg_path = b.write(f".gen/social-svg/{Path(name).stem}.svg", b.svg(w, h, body, bg=bg, extra_defs=defs))
    out = b.ROOT / name
    out.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "png":
        b.render(svg_path.relative_to(b.ROOT), name, width=w)
    else:
        tmp = b.ROOT / ".gen/tmp.png"
        subprocess.run(
            ["resvg", "--use-fonts-dir", str(b.ROOT / "fonts"), "--resources-dir", str(b.ROOT), "-w", str(w),
             str(svg_path), str(tmp)],
            check=True,
        )
        subprocess.run(
            ["magick", str(tmp), "-sampling-factor", "4:4:4", "-quality", "92", "-strip", str(out)], check=True
        )
        tmp.unlink()
    print("wrote", name)


# ---------------------------------------------------------------- templates


def hero_card(name, w, h, fmt="jpg", label=LABEL, sub=b.TAGLINE, install=INSTALL, kv="monolith.jpg"):
    """Headline on the left, the monolith on the right (OG, social preview, covers)."""
    u = min(h / 630, w / 1200)
    # narrower frames crop further right so the headline clears the mark
    fx = 0.62 + max(0.0, 1.9 - w / h) * 0.4
    bg = cover(KV / kv, w, h, fx, 0.5, "monolith")
    left = 72 * u * max(1, (w / h) / 1.9)
    defs = (
        '<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">'
        f'<stop offset="0" stop-color="{b.INK}" stop-opacity=".9"/>'
        f'<stop offset=".55" stop-color="{b.INK}" stop-opacity=".25"/>'
        f'<stop offset=".75" stop-color="{b.INK}" stop-opacity="0"/></linearGradient>'
    )
    head_size = 92 * u
    hw = width(b.NAME, DISPLAY, head_size, -0.03)
    defs += headline_gradient("hg", left, left + hw)
    parts = [image(bg, w, h), f'<rect width="{w}" height="{h}" fill="url(#fade)"/>']
    y = h * 0.5 - 92 * u
    if label:
        parts.append(T(label, MONO, 15 * u, left, y - 42 * u, b.GRAY_500, 0.06)[0])
    parts.append(T(b.NAME, DISPLAY, head_size, left, y + 36 * u, "url(#hg)", -0.03)[0])
    if sub:
        parts.append(T(sub, SANS, 27 * u, left, y + 92 * u, b.GRAY_400)[0])
    if install:
        c, _, _ = chip(left, y + 132 * u, install, 17 * u)
        parts.append(c)
    save(name, w, h, "".join(parts), defs, fmt)


def ceremony_banner(name, w, h, fmt="jpg", kv="ceremony.jpg", tagline=True, stroke_end=0.585, safe=None):
    """Tangle on the left resolving into one stroke that runs into the lockup."""
    bg = cover(KV / kv, w, h, 0.5, 0.5, "ceremony")
    sx0, sx1 = safe or (0, w)
    x = w * stroke_end + h * 0.06
    avail = sx1 - x - h * 0.12
    cap = min(h * 0.105, avail / (lockup_width(1)))
    parts = [image(bg, w, h)]
    lk, lw = lockup(x, h / 2, cap)
    parts.append(lk)
    if tagline:
        ts = cap * 0.5
        parts.append(T(b.TAGLINE, SANS, ts, x + 1, h / 2 + cap * 1.9, b.GRAY_400)[0])
    save(name, w, h, "".join(parts), "", fmt)
    _ = sx0


def youtube_banner(name="social/youtube/youtube-banner.jpg"):
    w, h = 2560, 1440
    band_h = round(w / 3)
    bg = cover(KV / "ceremony.jpg", w, band_h, 0.5, 0.5, "ceremony")
    y0 = (h - band_h) / 2
    defs = (
        '<linearGradient id="v" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{b.INK}"/><stop offset=".12" stop-color="{b.INK}" stop-opacity="0"/>'
        f'<stop offset=".88" stop-color="{b.INK}" stop-opacity="0"/><stop offset="1" stop-color="{b.INK}"/>'
        "</linearGradient>"
    )
    # safe area for every device: 1546×423, centred
    sx1 = (w + 1546) / 2
    x = w * 0.585 + 40
    cap = min(64, (sx1 - x - 20) / lockup_width(1))
    lk, _ = lockup(x, h / 2, cap)
    tag = T(b.TAGLINE, SANS, cap * 0.5, x + 1, h / 2 + cap * 1.9, b.GRAY_400)[0]
    body = f'{image(bg, w, band_h, 0, y0)}<rect y="{y0}" width="{w}" height="{band_h}" fill="url(#v)"/>{lk}{tag}'
    save(name, w, h, body, defs, "jpg")


def avatar(name, size, mark_w=0.56, bg=b.TILE, fg=b.WHITE, radius=0):
    gap = mark.GAP if size >= 128 else 0
    r = f' rx="{radius * size:.1f}"' if radius else ""
    body = f'<rect width="{size}" height="{size}"{r} fill="{bg}"/>' + mark_at(size / 2, size / 2, size * mark_w, fg, gap)
    save(name, size, size, body, "", "png", bg=None)


def readme_banner(name, dark=True):
    w, h = 1280, 320
    fg, bg, sub, line = (b.WHITE, b.INK, b.GRAY_400, "#FFFFFF") if dark else (b.INK, b.WHITE, b.GRAY_500, "#09090B")
    cap = 52
    lw = lockup_width(cap)
    parts = [grid(w, h, 40, line, 0.05 if dark else 0.06, 0, 0)]
    if dark:
        parts.insert(
            0,
            '<rect width="1280" height="320" fill="url(#glow)"/>',
        )
    lk, _ = lockup((w - lw) / 2, h / 2 - 18, cap, fg)
    parts.append(lk)
    parts.append(T(b.TAGLINE, SANS, 24, w / 2, h / 2 + 70, sub, anchor="middle")[0])
    defs = (
        '<radialGradient id="glow" cx=".5" cy=".5" r=".6">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>'
        "</radialGradient>"
    )
    save(name, w, h, "".join(parts), defs, "png", bg=bg)


def compare(name, w, h, portrait=False):
    """Effect TypeScript vs EffectScript, the core pitch in one image."""
    u = w / 1080 if portrait else w / 1600
    parts = [grid(w, h, 48 * u, "#fff", 0.03)]
    pad = 64 * u
    ts_lines, efx_lines = TS_CODE.split("\n"), EFX_CODE.split("\n")
    lh, bar, inset = 1.62, 14 * u * 2.6, 28 * u
    head = "Same Effect. Less ceremony."
    hs = (62 if portrait else 72) * u
    label_y = (88 if portrait else 96) * u
    defs = headline_gradient("hg", pad, pad + width(head, DISPLAY, hs, -0.025))
    parts.append(T("// EFFECT TYPESCRIPT  →  EFFECTSCRIPT", MONO, 14 * u, pad, label_y, b.GRAY_500, 0.06)[0])
    parts.append(T(head, DISPLAY, hs, pad, label_y + hs * 1.15, "url(#hg)", -0.025)[0])
    head_bot = label_y + hs * 1.15
    if not portrait:
        sub = "The same idiomatic Effect v4 an expert writes by hand, without the boilerplate."
        parts.append(T(sub, SANS, 22 * u, pad, head_bot + 46 * u, b.GRAY_400)[0])
        head_bot += 46 * u
    area_top, area_bot = head_bot + 48 * u, h - 104 * u
    longest = max(mono_width(line, 1) for line in ts_lines + efx_lines)

    def card_h(n, fs):
        return bar + inset * 2 + n * fs * lh + 18 * u

    if portrait:
        cw = w - pad * 2
        gap = 40 * u
        fs_w = (cw - inset * 2) / longest
        fs_h = (area_bot - area_top - gap - 2 * (bar + inset * 2 + 18 * u)) / ((len(ts_lines) + len(efx_lines)) * lh)
        fs = min(fs_w, fs_h, 24 * u)
        h1, h2 = card_h(len(ts_lines), fs), card_h(len(efx_lines), fs)
        y0 = area_top + (area_bot - area_top - (h1 + gap + h2)) / 2
        cards = [(pad, y0, cw, h1, "users.ts", ts_lines, False), (pad, y0 + h1 + gap, cw, h2, "users.efx", efx_lines, True)]
    else:
        cw = (w - pad * 3) / 2
        fs_w = (cw - inset * 2) / longest
        fs_h = (area_bot - area_top - bar - inset * 2 - 18 * u) / (len(ts_lines) * lh)
        fs = min(fs_w, fs_h, 24 * u)
        ch = card_h(len(ts_lines), fs)
        y0 = area_top + (area_bot - area_top - ch) / 2
        cards = [(pad, y0, cw, ch, "users.ts", ts_lines, False), (pad * 2 + cw, y0, cw, ch, "users.efx", efx_lines, True)]
        # arrow in the gutter
        cx, cy, r = pad + cw + pad / 2, y0 + ch / 2, 20 * u
        parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="#0C0C0E" stroke="#3F3F46" stroke-width="1.5"/>')
        parts.append(T("→", MONO_MED, 20 * u, cx, cy + cap_of(MONO_MED, 20 * u) / 2 - 1 * u, b.WHITE, anchor="middle")[0])
    for x, y, cw_, ch_, title, lines, accent in cards:
        parts.append(window(x, y, cw_, ch_, title, 14 * u, accent))
        parts.append(code_block("\n".join(lines), x + inset, y + bar + inset - fs * 0.45, fs, lh))
        tag = "Effect TypeScript" if title.endswith(".ts") else "EffectScript"
        parts.append(T(tag, SANS_MED, 13 * u, x + cw_ - 20 * u, y + ch_ - 16 * u, b.GRAY_500, anchor="end")[0])
    lk_cap = 22 * u
    lk, _ = lockup(w - pad - lockup_width(lk_cap), h - 52 * u, lk_cap)
    parts.append(lk)
    save(name, w, h, "".join(parts), defs, "png")


def thumbnail(name="social/youtube/youtube-thumbnail.jpg"):
    w, h = 1280, 720
    bg = cover(KV / "monolith.jpg", w, h, 0.66, 0.5, "monolith")
    defs = (
        '<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">'
        f'<stop offset="0" stop-color="{b.INK}" stop-opacity=".92"/>'
        f'<stop offset=".6" stop-color="{b.INK}" stop-opacity=".3"/>'
        f'<stop offset=".8" stop-color="{b.INK}" stop-opacity="0"/></linearGradient>'
    )
    x = 72
    old = "Effect.gen(function*"
    os_ = 40
    p_old, ow = T(old, MONO, os_, x, 250, b.GRAY_500)
    strike = f'<rect x="{x - 6}" y="{250 - cap_of(MONO, os_) * 0.42:.1f}" width="{ow + 12:.1f}" height="5" fill="{b.GRAY_400}"/>'
    p_new, _ = T("effect", MONO_MED, 150, x - 6, 420, b.WHITE, -0.02)
    p_sub, _ = T("No more yield*", DISPLAY, 58, x, 520, b.GRAY_400, -0.02)
    body = f'{image(bg, w, h)}<rect width="{w}" height="{h}" fill="url(#fade)"/>{p_old}{strike}{p_new}{p_sub}'
    save(name, w, h, body, defs, "jpg")


def story(name, w, h, kv="monolith-tall.jpg"):
    """Lockup over the beam of light. Shapes wider than 9:16 show the whole
    tall visual (its edges are black) instead of cropping into the mark."""
    src = Image.open(KV / kv)
    if w / h > src.width / src.height * 1.05:
        iw = round(h * src.width / src.height)
        bg = cover(KV / kv, iw, h, 0.5, 0.5, "monolith-tall")
        img = image(bg, iw, h, (w - iw) / 2, 0)
        fade = (
            '<linearGradient id="sx" x1="0" y1="0" x2="1" y2="0">'
            f'<stop offset="0" stop-color="{b.INK}"/><stop offset=".08" stop-color="{b.INK}" stop-opacity="0"/>'
            f'<stop offset=".92" stop-color="{b.INK}" stop-opacity="0"/><stop offset="1" stop-color="{b.INK}"/>'
            "</linearGradient>"
        )
        img += f'<rect x="{(w - iw) / 2:.1f}" width="{iw}" height="{h}" fill="url(#sx)"/>'
    else:
        bg = cover(KV / kv, w, h, 0.5, 0.62, "monolith-tall")
        img, fade = image(bg, w, h), ""
    defs = fade + (
        '<linearGradient id="top" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{b.INK}" stop-opacity=".55"/>'
        f'<stop offset=".35" stop-color="{b.INK}" stop-opacity="0"/></linearGradient>'
    )
    cap = w * 0.06
    lw = lockup_width(cap)
    ty = h * 0.15
    lk, _ = lockup((w - lw) / 2, ty, cap)
    tag = T(b.TAGLINE, SANS, cap * 0.62, w / 2, ty + cap * 2.3, b.GRAY_400, anchor="middle")[0]
    body = f'{img}<rect width="{w}" height="{h}" fill="url(#top)"/>{lk}{tag}'
    save(name, w, h, body, defs, "jpg")


def features(name, w, h):
    """Three promises, typographic, on the grid."""
    u = w / 1270
    pad = 72 * u
    parts = [grid(w, h, 40 * u, "#fff", 0.035)]
    head = "TypeScript, with Effect built in."
    hs = 50 * u
    defs = headline_gradient("hg", pad, pad + width(head, DISPLAY, hs, -0.025))
    parts.append(T("// WHY EFFECTSCRIPT", MONO, 14 * u, pad, 92 * u, b.GRAY_500, 0.06)[0])
    parts.append(T(head, DISPLAY, hs, pad, 92 * u + hs * 1.15, "url(#hg)", -0.025)[0])
    items = [
        (".ts ⊂ .efx", "A strict superset", "Every TypeScript file is already valid EffectScript. Mix freely."),
        ("|>", "Effect is the syntax", "effect, await, throws, needs and pipelines instead of ceremony."),
        (".efx ↔ .ts", "Two-way, no lock-in", "Compiles to idiomatic Effect v4 and converts back again."),
    ]
    cw = (w - pad * 2 - 2 * 24 * u) / 3
    top = 250 * u
    ch = h - top - 72 * u
    for i, (glyph, title, desc) in enumerate(items):
        x = pad + i * (cw + 24 * u)
        parts.append(
            f'<rect x="{x:.1f}" y="{top:.1f}" width="{cw:.1f}" height="{ch:.1f}" rx="{12 * u:.1f}" '
            f'fill="#0C0C0E" stroke="{b.GRAY_800}" stroke-width="1.5"/>'
        )
        parts.append(T(glyph, MONO_MED, 40 * u, x + 32 * u, top + 96 * u, b.WHITE)[0])
        parts.append(T(title, DISPLAY_SEMI, 25 * u, x + 32 * u, top + 196 * u, b.WHITE, -0.01)[0])
        words, lines, cur = desc.split(" "), [], ""
        fs = 17 * u
        for word in words:
            nxt = (cur + " " + word).strip()
            if width(nxt, SANS, fs) > cw - 64 * u:
                lines.append(cur)
                cur = word
            else:
                cur = nxt
        lines.append(cur)
        for j, line in enumerate(lines):
            parts.append(T(line, SANS, fs, x + 32 * u, top + 240 * u + j * fs * 1.5, b.GRAY_400)[0])
    save(name, w, h, "".join(parts), defs, "png")


def wallpaper(name, w, h, kv, fx=0.5, fy=0.5, tag=None):
    bg = cover(KV / kv, w, h, fx, fy, Path(kv).stem)
    save(name, w, h, image(bg, w, h), "", "jpg")


def build():
    # link previews
    hero_card("social/web/og-image.jpg", 1200, 630)
    hero_card("social/github/github-social-preview.jpg", 1280, 640)
    hero_card("social/web/twitter-card.jpg", 1200, 600)
    hero_card("social/blog/blog-cover-1600x840.jpg", 1600, 840)
    hero_card("social/blog/blog-cover-1000x420.jpg", 1000, 420, label=None, install=None)
    hero_card("social/slides/slide-title-1920x1080.jpg", 1920, 1080)
    hero_card("social/producthunt/producthunt-gallery-1.jpg", 1270, 760)
    hero_card("social/discord/discord-server-banner.jpg", 960, 540, label=None, install=None)
    # wide banners
    ceremony_banner("social/x/x-header.jpg", 1500, 500)
    ceremony_banner("social/bluesky/bluesky-banner.jpg", 3000, 1000)
    ceremony_banner("social/mastodon/mastodon-header.jpg", 1500, 500)
    ceremony_banner("social/linkedin/linkedin-banner.jpg", 1584, 396)
    ceremony_banner("social/linkedin/linkedin-page-cover.jpg", 1128, 191, tagline=False)
    ceremony_banner("social/reddit/reddit-banner.jpg", 1920, 384, tagline=False)
    ceremony_banner("social/web/hero-banner-3x1.jpg", 3840, 1280)
    youtube_banner()
    # avatars
    for nm, px in (
        ("x/x-avatar", 400),
        ("github/github-avatar", 500),
        ("linkedin/linkedin-logo", 400),
        ("youtube/youtube-avatar", 800),
        ("discord/discord-server-icon", 512),
        ("bluesky/bluesky-avatar", 1000),
        ("mastodon/mastodon-avatar", 400),
        ("reddit/reddit-icon", 256),
        ("producthunt/producthunt-thumbnail", 240),
        ("npm/npm-avatar", 500),
        ("twitch/twitch-avatar", 256),
    ):
        avatar(f"social/{nm}.png", px)
    avatar("social/slack/emoji-efx.png", 128, mark_w=0.8, radius=0.18)
    avatar("social/slack/emoji-efx-transparent.png", 128, mark_w=0.92, bg="none")
    # readme
    readme_banner("social/github/readme-banner-dark.png", True)
    readme_banner("social/github/readme-banner-light.png", False)
    # the pitch
    compare("social/x/x-post-compare.png", 1600, 900)
    compare("social/linkedin/linkedin-post-compare.png", 1080, 1350, portrait=True)
    compare("social/producthunt/producthunt-gallery-2.png", 1270, 760)
    features("social/producthunt/producthunt-gallery-3.png", 1270, 760)
    features("social/x/x-post-features.png", 1600, 900)
    # youtube, stories, posts
    thumbnail()
    story("social/instagram/instagram-story.jpg", 1080, 1920)
    story("social/x/x-post-portrait.jpg", 1080, 1350)
    wallpaper("social/instagram/instagram-post.jpg", 1080, 1080, "emboss.jpg")
    compare("social/instagram/instagram-post-compare.png", 1080, 1350, portrait=True)
    # wallpapers
    wallpaper("wallpapers/desktop-3840x2160.jpg", 3840, 2160, "monolith-alt.jpg")
    wallpaper("wallpapers/desktop-2560x1440.jpg", 2560, 1440, "monolith-alt.jpg")
    wallpaper("wallpapers/phone-1170x2532.jpg", 1170, 2532, "monolith-tall.jpg", 0.5, 0.55)
    wallpaper("wallpapers/phone-1440x3200.jpg", 1440, 3200, "monolith-tall.jpg", 0.5, 0.55)
    wallpaper("social/discord/discord-invite-splash.jpg", 1920, 1080, "monolith-alt.jpg")


if __name__ == "__main__":
    build()
