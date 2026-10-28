// 取扱説明書「サイレン種類及び其の配列表」の振動数（60Hz / 50Hz、滑りゼロの公称値）を、
// プリセット（配列）と音程式だけから再現する。これがこのプロジェクトの最初の期待値。
import { describe, expect, it } from 'vitest';
import { buildMachine } from '../mechanism/machine';
import { degreeKey, degreeRatio, parseDegree } from '../mechanism/degree';
import { machineFrequencies, nominalMotorRps, sirenFrequency, tonicHz } from '../mechanism/pitch';
import { ratio, ratioEquals, ratioToNumber } from '../mechanism/ratio';
import { PRESETS } from './index';

// 配列表の値そのまま。50Hz は表の丸め（337, 562, 426, 534 など）をそのまま写している。
const TABLE: Record<string, Record<string, readonly [hz60: number, hz50: number]>> = {
  'iga-8': {
    '1': [360, 300], '2': [405, 337], '3': [450, 375], '4': [480, 400],
    '5': [540, 450], '6': [600, 500], '7': [675, 562], '1^': [720, 600],
  },
  '10a': {
    '5_': [270, 225], '6_': [300, 250],
    '1': [360, 300], '2': [405, 337], '3': [450, 375], '4': [480, 400],
    '5': [540, 450], '6': [600, 500], '7': [675, 562], '1^': [720, 600],
  },
  '10b': {
    '1': [360, 300], '2': [405, 337], '3': [450, 375], '4': [480, 400],
    '5': [540, 450], '6': [600, 500], '7': [675, 562], '1^': [720, 600],
    '2^': [810, 674], '3^': [900, 750],
  },
  '12a': {
    '5_': [270, 225], '6_': [300, 250],
    '1': [360, 300], '2': [405, 337], '3': [450, 375], '4': [480, 400],
    '5': [540, 450], '6': [600, 500], '7': [675, 562], '1^': [720, 600],
    '2^': [810, 674], '3^': [900, 750],
  },
  '12c': {
    '6_': [267, 222], '7_': [300, 250],
    '1': [320, 267], '2': [360, 300], '3': [400, 333], '4': [426, 355],
    '5': [480, 400], '6': [534, 445], '7': [600, 500], '1^': [640, 534],
    '2^': [720, 600], '3^': [800, 666],
  },
};

const drive = (supplyHz: number): number => nominalMotorRps({ supplyHz, poles: 2, slip: 0 });

describe.each(PRESETS)('$id', (spec) => {
  const machine = buildMachine(spec);
  const expected = TABLE[spec.id];
  if (!expected) throw new Error(`配列表のデータがない: ${spec.id}`);

  it('音数と音階の集合が配列表と一致する', () => {
    expect(machine.sirens).toHaveLength(spec.notes);
    const keys = machine.sirens.map((s) => degreeKey(s.degree)).sort();
    expect(keys).toEqual(Object.keys(expected).sort());
  });

  it.each([60, 50])('%dHz の全振動数を 1Hz 以内で再現する', (hz) => {
    const col = hz === 60 ? 0 : 1;
    for (const siren of machine.sirens) {
      const want = expected[degreeKey(siren.degree)]?.[col];
      expect(want).toBeDefined();
      const got = sirenFrequency(machine, siren, drive(hz));
      expect(Math.abs(got - (want ?? 0)), `${degreeKey(siren.degree)}: ${got} vs ${want}`).toBeLessThanOrEqual(1);
    }
  });

  it('全サイレンが主音に対して純正律の比になっている', () => {
    const tonic = tonicHz(machine, drive(60));
    for (const siren of machine.sirens) {
      const got = sirenFrequency(machine, siren, drive(60));
      expect(got / tonic).toBeCloseTo(ratioToNumber(degreeRatio(siren.degree)), 9);
    }
  });

  it('50Hz では 60Hz のちょうど 5/6 倍で鳴る（音程補正はない）', () => {
    const f60 = machineFrequencies(machine, drive(60));
    const f50 = machineFrequencies(machine, drive(50));
    for (const [i, f] of f60) expect(f50.get(i)).toBeCloseTo((f * 5) / 6, 9);
  });

  it('使われるポート数は説明書に現れる 5, 6, 8, 9, 10, 12, 15, 18 のどれか', () => {
    for (const s of machine.sirens) expect([5, 6, 8, 9, 10, 12, 15, 18]).toContain(s.ports);
  });
});

describe('軸の構成', () => {
  it('8音・10A・10B・12A は左が直結、右が 3/4 の2軸', () => {
    for (const spec of PRESETS.filter((p) => p.id !== '12c')) {
      const m = buildMachine(spec);
      expect(m.shafts.map((s) => [s.id, s.ratio.num, s.ratio.den])).toEqual([['L0', 1, 1], ['R1', 3, 4]]);
    }
  });

  it('12C は左端 10/9・左 直結・右 8/9 の3軸で、左端の 3 と 6 だけが 10/9', () => {
    const m = buildMachine(PRESETS.find((p) => p.id === '12c')!);
    expect(m.shafts.map((s) => [s.id, s.ratio.num, s.ratio.den])).toEqual([['L1', 10, 9], ['L0', 1, 1], ['R1', 8, 9]]);
    const fast = m.sirens.filter((s) => s.shaftId === 'L1').map((s) => degreeKey(s.degree));
    expect(fast.sort()).toEqual(['3', '6']);
    expect(m.sirens.filter((s) => s.shaftId === 'L0')).toHaveLength(4);
    expect(m.sirens.filter((s) => s.shaftId === 'R1')).toHaveLength(6);
  });

  it('伊賀機は配列表の括弧どおり左右 3 ユニットずつ、左右 4 音ずつ', () => {
    // 伊賀市の「羽根車2枚×4組」との対応は未確定（docs 参照）。ここでは配列表の括弧をそのまま数える。
    const m = buildMachine(PRESETS[0]!);
    const units = new Set(m.sirens.map((s) => s.unitIndex));
    expect(units.size).toBe(6);
    expect(m.sirens.filter((s) => s.side === 'left')).toHaveLength(4);
  });

  it('左右で同じ歯車数なら同じ回転比になる（12C の両端は別の比）', () => {
    const m = buildMachine(PRESETS.find((p) => p.id === '12c')!);
    const l1 = m.shafts.find((s) => s.id === 'L1')!;
    const r1 = m.shafts.find((s) => s.id === 'R1')!;
    expect(ratioEquals(l1.ratio, ratio(10, 9))).toBe(true);
    expect(ratioEquals(r1.ratio, ratio(8, 9))).toBe(true);
  });
});

describe('音階の表記', () => {
  it('i は上の 1、^ と _ はオクターブ', () => {
    expect(parseDegree('i')).toEqual({ step: 1, octave: 1 });
    expect(parseDegree('1^')).toEqual({ step: 1, octave: 1 });
    expect(parseDegree('5_')).toEqual({ step: 5, octave: -1 });
    expect(() => parseDegree('8')).toThrow();
    expect(() => parseDegree('i^')).toThrow();
  });
});
