#!/usr/bin/env python3
"""Measure the rendered score: duration, silent windows, loudness per section, peaks, onsets.

    uv run --with numpy --with scipy python analyze.py [path/to/score.wav]
"""
import os
import subprocess
import sys

import numpy as np
from scipy import signal as sps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import BUILD, FEATURE_CUTS, IMPACT, LABEL_ACCENTS, SR, TAGLINE_ACCENTS, hz, lufs, n  # noqa: E402

SECTIONS = [(0, 8.5, "cold open"), (8.5, 12, "first note"), (12, 24, "promise"), (24, 30, "promise opens"),
            (30, 46, "ceremony"), (46, 54, "ceremony peak"), (56, 68, "question"), (68, 76, "introducing"),
            (76, 80, "settle"), (80, 88, "language half-time"), (88, 104, "language"), (104, 112, "language climax"),
            (112, 126, "language out"), (126, 137, "3:07 AM"), (137, 144, "dawn"), (144, 156, "finale"),
            (156, 159.8, "last note")]


def read_wav24(path):
    raw = open(path, "rb").read()
    i = raw.index(b"data")
    size = int.from_bytes(raw[i + 4:i + 8], "little")
    b = np.frombuffer(raw[i + 8:i + 8 + size], np.uint8).reshape(-1, 3)
    v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
    v = np.where(v >= 1 << 23, v - (1 << 24), v)
    return v.reshape(-1, 2).T.astype(np.float64) / 8388608.0, v.reshape(-1, 2).T


def db(x):
    return 20 * np.log10(max(x, 1e-12))


def onset(x, t, band=None, win=0.04):
    """First 0.5 ms frame near t whose energy jumps 10 dB above the 30 ms before it."""
    a, b = int((t - win) * SR), int((t + win) * SR)
    mono = x[:, a - 9600:b].mean(axis=0)
    if band == "low":
        mono = sps.sosfilt(sps.butter(4, 200, "lowpass", fs=SR, output="sos"), mono)
    elif isinstance(band, (int, float)):
        mono = sps.sosfilt(sps.butter(2, [band / 1.12, band * 1.12], "bandpass", fs=SR, output="sos"), mono)
    elif band == "high":
        mono = sps.sosfilt(sps.butter(2, 1000, "highpass", fs=SR, output="sos"), mono)
    seg = mono[9600:]
    fr = 24
    e = (seg[: seg.size // fr * fr].reshape(-1, fr) ** 2).mean(axis=1) + 1e-14
    pre = 60
    for k in range(pre, e.size):
        if e[k] > 10 * e[k - pre:k - 2].mean():
            return (a + k * fr) / SR - t
    return float("nan")


def main(path):
    x, ints = read_wav24(path)
    print(f"file: {path}")
    print(f"samples: {x.shape[1]}  duration: {x.shape[1] / SR:.6f} s  channels: {x.shape[0]}")
    for a, b in ((54.0, 56.0), (159.8, 160.0)):
        w = ints[:, int(a * SR):int(b * SR)]
        print(f"zeros {a:.1f}-{b:.1f}: {'all zero' if not w.any() else f'NONZERO ({np.count_nonzero(w)} samples)'}")
    last = np.nonzero(np.abs(ints[:, : int(54 * SR)]).max(axis=0))[0][-1]
    first = int(56 * SR) + np.nonzero(np.abs(ints[:, int(56 * SR):]).max(axis=0))[0][0]
    print(f"last nonzero before cut: {last / SR:.6f} s; first nonzero after: {first / SR:.6f} s")
    print(f"DC offset L/R: {x[0].mean():.2e} {x[1].mean():.2e}")
    print(f"sample peak: {db(np.abs(x).max()):.2f} dBFS")
    up = sps.resample_poly(x, 4, 1, axis=1)
    print(f"true peak (4x): {db(np.abs(up).max()):.2f} dBTP")
    print(f"integrated loudness (own BS.1770): {lufs(x):.2f} LUFS")
    print("\nsection                 LUFS(int)  max-short-term  peak")
    for a, b, name in SECTIONS:
        seg = x[:, int(a * SR):int(b * SR)]
        st = []
        for t0 in np.arange(a, b - 3 + 1e-9, 0.5):
            st.append(lufs(x, t0, t0 + 3))
        mst = max(st) if st else lufs(x, a, b)
        print(f"{name:22s} {a:6.1f}-{b:5.1f}  {lufs(x, a, b):7.1f}  {mst:9.1f}  {db(np.abs(seg).max()):7.1f}")
    print("\nonsets (measured - scheduled, ms):")
    pings = [hz(n(p)) for p in ("B6", "C#7", "D7", "F#7", "E7", "D7", "B6", "D7")]
    checks = [(8.5, None), (38.0, "low"), (46.0, "low"), (56.0, None), (IMPACT, "low"), (IMPACT, None)]
    checks += [(f, None) for f in FEATURE_CUTS] + list(zip(FEATURE_CUTS, pings))
    checks += [(f, hz(n("D7"))) for f in TAGLINE_ACCENTS] + [(156.0, hz(n("D5")))]
    for t, band in checks:
        label = f"{band:.0f} Hz" if isinstance(band, float) else (band or "full")
        print(f"  {t:7.3f} ({label:>8s}): {onset(x, t, band) * 1000:+6.1f}")
    # clicks: sample-to-sample jumps far beyond local signal slope
    d = np.abs(np.diff(x, axis=1)).max(axis=0)
    print(f"\nmax sample-to-sample step: {d.max():.3f} at {np.argmax(d) / SR:.3f} s")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    summ = r.stderr[r.stderr.rfind("Summary:"):]
    print("\nffmpeg ebur128" + summ.replace("\n\n", "\n"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(BUILD, "score.wav"))
