"""usage-line — the score, synthesised sample by sample.

No samples, no libraries beyond numpy: additive pads, FM bells, a sine kick, noise hats,
filtered-noise whooshes and a convolution reverb, with every UI sound placed on the frame
the picture (render.mjs) puts its event. 120 BPM, D major; the picture cuts on the bar.

    python3 score.py   →   out/score.wav (48 kHz, 16-bit stereo)

With MUSIC set, the music is that recording instead (an ElevenLabs take), shifted by MUSIC_SHIFT
seconds so its downbeat meets the picture's at 6.0 s, and ducked under the sound design:

    MUSIC=out/eleven.mp3 MUSIC_SHIFT=0.12 python3 score.py
"""
import os
import subprocess
import wave

import numpy as np

SR = 48_000
DUR = 44.0
N = int(SR * DUR)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
rng = np.random.default_rng(20261004)

music = np.zeros((2, N))
sfx = np.zeros((2, N))
send = np.zeros((2, N))  # reverb send


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def place(bus, at, sig, gain=1.0, pan=0.0, verb=0.0):
    """Mix a mono or stereo signal into a bus at `at` seconds, equal-power panned."""
    i = int(round(at * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    n = min(sig.shape[1], N - i)
    bus[:, i:i + n] += sig[:, :n] * gain
    if verb:
        send[:, i:i + n] += sig[:, :n] * gain * verb


def tt(d):
    return np.arange(int(d * SR)) / SR


def env(d, a=0.005, r=None, curve=6.0):
    """Attack, then an exponential fall over the rest (or a linear release `r` at the end)."""
    t = tt(d)
    e = np.minimum(1, t / max(a, 1e-4))
    if r is None:
        e *= np.exp(-curve * np.maximum(0, t - a) / d)
    else:
        e *= np.clip((d - t) / r, 0, 1)
    return e


def spectral(sig, shape):
    """Filter by a frequency response `shape(freqs)` in one FFT, zero-padded so no tail wraps."""
    n = sig.shape[-1]
    m = n + min(n, SR)
    F = np.fft.rfft(sig, n=m, axis=-1)
    f = np.fft.rfftfreq(m, 1 / SR)
    return np.fft.irfft(F * shape(f), n=m, axis=-1)[..., :n]


def lowpass(sig, fc, order=2):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def highpass(sig, fc, order=2):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def bandsweep(d, f0, f1, q=1.2, curve='exp'):
    """Noise through a band-pass whose centre glides f0 → f1: overlap-added FFT blocks."""
    n = int(d * SR)
    noise = rng.standard_normal(n + 2048)
    out = np.zeros(n + 2048)
    hop, size = 256, 1024
    win = np.hanning(size)
    freqs = np.fft.rfftfreq(size, 1 / SR)
    for s in range(0, n, hop):
        p = s / n
        fc = f0 * (f1 / f0) ** p if curve == 'exp' else f0 + (f1 - f0) * p
        bw = fc / q
        resp = np.exp(-0.5 * ((freqs - fc) / bw) ** 2)
        blk = np.fft.irfft(np.fft.rfft(noise[s:s + size] * win) * resp, n=size)
        out[s:s + size] += blk * win
    out = out[:n]
    return out / (np.max(np.abs(out)) + 1e-9)


# ── instruments ────────────────────────────────────────────────────────────────────────────
def saw_voice(f, d, bright=10.0):
    t = tt(d)
    out = np.zeros_like(t)
    phase = rng.uniform(0, 2 * np.pi)
    for h in range(1, 40):
        if f * h > 9000:
            break
        out += np.sin(2 * np.pi * f * h * t + phase * h) / h * np.exp(-h / bright)
    return out


def pad(notes, at, d, gain=0.06, bright=6.0, attack=0.9, release=1.4):
    for k, n in enumerate(notes):
        for det, pan in ((-7, -0.6), (0, 0.0), (7, 0.6)):
            f = midi(n) * 2 ** (det / 1200)
            v = saw_voice(f, d + release, bright)
            e = np.minimum(1, tt(d + release) / attack) * np.clip((d + release - tt(d + release)) / release, 0, 1)
            place(music, at, v * e, gain / len(notes), pan * (0.5 + 0.1 * k), verb=0.45)


def bell(f, at, gain=0.2, d=2.2, ratio=3.5, index=2.4, pan=0.0, verb=0.5, bus=None):
    t = tt(d)
    I = index * np.exp(-t * 3.5)
    s = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t))
    s += 0.25 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 4)
    place(sfx if bus is None else bus, at, s * env(d, 0.002, curve=5.5), gain, pan, verb)


def pluck(f, at, gain=0.12, d=0.45, pan=0.0, verb=0.35, bus=None):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t + 1.6 * np.exp(-t * 18) * np.sin(2 * np.pi * f * 2 * t))
    place(music if bus is None else bus, at, s * env(d, 0.002, curve=9), gain, pan, verb)


def kick(at, gain=0.5):
    d = 0.42
    t = tt(d)
    f = 44 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 9)
    s[: int(0.003 * SR)] += rng.standard_normal(int(0.003 * SR)) * 0.3
    place(music, at, np.tanh(s * 1.6), gain)


def hat(at, gain=0.05, d=0.05, pan=0.2):
    s = highpass(rng.standard_normal(int(d * SR)), 7000, 3) * env(d, 0.001, curve=7)
    place(music, at, s, gain, pan, verb=0.1)


def tick(at, gain=0.18, f=3100.0, pan=0.0, verb=0.15):
    d = 0.045
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 140)
    s += highpass(rng.standard_normal(len(t)), 4000) * np.exp(-t * 400) * 0.6
    place(sfx, at, s, gain, pan, verb)


def click(at, gain=0.1, pan=0.0):
    d = 0.03
    t = tt(d)
    f = rng.uniform(2200, 3600)
    s = spectral(rng.standard_normal(len(t)), lambda x: np.exp(-0.5 * ((x - f) / 900) ** 2)) * np.exp(-t * 260)
    s += np.sin(2 * np.pi * 180 * t) * np.exp(-t * 120) * 0.3
    place(sfx, at, s / (np.max(np.abs(s)) + 1e-9), gain, pan, verb=0.05)


def whoosh(at, d=0.7, f0=300, f1=4000, gain=0.25, pan=0.0, verb=0.3, swell=0.6):
    s = bandsweep(d, f0, f1)
    t = tt(d)
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    peak = swell
    e = np.where(t / d < peak, (t / d / peak) ** 2, np.exp(-6 * (t / d - peak)))
    place(sfx, at, s * e, gain, pan, verb)


def boom(at, gain=0.6, d=2.2, verb=0.4):
    t = tt(d)
    f = 30 + 60 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    s += lowpass(rng.standard_normal(len(t)), 900) * np.exp(-t * 9) * 0.5
    place(sfx, at, np.tanh(s * 1.3), gain, 0.0, verb)


def riser(at, d, gain=0.22, f0=200, f1=6000):
    s = bandsweep(d, f0, f1, q=0.9)
    t = tt(d)
    e = (t / d) ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * t / d)) / SR) * 0.25
    place(sfx, at, (s + tone) * e, gain, 0.0, verb=0.5)


# ── the music ──────────────────────────────────────────────────────────────────────────────
D9 = [50, 57, 61, 64, 66]
Bm9 = [47, 54, 57, 61, 62]
G9 = [43, 50, 54, 57, 61]
A6 = [45, 52, 59, 62, 66]
PROG = [D9, Bm9, G9, A6]

MUSIC = os.environ.get('MUSIC')
if not MUSIC:
    # the questions: a low drone and a clock on every beat
    for n, g in ((50, 0.06), (57, 0.035)):
        t = tt(6.4)
        s = np.sin(2 * np.pi * midi(n) * t) + 0.3 * np.sin(2 * np.pi * midi(n) * 2.003 * t)
        place(music, 0.0, s * np.minimum(1, t / 2.5) * np.clip((6.4 - t) / 0.6, 0, 1), g, 0.0, verb=0.3)
    for b in range(1, 12):
        tick(b * 0.5, gain=0.05 + 0.006 * b, f=2400 if b % 2 else 1800, pan=-0.3 if b % 2 else 0.3, verb=0.25)

    bar = 2.0
    for k, at in enumerate(np.arange(6.0, 41.0, bar)):
        chord = PROG[k % 4]
        quiet = 30.0 <= at < 32.5
        pad(chord, at, bar, gain=0.075 if not quiet else 0.06, bright=5.0 + (2.0 if at >= 16 else 0))
        # bass on the eighths from the product shot on, resting through the context breath
        if 10.0 <= at and not quiet:
            root = chord[0] - 12
            for e8 in range(8):
                if at + e8 * 0.25 >= 41.0:
                    break
                if 30.0 <= at + e8 * 0.25 < 32.5:
                    continue
                t = tt(0.24)
                s = np.sin(2 * np.pi * midi(root) * t) + 0.2 * np.sin(4 * np.pi * midi(root) * t)
                place(music, at + e8 * 0.25, np.tanh(1.3 * s) * env(0.24, 0.004, curve=5), 0.11 if at < 38 else 0.06)
        # the groove: a soft kick and hats through the features
        for beat in range(4):
            tb = at + beat * 0.5
            if (16.0 <= tb < 30.0) or (32.5 <= tb < 38.0):
                kick(tb, 0.32)
                hat(tb + 0.25, 0.045, pan=0.25)
                hat(tb + 0.375, 0.02, pan=-0.25)
        # arpeggio, one octave up, sixteenths
        if (16.0 <= at < 30.0) or (32.5 <= at < 38.0):
            pattern = [0, 2, 1, 3, 2, 4, 1, 3]
            for i in range(16):
                n = chord[pattern[i % 8]] + 12
                pluck(midi(n), at + i * 0.125, gain=0.035 + 0.01 * (i % 4 == 0), pan=-0.4 + 0.8 * ((i * 3) % 8) / 7)

    # the closing chord
    pad(D9 + [74], 41.0, 2.4, gain=0.09, bright=7.0, attack=0.2, release=1.2)
    pad([38, 45], 41.0, 2.4, gain=0.07, bright=3.0, attack=0.1, release=1.2)
    fade = np.ones(N)
    i0 = int(42.6 * SR)
    fade[i0:] = np.linspace(1, 0, N - i0) ** 1.6
    music *= fade

# ── sound design, frame-locked to render.mjs ────────────────────────────────────────────────
# 01 the questions arrive
for at, n, pan in ((0.35, 66, -0.4), (1.3, 69, 0.4), (2.25, 71, -0.4), (3.15, 74, 0.4)):
    bell(midi(n), at, gain=0.09, d=1.8, ratio=2.0, index=1.2, pan=pan, verb=0.6)
    tick(at + 0.6, gain=0.06, f=2800, pan=pan)
# collapse into the line
riser(4.3, 1.7, gain=0.2)
whoosh(4.6, d=1.4, f0=6000, f1=180, gain=0.18, swell=0.85)
# 02 the line lands
boom(6.0, gain=0.42)
bell(midi(74), 6.0, gain=0.1, d=3.0, ratio=1.0, index=0.6, verb=0.8)
bell(midi(81), 6.02, gain=0.06, d=3.0, ratio=1.0, index=0.4, pan=0.3, verb=0.8)
whoosh(8.2, d=0.8, f0=3000, f1=400, gain=0.14, swell=0.4)
for i, n in enumerate((62, 66, 69, 74)):
    bell(midi(n + 12), 8.82 + i * 0.07, gain=0.05, d=1.2, ratio=3.0, index=1.0, pan=-0.3 + 0.2 * i)
for i in range(10):
    click(9.0 + i * 0.075, gain=0.12, pan=0.1)
# 03 the window, the rings, the request
whoosh(9.75, d=1.0, f0=200, f1=1800, gain=0.16, swell=0.5)
for i in range(4):
    pluck(midi([74, 78, 81, 86][i]), 11.31 + i * 0.2, gain=0.08, pan=-0.3 + 0.2 * i, bus=sfx)  # each piece lands
for i in range(7):
    click(11.55 + i * 0.093, gain=0.12)
click(12.35, gain=0.22)
bell(midi(86), 12.45, gain=0.12, d=2.0, ratio=1.0, index=0.8, verb=0.6)
bell(midi(93), 12.47, gain=0.06, d=2.0, ratio=1.0, index=0.5, pan=0.2, verb=0.6)
riser(12.9, 2.1, gain=0.08, f0=150, f1=2000)
for i in range(4):
    tick(13.65 + i * 0.16, gain=0.08, f=2600 + 300 * i, pan=-0.45 + 0.3 * i)
whoosh(15.3, d=0.9, f0=400, f1=7000, gain=0.26, swell=0.85)
boom(16.0, gain=0.3, d=1.4)
# 04 the cache: live seconds, the time-lapse, the last minute, expiry, refill
for at in (16.6, 17.6):
    tick(at, gain=0.16, f=2600)


def left_lapse(t):
    p = np.clip((t - 18.0) / 2.0, 0, 1)
    e = np.where(p < 0.5, 4 * p ** 3, 1 - (-2 * p + 2) ** 3 / 2)
    return 3598.6 + (60 - 3598.6) * e


ts = np.arange(18.0, 20.0, 1 / 600)
mins = np.floor(left_lapse(ts) / 60)
for i in np.nonzero(np.diff(mins))[0]:
    tick(ts[i + 1], gain=0.07, f=2200 + 900 * (i % 2), pan=0.15 if i % 2 else -0.15, verb=0.05)
riser(18.0, 2.0, gain=0.06, f0=300, f1=3000)
bell(midi(76), 20.0, gain=0.11, d=1.2, ratio=1.0, index=0.3, verb=0.5)
bell(midi(72), 20.18, gain=0.09, d=1.2, ratio=1.0, index=0.3, verb=0.5)
ts = np.arange(20.0, 21.2, 1 / 1200)
p = (ts - 20.0) / 1.2
secs = np.ceil(60 - 60 * (p * p * 0.4 + p * 0.6))
for k, i in enumerate(np.nonzero(np.diff(secs))[0]):
    if k % 2 == 0:
        tick(ts[i + 1], gain=0.05 + 0.05 * (k / 60), f=1800 + 20 * k, verb=0.02)
boom(21.2, gain=0.42, d=1.6)
bell(midi(50), 21.2, gain=0.1, d=1.6, ratio=1.41, index=2.0, verb=0.6)
bell(midi(51), 21.21, gain=0.06, d=1.6, ratio=1.41, index=2.0, verb=0.6)
click(21.8, gain=0.2)
riser(21.4, 0.6, gain=0.08, f0=500, f1=5000)
for i, n in enumerate((74, 78, 81, 86, 90)):
    bell(midi(n), 21.95 + i * 0.055, gain=0.07, d=1.6, ratio=2.0, index=0.8, pan=-0.4 + 0.2 * i, verb=0.6)
for i in range(3):
    tick(22.7 + i * 0.14, gain=0.07, f=2400, pan=-0.2 + 0.2 * i)
# 05 the windows climb, and cross their thresholds
whoosh(23.65, d=0.8, f0=2500, f1=300, gain=0.15, swell=0.4)
for i, n in enumerate((78, 81)):
    pluck(midi(n), 24.15 + i * 0.15, gain=0.08, bus=sfx, pan=-0.3 + 0.6 * i)
for a, b in ((25.55, 26.15), (26.45, 27.0), (27.35, 27.9)):
    riser(a, b - a, gain=0.07, f0=400, f1=3500)
bell(midi(79), 26.79, gain=0.1, d=1.4, ratio=1.0, index=0.5, pan=-0.3, verb=0.5)
bell(midi(79), 27.075, gain=0.07, d=1.4, ratio=1.0, index=0.5, pan=0.3, verb=0.5)
bell(midi(77), 27.68, gain=0.12, d=1.8, ratio=1.41, index=1.6, pan=-0.3, verb=0.5)
# 06 the context
whoosh(29.7, d=0.7, f0=2000, f1=300, gain=0.12, swell=0.4)
riser(31.25, 0.7, gain=0.06, f0=400, f1=3000)
bell(midi(81), 30.95, gain=0.07, d=1.4, ratio=1.0, index=0.4, verb=0.6)
# 07 folding; the terminal
whoosh(32.35, d=0.7, f0=300, f1=2500, gain=0.13, swell=0.5)
for at in (33.75, 35.25):
    click(at, gain=0.22)
    tick(at + 0.02, gain=0.07, f=1600)
whoosh(35.2, d=0.8, f0=500, f1=4000, gain=0.14, swell=0.5)
for i in range(4):
    tick(35.95 + i * 0.2, gain=0.06, f=2600 + 200 * i, pan=-0.3 + 0.2 * i)
# 08 install, and the mark
whoosh(37.75, d=0.8, f0=2500, f1=300, gain=0.14, swell=0.4)
for i in range(0, 42, 2):
    click(38.45 + i / 42, gain=0.09, pan=0.05)
for i in range(0, 37, 2):
    click(39.55 + 0.75 * i / 37, gain=0.09, pan=0.05)
for i, n in enumerate((74, 78, 81)):
    bell(midi(n + 12), 40.45 + i * 0.06, gain=0.08, d=1.2, ratio=2.0, index=0.6, pan=-0.2 + 0.2 * i)
whoosh(40.75, d=0.6, f0=4000, f1=600, gain=0.1, swell=0.6)
boom(41.15, gain=0.4, d=2.6)
riser(41.3, 1.1, gain=0.05, f0=800, f1=6000)
bell(midi(86), 42.4, gain=0.11, d=2.4, ratio=1.0, index=0.6, verb=0.8)
bell(midi(93), 42.42, gain=0.06, d=2.4, ratio=1.0, index=0.4, pan=0.3, verb=0.8)

# ── a recorded score instead: shifted onto the picture's downbeat, ducked under the hits ───────
if MUSIC:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', MUSIC, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    rec = np.frombuffer(raw, '<f4').reshape(-1, 2).T.astype(float)
    shift = int(float(os.environ.get('MUSIC_SHIFT', '0')) * SR)
    rec = rec[:, shift:] if shift > 0 else np.pad(rec, ((0, 0), (-shift, 0)))
    rec = np.pad(rec, ((0, 0), (0, max(0, N - rec.shape[1]))))[:, :N]
    rec *= 10 ** (float(os.environ.get('MUSIC_DB', '-20')) / 20) / np.sqrt(np.mean(rec ** 2))
    # the sound design's envelope, smoothed: the music gives way by up to 5 dB under it
    e = np.abs(sfx).max(axis=0)
    k = int(0.12 * SR)
    e = np.convolve(e, np.ones(k) / k, mode='same')
    duck = 1 - 0.44 * np.clip(e / (np.percentile(e, 99.5) + 1e-9), 0, 1)
    end = np.ones(N)
    i0 = int(42.6 * SR)
    end[i0:] = np.linspace(1, 0, N - i0) ** 1.6
    music = rec * duck * end / 0.9

# ── reverb, master ─────────────────────────────────────────────────────────────────────────
ir_t = tt(3.2)
ir = rng.standard_normal((2, len(ir_t))) * np.exp(-ir_t / 0.75)
ir = lowpass(ir, 5000)
ir[:, : int(0.012 * SR)] = 0
ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
L = 1 << int(np.ceil(np.log2(N + ir.shape[1])))
wet = np.fft.irfft(np.fft.rfft(send, L) * np.fft.rfft(ir, L), L)[:, :N] * 0.9

mix = music * 0.9 + sfx + wet
mix = highpass(mix, 38, 4)
# a gentle low shelf: keep the weight, lose the mud
mix = spectral(mix, lambda f: 1 - 0.35 / (1 + (f / 140) ** 4))
mix = np.tanh(mix * 1.4) / 1.4
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
tail = np.ones(N)
tail[int(43.4 * SR):] = np.linspace(1, 0, N - int(43.4 * SR))
mix *= tail

os.makedirs(OUT, exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(OUT, os.environ.get('SCORE', 'score.wav')), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(os.environ.get('SCORE', 'score.wav'), f'music rms {20 * np.log10(np.sqrt(np.mean(music ** 2))):.1f}', f'{DUR:.0f}s', f'rms {20 * np.log10(np.sqrt(np.mean(mix ** 2))):.1f} dBFS')
