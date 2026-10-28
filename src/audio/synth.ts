// サイレン単位の最小の合成。Web Audio に依存しない純粋な DSP（テストはここに書く）。
//
// 1台のサイレン：羽根車が回り、固定カバーの窓孔と羽根の重なりが周期的に変わる。
// 開閉カバーの開度 c（0〜1）で窓孔全体が絞られる。閉じても leak の分だけ漏れる（岡山の録音で確認）。
//   開口面積 A(t) = (leak + (1−leak)·c) × a(φ)      φ = 窓孔1つ分の位相（ポート数 × 軸回転数 × t）
//   流量      Q(t) = A × √P       P ∝ 回転数²  → Q ∝ A × 回転数
//   音圧      p(t) ∝ dQ/dt        （単極子）、そのあと放射・距離のローパス（1次）
// a(φ) は羽根と窓の重なりで、半値幅 duty・縁の幅 edge の台形（縁は余弦で丸める）。
// duty ≈ 0.5 で偶数次倍音が弱くなり、edge とローパスで高次の減り方が決まる。
// 既定値は岡山の録音の倍音構造（h2 ≈ −14 dB、h3 ≈ −16、h5 ≈ −22、h7 ≈ −28）に合わせた。
// 半開きでは縁を抜ける乱流のノイズを足す（かすれ）。

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
  /** 半開き時のノイズの量。 */
  readonly noise: number;
}

export const DEFAULT_SYNTH: Omit<SynthConfig, 'sampleRate' | 'sirens' | 'nominalRps'> = {
  duty: 0.46, // ちょうど 0.5 だと偶数次倍音が消えてしまう。実測は h2 ≈ −14 dB
  edge: 0.16,
  leak: 0.03,
  radiationCutoffHz: 600,
  gain: 0.25,
  noise: 0.15,
};

/** 窓孔の重なり（0〜1）。ph は 0〜1 の位相。 */
export function portOpening(ph: number, duty: number, edge: number): number {
  const d = Math.abs(ph - 0.5);
  const a = Math.min(1, Math.max(0, (duty / 2 + edge / 2 - d) / edge));
  return 0.5 - 0.5 * Math.cos(Math.PI * a);
}

export interface SynthTarget {
  readonly motorRps: number;
  /** 各サイレンの開閉カバーの開度（0〜1）。 */
  readonly covers: readonly number[];
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
  private noiseState = 0x9e3779b9;

  constructor(private readonly config: SynthConfig) {
    const n = config.sirens.length;
    this.phase = new Float64Array(n);
    this.prevFlow = new Float64Array(n);
    this.cover = new Float64Array(n);
    this.coverTarget = new Float64Array(n);
    // メインスレッドからの更新は数十 ms おきなので、その間を 1 次で補間する。
    this.rpsSmooth = 1 - Math.exp(-1 / (0.02 * config.sampleRate));
    this.coverSmooth = 1 - Math.exp(-1 / (0.003 * config.sampleRate));
    this.lowpass = 1 - Math.exp((-2 * Math.PI * config.radiationCutoffHz) / config.sampleRate);
  }

  setTarget(target: SynthTarget): void {
    this.rpsTarget = Math.max(0, target.motorRps);
    for (let i = 0; i < this.coverTarget.length; i += 1) {
      const c = target.covers[i] ?? 0;
      this.coverTarget[i] = c < 0 ? 0 : c > 1 ? 1 : c;
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
    const { sampleRate, sirens, nominalRps, duty, edge, leak, gain, noise } = this.config;
    const twoPi = Math.PI * 2;
    for (let n = 0; n < out.length; n += 1) {
      this.rps += (this.rpsTarget - this.rps) * this.rpsSmooth;
      const speed = this.rps / nominalRps; // 圧力の平方根 ∝ 回転数
      let sum = 0;
      for (let i = 0; i < sirens.length; i += 1) {
        const s = sirens[i] as SynthSirenConfig;
        const c = (this.cover[i] as number) + ((this.coverTarget[i] as number) - (this.cover[i] as number)) * this.coverSmooth;
        this.cover[i] = c;
        const cyclesPerSecond = s.ports * s.ratio * this.rps;
        let ph = (this.phase[i] as number) + cyclesPerSecond / sampleRate;
        if (ph >= 1) ph -= Math.floor(ph);
        this.phase[i] = ph;
        const opening = leak + (1 - leak) * c;
        if (opening <= 0 && (this.prevFlow[i] as number) === 0) continue;
        const area = opening * portOpening(ph, duty, edge);
        const flow = area * speed;
        // dQ/dt を、公称音程での角周波数で正規化して、音程によらず同じ程度の大きさにする。
        const nominalCycles = s.ports * s.ratio * nominalRps;
        const dflow = ((flow - (this.prevFlow[i] as number)) * sampleRate) / (twoPi * nominalCycles);
        this.prevFlow[i] = flow;
        sum += dflow;
        if (noise > 0 && c > 0 && c < 1) sum += this.white() * noise * area * (1 - c) * 4 * speed;
      }
      this.lowpassState += (sum - this.lowpassState) * this.lowpass;
      out[n] = Math.tanh(this.lowpassState * gain * 4);
    }
  }
}
