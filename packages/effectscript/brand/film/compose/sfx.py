"""Foley synthesised from the picture's own events.

scenes.EVENTS lists every keystroke, stamp, blip and transition with its time,
so each sound is placed on the exact frame that caused it. Output:
build/sfx.wav (48 kHz stereo float → 24-bit)."""

import sys
import wave
from pathlib import Path

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).parent))
import scenes  # noqa: E402

SR = 48000
DUR = 160.0
OUT = Path(__file__).resolve().parent.parent / "build" / "sfx.wav"
rng = np.random.default_rng(42)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def highpass(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="high", fs=SR, output="sos"), x)


def sine(f, n, f_end=None):
    f_end = f if f_end is None else f_end
    freq = np.geomspace(f, f_end, n)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def key(strength, deep=False, light=False):
    """A mechanical key: the click of the switch and the thock of the case."""
    n = int(0.09 * SR)
    pitch = rng.uniform(0.85, 1.15)
    click = bandpass(rng.standard_normal(n), 2500 * pitch, 7000 * pitch) * env(n, 0.0003, 0.004)
    body_f = (140 if deep else 230) * pitch
    body = sine(body_f, n, body_f * 0.8) * env(n, 0.001, 0.028 if deep else 0.018)
    clack = bandpass(rng.standard_normal(n), 900, 2200) * env(n, 0.0008, 0.010)
    x = 0.55 * click + (0.9 if deep else 0.6) * body + 0.35 * clack
    if light:
        x = 0.7 * click + 0.15 * body
    return x * strength * rng.uniform(0.75, 1.0)


def stamp(strength):
    n = int(0.45 * SR)
    sub = sine(95, n, 42) * env(n, 0.002, 0.11)
    hit = lowpass(rng.standard_normal(n), 3500) * env(n, 0.0005, 0.018)
    ring = bandpass(rng.standard_normal(n), 380, 520, 4) * env(n, 0.001, 0.09) * 3
    return (1.0 * sub + 0.5 * hit + 0.25 * ring) * strength


def shimmer(strength):
    """The morph: a rising airy sweep scattered with glassy sparkles."""
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep by blending bandpassed slices
    centers = np.geomspace(1200, 9000, 12)
    for i, cf in enumerate(centers):
        band = bandpass(noise, cf * 0.85, cf * 1.15)
        w = np.exp(-(((t / 1.3) * 12 - i) ** 2) / 4.0)
        out += band * w
    out *= 0.35 * np.sin(np.pi * np.clip(t / 1.4, 0, 1)) ** 2
    for _ in range(26):
        st = int(rng.uniform(0.15, 1.3) * SR)
        f = rng.choice([1174.66, 1479.98, 1760.0, 2349.32, 2959.96, 3520.0])  # D major sparkle
        m = int(0.35 * SR)
        if st + m < n:
            out[st : st + m] += sine(f, m) * env(m, 0.002, 0.08) * rng.uniform(0.05, 0.14)
    return out * strength


def whoosh(strength, length=1.0):
    n = int(length * SR)
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    lo = lowpass(noise, 600)
    mid = bandpass(noise, 600, 3500)
    shape = np.sin(np.pi * t**0.7) ** 2
    mixk = t
    return (lo * (1 - mixk) * 0.8 + mid * mixk * 0.6) * shape * strength


def chime(strength, notes=(880.0, 1174.66)):
    n = int(1.4 * SR)
    out = np.zeros(n)
    for i, f in enumerate(notes):
        d = int(i * 0.07 * SR)
        m = n - d
        tone = sine(f, m) + 0.3 * sine(f * 2.01, m) + 0.12 * sine(f * 3.02, m)
        out[d:] += tone * env(m, 0.003, 0.45)
    return out * 0.3 * strength


def pop(strength):
    n = int(0.12 * SR)
    return sine(1100, n, 600) * env(n, 0.001, 0.03) * 0.5 * strength


def error_buzz(strength):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    sq = np.sign(np.sin(2 * np.pi * 110 * t)) + 0.5 * np.sign(np.sin(2 * np.pi * 116.5 * t))
    return lowpass(sq, 900) * env(n, 0.004, 0.08) * 0.35 * strength


def blip(strength):
    n = int(0.18 * SR)
    return (sine(587.33, n) + 0.4 * sine(880, n)) * env(n, 0.002, 0.05) * 0.4 * strength


def vibrate(strength):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    gate = ((t < 0.22) | ((t > 0.36) & (t < 0.58))).astype(float)
    gate = lowpass(gate, 60)
    rumble = sine(155, n) * (0.6 + 0.4 * np.sin(2 * np.pi * 31 * t))
    rattle = bandpass(rng.standard_normal(n), 150, 700) * 0.6
    return (rumble + rattle) * gate * 0.5 * strength


def glitch(strength):
    n = int(rng.uniform(0.02, 0.05) * SR)
    x = rng.standard_normal(n)
    x = np.round(x * 3) / 3  # bit-crushed
    x = bandpass(x, rng.uniform(300, 1500), rng.uniform(3000, 9000))
    return x * env(n, 0.0005, 0.02) * 0.6 * strength


# ---------------------------------------------------------------- recorded sources

LIBDIR = Path(__file__).resolve().parent.parent / "sfx"


def _read(name):
    with wave.open(str(LIBDIR / f"{name}.wav")) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, w.getnchannels()).astype(np.float32) / 32768
    x = x.mean(axis=1) if x.ndim == 2 else x
    return x / max(np.abs(x).max(), 1e-6)


def _slices(name, min_gap=0.08, max_len=0.22):
    """Cut a take of separated hits (keystrokes) into one-shots at its onsets."""
    x = _read(name)
    env = signal.sosfilt(signal.butter(2, 40, fs=SR, output="sos"), np.abs(signal.hilbert(x)))
    hop = SR // 200
    d = np.maximum(np.diff(env[::hop]), 0)
    peaks, _ = signal.find_peaks(d, height=d.max() * 0.18, distance=int(min_gap * 200))
    on = peaks * hop
    out = []
    for i, a in enumerate(on):
        a = max(0, a - SR // 400)
        b = min(len(x), on[i + 1] - SR // 400 if i + 1 < len(on) else a + int(max_len * SR), a + int(max_len * SR))
        hit = x[a:b].copy()
        if len(hit) < SR // 50:
            continue
        hit *= np.minimum(1, np.linspace(0, 40, len(hit)))[:]  # 0.5 ms fade-in
        tail = min(len(hit), SR // 60)
        hit[-tail:] *= np.linspace(1, 0, tail)
        out.append(hit / max(np.abs(hit).max(), 1e-6))
    return out


KEYS = _slices("keys-a") + _slices("keys-b")
SPACES = _slices("spacebar", min_gap=0.15, max_len=0.3)
ONESHOT = {n: _read(n) for n in ["enter", "stamp", "whoosh", "longwhoosh", "swish", "buzz", "error", "retry"]}
GLITCH = _read("glitch")
_last = {"k": -1}


def resample(x, ratio):
    n = max(8, int(len(x) / ratio))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def real_key(strength, pool=None, light=False):
    pool = pool or KEYS
    i = int(rng.integers(len(pool)))
    if i == _last["k"]:
        i = (i + 1) % len(pool)
    _last["k"] = i
    x = resample(pool[i], rng.uniform(0.96, 1.04)) * rng.uniform(0.75, 1.0) * strength
    if light:
        x = highpass(x, 1800) * 0.8
    return x


def real(name, strength, pitch=0.0):
    x = ONESHOT[name]
    if pitch:
        x = resample(x, 2 ** (rng.uniform(-pitch, pitch) / 12))
    return x * strength


def real_glitch(strength):
    n = int(rng.uniform(0.03, 0.07) * SR)
    a = int(rng.integers(0, len(GLITCH) - n))
    g = GLITCH[a : a + n].copy()
    g *= np.linspace(1, 0.3, n)
    return g * strength


VOICES = {
    "key": lambda s: real_key(s),
    "space": lambda s: real_key(s, SPACES),
    "tick": lambda s: real_key(s, light=True),
    "enter": lambda s: real("enter", s),
    "stamp": lambda s: real("stamp", s, pitch=2.0),
    "morph": shimmer,
    "whoosh": lambda s: real("whoosh", s),
    "longwhoosh": lambda s: real("longwhoosh", s),
    "swish": lambda s: real("swish", s, pitch=1.5),
    "success": chime,
    "chip": pop,
    "error": lambda s: real("error", s),
    "retry": lambda s: real("retry", s),
    "buzz": lambda s: real("buzz", s),
    "glitch": real_glitch,
}
LEVEL = {
    "key": 0.16,
    "space": 0.15,
    "tick": 0.07,
    "enter": 0.3,
    "stamp": 0.38,
    "morph": 0.16,
    "whoosh": 0.22,
    "longwhoosh": 0.3,
    "swish": 0.14,
    "success": 0.45,
    "chip": 0.22,
    "error": 0.3,
    "retry": 0.35,
    "buzz": 0.5,
    "glitch": 0.3,
}

# continuous beds under the picture: (source, start, end, gain, fade in, fade out)
BEDS = [
    ("rain", 11.2, 16.2, 0.10, 1.2, 0.5),  # the night desk: rain on the window
    ("paper", 38.0, 41.0, 0.32, 0.05, 1.0),  # the paper avalanche
    ("cables", 40.0, 54.0, 0.20, 2.0, 0.0),  # the tangle strains and tightens (cut dead at 54)
]


def bed(name, start, end, gain, fin, fout, n):
    x = _read(name)
    length = int((end - start) * SR)
    if len(x) < length:
        x = np.tile(x, length // len(x) + 1)
    x = x[:length] * gain
    e = np.ones(length, np.float32)
    if fin:
        k = int(fin * SR)
        e[:k] = np.linspace(0, 1, k) ** 2
    if fout:
        k = int(fout * SR)
        e[-k:] *= np.linspace(1, 0, k) ** 2
    if name == "cables":
        e *= np.linspace(0.5, 1.4, length)  # tightens as the tangle grows
    out = np.zeros(n)
    a = int(start * SR)
    out[a : a + length] = x * e
    return out


def main():
    n = int(DUR * SR)
    mix = np.zeros((n, 2))
    for t, kind, strength in scenes.EVENTS:
        x = VOICES[kind](strength) * LEVEL[kind]
        start = int(round(t * SR))
        end = min(n, start + len(x))
        if start >= n:
            continue
        pan = rng.uniform(-0.25, 0.25) if kind in ("key", "space", "tick", "stamp", "glitch") else 0.0
        if kind == "longwhoosh":
            # sweep left to right as the wall pulls away
            pan_curve = np.linspace(-0.5, 0.5, end - start)
        else:
            pan_curve = np.full(end - start, pan)
        mix[start:end, 0] += x[: end - start] * np.sqrt(0.5 - pan_curve / 2) * 1.414
        mix[start:end, 1] += x[: end - start] * np.sqrt(0.5 + pan_curve / 2) * 1.414
    for spec in BEDS:
        b = bed(*spec, n)
        mix[:, 0] += b
        mix[:, 1] += b
    # a small room so the Foley sits in the same space as the score
    ir_n = int(0.6 * SR)
    ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / (0.12 * SR))[:, None]
    ir = highpass(ir.T, 300).T
    ir /= np.abs(ir).sum(axis=0) ** 0.5 * 12
    wet = np.stack([signal.oaconvolve(mix[:, c], ir[:, c])[:n] for c in range(2)], axis=1)
    out = mix + 0.35 * wet
    # the hard cut: nothing may ring into the silence
    out[int(54.0 * SR) : int(56.0 * SR)] = 0
    peak = np.abs(out).max()
    if peak > 0.98:
        out *= 0.98 / peak
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(out, -1, 1) * (2**23 - 1)).astype(np.int32)
    raw = np.zeros((n, 2, 3), np.uint8)
    for b in range(3):
        raw[..., b] = (pcm >> (8 * b)) & 0xFF
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw.tobytes())
    print(OUT, f"{len(scenes.EVENTS)} events, peak {peak:.3f}")


if __name__ == "__main__":
    main()
