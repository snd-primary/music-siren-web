// サイレン単位の最小の合成。Web Audio に依存しない純粋な DSP（テストはここに書く）。
//
// 1台のサイレン：羽根車が回り、羽根車の窓と固定カバーの窓孔の重なりが周期的に変わる。
// 羽根の数・固定カバーの窓数・開閉カバーの窓数はどれもポート数に等しい（YMSHA の助言）。
// 開閉カバーは固定カバーの窓孔の上を回って滑る板なので、開度 c（0〜1）は窓孔の「幅」を変える
// （docs/adr/0016-cover-narrows-window.md）。閉じても、板と固定カバーの隙間から窓孔の全幅にわたって leak の分だけ
// 漏れる（伊賀・岡山の録音で確認。漏れ音の倍音の形は開いた音とほぼ同じなので、細い隙間ではなく全幅の漏れ）。
//   残る窓の幅 b = windowWidth × c                          幅はどれもポートの間隔（1 周期）に対する比
//   開口面積   A(φ) = (1−leak)·W(rotorWidth, b) + leak·W(rotorWidth, windowWidth)
//              W(a, b) = 幅 a の窓と幅 b の窓の重なり        φ = 窓孔1つ分の位相（ポート数 × 軸回転数 × t）
//   流量       Q(t) = A × √P       P ∝ 回転数²  → Q ∝ A × 回転数
//   音圧       p(t) ∝ dQ/dt        （単極子）、そのあと放射・距離のローパス（1次）
// W は台形（底 rotorWidth + b、上底 |rotorWidth − b|、高さ min(rotorWidth, b)）で、角を幅 edgeBlur で丸める。
// 倍音は sin(πh·rotorWidth)·sin(πh·b)/h の形になり、b が動くと谷の位置（h = 1/b の倍数）が動く。
// そのため、開き始めの細い隙間は倍音が多く、開くにつれて高次が減る。開いたあとカバーが揺れる間は、
// 基音より高次の倍音のほうが大きく動く（伊賀の映像の立ち上がりで、基音と逆向きに動くのを確認）。
// 既定値は、停止位置（c = 0.9）での倍音が伊賀の映像の 4 音（2・3・5・6）に合うように、フォルマントと一緒に
// 当てはめた（docs/adr/0012-fixed-formants.md、0016）。
// 気流のノイズ：窓孔を抜ける噴流の乱流で、開口面積に比例して出る（伊賀の映像で、全開の音のまわりに
// 広帯域のノイズが立つ。全開の音に対する総量は約 −12 dB で、8 kHz より上は減る）。
// 羽根の通過で開口が周期的に変わるので、ノイズも基音で変調される。
// 開閉カバーの揺れ（開いた直後の山と、開いている間のゆっくりした揺れ）と、空気室の圧の山は
// 機構側（mechanism/simulation.ts）で作り、開度 covers と流量の倍率 surges として受け取る
// （docs/adr/0008-cover-bounce.md）。閉じているカバーは揺れない。
// 固定の共鳴（フォルマント）：音程によらず同じ周波数に山と谷がある（伊賀の映像の 4 音の倍音を絶対周波数で
// 並べると揃う。580 Hz の山と 1300 Hz の谷、docs/adr/0012-fixed-formants.md）。サイレン本体や建屋の
// 共鳴と考え、全サイレンの和に RBJ のピーキング・フィルタを直列に掛ける。気流のノイズには掛けない
// （映像のノイズには 1300 Hz の谷が見えない）。

export interface SynthSirenConfig {
  /** ポート数。 */
  readonly ports: number;
  /** 所属軸の変速比（数値）。 */
  readonly ratio: number;
}

/** 固定の共鳴 1 つ（RBJ のピーキング・フィルタ）。gainDb が負なら谷（反共鳴）。 */
export interface Formant {
  readonly hz: number;
  readonly gainDb: number;
  readonly q: number;
}

export interface SynthConfig {
  readonly sampleRate: number;
  readonly sirens: readonly SynthSirenConfig[];
  /** 公称のモーター回転数 [rps]。圧力と音量の基準。 */
  readonly nominalRps: number;
  /** 羽根車の窓の幅。ポートの間隔（1 周期）に対する比。 */
  readonly rotorWidth: number;
  /** 固定カバーの窓孔の幅（開閉カバーが重なりきったときに残る幅）。ポートの間隔に対する比。 */
  readonly windowWidth: number;
  /** 窓の縁のぼけ（羽根の縁が斜めに横切る分・隙間からの回り込み）。ポートの間隔に対する比。 */
  readonly edgeBlur: number;
  /** 閉じたカバーからの漏れ（板と固定カバーの隙間）。窓孔の全幅にわたる、全開の開口面積に対する比。 */
  readonly leak: number;
  /** 放射と距離を代表する 1 次ローパスのカットオフ [Hz]。 */
  readonly radiationCutoffHz: number;
  /** 全体の音量。 */
  readonly gain: number;
  /** 窓孔を抜ける気流のノイズの量（開口面積に比例）。 */
  readonly jet: number;
  /** 気流のノイズにかけるローパス（1 次を 2 段）のカットオフ [Hz]。高域のザラつきを抑える。 */
  readonly jetCutoffHz: number;
  /** 固定の共鳴（フォルマント）。全サイレンの音の和に直列に掛ける（気流のノイズには掛けない）。 */
  readonly formants: readonly Formant[];
}

/** 音色のパラメータ（機械の構成とサンプリング周波数を除いたもの）。鳴らしながら変えられる。 */
export type SynthParams = Omit<SynthConfig, 'sampleRate' | 'sirens' | 'nominalRps'>;

export const DEFAULT_SYNTH: SynthParams = {
  // 伊賀の映像の 4 音（2・3・5・6）の倍音に、フォルマントと一緒に当てはめた（0012、0016）。停止位置（開度 0.9）で
  // 残る窓の幅が 0.18、もう一方が 0.115。どちらが羽根車でどちらが固定カバーかは、倍音からは決まらない（仮定）。
  rotorWidth: 0.115,
  windowWidth: 0.2,
  edgeBlur: 0.08,
  // 伊賀の映像：閉じたカバーからの漏れは全開より約 −19 dB（自動利得の分を補正）。閉じている間は圧がたまり
  // （surge 0.5）、開いても重なりは停止位置の 0.9 なので、その分を見込んで 0.075 にした。
  leak: 0.075,
  // 高域の減り方はフォルマントが受け持つので、ローパスはほぼ外す（0012）。
  radiationCutoffHz: 5000,
  gain: 0.12, // 単音の全開で約 −20 dBFS。4 音の和音でもピークが 0.75 未満で、tanh でほとんど歪まない
  // 伊賀の映像：全開の音に対するノイズの総量は約 −12 dB（周囲の雑音を含む上限）。近い距離の録音なので、
  // 控えめに −18 dB にした。
  jet: 0.58,
  jetCutoffHz: 2000,
  formants: [
    { hz: 580, gainDb: 18, q: 3 },
    { hz: 1300, gainDb: -30, q: 1 },
  ],
};

/** RBJ のピーキング・フィルタの係数（a0 で正規化）。[b0, b1, b2, a1, a2]。 */
export function peakingCoefficients(f: Formant, sampleRate: number): [number, number, number, number, number] {
  const A = 10 ** (f.gainDb / 40);
  const w0 = (2 * Math.PI * f.hz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * f.q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha / A;
  return [(1 + alpha * A) / a0, (-2 * cos) / a0, (1 - alpha * A) / a0, (-2 * cos) / a0, (1 - alpha / A) / a0];
}

/** 台形（半底 B、高さ m）を 0 から u（≥ 0）まで積分したもの。 */
function trapezoidIntegral(u: number, B: number, m: number): number {
  const P = B - m; // 上底の半分
  if (u <= P) return m * u;
  if (u >= B) return m * P + (m * m) / 2;
  const d = u - P;
  return m * P + m * d - (d * d) / 2;
}

/**
 * 幅 a の窓と幅 b の窓の重なり（ポートの間隔に対する比）。ph は 0〜1 の位相で、0.5 で 2 つの窓の中心が揃う。
 * 重なりは台形（底 a + b、上底 |a − b|、高さ min(a, b)）で、角を幅 blur の移動平均で丸める。
 */
export function portArea(ph: number, a: number, b: number, blur: number): number {
  const m = Math.min(a, b);
  if (m <= 0) return 0;
  const B = (a + b) / 2;
  const x = Math.abs(ph - 0.5);
  if (blur <= 0) return Math.min(m, Math.max(0, B - x));
  if (x >= B + blur / 2) return 0;
  // 台形は偶関数。x − blur/2 が負のときは、0 をまたぐ分を足す。
  const hi = trapezoidIntegral(x + blur / 2, B, m);
  const lo = x - blur / 2;
  return (lo >= 0 ? hi - trapezoidIntegral(lo, B, m) : hi + trapezoidIntegral(-lo, B, m)) / blur;
}

export interface SynthTarget {
  readonly motorRps: number;
  /** 各サイレンの開閉カバーの開度（窓孔の重なり、0〜1）。 */
  readonly covers: readonly number[];
  /** 各空気室の圧の山（流量の倍率の増分）。省略時は 0。 */
  readonly surges?: readonly number[];
}

export class SirenSynth {
  private readonly phase: Float64Array;
  private readonly prevFlow: Float64Array;
  private readonly cover: Float64Array;
  private readonly coverTarget: Float64Array;
  private rps = 0;
  private rpsTarget = 0;
  private readonly rpsSmooth: number;
  private readonly coverSmooth: number;
  private lowpass = 0;
  private lowpassState = 0;
  private jetLowpass = 0;
  private jetState = 0;
  private jetState2 = 0;
  private noiseState = 0x9e3779b9;
  private readonly surge: Float64Array;
  private readonly surgeTarget: Float64Array;
  /** フォルマントの係数（5 個ずつ）と状態（転置直接形 II、2 個ずつ）。 */
  private formantCoef = new Float64Array(0);
  private formantState = new Float64Array(0);

  constructor(private config: SynthConfig) {
    const n = config.sirens.length;
    this.phase = new Float64Array(n);
    this.prevFlow = new Float64Array(n);
    this.cover = new Float64Array(n);
    this.coverTarget = new Float64Array(n);
    this.surge = new Float64Array(n);
    this.surgeTarget = new Float64Array(n);
    // メインスレッドからの更新は数十 ms おきなので、その間を 1 次で補間する。
    this.rpsSmooth = 1 - Math.exp(-1 / (0.02 * config.sampleRate));
    // カバーは約 8 Hz で揺れるので、更新（約 60 Hz）の段差だけをならす程度にする。
    this.coverSmooth = 1 - Math.exp(-1 / (0.006 * config.sampleRate));
    this.updateFilters();
  }

  /** 音色のパラメータを差し替える。回転の位相やフィルタの状態は保つので、鳴らしながら変えられる。 */
  setParams(params: SynthParams): void {
    this.config = { ...this.config, ...params };
    this.updateFilters();
  }

  private updateFilters(): void {
    const config = this.config;
    this.lowpass = 1 - Math.exp((-2 * Math.PI * config.radiationCutoffHz) / config.sampleRate);
    this.jetLowpass = 1 - Math.exp((-2 * Math.PI * config.jetCutoffHz) / config.sampleRate);
    this.formantCoef = new Float64Array(config.formants.flatMap((f) => peakingCoefficients(f, config.sampleRate)));
    // 段数が変わったときだけ状態を作り直す。
    if (this.formantState.length !== config.formants.length * 2) this.formantState = new Float64Array(config.formants.length * 2);
  }

  setTarget(target: SynthTarget): void {
    this.rpsTarget = Math.max(0, target.motorRps);
    for (let i = 0; i < this.coverTarget.length; i += 1) {
      const c = target.covers[i] ?? 0;
      this.coverTarget[i] = c < 0 ? 0 : c > 1 ? 1 : c;
      this.surgeTarget[i] = Math.max(0, target.surges?.[i] ?? 0);
    }
  }

  private white(): number {
    // xorshift32。品質より軽さ。
    let x = this.noiseState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseState = x >>> 0;
    return (this.noiseState / 0x100000000) * 2 - 1;
  }

  render(out: Float32Array): void {
    const { sampleRate, sirens, nominalRps, rotorWidth, windowWidth, edgeBlur, leak, gain, jet } = this.config;
    // 重なりきったときの開口面積（台形の高さ）を 1 にそろえる。
    const areaScale = 1 / Math.min(rotorWidth, windowWidth);
    const twoPi = Math.PI * 2;
    for (let n = 0; n < out.length; n += 1) {
      this.rps += (this.rpsTarget - this.rps) * this.rpsSmooth;
      const speed = this.rps / nominalRps; // 圧力の平方根 ∝ 回転数
      let sum = 0;
      let air = 0;
      for (let i = 0; i < sirens.length; i += 1) {
        const s = sirens[i] as SynthSirenConfig;
        const c = (this.cover[i] as number) + ((this.coverTarget[i] as number) - (this.cover[i] as number)) * this.coverSmooth;
        this.cover[i] = c;
        const cyclesPerSecond = s.ports * s.ratio * this.rps;
        let ph = (this.phase[i] as number) + cyclesPerSecond / sampleRate;
        if (ph >= 1) ph -= Math.floor(ph);
        this.phase[i] = ph;
        const sg = (this.surge[i] as number) + ((this.surgeTarget[i] as number) - (this.surge[i] as number)) * this.coverSmooth;
        this.surge[i] = sg;
        if (c <= 0 && leak <= 0 && (this.prevFlow[i] as number) === 0) continue;
        // 開閉カバーは窓孔の片側から開くので、残る窓の中心は窓孔の中心から (windowWidth − b)/2 ずれる。
        const b = windowWidth * c;
        let slit = ph + (windowWidth - b) / 2;
        if (slit >= 1) slit -= 1;
        const area =
          ((1 - leak) * portArea(slit, rotorWidth, b, edgeBlur) + leak * portArea(ph, rotorWidth, windowWidth, edgeBlur)) * areaScale;
        const flow = area * speed * (1 + sg);
        // dQ/dt を、公称音程での角周波数で正規化して、音程によらず同じ程度の大きさにする。
        const nominalCycles = s.ports * s.ratio * nominalRps;
        const dflow = ((flow - (this.prevFlow[i] as number)) * sampleRate) / (twoPi * nominalCycles);
        this.prevFlow[i] = flow;
        sum += dflow;
        // 気流のノイズは広帯域なので、放射のローパスではなく専用のローパスを通す。
        if (jet > 0) air += this.white() * jet * area * speed * speed;
      }
      this.lowpassState += (sum - this.lowpassState) * this.lowpass;
      this.jetState += (air - this.jetState) * this.jetLowpass;
      this.jetState2 += (this.jetState - this.jetState2) * this.jetLowpass;
      let y = this.lowpassState;
      const fc = this.formantCoef;
      const fs = this.formantState;
      for (let c = 0, z = 0; c < fc.length; c += 5, z += 2) {
        const x = y;
        y = (fc[c] as number) * x + (fs[z] as number);
        fs[z] = (fc[c + 1] as number) * x - (fc[c + 3] as number) * y + (fs[z + 1] as number);
        fs[z + 1] = (fc[c + 2] as number) * x - (fc[c + 4] as number) * y;
      }
      out[n] = Math.tanh((y + this.jetState2) * gain * 4);
    }
  }
}
