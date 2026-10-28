// 自動運転（AUT）。START を押すと起動し、カムが 1 回転して曲を吹鳴し、オートストッパーで止まる。
// 説明書：「START を約 5 秒押すと 1 曲吹鳴後自動的に停止」「起動後約 10〜15 秒たってから演奏」。
// 純粋な状態機械。MachineInput を出し、simulation.ts に渡す。

import { camKeysAt, type CamProgram } from './cam';
import type { MachineInput } from './simulation';

export type AutoPhase = 'idle' | 'starting' | 'playing' | 'stopping';

export interface AutoState {
  readonly phase: AutoPhase;
  /** 現在の段階に入ってからの時間 [s]。 */
  readonly t: number;
}

export interface AutoParams {
  /** 起動から演奏開始までの待ち時間 [s]。カムの空白部分にあたる。 */
  readonly leadInSec: number;
  /** 曲の終わりからオートストッパーが働くまでの時間 [s]。 */
  readonly tailSec: number;
}

/** 説明書の「10〜15 秒」より短め。トキハの映像では約 5 秒で定常なので 8 秒あれば十分。 */
export const DEFAULT_AUTO_PARAMS: AutoParams = { leadInSec: 8, tailSec: 1.5 };

export const AUTO_IDLE: AutoState = { phase: 'idle', t: 0 };

export function startAuto(): AutoState {
  return { phase: 'starting', t: 0 };
}

export function stopAuto(): AutoState {
  return { phase: 'stopping', t: 0 };
}

export interface AutoStep {
  readonly state: AutoState;
  readonly input: MachineInput;
}

/**
 * dt 秒進める。motorStopped は羽根車が止まったか（停止段階を終える条件）。
 * manualKeys を渡すと、鍵盤の操作をカムの通電と OR で重ねる（非常用の手動吹鳴）。
 */
export function stepAutoplay(
  state: AutoState,
  program: CamProgram | null,
  sirenCount: number,
  params: AutoParams,
  dt: number,
  motorStopped: boolean,
  manualKeys?: readonly boolean[],
): AutoStep {
  let next: AutoState = { phase: state.phase, t: state.t + dt };
  let keys = new Array<boolean>(sirenCount).fill(false);
  let power = false;
  let brake = false;

  switch (state.phase) {
    case 'idle':
      next = AUTO_IDLE;
      break;
    case 'starting':
      power = true;
      if (next.t >= params.leadInSec) next = { phase: 'playing', t: next.t - params.leadInSec };
      break;
    case 'playing':
      power = true;
      if (program) {
        keys = camKeysAt(program, sirenCount, next.t);
        if (next.t >= program.durationSec + params.tailSec) next = { phase: 'stopping', t: 0 };
      } else {
        next = { phase: 'stopping', t: 0 };
      }
      break;
    case 'stopping':
      // 電源断。電磁ブレーキは電源断で効く。
      brake = !motorStopped;
      if (motorStopped) next = AUTO_IDLE;
      break;
  }
  if (manualKeys) keys = keys.map((k, i) => k || (manualKeys[i] ?? false));
  return { state: next, input: { power, brake, keys } };
}
