"""usage-line trailer — the score. numpy only.

120 BPM in F# minor (F#m · D · A · E). Anti-aliased (PolyBLEP) supersaw chords through a
moving low-pass, a sidechain that breathes with the kick, a rolling bass, sixteenth plucks,
a soft half-time opening, two drops, a stop where the cache expires, a light stretch and a breakdown; every cut and UI event in the
picture has its sound on its frame (times from src/timeline.js and the shots).

    python3 score.py   →   out/score.wav, loudness-normalised to −14 LUFS by ffmpeg
"""
import os
import subprocess
import wave

import numpy as np

SR = 48_000
DUR = 35.0
N = int(SR * DUR)
BEAT = 0.5
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
rng = np.random.default_rng(52)

bus = {k: np.zeros((2, N)) for k in ('kick', 'drums', 'bass', 'chords', 'lead', 'fx', 'ui')}
send = np.zeros((2, N))
KICKS = []


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
    KICKS.append(at)


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


def typing(t0, n, step, gain=0.09):
    for i in range(n):
        click(t0 + i * step + rng.uniform(-0.004, 0.004), gain * rng.uniform(0.8, 1.1), rng.uniform(-0.15, 0.15))


def glass_pop(at, gain=1.0, pan=0.3):
    """the liquid-glass popover: a soft air puff and a bright, glassy ping"""
    whoosh(at - 0.05, 0.35, 900, 5200, 0.09 * gain, 0.35, pan=pan, verb=0.4)
    bell(midi(88), at + 0.04, 0.05 * gain, 0.7, 3.01, 1.2, pan, verb=0.6)


def glass_close(at, gain=1.0):
    whoosh(at, 0.25, 4000, 900, 0.06 * gain, 0.3, pan=0.3, verb=0.3)


def bars(t0, t1, mode, start=0):
    """the groove from t0 to t1 in two-second bars; mode: 'soft' · 'full' · 'hi' · 'light'"""
    for k, at in enumerate(np.arange(t0, t1 - 1e-6, 2.0)):
        d = min(2.0, t1 - at)
        chord, root = PROG[(start + k) % 4], ROOTS[(start + k) % 4]
        if mode == 'light':
            supersaw(chord, at, d - 0.05, gain=0.04, cutoff=lambda t: 1600, a=0.2, r=0.4, verb=0.7)
            for i in range(int(d * 4)):
                pluck(chord[[0, 2, 1, 3][i % 4]] + 12, at + i * 0.25, 0.045, pan=-0.4 + 0.1 * i)
            bass_note(root, at, d - 0.1, 0.12)
            continue
        if mode == 'soft':
            supersaw(chord, at, d - 0.05, gain=0.042, cutoff=lambda t: 1400 + 300 * np.sin(t), a=0.08, r=0.3, verb=0.6)
            for i in range(int(d * 4)):
                pluck(chord[[0, 2, 1, 3, 2, 1][i % 6]] + 12, at + i * 0.25, 0.038 + 0.012 * (i % 4 == 0), pan=-0.4 + 0.1 * i)
            bass_note(root, at, d - 0.05, 0.14)
            for b in range(int(d * 2)):
                tb = at + b * 0.5
                if b % 2 == 0:
                    kick(tb, 0.55)
                hat(tb + 0.25, 0.03, pan=0.2)
            continue
        hi = mode == 'hi'
        cutoff = (lambda t: 4200) if hi else (lambda t: 2600 + 500 * np.sin(t))
        supersaw(chord, at, d - 0.05, gain=0.055 if hi else 0.042, cutoff=cutoff, res=0.25, a=0.01, r=0.15)
        supersaw([chord[0] + 12, chord[2] + 12], at, d - 0.05, gain=0.024, cutoff=lambda t: 6500, voices=5, spread=0.15, r=0.15, bus_name='lead')
        for e8 in range(int(d * 4)):
            bass_note(root + (12 if e8 % 2 else 0), at + e8 * 0.25, 0.24, 0.2)
        for b in range(int(d * 2)):
            tb = at + b * 0.5
            kick(tb)
            if b % 2 == 1:
                clap(tb)
            hat(tb + 0.25, 0.065, pan=0.2, open_=(b % 2 == 1))
            hat(tb + 0.125, 0.022, pan=-0.3)
            hat(tb + 0.375, 0.022, pan=-0.3)
        pattern = [0, 2, 1, 3, 2, 1, 3, 2]
        for i in range(int(d * 8)):
            pluck(chord[pattern[i % 8]] + 12, at + i * 0.125, 0.045 + 0.02 * (i % 4 == 0), pan=-0.5 + (i % 8) / 7)


# 0–1 · the ring fills, in close-up: ticks quicken into the hit
for k, x in enumerate(0.15 + 0.8 * (1 - (1 - np.linspace(0, 1, 22)) ** 2.2)):
    tick(x, 0.02 + 0.05 * k / 22, 1800 + 70 * k, -0.3 + 0.03 * k)
riser(0.1, 0.9, 0.16, 200, 9000)
supersaw(F_M, 0.0, 1.0, gain=0.03, cutoff=lambda t: 400 + 5000 * t ** 2.4, res=0.7, a=0.2, r=0.02, verb=0.5)
reverse_cymbal(1.0, 0.8, 0.22)
# 1 · HIT — the pull back; the row; it docks; the name
bars(1.0, 11.0, 'full')
impact(1.0, 0.85, 2.6)
whoosh(0.98, 1.0, 6000, 300, 0.22, 0.12)
bell(midi(85), 1.02, 0.11, 2.2, 2.0, 1.0, verb=0.8)
for i in range(3):
    bell(midi([76, 80, 83][i]), 1.2 + 0.25 * i, 0.09, 1.4, 2.0, 1.0, -0.3 + 0.3 * i)
whoosh(2.3, 1.0, 250, 3000, 0.12, 0.6)
bell(midi(90), 3.15, 0.05, 1.6, 3.01, 0.8, verb=0.8)
bell(midi(78), 3.05, 0.06, 1.8, 1.0, 0.4, verb=0.8)
riser(4.3, 0.7, 0.12, 300, 8000)
whoosh(4.55, 0.5, 500, 9000, 0.2, 0.75)
# 5 · CACHE (the v5 shot, 17 s earlier)
glass_pop(5.15, 1.2, 0.3)
for at in (5.6,):
    tick(at, 0.08, 2600, 0.3)
ts = np.arange(6.6, 7.4, 1 / 600)
p = np.clip((ts - 6.6) / 0.8, 0, 1)
left = 3598.6 + (720 - 3598.6) * np.where(p < 0.5, 4 * p ** 3, 1 - (-2 * p + 2) ** 3 / 2)
for k, i in enumerate(np.nonzero(np.diff(np.floor(left / 120)))[0]):
    tick(ts[i + 1], 0.04, 2000 + 900 * (k % 2), 0.3 if k % 2 else 0.1)
for m in (8.6, 12.15):
    whoosh(m - 0.62, 0.66, 300, 5000, 0.16, 0.85, pan=-0.4)
    impact(m, 0.3, 1.4)
    for i, n in enumerate((78, 81, 85, 90)):
        bell(midi(n), m + i * 0.05, 0.06, 1.5, 2.0, 0.8, 0.3 - 0.1 * i)
ts = np.arange(9.5, 10.1, 1 / 600)
p = np.clip((ts - 9.5) / 0.6, 0, 1)
left = 3599.6 + (59 - 3599.6) * np.where(p < 0.5, 4 * p ** 3, 1 - (-2 * p + 2) ** 3 / 2)
for k, i in enumerate(np.nonzero(np.diff(np.floor(left / 240)))[0]):
    tick(ts[i + 1], 0.04, 2000 + 900 * (k % 2), 0.3 if k % 2 else 0.1)
ts = np.arange(10.1, 11.0, 1 / 1200)
secs = np.ceil(59 * (1 - ((ts - 10.1) / 0.9) ** 1.3))
for k, i in enumerate(np.nonzero(np.diff(secs))[0]):
    if k % 2 == 0:
        tick(ts[i + 1], 0.04 + 0.05 * k / 59, 1700 + 25 * k, 0.3)
riser(10.2, 0.8, 0.1, 300, 6000)
impact(11.0, 0.45, 1.6)                                      # expired: the music stops
bell(midi(45), 11.0, 0.12, 1.4, 1.41, 2.4, verb=0.7)
supersaw(F_M, 11.0, 1.15, gain=0.025, cutoff=lambda t: 600, a=0.3, r=0.4, verb=0.8)
bars(12.15, 13.0, 'soft', start=3)
# 13 · LIMITS
bars(13.0, 18.0, 'full', start=1)
whoosh(12.85, 0.55, 400, 7000, 0.2, 0.75)
for i in range(3):
    glass_pop(13.05 + i * 0.12, 0.8, -0.4 + 0.4 * i)
bell(midi(80), 14.3, 0.1, 1.3, 1.0, 0.4)
bell(midi(78), 14.75, 0.12, 1.6, 1.41, 1.8)
impact(14.75, 0.25, 1.0)
whoosh(15.0, 0.5, 400, 3000, 0.08, 0.6)
for i in range(5):
    pluck(73 + [0, 2, 4, 7, 9][i], 15.3 + i * 0.16, 0.06, -0.5 + 0.25 * i, bus_name='ui')
whoosh(16.55, 0.5, 400, 3000, 0.08, 0.6)
riser(16.75, 0.6, 0.06, 400, 4000)
typing(17.4, 6, 0.065, 0.09)
impact(17.85, 0.4, 1.3)
whoosh(17.85, 0.8, 4000, 200, 0.18, 0.12)
# 18 · SIDE BY SIDE
whoosh(17.9, 0.5, 6000, 1500, 0.16, 0.3)
bars(18.0, 22.0, 'soft', start=2)
click(18.84, 0.18, -0.4)
bell(midi(76), 18.9, 0.05, 0.9, 2.0, 0.6, -0.4, verb=0.5)
bell(midi(57), 19.72, 0.08, 1.6, 1.41, 2.4, -0.4, verb=0.6)  # no cache time here
bell(midi(85), 20.05, 0.07, 1.6, 2.0, 0.8, 0.4, verb=0.7)    # always there
# 22 · ADAPT · 25 · INSTALL
whoosh(21.9, 0.5, 6000, 1500, 0.14, 0.3)
bars(22.0, 25.0, 'light', start=2)
for at in (22.45, 23.5):
    whoosh(at, 0.7, 1800, 500, 0.07, 0.5)
    tick(at + 0.65, 0.05, 2400)
whoosh(24.1, 0.8, 300, 4000, 0.14, 0.55)
bars(25.0, 27.0, 'soft', start=0)
typing(25.3, 43, 0.019, 0.055)
click(26.25, 0.18)
bell(midi(81), 26.3, 0.06, 1.0, 2.0, 0.5)
typing(26.45, 26, 0.022, 0.055)
click(27.05, 0.2)
bell(midi(85), 27.1, 0.07, 1.0, 2.0, 0.5)
for i in range(4):
    bell(midi(73 + [0, 4, 7, 12][i]), 27.3 + 0.08 * i, 0.06, 1.2, 2.0, 0.8, -0.3 + 0.2 * i)
supersaw(F_M, 27.0, 1.0, gain=0.04, cutoff=lambda t: 700 + 5000 * ((t - 27) / 1.0) ** 2.2, res=0.8, a=0.05, r=0.02, verb=0.5)
riser(27.1, 0.9, 0.2, 200, 10000)
for k in range(12):
    snare(27.3 + 0.7 * (1 - (1 - k / 12) ** 1.6), 0.04 + 0.1 * k / 12)
reverse_cymbal(28.0, 1.0, 0.26)
# 28 · DROP — everything, on glass
bars(28.0, 31.3, 'hi', start=0)
impact(28.0, 0.8, 2.8)
for i, (n, pan) in enumerate(zip((73, 76, 80, 85, 88, 92, 97, 100), (-0.6, 0.6, -0.3, 0.3, -0.5, 0.5, 0, 0.2))):
    bell(midi(n), 28.0 + i * 0.125, 0.05, 1.2, 2.0, 0.8, pan, verb=0.6)
whoosh(31.0, 0.6, 600, 8000, 0.14, 0.7)
# 31.3 · THE NAME
supersaw(F_M + [66, 73], 31.3, 3.5, gain=0.05, cutoff=lambda t: 3000 - 2000 * min(1, (t - 31.3) / 3), a=0.02, r=0.3, verb=0.85)
bass_note(42, 31.3, 3.0, 0.16)
kick(31.3, 0.8)
impact(31.3, 0.35, 2.0)
bell(midi(78), 31.55, 0.09, 2.4, 1.0, 0.6, verb=0.85)
bell(midi(85), 31.58, 0.05, 2.4, 1.0, 0.4, 0.3, verb=0.85)
glass_pop(32.25, 1.2, 0.0)
click(33.35, 0.2)
bell(midi(90), 33.38, 0.07, 1.6, 2.0, 0.5, verb=0.8)

# sidechain: everything tonal breathes with the kick
duck = np.ones(N)
for at in KICKS:
    i = int(at * SR)
    if i >= N:
        continue
    L = int(0.42 * SR)
    seg = 1 - 0.7 * np.exp(-tt(0.42) / 0.11) * np.minimum(1, tt(0.42) / 0.004)
    n = min(L, N - i)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[:n])
for k in ('bass', 'chords', 'lead'):
    bus[k] *= duck

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
i0 = int(34.1 * SR)
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
