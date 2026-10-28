// 音程式。音程 [Hz] = ポート数 × 軸回転数 [rps]。軸回転数 = モーター回転数 × 変速比。
// モーターは2極の三相誘導電動機なので、同期回転数 [rps] = 電源周波数 × 2 / 極数、実回転数は滑りの分だけ低い。

import { degreeRatio } from './degree';
import { ratioToNumber } from './ratio';
import type { Machine, Siren } from './machine';

export interface DriveState {
  /** 電源周波数 [Hz]。60 または 50。 */
  readonly supplyHz: number;
  /** 極数。実機は 2。 */
  readonly poles: number;
  /** 滑り（0〜1）。配列表は 0 の公称値。 */
  readonly slip: number;
}

export function synchronousRps(drive: DriveState): number {
  return (drive.supplyHz * 2) / drive.poles;
}

export function motorRps(drive: DriveState): number {
  return synchronousRps(drive) * (1 - drive.slip);
}

export function shaftRps(machine: Machine, shaftId: string, drive: DriveState): number {
  const shaft = machine.shafts.find((s) => s.id === shaftId);
  if (!shaft) throw new Error(`軸がない: ${shaftId}`);
  return motorRps(drive) * ratioToNumber(shaft.ratio);
}

export function sirenFrequency(machine: Machine, siren: Siren, drive: DriveState): number {
  return siren.ports * shaftRps(machine, siren.shaftId, drive);
}

/** 全サイレンの音程。キーはサイレンの index。 */
export function machineFrequencies(machine: Machine, drive: DriveState): Map<number, number> {
  return new Map(machine.sirens.map((s) => [s.index, sirenFrequency(machine, s, drive)]));
}

/** 主音（1）の振動数。各サイレンの音程を音律比で割って求める（全サイレンで一致するはず）。 */
export function tonicHz(machine: Machine, drive: DriveState): number {
  const first = machine.sirens[0];
  if (!first) throw new Error('サイレンがない');
  return sirenFrequency(machine, first, drive) / ratioToNumber(degreeRatio(first.degree));
}
