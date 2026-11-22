// 機械全体の時間発展。音響側（AudioWorklet）と 3D 側はこの状態だけを読む。
//
//   state = { 駆動系（モーター回転数）, 各軸の回転位相, 各開閉カバーの角度と窓孔の重なり, 各空気室の圧の山 }
//   input = { 通電, ブレーキ, 各サイレンのマグネット通電（鍵盤／音曲カム） }
//
// 開閉カバー（docs/adr/0008-cover-bounce.md）：
//   角度 θ は 0 = 閉（板が窓孔の上）、1 = 開閉カバーの窓と固定カバーの窓孔がぴったり重なる位置。
//   窓孔の重なり（開度）は θ < 1 で θ、θ > 1 では行き過ぎた分だけ減る：overlap = 1 − |1 − θ|。
//   マグネットが引くと、θ は停止位置 restAngle へ向かう 2 次の振動になる。停止位置は重なりきる位置より
//   手前にあり、揺れの山で重なりきる位置を通るので、開いた直後に音が大きくなったり小さくなったりする
//   （伊賀の映像：約 8 Hz、250〜400 ms で収まる）。開いている間も、停止位置がゆっくりずれ続ける（座りの悪さ）。
//   通電を切るとスプリングで一定速度で戻り、ストッパーに押し付けられて止まる。閉じている間は揺れない。
//
// 空気室の圧の山（surge）：閉じている間に羽根車が空気室の圧を上げ、開いた瞬間にそれが抜ける。
//   流量の倍率として 1 + surge を合成に渡す。

import { DEFAULT_DRIVE_PARAMS, INITIAL_DRIVE_STATE, stepDrive, type DriveParams, type DriveState } from './drive';
import type { Machine } from './machine';
import { ratioToNumber } from './ratio';

export interface CoverParams {
  /** 全開→全閉にかかる時間 [s]（スプリングで戻る）。 */
  readonly closeTime: number;
  /**
   * 開く動作の最短の間隔 [s]。前に開き始めてからこれだけ経つまで、次は開き始めない
   * （マグネットとスプリングの往復の限界）。YMSHA の助言「開閉は1秒2〜3回まで」から 1/3 秒。
   */
  readonly minCycle: number;
  /** マグネットが引いたときの停止位置（重なりきる位置 = 1）。手前で止まるほど開いた直後の山が目立つ。 */
  readonly restAngle: number;
  /** 停止位置のまわりの揺れの固有振動数 [Hz]。 */
  readonly bounceHz: number;
  /** 揺れの減衰比。 */
  readonly bounceDamping: number;
  /** 開いている間の停止位置のずれ（角度の標準偏差）。座りの悪さ（劣化）。 */
  readonly wander: number;
  /** 開いた瞬間の圧の山（流量の倍率の増分）。閉じて圧がたまりきったときの値。 */
  readonly surge: number;
  /** 開いているときに圧の山が抜ける時定数 [s]。 */
  readonly surgeReleaseSec: number;
  /** 閉じているときに圧がたまる時定数 [s]。 */
  readonly surgeFillSec: number;
}

/** 伊賀の映像の、きれいに取れた立ち上がり 9 回に当てはめた値（docs/adr/0008-cover-bounce.md）。 */
export const DEFAULT_COVER_PARAMS: CoverParams = {
  closeTime: 0.12,
  minCycle: 1 / 3,
  restAngle: 0.8,
  bounceHz: 8,
  bounceDamping: 0.22,
  wander: 0.05,
  surge: 0.4,
  surgeReleaseSec: 0.3,
  surgeFillSec: 0.15,
};

export interface MachineParams {
  readonly drive: DriveParams;
  readonly cover: CoverParams;
}

export const DEFAULT_MACHINE_PARAMS: MachineParams = { drive: DEFAULT_DRIVE_PARAMS, cover: DEFAULT_COVER_PARAMS };

export interface MachineState {
  readonly drive: DriveState;
  /** 各軸の回転位相（0〜1 回転）。machine.shafts と同じ順。 */
  readonly shaftTurns: readonly number[];
  /** 各開閉カバーの角度 θ（0 = 閉、1 = 重なりきる位置。行き過ぎると 1 を超える）。machine.sirens と同じ順。 */
  readonly coverAngles: readonly number[];
  /** 各開閉カバーの角速度 [1/s]。 */
  readonly coverVelocities: readonly number[];
  /** 各サイレンの窓孔の重なり（開度、0〜1）。音はこれを読む。machine.sirens と同じ順。 */
  readonly covers: readonly number[];
  /** 各空気室の圧の山（流量の倍率の増分、0〜surge）。 */
  readonly surges: readonly number[];
  /** 各カバーが今、開く方へ動いているか（マグネットがレバーを引いているか）。 */
  readonly coverPulled: readonly boolean[];
  /** 各カバーが最後に開き始めてからの時間 [s]。 */
  readonly sinceOpen: readonly number[];
}

export interface MachineInput {
  readonly power: boolean;
  readonly brake: boolean;
  /** 各サイレンのマグネット通電。machine.sirens と同じ順。 */
  readonly keys: readonly boolean[];
}

export function initialMachineState(machine: Machine, params: MachineParams = DEFAULT_MACHINE_PARAMS): MachineState {
  return {
    drive: INITIAL_DRIVE_STATE,
    shaftTurns: machine.shafts.map(() => 0),
    coverAngles: machine.sirens.map(() => 0),
    coverVelocities: machine.sirens.map(() => 0),
    covers: machine.sirens.map(() => 0),
    surges: machine.sirens.map(() => params.cover.surge),
    coverPulled: machine.sirens.map(() => false),
    sinceOpen: machine.sirens.map(() => Infinity),
  };
}

/** 窓孔の重なり。θ = 1 で最大、行き過ぎると減る。 */
export function coverOverlap(angle: number): number {
  return Math.min(1, Math.max(0, 1 - Math.abs(1 - angle)));
}

/** 整数の組から [-1, 1) の決まった乱数を作る（状態を持たない）。 */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x3c6ef372, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return ((h >>> 0) / 0x100000000) * 2 - 1;
}

/** 一様乱数 3 つの和（標準偏差 1 の、ほぼ正規分布）。 */
function gauss(a: number, b: number): number {
  return hash(a, 3 * b) + hash(a, 3 * b + 1) + hash(a, 3 * b + 2);
}

function valueNoise(seed: number, t: number, period: number): number {
  const x = t / period;
  const k = Math.floor(x);
  const s = 0.5 - 0.5 * Math.cos(Math.PI * (x - k));
  const a = gauss(seed, k);
  return a + (gauss(seed, k + 1) - a) * s;
}

/**
 * 停止位置のゆっくりしたずれ（標準偏差ほぼ 1）。サイレンごと・時刻ごとに決まる純粋関数。
 * 周期 0.4 s の層（3 Hz 未満）に、周期 0.1 s・重み 0.35 の層（3〜10 Hz）を重ねる（伊賀の映像の揺れの帯域）。
 */
export function coverWander(sirenIndex: number, t: number): number {
  const norm = 1 / (0.79 * Math.sqrt(1 + 0.35 * 0.35));
  return (valueNoise(2 * sirenIndex + 1, t, 0.4) + 0.35 * valueNoise(2 * sirenIndex + 2, t, 0.1)) * norm;
}

export function stepMachine(
  machine: Machine,
  state: MachineState,
  input: MachineInput,
  params: MachineParams,
  dt: number,
): MachineState {
  const p = params.cover;

  // マグネット：通電していても、前に開き始めてから minCycle 経つまでは次を引かない。
  const coverPulled = state.coverPulled.map((pulled, i) => {
    const key = input.keys[i] ?? false;
    if (!key) return false;
    return pulled || (state.sinceOpen[i] ?? Infinity) >= p.minCycle;
  });
  const sinceOpen = state.sinceOpen.map((t, i) => (coverPulled[i] && !state.coverPulled[i] ? 0 : t) + dt);

  // 開閉カバー
  const w = 2 * Math.PI * p.bounceHz;
  const coverAngles: number[] = [];
  const coverVelocities: number[] = [];
  for (let i = 0; i < state.coverAngles.length; i += 1) {
    let angle = state.coverAngles[i] ?? 0;
    let vel = state.coverVelocities[i] ?? 0;
    if (coverPulled[i]) {
      // 停止位置へ向かう 2 次の振動（半陰的オイラー）。停止位置は開いている間ゆっくりずれる。
      const rest = p.restAngle + p.wander * coverWander(i, sinceOpen[i] ?? 0);
      vel += (w * w * (rest - angle) - 2 * p.bounceDamping * w * vel) * dt;
      angle += vel * dt;
      if (angle < 0) {
        angle = 0;
        vel = 0;
      }
    } else {
      // スプリングで一定速度で戻り、ストッパー（θ = 0）で止まる。
      angle = Math.max(0, angle - dt / p.closeTime);
      vel = 0;
    }
    coverAngles.push(angle);
    coverVelocities.push(vel);
  }
  const covers = coverAngles.map(coverOverlap);

  // 空気室の圧の山：閉じている間にたまり、開くと抜ける。
  const surges = state.surges.map((s, i) => {
    const c = covers[i] ?? 0;
    const target = p.surge * (1 - c);
    const tau = c > 0 ? p.surgeReleaseSec : p.surgeFillSec;
    return s + (target - s) * (1 - Math.exp(-dt / tau));
  });

  const openSum = covers.reduce((a, b) => a + b, 0);
  const drive = stepDrive(state.drive, { power: input.power, brake: input.brake, openSum }, params.drive, dt);

  // 軸の位相：区間の中央の回転数で進める。
  const meanRps = (state.drive.rps + drive.rps) / 2;
  const shaftTurns = machine.shafts.map((shaft, i) => {
    const turns = (state.shaftTurns[i] ?? 0) + meanRps * ratioToNumber(shaft.ratio) * dt;
    return turns - Math.floor(turns);
  });

  return { drive, shaftTurns, coverAngles, coverVelocities, covers, surges, coverPulled, sinceOpen };
}
