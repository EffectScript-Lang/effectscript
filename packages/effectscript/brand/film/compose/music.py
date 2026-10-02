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

import timeline

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

    # Every placement is anchored to a cue in the edit (timeline.json): e() maps
    # an authored cue time onto the edited film. Music is never time-stretched
    # to the edit; it is re-placed so its key moments land on the moved cues.
    e = timeline.EDIT.to_edit
    dur = timeline.EDIT.total
    out = np.zeros((int(dur * SR) + SR, 2), np.float32)

    def put(src, film_t0, film_t1, src_t0, fin=0.01, fout=0.01, gain=1.0, auto=None, lp=None):
        if film_t1 <= film_t0:
            return
        a, b = int(film_t0 * SR), int(film_t1 * SR)
        s0 = int(src_t0 * SR)
        n = min(b - a, len(src) - s0)
        seg = src[s0 : s0 + n].copy() * env(n, fin, fout) * gain
        if lp:
            seg = sweep_lowpass(seg, film_t0, lp)
        if auto:
            seg = automate(seg, film_t0, auto)
        out[a : a + len(seg)] += seg

    def tail_aligned(src, src_a, src_b, film_end, film_floor, **kw):
        """Place src[src_a, src_b) so that src_b lands on film_end, starting no earlier than film_floor."""
        start = max(film_floor, film_end - (src_b - src_a))
        put(src, start, film_end, src_b - (film_end - start), **kw)

    # cold open: room tone (looped from the fx stem if the opening got longer)
    put(mine, 0.0, min(e(8.4), 8.4), 0.0, 0.0, 0.6)
    if e(8.4) > 8.4:
        put(fx, 7.8, e(8.4), 0.5, 0.6, 0.6, stem_gain)
    start = e(40.0) - A  # Suno's drums land on the tangle cut
    print(f"Suno enters at {start:.2f}s")
    # the promise flows into the ceremony; the ceremony muffles, then the drums break the tangle open
    put(
        suno, max(0.0, start), e(54.0), max(0.0, -start), 0.0, 0.004, g,
        auto=[(start, 0.62), (e(12.0), 0.85), (e(29.0), 0.85), (e(31.0), 0.7), (e(39.9), 0.62), (e(40.0), 0.95), (e(50.0), 1.0), (e(54.0), 1.05)],
        lp=[(start, 20000), (e(30.0), 20000), (e(31.0), 6000), (e(37.5), 650), (e(39.95), 520), (e(40.0), 20000)],
    )
    tail_aligned(drums, 30.0, 54.0, e(54.0), e(30.0), fin=0.05, fout=0.004, gain=stem_gain * 0.9)  # the clock
    tail_aligned(fx, 38.0, 54.0, e(54.0), e(38.0), fin=0.5, fout=0.004, gain=stem_gain * 0.9)  # riser into the dead stop
    # the question stays synthesised; its swell resolves exactly on the impact
    tail_aligned(mine, 56.0, 70.0, e(70.0), e(56.0), fin=0.0, fout=0.01)
    fx_gain = np.abs(mine[int(69.9 * SR) : int(70.5 * SR)]).max() / max(np.abs(fx[int(69.9 * SR) : int(70.5 * SR)]).max(), 1e-6)
    put(fx, e(70.0), e(70.0) + 4.0, 70.0, 0.0, 2.5, fx_gain * 0.9)  # the impact
    # Suno's groove from the brass entrance, cut dead on the 3 AM drop
    put(suno, e(70.0), e(126.0), A + 20.0, 0.0, 0.03, g)
    # 3:07 AM: Suno's opening piano returns, distant and filtered, under the clock
    put(
        suno, e(126.0), e(144.0) + 0.4, 0.0, 0.25, 0.4, g,
        auto=[(e(126.0), 0.42), (e(136.5), 0.42), (e(138.0), 0.6), (e(144.0) + 0.4, 0.6)],
        lp=[(e(126.0), 2200), (e(136.5), 2200), (e(138.5), 9000), (e(144.0) + 0.4, 9000)],
    )
    put(drums, e(126.0), e(126.0) + 11.5, 126.0, 0.05, 1.0, stem_gain * 0.8)
    # finale: Suno's own ending, its last piano note on the end card
    last_note = 154.48 * r
    put(suno, e(144.0), dur, last_note - (e(156.0) - e(144.0)), 0.25, 1.3, g)
    out[int(e(54.0) * SR) : int(e(56.0) * SR)] = 0
    out[int((dur - 0.2) * SR) :] = 0
    out = out[: int(dur * SR)]
    peak = np.abs(out).max()
    if peak > 0.98:
        out *= 0.98 / peak
    write(BUILD / "music.wav", out)
    print(BUILD / "music.wav", f"peak {peak:.2f}, {lufs(out):.1f} LUFS")


if __name__ == "__main__":
    main()
