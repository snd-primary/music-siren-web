// 12音 A 型。5̣ 6̣ 1〜7 i 2̇ 3̇。配線図の 12TA がこれ。
// 配列表：[5/6̣] [8 9/4 5] [10 12/6 i] [15/3̇] | B M 3/4 | [18/2̇] [15 10/7 3] [9 8/2 1] [6/5̣]
import { DRIVE, gear, unit, type MachineSpec } from '../mechanism/machine';
import { ratio } from '../mechanism/ratio';

export const MODEL_12A: MachineSpec = {
  id: '12a',
  name: '12音 A',
  notes: 12,
  key: { at60Hz: 'F', at50Hz: 'D' },
  impellerDiameterMm: 350,
  layout: [
    unit(['6_', 5]),
    unit(['4', 8], ['5', 9]),
    unit(['6', 10], ['i', 12]),
    unit(['3^', 15]),
    DRIVE,
    gear(ratio(3, 4)),
    unit(['2^', 18]),
    unit(['7', 15], ['3', 10]),
    unit(['2', 9], ['1', 8]),
    unit(['5_', 6]),
  ],
};
