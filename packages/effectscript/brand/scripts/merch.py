"""Print files for merchandise: die-cut stickers with a cut line, and the
sticker composite for the merch key visual."""

import subprocess

from PIL import Image, ImageFilter

import brand as b
import mark

BORDER = 0.07  # white vinyl border around the mark, relative to mark width


def sticker_svg(mark_w, fg, vinyl):
    """Die-cut sticker artwork: the mark on vinyl with an even rounded border.
    Sticker printers derive the cut contour from the artwork's outer edge."""
    border = mark_w * BORDER
    s = mark_w / mark.BBOX_W
    w = mark_w + border * 2 + 4
    h = mark.BBOX_H * s + border * 2 + 4
    d = mark.path_d(s, border + 2, border + 2, gap=mark.GAP)
    solid = mark.path_d(s, border + 2, border + 2, gap=0)
    body = (
        f'<path d="{solid}" fill="{vinyl}" stroke="{vinyl}" stroke-width="{border * 2:.1f}" stroke-linejoin="round"/>'
        f'<path fill="{fg}" d="{d}"/>'
    )
    return b.svg(w, h, body), w, h


def print_files():
    for name, fg, vinyl in (("black-on-white", b.INK, b.WHITE), ("white-on-black", b.WHITE, b.INK)):
        svg, w, h = sticker_svg(1000, fg, vinyl)
        p = b.write(f"merch/sticker-die-cut-{name}.svg", svg)
        b.render(p.relative_to(b.ROOT), f"merch/sticker-die-cut-{name}.png", width=3000)
    # embroidery / print artwork: single colour, solid (no crossing gaps
    # below about 3 cm, where thread cannot hold them)
    d, w = b.mark_d(1000, 0, 0, gap=0)
    b.write("merch/mark-solid-white.svg", b.svg(w, 1000, f'<path fill="#fff" d="{d}"/>'))
    b.write("merch/mark-solid-black.svg", b.svg(w, 1000, f'<path fill="{b.INK}" d="{d}"/>'))


def composite(base, out, placements):
    """Lay stickers onto a photo with a soft contact shadow."""
    img = Image.open(base).convert("RGBA")
    for cx, cy, width, angle in placements:
        svg, _, _ = sticker_svg(1000, b.INK, b.WHITE)
        p = b.write(".gen/out/sticker.svg", svg)
        png = b.ROOT / ".gen/out/sticker.png"
        subprocess.run(["resvg", "-w", str(round(width)), str(p), str(png)], check=True)
        st = Image.open(png).convert("RGBA").rotate(angle, resample=Image.BICUBIC, expand=True)
        # slight warmth/grey so the white vinyl sits in the photo's light
        r, g, bl, a = st.split()
        st = Image.merge("RGBA", (r.point(lambda v: v * 0.93), g.point(lambda v: v * 0.93), bl.point(lambda v: v * 0.94), a))
        shadow = Image.new("RGBA", st.size, (0, 0, 0, 0))
        shadow.putalpha(a.point(lambda v: v * 0.55).filter(ImageFilter.GaussianBlur(width * 0.025)))
        x, y = round(cx - st.width / 2), round(cy - st.height / 2)
        img.alpha_composite(shadow, (x + round(width * 0.012), y + round(width * 0.02)))
        img.alpha_composite(st, (x, y))
    img.convert("RGB").save(out, quality=95, subsampling=0)


if __name__ == "__main__":
    print_files()
