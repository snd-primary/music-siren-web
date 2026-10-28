// 10音 B 型。1〜7 i 2̇ 3̇。大分・トキハ本店で現役と伝えられる型。
// 配列表：[6/1] [8 9/4 5] [10 12/6 i] [15/3̇] | B M 3/4 | [18/2̇] [15 10/7 3] [9/2]
import { DRIVE, gear, unit, type MachineSpec } from '../mechanism/machine';
import { ratio } from '../mechanism/ratio';

export const MODEL_10B: MachineSpec = {
  id: '10b',
  name: '10音 B',
  notes: 10,
  key: { at60Hz: 'F', at50Hz: 'D' },
  impellerDiameterMm: 350,
  layout: [
    unit(['1', 6]),
    unit(['4', 8], ['5', 9]),
    unit(['6', 10], ['i', 12]),
    unit(['3^', 15]),
    DRIVE,
    gear(ratio(3, 4)),
    unit(['2^', 18]),
    unit(['7', 15], ['3', 10]),
    unit(['2', 9]),
  ],
};
