import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNTH, SirenSynth, portArea } from './synth';

const SR = 48000;

function magnitudeAt(x: Float32Array, hz: number): number {
  let re = 0;
  let im = 0;
  for (let n = 0; n < x.length; n += 1) {
    const w = (2 * Math.PI * hz * n) / SR;
    re += (x[n] ?? 0) * Math.cos(w);
    im -= (x[n] ?? 0) * Math.sin(w);
  }
  return Math.hypot(re, im) / x.length;
}

/** Hann 窓をかけた DFT の大きさ（ノイズの床を測るときに、音の裾が漏れないように）。 */
function hannMagnitudeAt(x: Float32Array, hz: number): number {
  let re = 0;
  let im = 0;
  let ws = 0;
  for (let n = 0; n < x.length; n += 1) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (x.length - 1));
    ws += w;
    const a = (2 * Math.PI * hz * n) / SR;
    re += (x[n] ?? 0) * w * Math.cos(a);
    im -= (x[n] ?? 0) * w * Math.sin(a);
  }
  return Math.hypot(re, im) / ws;
}

function render(synth: SirenSynth, samples: number): Float32Array {
  const out = new Float32Array(samples);
  synth.render(out);
  return out;
}

describe('SirenSynth', () => {
  it('漏れが無ければ、カバーが閉じていれば無音', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, leak: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
    synth.setTarget({ motorRps: 60, covers: [0] });
    const out = render(synth, 4800);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('8ポート・60rps・全開なら 480Hz が基音になる', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
    synth.setTarget({ motorRps: 60, covers: [1] });
    render(synth, SR / 2); // 補間が落ち着くまで捨てる
    const out = render(synth, SR / 2);
    const m480 = magnitudeAt(out, 480);
    expect(m480).toBeGreaterThan(0.01);
    expect(m480).toBeGreaterThan(magnitudeAt(out, 400) * 20);
    expect(m480).toBeGreaterThan(magnitudeAt(out, 560) * 20);
    expect(magnitudeAt(out, 960)).toBeGreaterThan(0); // 倍音もある
  });

  it('右軸（3/4）の 15 ポートは 675Hz', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 15, ratio: 0.75 }] });
    synth.setTarget({ motorRps: 60, covers: [1] });
    render(synth, SR / 2);
    const out = render(synth, SR / 2);
    expect(magnitudeAt(out, 675)).toBeGreaterThan(magnitudeAt(out, 720) * 20);
  });

  it('漏れ：閉じて圧がたまった音は、開いて止まった音より約 19dB 低い（伊賀の映像：−17〜−22dB）', () => {
    // 閉：開度 0・圧の山 0.4（たまりきった値）。開：停止位置の重なり 0.8・圧の山はほぼ抜けた 0.08。
    const level = (cover: number, surge: number) => {
      const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
      synth.setTarget({ motorRps: 60, covers: [cover], surges: [surge] });
      render(synth, SR / 2);
      return magnitudeAt(render(synth, SR / 2), 480);
    };
    const db = 20 * Math.log10(level(0, 0.4) / level(0.8, 0.08));
    expect(db).toBeLessThan(-17);
    expect(db).toBeGreaterThan(-22);
  });

  // 伊賀機の配置（左軸 4 台・右軸 4 台）と、映像の定常の回転数。
  const IGA = [8, 9, 10, 12, 15, 10, 9, 8].map((ports, i) => ({ ports, ratio: i < 4 ? 1 : 0.75 }));
  const IGA_RPS = 60 * 0.98694;
  /** 開いたカバーの停止位置（mechanism/simulation.ts の restAngle）。 */
  const REST = 0.9;
  /** 伊賀機のサイレン 1 台だけを開いた音（カバーは停止位置）。 */
  function igaSolo(index: number, jet = 0, cover = REST): Float32Array {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet, gain: 0.02, sampleRate: SR, nominalRps: 60, sirens: IGA });
    synth.setTarget({ motorRps: IGA_RPS, covers: IGA.map((_, i) => (i === index ? cover : 0)) });
    render(synth, SR / 2);
    return render(synth, SR);
  }
  const igaHz = (index: number) => IGA[index]!.ports * IGA[index]!.ratio * IGA_RPS;

  // 伊賀の映像で単音で鳴った 4 音の、基音に対する倍音（h2〜h8, dB）。docs/adr/0012-fixed-formants.md
  const MEASURED: { name: string; index: number; db: number[] }[] = [
    { name: '2', index: 6, db: [0.6, -18.4, -19.7, -23.6, -26.6, -18.3, -22.1] },
    { name: '3', index: 5, db: [-5.0, -21.9, -14.1, -17.4, -24.9, -26.2, -23.0] },
    { name: '5', index: 1, db: [-12.6, -25.7, -24.6, -30.4, -35.3, -38.0, -32.5] },
    { name: '6', index: 2, db: [-32.9, -15.6, -28.8, -22.1, -35.5, -30.6, -35.2] },
  ];

  it.each(MEASURED)('倍音構造が伊賀の映像の「$name」に近い（h2〜h8 の誤差 rms 6 dB 以内）', ({ index, db }) => {
    const out = igaSolo(index);
    const f = igaHz(index);
    const h1 = magnitudeAt(out, f);
    const model = db.map((_, k) => 20 * Math.log10(magnitudeAt(out, f * (k + 2)) / h1));
    const rms = Math.sqrt(model.reduce((a, v, k) => a + (v - db[k]!) ** 2, 0) / db.length);
    expect(rms, model.map((v) => v.toFixed(1)).join(' ')).toBeLessThan(6);
  });

  it('フォルマント：同じ第 2 倍音でも、1300 Hz の谷に近い「6」は弱く、580 Hz の山に近い「2」は強い', () => {
    const h2 = (index: number) => {
      const out = igaSolo(index);
      return 20 * Math.log10(magnitudeAt(out, igaHz(index) * 2) / magnitudeAt(out, igaHz(index)));
    };
    expect(h2(2)).toBeLessThan(-20); // 「6」：映像 −32.9
    expect(h2(6)).toBeGreaterThan(-8); // 「2」：映像 +0.6
  });

  it('フォルマント：580 Hz の山に近い「5」「6」は、「2」「3」より基音が大きい（映像で 5〜6 dB）', () => {
    const level = (index: number) => 20 * Math.log10(magnitudeAt(igaSolo(index), igaHz(index)));
    const near = (level(1) + level(2)) / 2;
    const far = (level(5) + level(6)) / 2;
    expect(near - far).toBeGreaterThan(3);
    expect(near - far).toBeLessThan(10);
  });

  it('気流のノイズ：全開の音に対する総量は、8 音の平均で −21〜−15 dB（伊賀の映像は周囲の雑音込みで約 −12 dB）', () => {
    const power = (x: Float32Array) => x.reduce((acc, v) => acc + v * v, 0) / x.length;
    let tone = 0;
    let noise = 0;
    for (let i = 0; i < IGA.length; i += 1) {
      const t = power(igaSolo(i));
      tone += t;
      noise += power(igaSolo(i, DEFAULT_SYNTH.jet)) - t;
    }
    const db = 10 * Math.log10(noise / tone);
    expect(db).toBeGreaterThan(-21);
    expect(db).toBeLessThan(-15);
  });

  it('気流のノイズは高域ほど弱い（8 kHz は 1 kHz より 15 dB 以上低い）', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 9, ratio: 1 }] });
    synth.setTarget({ motorRps: 60, covers: [1] });
    render(synth, SR / 2);
    let lo = 0;
    let hi = 0;
    for (let seg = 0; seg < 6; seg += 1) {
      const x = render(synth, 8192);
      for (const off of [-30, -10, 10, 30]) {
        lo += hannMagnitudeAt(x, 1000 + off) ** 2; // 1 kHz の近く（倍音 1080 を避ける）
        hi += hannMagnitudeAt(x, 8000 + off) ** 2;
      }
    }
    expect(10 * Math.log10(lo / hi)).toBeGreaterThan(15);
  });

  it('気流のノイズは開口に比例するので、閉じたカバーでは小さい', () => {
    const level = (cover: number) => {
      const synth = new SirenSynth({ ...DEFAULT_SYNTH, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 9, ratio: 1 }] });
      synth.setTarget({ motorRps: 60, covers: [cover] });
      render(synth, SR / 2);
      const x = render(synth, 8192);
      return [-40, -25, 25, 40].reduce((a, off) => a + hannMagnitudeAt(x, 540 + off) ** 2, 0);
    };
    expect(10 * Math.log10(level(1) / level(0))).toBeGreaterThan(12);
  });

  it('空気室の圧の山（surge）の分だけ流量が増え、音が大きくなる', () => {
    const level = (surge: number) => {
      const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
      synth.setTarget({ motorRps: 60, covers: [0.8], surges: [surge] });
      render(synth, SR / 4);
      return magnitudeAt(render(synth, SR / 4), 480);
    };
    expect(level(0.4) / level(0)).toBeCloseTo(1.4, 1);
  });

  it('開口面積は 2 つの窓の重なり：台形で、高さは狭いほうの幅、底は幅の和', () => {
    expect(portArea(0.5, 0.12, 0.2, 0)).toBeCloseTo(0.12, 12); // 重なりきる
    expect(portArea(0.5 + 0.04, 0.12, 0.2, 0)).toBeCloseTo(0.12, 12); // 上底 |a − b| = 0.08 の中
    expect(portArea(0.5 + 0.1, 0.12, 0.2, 0)).toBeCloseTo(0.06, 12); // 斜面の中央
    expect(portArea(0.5 + 0.16, 0.12, 0.2, 0)).toBe(0); // 底 a + b = 0.32 の端
    expect(portArea(0.5 - 0.1, 0.12, 0.2, 0)).toBeCloseTo(0.06, 12); // 左右対称
    expect(portArea(0.5, 0.12, 0.03, 0)).toBeCloseTo(0.03, 12); // 細い隙間
    expect(portArea(0.5, 0.12, 0, 0)).toBe(0);
  });

  it('縁をぼかしても開口面積の 1 周期の積分（平均の流量）は変わらず、角が丸まる', () => {
    const mean = (blur: number) => {
      let sum = 0;
      for (let k = 0; k < 20000; k += 1) sum += portArea((k + 0.5) / 20000, 0.12, 0.18, blur);
      return sum / 20000;
    };
    expect(mean(0)).toBeCloseTo(0.12 * 0.18, 6); // 幅の積
    expect(mean(0.05)).toBeCloseTo(0.12 * 0.18, 6);
    // 底の端（0.5 + 0.15）は、ぼかすと少し開く。上底の中は変わらない。
    expect(portArea(0.65, 0.12, 0.18, 0.05)).toBeGreaterThan(0);
    expect(portArea(0.65, 0.12, 0.18, 0.05)).toBeLessThan(0.01);
    expect(portArea(0.5, 0.12, 0.18, 0.05)).toBeCloseTo(0.12, 12);
    // 連続（隣り合う点の差が小さい）
    for (let k = 0; k < 2000; k += 1) {
      const d = portArea((k + 1) / 2000, 0.12, 0.18, 0.05) - portArea(k / 2000, 0.12, 0.18, 0.05);
      expect(Math.abs(d)).toBeLessThan(0.0006);
    }
  });

  it('開閉カバーは窓の幅を変える：開き始めの細い隙間は、開いた音より高次の倍音が多い', () => {
    const tilt = (cover: number) => {
      const out = igaSolo(1, 0, cover); // 「5」
      const f = igaHz(1);
      const hi = [5, 6, 7, 8].reduce((a, h) => a + magnitudeAt(out, f * h) ** 2, 0);
      return 10 * Math.log10(hi / magnitudeAt(out, f) ** 2);
    };
    expect(tilt(0.15)).toBeGreaterThan(tilt(REST) + 6);
    expect(tilt(0.3)).toBeGreaterThan(tilt(REST) + 3);
  });

  it('閉じたカバーの漏れは窓孔の全幅から出るので、倍音の形は重なりきった音と同じ', () => {
    // 他のサイレンの漏れ音と重ならないよう、1 台だけで測る。
    const f = 540;
    const shape = (cover: number) => {
      const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet: 0, gain: 0.02, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 9, ratio: 1 }] });
      synth.setTarget({ motorRps: 60, covers: [cover] });
      render(synth, SR / 2);
      const out = render(synth, SR);
      // 第 5 倍音は窓孔の幅 0.2 の谷（5 × 0.2 = 1）に当たるので外す。
      return [2, 3, 4, 6].map((h) => 20 * Math.log10(magnitudeAt(out, f * h) / magnitudeAt(out, f)));
    };
    const closed = shape(0);
    const full = shape(1);
    for (let k = 0; k < closed.length; k += 1) expect(Math.abs(closed[k]! - full[k]!)).toBeLessThan(1);
  });

  it('開いたカバーが揺れると、基音より高次の倍音のほうが大きく動く', () => {
    const levels = (cover: number) => {
      const out = igaSolo(1, 0, cover);
      const f = igaHz(1);
      return [1, 5, 6].map((h) => 20 * Math.log10(magnitudeAt(out, f * h)));
    };
    const [a1, a5, a6] = levels(REST) as [number, number, number];
    const [b1, b5, b6] = levels(1) as [number, number, number]; // ストッパーに当たった位置
    expect(Math.abs(b1 - a1)).toBeLessThan(1.5);
    expect(Math.max(Math.abs(b5 - a5), Math.abs(b6 - a6))).toBeGreaterThan(Math.abs(b1 - a1) + 3);
  });

  it('伊賀機の 4 音の和音でも、ピークは 0.75 未満（tanh でほとんど歪まない）', () => {
    const synth = new SirenSynth({
      ...DEFAULT_SYNTH,
      sampleRate: SR,
      nominalRps: 60,
      sirens: [8, 9, 10, 12, 15, 10, 9, 8].map((ports, i) => ({ ports, ratio: i < 4 ? 1 : 0.75 })),
    });
    synth.setTarget({ motorRps: 60 * 0.98694, covers: [1, 0, 1, 0, 0, 1, 0, 1] });
    render(synth, SR / 2);
    const out = render(synth, SR * 2);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThan(0.75);
  });

  it('出力は常に ±1 に収まる', () => {
    const synth = new SirenSynth({
      ...DEFAULT_SYNTH,
      gain: 10,
      sampleRate: SR,
      nominalRps: 60,
      sirens: [8, 9, 10, 12].map((ports) => ({ ports, ratio: 1 })),
    });
    synth.setTarget({ motorRps: 60, covers: [1, 1, 1, 0.5] });
    const out = render(synth, SR);
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('音色のパラメータは鳴らしながら差し替えられる（位相は保たれ、音が途切れない）', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
    synth.setTarget({ motorRps: 60, covers: [0.9] });
    render(synth, SR / 2);
    const before = render(synth, SR / 2);
    synth.setParams({ ...DEFAULT_SYNTH, jet: 0, gain: DEFAULT_SYNTH.gain / 2, formants: [] });
    const first = render(synth, 64);
    // 差し替えた直後の 1 サンプル目が、直前の続きから大きく飛ばない（位相を作り直していない）。
    expect(Math.abs(first[0]! - before[before.length - 1]!)).toBeLessThan(0.2);
    render(synth, SR / 2);
    const after = render(synth, SR / 2);
    expect(magnitudeAt(after, 480)).toBeGreaterThan(0.001);
    // フォルマントを外すと、1300 Hz の谷に近い第 3 倍音（1440 Hz）が基音に対して強くなる。
    const ratio = (x: Float32Array) => magnitudeAt(x, 1440) / magnitudeAt(x, 480);
    expect(ratio(after)).toBeGreaterThan(ratio(before) * 3);
  });

  it('回転が止まれば音も止まる', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, jet: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
    synth.setTarget({ motorRps: 0, covers: [1] });
    render(synth, SR);
    const out = render(synth, 4800);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(1e-6);
  });
});
