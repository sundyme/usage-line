"""usage-line trailer — the score. numpy only.

120 BPM in F# minor (F#m · D · A · E). Anti-aliased (PolyBLEP) supersaw chords through a
moving low-pass, a sidechain that breathes with the kick, a rolling bass, sixteenth plucks,
two drops and a breakdown; every cut and UI event in the picture has its sound on its frame.

    python3 score.py   →   out/score.wav, loudness-normalised to −14 LUFS by ffmpeg
"""
import os
import subprocess
import wave

import numpy as np

SR = 48_000
DUR = 52.0
N = int(SR * DUR)
BEAT = 0.5
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
rng = np.random.default_rng(52)

bus = {k: np.zeros((2, N)) for k in ('kick', 'drums', 'bass', 'chords', 'lead', 'fx', 'ui')}
send = np.zeros((2, N))


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def place(name, at, sig, gain=1.0, pan=0.0, verb=0.0):
    i = int(round(at * SR))
    if i >= N or i + sig.shape[-1] <= 0:
        return
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    if i < 0:
        sig = sig[:, -i:]
        i = 0
    n = min(sig.shape[1], N - i)
    bus[name][:, i:i + n] += sig[:, :n] * gain
    if verb:
        send[:, i:i + n] += sig[:, :n] * gain * verb


def spectral(sig, shape):
    n = sig.shape[-1]
    m = n + min(n, SR)
    F = np.fft.rfft(sig, n=m, axis=-1)
    f = np.fft.rfftfreq(m, 1 / SR)
    return np.fft.irfft(F * shape(f), n=m, axis=-1)[..., :n]


def lowpass(sig, fc, order=2):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def highpass(sig, fc, order=2):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def sweep_lowpass(sig, cutoff, res=0.0):
    """A low-pass whose cutoff moves: overlap-added FFT blocks. `cutoff(t)` in Hz, t in s."""
    mono = sig.ndim == 1
    x = sig[None] if mono else sig
    n = x.shape[-1]
    size, hop = 2048, 512
    win = np.hanning(size)
    pad = np.zeros((x.shape[0], n + size))
    pad[:, :n] = x
    out = np.zeros_like(pad)
    norm = np.zeros(n + size)
    f = np.fft.rfftfreq(size, 1 / SR)
    for s in range(0, n, hop):
        fc = max(40.0, cutoff((s + size / 2) / SR))
        resp = 1 / np.sqrt(1 + (f / fc) ** 8) * (1 + res * np.exp(-0.5 * ((f - fc) / (fc * 0.18)) ** 2))
        blk = np.fft.irfft(np.fft.rfft(pad[:, s:s + size] * win, axis=-1) * resp, n=size, axis=-1)
        out[:, s:s + size] += blk * win
        norm[s:s + size] += win ** 2
    out = out[:, :n] / np.maximum(norm[:n], 1e-3)
    return out[0] if mono else out


def polyblep_saw(freq, d, phase0=0.0):
    n = int(d * SR)
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    # PolyBLEP correction around the discontinuity
    a = ph < dt
    t1 = ph[a] / dt[a]
    y[a] -= t1 + t1 - t1 * t1 - 1
    b = ph > 1 - dt
    t2 = (ph[b] - 1) / dt[b]
    y[b] -= t2 * t2 + t2 + t2 + 1
    return y


def env_adsr(d, a=0.01, dec=0.1, sus=0.8, r=0.1):
    t = tt(d + r)
    e = np.where(t < a, t / a, np.where(t < a + dec, 1 - (1 - sus) * (t - a) / dec, sus))
    e = np.where(t > d, e * np.clip(1 - (t - d) / r, 0, 1), e)
    return e


def env_exp(d, a=0.003, k=8.0):
    t = tt(d)
    return np.minimum(1, t / a) * np.exp(-k * t / d)


# ── instruments ────────────────────────────────────────────────────────────────────────────
def supersaw(notes, at, d, gain=0.05, cutoff=lambda t: 3000, res=0.3, voices=7, spread=0.22, a=0.01, r=0.25, verb=0.35, bus_name='chords'):
    total = d + r
    L = np.zeros(int(total * SR))
    R = np.zeros_like(L)
    for n in notes:
        for v in range(voices):
            det = (v - (voices - 1) / 2) / ((voices - 1) / 2) * spread
            w = polyblep_saw(midi(n + det), total, rng.random())
            pan = (v - (voices - 1) / 2) / ((voices - 1) / 2)
            L += w * (1 - pan) * 0.5
            R += w * (1 + pan) * 0.5
    e = env_adsr(d, a=a, dec=0.2, sus=0.85, r=r)[: len(L)]
    sig = np.vstack([L, R]) * e / (len(notes) * voices) * 3
    sig = sweep_lowpass(sig, lambda t: cutoff(at + t), res)
    place(bus_name, at, sig, gain, verb=verb)


def kick(at, gain=0.9):
    d = 0.5
    t = tt(d)
    f = 46 + 160 * np.exp(-t * 38) + 30 * np.exp(-t * 8)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = highpass(rng.standard_normal(int(0.004 * SR)), 2500) * 0.5
    s[: len(click)] += click
    place('kick', at, np.tanh(s * 2.2) * 0.8, gain)


def clap(at, gain=0.28, verb=0.3):
    d = 0.35
    t = tt(d)
    n = spectral(rng.standard_normal(len(t)), lambda f: np.exp(-0.5 * ((f - 1600) / 900) ** 2) + 0.3 * np.exp(-0.5 * ((f - 5000) / 2000) ** 2))
    e = np.zeros_like(t)
    for k, off in enumerate((0, 0.011, 0.022)):
        e += (t >= off) * np.exp(-(t - off) * (60 if k < 2 else 14)) * (t >= off)
    s = n * e
    place('drums', at, s / (np.max(np.abs(s)) + 1e-9), gain, 0.05, verb)


def hat(at, gain=0.06, d=0.045, pan=0.25, open_=False):
    if open_:
        d = 0.22
    s = highpass(rng.standard_normal(int(d * SR)), 8000, 3) * env_exp(d, 0.001, 6 if open_ else 9)
    place('drums', at, s, gain, pan, verb=0.08)


def snare(at, gain=0.2):
    d = 0.22
    t = tt(d)
    s = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.6 + highpass(rng.standard_normal(len(t)), 1800) * np.exp(-t * 18)
    place('drums', at, s, gain, 0.0, verb=0.25)


def bass_note(n, at, d, gain=0.22):
    t = tt(d)
    f = midi(n)
    s = polyblep_saw(f, d) * 0.6 + np.sin(2 * np.pi * f * t) * 0.9 + np.sin(np.pi * f * t) * 0.5
    s = sweep_lowpass(s, lambda x: 420 + 900 * np.exp(-x * 18))
    place('bass', at, np.tanh(s * 1.6) * env_adsr(d - 0.02, 0.004, 0.08, 0.7, 0.02)[: len(s)], gain)


def pluck(n, at, gain=0.06, pan=0.0, d=0.28, bright=4200, bus_name='lead'):
    t = tt(d)
    f = midi(n)
    s = polyblep_saw(f, d) * 0.7 + polyblep_saw(f * 1.004, d) * 0.5
    s = lowpass(s, bright, 2) * env_exp(d, 0.002, 7)
    place(bus_name, at, s, gain, pan, verb=0.3)


def bell(f, at, gain=0.15, d=2.0, ratio=3.5, index=2.0, pan=0.0, verb=0.5):
    t = tt(d)
    I = index * np.exp(-t * 4)
    s = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t)) * env_exp(d, 0.002, 5.5)
    place('ui', at, s, gain, pan, verb)


def tick(at, gain=0.12, f=3000.0, pan=0.0):
    d = 0.04
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 150) + highpass(rng.standard_normal(len(t)), 5000) * np.exp(-t * 420) * 0.5
    place('ui', at, s, gain, pan, verb=0.1)


def click(at, gain=0.12, pan=0.0):
    d = 0.03
    t = tt(d)
    f = rng.uniform(2200, 3800)
    s = spectral(rng.standard_normal(len(t)), lambda x: np.exp(-0.5 * ((x - f) / 900) ** 2)) * np.exp(-t * 260)
    s = s / (np.max(np.abs(s)) + 1e-9) + np.sin(2 * np.pi * 170 * t) * np.exp(-t * 110) * 0.35
    place('ui', at, s, gain, pan, verb=0.04)


def bandsweep(d, f0, f1, q=1.1):
    n = int(d * SR)
    noise = rng.standard_normal(n + 2048)
    out = np.zeros(n + 2048)
    size, hop = 1024, 256
    win = np.hanning(size)
    freqs = np.fft.rfftfreq(size, 1 / SR)
    for s in range(0, n, hop):
        fc = f0 * (f1 / f0) ** (s / n)
        resp = np.exp(-0.5 * ((freqs - fc) / (fc / q)) ** 2)
        out[s:s + size] += np.fft.irfft(np.fft.rfft(noise[s:s + size] * win) * resp, n=size) * win
    out = out[:n]
    return out / (np.max(np.abs(out)) + 1e-9)


def whoosh(at, d=0.7, f0=300, f1=5000, gain=0.25, peak=0.6, pan=0.0, verb=0.3):
    s = bandsweep(d, f0, f1)
    x = tt(d) / d
    e = np.where(x < peak, (x / peak) ** 2, np.exp(-6 * (x - peak) / (1 - peak + 1e-6)))
    place('fx', at, s * e, gain, pan, verb)


def riser(at, d, gain=0.2, f0=250, f1=8000):
    s = bandsweep(d, f0, f1, 0.8)
    t = tt(d)
    tone = polyblep_saw(220 * 2 ** (2.5 * t / d), d) * 0.15
    place('fx', at, (s + lowpass(tone, 3000)) * (t / d) ** 2.4, gain, 0.0, verb=0.5)


def reverse_cymbal(end, d=1.0, gain=0.22):
    s = highpass(rng.standard_normal(int(d * SR)), 5000, 2)
    e = (tt(d) / d) ** 3
    place('fx', end - d, s * e, gain, 0.0, verb=0.4)


def impact(at, gain=0.7, d=2.6):
    t = tt(d)
    f = 32 + 70 * np.exp(-t * 7)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.8)
    s += lowpass(rng.standard_normal(len(t)), 1200) * np.exp(-t * 10) * 0.6
    s += highpass(rng.standard_normal(len(t)), 6000) * np.exp(-t * 6) * 0.15
    place('fx', at, np.tanh(s * 1.4), gain, 0.0, verb=0.45)


def glitch(at, d=0.5, gain=0.2):
    n = int(d * SR)
    out = np.zeros(n)
    k = 0
    r = np.random.default_rng(int(at * 100))
    while k < n:
        L = int(r.uniform(0.012, 0.05) * SR)
        f = r.uniform(80, 1600)
        seg = np.sign(np.sin(2 * np.pi * f * np.arange(L) / SR)) * r.uniform(0.3, 1)
        out[k:k + L] = seg[: max(0, min(L, n - k))]
        k += L + int(r.uniform(0, 0.02) * SR)
    out = lowpass(out, 4000) * np.exp(-tt(d) * 3)
    place('fx', at, out, gain, 0.0, verb=0.2)


# ── the arrangement ────────────────────────────────────────────────────────────────────────
F_M = [54, 57, 61, 64]   # F#m(add b3..)  F#3 A3 C#4 E4
D_M = [50, 57, 62, 66]   # D  A  D  F#
A_M = [52, 57, 61, 64]   # E  A  C# E  (A/E)
E_M = [52, 56, 59, 66]   # E  G# B  F#
PROG = [F_M, D_M, A_M, E_M]
ROOTS = [42, 38, 45, 40]  # F#2 D2 A2 E2

GROOVE = [(8.0, 19.4), (20.2, 30.0), (34.0, 44.0), (46.0, 50.0)]
in_groove = lambda t: any(a <= t < b for a, b in GROOVE)
BREAK = (30.0, 34.0)

# intro: a ticking clock, a sub pulse, filtered stabs answering each question card
for i in range(int(4.0 / 0.25)):
    at = i * 0.25
    hat(at, 0.02 + 0.03 * (at / 4), pan=-0.3 if i % 2 else 0.3)
for i in range(8):
    bass_note(30, i * 0.5, 0.45, 0.14)
for at in (0.5, 1.3, 2.1, 2.9, 3.5):
    supersaw([54, 61, 66], at, 0.25, gain=0.06, cutoff=lambda t: 1600, r=0.5, verb=0.6)
    whoosh(at - 0.3, 0.5, 600, 4000, 0.12, 0.7, pan=0.3)
riser(1.6, 2.4, 0.18)
reverse_cymbal(4.0, 1.2, 0.25)
impact(3.98, 0.6)

# the beam: air and a sub, then the mark
supersaw(F_M, 4.0, 2.0, gain=0.05, cutoff=lambda t: 600 + 1400 * min(1, (t - 4) / 2), a=0.6, r=0.6, verb=0.7)
whoosh(5.0, 1.0, 200, 3000, 0.22, 0.75)
impact(6.0, 0.6)
bell(midi(78), 6.0, 0.14, 2.6, 1.0, 0.8, verb=0.8)
bell(midi(85), 6.02, 0.08, 2.6, 1.0, 0.5, 0.3, verb=0.8)
# build into the drop
supersaw(D_M, 6.0, 2.0, gain=0.05, cutoff=lambda t: 500 + 4500 * ((t - 6) / 2) ** 2, res=0.8, a=0.05, r=0.05, verb=0.4)
for k in range(16):
    at = 6.0 + 2.0 * (1 - (1 - k / 16) ** 1.6)
    snare(at, 0.05 + 0.1 * k / 16)
riser(6.0, 2.0, 0.22)
reverse_cymbal(8.0, 1.0, 0.25)

# the groove
for bar_i, at in enumerate(np.arange(8.0, 50.0, 2.0)):
    chord = PROG[bar_i % 4]
    root = ROOTS[bar_i % 4]
    breakdown = BREAK[0] <= at < BREAK[1]
    stop = 19.4 <= at + 1.99 and at < 20.2   # the cache expires: the music drops out
    if breakdown:
        supersaw(chord, at, 2.0, gain=0.045, cutoff=lambda t: 900, a=0.3, r=0.4, verb=0.7)
        continue
    if at >= 44.0 and at < 46.0:
        continue  # the riser into the last drop owns these bars
    hi = 46.0 <= at
    cutoff = (lambda t: 5200 if hi else 3600 + 800 * np.sin(t))
    supersaw(chord, at, 1.95, gain=0.06 if not hi else 0.07, cutoff=cutoff, res=0.25, voices=7, a=0.01, r=0.15)
    supersaw([chord[0] + 12, chord[2] + 12], at, 1.95, gain=0.025, cutoff=lambda t: 6500, voices=5, spread=0.15, r=0.15, bus_name='lead')
    for e8 in range(8):
        t8 = at + e8 * 0.25
        if not in_groove(t8):
            continue
        bass_note(root + (12 if e8 % 2 else 0), t8, 0.24, 0.2)
    for b in range(4):
        tb = at + b * 0.5
        if not in_groove(tb):
            continue
        kick(tb)
        if b % 2 == 1:
            clap(tb)
        hat(tb + 0.25, 0.07, pan=0.2, open_=(b % 2 == 1))
        hat(tb + 0.125, 0.025, pan=-0.3)
        hat(tb + 0.375, 0.025, pan=-0.3)
    pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    for i in range(16):
        t16 = at + i * 0.125
        if in_groove(t16):
            pluck(chord[pattern[i % 8]] + 12, t16, 0.05 + 0.02 * (i % 4 == 0), pan=-0.5 + (i % 8) / 7)

# the final chord rings out
supersaw(F_M + [66, 73], 50.0, 1.4, gain=0.08, cutoff=lambda t: 4000 - 2500 * min(1, (t - 50) / 2), a=0.01, r=1.6, verb=0.8)
bass_note(42, 50.0, 1.6, 0.25)
kick(50.0, 1.0)
impact(50.0, 0.5)

# sidechain: everything melodic ducks under the kick
duck = np.ones(N)
for at in [a + b * 0.5 for a in np.arange(8.0, 50.5, 2.0) for b in range(4)]:
    if not (in_groove(at) or at == 50.0):
        continue
    i = int(at * SR)
    L = int(0.42 * SR)
    seg = 1 - 0.72 * np.exp(-tt(0.42) / 0.11) * np.minimum(1, tt(0.42) / 0.004)
    duck[i:i + L] = np.minimum(duck[i:i + min(L, N - i)], seg[: min(L, N - i)])
for k in ('bass', 'chords', 'lead'):
    bus[k] *= duck

# ── sound design, frame-locked to src/shots.js ──────────────────────────────────────────────
# logo → product (iris), product moves
whoosh(7.65, 0.7, 4000, 300, 0.2, 0.3)
whoosh(9.0, 0.9, 300, 3000, 0.16, 0.6, pan=0.4)
whoosh(10.9, 1.0, 200, 2500, 0.16, 0.6, pan=-0.4)
whoosh(12.4, 0.9, 2500, 300, 0.12, 0.4)
for i in range(4):
    pluck(78 + [0, 3, 7, 12][i], 8.55 + i * 0.32, 0.08, -0.3 + 0.2 * i, bus_name='ui')
# product → cache: zoom-through
riser(12.9, 1.4, 0.16, 400, 9000)
whoosh(13.6, 0.8, 500, 9000, 0.3, 0.8)
impact(14.3, 0.35, 1.6)
# the cache
for at in (14.6, 15.6):
    tick(at, 0.2, 2600)


def lapse_left(t):
    p = np.clip((t - 16.0) / 2.2, 0, 1)
    e = np.where(p < 0.5, 4 * p ** 3, 1 - (-2 * p + 2) ** 3 / 2)
    return 3598.6 + (60 - 3598.6) * e


ts = np.arange(16.0, 18.2, 1 / 600)
mins = np.floor(lapse_left(ts) / 60)
for k, i in enumerate(np.nonzero(np.diff(mins))[0]):
    tick(ts[i + 1], 0.08, 2000 + 900 * (k % 2), 0.2 if k % 2 else -0.2)
riser(16.0, 2.2, 0.08, 300, 4000)
bell(midi(76), 18.2, 0.16, 1.4, 1.0, 0.3)
bell(midi(72), 18.38, 0.12, 1.4, 1.0, 0.3)
ts = np.arange(18.2, 19.4, 1 / 1200)
p = (ts - 18.2) / 1.2
secs = np.ceil(60 - 60 * (p ** 3 * 0.4 + p * 0.6))
for k, i in enumerate(np.nonzero(np.diff(secs))[0]):
    if k % 2 == 0:
        tick(ts[i + 1], 0.06 + 0.06 * k / 60, 1700 + 25 * k)
riser(18.4, 1.0, 0.16, 300, 7000)
impact(19.4, 0.55, 1.4)
glitch(19.42, 0.6, 0.18)
bell(midi(45), 19.4, 0.14, 1.4, 1.41, 2.4, verb=0.6)
reverse_cymbal(20.2, 0.8, 0.28)
impact(20.2, 0.7, 2.2)
for i, n in enumerate((78, 81, 85, 90, 93)):
    bell(midi(n), 20.2 + i * 0.05, 0.08, 1.6, 2.0, 0.8, -0.4 + 0.2 * i)
for i in range(3):
    whoosh(20.6 + i * 0.16, 0.35, 3000, 600, 0.1, 0.2, pan=0.4)
# cache → limits: whip
whoosh(21.65, 0.6, 300, 6000, 0.3, 0.5, pan=-0.6)
for i in range(2):
    pluck(81 + 4 * i, 22.15 + i * 0.12, 0.08, bus_name='ui')
whoosh(23.7, 1.0, 300, 3000, 0.18, 0.6)
for a, b in ((24.8, 25.5), (25.9, 26.9), (27.25, 28.1)):
    riser(a, b - a, 0.1, 400, 5000)
impact(26.75, 0.35, 1.2)
bell(midi(80), 26.75, 0.14, 1.4, 1.0, 0.4)
impact(27.9, 0.45, 1.4)
bell(midi(78), 27.9, 0.16, 1.8, 1.41, 1.8)
whoosh(28.3, 1.4, 2500, 300, 0.12, 0.3)
# limits → context: the light-line wipe
whoosh(29.65, 0.7, 6000, 800, 0.22, 0.35)
tick(29.98, 0.12, 4200)
# the context: cards drop, /clear blasts them
for i in range(9):
    at = 30.2 + i * 0.2 + 0.3
    t = tt(0.12)
    thud = np.sin(2 * np.pi * (90 + i * 8) * t) * np.exp(-t * 40)
    place('ui', at, thud, 0.16)
    click(at, 0.05)
whoosh(32.0, 0.3, 300, 3000, 0.14, 0.9)
impact(32.4, 0.35, 1.0)
glitch(32.55, 0.4, 0.14)
whoosh(32.55, 0.9, 3000, 200, 0.22, 0.15)
# context → terminal: whip; the fold; the flip
whoosh(33.65, 0.6, 400, 6000, 0.28, 0.5, pan=0.6)
for at in (34.95, 36.25):
    click(at, 0.2)
    whoosh(at - 0.05, 0.4, 2000, 500, 0.08, 0.3)
whoosh(36.9, 1.2, 200, 4000, 0.26, 0.5)
impact(38.0, 0.3, 1.2)
for i in range(4):
    tick(37.95 + i * 0.25, 0.08, 2600 + 200 * i)
# install: typing, enter, success
for i in range(0, 42, 2):
    click(39.45 + 1.1 * i / 42, 0.1)
click(40.65, 0.22)
bell(midi(81), 40.75, 0.08, 1.0, 2.0, 0.5)
for i in range(0, 37, 2):
    click(40.95 + 0.9 * i / 37, 0.1)
click(41.95, 0.24)
for i, n in enumerate((78, 85, 90)):
    bell(midi(n), 42.0 + i * 0.06, 0.12, 1.6, 2.0, 0.6, -0.2 + 0.2 * i)
impact(42.0, 0.3, 1.2)
# into the finale
riser(44.0, 2.0, 0.26, 200, 10000)
for k in range(24):
    at = 44.0 + 2.0 * (1 - (1 - k / 24) ** 1.7)
    snare(at, 0.05 + 0.13 * k / 24)
supersaw(E_M, 44.0, 2.0, gain=0.05, cutoff=lambda t: 400 + 6000 * ((t - 44) / 2) ** 2.2, res=0.9, a=0.1, r=0.05, verb=0.4)
reverse_cymbal(46.0, 1.4, 0.3)
impact(46.0, 0.8, 3.0)
bell(midi(78), 47.5, 0.14, 2.6, 1.0, 0.6, verb=0.8)
bell(midi(85), 47.52, 0.08, 2.6, 1.0, 0.4, 0.3, verb=0.8)
whoosh(47.3, 1.3, 600, 8000, 0.12, 0.5)

# ── reverb, mix, master ────────────────────────────────────────────────────────────────────
ir_t = tt(2.8)
ir = rng.standard_normal((2, len(ir_t))) * np.exp(-ir_t / 0.6)
ir = lowpass(ir, 6000)
ir[:, : int(0.015 * SR)] = 0
ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
L = 1 << int(np.ceil(np.log2(N + ir.shape[1])))
wet = np.fft.irfft(np.fft.rfft(send, L) * np.fft.rfft(ir, L), L)[:, :N] * 0.7

LEVEL = {'kick': 1.0, 'drums': 0.9, 'bass': 0.95, 'chords': 1.0, 'lead': 0.8, 'fx': 0.9, 'ui': 0.9}
mix = sum(bus[k] * LEVEL[k] for k in bus) + wet
mix = highpass(mix, 30, 3)
mix = np.tanh(mix * 1.3) / 1.3
fade = np.ones(N)
i0 = int(50.6 * SR)
fade[i0:] = np.linspace(1, 0, N - i0) ** 1.4
mix *= fade
mix *= 0.95 / np.max(np.abs(mix))

os.makedirs(OUT, exist_ok=True)
raw = os.path.join(OUT, 'score-raw.wav')
with wave.open(raw, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.2:LRA=9', '-ar', str(SR), os.path.join(OUT, 'score.wav')], check=True)
print('score.wav', f'{DUR:.0f}s')
