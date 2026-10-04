"""Shape text with HarfBuzz and return it as SVG path data, so logo files
never depend on installed fonts."""

from functools import cache
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONTS = Path(__file__).resolve().parent.parent / "fonts"


@cache
def _font(name):
    path = FONTS / name
    blob = hb.Blob.from_file_path(str(path))
    face = hb.Face(blob)
    return TTFont(str(path)), hb.Font(face), face.upem


def metrics(name):
    tt, _, upem = _font(name)
    os2 = tt["OS/2"]
    return {"upem": upem, "cap": os2.sCapHeight, "x": os2.sxHeight}


def text_path(text, name, size, x=0.0, y=0.0, tracking=0.0, features=None):
    """Return (path data, advance width) for `text` set at `size` px with its
    baseline at y. `tracking` is in em."""
    if not text:
        return "", 0.0
    tt, font, upem = _font(name)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    if features is None:
        # code keeps JetBrains Mono's ligatures: |> draws as ▷ (ADR-0080)
        features = {"kern": True, "liga": True, "calt": True}
    hb.shape(font, buf, features)
    glyphs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    s = size / upem
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    cursor = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        gx = x + (cursor + pos.x_offset) * s
        gy = y - pos.y_offset * s
        glyphs[order[info.codepoint]].draw(TransformPen(pen, (s, 0, 0, -s, gx, gy)))
        cursor += pos.x_advance + tracking * upem
    width = (cursor - tracking * upem) * s
    return pen.getCommands(), width
