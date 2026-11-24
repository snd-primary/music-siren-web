// 変速歯車装置の中身（3D 用）。純粋関数。
//
// 説明書の保守の項に「ダブル・ギヤー下段の軸心に達する迄注入」とあるので、入力軸と出力軸は同じ軸線上にあり、
// 下にダブルギヤーの副軸がある 2 段の歯車列と読める。歯数は資料に無いので、次のように仮に決める：
//   1 段目（入力 z1 → 副軸 z2）で変速比 z1/z2 を作り、2 段目（副軸 z3 → 出力 z4）は 1:1（z3 = z4）。
//   同じ軸間距離にするため z1 + z2 = z3 + z4。

export interface GearTrain {
  readonly z1: number;
  readonly z2: number;
  readonly z3: number;
  readonly z4: number;
}

/** 変速比 num/den（出力／入力）の歯車列。歯数の和は 70 前後の偶数にする。 */
export function gearTrain(num: number, den: number): GearTrain {
  let k = Math.max(1, Math.round(70 / (num + den)));
  if (((num + den) * k) % 2 !== 0) k += 1;
  const half = ((num + den) * k) / 2;
  return { z1: num * k, z2: den * k, z3: half, z4: half };
}

/**
 * 入力軸と出力軸の位相（どちらも 0〜1 回転に折り返してある）から、入力軸の折り返していない回転数を求める。
 * 出力は入力の num/den 倍で回るので、入力が den 回転すると全体が元に戻る。0 以上 den 未満の値を返す。
 * 歯車の歯がかみ合ったまま回るように、副軸の角度はこの値から決める。
 */
export function unwrapInputTurns(inputPhase: number, outputPhase: number, num: number, den: number): number {
  let best = inputPhase;
  let bestErr = Infinity;
  for (let k = 0; k < den; k += 1) {
    const t = inputPhase + k;
    const out = (t * num) / den;
    const d = out - outputPhase;
    const err = Math.abs(d - Math.round(d));
    if (err < bestErr) {
      bestErr = err;
      best = t;
    }
  }
  return best;
}
