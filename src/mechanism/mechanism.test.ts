import { describe, expect, it } from 'vitest';
import { formatDegree, parseDegree, degreeRatio } from './degree';
import { buildMachine, DRIVE, gear, unit } from './machine';
import { nominalMotorRps } from './pitch';
import { synchronousRps } from './drive';
import { mulRatio, ratio, ratioToString } from './ratio';

describe('ratio', () => {
  it('約分する', () => {
    expect(ratio(6, 8)).toEqual({ num: 3, den: 4 });
    expect(mulRatio(ratio(3, 4), ratio(8, 9))).toEqual({ num: 2, den: 3 });
    expect(ratioToString(ratio(10, 9))).toBe('10/9');
    expect(ratioToString(ratio(1))).toBe('1');
  });
  it('分母 0 と非整数は拒否する', () => {
    expect(() => ratio(1, 0)).toThrow();
    expect(() => ratio(1.5, 2)).toThrow();
  });
});

describe('degree', () => {
  it('説明書の表記に整形する', () => {
    expect(formatDegree(parseDegree('i'))).toBe('i');
    expect(formatDegree(parseDegree('2^'))).toBe('2̇');
    expect(formatDegree(parseDegree('5_'))).toBe('5̣');
    expect(formatDegree(parseDegree('4'))).toBe('4');
  });
  it('純正律の比', () => {
    expect(degreeRatio(parseDegree('5'))).toEqual({ num: 3, den: 2 });
    expect(degreeRatio(parseDegree('i'))).toEqual({ num: 2, den: 1 });
    expect(degreeRatio(parseDegree('6_'))).toEqual({ num: 5, den: 6 });
  });
});

describe('pitch', () => {
  it('2極・60Hz の同期回転数は 60 rps、50Hz は 50 rps', () => {
    expect(synchronousRps({ supplyHz: 60, poles: 2 })).toBe(60);
    expect(synchronousRps({ supplyHz: 50, poles: 2 })).toBe(50);
  });
  it('滑りの分だけ遅く回る', () => {
    expect(nominalMotorRps({ supplyHz: 60, poles: 2, slip: 0.03 })).toBeCloseTo(58.2);
  });
});

describe('buildMachine', () => {
  const base = { name: 't', key: { at60Hz: 'F', at50Hz: 'D' }, impellerDiameterMm: 350 };
  it('駆動部がなければ失敗する', () => {
    expect(() => buildMachine({ ...base, id: 't', notes: 1, layout: [unit(['1', 6])] })).toThrow(/DRIVE/);
  });
  it('音数とサイレン数が合わなければ失敗する', () => {
    expect(() => buildMachine({ ...base, id: 't', notes: 2, layout: [unit(['1', 6]), DRIVE] })).toThrow(/音数/);
  });
  it('3枚以上のユニットは失敗する', () => {
    expect(() =>
      buildMachine({ ...base, id: 't', notes: 3, layout: [unit(['1', 6], ['2', 6], ['3', 6]), DRIVE] }),
    ).toThrow(/1〜2枚/);
  });
  it('歯車は中央から遠ざかる向きに掛け合わせる', () => {
    const m = buildMachine({
      ...base,
      id: 't',
      notes: 3,
      layout: [unit(['1', 6]), gear(ratio(1, 2)), unit(['2', 6]), DRIVE, gear(ratio(3, 4)), gear(ratio(2, 3)), unit(['3', 6])],
    });
    expect(m.shafts.map((s) => [s.id, ratioToString(s.ratio)])).toEqual([
      ['L1', '1/2'],
      ['L0', '1'],
      ['R2', '1/2'],
    ]);
    expect(m.sirens.map((s) => [s.index, s.shaftId, s.unitIndex])).toEqual([
      [0, 'L1', 0],
      [1, 'L0', 1],
      [2, 'R2', 2],
    ]);
  });
});
