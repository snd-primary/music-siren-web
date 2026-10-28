import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNTH, SirenSynth } from './synth';

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
  it('カバーが閉じていれば無音', () => {
    const synth = new SirenSynth({ ...DEFAULT_SYNTH, sampleRate: SR, nominalRps: 60, sirens: [{ ports: 8, ratio: 1 }] });
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
