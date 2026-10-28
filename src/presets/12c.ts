// 12音 C 型。6̣ 7̣ 1〜7 i 2̇ 3̇、1 = 320Hz。60Hz で D# 調、50Hz で C 調。
// 変速歯車が2つある：中央ベースの 8/9（右軸）と、左ベースの途中の 10/9（増速）。
// 配列表：[6/3] [8 (10/9) 5 / 6 7̣] [6 10/2 7] [12/2̇] | B M 8/9 | [15/3̇] [12 9/i 5] [8 6/4 1] [5/6̣]
// 配列表では 10/9 の歯車が 8 と 5 を囲む括弧の中に描かれている（歯車箱の両側に羽根車が付く構成か）。
// ここでは歯車の両側を別ユニットとして扱う。
import { DRIVE, gear, unit, type MachineSpec } from '../mechanism/machine';
import { ratio } from '../mechanism/ratio';

export const MODEL_12C: MachineSpec = {
  id: '12c',
  name: '12音 C',
  notes: 12,
  key: { at60Hz: 'D#', at50Hz: 'C' },
  impellerDiameterMm: 350,
  layout: [
    unit(['3', 6]),
    unit(['6', 8]),
    gear(ratio(10, 9)),
    unit(['7_', 5]),
    unit(['2', 6], ['7', 10]),
    unit(['2^', 12]),
    DRIVE,
    gear(ratio(8, 9)),
    unit(['3^', 15]),
    unit(['i', 12], ['5', 9]),
    unit(['4', 8], ['1', 6]),
    unit(['6_', 5]),
  ],
};
