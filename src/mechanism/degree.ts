// 音階（数字譜）。説明書の配列表は 1〜7 と i（上の 1）、上に点（2̇）・下に点（5̣）で書く。
// コード上の表記は "1".."7"、上のオクターブは "1^"（"i" も可）、下のオクターブは "5_" とする。

import { ratio, mulRatio, type Ratio } from './ratio';

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Octave = -1 | 0 | 1;

export interface ScaleDegree {
  readonly step: Step;
  readonly octave: Octave;
}

/** 純正律長音階の振動数比（配列表の「振動数比」欄）。 */
export const JUST_RATIOS: readonly Ratio[] = [
  ratio(1),
  ratio(9, 8),
  ratio(5, 4),
  ratio(4, 3),
  ratio(3, 2),
  ratio(5, 3),
  ratio(15, 8),
];

export function parseDegree(text: string): ScaleDegree {
  const m = /^([1-7]|i)([\^_]?)$/.exec(text);
  if (!m) throw new RangeError(`音階の表記が不正: ${text}`);
  const [, s, mark] = m;
  if (s === 'i') {
    if (mark) throw new RangeError(`音階の表記が不正: ${text}`);
    return { step: 1, octave: 1 };
  }
  const step = Number(s) as Step;
  const octave: Octave = mark === '^' ? 1 : mark === '_' ? -1 : 0;
  return { step, octave };
}

const DOT_ABOVE = '̇';
const DOT_BELOW = '̣';

/** 説明書と同じ見た目（点付き数字、上の 1 は i）にする。 */
export function formatDegree(d: ScaleDegree): string {
  if (d.step === 1 && d.octave === 1) return 'i';
  if (d.octave === 1) return `${d.step}${DOT_ABOVE}`;
  if (d.octave === -1) return `${d.step}${DOT_BELOW}`;
  return String(d.step);
}

/** 主音（1）に対する振動数比。 */
export function degreeRatio(d: ScaleDegree): Ratio {
  const base = JUST_RATIOS[d.step - 1];
  if (!base) throw new RangeError(`音階が範囲外: ${d.step}`);
  if (d.octave === 1) return mulRatio(base, ratio(2));
  if (d.octave === -1) return mulRatio(base, ratio(1, 2));
  return base;
}

export function degreeKey(d: ScaleDegree): string {
  return d.octave === 1 ? `${d.step}^` : d.octave === -1 ? `${d.step}_` : String(d.step);
}
