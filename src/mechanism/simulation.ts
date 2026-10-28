// 機械全体の時間発展。音響側（AudioWorklet）と 3D 側はこの状態だけを読む。
//
//   state = { 駆動系（モーター回転数）, 各軸の回転位相, 各サイレンの開閉カバーの開度 }
//   input = { 通電, ブレーキ, 各サイレンのマグネット通電（鍵盤／音曲カム） }

import { DEFAULT_DRIVE_PARAMS, INITIAL_DRIVE_STATE, stepDrive, type DriveParams, type DriveState } from './drive';
import type { Machine } from './machine';
import { ratioToNumber } from './ratio';

export interface CoverParams {
  /** 全閉→全開にかかる時間 [s]（マグネットがレバーを引く）。仮の値。 */
  readonly openTime: number;
  /** 全開→全閉にかかる時間 [s]（スプリングで戻る）。仮の値。 */
  readonly closeTime: number;
}

export const DEFAULT_COVER_PARAMS: CoverParams = { openTime: 0.05, closeTime: 0.1 };

export interface MachineParams {
  readonly drive: DriveParams;
  readonly cover: CoverParams;
}

export const DEFAULT_MACHINE_PARAMS: MachineParams = { drive: DEFAULT_DRIVE_PARAMS, cover: DEFAULT_COVER_PARAMS };

export interface MachineState {
  readonly drive: DriveState;
  /** 各軸の回転位相（0〜1 回転）。machine.shafts と同じ順。 */
  readonly shaftTurns: readonly number[];
  /** 各サイレンの開閉カバーの開度（0 = 閉、1 = 全開）。machine.sirens と同じ順。 */
  readonly covers: readonly number[];
}

export interface MachineInput {
  readonly power: boolean;
  readonly brake: boolean;
  /** 各サイレンのマグネット通電。machine.sirens と同じ順。 */
  readonly keys: readonly boolean[];
}

export function initialMachineState(machine: Machine): MachineState {
  return {
    drive: INITIAL_DRIVE_STATE,
    shaftTurns: machine.shafts.map(() => 0),
    covers: machine.sirens.map(() => 0),
  };
}

export function stepMachine(
  machine: Machine,
  state: MachineState,
  input: MachineInput,
  params: MachineParams,
  dt: number,
): MachineState {
  // 開閉カバー：一定速度で目標へ動く（レバーがストッパーに当たるまで）。
  const covers = state.covers.map((open, i) => {
    const target = input.keys[i] ? 1 : 0;
    const rate = target > open ? 1 / params.cover.openTime : 1 / params.cover.closeTime;
    const step = rate * dt;
    return target > open ? Math.min(target, open + step) : Math.max(target, open - step);
  });
  const openSum = covers.reduce((a, b) => a + b, 0);

  const drive = stepDrive(state.drive, { power: input.power, brake: input.brake, openSum }, params.drive, dt);

  // 軸の位相：区間の中央の回転数で進める。
  const meanRps = (state.drive.rps + drive.rps) / 2;
  const shaftTurns = machine.shafts.map((shaft, i) => {
    const turns = (state.shaftTurns[i] ?? 0) + meanRps * ratioToNumber(shaft.ratio) * dt;
    return turns - Math.floor(turns);
  });

  return { drive, shaftTurns, covers };
}
