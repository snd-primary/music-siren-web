#!/usr/bin/env python3
"""ミュージックサイレンの録音を解析する（numpy と ffmpeg だけで動く）。

  python3 -I tools/analyze-recording.py 録音.mp3 [出力ディレクトリ]

出力：
  - スペクトログラム PNG（0〜2000 Hz）
  - 安定した音の周波数の一覧（中央値 Hz）と、平均律・純正律への当てはめ
  - 曲が始まる前（アイドル）のピーク（閉じたカバーからの漏れ音の確認）
  - 代表的な音の倍音構造（基音に対する dB）
  - 音の立ち上がり・立ち下がり時間（基音振幅の 10%→90% / 90%→10%）

録音そのものはリポジトリに入れない（他人の録音は解析の参照にとどめる）。
"""
import os
import subprocess
import sys

import numpy as np

SR = 44100
NOTE_NAMES = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab']
JUST = {'1': 1, '2': 9 / 8, '3': 5 / 4, '4': 4 / 3, '5': 3 / 2, '6': 5 / 3, '7': 15 / 8}


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def stft(x: np.ndarray, n: int, hop: int) -> np.ndarray:
    w = np.hanning(n)
    frames = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    return np.abs(np.fft.rfft(x[idx] * w, axis=1))


def interp_peak(mag: np.ndarray, k: int, n: int) -> float:
    a, b, c = (np.log(mag[k - 1] + 1e-12), np.log(mag[k] + 1e-12), np.log(mag[k + 1] + 1e-12))
    d = a - 2 * b + c
    return (k + (0.5 * (a - c) / d if d else 0)) * SR / n


def band_env(mag: np.ndarray, f: float, n: int, width: float = 1.5) -> np.ndarray:
    k0 = int((f - width * SR / n) / (SR / n))
    k1 = int((f + width * SR / n) / (SR / n)) + 1
    return mag[:, max(k0, 0):k1].max(axis=1)


def note_name(f: float, a4: float) -> str:
    semis = 12 * np.log2(f / a4)
    n = int(round(semis))
    octave = 4 + (n + 9) // 12
    return f'{NOTE_NAMES[n % 12]}{octave}'


def spectrogram_png(x: np.ndarray, out: str, fmax: float = 2000) -> None:
    from PIL import Image

    n, hop = 4096, 1024
    m = stft(x, n, hop)
    kmax = int(fmax / (SR / n))
    img = 20 * np.log10(m[:, :kmax].T[::-1] + 1e-6)
    img = np.clip((img - img.max() + 70) / 70, 0, 1)
    Image.fromarray((img * 255).astype(np.uint8)).resize((min(1800, m.shape[0]), kmax * 2)).save(out)


def stable_notes(x: np.ndarray) -> list[tuple[float, int]]:
    n, hop = 16384, 2048
    m = stft(x, n, hop)
    mx = m.max()
    lo, hi = int(240 / (SR / n)), int(1000 / (SR / n))
    vals = []
    for fr in range(m.shape[0]):
        seg = m[fr, lo:hi]
        if seg.max() < mx * 0.02:
            continue
        thr = seg.max() * 10 ** (-20 / 20)
        for k in range(2, len(seg) - 2):
            if seg[k] > thr and seg[k] > seg[k - 1] and seg[k] >= seg[k + 1] and seg[k] > seg[k - 2] and seg[k] >= seg[k + 2]:
                vals.append(interp_peak(m[fr], lo + k, n))
    if not vals:
        return []
    vals = np.array(vals)
    cents = 1200 * np.log2(vals / 264)
    h, e = np.histogram(cents, bins=np.arange(-100, 2500, 5))
    out = []
    for k in range(1, len(h) - 1):
        if h[k] >= max(40, 0.05 * h.max()) and h[k] >= h[k - 1] and h[k] >= h[k + 1]:
            sel = vals[(cents >= e[k] - 10) & (cents < e[k + 1] + 10)]
            out.append((float(np.median(sel)), len(sel)))
    return out


def fit_equal_temperament(freqs: list[float]) -> tuple[float, list[float]]:
    fs = np.array(freqs)
    semis = 12 * np.log2(fs / 440)
    n = np.round(semis)
    off = float(np.mean(semis - n) * 100)
    a4 = 440 * 2 ** (off / 1200)
    return a4, list((semis - n) * 100 - off)


def fit_just(freqs: list[float]) -> tuple[float, list[tuple[str, float]]]:
    """主音を総当たりで決め、純正律長音階（オクターブ込み）への最小のずれを返す。"""
    fs = np.array(freqs)
    best = None
    for tonic in np.exp(np.linspace(np.log(200), np.log(400), 2000)):
        devs = []
        for f in fs:
            r = f / tonic
            r /= 2 ** np.floor(np.log2(r))
            d = min((abs(1200 * np.log2(r / v)), k) for k, v in JUST.items())
            devs.append(d)
        score = float(np.mean([d for d, _ in devs]))
        if best is None or score < best[0]:
            best = (score, tonic, devs)
    _, tonic, devs = best
    return float(tonic), [(k, d) for d, k in devs]


def idle_peaks(x: np.ndarray, t0: float, t1: float) -> list[tuple[float, float]]:
    n = 32768
    seg = x[int(t0 * SR):int(t1 * SR)]
    if len(seg) < n:
        return []
    m = stft(seg, n, n // 4).mean(axis=0)
    lo, hi = int(40 / (SR / n)), int(1200 / (SR / n))
    s = m[lo:hi]
    thr = s.max() * 10 ** (-25 / 20)
    pk = [(interp_peak(m, lo + k, n), 20 * np.log10(m[lo + k] / s.max())) for k in range(1, len(s) - 1) if s[k] > thr and s[k] > s[k - 1] and s[k] >= s[k + 1]]
    return sorted(sorted(pk, key=lambda p: -p[1])[:25])


def harmonics(x: np.ndarray, f0: float) -> list[float] | None:
    n, hop = 8192, 1024
    m = stft(x, n, hop)
    fund = band_env(m, f0, n)
    lo, hi = int(240 / (SR / n)), int(1000 / (SR / n))
    dom = (fund >= m[:, lo:hi].max(axis=1) * 0.95) & (fund > fund.max() * 0.3)
    if dom.sum() < 5:
        return None
    return [float(20 * np.log10(np.median(band_env(m, f0 * h, n)[dom] / fund[dom]))) for h in range(1, 11) if f0 * h < SR / 2 - 100]


def transitions(x: np.ndarray, f0: float) -> tuple[list[float], list[float]]:
    n, hop = 2048, 128
    m = stft(x, n, hop)
    env = band_env(m, f0, n, 1.0)
    on = env > env.max() * 0.5
    edges = np.diff(on.astype(int))
    rises, falls = [], []
    for i in np.where(edges == 1)[0]:
        seg = env[max(0, i - 60):i + 60]
        peak = seg.max()
        lo_i = np.where(seg[:60] < 0.1 * peak)[0]
        hi_i = np.where(seg > 0.9 * peak)[0]
        if len(lo_i) and len(hi_i):
            rises.append((hi_i[0] - lo_i[-1]) * hop / SR * 1000)
    for i in np.where(edges == -1)[0]:
        seg = env[max(0, i - 60):i + 60]
        peak = seg.max()
        hi_i = np.where(seg[:60] > 0.9 * peak)[0]
        lo_i = np.where(seg[60:] < 0.1 * peak)[0]
        if len(lo_i) and len(hi_i):
            falls.append((60 + lo_i[0] - hi_i[-1]) * hop / SR * 1000)
    return rises, falls


def main() -> None:
    path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else '.'
    os.makedirs(out_dir, exist_ok=True)
    name = os.path.splitext(os.path.basename(path))[0]
    x = decode(path)
    print(f'# {name}: {len(x) / SR:.1f} s')

    spectrogram_png(x, os.path.join(out_dir, f'{name}-spec.png'))

    notes = stable_notes(x)
    if notes:
        a4, dev = fit_equal_temperament([f for f, _ in notes])
        print(f'\n## 安定した音（Hz(フレーム数)）と平均律への当てはめ A4={a4:.1f}Hz')
        for (f, c), d in zip(notes, dev):
            print(f'  {f:7.1f} ({c:4d})  {note_name(f, a4):>4}  {d:+.0f} cent')
        tonic, jdev = fit_just([f for f, _ in notes])
        print(f'\n## 純正律長音階への当てはめ 主音={tonic:.1f}Hz（平均ずれ {np.mean([d for _, d in jdev]):.1f} cent）')
        print('  ' + ' '.join(f'{f:.0f}={k}{d:+.0f}' for (f, _), (k, d) in zip(notes, jdev)))

    print('\n## 冒頭 0.3〜2.3 秒のピーク（Hz:dB）')
    print('  ' + ' '.join(f'{f:.0f}:{d:.0f}' for f, d in idle_peaks(x, 0.3, 2.3)))

    print('\n## 倍音構造（基音に対する dB、h1..h10）と立ち上がり／立ち下がり')
    for f, _ in sorted(notes, key=lambda p: -p[1])[:4]:
        h = harmonics(x, f)
        r, fl = transitions(x, f)
        hs = ' '.join(f'{v:+.0f}' for v in h) if h else '(単音の区間なし)'
        print(f'  {f:6.1f}Hz: {hs} | rise {np.median(r) if r else 0:.0f} ms ({len(r)}) fall {np.median(fl) if fl else 0:.0f} ms ({len(fl)})')


if __name__ == '__main__':
    main()
