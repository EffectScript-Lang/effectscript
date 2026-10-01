"""Conform the Suno score to the picture and join it with the synthesised score.

Suno (build/audio-in/EffectScript Score.wav, about 118.7 BPM) is time-stretched
so its bars are exactly 2 s, the film's grid, then cut on bar lines into the
acts where its energy fits. The synthesised score (build/score.wav) keeps the
acts Suno didn't write: the cold open, the ceremony and its dead stop, the
question, and 3:07 AM. Writes build/music.wav (160 s, 48 kHz stereo)."""

import io
import subprocess
import wave
from pathlib import Path

import mido
import numpy as np

FILM = Path(__file__).resolve().parent.parent
BUILD = FILM / "build"
SUNO = BUILD / "audio-in" / "EffectScript Score.wav"
MIDI = BUILD / "audio-in" / "EffectScript Score MIDI" / "EffectScript Score (Drums).mid"
SR = 48000
DUR = 160.0


def load(path, speed=1.0):
    af = [] if speed == 1.0 else ["-af", f"atempo={speed:.6f}"]
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), *af, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
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


def kicks():
    """Kick times from Suno's drum MIDI (its key-signature events are invalid, so blank them)."""
    b = bytearray(MIDI.read_bytes())
    i = 0
    while (i := b.find(b"\xff\x59\x02", i)) >= 0:
        b[i + 3] = b[i + 4] = 0
        i += 5
    t, out = 0.0, []
    for msg in mido.MidiFile(file=io.BytesIO(bytes(b))):
        t += msg.time
        if msg.type == "note_on" and msg.velocity > 0 and msg.note in (35, 36):
            out.append(t)
    return np.array(out)


def bar_grid(k):
    """Least-squares bar length from kicks that sit on downbeats (whole bars from the first kick)."""
    bar = 2.02
    for _ in range(3):
        n = np.round((k - k[0]) / bar)
        on = np.abs((k - k[0]) - n * bar) < 0.06 * bar
        n, d = n[on], (k - k[0])[on]
        bar = float(np.sum(n * d) / np.sum(n * n))
    return k[0], bar


def env(n, fade_in, fade_out):
    e = np.ones(n, np.float32)
    a, b = int(fade_in * SR), int(fade_out * SR)
    if a:
        e[:a] = np.linspace(0, 1, a) ** 2
    if b:
        e[-b:] *= np.linspace(1, 0, b) ** 2
    return e[:, None]


def place(out, src, film_t0, film_t1, src_t0, fade_in=0.01, fade_out=0.01, gain=1.0):
    """Copy src[src_t0 …] onto out[film_t0 … film_t1] (seconds in the stretched/film timebase)."""
    a, b = int(film_t0 * SR), int(film_t1 * SR)
    s = int(src_t0 * SR)
    seg = src[s : s + (b - a)]
    seg = seg * env(len(seg), fade_in, fade_out) * gain
    out[a : a + len(seg)] += seg


def lufs(x):
    p = subprocess.run(
        ["ffmpeg", "-hide_banner", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", "-af", "ebur128", "-f", "null", "-"],
        input=x.astype(np.float32).tobytes(),
        capture_output=True,
    ).stderr.decode()
    return float(p.rsplit("I:", 1)[1].split("LUFS")[0])


def automate(x, t0, points):
    """Piecewise-linear gain over a clip; points are (film seconds, gain)."""
    t = t0 + np.arange(len(x)) / SR
    ts, gs = zip(*points)
    return x * np.interp(t, ts, gs).astype(np.float32)[:, None]


def sweep_lowpass(x, t0, points, block=1024):
    """Time-varying 2nd-order low-pass; points are (film seconds, cutoff Hz)."""
    from scipy import signal

    out = np.empty_like(x)
    zi = np.zeros((2, 1, 2))  # per channel: (sections, 2)
    ts, fs = zip(*points)
    for i in range(0, len(x), block):
        fc = float(np.interp(t0 + i / SR, ts, fs))
        if fc >= 19000:
            out[i : i + block] = x[i : i + block]
            zi[:] = 0
            continue
        sos = signal.butter(2, fc, fs=SR, output="sos")
        for c in range(2):
            out[i : i + block, c], zi[c] = signal.sosfilt(sos, x[i : i + block, c], zi=zi[c])
    return out


def main():
    anchor, bar = bar_grid(kicks())
    r = 2.0 / bar  # stretched time = original time * r
    print(f"Suno grid: first downbeat {anchor:.3f}s, bar {bar:.4f}s = {240 / bar:.3f} BPM; stretch x{r:.5f}")
    suno = load(SUNO, speed=1 / r)
    mine = load(BUILD / "score.wav")
    drums = load(BUILD / "stems" / "drums.wav")  # the clock tick lives here
    fx = load(BUILD / "stems" / "fx.wav")  # risers, the impact, room tone
    A = anchor * r  # Suno's drums-in downbeat, stretched

    g = 10 ** ((lufs(mine[int(84 * SR) : int(120 * SR)]) - lufs(suno[int(A * SR) : int((A + 36) * SR)])) / 20)
    stem_gain = 10 ** (8 / 20)  # the stems were written 8 dB under the master
    print(f"Suno gain {20 * np.log10(g):+.1f} dB")

    out = np.zeros((int(DUR * SR), 2), np.float32)

    def put(src, film_t0, film_t1, src_t0, fin=0.01, fout=0.01, gain=1.0, auto=None, lp=None):
        a, b = int(film_t0 * SR), int(film_t1 * SR)
        s0 = int(src_t0 * SR)
        seg = src[s0 : s0 + (b - a)].copy() * env(min(b - a, len(src) - s0), fin, fout) * gain
        if lp:
            seg = sweep_lowpass(seg, film_t0, lp)
        if auto:
            seg = automate(seg, film_t0, auto)
        out[a : a + len(seg)] += seg

    # 0–7.4 room tone; Suno's first piano note lands as getUser(id) finishes typing
    put(mine, 0.0, 8.4, 0.0, 0.0, 0.6)
    start = 40.0 - A  # Suno's drums land on the tangle cut, on the film's bar grid
    print(f"Suno enters at {start:.2f}s")
    # 7.4–54: the promise flows into the ceremony; the ceremony muffles, then the drums break the tangle open
    put(
        suno, start, 54.0, 0.0, 0.0, 0.004, g,
        auto=[(start, 0.62), (12.0, 0.85), (29.0, 0.85), (31.0, 0.7), (39.9, 0.62), (40.0, 0.95), (50.0, 1.0), (54.0, 1.05)],
        lp=[(start, 20000), (30.0, 20000), (31.0, 6000), (37.5, 650), (39.95, 520), (40.0, 20000)],
    )
    put(drums, 30.0, 54.0, 30.0, 0.05, 0.004, stem_gain * 0.9)  # the clock
    put(fx, 38.0, 54.0, 38.0, 0.5, 0.004, stem_gain * 0.9)  # the riser into the dead stop
    # 56–70: the question stays synthesised (its chords sit inside Suno's key)
    put(mine, 56.0, 70.0, 56.0, 0.0, 0.01)
    fx_gain = np.abs(mine[int(69.9 * SR) : int(70.5 * SR)]).max() / max(np.abs(fx[int(69.9 * SR) : int(70.5 * SR)]).max(), 1e-6)
    put(fx, 70.0, 74.0, 70.0, 0.0, 2.5, fx_gain * 0.9)  # the impact
    # 70–126: Suno's groove from the brass entrance; its guitar and brass peaks land on 96–117
    put(suno, 70.0, 126.0, A + 20.0, 0.0, 0.03, g)
    # 126–144: 3:07 AM. Suno's opening piano returns, distant and filtered, under the clock
    put(
        suno, 126.0, 144.4, 0.0, 0.25, 0.4, g,
        auto=[(126.0, 0.42), (136.5, 0.42), (138.0, 0.6), (144.4, 0.6)],
        lp=[(126.0, 2200), (136.5, 2200), (138.5, 9000), (144.4, 9000)],
    )
    put(drums, 126.0, 137.5, 126.0, 0.05, 1.0, stem_gain * 0.8)
    # 144–160: Suno's own ending; its last piano note lands on 156
    last_note = 154.48 * r
    put(suno, 144.0, 160.0, last_note - 12.0, 0.25, 1.3, g)
    out[int(54.0 * SR) : int(56.0 * SR)] = 0
    out[int(159.8 * SR) :] = 0
    peak = np.abs(out).max()
    if peak > 0.98:
        out *= 0.98 / peak
    write(BUILD / "music.wav", out)
    print(BUILD / "music.wav", f"peak {peak:.2f}, {lufs(out):.1f} LUFS")


if __name__ == "__main__":
    main()
