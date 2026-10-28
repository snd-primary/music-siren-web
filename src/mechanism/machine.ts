// 機械の構成。配列表の記法をそのままデータにし、そこから軸とサイレンを導く。
//
//   [8/4] [9 10/5 6] [12/i] | B M 3/4 | [15/7] [10 9/3 2] [8/1]
//
// 括弧1つ＝軸受ユニット1つ（羽根車1〜2枚）、B M＝ブレーキとモーター（中央ベース）、
// 分数＝変速歯車。歯車は「駆動側に対する従動側の回転比」で、モーターから遠ざかる向きに掛け合わせる。
// 12C は左ベースの途中にも 10/9 の歯車があるので、軸は2本固定ではなく、歯車で区切られた区間ごとに1本とする。

import { parseDegree, type ScaleDegree } from './degree';
import { mulRatio, ONE, ratioEquals, type Ratio } from './ratio';

export interface SirenSpec {
  /** 音階。"1".."7"、"i" / "1^"（上）、"5_"（下）。 */
  readonly degree: string;
  /** ポート数。音程 [Hz] = ポート数 × 軸回転数 [rps]。 */
  readonly ports: number;
}

export type LayoutItem =
  | { readonly kind: 'unit'; readonly sirens: readonly SirenSpec[] }
  | { readonly kind: 'gear'; readonly ratio: Ratio }
  | { readonly kind: 'drive' };

export interface MachineSpec {
  readonly id: string;
  readonly name: string;
  /** 音数（配列表の「音数」）。 */
  readonly notes: number;
  /** 調子。60Hz / 50Hz で同じ機械が違う調で鳴る。 */
  readonly key: { readonly at60Hz: string; readonly at50Hz: string };
  /** 羽根車まわりの直径 [mm]。350φ。 */
  readonly impellerDiameterMm: number;
  /** 左端から右端への並び。 */
  readonly layout: readonly LayoutItem[];
}

export type Side = 'left' | 'right';

export interface Shaft {
  /** "L0" = 左・直結、"R1" = 右・歯車1つ目の先、のように付ける。 */
  readonly id: string;
  readonly side: Side;
  /** モーター軸に対する回転比。 */
  readonly ratio: Ratio;
}

export interface Siren {
  /** 左端からの通し番号（0 始まり）。 */
  readonly index: number;
  readonly degree: ScaleDegree;
  readonly ports: number;
  readonly shaftId: string;
  readonly side: Side;
  /** 所属する軸受ユニットの、左端からの通し番号（0 始まり、中央ベースは数えない）。 */
  readonly unitIndex: number;
}

export interface Machine {
  readonly spec: MachineSpec;
  readonly shafts: readonly Shaft[];
  readonly sirens: readonly Siren[];
}

export const unit = (...sirens: readonly (readonly [degree: string, ports: number])[]): LayoutItem => ({
  kind: 'unit',
  sirens: sirens.map(([degree, ports]) => ({ degree, ports })),
});
export const gear = (ratio: Ratio): LayoutItem => ({ kind: 'gear', ratio });
export const DRIVE: LayoutItem = { kind: 'drive' };

export function buildMachine(spec: MachineSpec): Machine {
  const driveIndexes = spec.layout.flatMap((item, i) => (item.kind === 'drive' ? [i] : []));
  const driveIndex = driveIndexes[0];
  if (driveIndex === undefined) throw new Error(`${spec.id}: 配列に駆動部（DRIVE）がない`);
  if (driveIndexes.length > 1) throw new Error(`${spec.id}: 駆動部が2つ以上ある`);

  // 各位置の回転比：モーターからその位置までの間にある歯車を掛け合わせる。
  // 左側はモーターから左へ、右側はモーターから右へ歩く。
  const ratioAt: Ratio[] = spec.layout.map(() => ONE);
  const gearsAt: number[] = spec.layout.map(() => 0);
  for (const dir of [-1, 1] as const) {
    let ratio = ONE;
    let gears = 0;
    for (let i = driveIndex + dir; i >= 0 && i < spec.layout.length; i += dir) {
      const item = spec.layout[i];
      if (item?.kind === 'gear') {
        ratio = mulRatio(ratio, item.ratio);
        gears += 1;
      }
      ratioAt[i] = ratio;
      gearsAt[i] = gears;
    }
  }

  const shafts: Shaft[] = [];
  const sirens: Siren[] = [];
  let unitIndex = 0;
  spec.layout.forEach((item, i) => {
    if (item.kind !== 'unit') return;
    const side: Side = i < driveIndex ? 'left' : 'right';
    const shaftId = `${side === 'left' ? 'L' : 'R'}${gearsAt[i]}`;
    const ratio = ratioAt[i] ?? ONE;
    const existing = shafts.find((s) => s.id === shaftId);
    if (!existing) shafts.push({ id: shaftId, side, ratio });
    else if (!ratioEquals(existing.ratio, ratio)) throw new Error(`${spec.id}: 軸 ${shaftId} の回転比が一致しない`);
    if (item.sirens.length < 1 || item.sirens.length > 2) {
      throw new Error(`${spec.id}: 軸受ユニットの羽根車は1〜2枚（${item.sirens.length}枚）`);
    }
    for (const s of item.sirens) {
      if (!Number.isInteger(s.ports) || s.ports < 1) throw new Error(`${spec.id}: ポート数が不正 ${s.ports}`);
      sirens.push({ index: sirens.length, degree: parseDegree(s.degree), ports: s.ports, shaftId, side, unitIndex });
    }
    unitIndex += 1;
  });

  if (sirens.length !== spec.notes) {
    throw new Error(`${spec.id}: 音数 ${spec.notes} に対してサイレンが ${sirens.length} 台`);
  }
  return { spec, shafts, sirens };
}
