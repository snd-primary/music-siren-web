// 機械の配置（3D 用）。DOM にも Three.js にも依存しない純粋関数。
//
// 寸法の根拠：
//   - 第4図（基礎寸法）：8音 350φ は 1183｜1500｜1183 = 3866 mm。10音AB は 1183｜1530｜1753 = 4466。
//     12音A は 1753｜1530｜1753 = 5036。12音C は 1753｜1530｜2149 = 5432。
//     → 片側の長さは、サイレン 4 台で 1183、6 台で 1753（対 1 組あたり 570）、歯車箱があると +396。
//   - トキハ本店（10B）の映像：サイレン本体は 2 台ずつ対になり、対の間に軸受がある。片側 6 台 = 3 対。
//   - 350φ は羽根車まわりの直径。開閉カバーの外径はそれより少し大きい。
// 配列表の括弧（軸受ユニット）と映像の「対」は一致しないので、3D では中央から外へ順に 2 台ずつ対にする。

import type { Machine, Side } from '../mechanism/machine';

/** mm。 */
export const DIM = {
  pairPitch: 570,
  sideMargin: 43, // 1183 − 2 × 570
  centerBase8: 1500,
  centerBase: 1530,
  gearExtra: 396, // 12C の 2149 − 1753
  baseWidth: 770,
  baseHeight: 200,
  /** 軸の中心の、基礎上面からの高さ。 */
  axisHeight: 420,
  shaftRadius: 25,
  /** 開閉カバーの外半径。350φ より少し大きい。 */
  coverRadius: 200,
  impellerRadius: 170,
  /** サイレン本体 1 台の軸方向の長さ。 */
  drumLength: 150,
  /** 対の中の 2 台の隙間（軸受ユニット）。 */
  pairGap: 180,
  windowWidthRatio: 0.45,
  windowHeight: 60,
  magnetBox: { x: 260, y: 300, z: 200 },
  motor: { length: 520, radius: 190 },
  brake: { x: 220, y: 480, z: 480 },
  gearBox: { x: 220, y: 260, z: 260 },
  building: { x: 4400, y: 2000, z: 1500 },
} as const;

export interface SirenPlacement {
  readonly sirenIndex: number;
  /** 軸方向の位置 [mm]。中央ベースの中心が 0、左が負。 */
  readonly x: number;
  /** 羽根車の背面（むき出しの面）が向く向き。+1 なら +x。 */
  readonly facing: 1 | -1;
  readonly pairIndex: number;
}

export interface PairPlacement {
  readonly pairIndex: number;
  readonly side: Side;
  readonly x: number;
  readonly sirenIndexes: readonly number[];
}

export interface GearPlacement {
  readonly x: number;
  readonly side: Side;
}

export interface MachineLayout {
  readonly sirens: readonly SirenPlacement[];
  readonly pairs: readonly PairPlacement[];
  /** 中央ベース以外の変速歯車（12C の 10/9）。 */
  readonly extraGears: readonly GearPlacement[];
  readonly leftLength: number;
  readonly centerLength: number;
  readonly rightLength: number;
  readonly totalLength: number;
}

function sideLength(sirenCount: number, extraGears: number): number {
  const pairs = Math.ceil(sirenCount / 2);
  return pairs * DIM.pairPitch + DIM.sideMargin + extraGears * DIM.gearExtra;
}

export function layoutMachine(machine: Machine): MachineLayout {
  const driveIndex = machine.spec.layout.findIndex((i) => i.kind === 'drive');
  const gearsLeft = machine.spec.layout.slice(0, driveIndex).filter((i) => i.kind === 'gear').length;
  const gearsRight = machine.spec.layout.slice(driveIndex + 2).filter((i) => i.kind === 'gear').length; // 中央の歯車（drive の直後）は数えない
  const left = machine.sirens.filter((s) => s.side === 'left');
  const right = machine.sirens.filter((s) => s.side === 'right');
  const centerLength = machine.spec.notes === 8 ? DIM.centerBase8 : DIM.centerBase;
  const leftLength = sideLength(left.length, gearsLeft);
  const rightLength = sideLength(right.length, gearsRight);

  const sirens: SirenPlacement[] = [];
  const pairs: PairPlacement[] = [];
  const extraGears: GearPlacement[] = [];

  const place = (side: Side, list: typeof left): void => {
    const dir = side === 'left' ? -1 : 1;
    // 中央に近い順に対にする
    const ordered = side === 'left' ? [...list].reverse() : list;
    let x = dir * (centerLength / 2 + DIM.sideMargin);
    // 歯車箱は、その歯車より外側のサイレンの手前に置く（12C は外側 2 台の内側）。
    const gearBefore = new Set<number>();
    if (side === 'left' ? gearsLeft : gearsRight) {
      // 外側の軸（左は L1 以上、右は R2 以上）に属する最初のサイレンの手前に歯車箱を置く
      const outerMin = side === 'left' ? 1 : 2;
      const first = ordered.find((s) => Number(s.shaftId.slice(1)) >= outerMin);
      if (first) gearBefore.add(first.index);
    }
    for (let i = 0; i < ordered.length; i += 2) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (!a) break;
      if (gearBefore.has(a.index)) {
        extraGears.push({ x: x + dir * (DIM.gearExtra / 2), side });
        x += dir * DIM.gearExtra;
      }
      const pairIndex = pairs.length;
      const center = x + dir * (DIM.pairPitch / 2);
      const members = [a, ...(b ? [b] : [])];
      pairs.push({ pairIndex, side, x: center, sirenIndexes: members.map((s) => s.index) });
      // 対の中：中央寄りの台が内側、外寄りの台が外側。羽根車の背面は外を向く。
      const offset = (DIM.pairGap + DIM.drumLength) / 2;
      sirens.push({ sirenIndex: a.index, x: center - dir * offset, facing: (-dir) as 1 | -1, pairIndex });
      if (b) sirens.push({ sirenIndex: b.index, x: center + dir * offset, facing: dir as 1 | -1, pairIndex });
      x += dir * DIM.pairPitch;
    }
  };
  place('left', left);
  place('right', right);
  sirens.sort((p, q) => p.sirenIndex - q.sirenIndex);

  return { sirens, pairs, extraGears, leftLength, centerLength, rightLength, totalLength: leftLength + centerLength + rightLength };
}
