"""Fit an ElevenLabs take (62 s, 120 BPM) to the 44 s film, cutting only on bar lines.

The takes put their drop on bar 9 (16 s), which is where the film dives into the cache ring, so
the film plays a take straight from its first bar and, at `cut`, jumps a whole number of phrases
ahead to the take's own ending. The bar line is found on the take (its drop), not assumed.

    python3 fit_music.py out/eleven_1.mp3 40 56   →   out/eleven_1.wav (48 kHz, 44 s)
"""
import subprocess
import sys
import wave

import numpy as np

SR = 48_000
DUR = 44.0
src, cut, end = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, '<f4').reshape(-1, 2).T.astype(float)

# the bar line: the drop's first kick, the biggest rise of low-band energy near 16 s
mono = x.mean(0)[::2]
hop, win = 96, 2048
fr = np.stack([mono[i:i + win] * np.hanning(win) for i in range(int(14.5 * SR / 2), int(17.5 * SR / 2), hop)])
S = np.abs(np.fft.rfft(fr, axis=1))[:, : int(150 * win / (SR / 2))]
le = np.log(np.sum(S ** 2, axis=1) + 1e-9)
rise = np.diff(le, prepend=le[0])
ft = 14.5 + (np.arange(len(rise)) * hop + win / 2) / (SR / 2)
phase = ft[int(np.argmax(rise))] - 16.0 - 0.01  # a breath before the kick, so the splice keeps its attack
if phase < 0:  # the take starts a hair late: lead it with silence
    x = np.pad(x, ((0, 0), (int(-phase * SR) + 1, 0)))
    phase += (int(-phase * SR) + 1) / SR

N = int(DUR * SR)
out = np.zeros((2, N))
xf = int(0.04 * SR)  # an equal-power crossfade on each splice, centred just before the bar line
segs = [(0.0, phase, cut), (cut, end + phase, DUR - cut)]
for k, (f0, t0, length) in enumerate(segs):
    a, b = int(f0 * SR), int((f0 + length) * SR)
    s = int(t0 * SR)
    seg = x[:, s:s + (b - a) + xf]
    seg = np.pad(seg, ((0, 0), (0, (b - a) + xf - seg.shape[1])))
    w = np.ones(seg.shape[1])
    if k > 0:
        w[:xf] = np.sin(np.linspace(0, np.pi / 2, xf))
        a -= xf // 2
    if k < len(segs) - 1:
        w[-xf:] = np.cos(np.linspace(0, np.pi / 2, xf))
    else:
        seg, w = seg[:, : N - max(a, 0)], w[: N - max(a, 0)]
    lo = max(a, 0)
    out[:, lo:lo + seg.shape[1]] += (seg * w)[:, : N - lo]

dst = src.rsplit('.', 1)[0] + '.wav'
with wave.open(dst, 'wb') as wv:
    wv.setnchannels(2)
    wv.setsampwidth(2)
    wv.setframerate(SR)
    wv.writeframes((np.clip(out.T, -1, 1) * 32767).astype('<i2').tobytes())
print(dst.split('/')[-1], f'bar phase {phase:.3f}s', f'cut {cut:.0f} → {end:.0f}')
