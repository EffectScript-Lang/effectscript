#!/usr/bin/env python3
"""Introducing EffectScript: the score, synthesised sample by sample.

    uv run --with numpy --with scipy python score.py

Writes ../build/score.wav (stereo, 48 kHz, 24-bit, exactly 160.000 s) and
../build/stems/{piano,pads,drums,bass,fx}.wav.

No samples, no recordings. Every sound below is a function: a felt piano built
from inharmonic partials, detuned saw ensembles for pads and strings, sine-sweep
drums, filtered-noise risers, synthesised reverb impulse responses.

Key: D major / B minor, 120 BPM, 4/4 (beat 0.5 s, bar 2.0 s).

The motif ("the one line"), six notes over two bars, Bm then G:

    B4 (dotted quarter)  C#5 (eighth)  D5 (half) | F#5 (half)  E5 (quarter)  D5 (quarter)

It starts on the relative minor and ends on the tonic D: the line begins as a
question and lands at home. It is heard alone (first note, 8.5 s), as the theme
(12 s), inverted and detuned in the ceremony (B A G E F# G), stuck in a loop
before the cut, in D major at the impact (D E F# A G F#), as a 16th-note pluck
arpeggio in the technical section, and its last note, D5, is the final sound.
"""
from __future__ import annotations

import os
import struct
import sys
import time

import numpy as np
from scipy import signal as sps
from scipy.ndimage import minimum_filter1d, uniform_filter1d

# ============================================================================
# Timeline. Everything below is placed on this grid, sample-accurately.
# ============================================================================

SR = 48_000
LENGTH = 160.0
N = int(round(LENGTH * SR))  # 7,680,000
BPM = 120
BEAT = 60.0 / BPM  # 0.5 s
BAR = 4 * BEAT  # 2.0 s

CUT_AT, CUT_UNTIL = 54.0, 56.0  # the silence: true digital zeros
SILENT_FROM = 159.8  # the end: true digital zeros
CUT0, CUT1 = int(CUT_AT * SR), int(CUT_UNTIL * SR)
END0 = int(SILENT_FROM * SR)

# (start, end, act, how it is realised)
CUES = [
    (0.0, 8.5, "Cold open", "room tone (filtered noise) and a faint 55 Hz hum; nothing melodic"),
    (8.5, 12.0, "First note", "B4 alone on felt piano, the first note of the motif, long decay"),
    (12.0, 30.0, "The promise", "piano theme Bm-G-D-A; pad from 16; label accents 16/18/20/22; "
     "24-28 the motif in D major (it opens up); 28-30 Asus4, unresolved"),
    (30.0, 54.0, "The ceremony", "clock tick per beat, 8ths at 38, 16ths at 46; sub pulse; piano "
     "ostinato; motif inverted and detuned; clusters; 38 sub drop; 40 widen; 46 hit; 50-54 riser"),
    (54.0, 56.0, "Silence", "true zeros, no tail"),
    (56.0, 68.0, "The question", "one high B5, long reverb; 58-68 pad + bowed strings + reversed piano swell"),
    (68.0, 80.0, "Introducing", "68 whoosh; 70 impact + theme in D major; settle 76-80"),
    (80.0, 126.0, "The language", "120 BPM: half-time kick 80, four-on-the-floor 88, hats, claps, "
     "side-chained pad, sub bass, motif pluck in 16ths; accents on feature cuts; 104-112 climax"),
    (126.0, 144.0, "3:07 AM", "groove stops; piano + soft tick; 131 G - A/G - F#m - Bm; 137 D with strings"),
    (144.0, 156.0, "Finale", "full theme, strings + piano + soft drums; accents 145, 147.5; cadence 154"),
    (156.0, 160.0, "Last note", "D5 alone, rings out; silence from 159.8"),
]

LABEL_ACCENTS = [16.0, 18.0, 20.0, 22.0]
FEATURE_CUTS = [80.0, 86.0, 92.0, 98.0, 104.0, 112.0, 117.0, 122.0]
TAGLINE_ACCENTS = [145.0, 147.5]
IMPACT = 70.0

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.normpath(os.path.join(HERE, "..", "build"))
TT = np.arange(N) / SR  # global time axis

# ============================================================================
# Pitch
# ============================================================================

_PC = dict(C=0, D=2, E=4, F=5, G=7, A=9, B=11)


def n(name):
    """'C#5' -> MIDI number (A4 = 69). Ints pass through."""
    if isinstance(name, (int, np.integer)):
        return int(name)
    i, acc = 1, 0
    while name[i] in "#b":
        acc += 1 if name[i] == "#" else -1
        i += 1
    return 12 * (int(name[i:]) + 1) + _PC[name[0]] + acc


def ns(s):
    return [n(x) for x in s.split()]


def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


SCALE = [m for m in range(12, 120) if m % 12 in (2, 4, 6, 7, 9, 11, 1)]  # D major


def dia(root, steps):
    """Move `steps` scale degrees in D major from `root`."""
    return SCALE[SCALE.index(n(root)) + steps]


# The motif: (beat, note, beats). Two bars.
MOTIF = [(0.0, "B4", 1.5), (1.5, "C#5", 0.5), (2.0, "D5", 2.0), (4.0, "F#5", 2.0), (6.0, "E5", 1.0), (7.0, "D5", 1.0)]
MOTIF_STEPS = [0, 1, 2, 4, 3, 2]  # scale degrees from the first note
# Same shape on D: the motif in the major (the superpower).
MOTIF_MAJOR = [(b, dia("D5", s), d) for (b, _, d), s in zip(MOTIF, MOTIF_STEPS)]
# Diatonic inversion around B4: B A G E F# G (the ceremony).
MOTIF_INV = [(b, dia("B4", -s), d) for (b, _, d), s in zip(MOTIF, MOTIF_STEPS)]
# The answer phrase over D - A (half cadence).
ANSWER = [(1.0, "A4", 1.0), (2.0, "D5", 1.0), (3.0, "E5", 1.0), (4.0, "C#5", 3.0)]

# Pad / string voicings
PAD = {
    "Bm": "B2 F#3 B3 D4 F#4",
    "G": "G2 D3 B3 D4 F#4",
    "D": "D3 A3 D4 F#4 A4",
    "A": "A2 E3 A3 C#4 E4",
    "Asus4": "A2 E3 A3 D4 E4",
    "Em": "E2 B2 G3 B3 D4",
    "F#": "F#2 C#3 A#3 C#4 E4",
    "F#m": "F#2 C#3 A3 C#4 E4",
    "A/G": "G2 E3 A3 C#4 E4",
    "A/C#": "C#3 E3 A3 C#4 E4",
    "Gmaj7/D": "D3 G3 B3 D4 F#4",
    "D/F#": "F#2 A3 D4 F#4 A4",
    "Gmaj9": "G2 D3 A3 B3 F#4",
    "Em9": "E2 B2 F#3 G3 D4",
    # the ceremony: seconds pile up as it thickens
    "Bm+": "B2 F#3 C#4 D4 E4 F#4",
    "G+": "G2 D3 A3 B3 C#4 F#4",
    "Em+": "E2 B2 F#3 G3 A3 D4",
    "F#+": "F#2 C#3 G3 A#3 C#4 E4",
}
ROOT = {
    "Bm": "B1", "G": "G1", "D": "D2", "A": "A1", "Asus4": "A1", "Em": "E1", "F#": "F#1", "F#m": "F#1",
    "A/G": "G1", "A/C#": "C#2", "Gmaj7/D": "D2", "D/F#": "F#1", "Gmaj9": "G1", "Em9": "E1",
    "Bm+": "B1", "G+": "G1", "Em+": "E1", "F#+": "F#1",
}
# Felt-piano left hand: bass then three tones above
LH = {
    "Bm": "B2 F#3 B3 D4", "G": "G2 D3 G3 B3", "D": "D2 A2 F#3 A3", "A": "A2 E3 A3 C#4",
    "Asus4": "A2 E3 A3 D4", "F#m": "F#2 C#3 A3 C#4", "A/G": "G2 E3 A3 C#4",
    "Gmaj7/D": "D2 A2 G3 B3", "D/F#": "F#2 D3 A3 D4", "Em": "E2 B2 E3 G3", "A/C#": "C#3 E3 A3 C#4",
}

# ============================================================================
# DSP helpers
# ============================================================================


def T(sec):
    return np.arange(int(round(sec * SR))) / SR


def butter(kind, f, order=2):
    return sps.butter(order, f, btype=kind, fs=SR, output="sos")


def filt(x, sos):
    return sps.sosfilt(sos, x, axis=-1)


def rbj(kind, f, q=0.707, gain_db=0.0):
    """RBJ cookbook biquad -> (b, a)."""
    w = 2 * np.pi * min(f, SR * 0.45) / SR
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    if kind == "lp":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "hp":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "bp":
        b = [al, 0.0, -al]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "peak":
        A = 10 ** (gain_db / 40)
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    else:
        raise ValueError(kind)
    b, a = np.array(b), np.array(a)
    return b / a[0], a / a[0]


def peq(f, gain_db, q=1.0):
    b, a = rbj("peak", f, q, gain_db)
    return np.hstack([b, a])[None, :]


def tv_filter(x, fc, kind="lp", q=0.707, block=256, stages=1):
    """Time-varying biquad (cascade of `stages`), coefficients updated per block."""
    x = np.atleast_2d(x)
    y = np.zeros_like(x)
    zi = np.zeros((x.shape[0], stages, 2))
    qs = [0.5412, 1.3066] if (stages == 2 and kind == "lp") else [q] * stages
    for i in range(0, x.shape[1], block):
        j = min(x.shape[1], i + block)
        seg = x[:, i:j]
        if not seg.any() and not zi.any():
            continue
        seg = seg.copy()
        for st in range(stages):
            b, a = rbj(kind, float(fc[i]), qs[st])
            for ch in range(x.shape[0]):
                seg[ch], zi[ch, st] = sps.lfilter(b, a, seg[ch], zi=zi[ch, st])
        y[:, i:j] = seg
        if abs(zi).max() < 1e-9:
            zi[:] = 0.0
    return y


def pan2(x, p):
    th = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.vstack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2)


def env_ar(L, att, dur, rel, curve_att=True):
    """Raised-cosine attack, hold until `dur`, exponential release reaching -40 dB at `rel`."""
    t = np.arange(L) / SR
    a = np.clip(t / max(att, 1e-4), 0, 1)
    a = 0.5 - 0.5 * np.cos(np.pi * a) if curve_att else a
    r = np.where(t < dur, 1.0, np.exp(-(t - dur) / max(rel / 4.6, 1e-4)))
    e = a * r
    k = min(L, int(0.01 * SR))
    e[L - k:] *= np.linspace(1, 0, k)
    return e


def taper(x, a=0.0005, r=0.004):
    x = np.array(x, dtype=np.float64, copy=True)
    L = x.shape[-1]
    ka, kr = min(L, int(a * SR)), min(L, int(r * SR))
    if ka:
        x[..., :ka] *= np.linspace(0, 1, ka)
    if kr:
        x[..., L - kr:] *= np.linspace(1, 0, kr)
    return x


def smooth_noise(L, rate, rng):
    k = max(2, int(L / SR * rate) + 2)
    pts = rng.standard_normal(k)
    return np.interp(np.linspace(0, k - 1, L), np.arange(k), pts)


def osc_phase(f, rng):
    inc = f / SR
    return (rng.random() + np.cumsum(inc)) % 1.0, inc


def blep_saw(ph, inc):
    """Band-limited sawtooth (polyBLEP)."""
    s = 2 * ph - 1
    m = ph < inc
    x = ph[m] / inc[m]
    s[m] -= x + x - x * x - 1
    m = ph > 1 - inc
    x = (ph[m] - 1) / inc[m]
    s[m] -= x * x + x + x + 1
    return s


def auto(keys):
    """Piecewise-linear automation over the whole film."""
    ts, vs = zip(*keys)
    return np.interp(TT, ts, vs).astype(np.float32)


def accel_times(t0, t1, r0, r1):
    """Event times whose rate rises exponentially from r0 to r1 events/s."""
    Tn = t1 - t0
    k = r1 / r0
    lk = np.log(k)
    total = r0 * Tn * (k - 1) / lk
    i = np.arange(int(total))
    return t0 + Tn * np.log1p(i * lk / (r0 * Tn)) / lk


# ============================================================================
# Buses
# ============================================================================


class Bus:
    """A stereo stem: dry signal plus a reverb send. Nothing from before the cut survives it."""

    def __init__(self, name):
        self.name = name
        self.dry = np.zeros((2, N), np.float32)
        self.send = np.zeros((2, N), np.float32)

    def add(self, t, x, gain=1.0, pan=0.0, send=0.0):
        x = np.asarray(x, dtype=np.float64)
        if x.ndim == 1:
            x = pan2(x, pan)
        elif pan:
            x = x * np.array([[min(1.0, 1 - pan)], [min(1.0, 1 + pan)]])
        i0 = int(round(t * SR))
        if CUT0 <= i0 < CUT1:
            raise ValueError(f"{self.name}: event at {t:.3f}s lands inside the silence")
        if i0 < 0:
            x, i0 = x[:, -i0:], 0
        i1 = min(N, i0 + x.shape[1])
        if i0 < CUT0 < i1:
            i1 = CUT0
        seg = (x[:, : i1 - i0] * gain).astype(np.float32)
        self.dry[:, i0:i1] += seg
        if send:
            self.send[:, i0:i1] += seg * send


def segmentwise(x, fn):
    """Apply fn independently before and after the silence so nothing leaks across it."""
    y = np.zeros_like(x)
    for a, b in ((0, CUT0), (CUT1, N)):
        r = fn(x[:, a:b])
        y[:, a:b] = r[:, : b - a]
    return y


def convolve(x, ir):
    return np.vstack([sps.oaconvolve(x[c].astype(np.float64), ir[c])[: x.shape[1]] for c in range(2)])


# ============================================================================
# Reverb impulse responses (synthesised)
# ============================================================================


def make_ir(rt_low, rt_mid, rt_high, length, predelay, seed, er=10, er_span=0.06, build=0.015):
    """Stereo IR: decorrelated, band-wise exponentially decaying noise + early reflections."""
    rng = np.random.default_rng(seed)
    L = int(length * SR)
    t = np.arange(L) / SR
    ir = np.zeros((2, L))
    bands = [(None, 250, rt_low), (250, 1200, rt_mid), (1200, 4500, (rt_mid + rt_high) / 2), (4500, None, rt_high)]
    for ch in range(2):
        nz = rng.standard_normal(L)
        for lo, hi, rt in bands:
            if lo is None:
                b = filt(nz, butter("lowpass", hi, 4))
            elif hi is None:
                b = filt(nz, butter("highpass", lo, 4))
            else:
                b = filt(nz, butter("bandpass", [lo, hi], 2))
            ir[ch] += b * np.exp(-6.91 * t / rt)
    ir *= 1 - np.exp(-t / build)  # diffuse density builds up
    ir *= 0.5 - 0.5 * np.cos(np.pi * np.clip((L - np.arange(L)) / (0.15 * L), 0, 1))  # tail fade to 0
    ir /= np.sqrt((ir**2).sum(axis=1, keepdims=True))
    # early reflections, lowpassed so they are not glassy
    erb = np.zeros((2, int(er_span * SR) + 64))
    for ch in range(2):
        for _ in range(er):
            d = rng.uniform(0.004, er_span)
            erb[ch, int(d * SR)] += rng.choice([-1, 1]) * 0.55 * np.exp(-d / 0.035) * rng.uniform(0.5, 1)
    erb = filt(erb, butter("lowpass", 5500, 2))
    ir[:, : erb.shape[1]] += erb * 0.6
    pd = int(predelay * SR)
    ir = np.hstack([np.zeros((2, pd)), ir])
    return ir / np.sqrt((ir**2).sum(axis=1, keepdims=True))


# ============================================================================
# Instruments
# ============================================================================

# ---------------------------------------------------------------- felt piano


def _piano_ring(m, vel, detune, spread, seed):
    """One struck key, undamped: stiff-string partials, 1-3 detuned strings, felt hammer noise."""
    rng = np.random.default_rng(seed)
    f0 = hz(m + detune / 100.0)
    B = float(np.clip(3e-4 * 2 ** ((m - 60) / 9), 3e-5, 0.02))  # inharmonicity
    t60 = float(np.clip(30 * 2 ** (-(m - 21) / 18), 1.2, 26.0))  # fundamental T60
    r1 = 6.91 / t60
    fc = 450 + 3600 * vel**1.5  # felt: soft hammer, brightness follows velocity
    fmax = min(15000.0, 7 * fc + 2 * f0)
    nstr = 1 if m < 32 else 2 if m < 45 else 3
    cents = spread * np.array([0.0, -1.0, 1.15])[:nstr] * rng.uniform(0.5, 1.3, nstr)
    spos = np.array([0.0, -0.4, 0.4])[:nstr]
    w = 0.16  # aftersound (slow second decay) weight
    L = int(min(12.0, np.log(w / 2e-4) / (0.3 * r1) + 0.2) * SR)
    t = np.arange(L) / SR
    out = np.zeros((2, L))
    for k in range(1, 70):
        fk = k * f0 * np.sqrt(1 + B * k * k)
        if fk > fmax:
            break
        a = k**-0.55 / (1 + (fk / fc) ** 2) * (0.4 + 0.6 * abs(np.sin(np.pi * k * 0.122)))
        if a < 3e-4:
            continue
        rk = r1 * (1 + 0.07 * (k - 1)) + 1.3e-6 * fk * fk
        n_ = min(L, int(np.log(a / 2e-5) / (0.3 * rk) * SR))
        if n_ < 256:
            continue
        tt = t[:n_]
        env = a * ((1 - w) * np.exp(-1.3 * rk * tt) + w * np.exp(-0.3 * rk * tt)) / nstr
        for s in range(nstr):
            osc = np.sin(2 * np.pi * fk * 2 ** (cents[s] / 1200) * tt + rng.uniform(0, 2 * np.pi)) * env
            th = (spos[s] * 0.6 + 1) * np.pi / 4
            out[0, :n_] += osc * np.cos(th) * 1.414
            out[1, :n_] += osc * np.sin(th) * 1.414
    ta = 0.0018 + 0.006 * (1 - vel)  # soft felt attack
    out *= 1 - np.exp(-t / ta)
    out /= np.abs(out).max() + 1e-12
    # hammer / key-bed noise: low thump + felt brush, close-miked
    nh = min(L, int(0.15 * SR))
    th_ = t[:nh]
    nz = rng.standard_normal((2, nh))
    thump = filt(nz, butter("bandpass", [35, 180 + 120 * vel])) * np.exp(-th_ / 0.035)
    felt = filt(nz[:, ::-1], butter("bandpass", [350, 900 + 2600 * vel])) * np.exp(-th_ / 0.009)
    thump /= np.abs(thump).max() + 1e-12
    felt /= np.abs(felt).max() + 1e-12
    low = np.clip((72 - m) / 36, 0.2, 1.0)
    ham = (0.07 * low * thump + 0.035 * (0.3 + vel) * felt) * (1 - np.exp(-th_ / 0.0012))
    out[:, :nh] += ham
    return out


class FeltPiano:
    def __init__(self):
        self.cache = {}

    def note(self, m, vel, dur, detune=0.0, spread=1.0):
        vq = max(0.05, round(vel * 20) / 20)
        key = (m, vq, int(round(detune)), round(spread, 1))
        if key not in self.cache:
            seed = (m * 7919 + int(vq * 20) * 131 + int(round(detune)) * 17 + int(spread * 10)) & 0x7FFFFFFF
            self.cache[key] = _piano_ring(m, vq, detune, spread, seed)
        r = self.cache[key]
        tau = 3.0 if m >= 89 else 0.26 - 0.16 * np.clip((m - 30) / 58, 0, 1)  # dampers
        L = min(r.shape[1], int((dur + 7 * tau) * SR))
        x = r[:, :L].copy()
        i = int(dur * SR)
        if i < L:
            x[:, i:] *= np.exp(-(np.arange(L - i) / SR) / tau)
        return taper(x, 0, 0.005)


def sympathetic_ir(seconds=3.0, seed=11):
    """Sustain pedal: every undamped string rings in sympathy with what is played."""
    rng = np.random.default_rng(seed)
    L = int(seconds * SR)
    t = np.arange(L) / SR
    ir = np.zeros((2, L))
    for m in range(28, 97):
        f0 = hz(m)
        B = float(np.clip(3e-4 * 2 ** ((m - 60) / 9), 3e-5, 0.02))
        r = 6.91 / float(np.clip(30 * 2 ** (-(m - 21) / 18), 1.2, 26.0))
        for k in range(1, 7):
            fk = k * f0 * np.sqrt(1 + B * k * k)
            if fk > 6000:
                break
            a = np.exp(-fk / 2500) / k
            e = a * np.exp(-r * (1 + 0.15 * k) * t)
            for ch in range(2):
                ir[ch] += np.sin(2 * np.pi * fk * (1 + rng.normal(0, 3e-4)) * t + rng.uniform(0, 6.28)) * e
    ir *= 1 - np.exp(-t / 0.04)
    ir[:, -int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))
    return ir / np.sqrt((ir**2).sum(axis=1, keepdims=True))


# ---------------------------------------------------------------- synth pad


def pad_voice(m, dur, vel, att=2.0, rel=2.5, voices=3, width=0.6, seed=0):
    """Detuned saw + PWM-pulse ensemble. Filtering happens on the pad bus (moving cutoff)."""
    rng = np.random.default_rng(seed)
    L = int((dur + rel) * SR)
    t = np.arange(L) / SR
    f0 = hz(m)
    out = np.zeros((2, L))
    for v in range(voices):
        c = (v - (voices - 1) / 2) * 9 + rng.normal(0, 2)
        f = f0 * 2 ** ((c + 3 * smooth_noise(L, 0.4, rng)) / 1200)
        ph, inc = osc_phase(f, rng)
        s = blep_saw(ph, inc)
        ph2 = (ph + 0.5 + 0.18 * np.sin(2 * np.pi * (0.17 + 0.06 * v) * t + rng.uniform(0, 6.28))) % 1.0
        x = 0.6 * s + 0.25 * (s - blep_saw(ph2, inc))
        p = width * (v / (voices - 1) * 2 - 1) if voices > 1 else 0.0
        out += pan2(x, p)
    if m < 50:  # a little sine body an octave down, mono
        out += 0.2 * np.sin(2 * np.pi * f0 / 2 * t)[None, :]
    return out * env_ar(L, att, dur, rel) * vel / voices


# ---------------------------------------------------------------- bowed strings

STRING_EQ = np.vstack([peq(260, 2.5, 0.9), peq(1100, 1.5, 1.2), peq(3300, -4.0, 0.8)])


def bowed(m, dur, vel, att=0.6, rel=1.2, voices=5, vib=8.0, width=0.6, bright=1.0, trem=None, seed=0, bow=0.6):
    """Bowed-string ensemble: detuned saws, delayed vibrato, bow noise, body EQ, brightness with dynamics."""
    rng = np.random.default_rng(seed)
    L = int((dur + rel) * SR)
    t = np.arange(L) / SR
    f0 = hz(m)
    out = np.zeros((2, L))
    onset = np.clip((t - 0.25) / 0.9, 0, 1)
    for v in range(voices):
        c = (v - (voices - 1) / 2) * 5 + rng.normal(0, 2.5)
        vr = 5.2 + rng.uniform(-0.5, 0.5)
        vb = vib * onset * np.sin(2 * np.pi * vr * t + rng.uniform(0, 6.28))
        f = f0 * 2 ** ((c + vb + 2.5 * smooth_noise(L, 0.8, rng)) / 1200)
        ph, inc = osc_phase(f, rng)
        p = width * (v / (voices - 1) * 2 - 1) if voices > 1 else 0.0
        out += pan2(blep_saw(ph, inc), p)
    env = env_ar(L, att, dur, rel)
    if trem is not None:  # trem: callable t -> rate in Hz
        rate = trem(t)
        out *= 0.55 + 0.45 * np.cos(2 * np.pi * np.cumsum(rate) / SR)
    nz = filt(rng.standard_normal((2, L)), butter("bandpass", [1800, 6500])) * 0.05 * bow
    dark = filt(out, butter("lowpass", 700 + 700 * bright, 2))
    lit = filt(out, butter("lowpass", 2200 + 2600 * bright, 2))
    wgt = np.clip(env * vel * 1.3, 0, 1) ** 1.3
    y = filt(dark * (1 - wgt) + lit * wgt, STRING_EQ) + nz
    return y * env * vel / np.sqrt(voices)


# ---------------------------------------------------------------- pluck


def pluck(m, vel, bright=1.0, length=0.7, seed=0):
    """Plucked synth: additive partials whose decay rate rises with partial number."""
    rng = np.random.default_rng(seed)
    t = T(length)
    f0 = hz(m)
    out = np.zeros((2, t.size))
    for v, (c, p) in enumerate([(-6, -0.35), (6, 0.35)]):
        f = f0 * 2 ** (c / 1200)
        x = np.zeros(t.size)
        for k in range(1, 40):
            fk = k * f
            if fk > 12000:
                break
            x += k**-1.1 * np.exp(-t * (5 + 2.4 * k / bright)) * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28))
        out += pan2(x, p)
    return taper(out, 0.0015, 0.02) * vel * 0.35


# ---------------------------------------------------------------- drums


def kick(vel=1.0, decay=0.3):
    t = T(0.8)
    f = 44 + 115 * np.exp(-t / 0.032) + 260 * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
    click = filt(np.random.default_rng(1).standard_normal(t.size), butter("highpass", 1500)) * np.exp(-t / 0.0025) * 0.3
    x = np.tanh(1.6 * (body + click)) / np.tanh(1.6)
    return taper(x, 0.0006, 0.05) * vel


_HAT_F = 333 * np.array([1.0, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637])
_HAT_HP = butter("highpass", 7000, 4)
AIR_LP = butter("lowpass", 13500, 2)  # real metal and air fall away above ~14 kHz; flat noise reads as digital


def hat(vel=1.0, decay=0.035, length=0.3, seed=0):
    rng = np.random.default_rng(seed)
    t = T(length)
    metal = sum(sum(np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) / h for h in (1, 3, 5)) for f in _HAT_F)
    nz = rng.standard_normal((2, t.size))
    x = filt(filt(0.35 * metal[None, :] / 6 + nz, _HAT_HP), AIR_LP) * np.exp(-t / decay)
    return taper(x, 0.0004, 0.01) * vel * 0.5


def shaker(vel=1.0, seed=0):
    rng = np.random.default_rng(seed)
    t = T(0.12)
    env = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.035)
    x = filt(rng.standard_normal((2, t.size)), butter("bandpass", [5500, 11000])) * env
    return taper(x, 0.001, 0.01) * vel * 0.6


def clap(vel=1.0, seed=0):
    rng = np.random.default_rng(seed)
    t = T(0.45)
    env = np.zeros(t.size)
    for d in (0.0, 0.009, 0.019):
        u = t - d
        env += np.where(u >= 0, np.clip(u / 0.0004, 0, 1) * np.exp(-np.maximum(u, 0) / 0.0045), 0)
    u = t - 0.026
    env += 0.55 * np.where(u >= 0, np.clip(u / 0.002, 0, 1) * np.exp(-np.maximum(u, 0) / 0.12), 0)
    x = filt(rng.standard_normal((2, t.size)), butter("bandpass", [850, 2800])) * env
    return taper(x, 0.0003, 0.02) * vel * 0.8


def tom(f0, vel=1.0, decay=0.45, seed=0):
    rng = np.random.default_rng(seed)
    t = T(decay * 5)
    f = f0 * (1 + 0.6 * np.exp(-t / 0.05))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
    skin = filt(rng.standard_normal(t.size), butter("lowpass", 1800)) * np.exp(-t / 0.025) * 0.35
    return taper(np.tanh(1.3 * (body + skin)), 0.0008, 0.05) * vel


def cymbal(length=4.0, vel=1.0, decay=1.4, seed=0):
    rng = np.random.default_rng(seed)
    t = T(length)
    metal = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) for f in 520 * np.array([1, 1.41, 1.87, 2.39, 2.93, 3.71, 4.37, 5.13, 6.03, 7.21]))
    nz = rng.standard_normal((2, t.size))
    x = filt(nz + 0.15 * metal[None, :], butter("highpass", 3500, 2))
    x = filt(filt(x, peq(7500, 3, 0.7)), AIR_LP)
    return taper(x * np.exp(-t / decay), 0.001, 0.2) * vel * 0.25


def tick(tock=False, vel=0.5, seed=0):
    """Mechanical clock: resonant escapement click + wooden case."""
    rng = np.random.default_rng(seed)
    t = T(0.09)
    fs = [2500, 4300, 6600] if tock else [3100, 5200, 7900]
    ring = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, d in zip(fs, (0.010, 0.006, 0.0035))) / 3
    click = filt(rng.standard_normal(t.size), butter("bandpass", [2500, 9000])) * np.exp(-t / 0.0012)
    case = np.sin(2 * np.pi * (820 if tock else 980) * t) * np.exp(-t / 0.016) * 0.45
    return taper(0.6 * ring + 0.35 * click + case, 0.0002, 0.01) * vel


# ---------------------------------------------------------------- bass


def sub(m, dur, vel, decay=0.3):
    t = T(dur + 0.08)
    f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t)
    e = np.exp(-t / decay) * (1 - np.exp(-t / 0.004))
    e *= np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.02))
    return taper(np.tanh(1.2 * x * e), 0, 0.01) * vel


def bass(m, dur, vel, cutoff=280, drive=2.2, seed=0):
    rng = np.random.default_rng(seed)
    t = T(dur + 0.06)
    f = np.full(t.size, hz(m))
    ph, inc = osc_phase(f, rng)
    x = np.sin(2 * np.pi * ph) * 0.9 + 0.45 * filt(blep_saw(ph, inc), butter("lowpass", cutoff, 4))
    e = (1 - np.exp(-t / 0.003)) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.018)) * (0.75 + 0.25 * np.exp(-t / 0.15))
    return taper(np.tanh(drive * x * e) / np.tanh(drive), 0, 0.01) * vel


# ---------------------------------------------------------------- fx


def room_tone(length, seed=3):
    rng = np.random.default_rng(seed)
    t = T(length)
    nz = rng.standard_normal((2, t.size))
    nz = filt(nz, butter("lowpass", 900, 2)) + 0.3 * filt(nz, butter("lowpass", 180, 2))
    hum = (np.sin(2 * np.pi * 55 * t) + 0.45 * np.sin(2 * np.pi * 110 * t + 1) + 0.2 * np.sin(2 * np.pi * 165 * t + 2))
    hum *= 1 + 0.15 * np.sin(2 * np.pi * 0.11 * t)
    return nz * 0.004 + hum[None, :] * 0.0012


def noise_sweep(length, f0, f1, curve=2.5, q=1.2, seed=5):
    rng = np.random.default_rng(seed)
    t = T(length)
    u = t / length
    fc = f0 * (f1 / f0) ** (u**curve)
    x = tv_filter(rng.standard_normal((2, t.size)), fc, "bp", q)
    x += 0.25 * tv_filter(rng.standard_normal((2, t.size)), fc * 1.8, "hp", 0.7)
    return filt(x, AIR_LP) * (0.03 + 0.97 * u**3)


def shepard(length, octaves=2.0, curve=2.0, base=40.0, center=700.0, sigma=1.1, seed=7):
    rng = np.random.default_rng(seed)
    t = T(length)
    u = t / length
    phi = octaves * u**curve
    out = np.zeros((2, t.size))
    for k in range(9):
        f = base * 2 ** (k + phi)
        a = np.exp(-0.5 * (np.log2(f / center) / sigma) ** 2)
        for ch, det in enumerate((0.997, 1.003)):
            ph = 2 * np.pi * np.cumsum(f * det) / SR + rng.uniform(0, 6.28)
            out[ch] += a * (np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph))
    return out * (0.02 + 0.98 * u**2.5) / 3


def whoosh(length=1.8, peak=0.45, f_lo=350, f_hi=6000, pan0=-0.85, pan1=0.85, seed=9):
    """Air moving past: band-passed noise that brightens and pans with its swell."""
    rng = np.random.default_rng(seed)
    t = T(length)
    u = t / length
    bell = np.where(u < peak, (u / peak) ** 2, ((1 - u) / (1 - peak)) ** 1.5)
    bell = np.sin(np.pi / 2 * bell) ** 2
    fc = f_lo * (f_hi / f_lo) ** bell
    x = tv_filter(rng.standard_normal(t.size), fc, "bp", 1.6)[0] + 0.4 * tv_filter(rng.standard_normal(t.size), fc * 0.5, "lp", 0.7)[0]
    p = pan0 + (pan1 - pan0) * (0.5 - 0.5 * np.cos(np.pi * u))
    th = (p + 1) * np.pi / 4
    return taper(np.vstack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2) * bell, 0.01, 0.05)


def reverse_swell(length, seed=13):
    """A reversed cymbal (with its own air) that ends exactly at its end."""
    c = cymbal(length + 0.3, 1.0, decay=length / 3.2, seed=seed)
    x = c[:, ::-1][:, -int(length * SR):]
    return taper(x, 0.05, 0.002)


def sub_drop(length=2.6, f_hi=95, f_lo=29, seed=0):
    t = T(length)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.55)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (length / 3.2)) * (1 - np.exp(-t / 0.004))
    return taper(np.tanh(1.5 * x), 0, 0.1)


def impact(seed=21):
    """70.0: sub boom + tom body + crack + air."""
    rng = np.random.default_rng(seed)
    t = T(6.0)
    f = 31 + 52 * np.exp(-t / 0.35)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 2.0)
    f2 = 68 + 90 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f2) / SR) * np.exp(-t / 0.42)
    crack = filt(rng.standard_normal(t.size), butter("lowpass", 3200)) * np.exp(-t / 0.018)
    mono = np.tanh(1.4 * (0.9 * boom + 0.7 * body + 0.5 * crack))
    air = filt(filt(rng.standard_normal((2, t.size)), butter("highpass", 1800, 2)), AIR_LP) * np.exp(-t / 1.4) * 0.12
    x = mono[None, :] + air
    return taper(x * (1 - np.exp(-t / 0.0006)), 0, 0.3)


def glass(m, length=1.4, seed=0):
    """A small bell: inharmonic sine partials, used for accent pings."""
    rng = np.random.default_rng(seed)
    t = T(length)
    f = hz(m)
    x = sum(a * np.exp(-t / d) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6.28))
            for r, a, d in ((1, 1, 0.9), (2.0, 0.35, 0.45), (2.76, 0.25, 0.3), (5.4, 0.08, 0.12)))
    return taper(x * (1 - np.exp(-t / 0.0008)), 0, 0.05)


def accent(m, size=1.0, seed=0):
    """Feature-cut accent: a glass ping, a hiss of air and a small sub tap. Transient at sample 0."""
    rng = np.random.default_rng(seed)
    t = T(1.4)
    ping = glass(m, 1.4, seed)
    shh = filt(rng.standard_normal((2, t.size)), butter("bandpass", [3500, 12000])) * np.exp(-t / 0.07) * (1 - np.exp(-t / 0.0008))
    tap = np.sin(2 * np.pi * (52 + 40 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.12) * (1 - np.exp(-t / 0.001))
    return (0.5 * ping[None, :] + 0.35 * shh + 0.6 * size * tap[None, :]) * size


# ============================================================================
# The arrangement
# ============================================================================

piano = FeltPiano()
B = {k: Bus(k) for k in ("piano", "pads", "drums", "bass", "fx")}
PADRAW = Bus("padraw")  # unfiltered pad oscillators; filtered as a bus with moving cutoff
KICKS = []  # kick times, for side-chain
EVENTS = {}  # name -> list of times, for the report


def mark(name, t):
    EVENTS.setdefault(name, []).append(t)


def P(t, note, vel, dur, detune=0.0, spread=1.0, send=0.18, gain=1.0):
    m = n(note)
    x = piano.note(m, vel, dur, detune, spread)
    B["piano"].add(t, x, gain=gain * 0.98 * vel**1.6, pan=float(np.clip((m - 62) / 44, -0.45, 0.45)), send=send)


def bar_end(t, grid=BAR):
    return (np.floor(t / grid + 1e-9) + 1) * grid


def phrase(t0, items, vel, transpose=0):
    """[(beat, note, beats)] -> [(time, midi, beats, vel)]"""
    return [(t0 + b * BEAT, n(x) + transpose, d, vel) for b, x, d in items]


def pad_progression(seq, end, vel=0.5, att=2.0, rel=2.5, width=0.6, seed=0, voicing=PAD):
    """Chords [(t, name)] -> pad voices, common tones held through the change."""
    active = {}
    times = [t for t, _ in seq] + [end]
    for i, (t, name) in enumerate(seq):
        tones = set(ns(voicing[name]))
        for m in list(active):
            if m not in tones:
                s = active.pop(m)
                _pad_note(s, m, t - s, vel, att, rel, width, seed)
        for m in tones:
            active.setdefault(m, t)
    for m, s in active.items():
        _pad_note(s, m, end - s, vel, att, rel, width, seed)


def _pad_note(t, m, dur, vel, att, rel, width, seed):
    x = pad_voice(m, dur, vel, att=min(att, dur * 0.9 + 0.3), rel=rel, width=width, seed=seed * 1000 + m + int(t * 10))
    PADRAW.add(t, x, pan=float(np.clip((m - 60) / 60, -0.3, 0.3)))


def strings_chord(t, name, dur, vel, top=True, low=True, **kw):
    v = ns(PAD[name])
    notes = set(v)
    if low:
        notes.add(n(ROOT[name]) + 12)
    if top:
        notes.update([v[-2] + 12, v[-1] + 12])
    for m in sorted(notes):
        S(t, m, dur, vel * (1.0 if m > 50 else 0.85), **kw)


def S(t, note, dur, vel, send=0.4, **kw):
    m = n(note)
    kw.setdefault("seed", m * 13 + int(t * 100))
    x = bowed(m, dur, vel, **kw)
    B["pads"].add(t, x, gain=0.5, pan=float(np.clip((m - 60) / 50, -0.4, 0.4)), send=send)


def K(t, vel=1.0, decay=0.3):
    B["drums"].add(t, kick(vel, decay), gain=0.9, send=0.04)
    KICKS.append(t)


# ---------------------------------------------------------------- 0 - 12


def cold_open():
    x = room_tone(21.0)
    e = np.interp(T(21.0), [0, 2.0, 11.0, 13.0, 21.0], [0, 1, 1, 0.7, 0])
    B["fx"].add(0.0, x * e, send=0.1)
    # 8.5: the first note of the motif, alone
    P(8.5, "B4", 0.36, 3.45, send=0.4)
    mark("first note", 8.5)


# ---------------------------------------------------------------- 12 - 30


def promise():
    prog = [(12, "Bm"), (14, "G"), (16, "D"), (18, "A"), (20, "Bm"), (22, "G"), (24, "D"), (26, "A"), (28, "Asus4")]
    sparse = [(0, 0, 0.30), (1, 2, 0.19), (2, 3, 0.19), (3, 2, 0.15)]
    flowing = [(0, 0, 0.32), (1, 1, 0.22), (1.5, 2, 0.2), (2.5, 3, 0.2), (3.5, 2, 0.16)]
    open_ = [(0, 0, 0.38), (0.5, 1, 0.25), (1, 2, 0.24), (1.5, 3, 0.25), (2, 2, 0.22), (2.5, 1, 0.2), (3, 2, 0.23), (3.5, 3, 0.21)]
    hesitate = [(0, 0, 0.27), (1.5, 2, 0.16)]
    for t0, ch in prog:
        tones = ns(LH[ch])
        pat = sparse if t0 < 16 else flowing if t0 < 24 else open_ if t0 < 28 else hesitate
        end = t0 + BAR + 0.03
        for b, i, v in pat:
            P(t0 + b * BEAT, tones[i], v, end - (t0 + b * BEAT))
        if 24 <= t0 < 28:
            P(t0, tones[0] - 12, 0.32, BAR + 0.03)
    # label accents: a high chord tone and a low octave, on the label beats
    for t, hi, lo in [(16, "F#6", "D2"), (18, "E6", "A1"), (20, "D6", "B1"), (22, "B5", "G1")]:
        P(t, hi, 0.3, BAR - 0.05, send=0.35)
        P(t, lo, 0.34, BAR + 0.03)
        mark("label accent", t)
    # the melody
    mel = (phrase(12, MOTIF, 0.43) + phrase(16, ANSWER, 0.39) + phrase(20, MOTIF, 0.45)
           + phrase(24, MOTIF_MAJOR, 0.52))
    for t, m, d, v in mel:
        P(t, m, v, bar_end(t) - t + 0.03, send=0.22)
        if t >= 24:  # it opens up: doubled an octave below
            P(t, m - 12, v * 0.6, bar_end(t) - t + 0.03)
    # 28-30: the suspension. D5 over Asus4, then one hesitant A4, nothing resolves
    P(28.0, "D5", 0.4, 1.98, send=0.3)
    P(29.25, "A4", 0.27, 0.73, send=0.3)
    # warm pad from 16
    pad_progression(prog[2:], 30.0, vel=0.55, att=2.5, rel=2.0, width=0.55, seed=1)
    # cellos join when it opens up
    for t, ch in [(24, "D"), (26, "A"), (28, "Asus4")]:
        S(t, n(ROOT[ch]) + 12, BAR, 0.32, att=0.9, rel=1.5, vib=6, bright=0.5)
        S(t, n(ROOT[ch]) + 24, BAR, 0.22, att=1.2, rel=1.5, vib=6, bright=0.5)


# ---------------------------------------------------------------- 30 - 54


CEREMONY = [(30, "Bm"), (32, "G"), (34, "Em"), (36, "F#"), (38, "Bm+"), (40, "G+"), (42, "Em+"), (44, "F#+"),
            (46, "Bm+"), (48, "G+"), (50, "Em+"), (52, "F#+")]
OSTINATO = {"Bm": "B2 F#3 B3 F#3", "G": "G2 D3 G3 D3", "Em": "E2 B2 E3 B2", "F#": "F#2 C#3 F#3 C#3"}


def chord_at(seq, t):
    name = seq[0][1]
    for s, c in seq:
        if s <= t + 1e-9:
            name = c
    return name


def ceremony():
    rng = np.random.default_rng(30)
    # --- the clock: beats, then 8ths at 38, 16ths at 46, then accelerating
    times = list(np.arange(30, 38, 0.5)) + list(np.arange(38, 46, 0.25)) + list(np.arange(46, 50, 0.125))
    times += list(accel_times(50.0, 54.0, 8.0, 30.0))
    for i, t in enumerate(times):
        on_beat = abs(t * 2 - round(t * 2)) < 1e-6
        prog = (t - 30) / 24
        v = (0.42 + 0.3 * prog) * (1.0 if on_beat else 0.62)
        if t >= 50:
            v = 0.45 + 0.45 * ((t - 50) / 4) ** 1.5
        B["drums"].add(t, tick(i % 2 == 1, v, seed=i % 8), gain=1.4, send=0.12)
    mark("tick starts", 30.0)
    # --- low pulsing sub on the beats
    for t in np.arange(30, 50, 0.5):
        m = n(ROOT[chord_at(CEREMONY, t)])
        v = 0.35 + 0.35 * (t - 30) / 20
        B["bass"].add(t, sub(m + 12 if m < 30 else m, 0.32, v, decay=0.18), gain=0.8)
    for t in accel_times(50.0, 54.0, 2.0, 14.0):
        m = n(ROOT[chord_at(CEREMONY, t)])
        B["bass"].add(t, sub(m + 12 if m < 30 else m, 0.12, 0.75 + 0.2 * (t - 50) / 4, decay=0.08), gain=0.8)
    # --- piano ostinato: quarters, 8ths at 38, 16ths at 46, accelerating from 50
    seq = []
    for t0, t1, step in ((30, 38, 0.5), (38, 46, 0.25), (46, 50, 0.125)):
        seq += [(t, step) for t in np.arange(t0, t1, step)]
    acc = accel_times(50.0, 54.0, 8.0, 26.0)
    seq += [(t, (acc[i + 1] - t) if i + 1 < len(acc) else 0.04) for i, t in enumerate(acc)]
    for i, (t, step) in enumerate(seq):
        name = chord_at(CEREMONY, t).rstrip("+")
        pat = ns(OSTINATO[name])
        m = pat[i % 4]
        if t >= 50:
            m += 12 * int((t - 50) / 2.0)  # climbs an octave as it accelerates
        v = 0.3 + 0.28 * (t - 30) / 20 if t < 50 else 0.58 + 0.25 * (t - 50) / 4
        P(t, m, min(v, 0.85), max(step * 0.85, 0.05), send=0.12, gain=0.85)
    # --- the motif, fractured: inverted, detuned, cut off, stuck
    def frac(t0, items, vel, transpose=0, jitter=0.03, det=20, spread=5.0, keep=None):
        ph = phrase(t0, items, vel, transpose)[:keep]
        for t, m, d, v in ph:
            tj = t + rng.uniform(-jitter, jitter)
            P(max(tj, t0), m, v, min(d * BEAT, bar_end(t) - t + 0.03), detune=rng.uniform(-det, det),
              spread=spread, send=0.35)
    inv = [(b, x, d) for b, x, d in MOTIF_INV]
    frac(34, inv, 0.3, 12, det=15)
    frac(38, MOTIF, 0.32, 0, det=22, keep=3)  # the line, cut off after three notes
    frac(40, inv, 0.3, 12, det=25)
    frac(40.25, inv, 0.2, 24, det=30, spread=7)  # a canon an octave up: the tangle
    frac(42, [(0, "B4", 0.5), (0.5, "C#5", 0.5), (1, "D5", 0.5), (2, "F#5", 0.5), (2.5, "E5", 0.5), (3, "B4", 0.5)],
         0.34, 0, det=28)
    frac(44, inv, 0.34, 12, det=32, spread=8)
    frac(44, inv, 0.22, 0, det=32, spread=8, jitter=0.06)
    # 46-54: stuck in a loop on the first three notes
    loop = ns("B5 C#6 D6")
    for i, t in enumerate(np.arange(46, 50, 1 / 6)):  # triplet 16ths against the 16th tick
        P(t, loop[i % 3], 0.24 + 0.12 * (t - 46) / 4, 0.12, detune=rng.uniform(-30, 30), spread=8, send=0.3, gain=0.8)
    for i, t in enumerate(accel_times(50.0, 54.0, 6.0, 22.0)):
        u = (t - 50) / 4
        m = dia("B5", (i % 3) + int(u * 6))
        P(t, m, 0.36 + 0.4 * u, 0.06, detune=rng.uniform(-35, 35), spread=9, send=0.3, gain=0.8)
    # --- clusters thicken; the texture widens at 40
    pad_progression(CEREMONY[:5], 40.0, vel=0.55, att=1.5, rel=1.2, width=0.45, seed=2)
    pad_progression(CEREMONY[5:], 54.0, vel=0.6, att=1.2, rel=1.0, width=0.95, seed=3)
    # --- string ostinato (spiccato) from 40, 16ths layer from 46
    for i, t in enumerate(np.arange(40, 50, 0.25)):
        tones = ns(PAD[chord_at(CEREMONY, t)])[2:]
        m = tones[[0, 2, 1, 3][i % 4] % len(tones)] + 12
        x = bowed(m, 0.09, 0.42 + 0.2 * (t - 40) / 10, att=0.006, rel=0.12, vib=0, voices=3, width=0.2,
                  bright=1.2, bow=1.0, seed=i)
        B["pads"].add(t, x, gain=0.55, pan=-0.6 if i % 2 else 0.6, send=0.25)
    for i, t in enumerate(np.arange(46, 50, 0.125)):
        tones = ns(PAD[chord_at(CEREMONY, t)])[3:]
        m = tones[i % len(tones)] + 24
        x = bowed(m, 0.05, 0.3 + 0.1 * (t - 46) / 4, att=0.004, rel=0.08, vib=0, voices=3, width=0.2,
                  bright=1.3, bow=1.0, seed=100 + i)
        B["pads"].add(t, x, gain=0.5, pan=0.75 if i % 2 else -0.75, send=0.25)
    # --- 38: sub drop
    B["fx"].add(38.0, sub_drop(3.0), gain=0.5, send=0.05)
    mark("sub drop", 38.0)
    # --- 46: "You got ceremony." Low piano cluster, a drum, a sub
    for note in ("B0", "F#1", "B1", "C2"):
        P(46.0, note, 0.9, 1.9, send=0.3)
    B["fx"].add(46.0, tom(52, 1.0, 0.6), gain=0.7, send=0.3)
    B["fx"].add(46.0, cymbal(3.0, 0.7, 1.2), gain=0.6, send=0.3)
    B["bass"].add(46.0, sub(n("B1"), 1.2, 0.9, decay=0.6), gain=0.8)
    mark("ceremony hit", 46.0)
    # --- 50-54: the riser. Noise sweep + Shepard tone + string tremolo, all peaking at 54.0
    B["fx"].add(50.0, noise_sweep(4.0, 250, 9500, curve=2.2), gain=0.5, send=0.3)
    B["fx"].add(50.0, shepard(4.0, octaves=2.0, curve=1.8), gain=0.5, send=0.3)
    for m in ns("F#3 C#4 G4 A#4 C#5 E5 F#5 G5"):
        S(50.0, m, 4.0, 0.5, att=3.6, rel=0.3, vib=4, bright=1.4, voices=4, width=0.9,
          trem=lambda t: 7 + 18 * (t / 4.0) ** 2, send=0.35)
    mark("riser peak / cut", 54.0)


# ---------------------------------------------------------------- 56 - 70


def question():
    # 56: one high soft note, long reverb
    P(56.0, "B5", 0.3, 4.0, send=0.9)
    mark("single note", 56.0)
    seq = [(58, "Gmaj9"), (62, "Em9"), (64, "Asus4"), (66, "A")]
    pad_progression(seq, 70.0, vel=0.6, att=3.5, rel=1.5, width=0.8, seed=4)
    # bowed strings, sul tasto, growing
    for (t, name), v in zip(seq, (0.22, 0.32, 0.42, 0.52)):
        end = 70.0 if name == "A" else [s for s, _ in seq if s > t][0]
        for m in ns(PAD[name])[1:]:
            S(t, m, end - t, v, att=2.5, rel=1.0, vib=5, bright=0.35 + v, voices=5, width=0.8, send=0.5)
    S(60.0, "B4", 6.0, 0.25, att=3.0, rel=1.5, vib=6, bright=0.5, send=0.6)  # a high line appears
    S(66.0, "C#5", 4.0, 0.35, att=1.5, rel=0.5, vib=6, bright=0.8, send=0.6)
    # reversed piano: notes that breathe in toward 68
    for t_end, notes, v in [(60.0, ["D5"], 0.3), (62.0, ["B4", "F#5"], 0.34), (64.0, ["E5", "G5"], 0.38),
                            (66.0, ["A4", "E5"], 0.44), (68.0, ["A2", "E3", "A3", "C#4", "E4", "A4", "C#5"], 0.55)]:
        reversed_piano(t_end, notes, v, length=2.0 if t_end < 68 else 3.2)
    # 68: a line of light moving
    B["fx"].add(68.0, whoosh(1.9), gain=0.4, send=0.35)
    mark("whoosh", 68.0)
    rs = reverse_swell(1.6)
    B["fx"].add(IMPACT - rs.shape[1] / SR, rs, gain=0.5, send=0.15)


def reversed_piano(t_end, notes, vel, length):
    total = np.zeros((2, int(6.0 * SR)))
    for note in notes:
        m = n(note)
        x = piano.note(m, vel, 5.0) * 0.98 * vel**1.6
        x = pan2(x.mean(axis=0), float(np.clip((m - 62) / 44, -0.45, 0.45)))
        total[:, : x.shape[1]] += x[:, : total.shape[1]]
    wet = convolve(total, IR_REV)[:, : total.shape[1]]
    y = (0.5 * total + 0.8 * wet)[:, ::-1]
    L = int(length * SR)
    y = y[:, -L:]
    y *= (np.linspace(0, 1, L) ** 2)[None, :]
    y = taper(y, 0.0, 0.004)
    B["piano"].add(t_end - L / SR, y, gain=1.0)


# ---------------------------------------------------------------- 70 - 80


def introducing():
    B["fx"].add(IMPACT, impact(), gain=0.8, send=0.25)
    mark("impact", IMPACT)
    # the low piano octave under the impact
    for note in ("D1", "D2", "A2"):
        P(IMPACT, note, 0.85, BAR + 0.03, send=0.35)
    seq = [(70, "D"), (72, "A/C#"), (74, "Bm"), (76, "G"), (78, "Asus4"), (79, "A")]
    # piano: the motif in D major, in octaves, then the answer
    mel = phrase(70, MOTIF_MAJOR, 0.6) + phrase(74, [(0, "F#5", 2), (2, "E5", 1), (3, "D5", 1)], 0.5)
    mel += phrase(76, [(0, "D5", 4)], 0.4) + phrase(78, [(0, "E5", 2), (2, "C#5", 2)], 0.36)
    for t, m, d, v in mel:
        P(t, m, v, bar_end(t) - t + 0.03, send=0.25)
        P(t, m + 12, v * 0.75, bar_end(t) - t + 0.03, send=0.3)
    for t0, ch in seq[:-2] + [(78, "Asus4")]:
        tones = ns(LH.get(ch, LH["A"]))
        v = 0.34 if t0 < 76 else 0.25
        for b, i in [(0, 0), (0.5, 1), (1, 2), (1.5, 3), (2, 2), (2.5, 1), (3, 2), (3.5, 3)]:
            if t0 >= 76 and b % 1:
                continue  # settle: fewer notes under the lockup
            P(t0 + b * BEAT, tones[i], v, BAR + 0.03 - b * BEAT)
    # strings: the theme in full, then settling
    for (t, name), v in zip(seq, (0.62, 0.58, 0.55, 0.42, 0.34, 0.34)):
        end = [s for s, _ in seq if s > t][0] if t < 79 else 80.0
        strings_chord(t, name, end - t, v, att=0.25 if t == 70 else 0.6, rel=1.2, vib=8, bright=0.6 + v, voices=5,
                      width=0.8, send=0.45)
    for t, m, d, v in phrase(70, MOTIF_MAJOR, 0.5):  # violins double the melody
        S(t, m, d * BEAT, v, att=0.12, rel=0.6, vib=10, bright=1.0, voices=6, width=0.5, send=0.5)
    pad_progression(seq, 80.0, vel=0.6, att=0.4, rel=2.0, width=0.85, seed=5)
    # sub roots
    for t, ch in seq[:-1]:
        end = [s for s, _ in seq if s > t][0]
        B["bass"].add(t, sub(n(ROOT[ch]), end - t, 0.55 if t > 70 else 0.0, decay=3.0), gain=0.8)
    B["fx"].add(78.0, reverse_swell(2.0, seed=17), gain=0.25, send=0.1)


# ---------------------------------------------------------------- 80 - 126


def tech_chords():
    seq = []
    for i in range(23):
        t = 80 + 2 * i
        seq.append((t, ["Bm", "G", "D", "A"][i % 4]))
    seq[22] = (124, "A")  # dominant under the riser
    return seq


def language():
    seq = tech_chords()
    # --- kick: half-time 80-88, four-on-the-floor from 88; a two-bar breath at 112
    for t in np.arange(80, 88, 2.0):
        K(t, 0.95)
        K(t + 1.25, 0.7)
    for t in np.arange(88, 126, 0.5):
        if 112 <= t < 116:
            continue
        K(t, 1.0 if t % 2 == 0 else 0.92)
    # --- hats: 8ths from 84 (soft), full from 88; open hats on offbeats 96-112, 116-126
    for i, t in enumerate(np.arange(84, 126, 0.25)):
        off = (t * 2) % 1 > 0.25
        v = (0.5 if off else 0.3) * (0.6 if t < 88 else 1.0)
        if 104 <= t < 112:
            v *= 1.15
        B["drums"].add(t, hat(v, seed=i % 5), gain=0.55, pan=0.25, send=0.05)
    for t in np.arange(96.25, 126, 0.5):
        if 112 <= t < 116:
            continue
        B["drums"].add(t, hat(0.24, decay=0.14, seed=7), gain=0.5, pan=0.3, send=0.06)
    for i, t in enumerate(np.arange(104, 112, 0.125)):
        B["drums"].add(t, shaker(0.35 if i % 2 else 0.22, seed=i % 6), gain=0.6, pan=-0.35, send=0.06)
    # --- claps on 2 and 4 from 88
    for t in np.arange(88.5, 126, 1.0):
        B["drums"].add(t, clap(0.55, seed=int(t * 2) % 4), gain=0.6, send=0.22)
    # --- sub bass following the chords
    for t, ch in seq:
        r = n(ROOT[ch])
        if t < 88:
            B["bass"].add(t, bass(r, 1.9, 0.55, cutoff=200), gain=0.75)
        else:
            cut = 420 if 104 <= t < 112 else 300
            for k in range(8):
                m = r + (12 if k == 7 else 0)
                B["bass"].add(t + k * 0.25, bass(m, 0.2, 0.62 if k % 2 else 0.5, cutoff=cut), gain=0.75)
    # --- side-chained pad
    pad_progression(seq, 126.0, vel=0.5, att=0.3, rel=0.25, width=0.9, seed=6)
    # --- strings: low from 96, the motif on violins 104-112, violas 116-124
    for t, ch in seq:
        if 96 <= t < 112 or 116 <= t < 124:
            S(t, n(ROOT[ch]) + 12, BAR, 0.3, att=0.4, rel=0.4, vib=6, bright=0.6, send=0.35)
            S(t, n(ROOT[ch]) + 19, BAR, 0.22, att=0.4, rel=0.4, vib=6, bright=0.6, send=0.35)
    for t, m, d, v in phrase(104, MOTIF, 0.55, 12) + phrase(108, ANSWER, 0.5, 12):
        S(t, m, d * BEAT, v, att=0.08, rel=0.5, vib=11, bright=1.1, voices=6, width=0.5, send=0.5)
        S(t, m - 12, d * BEAT, v * 0.7, att=0.08, rel=0.5, vib=9, bright=0.9, voices=5, width=0.5, send=0.45)
    for t, m, d, v in phrase(104, MOTIF, 0.5, 12) + phrase(108, ANSWER, 0.45, 12):
        P(t, m, v, d * BEAT + 0.1, send=0.25)
    for t, m, d, v in phrase(120, MOTIF, 0.32, 12):
        P(t, m, v, d * BEAT + 0.1, send=0.3)
    # --- the motif as a 16th-note pluck arpeggio (6 notes against the 4/4 grid)
    arp_root = {"Bm": "B4", "G": "G4", "D": "D5", "A": "A4"}
    L0 = int(80 * SR)
    region = np.zeros((2, int(46.5 * SR)))
    for i, t in enumerate(np.arange(80, 126, 0.125)):
        ch = chord_at(seq, t)
        m = dia(arp_root[ch], MOTIF_STEPS[i % 6])
        accent_ = 1.0 if i % 4 == 0 else 0.72
        lvl = 0.6 if t < 88 else 0.8 if t < 104 else 1.0 if t < 112 else 0.75
        x = pluck(m, accent_ * lvl, bright=1.4 if 104 <= t < 112 else 1.0, seed=i % 12)
        j = int(round(t * SR)) - L0
        region[:, j:j + x.shape[1]] += x[:, : region.shape[1] - j]
    region = taper(pingpong(region, 0.375, 0.38, 5)[:, : int(46.0 * SR)], 0, 0.012)  # stops with the groove
    B["pads"].add(80.0, region, gain=0.55, send=0.2)
    # --- accents on the feature cuts
    pings = ["B6", "C#7", "D7", "F#7", "E7", "D7", "B6", "D7"]
    for i, t in enumerate(FEATURE_CUTS):
        size = 1.3 if t == 104 else 1.0
        B["fx"].add(t, accent(n(pings[i]), size, seed=40 + i), gain=0.4, send=0.35)
        mark("feature accent", t)
    B["fx"].add(104.0 - 2.0, reverse_swell(2.0, seed=23), gain=0.35, send=0.1)
    B["fx"].add(104.0, cymbal(4.0, 0.8, 1.6, seed=24), gain=0.45, send=0.25)
    # --- 122-126: small riser
    B["fx"].add(122.0, noise_sweep(4.0, 400, 7000, curve=2.0, seed=31), gain=0.22, send=0.3)
    rs = reverse_swell(2.0, seed=27)
    B["fx"].add(126.0 - rs.shape[1] / SR, rs, gain=0.25, send=0.1)


def pingpong(x, delay, fb, repeats):
    y = x.copy()
    d = int(delay * SR)
    tap = x.mean(axis=0)
    lp = butter("lowpass", 3800, 2)
    for i in range(1, repeats + 1):
        tap = filt(tap, lp)
        if i * d >= tap.size:
            break
        y[i % 2, i * d:] += fb**i * tap[: tap.size - i * d]
    return y


# ---------------------------------------------------------------- 126 - 144


def night():
    # the clock again, one tick per beat, softer; it fades as dawn comes
    for i, t in enumerate(np.arange(126, 141, 0.5)):
        v = 0.3 * np.clip((141 - t) / 4, 0, 1)
        B["drums"].add(t, tick(i % 2 == 1, v, seed=i % 8), gain=1.3, send=0.15)
    B["fx"].add(126.0, room_tone(18.0, seed=8) * np.interp(T(18.0), [0, 1, 12, 18], [0, 0.8, 0.8, 0])[None, :], send=0.1)
    seq = [(126, "Bm"), (128, "G"), (130, "D"), (131, "G"), (132.5, "A/G"), (134, "F#m"), (135.5, "Bm"),
           (137, "D"), (139, "Gmaj7/D"), (141, "D/F#"), (142, "Asus4"), (143, "A")]
    ends = [s for s, _ in seq[1:]] + [144.0]
    for (t0, ch), t1 in zip(seq, ends):
        tones = ns(LH[ch])
        pat = [(0, 0, 0.26), (1, 2, 0.17), (2, 3, 0.17), (3, 1, 0.14)]
        if t0 >= 137:
            pat = [(0, 0, 0.3), (0.5, 1, 0.2), (1, 2, 0.2), (1.5, 3, 0.2), (2, 2, 0.18), (3, 3, 0.18)]
        for b, i, v in pat:
            t = t0 + b * BEAT
            if t < t1 - 0.01:
                P(t, tones[i], v, t1 - t + 0.03, send=0.25)
    mel = phrase(126, MOTIF, 0.36) + phrase(130, [(0, "A4", 2)], 0.3)
    mel += [(131.0, n("D5"), 3, 0.34), (132.5, n("E5"), 3, 0.36), (134.0, n("C#5"), 3, 0.33), (135.5, n("B4"), 3, 0.3)]
    mel += [(137.0, n("F#5"), 2, 0.42), (138.0, n("E5"), 1, 0.36), (138.5, n("D5"), 1, 0.35), (139.0, n("D5"), 4, 0.0),
            (141.0, n("F#5"), 2, 0.4), (142.0, n("E5"), 2, 0.38), (143.0, n("C#5"), 2, 0.36)]
    for t, m, d, v in mel:
        if v <= 0:
            continue
        nxt = min([s for s in [x for x, _ in seq] + [144.0] if s > t + 1e-6])
        P(t, m, v, nxt - t + 0.03, send=0.28)
    P(139.0, "B4", 0.3, 2.03, send=0.3)
    P(139.0, "G5", 0.34, 2.03, send=0.3)
    # 137: dawn. Strings and pad, warm
    dawn = seq[7:]
    pad_progression(dawn, 144.0, vel=0.5, att=2.5, rel=1.5, width=0.8, seed=7)
    for (t, ch), t1 in zip(dawn, ends[7:]):
        strings_chord(t, ch if ch in PAD else "D", t1 - t, 0.3 + 0.03 * (t - 137), top=False, att=1.6 if t == 137 else 0.7,
                      rel=1.0, vib=7, bright=0.5, voices=5, width=0.8, send=0.5)
    mark("dawn", 137.0)
    B["fx"].add(142.0, reverse_swell(2.0, seed=29), gain=0.3, send=0.1)


# ---------------------------------------------------------------- 144 - 160


def finale():
    seq = [(144, "Bm"), (146, "G"), (148, "D"), (150, "A"), (152, "G"), (153, "A"), (154, "D")]
    ends = [s for s, _ in seq[1:]] + [156.0]
    # piano: melody in octaves, broken-chord 8ths
    mel = phrase(144, MOTIF, 0.6) + phrase(148, ANSWER, 0.55) + [(152.0, n("F#5"), 2, 0.55), (153.0, n("E5"), 2, 0.52)]
    for t, m, d, v in mel:
        e = min([s for s in ends if s > t + 1e-6])
        P(t, m, v, e - t + 0.03, send=0.25)
        P(t, m + 12, v * 0.8, e - t + 0.03, send=0.3)
    for (t0, ch), t1 in zip(seq[:-1], ends[:-1]):
        tones = ns(LH[ch])
        P(t0, tones[0] - 12, 0.4, t1 - t0 + 0.03)
        for b, i in [(0, 0), (0.5, 1), (1, 2), (1.5, 3), (2, 2), (2.5, 1), (3, 2), (3.5, 3)]:
            t = t0 + b * BEAT
            if t < t1 - 0.01:
                P(t, tones[i], 0.32, t1 - t + 0.03)
    # 154: the final cadence, held, released just before 156
    for note in ("D2", "A2", "D3", "F#3", "A3", "D4", "F#4", "A4", "F#5", "A5"):
        P(154.0, note, 0.5 if n(note) > 60 else 0.42, 1.9, send=0.12)
    # strings + pad, fullest
    for (t, ch), t1 in zip(seq, ends):
        v = 0.6 if t < 154 else 0.5
        strings_chord(t, ch, t1 - t - (0.4 if t == 154 else 0), v, att=0.4, rel=1.2 if t < 154 else 0.6, vib=9, bright=0.6 + v, voices=5,
                      width=0.85, send=0.45)
    for t, m, d, v in phrase(144, MOTIF, 0.55, 12) + phrase(148, ANSWER, 0.5, 12):
        S(t, m, d * BEAT, v, att=0.1, rel=0.6, vib=11, bright=1.1, voices=6, width=0.5, send=0.5)
    pad_progression(seq, 156.0, vel=0.55, att=0.5, rel=1.0, width=0.9, seed=8)
    # soft drums
    for t0, _ in seq[:-2]:
        K(t0, 0.75, 0.35)
        K(t0 + 1.0, 0.6, 0.35)
        B["drums"].add(t0 + 0.5, tom(98, 0.25, 0.3), gain=0.6, pan=-0.2, send=0.25)
        B["drums"].add(t0 + 1.5, tom(82, 0.3, 0.35), gain=0.6, pan=0.2, send=0.25)
    for i, t in enumerate(np.arange(144, 153, 0.25)):
        B["drums"].add(t, shaker(0.28 if i % 2 else 0.18, seed=i % 6), gain=0.6, pan=0.3, send=0.08)
    for i, t in enumerate(np.arange(152, 154, 0.125)):  # tom roll into the cadence
        B["drums"].add(t, tom(70 + (i % 2) * 14, 0.15 + 0.35 * i / 16, 0.25, seed=i), gain=0.6, pan=(-0.2, 0.2)[i % 2], send=0.25)
    K(154.0, 0.85, 0.5)
    B["fx"].add(154.0, cymbal(3.0, 0.7, 1.0, seed=33), gain=0.4, send=0.2)
    B["fx"].add(144.0, cymbal(4.0, 0.6, 1.6, seed=34), gain=0.4, send=0.3)
    B["bass"].add(154.0, sub(n("D2"), 1.8, 0.6, decay=1.0), gain=0.8)
    for (t, ch), t1 in zip(seq[:-1], ends[:-1]):
        B["bass"].add(t, sub(n(ROOT[ch]), t1 - t, 0.5, decay=2.0), gain=0.8)
    # tagline accents
    for t, note in zip(TAGLINE_ACCENTS, ("D7", "D7")):
        B["fx"].add(t, accent(n(note), 0.8, seed=int(t)), gain=0.32, send=0.4)
        mark("tagline accent", t)
    # 156: the motif's last note, alone
    P(156.0, "D5", 0.42, 3.6, send=0.45)
    mark("last note", 156.0)


# ============================================================================
# Mix and master
# ============================================================================


def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return sps.lfilter(b2, a2, sps.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs(x, start=0.0, end=None):
    """ITU-R BS.1770 integrated loudness (gated) of x[start:end]."""
    seg = x[:, int(start * SR): int((end or x.shape[1] / SR) * SR)]
    y = kweight(seg.astype(np.float64)) ** 2
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if y.shape[1] < blk:
        return -np.inf
    c = np.cumsum(np.hstack([np.zeros((2, 1)), y]), axis=1)
    idx = np.arange(0, y.shape[1] - blk + 1, hop)
    ms = ((c[:, idx + blk] - c[:, idx]) / blk).sum(axis=0)
    with np.errstate(divide="ignore"):
        ld = -0.691 + 10 * np.log10(ms)
    g = ms[ld > -70]
    if g.size == 0:
        return -np.inf
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[(ld > -70) & (ld > rel)]
    return -0.691 + 10 * np.log10(g2.mean())


def true_peak_track(x):
    up = sps.resample_poly(x, 4, 1, axis=1)
    return np.abs(up).max(axis=0).reshape(-1, 4).max(axis=1)[: x.shape[1]]


def compressor(x, thr_db=-17.0, ratio=2.0, knee=6.0, att=0.03, rel=0.35, hop=240):
    p = (x.astype(np.float64) ** 2).mean(axis=0)
    nf = p.size // hop
    lvl = 10 * np.log10(p[: nf * hop].reshape(nf, hop).mean(axis=1) * 2 + 1e-12)
    over = lvl - thr_db
    gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over, (over + knee / 2) ** 2 / (2 * knee)))
    gr *= 1 - 1 / ratio
    sm = np.empty(nf)
    aa, ar = np.exp(-hop / (att * SR)), np.exp(-hop / (rel * SR))
    s = 0.0
    for i in range(nf):
        a = aa if gr[i] > s else ar
        s = a * s + (1 - a) * gr[i]
        sm[i] = s
    g = 10 ** (-np.interp(np.arange(p.size), np.arange(nf) * hop + hop / 2, sm) / 20)
    return x * g[None, :]


def soft_clip(x, k=0.8):
    """Soft knee above k, computed at 4x so the new harmonics do not alias."""
    up = sps.resample_poly(x, 4, 1, axis=1)
    a = np.abs(up)
    up = np.sign(up) * np.where(a < k, a, k + (1 - k) * np.tanh((a - k) / (1 - k)))
    return sps.resample_poly(up, 1, 4, axis=1)[:, : x.shape[1]]


def limiter(x, ceiling_db=-1.3, look=0.0025, rel=0.06):
    ceil = 10 ** (ceiling_db / 20)
    for _ in range(3):
        pk = true_peak_track(x)
        if pk.max() <= ceil:
            break
        req = np.minimum(1.0, ceil / (pk + 1e-12))
        W = int(look * SR)
        g = minimum_filter1d(req, 2 * W + 1)
        hop = 48
        nb = g.size // hop
        gb = g[: nb * hop].reshape(nb, hop).min(axis=1)
        ar = np.exp(-hop / (rel * SR))
        s = 1.0
        out = np.empty(nb)
        for i in range(nb):
            s = min(gb[i], ar * s + (1 - ar))
            out[i] = s
        g1 = np.ones(g.size)
        g1[: nb * hop] = np.repeat(out, hop)
        g1 = np.minimum(g1, g)
        g1 = uniform_filter1d(minimum_filter1d(g1, 2 * W + 1), W)
        x = x * g1[None, :]
    return x


HP_MASTER = butter("highpass", 22, 2)


def master_chain(x, gain):
    def chain(seg):
        y = filt(seg, HP_MASTER) * gain
        y = compressor(y)
        y = soft_clip(y * 1.0)
        return y
    y = segmentwise(x, chain)
    y = segmentwise(y, lambda s: limiter(s))
    return finalize(y)


def finalize(y):
    """Razor cut into the silence, the silent windows hard-zeroed, the end faded to nothing."""
    y = np.array(y, dtype=np.float64)
    k = int(0.003 * SR)
    y[:, CUT0 - k:CUT0] *= np.linspace(1, 0, k) ** 2
    y[:, CUT0:CUT1] = 0.0
    f0 = int(158.0 * SR)
    y[:, f0:END0] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, END0 - f0)))[None, :]
    y[:, END0:] = 0.0
    return y


def last_note_clears(x, ir, at=156.0, fade=1.2):
    """Reverb/resonance split at the last note: the finale's tail clears so D5 rings alone."""
    i = int(at * SR)
    y = segmentwise(np.where(np.arange(N) < i, x, 0.0), lambda s: convolve(s, ir))
    k = int(fade * SR)
    y[:, i - int(0.1 * SR):i - int(0.1 * SR) + k] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k)))[None, :]
    y[:, i - int(0.1 * SR) + k:] = 0.0
    tail = x[:, i:]
    y[:, i:] += convolve(tail, ir)[:, : N - i]
    return y


def write_wav24(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    y = np.clip(np.round(np.asarray(x, np.float64).T * 8388607.0), -8388608, 8388607).astype("<i4")
    data = np.ascontiguousarray(y).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    ch, bits = 2, 24
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    hdr += b"fmt " + struct.pack("<IHHIIHH", 16, 1, ch, SR, SR * ch * bits // 8, ch * bits // 8, bits)
    hdr += b"data" + struct.pack("<I", len(data))
    with open(path, "wb") as f:
        f.write(hdr)
        f.write(data)


def main():
    t_start = time.time()

    def log(msg):
        print(f"[{time.time() - t_start:6.1f}s] {msg}", flush=True)

    global IR_REV
    IR_HALL = make_ir(3.4, 2.9, 1.5, 4.2, 0.022, seed=101)  # piano
    IR_BIG = make_ir(4.6, 3.8, 2.0, 5.0, 0.035, seed=102)  # pads, strings
    IR_ROOM = make_ir(1.3, 1.0, 0.6, 1.6, 0.010, seed=103, er=14, er_span=0.03)  # drums
    IR_CATH = make_ir(5.5, 4.6, 2.4, 5.0, 0.045, seed=104)  # fx, impacts
    IR_REV = make_ir(2.6, 2.2, 1.2, 3.0, 0.015, seed=105)  # reversed-piano bloom
    IR_SYM = sympathetic_ir()
    log("impulse responses ready")

    cold_open(); log("cold open")
    promise(); log("promise")
    ceremony(); log("ceremony")
    question(); log("question")
    introducing(); log("introducing")
    language(); log("language")
    night(); log("3:07 AM")
    finale(); log("finale")

    # --- pad bus: moving low-pass, level automation
    cutoff = auto([(0, 500), (16, 500), (24, 900), (28, 700), (30, 650), (38, 900), (40, 1200), (50, 1900),
                   (54, 3200), (56, 350), (58, 350), (68, 2400), (70, 2800), (76, 1500), (80, 900), (88, 1500),
                   (104, 2600), (112, 800), (116, 1600), (126, 2600), (126.01, 700), (137, 700), (144, 2000),
                   (154, 1700), (160, 700)])
    cutoff *= (1 + 0.15 * np.sin(2 * np.pi * TT / 13.0)).astype(np.float32)
    level = auto([(0, 0), (16, 0.0), (17.5, 0.8), (24, 0.85), (26, 1.0), (28, 0.9), (30, 0.8), (40, 1.0), (54, 1.25),
                  (56, 0.3), (58, 0.3), (68, 1.1), (69.4, 0.8), (70, 1.2), (76, 0.9), (80, 0.75), (88, 0.85),
                  (104, 1.0), (112, 0.8), (126, 1.0), (126.01, 0.0), (137, 0.0), (137.01, 0.8), (144, 1.0),
                  (154, 1.0), (155.8, 0.0), (160, 0.0)])
    raw = PADRAW.dry * level[None, :]
    pad = np.zeros_like(raw)
    for a, b in ((0, CUT0), (CUT1, N)):
        pad[:, a:b] = tv_filter(raw[:, a:b], cutoff[a:b], "lp", stages=2, block=256)
    B["pads"].dry += (pad * 0.42).astype(np.float32)
    B["pads"].send += (pad * 0.42 * 0.5).astype(np.float32)
    del raw, pad
    log("pad bus filtered")

    # --- piano: sympathetic pedal resonance and a felt-piano tone shape
    pdry = B["piano"].dry.astype(np.float64)
    pdry += 0.12 * last_note_clears(pdry, IR_SYM)
    pdry = segmentwise(pdry, lambda s: filt(s, np.vstack([peq(190, 1.5, 0.8), peq(3000, -2.0, 0.9)])))
    B["piano"].dry[:] = pdry
    del pdry
    log("piano resonance")

    # --- side-chain (tech section and finale)
    duck = np.ones(N, np.float32)
    shape_t = T(0.9)
    shape = np.where(shape_t < 0.004, shape_t / 0.004, np.exp(-(shape_t - 0.004) / 0.16))
    for tk in KICKS:
        depth = 0.55 if tk < 126 else 0.25
        i = int(round(tk * SR))
        seg = duck[i:i + shape.size]
        np.minimum(seg, (1 - depth * shape[: seg.size]).astype(np.float32), out=seg)

    stems = {}
    irs = {"piano": IR_HALL, "pads": IR_BIG, "drums": IR_ROOM, "fx": IR_CATH}
    # wet returns of the groove stems are pulled out quickly at the 126 drop
    drop = auto([(0, 1), (126.0, 1), (126.5, 0.25), (128, 0.0), (130, 1.0), (155.4, 1.0), (156.4, 0.0), (160, 0.0)])
    for name, bus in B.items():
        x = bus.dry.astype(np.float64)
        if name == "piano":
            x += last_note_clears(bus.send.astype(np.float64), IR_HALL)
        elif name in irs:
            wet = segmentwise(bus.send.astype(np.float64), lambda s, ir=irs[name]: convolve(s, ir))
            if name in ("pads", "drums"):
                wet *= drop[None, :]
            x += wet
        if name in ("pads", "bass"):
            x *= duck[None, :]
        stems[name] = finalize(x)
        log(f"stem {name}")
    return stems, log


# Mix automation per stem, in dB: (time, gain). Linear between keyframes.
MIX = {
    # a fader ride on the whole mix: this is the film's dynamic shape
    "all": [(0, 0), (8.4, 0), (8.5, -4), (12, -6), (24, -5), (29.9, -5), (30, -7), (46, -2), (50, 0), (54, 0),
            (56, -5), (68, -1.5), (70, -1), (79.9, -1), (80, 1.5), (126, 1.5), (126.01, -6), (137, -7), (143, -6),
            (144, -0.5), (155.9, -0.5), (156, -1.5)],
    "piano": [(0, 0), (68, 0), (70, 2), (76, 2), (80, 0)],
    "pads": [(0, -6), (24, -5), (30, -3), (68, -3), (70, -2), (76, -4), (79.9, -4), (80, 2), (88, 3), (126, 3),
             (126.01, 0), (136.9, 0), (137, -10), (143, -9), (144, -1)],
    "drums": [(0, 0), (79.9, 0), (80, 3), (126, 3), (126.01, 0)],
    "bass": [(0, 0), (54, 0), (56, 2), (79.9, 2), (80, 0), (126, 0), (126.01, 2), (144, 2)],
    "fx": [(0, 0)],
}


def mix_gain(name):
    keys = MIX[name] + [(LENGTH, MIX[name][-1][1])]
    return 10 ** (auto(keys).astype(np.float64) / 20)


def render():
    stems, log = main()
    for k in stems:
        stems[k] = stems[k] * (mix_gain(k) * mix_gain("all"))[None, :]
    mix = sum(stems.values())
    # find the input gain that lands the master at -14 LUFS integrated
    g = 10 ** ((-14.0 - lufs(mix)) / 20)
    for it in range(8):
        out = master_chain(mix, g)
        L = lufs(out)
        log(f"master pass {it}: gain {20 * np.log10(g):+.2f} dB -> {L:.2f} LUFS")
        if abs(L + 14.0) < 0.05:
            break
        g *= 10 ** ((-14.0 - L) / 20)
    write_wav24(os.path.join(BUILD, "score.wav"), out)
    # stems: same input gain as the master, pre-compression; scaled together if they would clip
    peak = max(np.abs(stems[k] * g).max() for k in stems)
    sg = g * min(1.0, 10 ** (-1.0 / 20) / peak)
    for k in stems:
        write_wav24(os.path.join(BUILD, "stems", f"{k}.wav"), stems[k] * sg)
    log(f"stems written at {20 * np.log10(sg):+.2f} dB (master input gain {20 * np.log10(g):+.2f} dB)")
    log(f"wrote {os.path.join(BUILD, 'score.wav')}  ({out.shape[1]} samples)")
    for k, v in EVENTS.items():
        print(f"  {k:16s} {', '.join(f'{t:.3f}' for t in v)}")


if __name__ == "__main__":
    render()
