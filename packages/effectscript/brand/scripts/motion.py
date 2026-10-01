"""Logo reveal: the f draws on, the shared stroke runs out of the crossbar
into the x, the thin diagonal settles under it, then the wordmark wipes in.
Frames are rendered with resvg and encoded with ffmpeg."""

import shutil
import subprocess

import brand as b
import mark

FPS = 60
DURATION = 3.4


def ease_out(t):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    t = min(max(t, 0.0), 1.0)
    return 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def phase(t, start, end):
    return (t - start) / (end - start)


def frame_svg(t, w, h, with_word=True, mark_h=None):
    cap = min(h * 0.11, w * 0.8 / b.lockup_horizontal(1, b.WHITE)[1])
    mh = mark_h or cap * b.MARK_H_PER_CAP
    s = mh / mark.BBOX_H
    mw = mark.BBOX_W * s
    gap = cap * b.GAP_PER_CAP
    _, ww = b.wordmark(cap)
    total = mw + gap + ww if with_word else mw
    x0 = (w - total) / 2
    y0 = (h - mh) / 2
    parts = mark.parts_d(s, x0, y0)
    defs, body = [], []

    # 1. the f draws on along its centreline
    p = ease_in_out(phase(t, 0.15, 0.95))
    L = mark.F_CENTRELINE_LEN * s
    cl = mark.centreline_d(mark.F_CENTRELINE, s, x0, y0)
    defs.append(
        f'<mask id="mf" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}">'
        f'<path d="{cl}" stroke="#fff" stroke-width="{240 * s:.1f}" fill="none" '
        f'stroke-dasharray="{L:.1f} {L + 10:.1f}" stroke-dashoffset="{L * (1 - p):.1f}"/></mask>'
    )
    if p > 0:
        body.append(f'<path fill="#fff" d="{parts["f"]}" mask="url(#mf)"/>')

    # 2. the shared stroke runs out of the crossbar into the x
    p = ease_in_out(phase(t, 0.7, 1.45))
    L = mark.SHARED_CENTRELINE_LEN * s
    cl = mark.centreline_d(mark.SHARED_CENTRELINE, s, x0, y0)
    defs.append(
        f'<mask id="ms" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}">'
        f'<path d="{cl}" stroke="#fff" stroke-width="{300 * s:.1f}" fill="none" stroke-linejoin="bevel" '
        f'stroke-dasharray="{L:.1f} {L + 10:.1f}" stroke-dashoffset="{L * (1 - p):.1f}"/></mask>'
    )
    if p > 0:
        body.append(f'<path fill="#fff" d="{parts["shared"]}" mask="url(#ms)"/>')

    # 3. the thin diagonal slides in along its own direction and settles
    p = ease_out(phase(t, 1.2, 1.75))
    if p > 0:
        off = (1 - p) * 90 * s
        body.append(
            f'<path fill="#fff" fill-opacity="{p:.3f}" d="{parts["thin"]}" '
            f'transform="translate({off * 0.67:.2f} {-off * 0.74:.2f})"/>'
        )

    # 4. the wordmark wipes in from the left
    p = ease_out(phase(t, 1.55, 2.35))
    if with_word and p > 0:
        xh_mid = ((mark.XH + mark.BASE) / 2 - mark.BBOX_Y0) * s
        baseline = y0 + xh_mid + cap / 2
        wx = x0 + mw + gap
        wd, _ = b.wordmark(cap, wx - (1 - p) * cap * 0.4, baseline)
        defs.append(
            f'<clipPath id="cw"><rect x="{wx - cap * 0.2:.1f}" y="0" width="{(ww + cap * 0.4) * p:.1f}" height="{h}"/></clipPath>'
        )
        body.append(f'<path fill="#fff" fill-opacity="{min(1, p * 1.4):.3f}" d="{wd}" clip-path="url(#cw)"/>')

    return b.svg(w, h, "".join(body), bg=b.INK, extra_defs="".join(defs))


def render(name, w, h, with_word=True, gif_w=None):
    frames = b.ROOT / ".gen/frames" / name
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True)
    n = round(DURATION * FPS)
    for i in range(n):
        svg = frames / "f.svg"
        svg.write_text(frame_svg(i / FPS, w, h, with_word, None if with_word else min(w, h) * 0.42))
        subprocess.run(["resvg", str(svg), str(frames / f"{i:04d}.png")], check=True)
    out = b.ROOT / "motion"
    out.mkdir(exist_ok=True)
    src = ["-framerate", str(FPS), "-i", str(frames / "%04d.png")]
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "14",
         "-preset", "slow", "-movflags", "+faststart", str(out / f"{name}.mp4")],
        check=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *src, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "24",
         "-pix_fmt", "yuv420p", str(out / f"{name}.webm")],
        check=True,
    )
    if gif_w:
        vf = f"fps=30,scale={gif_w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-vf", vf, str(out / f"{name}.gif")], check=True)
    # last frame as a poster
    shutil.copy(frames / f"{n - 1:04d}.png", out / f"{name}-poster.png")
    print("wrote", name)


if __name__ == "__main__":
    render("logo-reveal-1920x1080", 1920, 1080, True, gif_w=960)
    render("logo-reveal-1080x1080", 1080, 1080, True)
    render("mark-reveal-1080x1080", 1080, 1080, False, gif_w=480)
    render("logo-reveal-1080x1920", 1080, 1920, True)
