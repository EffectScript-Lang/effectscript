"""Shared brand constants and SVG helpers."""

import subprocess
from pathlib import Path

import mark
from text import metrics, text_path

ROOT = Path(__file__).resolve().parent.parent

INK = "#09090B"  # page black (zinc-950)
TILE = "#18181A"  # icon tile black
WHITE = "#FFFFFF"
GRAY_400 = "#A1A1AA"
GRAY_500 = "#71717A"
GRAY_800 = "#27272A"

NAME = "EffectScript"
TAGLINE = "All of Effect. None of the ceremony."
WORD_FONT = "InterDisplay-Bold.otf"
WORD_TRACKING = -0.022

# Lockup proportions, relative to the wordmark cap height (C).
MARK_H_PER_CAP = 1.62  # mark height = 1.62 C
GAP_PER_CAP = 0.62  # space between mark and wordmark = 0.62 C
STACK_GAP_PER_CAP = 0.9
DESCENDER_PER_CAP = 0.27  # room below the baseline for the p


def svg(w, h, body, bg=None, extra_defs=""):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    defs = f"<defs>{extra_defs}</defs>" if extra_defs else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_n(w)}" height="{_n(h)}" '
        f'viewBox="0 0 {_n(w)} {_n(h)}" fill="none">{defs}{rect}{body}</svg>\n'
    )


def _n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def write(path, content):
    path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def render(svg_path, png_path, width=None, height=None):
    png_path = ROOT / png_path
    png_path.parent.mkdir(parents=True, exist_ok=True)
    args = ["resvg", "--use-fonts-dir", str(ROOT / "fonts"), "--skip-system-fonts", "--resources-dir", str(ROOT)]
    if width:
        args += ["-w", str(width)]
    if height:
        args += ["-h", str(height)]
    subprocess.run([*args, str(ROOT / svg_path), str(png_path)], check=True)
    subprocess.run(["oxipng", "-q", "-o", "2", "--strip", "safe", str(png_path)], check=True)
    return png_path


def mark_d(height, x=0.0, y=0.0, gap=mark.GAP):
    """Mark path scaled to `height`, top-left at (x, y)."""
    s = height / mark.BBOX_H
    return mark.path_d(s, x, y, gap), mark.BBOX_W * s


def wordmark(cap, x=0.0, baseline=0.0):
    m = metrics(WORD_FONT)
    size = cap * m["upem"] / m["cap"]
    return text_path(NAME, WORD_FONT, size, x, baseline, WORD_TRACKING)


def lockup_baseline(cap):
    """The horizontal lockup's wordmark baseline, measured from the top of the mark."""
    mh = cap * MARK_H_PER_CAP
    # centre the cap height on the mark's x-height band, which is where the eye
    # reads the mark's weight
    xh_mid = (mark.XH + mark.BASE) / 2 - mark.BBOX_Y0
    return xh_mid * mh / mark.BBOX_H + cap / 2


def lockup_horizontal_height(cap):
    """The horizontal lockup's height with room for the p's descender, for files cropped to it:
    the mark alone ends above the descender."""
    return max(cap * MARK_H_PER_CAP, lockup_baseline(cap) + cap * DESCENDER_PER_CAP)


def lockup_horizontal(cap, color):
    """Mark + wordmark on one line. Returns (body, width, height); the height is the mark's."""
    mh = cap * MARK_H_PER_CAP
    md, mw = mark_d(mh, 0, 0)
    baseline = lockup_baseline(cap)
    wd, ww = wordmark(cap, mw + cap * GAP_PER_CAP, baseline)
    w = mw + cap * GAP_PER_CAP + ww
    body = f'<path fill="{color}" d="{md}"/><path fill="{color}" d="{wd}"/>'
    return body, w, mh


def lockup_stacked(cap, color):
    mh = cap * MARK_H_PER_CAP * 1.9
    _, mw = mark_d(mh)
    _, ww = wordmark(cap)
    w = max(mw, ww)
    md, _ = mark_d(mh, (w - mw) / 2, 0)
    baseline = mh + cap * STACK_GAP_PER_CAP + cap
    wd, _ = wordmark(cap, (w - ww) / 2, baseline)
    body = f'<path fill="{color}" d="{md}"/><path fill="{color}" d="{wd}"/>'
    return body, w, baseline
