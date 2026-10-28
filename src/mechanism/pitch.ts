// 音程式。音程 [Hz] = ポート数 × 軸回転数 [rps]。軸回転数 = モーター回転数 × 変速比。
// モーター回転数は、公称値なら nominalMotorRps（滑りを固定）、時間変化なら drive.ts の状態から取る。

import { degreeRatio } from './degree';
import { ratioToNumber } from './ratio';
import type { Machine, Siren } from './machine';

export interface NominalSupply {
  /** 電源周波数 [Hz]。60 または 50。 */
  readonly supplyHz: number;
  /** 極数。実機は 2。 */
  readonly poles: number;
  /** 滑り（0〜1）。配列表は 0 の公称値。 */
  readonly slip: number;
}

/** 2極なら 60Hz で 60 rps。滑りの分だけ低い。 */
export function nominalMotorRps(s: NominalSupply): number {
  return ((s.supplyHz * 2) / s.poles) * (1 - s.slip);
}

export function shaftRps(machine: Machine, shaftId: string, motorRps: number): number {
  const shaft = machine.shafts.find((s) => s.id === shaftId);
  if (!shaft) throw new Error(`軸がない: ${shaftId}`);
  return motorRps * ratioToNumber(shaft.ratio);
}

export function sirenFrequency(machine: Machine, siren: Siren, motorRps: number): number {
  return siren.ports * shaftRps(machine, siren.shaftId, motorRps);
}

/** 全サイレンの音程。キーはサイレンの index。 */
export function machineFrequencies(machine: Machine, motorRps: number): Map<number, number> {
  return new Map(machine.sirens.map((s) => [s.index, sirenFrequency(machine, s, motorRps)]));
}

/** 主音（1）の振動数。各サイレンの音程を音律比で割って求める（全サイレンで一致するはず）。 */
export function tonicHz(machine: Machine, motorRps: number): number {
  const first = machine.sirens[0];
  if (!first) throw new Error('サイレンがない');
  return sirenFrequency(machine, first, motorRps) / ratioToNumber(degreeRatio(first.degree));
}
