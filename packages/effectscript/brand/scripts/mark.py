"""EffectScript mark geometry.

The mark is a ligature of a function-hook f and an x. The f crossbar continues
into the thick diagonal of the x as one stroke. Where that stroke crosses the
thin diagonal, the thin diagonal is cut by GAP so the shared stroke reads as
passing over it.

Coordinates are in master units: the 2880px production master the mark was
measured from. BBOX_* gives the tight bounds.
"""

import math

BASE = 1956  # baseline
XH = 1302  # x-height, top of the shared stroke

# f
STEM_L, STEM_R = 985, 1146
TOP_T, TOP_B, TOP_END = 941, 1075, 1526
R_OUT, C_OUT = 311, (985 + 311, 941 + 311)
R_IN, C_IN = 161, (1146 + 161, 1075 + 161)
BOT_T, BOT_L = 1826, 817
RB_OUT, CB_OUT = 222, (1146 - 222, 1956 - 222)
RB_IN, CB_IN = 104, (985 - 104, 1826 - 104)

# shared stroke: crossbar + thick diagonal (slope dx/dy = KA)
BAR_B = 1432
KA = 0.8
A_TR = (1548, XH)
A_IN = (1458, BAR_B)
A_BR = (A_TR[0] + KA * (BASE - XH), BASE)
A_BL = (A_IN[0] + KA * (BASE - BAR_B), BASE)
BAR_START = 1066  # overlaps the stem so there is no seam

# thin diagonal (slope dx/dy = KB)
KB = -0.895
B_TL, B_TR = (1886, XH), (2068, XH)
B_BL = (B_TL[0] + KB * (BASE - XH), BASE)
B_BR = (B_TR[0] + KB * (BASE - XH), BASE)

GAP = 26

BBOX_X0, BBOX_Y0 = BOT_L, TOP_T
BBOX_X1, BBOX_Y1 = A_BR[0], BASE
BBOX_W, BBOX_H = BBOX_X1 - BBOX_X0, BBOX_Y1 - BBOX_Y0
# optical centre: the bbox centre nudged toward the heavier lower half
CENTER = ((BBOX_X0 + BBOX_X1) / 2, (BBOX_Y0 + BBOX_Y1) / 2 + 8)


def _fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _line_x(p, k, y):
    return p[0] + k * (y - p[1])


def _intersect(p1, k1, p2, k2):
    y = (p2[0] - p1[0] + k1 * p1[1] - k2 * p2[1]) / (k1 - k2)
    return (_line_x(p1, k1, y), y)


def _f_cmds():
    return [
        ("M", TOP_END, TOP_T),
        ("L", C_OUT[0], TOP_T),
        ("A", R_OUT, STEM_L, C_OUT[1], 0),
        ("L", STEM_L, CB_IN[1]),
        ("A", RB_IN, CB_IN[0], BOT_T, 1),
        ("L", BOT_L, BOT_T),
        ("L", BOT_L, BASE),
        ("L", CB_OUT[0], BASE),
        ("A", RB_OUT, STEM_R, CB_OUT[1], 0),
        ("L", STEM_R, C_IN[1]),
        ("A", R_IN, C_IN[0], TOP_B, 1),
        ("L", TOP_END, TOP_B),
        ("Z",),
    ]


def _shared():
    # reversed so every subpath winds the same way as the f (nonzero fill)
    return list(reversed([(BAR_START, XH), A_TR, A_BR, A_BL, A_IN, (BAR_START, BAR_B)]))


def _thin(gap):
    if gap <= 0:
        return [list(reversed([B_TL, B_TR, B_BR, B_BL]))]
    h = gap * math.sqrt(1 + KA * KA)
    right = (A_TR[0] + h, A_TR[1])
    left = (A_IN[0] - h, A_IN[1])
    upper = [B_TL, B_TR, _intersect(B_TR, KB, right, KA), _intersect(B_TL, KB, right, KA)]
    lower = [_intersect(B_TL, KB, left, KA), _intersect(B_TR, KB, left, KA), B_BR, B_BL]
    return [list(reversed(upper)), list(reversed(lower))]


def path_d(scale=1.0, dx=0.0, dy=0.0, gap=GAP):
    """SVG path data for the whole mark.

    The transform is p' = (p - bbox origin) * scale + (dx, dy).
    """

    def tx(x):
        return _fmt((x - BBOX_X0) * scale + dx)

    def ty(y):
        return _fmt((y - BBOX_Y0) * scale + dy)

    out = []
    for c in _f_cmds():
        if c[0] in "ML":
            out.append(f"{c[0]}{tx(c[1])} {ty(c[2])}")
        elif c[0] == "A":
            r = _fmt(c[1] * scale)
            out.append(f"A{r} {r} 0 0 {c[4]} {tx(c[2])} {ty(c[3])}")
        else:
            out.append("Z")
    for poly in [_shared(), *_thin(gap)]:
        out.append("M" + "L".join(f"{tx(x)} {ty(y)}" for x, y in poly) + "Z")
    return "".join(out)


def fit(box, size, cx=None, cy=None):
    """Scale and offset that fit the mark's height or width into a square box.

    `size` is the mark's width as a fraction of `box`; the mark is centred on
    its optical centre.
    """
    scale = box * size / BBOX_W
    cx = box / 2 if cx is None else cx
    cy = box / 2 if cy is None else cy
    dx = cx - (CENTER[0] - BBOX_X0) * scale
    dy = cy - (CENTER[1] - BBOX_Y0) * scale
    return scale, dx, dy
