// 駆動系の時間モデル。
//
// 2極の三相誘導電動機が、歯車で剛結された全サイレンの羽根車を回す。
// 慣性と、モーターのトルク特性と、羽根車の空気負荷と、電磁ブレーキで回転数の時間変化が決まる。
// 説明書でわかっているのは端点だけ：
//   起動：START から約 10〜15 秒で演奏可能な回転に達する。
//   停止：電源断から 8〜10 秒で羽根車が止まる（電磁ブレーキ）。
// カーブの形は仮定で、ここに置いたパラメータで決まる。
//
// トルクはすべて「モーターの最大トルク = 1」の無次元で扱い、慣性は時定数 [s] で与える。
//   dx/dt = (T_motor(x) − T_load(x) − T_brake) / inertia
// x = 回転数 / 同期回転数（0〜1）。

export interface DriveParams {
  /** 電源周波数 [Hz]。 */
  readonly supplyHz: number;
  /** 極数。実機は 2。 */
  readonly poles: number;
  /** 定常滑り（全カバー閉）。実機の値は伊賀の録音から逆算する予定。 */
  readonly slip: number;
  /** 最大トルクを出す滑り（Kloss の式）。2重籠形は起動トルクが大きいので大きめ。 */
  readonly breakdownSlip: number;
  /** 慣性の時定数 [s]：J·ωs / Tmax。起動時間をほぼ決める。 */
  readonly inertia: number;
  /** 電磁ブレーキのトルク（最大トルク比）。停止時間をほぼ決める。 */
  readonly brakeTorque: number;
  /** 軸受などの摩擦トルク（最大トルク比）。ブレーキ無しでも最後は止まる。 */
  readonly friction: number;
  /** 開閉カバー1枚が全開のとき、空気負荷が何割増えるか。和音で全音がわずかに下がる仮説の結合。 */
  readonly openLoad: number;
}

export const DEFAULT_DRIVE_PARAMS: DriveParams = {
  supplyHz: 60,
  poles: 2,
  slip: 0.02,
  breakdownSlip: 0.3,
  inertia: 7.6,
  brakeTorque: 0.8,
  friction: 0.01,
  openLoad: 0.02,
};

export interface DriveState {
  /** モーター軸の回転数 [rps]。 */
  readonly rps: number;
}

export interface DriveInput {
  /** モーターに通電しているか（START で true、STOP で false）。 */
  readonly power: boolean;
  /** 電磁ブレーキが効いているか。実機は電源断で自動的に効く。 */
  readonly brake: boolean;
  /** 開閉カバーの開度の合計（各サイレン 0〜1 の和）。 */
  readonly openSum: number;
}

export const INITIAL_DRIVE_STATE: DriveState = { rps: 0 };

export function synchronousRps(p: Pick<DriveParams, 'supplyHz' | 'poles'>): number {
  return (p.supplyHz * 2) / p.poles;
}

/** モーターのトルク（最大トルク比）。Kloss の式。x は同期回転数に対する比。 */
export function motorTorque(x: number, p: DriveParams): number {
  const s = 1 - x;
  if (s <= 0) return 0;
  const sk = p.breakdownSlip;
  return 2 / (s / sk + sk / s);
}

/** 定常状態（全カバー閉）で負荷と釣り合うように決めた空気負荷の係数。 */
export function fanLoadCoefficient(p: DriveParams): number {
  const x = 1 - p.slip;
  const k = (motorTorque(x, p) - p.friction) / (x * x);
  if (k <= 0) throw new RangeError('滑りが小さすぎて負荷が負になる');
  return k;
}

/** 負荷トルク（最大トルク比）。摩擦＋空気（回転数の2乗）。 */
export function loadTorque(x: number, openSum: number, p: DriveParams): number {
  return p.friction + fanLoadCoefficient(p) * x * x * (1 + p.openLoad * openSum);
}

/** 定常回転数 [rps]。カバーが開くほど負荷が増えてわずかに下がる。 */
export function steadyStateRps(p: DriveParams, openSum = 0): number {
  // T_motor(x) = T_load(x) を二分法で解く。T_motor は x∈(1−sk, 1) で単調減少、T_load は単調増加。
  let lo = 1 - p.breakdownSlip;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (motorTorque(mid, p) > loadTorque(mid, openSum, p)) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * synchronousRps(p);
}

/** dt 秒だけ進める。dt は数 ms 程度を想定（半陰的オイラー）。 */
export function stepDrive(state: DriveState, input: DriveInput, p: DriveParams, dt: number): DriveState {
  const sync = synchronousRps(p);
  let x = state.rps / sync;
  const torque = (input.power ? motorTorque(x, p) : 0) - loadTorque(x, input.openSum, p) - (input.brake ? p.brakeTorque : 0);
  x += (torque / p.inertia) * dt;
  // 負荷と摩擦とブレーキは回転を止めるだけで、逆転はさせない。
  if (x < 0) x = 0;
  if (x > 1) x = 1;
  return { rps: x * sync };
}
