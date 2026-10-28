// 8音・350φ。伊賀市の 1982 年機（市指定文化財）がこの型。60Hz で F 調、50Hz で D 調。
// 配列表：[8/4] [9 10/5 6] [12/i] | B M 3/4 | [15/7] [10 9/3 2] [8/1]
import { DRIVE, gear, unit, type MachineSpec } from '../mechanism/machine';
import { ratio } from '../mechanism/ratio';

export const IGA_8: MachineSpec = {
  id: 'iga-8',
  name: '8音（350φ）伊賀機',
  notes: 8,
  key: { at60Hz: 'F', at50Hz: 'D' },
  impellerDiameterMm: 350,
  layout: [
    unit(['4', 8]),
    unit(['5', 9], ['6', 10]),
    unit(['i', 12]),
    DRIVE,
    gear(ratio(3, 4)),
    unit(['7', 15]),
    unit(['3', 10], ['2', 9]),
    unit(['1', 8]),
  ],
};
