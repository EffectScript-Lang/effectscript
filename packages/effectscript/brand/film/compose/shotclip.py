"""Review clip for one Blender shot: its EXR sequence through the film's SDR
grade at 1080p, plus a mid-shot still.

  shotclip.py <shot> [<shot> …]  →  build/deliver/shot-<shot>-1080p.mp4 and .jpg"""

import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402


def sdr(lin):
    x = lin.copy()
    hi = x > 0.8
    x[hi] = 0.8 + 0.2 * np.tanh((x[hi] - 0.8) / 0.2)
    return (np.clip(lib.srgb_encode(np.clip(x, 0, 1)), 0, 1) * 255 + 0.5).astype(np.uint8)


def clip(shot):
    src = lib.FILM / "build" / "blender" / shot
    frames = sorted(p for p in src.glob("*.exr") if p.stem.isdigit())
    out = lib.FILM / "build" / "deliver"
    out.mkdir(parents=True, exist_ok=True)
    mp4 = out / f"shot-{shot}-1080p.mp4"
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1920x1080", "-r", "30",
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         str(mp4)],
        stdin=subprocess.PIPE,
    )
    peak = 0.0
    for i, p in enumerate(frames):
        lin = lib._read_exr(p)
        peak = max(peak, float(lin.max()))
        img = sdr(lin)[::2, ::2]
        if i == len(frames) // 2:
            subprocess.run(
                ["magick", "-size", "1920x1080", "-depth", "8", "rgb:-", "-quality", "92", str(out / f"shot-{shot}.jpg")],
                input=np.ascontiguousarray(img).tobytes(),
                check=True,
            )
        ff.stdin.write(np.ascontiguousarray(img).tobytes())
    ff.stdin.close()
    ff.wait()
    print(f"{shot}: {len(frames)} frames, peak {peak:.2f} linear → {mp4}")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        clip(s)
