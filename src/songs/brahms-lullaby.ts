// ブラームスの子守唄（Wiegenlied Op.49-4、1868年）。保護期間切れ。
// 伊賀機で 22 時に鳴っている曲。8 音（1〜i）用の自作編曲。3/4 拍子、弱起。
import { parseScore, type Song } from './types';

export const BRAHMS_LULLABY: Song = {
  id: 'brahms-lullaby',
  title: 'ブラームスの子守唄',
  composer: 'J. ブラームス',
  note: 'Wiegenlied Op.49-4。8音用の自作編曲。後半は数字譜で要確認。',
  bpm: 72,
  beatsPerBar: 3,
  events: parseScore(`
    - 3 3 | 5/2 3 3 | 5/2 3 5 | i/1.5 7/0.5 6 6 | 5/2 2 3 | 4/2 2 3 | 4/2 2 4 | 7 6 5 7 | i/3 |
    - i i | 6/2 4 | 3 5 i | 5/2 4 | 3 2 3 | 5/2 4 | 3 5 i | 7/2 6 5 | i/3 | -/3
  `),
};
