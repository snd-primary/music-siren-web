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

/**
 * mm。サイレン本体の寸法は説明書の第2図（350φ）の比率から、中央ベースの並びは第1図の比率から拾った。
 * 色と細部は伊賀機の映像（docs/adr/0017-3d-from-figures-and-video.md）。
 */
export const DIM = {
  pairPitch: 570,
  sideMargin: 43, // 1183 − 2 × 570
  centerBase8: 1500,
  centerBase: 1530,
  gearExtra: 396, // 12C の 2149 − 1753
  /** 左右ベースの幅。第4図の基礎ボルトの間隔が 570、基礎の幅が 770。 */
  baseWidth: 620,
  /** 中央ベースの幅。第4図の基礎の幅が 955。 */
  centerBaseWidth: 800,
  /** 床からベース上面までの高さ（足を含む）。 */
  baseHeight: 160,
  /** 軸の中心の、ベース上面からの高さ。第2図では開閉カバーの下端が軸受の座面とほぼ同じ高さ。 */
  axisHeight: 230,
  shaftRadius: 25,
  /** 開閉カバーの胴の外半径。 */
  coverRadius: 195,
  /** 開閉カバーの吸気側の縁（つば）の外半径。 */
  flangeRadius: 203,
  /** 固定カバーの胴の外半径。開閉カバーとの隙間は実機では 0.2 mm ほど。 */
  fixedRadius: 187,
  /** 羽根車の外半径（350φ）。 */
  impellerRadius: 175,
  /** 吸気口（固定カバーの前の環の内側）の半径。 */
  eyeRadius: 105,
  /** サイレン本体 1 台の軸方向の長さ（開閉カバーの幅）。 */
  drumLength: 110,
  /** 対の中の 2 台の背板の間隔（軸受ユニットが入る）。第1図で対の 2 台の中心間隔が約 370。 */
  pairGap: 262,
  /** 窓の幅の、ピッチに対する比（見た目）。第2図の側面図では約半分。 */
  windowWidthRatio: 0.45,
  /** 窓の軸方向の長さ。 */
  windowLength: 70,
  /** マグネットカバー（箱）。x は軸方向、z は奥行き、zNear は軸から箱の手前の面まで。 */
  magnetBox: { x: 256, zNear: 110, zFar: 322, top: 100 },
  /** 中央ベースの並び（中央ベースの中心からの位置）。第1図の比率。 */
  center: { brake: -450, motor: 105, gear: 578, couplings: [-690, -165, 390, 700] },
  motor: { length: 370, radius: 150 },
  brake: { x: 200, y: 470, z: 520, drumRadius: 115, drumWidth: 80 },
  gearCase: { x: 130, z: 230, top: 85 },
  /** 歯車のモジュール。 */
  gearModule: 2.5,
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
