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


def main():
    anchor, bar = bar_grid(kicks())
    r = 2.0 / bar  # stretched time = original time * r
    print(f"Suno grid: first downbeat {anchor:.3f}s, bar {bar:.4f}s = {240 / bar:.3f} BPM; stretch x{r:.5f}")
    suno = load(SUNO, speed=1 / r)
    mine = load(BUILD / "score.wav")
    fx = load(BUILD / "stems" / "fx.wav")
    A = anchor * r  # Suno's drums-in downbeat, stretched

    # match Suno's groove to the synthesised tech section's loudness
    g = 10 ** ((lufs(mine[int(84 * SR) : int(120 * SR)]) - lufs(suno[int(A * SR) : int((A + 36) * SR)])) / 20)
    print(f"Suno gain {20 * np.log10(g):+.1f} dB")

    out = np.zeros((int(DUR * SR), 2), np.float32)
    # synthesised: cold open, ceremony, the dead stop, the question, 3:07 AM
    place(out, mine, 0.0, 12.8, 0.0, 0.0, 0.8)
    place(out, mine, 30.0, 70.0, 30.0, 0.05, 0.01)
    place(out, mine, 126.0, 144.3, 126.0, 0.01, 0.3)
    # the impact at 70: the synthesised boom and reversed cymbal, without its theme
    fx_gain = np.abs(mine[int(69.9 * SR) : int(70.5 * SR)]).max() / max(np.abs(fx[int(69.9 * SR) : int(70.5 * SR)]).max(), 1e-6)
    place(out, fx, 70.0, 74.0, 70.0, 0.0, 2.5, gain=fx_gain * 0.9)
    # Suno: the promise (its piano intro), the groove from the impact, the finale
    place(out, suno, 12.0, 30.6, 0.0, 0.02, 1.0, gain=g * 0.85)
    place(out, suno, 70.0, 92.0, A, 0.0, 0.02, gain=g)
    jump = A + 20 * 2.0  # 20 bars later in Suno: its guitar and brass peak lands on the 104–118 climax
    place(out, suno, 92.0, 126.0, jump, 0.02, 0.03, gain=g)
    last_note = (154.48 * r)  # Suno's final piano note, stretched
    place(out, suno, 144.0, 160.0, last_note - 12.0, 0.25, 1.3, gain=g)
    # nothing in the film's silence or after the end
    out[int(54.0 * SR) : int(56.0 * SR)] = 0
    out[int(159.8 * SR) :] = 0
    peak = np.abs(out).max()
    if peak > 0.98:
        out *= 0.98 / peak
    write(BUILD / "music.wav", out)
    print(BUILD / "music.wav", f"peak {peak:.2f}, {lufs(out):.1f} LUFS")


if __name__ == "__main__":
    main()
