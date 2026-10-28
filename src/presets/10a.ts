// 10音 A 型。5̣ 6̣ 1〜7 i。
// 配列表：[5/6̣] [6 8/1 4] [9 10/5 6] [12/i] | B M 3/4 | [15/7] [10 9/3 2] [6/5̣]
import { DRIVE, gear, unit, type MachineSpec } from '../mechanism/machine';
import { ratio } from '../mechanism/ratio';

export const MODEL_10A: MachineSpec = {
  id: '10a',
  name: '10音 A',
  notes: 10,
  key: { at60Hz: 'F', at50Hz: 'D' },
  impellerDiameterMm: 350,
  layout: [
    unit(['6_', 5]),
    unit(['1', 6], ['4', 8]),
    unit(['5', 9], ['6', 10]),
    unit(['i', 12]),
    DRIVE,
    gear(ratio(3, 4)),
    unit(['7', 15]),
    unit(['3', 10], ['2', 9]),
    unit(['5_', 6]),
  ],
};
