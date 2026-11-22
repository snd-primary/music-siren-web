#!/usr/bin/env python3
"""録音から機械の回転数（公称に対する比）の時間変化を追う。

  python3 -I tools/track-speed.py 録音 360,405,450,480,540,600,675,720 [出力.csv]

全サイレンが歯車で剛結されているので、すべての音（閉じたカバーからの漏れ音を含む）は
同じ比 r で動く。各フレームで、公称振動数 f_k とその第2倍音の r 倍の位置にある
スペクトルの大きさ（対数）の和が最大になる r を探す（櫛形の当てはめ）。

出力：時刻 [s], r, 当てはまりの強さ（櫛の位置の平均レベルと、ずらした位置との差 dB）。
起動・停止のグライドの形と、定常の滑り（1 − r）を読むのに使う。
"""
import sys

import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from importlib import import_module  # noqa: E402

ar = import_module('analyze-recording')

N = 8192
HOP = 1024


def comb_score(logmag: np.ndarray, freqs: np.ndarray, r: np.ndarray) -> np.ndarray:
    """logmag: (bins,), freqs: (k,), r: (m,) → (m,) の平均レベル。"""
    bins = (r[:, None] * freqs[None, :]) / (ar.SR / N)
    k = np.clip(bins, 1, len(logmag) - 2)
    lo = np.floor(k).astype(int)
    frac = k - lo
    v = logmag[lo] * (1 - frac) + logmag[lo + 1] * frac
    # 近傍 ±1 ビンの最大（窓のずれに強くする）
    v = np.maximum(v, np.maximum(logmag[lo - 1], logmag[np.minimum(lo + 2, len(logmag) - 1)]) - 1.0)
    return v.mean(axis=1)


def track(x: np.ndarray, nominal: list[float]) -> list[tuple[float, float, float]]:
    mag = ar.stft(x, N, HOP)
    logmag = 20 * np.log10(mag + 1e-9)
    freqs = np.array(nominal + [2 * f for f in nominal])
    coarse = np.arange(0.05, 1.08, 0.0005)
    out = []
    for i, row in enumerate(logmag):
        s = comb_score(row, freqs, coarse)
        j = int(np.argmax(s))
        fine = np.arange(coarse[j] - 0.0005, coarse[j] + 0.0005, 0.00002)
        sf = comb_score(row, freqs, fine)
        r = float(fine[int(np.argmax(sf))])
        # ずらした櫛（r × 1.03）との差で、当てはまりの確かさを見る
        off = float(comb_score(row, freqs, np.array([r * 1.03, r * 0.97])).mean())
        t = (i * HOP + N / 2) / ar.SR
        out.append((t, r, float(sf.max()) - off))
    return out


def main() -> None:
    path = sys.argv[1]
    nominal = [float(v) for v in sys.argv[2].split(',')]
    out = sys.argv[3] if len(sys.argv) > 3 else None
    x = ar.decode(path)
    rows = track(x, nominal)
    lines = ['t,r,contrast_db'] + [f'{t:.3f},{r:.5f},{c:.1f}' for t, r, c in rows]
    if out:
        with open(out, 'w') as f:
            f.write('\n'.join(lines) + '\n')
    else:
        print('\n'.join(lines))


if __name__ == '__main__':
    main()
