// 駆動系の時間モデル。
//
// 2極の三相誘導電動機が、歯車で剛結された全サイレンの羽根車を回す。
// 慣性と、モーターのトルク特性と、羽根車の空気負荷と、電磁ブレーキで回転数の時間変化が決まる。
//
// 根拠（docs/adr/0003-iga-drive-from-video.md）：
//   伊賀機の映像（起動〜演奏〜停止が1本に入っている）から、全音の比 r(t) を tools/track-speed.py で追い、
//   このモデルを最小二乗で当てはめた。
//   起動：START から約 12 秒、ほぼ一定の加速（約 0.09/s）で定常に達する。説明書の「10〜15 秒」と合う。
//   停止：電源断のあとの減速は空気負荷（回転数の2乗）でほぼ説明でき、ブレーキはごく弱い。
//         説明書の「8〜10 秒」とは合わない。YMSHA の助言：停止時間はブレーキの劣化具合による。
//   滑り：定常で公称の 0.98694 倍（滑り 1.31%）。
//   トキハ本店（10B）の映像の当てはめ（起動約 5 秒、滑り 3.8%）は TOKIWA_10B_DRIVE_PARAMS に残す。
//
// トルクはすべて「モーターの最大トルク = 1」の無次元で扱い、慣性は時定数 [s] で与える。
//   dx/dt = (T_motor(x) − T_load(x) − T_brake) / inertia
// x = 回転数 / 同期回転数（0〜1）。
// モーターのトルク曲線は区分線形：起動トルク startTorque から x = 1 − kneeSlip で最大 1 まで直線に
// 上がり、そこから同期回転数で 0 まで直線に落ちる（2重籠形の、平らで最後に急に落ちる特性の近似）。

export interface DriveParams {
  /** 電源周波数 [Hz]。 */
  readonly supplyHz: number;
  /** 極数。実機は 2。 */
  readonly poles: number;
  /** 定常滑り（全カバー閉）。 */
  readonly slip: number;
  /** 起動トルク（最大トルク比）。2重籠形なので大きい。 */
  readonly startTorque: number;
  /** 最大トルクを出す滑り。ここから同期回転数までトルクが直線に落ちる。 */
  readonly kneeSlip: number;
  /** 慣性の時定数 [s]：J·ωs / Tmax。起動時間をほぼ決める。 */
  readonly inertia: number;
  /** 電磁ブレーキのトルク（最大トルク比）。停止時間をほぼ決める。劣化すると小さくなる。 */
  readonly brakeTorque: number;
  /** 軸受などの摩擦トルク（最大トルク比）。ブレーキ無しでも最後は止まる。 */
  readonly friction: number;
  /** 開閉カバー1枚が全開のとき、空気負荷が何割増えるか。和音で全音がわずかに下がる仮説の結合。 */
  readonly openLoad: number;
}

/**
 * 伊賀機（8音・350φ・60Hz）。映像の起動（約 2.0〜14 秒）と停止後の惰性（40.3〜64.5 秒）に当てはめた値。
 * 残差：起動の中央値 0.0025、惰性の rms 0.0011（同期回転数比）。
 */
export const IGA_DRIVE_PARAMS: DriveParams = {
  supplyHz: 60,
  poles: 2,
  slip: 0.0131,
  startTorque: 0.64,
  kneeSlip: 0.054,
  inertia: 8.7,
  brakeTorque: 0.0165,
  friction: 0,
  openLoad: 0.02,
};

/** トキハ本店（10B）。映像の起動（約 5 秒）に当てはめた値。停止は映像に無く、説明書の 8〜10 秒に合わせた。 */
export const TOKIWA_10B_DRIVE_PARAMS: DriveParams = {
  supplyHz: 60,
  poles: 2,
  slip: 0.038,
  startTorque: 0.8,
  kneeSlip: 0.1,
  inertia: 4.3,
  brakeTorque: 0.35,
  friction: 0.01,
  openLoad: 0.02,
};

/** 既定は伊賀機（モデリングの対象を伊賀機に絞る。docs/adr/0001-model-iga-only.md）。 */
export const DEFAULT_DRIVE_PARAMS: DriveParams = IGA_DRIVE_PARAMS;

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

/** モーターのトルク（最大トルク比）。x は同期回転数に対する比。 */
export function motorTorque(x: number, p: DriveParams): number {
  if (x >= 1) return 0;
  if (x <= 0) return p.startTorque;
  const knee = 1 - p.kneeSlip;
  if (x < knee) return p.startTorque + (1 - p.startTorque) * (x / knee);
  return (1 - x) / p.kneeSlip;
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
  // T_motor(x) = T_load(x) を二分法で解く。T_motor は x∈(1−kneeSlip, 1) で単調減少、T_load は単調増加。
  let lo = 1 - p.kneeSlip;
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
