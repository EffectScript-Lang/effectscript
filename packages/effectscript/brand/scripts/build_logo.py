"""Logo, icon and construction assets. Everything here is drawn from the
geometry in mark.py and the Inter Display outlines, so it is exact and
reproducible."""

import json
import shutil
import subprocess

import brand as b
import mark

COLORS = {"white": b.WHITE, "black": b.INK}


def logos():
    # mark: tight bounds
    h = 512
    d, w = b.mark_d(h)
    b.write("logo/svg/effectscript-mark.svg", b.svg(w, h, f'<path fill="currentColor" d="{d}"/>'))
    for name, color in COLORS.items():
        p = b.write(f"logo/svg/effectscript-mark-{name}.svg", b.svg(w, h, f'<path fill="{color}" d="{d}"/>'))
        for px in (512, 1024, 2048):
            b.render(p.relative_to(b.ROOT), f"logo/png/effectscript-mark-{name}-{px}.png", width=px)

    # wordmark
    cap = 100
    wd, ww = b.wordmark(cap, 0, cap)
    m = b.metrics(b.WORD_FONT)
    desc = cap * b.DESCENDER_PER_CAP
    for name, color in COLORS.items():
        p = b.write(
            f"logo/svg/effectscript-wordmark-{name}.svg", b.svg(ww, cap + desc, f'<path fill="{color}" d="{wd}"/>')
        )
        b.render(p.relative_to(b.ROOT), f"logo/png/effectscript-wordmark-{name}-2048.png", width=2048)

    # lockups
    for kind, fn in (("lockup", b.lockup_horizontal), ("lockup-stacked", b.lockup_stacked)):
        for name, color in COLORS.items():
            body, w, h = fn(cap, color)
            h = h + desc if kind == "lockup-stacked" else b.lockup_horizontal_height(cap)
            p = b.write(f"logo/svg/effectscript-{kind}-{name}.svg", b.svg(w, h, body))
            for px in (1024, 2048):
                b.render(p.relative_to(b.ROOT), f"logo/png/effectscript-{kind}-{name}-{px}.png", width=px)

    # presentation versions with clear space (1 cap height) on solid grounds
    for kind, fn in (("lockup", b.lockup_horizontal), ("lockup-stacked", b.lockup_stacked)):
        for ground, fg, bg in (("on-black", b.WHITE, b.INK), ("on-white", b.INK, b.WHITE)):
            body, w, h = fn(cap, fg)
            h = h + desc if kind == "lockup-stacked" else b.lockup_horizontal_height(cap)
            pad = cap * 1.6
            p = b.write(
                f".gen/out/{kind}-{ground}.svg",
                b.svg(w + 2 * pad, h + 2 * pad, f'<g transform="translate({pad} {pad})">{body}</g>', bg=bg),
            )
            b.render(p.relative_to(b.ROOT), f"logo/png/effectscript-{kind}-{ground}.png", width=2400)
    _ = m


def tile_svg(size, fill, fg, mark_w, radius=0.0, gap=mark.GAP, grad=False):
    s, dx, dy = mark.fit(size, mark_w)
    defs = ""
    tile_fill = fill
    if grad:
        defs = (
            '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#232327"/><stop offset="1" stop-color="#0B0B0D"/></linearGradient>'
        )
        tile_fill = "url(#g)"
    r = f' rx="{radius}"' if radius else ""
    body = f'<rect width="{size}" height="{size}"{r} fill="{tile_fill}"/>'
    body += f'<path fill="{fg}" d="{mark.path_d(s, dx, dy, gap)}"/>'
    return b.svg(size, size, body, extra_defs=defs)


def icons():
    # Favicon: a flat square tile, like Effect's own favicon. Small sizes use
    # the solid mark (no crossing gaps) so the x stays crisp.
    small = tile_svg(64, b.TILE, b.WHITE, 0.74, gap=0)
    big = tile_svg(512, b.TILE, b.WHITE, 0.68)
    b.write("icons/favicon.svg", small)
    p_small = b.write(".gen/out/favicon-small.svg", small)
    p_big = b.write(".gen/out/favicon-big.svg", big)
    for px in (16, 32, 48):
        b.render(p_small.relative_to(b.ROOT), f"icons/favicon-{px}.png", width=px)
    subprocess.run(
        ["magick", *[str(b.ROOT / f"icons/favicon-{px}.png") for px in (16, 32, 48)], str(b.ROOT / "icons/favicon.ico")],
        check=True,
    )
    b.render(p_big.relative_to(b.ROOT), "icons/apple-touch-icon.png", width=180)
    b.render(p_big.relative_to(b.ROOT), "icons/icon-192.png", width=192)
    b.render(p_big.relative_to(b.ROOT), "icons/icon-512.png", width=512)
    p = b.write(".gen/out/maskable.svg", tile_svg(512, b.TILE, b.WHITE, 0.52))
    b.render(p.relative_to(b.ROOT), "icons/icon-maskable-512.png", width=512)
    b.write(
        "icons/site.webmanifest",
        json.dumps(
            {
                "name": "EffectScript",
                "short_name": "EffectScript",
                "icons": [
                    {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
                    {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
                    {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
                ],
                "theme_color": b.INK,
                "background_color": b.INK,
                "display": "standalone",
            },
            indent=2,
        )
        + "\n",
    )

    # iOS / Android store icon: full bleed, no transparency
    p = b.write(".gen/out/app-ios.svg", tile_svg(1024, b.TILE, b.WHITE, 0.6, grad=True))
    b.render(p.relative_to(b.ROOT), "icons/app/app-icon-ios-1024.png", width=1024)

    # macOS icon: 824px rounded square inside the 1024 canvas with a soft shadow
    mac = macos_icon_svg()
    p = b.write(".gen/out/app-macos.svg", mac)
    b.render(p.relative_to(b.ROOT), "icons/app/app-icon-macos-1024.png", width=1024)
    iconset = b.ROOT / ".gen/out/AppIcon.iconset"
    shutil.rmtree(iconset, ignore_errors=True)
    iconset.mkdir(parents=True)
    for pt in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            suffix = "" if scale == 1 else "@2x"
            b.render(p.relative_to(b.ROOT), iconset.relative_to(b.ROOT) / f"icon_{pt}x{pt}{suffix}.png", width=pt * scale)
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(b.ROOT / "icons/app/AppIcon.icns")], check=True)

    # Windows .ico (rounded tile)
    win = tile_svg(256, b.TILE, b.WHITE, 0.64, radius=40)
    p = b.write(".gen/out/app-win.svg", win)
    sizes = (16, 24, 32, 48, 64, 128, 256)
    for px in sizes:
        b.render(p.relative_to(b.ROOT), f".gen/out/win-{px}.png", width=px)
    subprocess.run(
        ["magick", *[str(b.ROOT / f".gen/out/win-{px}.png") for px in sizes], str(b.ROOT / "icons/app/app-icon.ico")],
        check=True,
    )

    # Editor extension icon (VS Code Marketplace / Open VSX need a 128px+ PNG)
    p = b.write(".gen/out/ext.svg", tile_svg(256, b.TILE, b.WHITE, 0.64, radius=40, grad=True))
    b.render(p.relative_to(b.ROOT), "icons/editor/extension-icon-128.png", width=128)
    b.render(p.relative_to(b.ROOT), "icons/editor/extension-icon-256.png", width=256)

    # File icons for .efx. Editor icon themes draw on a 16px grid; the plain
    # glyph versions follow the theme, the tile reads like the TS badge.
    s, dx, dy = mark.fit(16, 0.92)
    glyph = mark.path_d(s, dx, dy, 0)
    b.write("icons/editor/file-efx-dark.svg", b.svg(16, 16, f'<path fill="#E4E4E7" d="{glyph}"/>'))
    b.write("icons/editor/file-efx-light.svg", b.svg(16, 16, f'<path fill="#3F3F46" d="{glyph}"/>'))
    b.write("icons/editor/file-efx-tile.svg", tile_svg(16, b.TILE, b.WHITE, 0.78, radius=2.5, gap=0))
    b.write("icons/editor/file-efx-tile-light.svg", tile_svg(16, b.WHITE, b.INK, 0.78, radius=2.5, gap=0))

    # Document icon for OS file associations: a page with a folded corner
    doc = document_icon_svg()
    p = b.write("icons/app/document-efx.svg", doc)
    b.render(p.relative_to(b.ROOT), "icons/app/document-efx-512.png", width=512)
    b.render(p.relative_to(b.ROOT), "icons/app/document-efx-1024.png", width=1024)


def macos_icon_svg():
    size, inner, off, r = 1024, 824, 100, 185
    s, dx, dy = mark.fit(inner, 0.6, inner / 2 + off, inner / 2 + off)
    defs = (
        '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#26262B"/><stop offset="1" stop-color="#0A0A0C"/></linearGradient>'
        '<linearGradient id="e" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/>'
        '<stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>'
        '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">'
        '<feGaussianBlur stdDeviation="14"/><feOffset dy="12"/>'
        '<feComponentTransfer><feFuncA type="linear" slope=".45"/></feComponentTransfer></filter>'
    )
    body = (
        f'<rect x="{off}" y="{off}" width="{inner}" height="{inner}" rx="{r}" fill="#000" filter="url(#sh)"/>'
        f'<rect x="{off}" y="{off}" width="{inner}" height="{inner}" rx="{r}" fill="url(#g)"/>'
        f'<rect x="{off + 1.5}" y="{off + 1.5}" width="{inner - 3}" height="{inner - 3}" rx="{r - 1.5}" '
        f'stroke="url(#e)" stroke-width="3"/>'
        f'<path fill="#fff" d="{mark.path_d(s, dx, dy)}"/>'
    )
    return b.svg(size, size, body, extra_defs=defs)


def document_icon_svg():
    size = 512
    x0, y0, w, h, fold = 96, 40, 320, 432, 88
    page = f"M{x0} {y0 + 16}q0-16 16-16H{x0 + w - fold}L{x0 + w} {y0 + fold}V{y0 + h - 16}q0 16-16 16H{x0 + 16}q-16 0-16-16Z"
    corner = f"M{x0 + w - fold} {y0}V{y0 + fold - 12}q0 12 12 12H{x0 + w}Z"
    s, dx, dy = mark.fit(w, 0.66, x0 + w / 2, y0 + h * 0.5)
    label_d, lw = b.text_path(".efx", "JetBrainsMono-Medium.ttf", 44)
    label = b.text_path(".efx", "JetBrainsMono-Medium.ttf", 44, x0 + (w - lw) / 2, y0 + h - 44)[0]
    body = (
        f'<path d="{page}" fill="{b.TILE}" stroke="#3F3F46" stroke-width="2"/>'
        f'<path d="{corner}" fill="#3F3F46"/>'
        f'<path fill="#fff" d="{mark.path_d(s, dx, dy)}"/>'
        f'<path fill="{b.GRAY_400}" d="{label}"/>'
    )
    _ = label_d
    return b.svg(size, size, body)


def construction():
    """Construction drawing used in the guidelines."""
    size = 1600
    scale = size * 0.62 / mark.BBOX_W
    ox = size / 2 - (mark.CENTER[0] - mark.BBOX_X0) * scale
    oy = size / 2 - (mark.CENTER[1] - mark.BBOX_Y0) * scale

    def P(x, y):
        return ((x - mark.BBOX_X0) * scale + ox, (y - mark.BBOX_Y0) * scale + oy)

    g = []
    step = 40
    for i in range(0, size + 1, step):
        g.append(f'<path d="M{i} 0V{size}M0 {i}H{size}" stroke="#1C1C20" stroke-width="1"/>')
    guide = 'stroke="#52525B" stroke-width="2" fill="none"'
    # horizontal metrics
    for y, label in ((mark.TOP_T, "ascender"), (mark.XH, "x-height"), (mark.BAR_B, "bar"), (mark.BASE, "baseline")):
        _, yy = P(0, y)
        g.append(f'<path d="M0 {yy:.1f}H{size}" stroke="#3F3F46" stroke-width="2" stroke-dasharray="6 8"/>')
        g.append(
            f'<text x="24" y="{yy - 12:.1f}" font-family="JetBrains Mono" font-size="22" fill="#71717A">{label}</text>'
        )
    # arc circles
    for c, r in ((mark.C_OUT, mark.R_OUT), (mark.C_IN, mark.R_IN), (mark.CB_OUT, mark.RB_OUT), (mark.CB_IN, mark.RB_IN)):
        cx, cy = P(*c)
        g.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r * scale:.1f}" {guide}/>')
        g.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="5" fill="#71717A"/>')
    # diagonal guides, extended
    for p0, k in ((mark.A_TR, mark.KA), (mark.A_IN, mark.KA), (mark.B_TL, mark.KB), (mark.B_TR, mark.KB)):
        y_a, y_b = mark.TOP_T - 200, mark.BASE + 200
        a = P(p0[0] + k * (y_a - p0[1]), y_a)
        bb = P(p0[0] + k * (y_b - p0[1]), y_b)
        g.append(f'<path d="M{a[0]:.1f} {a[1]:.1f}L{bb[0]:.1f} {bb[1]:.1f}" {guide} stroke-dasharray="2 10"/>')
    d = mark.path_d(scale, ox, oy, outline=True)
    g.append(f'<path d="{d}" fill="#fff" fill-opacity=".06" stroke="#fff" stroke-width="3"/>')
    body = "".join(g)
    p = b.write("logo/svg/effectscript-construction.svg", b.svg(size, size, body, bg=b.INK))
    b.render(p.relative_to(b.ROOT), "logo/png/effectscript-construction.png", width=2400)


if __name__ == "__main__":
    logos()
    icons()
    construction()
