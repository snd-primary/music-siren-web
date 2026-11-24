import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNTH } from '../audio/synth';
import { DEFAULT_COVER_PARAMS } from '../mechanism/simulation';
import { CONTROLS, DEFAULT_TUNING, applyDiff, diffTuning, getAt, setAt } from './tuning';

describe('調整パネルの値', () => {
  it('どの項目も、既定値が範囲の中にある', () => {
    for (const c of CONTROLS) {
      const v = getAt(DEFAULT_TUNING, c.path);
      expect(typeof v, c.label).toBe('number');
      expect(v, c.label).toBeGreaterThanOrEqual(c.min);
      expect(v, c.label).toBeLessThanOrEqual(c.max);
    }
  });

  it('既定値は、利得 0 dB の追加のフォルマントを除いてコードの既定値と同じ', () => {
    expect(DEFAULT_TUNING.cover).toEqual(DEFAULT_COVER_PARAMS);
    expect(DEFAULT_TUNING.synth.formants.slice(0, DEFAULT_SYNTH.formants.length)).toEqual(DEFAULT_SYNTH.formants);
    expect(DEFAULT_TUNING.synth.formants.at(-1)?.gainDb).toBe(0);
    expect({ ...DEFAULT_TUNING.synth, formants: DEFAULT_SYNTH.formants }).toEqual(DEFAULT_SYNTH);
  });

  it('setAt は元を変えずに、その位置の値だけを差し替える', () => {
    const t = setAt(DEFAULT_TUNING, ['synth', 'formants', 1, 'gainDb'], -12);
    expect(t.synth.formants[1]?.gainDb).toBe(-12);
    expect(t.synth.formants[0]).toBe(DEFAULT_TUNING.synth.formants[0]);
    expect(t.cover).toBe(DEFAULT_TUNING.cover);
    expect(DEFAULT_TUNING.synth.formants[1]?.gainDb).toBe(DEFAULT_SYNTH.formants[1]?.gainDb);
    expect(Array.isArray(t.synth.formants)).toBe(true);
  });

  it('差分は変えた値だけを持ち、重ね直すと元に戻る', () => {
    expect(diffTuning(DEFAULT_TUNING)).toEqual({});
    let t = setAt(DEFAULT_TUNING, ['synth', 'edgeBlur'], 0.05);
    t = setAt(t, ['cover', 'wander'], 0.06);
    t = setAt(t, ['synth', 'formants', 2, 'gainDb'], 6);
    const diff = diffTuning(t);
    expect(diff.synth?.edgeBlur).toBe(0.05);
    expect(diff.cover).toEqual({ wander: 0.06 });
    expect(Object.keys(diff.synth ?? {}).sort()).toEqual(['edgeBlur', 'formants']);
    expect(applyDiff(JSON.parse(JSON.stringify(diff)))).toEqual(t);
  });

  it('壊れた値・範囲外の値は捨てて既定値を使う', () => {
    const t = applyDiff({ synth: { edgeBlur: 'x', leak: 99, gain: 0.2, formants: [{ hz: null }] }, cover: 3 });
    expect(t.synth.edgeBlur).toBe(DEFAULT_SYNTH.edgeBlur);
    expect(t.synth.leak).toBe(DEFAULT_SYNTH.leak);
    expect(t.synth.gain).toBe(0.2);
    expect(t.synth.formants).toEqual(DEFAULT_TUNING.synth.formants);
    expect(t.cover).toEqual(DEFAULT_COVER_PARAMS);
    expect(applyDiff(null)).toEqual(DEFAULT_TUNING);
  });
});
