"""Render the film.

  render.py stills 5 12.5 46        # PNG stills (with grain) into build/stills
  render.py sheet 0 160 2           # contact sheet: one frame every 2 s
  render.py video [--from A --to B] # parallel chunks → build/picture.mp4
"""

import argparse
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import skia

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402
import scenes  # noqa: E402
import timeline  # noqa: E402

BUILD = lib.FILM / "build"


def frame(t, n):
    """Render frame n at time t. Returns (hdr16, sdr8) RGB arrays at 4K."""
    surf = lib.surface()
    c = surf.getCanvas()
    c.clear(skia.Color4f.FromColor(lib.INK))
    c.scale(lib.SCALE, lib.SCALE)
    lib.FX["flash"] = 0.0
    scenes.draw(c, timeline.EDIT.to_src(t))  # t is edited film time
    f16 = surf.makeImageSnapshot().toarray(colorType=skia.kRGBA_F16_ColorType)
    return lib.post(f16, n, flash=lib.FX["flash"])


def _png(rgb8, path):
    skia.Image.fromarray(np.dstack([rgb8, np.full(rgb8.shape[:2], 255, np.uint8)])).save(str(path))


def stills(times):
    out = BUILD / "stills"
    out.mkdir(parents=True, exist_ok=True)
    for t in times:
        n = round(t * lib.FPS)
        t0 = time.time()
        hdr, img = frame(n / lib.FPS, n)
        p = out / f"t{t:07.2f}.png"
        _png(img, p)
        if "--hdr-stats" in sys.argv:
            print(f"   PQ max code {hdr.max()} ({hdr.max() / 65535:.3f})")
        print(f"{p.name}  {time.time() - t0:.2f}s")


def sheet(a, b, step, cols=5):
    times = list(np.arange(a, b, step))
    thumbs = []
    for t in times:
        n = round(t * lib.FPS)
        _, img = frame(n / lib.FPS, n)
        th = skia.Image.fromarray(np.dstack([img, np.full(img.shape[:2], 255, np.uint8)])).resize(384, 216)
        thumbs.append((t, th))
    rows = (len(thumbs) + cols - 1) // cols
    surf = skia.Surface(cols * 392, rows * 240)
    c = surf.getCanvas()
    c.clear(0xFF222222)
    f = lib.mono(14)
    for i, (t, th) in enumerate(thumbs):
        x, y = (i % cols) * 392 + 4, (i // cols) * 240 + 4
        c.drawImage(th, x, y)
        c.drawString(f"{t:.1f}s", x + 4, y + 232, f, skia.Paint(Color=0xFFFFFFFF))
    p = BUILD / f"sheet-{a:g}-{b:g}.png"
    surf.makeImageSnapshot().save(str(p))
    print(p)


# The master is HDR10 only; a 4K SDR version is opt-in (WITH_SDR=1).
WITH_SDR = os.environ.get("WITH_SDR") == "1"

HDR10 = (
    "hdr10=1:hdr10-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:range=limited"
    ":master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,50)"
    ":max-cll=1000,180:keyint=60:min-keyint=60:scenecut=0:open-gop=0:aq-mode=3:psy-rd=1.5:psy-rdoq=2"
)


def _ffmpeg(pix_fmt, args, path):
    return subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", pix_fmt, "-s", f"{lib.OW}x{lib.OH}",
         "-r", str(lib.FPS), "-i", "-", *args, str(path)],
        stdin=subprocess.PIPE,
    )


def chunk(args):
    i, n0, n1, hdr_path, sdr_path = args
    if lib.PREVIEW:
        sdr = _ffmpeg("rgb24", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
                                "-x264-params", "keyint=60:min-keyint=60:scenecut=0"], sdr_path)
        for n in range(n0, n1):
            sdr.stdin.write(np.ascontiguousarray(frame(n / lib.FPS, n)[1]).tobytes())
        sdr.stdin.close()
        sdr.wait()
        return i
    hdr = _ffmpeg(
        "rgb48le",
        ["-vf", "scale=out_color_matrix=bt2020nc:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p10le",
         "-c:v", "libx265", "-preset", "medium", "-crf", "14", "-x265-params", HDR10 + ":log-level=error",
         "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc", "-color_range", "tv"],
        hdr_path,
    )
    sdr = None if not WITH_SDR else _ffmpeg(
        "rgb24",
        ["-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-tune", "grain",
         "-x264-params", "keyint=60:min-keyint=60:scenecut=0",
         "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"],
        sdr_path,
    )
    for n in range(n0, n1):
        h, s = frame(n / lib.FPS, n)
        hdr.stdin.write(np.ascontiguousarray(h).astype("<u2").tobytes())
        if sdr:
            sdr.stdin.write(np.ascontiguousarray(s).tobytes())
    for p in (hdr, sdr):
        if p:
            p.stdin.close()
            p.wait()
    return i


def video(a, b, workers):
    n0, n1 = round(a * lib.FPS), round(b * lib.FPS)
    parts = BUILD / "parts"
    parts.mkdir(parents=True, exist_ok=True)
    for p in parts.glob("*.*"):
        p.unlink()
    size = 60  # two seconds per chunk, aligned to keyframes
    jobs = []
    for k, s in enumerate(range(n0, n1, size)):
        jobs.append((k, s, min(n1, s + size), parts / f"{k:04d}-hdr.mp4", parts / f"{k:04d}-sdr.mp4"))
    t0 = time.time()
    with ProcessPoolExecutor(workers) as ex:
        for done, _ in enumerate(ex.map(chunk, jobs), 1):
            el = time.time() - t0
            print(f"chunk {done}/{len(jobs)}  {el:.0f}s elapsed, ~{el / done * (len(jobs) - done):.0f}s left", flush=True)
    full = a == 0 and abs(b - timeline.EDIT.total) < 1e-6
    kinds = (("sdr", 4),) if lib.PREVIEW else (("hdr", 3), ("sdr", 4)) if WITH_SDR else (("hdr", 3),)
    for kind, col in kinds:
        lst = parts / f"list-{kind}.txt"
        lst.write_text("".join(f"file '{j[col].name}'\n" for j in jobs))
        out = BUILD / (f"picture-{kind}.mp4" if full else f"picture-{kind}-{a:g}-{b:g}.mp4")
        tag = ["-tag:v", "hvc1"] if kind == "hdr" else []
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", *tag, str(out)], check=True)
        print(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["stills", "sheet", "video"])
    ap.add_argument("times", nargs="*", type=float)
    ap.add_argument("--from", dest="a", type=float, default=0.0)
    ap.add_argument("--to", dest="b", type=float, default=timeline.EDIT.total)
    ap.add_argument("--hdr-stats", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 8) - 4))
    o = ap.parse_args()
    if o.cmd == "stills":
        stills(o.times)
    elif o.cmd == "sheet":
        sheet(*(o.times or [0, timeline.EDIT.total, 2]))
    else:
        video(o.a, o.b, o.workers)
