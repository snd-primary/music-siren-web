import { describe, expect, it } from 'vitest';
import { gearTrain, unwrapInputTurns } from './geartrain';

describe('変速歯車装置の歯車列', () => {
  it.each([
    [3, 4],
    [8, 9],
    [10, 9],
  ])('変速比 %d/%d を作り、入力軸と出力軸が同じ軸線に乗る', (num, den) => {
    const t = gearTrain(num, den);
    expect((t.z1 / t.z2) * (t.z3 / t.z4)).toBeCloseTo(num / den, 12);
    expect(t.z1 + t.z2).toBe(t.z3 + t.z4);
    for (const z of [t.z1, t.z2, t.z3, t.z4]) expect(Number.isInteger(z)).toBe(true);
  });

  it('折り返した位相から、入力軸の回転数を取り戻す', () => {
    for (const [num, den] of [[3, 4], [8, 9], [10, 9]] as const) {
      for (const turns of [0, 0.3, 1.7, 2.999, 3.5, 7.25, 8.9]) {
        const want = turns % den;
        const inPhase = turns % 1;
        const outPhase = ((turns * num) / den) % 1;
        expect(unwrapInputTurns(inPhase, outPhase, num, den)).toBeCloseTo(want, 9);
      }
    }
  });
});
