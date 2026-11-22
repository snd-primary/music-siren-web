// サイレン単位の最小の合成。Web Audio に依存しない純粋な DSP（テストはここに書く）。
//
// 1台のサイレン：羽根車が回り、固定カバーの窓孔と羽根の重なりが周期的に変わる。
// 羽根の数・固定カバーの窓数・開閉カバーの窓数はどれもポート数に等しい（YMSHA の助言）。
// 開閉カバーの開度 c（0〜1）で窓孔全体が絞られる。閉じても leak の分だけ漏れる（伊賀・岡山の録音で確認）。
//   開口面積 A(t) = (leak + (1−leak)·c) × a(φ)      φ = 窓孔1つ分の位相（ポート数 × 軸回転数 × t）
//   流量      Q(t) = A × √P       P ∝ 回転数²  → Q ∝ A × 回転数
//   音圧      p(t) ∝ dQ/dt        （単極子）、そのあと放射・距離のローパス（1次）
// a(φ) は羽根と窓の重なりで、半値幅 duty・縁の幅 edge の台形（縁は余弦で丸める）。
// duty ≈ 1/3 で 3・6 次の倍音が弱くなり、edge とローパスで高次の減り方が決まる。
// 既定値は伊賀機の映像の倍音構造（「3」と「5」の平均：h2 ≈ −7.5 dB、h3 −23、h4 −18、h5 −20、h6 −31.5）に
// 当てはめた（docs/adr/0004-iga-sound-from-video.md）。
// 気流のノイズ：窓孔を抜ける噴流の乱流で、開口面積に比例して出る（伊賀の映像で、全開の音のまわりに
// 広帯域のノイズが立つ。全開の音に対する総量は約 −12 dB で、8 kHz より上は減る）。
// 羽根の通過で開口が周期的に変わるので、ノイズも基音で変調される。
// 開閉カバーの揺れ（開いた直後の山と、開いている間のゆっくりした揺れ）と、空気室の圧の山は
// 機構側（mechanism/simulation.ts）で作り、開度 covers と流量の倍率 surges として受け取る
// （docs/adr/0008-cover-bounce.md）。閉じているカバーは揺れない。

export interface SynthSirenConfig {
  /** ポート数。 */
  readonly ports: number;
  /** 所属軸の変速比（数値）。 */
  readonly ratio: number;
}

export interface SynthConfig {
  readonly sampleRate: number;
  readonly sirens: readonly SynthSirenConfig[];
  /** 公称のモーター回転数 [rps]。圧力と音量の基準。 */
  readonly nominalRps: number;
  /** 開口関数（台形）の半値幅。周期に対する比。 */
  readonly duty: number;
  /** 開口関数の縁（0→1 に立ち上がる区間）の幅。周期に対する比。 */
  readonly edge: number;
  /** 閉じたカバーからの漏れ。全開の開口面積に対する比。 */
  readonly leak: number;
  /** 放射と距離を代表する 1 次ローパスのカットオフ [Hz]。 */
  readonly radiationCutoffHz: number;
  /** 全体の音量。 */
  readonly gain: number;
  /** 窓孔を抜ける気流のノイズの量（開口面積に比例）。 */
  readonly jet: number;
  /** 気流のノイズにかけるローパス（1 次を 2 段）のカットオフ [Hz]。高域のザラつきを抑える。 */
  readonly jetCutoffHz: number;
}

export const DEFAULT_SYNTH: Omit<SynthConfig, 'sampleRate' | 'sirens' | 'nominalRps'> = {
  duty: 0.315,
  edge: 0.16,
  // 伊賀の映像：閉じたカバーからの漏れは全開より約 −19 dB（自動利得の分を補正）。閉じている間は圧がたまり
  // （surge 0.4）、開いても重なりは停止位置の 0.8 なので、その分を見込んで 0.07 にした。
  leak: 0.07,
  radiationCutoffHz: 300,
  gain: 0.12, // 単音の全開で約 −20 dBFS。4 音の和音でもピークが 0.75 未満で、tanh でほとんど歪まない
  // 伊賀の映像：全開の音に対するノイズの総量は約 −12 dB（周囲の雑音を含む上限）。近い距離の録音なので、
  // 控えめに −18 dB にした。
  jet: 0.28,
  jetCutoffHz: 2000,
};

/** 窓孔の重なり（0〜1）。ph は 0〜1 の位相。 */
export function portOpening(ph: number, duty: number, edge: number): number {
  const d = Math.abs(ph - 0.5);
  const a = Math.min(1, Math.max(0, (duty / 2 + edge / 2 - d) / edge));
  return 0.5 - 0.5 * Math.cos(Math.PI * a);
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
  private readonly lowpass: number;
  private lowpassState = 0;
  private readonly jetLowpass: number;
  private jetState = 0;
  private jetState2 = 0;
  private noiseState = 0x9e3779b9;
  private readonly surge: Float64Array;
  private readonly surgeTarget: Float64Array;

  constructor(private readonly config: SynthConfig) {
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
    this.lowpass = 1 - Math.exp((-2 * Math.PI * config.radiationCutoffHz) / config.sampleRate);
    this.jetLowpass = 1 - Math.exp((-2 * Math.PI * config.jetCutoffHz) / config.sampleRate);
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
    const { sampleRate, sirens, nominalRps, duty, edge, leak, gain, jet } = this.config;
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
        const opening = leak + (1 - leak) * c;
        if (opening <= 0 && (this.prevFlow[i] as number) === 0) continue;
        const area = opening * portOpening(ph, duty, edge);
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
      out[n] = Math.tanh((this.lowpassState + this.jetState2) * gain * 4);
    }
  }
}
