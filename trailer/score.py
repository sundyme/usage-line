"""usage-line trailer — the score. numpy only.

120 BPM in F# minor (F#m · D · A · E). Anti-aliased (PolyBLEP) supersaw chords through a
moving low-pass, a sidechain that breathes with the kick, a rolling bass, sixteenth plucks,
two drops, a light half-time stretch and a breakdown; every cut and UI event in the
picture has its sound on its frame (times from src/timeline.js and the shots).

    python3 score.py   →   out/score.wav, loudness-normalised to −14 LUFS by ffmpeg
"""
import os
import subprocess
import wave

import numpy as np

SR = 48_000
DUR = 48.0
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


# ── the arrangement (times from src/timeline.js and the shots) ───────────────────────────────
F_M = [54, 57, 61, 64]   # F#m(add 9 colour)
D_M = [50, 57, 62, 66]   # D
A_M = [52, 57, 61, 64]   # A/E
E_M = [52, 56, 59, 66]   # E
PROG = [F_M, D_M, A_M, E_M]
ROOTS = [42, 38, 45, 40]

# where the kick runs, and where the cache stops the music
GROOVE = [(8.0, 17.0), (18.0, 31.0), (36.0, 40.0), (42.0, 46.0)]
LIGHT = (31.0, 36.0)          # the light scene: no kick, half-time feel
in_groove = lambda t: any(a <= t < b for a, b in GROOVE)


def typing(t0, n, step, gain=0.09):
    for i in range(n):
        click(t0 + i * step + rng.uniform(-0.004, 0.004), gain * rng.uniform(0.8, 1.1), rng.uniform(-0.15, 0.15))


# 0–4.5 · the problem: a pad under the room, the keys, the cards piling up
supersaw(F_M, 0.0, 4.4, gain=0.035, cutoff=lambda t: 500 + 500 * t / 4.4, a=1.2, r=0.6, verb=0.7)
for i in range(18):
    hat(i * 0.25, 0.012 + 0.02 * (i / 18), pan=-0.3 if i % 2 else 0.3)
typing(0.55, 6, 0.075)
click(1.3, 0.2)
bell(midi(81), 1.32, 0.07, 0.8, 2.0, 0.6)
typing(1.62, 8, 0.065)
click(2.25, 0.2)
bell(midi(78), 2.28, 0.07, 0.8, 2.0, 0.6)
for i in range(6):
    whoosh(2.4 + i * 0.08, 0.4, 2500, 600, 0.06, 0.25, pan=-0.6 + 0.25 * i)
riser(1.9, 1.1, 0.08, 300, 3000)
impact(3.0, 0.45, 1.6)
bass_note(30, 3.0, 1.4, 0.22)
whoosh(4.3, 0.5, 400, 6000, 0.22, 0.75)

# 4.5–8 · the questions, one on each half-bar, building
for k, at in enumerate((4.55, 5.15, 5.75, 6.35)):
    supersaw(PROG[k % 4], at, 0.42, gain=0.06, cutoff=lambda t: 2400, a=0.005, r=0.25, verb=0.4)
    kick(at, 0.75)
    bass_note(ROOTS[k % 4], at, 0.45, 0.2)
    clap(at + 0.3, 0.16)
for i in range(14):
    hat(4.5 + i * 0.125, 0.03 + 0.02 * (i % 2 == 0))
typing(7.0, 10, 0.07, 0.08)
supersaw(D_M, 6.95, 1.0, gain=0.04, cutoff=lambda t: 500 + 6000 * ((t - 6.95) / 1.0) ** 2.4, res=0.8, a=0.05, r=0.02, verb=0.3)
riser(6.6, 1.35, 0.22, 200, 9000)
for k in range(12):
    snare(7.0 + 0.9 * (1 - (1 - k / 12) ** 1.5), 0.04 + 0.1 * k / 12)
reverse_cymbal(8.0, 1.0, 0.26)

# the groove
for bar_i, at in enumerate(np.arange(8.0, 46.0, 2.0)):
    chord = PROG[bar_i % 4]
    root = ROOTS[bar_i % 4]
    light = LIGHT[0] <= at < LIGHT[1]
    if 40.0 <= at < 42.0:
        continue  # the breakdown owns these bars
    if light:
        supersaw(chord, at, 1.95, gain=0.04, cutoff=lambda t: 1600, a=0.2, r=0.4, verb=0.7)
        for i in range(8):
            pluck(chord[[0, 2, 1, 3][i % 4]] + 12, at + i * 0.25, 0.045, pan=-0.4 + 0.1 * i)
        bass_note(root, at, 1.9, 0.12)
        continue
    hi = at >= 42.0
    cutoff = (lambda t: 5400) if hi else (lambda t: 3600 + 700 * np.sin(t))
    supersaw(chord, at, 1.95, gain=0.07 if hi else 0.058, cutoff=cutoff, res=0.25, a=0.01, r=0.15)
    supersaw([chord[0] + 12, chord[2] + 12], at, 1.95, gain=0.024, cutoff=lambda t: 6500, voices=5, spread=0.15, r=0.15, bus_name='lead')
    for e8 in range(8):
        t8 = at + e8 * 0.25
        if in_groove(t8):
            bass_note(root + (12 if e8 % 2 else 0), t8, 0.24, 0.2)
    for b in range(4):
        tb = at + b * 0.5
        if not in_groove(tb):
            continue
        kick(tb)
        if b % 2 == 1:
            clap(tb)
        hat(tb + 0.25, 0.065, pan=0.2, open_=(b % 2 == 1))
        hat(tb + 0.125, 0.022, pan=-0.3)
        hat(tb + 0.375, 0.022, pan=-0.3)
    pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    for i in range(16):
        t16 = at + i * 0.125
        if in_groove(t16):
            pluck(chord[pattern[i % 8]] + 12, t16, 0.045 + 0.02 * (i % 4 == 0), pan=-0.5 + (i % 8) / 7)

# sidechain
duck = np.ones(N)
for at in [a + b * 0.5 for a in np.arange(4.5, 48.0, 2.0) for b in range(4)] + [4.55, 5.15, 5.75, 6.35]:
    if not (in_groove(at) or at in (4.55, 5.15, 5.75, 6.35, 46.0)):
        continue
    i = int(at * SR)
    if i >= N:
        continue
    L = int(0.42 * SR)
    seg = 1 - 0.7 * np.exp(-tt(0.42) / 0.11) * np.minimum(1, tt(0.42) / 0.004)
    n = min(L, N - i)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[:n])
for k in ('bass', 'chords', 'lead'):
    bus[k] *= duck

# ── sound design, frame-locked to the shots ─────────────────────────────────────────────────
# 8 · the drop: the four rings land on the beat, rising
impact(8.0, 0.8, 2.6)
whoosh(7.95, 0.9, 6000, 300, 0.2, 0.15)
for i, at in enumerate((8.15, 8.4, 8.65, 8.9)):
    whoosh(at - 0.42, 0.45, 500, 7000, 0.12, 0.9, pan=-0.5 + i / 3)
    bell(midi(73 + [0, 4, 7, 12][i]), at, 0.12, 1.4, 2.0, 1.0, -0.4 + 0.27 * i)
typing(9.3, 10, 0.045, 0.08)
whoosh(10.45, 1.0, 300, 4000, 0.18, 0.55)
for i, at in enumerate((10.5, 10.62, 10.74)):
    tick(at, 0.08, 3200 + 400 * i)
bell(midi(81), 11.5, 0.07, 1.2, 1.0, 0.3)
# 12.5 · zoom-through into the cache
riser(11.9, 0.65, 0.14, 400, 9000)
whoosh(12.35, 0.6, 500, 9000, 0.28, 0.75)
impact(12.85, 0.3, 1.2)
# the cache: live seconds, the time-lapse, the last minute, expiry, refill
for at in (12.9, 13.9):
    tick(at, 0.18, 2600)


def lapse_left(t):
    p = np.clip((t - 14.0) / 2.0, 0, 1)
    e = np.where(p < 0.5, 4 * p ** 3, 1 - (-2 * p + 2) ** 3 / 2)
    return 3598.9 + (60 - 3598.9) * e


ts = np.arange(14.0, 16.0, 1 / 600)
mins = np.floor(lapse_left(ts) / 60)
for k, i in enumerate(np.nonzero(np.diff(mins))[0]):
    tick(ts[i + 1], 0.06, 2000 + 900 * (k % 2), 0.2 if k % 2 else -0.2)
riser(14.0, 2.0, 0.07, 300, 4000)
bell(midi(76), 16.0, 0.15, 1.2, 1.0, 0.3)
bell(midi(72), 16.15, 0.11, 1.2, 1.0, 0.3)
ts = np.arange(16.0, 17.0, 1 / 1200)
secs = np.ceil(60 * (1 - ((ts - 16.0) / 1.0) ** 1.25))
for k, i in enumerate(np.nonzero(np.diff(secs))[0]):
    if k % 2 == 0:
        tick(ts[i + 1], 0.05 + 0.06 * k / 60, 1700 + 25 * k)
riser(16.2, 0.8, 0.14, 300, 7000)
impact(17.0, 0.55, 1.3)
glitch(17.02, 0.6, 0.2)
bell(midi(45), 17.0, 0.14, 1.3, 1.41, 2.4, verb=0.6)
reverse_cymbal(18.0, 0.8, 0.26)
impact(18.0, 0.7, 2.0)
for i, n in enumerate((78, 81, 85, 90, 93)):
    bell(midi(n), 18.0 + i * 0.05, 0.08, 1.5, 2.0, 0.8, -0.4 + 0.2 * i)
# chapter irises
for at in (19.0, 23.0, 26.5):
    whoosh(at - 0.1, 0.5, 300, 5000, 0.2, 0.7, pan=0.3)
    tick(at + 0.3, 0.07, 3600)
# 5h: two thresholds
bell(midi(80), 21.1, 0.14, 1.3, 1.0, 0.4)
impact(21.1, 0.25, 1.0)
impact(21.88, 0.45, 1.3)
bell(midi(78), 21.88, 0.16, 1.6, 1.41, 1.8)
# 7d: the bars, one note each
for i in range(5):
    pluck(73 + [0, 2, 4, 7, 9][i], 23.4 + i * 0.16 + 0.12, 0.08, -0.5 + 0.25 * i, bus_name='ui')
# context: messages, /clear, the blast
for i in range(20):
    tick(26.85 + i * 0.14, 0.035, 2200 + (i % 3) * 300, -0.3 if i % 3 else 0.3)
typing(29.45, 6, 0.07, 0.1)
click(29.95, 0.2)
impact(29.95, 0.45, 1.2)
whoosh(29.95, 0.9, 4000, 200, 0.24, 0.12)
glitch(29.97, 0.35, 0.12)
# 31 · mosaic into the light; the window narrows; the flip
glitch(31.0, 0.45, 0.14)
whoosh(31.0, 0.5, 6000, 1500, 0.12, 0.3)
for at in (31.5, 32.35):
    whoosh(at, 0.8, 1800, 500, 0.09, 0.5)
    tick(at + 0.8, 0.07, 2400)
whoosh(33.7, 0.8, 200, 4000, 0.22, 0.55)
impact(34.4, 0.25, 1.0)
# 36 · install
whoosh(35.9, 0.5, 300, 6000, 0.2, 0.7)
typing(36.45, 43, 0.021, 0.06)
click(37.4, 0.2)
bell(midi(81), 37.5, 0.08, 1.0, 2.0, 0.5)
typing(37.7, 27, 0.024, 0.06)
click(38.45, 0.22)
impact(38.5, 0.35, 1.2)
for i, n in enumerate((78, 85, 90)):
    bell(midi(n), 38.5 + i * 0.06, 0.11, 1.5, 2.0, 0.6, -0.2 + 0.2 * i)
for i in range(4):
    tick(38.8 + i * 0.12, 0.06, 2800 + 250 * i)
# 40 · the breakdown under the payoff line, and the run into the last drop
glitch(40.0, 0.4, 0.16)
supersaw(F_M, 40.0, 2.0, gain=0.05, cutoff=lambda t: 700 + 5000 * ((t - 40) / 2) ** 2.2, res=0.9, a=0.1, r=0.05, verb=0.6)
bass_note(42, 40.0, 1.9, 0.18)
riser(40.2, 1.8, 0.24, 200, 10000)
for k in range(20):
    snare(40.6 + 1.4 * (1 - (1 - k / 20) ** 1.7), 0.05 + 0.12 * k / 20)
reverse_cymbal(42.0, 1.2, 0.3)
# 42 · the last drop: the ring closes, the name types, the link clicks
impact(42.0, 0.85, 3.0)
whoosh(42.15, 0.8, 400, 6000, 0.12, 0.85)
bell(midi(78), 42.95, 0.15, 2.4, 1.0, 0.6, verb=0.8)
bell(midi(85), 42.97, 0.08, 2.4, 1.0, 0.4, 0.3, verb=0.8)
typing(43.0, 10, 0.05, 0.08)
bell(midi(90), 44.05, 0.06, 1.0, 2.0, 0.4)
click(45.22, 0.22)
bell(midi(85), 45.25, 0.08, 1.4, 1.0, 0.4)
# the last chord rings out
supersaw(F_M + [66, 73], 46.0, 1.2, gain=0.075, cutoff=lambda t: 4200 - 2600 * min(1, (t - 46) / 2), a=0.01, r=1.4, verb=0.8)
bass_note(42, 46.0, 1.4, 0.24)
kick(46.0, 1.0)
impact(46.0, 0.4)

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
i0 = int(46.9 * SR)
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
