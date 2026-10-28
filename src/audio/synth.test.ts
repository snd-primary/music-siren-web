import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNTH, SirenSynth, portOpening } from './synth';

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
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, noise: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
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
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, noise: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 15, ratio: 0.75 }] });
    synth.setTarget({ motorRps: 60, covers: [1] });
    render(synth, SR / 2);
    const out = render(synth, SR / 2);
    expect(magnitudeAt(out, 675)).toBeGreaterThan(magnitudeAt(out, 720) * 20);
  });

  it('漏れがあれば、閉じていても全開より約 30dB 低い音が出る（岡山の録音：−20〜−25dB）', () => {
    const make = () => new SirenSynth({ ...DEFAULT_SYNTH, noise: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
    const closed = make();
    closed.setTarget({ motorRps: 60, covers: [0] });
    render(closed, SR / 2);
    const leakLevel = magnitudeAt(render(closed, SR / 2), 480);
    const open = make();
    open.setTarget({ motorRps: 60, covers: [1] });
    render(open, SR / 2);
    const fullLevel = magnitudeAt(render(open, SR / 2), 480);
    expect(leakLevel).toBeGreaterThan(0);
    const db = 20 * Math.log10(leakLevel / fullLevel);
    expect(db).toBeLessThan(-20);
    expect(db).toBeGreaterThan(-40);
  });

  it('倍音構造が岡山の録音の範囲に入る（h2 −8〜−25dB、h3 −3〜−25dB、高次ほど弱い）', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, noise: 0, gain: 0.02, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 6, ratio: 1 }] });
    synth.setTarget({ motorRps: 60, covers: [1] });
    render(synth, SR / 2);
    const out = render(synth, SR);
    const h = [1, 2, 3, 5, 7].map((k) => magnitudeAt(out, 360 * k));
    const db = (k: number) => 20 * Math.log10((h[k] ?? 0) / (h[0] ?? 1));
    expect(db(1)).toBeLessThan(-8);
    expect(db(1)).toBeGreaterThan(-25);
    expect(db(2)).toBeLessThan(-3);
    expect(db(2)).toBeGreaterThan(-25);
    expect(db(3)).toBeLessThan(db(2));
    expect(db(4)).toBeLessThan(db(3));
  });

  it('開口関数は半値幅 duty の台形で、縁は滑らか', () => {
    expect(portOpening(0.5, 0.5, 0.16)).toBeCloseTo(1, 9);
    expect(portOpening(0, 0.5, 0.16)).toBe(0);
    expect(portOpening(0.25, 0.5, 0.16)).toBeCloseTo(0.5, 9); // 半値点
    expect(portOpening(0.75, 0.5, 0.16)).toBeCloseTo(0.5, 9);
    expect(portOpening(0.3, 0.5, 0.16)).toBeGreaterThan(0.5);
    expect(portOpening(0.3, 0.5, 0.16)).toBeLessThan(1);
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

  it('回転が止まれば音も止まる', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, noise: 0, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
    synth.setTarget({ motorRps: 0, covers: [1] });
    render(synth, SR);
    const out = render(synth, 4800);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(1e-6);
  });
});
