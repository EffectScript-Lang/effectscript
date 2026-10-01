"""Place the narrator on the picture.

Takes one ElevenLabs export with every line read in order (build/audio-in/
vo-timeline.*), finds the gaps between lines, cuts it into the lines of
prompts/voiceover-script.csv, and places each line at its start time.

Writes build/vo.wav (160 s) and build/duck.wav, a gain envelope for the music
that dips under the voice. Reports any line that overruns the next one."""

import csv
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import ndimage

FILM = Path(__file__).resolve().parent.parent
SR = 48000
DUR = 160.0
DUCK_DB = -7.0


def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def write(path, x):
    pcm = (np.clip(x, -1, 1) * (2**23 - 1)).astype(np.int32)
    raw = np.zeros(pcm.shape + (3,), np.uint8)
    for b in range(3):
        raw[..., b] = (pcm >> (8 * b)) & 0xFF
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw.tobytes())


def segments(x, n):
    """Split into n lines at the n-1 longest silences."""
    mono = np.abs(x).mean(axis=1)
    hop = SR // 100  # 10 ms
    env = np.array([mono[i : i + hop].max() for i in range(0, len(mono), hop)])
    floor = max(env.max() * 10 ** (-42 / 20), 1e-5)
    voiced = ndimage.binary_closing(env > floor, structure=np.ones(8))  # bridge < 80 ms gaps
    labels, count = ndimage.label(voiced)
    spans = ndimage.find_objects(labels)
    spans = [(s[0].start, s[0].stop) for s in spans if s[0].stop - s[0].start >= 8]
    if len(spans) < n:
        raise SystemExit(f"found {len(spans)} voiced regions, expected {n}: lower the gap threshold or check the export")
    gaps = sorted(range(len(spans) - 1), key=lambda i: spans[i + 1][0] - spans[i][1], reverse=True)[: n - 1]
    cuts = sorted(gaps)
    out, start = [], 0
    for g in cuts + [len(spans) - 1]:
        a, b = spans[start][0], spans[g][1]
        out.append((max(0, a * hop - SR // 50), min(len(x), b * hop + SR // 10)))  # 20 ms pre-roll, 100 ms tail
        start = g + 1
    return out


def trim(clip, floor_db=-45):
    """Trim leading and trailing silence, keeping a short breath either side."""
    env = np.abs(clip).max(axis=1)
    on = np.nonzero(env > env.max() * 10 ** (floor_db / 20))[0]
    if not len(on):
        return clip
    return clip[max(0, on[0] - SR // 40) : min(len(clip), on[-1] + SR // 8)]


def clips(cues):
    """One clip per cue: ElevenLabs Studio's numbered per-paragraph export, or
    a single timeline export split at its gaps."""
    numbered = sorted(
        (FILM / "build" / "audio-in").glob("ElevenLabs_*/*_Chapter_*.wav"), key=lambda p: int(p.name.split("_")[0])
    )
    if len(sys.argv) <= 1 and len(numbered) == len(cues):
        return [trim(load(p)) for p in numbered], numbered[0].parent.name
    src = [Path(sys.argv[1])] if len(sys.argv) > 1 else sorted((FILM / "build" / "audio-in").glob("vo-timeline.*"))
    if not src:
        raise SystemExit("no voice export found in build/audio-in")
    x = load(src[0])
    return [x[a:b].copy() for a, b in segments(x, len(cues))], src[0].name


def main():
    cues = list(csv.DictReader(open(FILM / "prompts" / "voiceover-script.csv")))
    parts, source = clips(cues)
    print(f"{len(parts)} lines from {source}")
    out = np.zeros((int(DUR * SR), 2), np.float32)
    report = []
    for i, (clip, cue) in enumerate(zip(parts, cues)):
        fade = min(len(clip) // 4, SR // 100)
        ramp = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
        clip[:fade] *= ramp
        clip[-fade:] *= ramp[::-1]
        start = int(float(cue["start_time"]) * SR)
        end = start + len(clip)
        out[start : min(end, len(out))] += clip[: len(out) - start]
        nxt = float(cues[i + 1]["start_time"]) if i + 1 < len(cues) else DUR
        over = end / SR - nxt
        report.append((float(cue["start_time"]), len(clip) / SR, over, cue["line"]))
    # nothing may sound in the film's silence
    out[int(54.0 * SR) : int(56.0 * SR)] = 0
    peak = np.abs(out).max()
    out *= 10 ** (-3 / 20) / max(peak, 1e-6)  # voice peaks at -3 dBFS before the final limiter
    write(FILM / "build" / "vo.wav", out)
    # music gain: dip under the voice with a 60 ms attack and 450 ms release
    env = np.abs(out).mean(axis=1)
    hop = SR // 100
    active = np.array([env[i : i + hop].max() for i in range(0, len(env), hop)]) > 10 ** (-40 / 20)
    active = ndimage.binary_dilation(active, structure=np.ones(25))  # bridge words and hold 250 ms
    target = np.where(active, 10 ** (DUCK_DB / 20), 1.0)
    g, gain = 1.0, np.empty_like(target)
    for i, v in enumerate(target):
        k = 1 - np.exp(-10 / (60 if v < g else 450))
        g += (v - g) * k
        gain[i] = g
    duck = np.repeat(gain, hop)[: len(out)].astype(np.float32)
    write(FILM / "build" / "duck.wav", np.stack([duck, duck], axis=1) * 0.999)
    for st, d, over, line in report:
        flag = f"  OVERRUNS next line by {over:.2f}s" if over > 0 else ""
        print(f"{st:7.1f}s  {d:5.2f}s  {line[:70]}{flag}")
    print(FILM / "build" / "vo.wav")


if __name__ == "__main__":
    sys.exit(main())
