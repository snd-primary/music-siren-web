import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRIVE_PARAMS,
  INITIAL_DRIVE_STATE,
  motorTorque,
  steadyStateRps,
  stepDrive,
  synchronousRps,
  type DriveParams,
  type DriveState,
} from './drive';

const P = DEFAULT_DRIVE_PARAMS;
const DT = 0.001;

function runUntil(
  start: DriveState,
  input: { power: boolean; brake: boolean; openSum: number },
  p: DriveParams,
  done: (s: DriveState) => boolean,
  limit = 600,
): number {
  let s = start;
  for (let t = 0; t < limit; t += DT) {
    s = stepDrive(s, input, p, DT);
    if (done(s)) return t;
  }
  return Infinity;
}

describe('駆動系', () => {
  it('2極・60Hz の同期回転数は 60 rps、50Hz は 50 rps', () => {
    expect(synchronousRps(P)).toBe(60);
    expect(synchronousRps({ supplyHz: 50, poles: 2 })).toBe(50);
  });

  it('定常回転数は同期回転数 × (1 − 滑り)', () => {
    expect(steadyStateRps(P)).toBeCloseTo(60 * (1 - P.slip), 6);
    expect(steadyStateRps({ ...P, supplyHz: 50 })).toBeCloseTo(50 * (1 - P.slip), 6);
  });

  it('モーターのトルクは滑り = breakdownSlip で最大 1、同期で 0', () => {
    expect(motorTorque(1 - P.breakdownSlip, P)).toBeCloseTo(1, 9);
    expect(motorTorque(1, P)).toBe(0);
    expect(motorTorque(0, P)).toBeGreaterThan(0.5); // 2重籠形なので起動トルクが大きい
  });

  it('起動：定常の 2% 以内に入るまで 10〜15 秒', () => {
    const target = steadyStateRps(P);
    const t = runUntil(INITIAL_DRIVE_STATE, { power: true, brake: false, openSum: 0 }, P, (s) => s.rps >= target * 0.98);
    expect(t).toBeGreaterThanOrEqual(10);
    expect(t).toBeLessThanOrEqual(15);
  });

  it('停止：電源断＋ブレーキで 8〜10 秒で止まる', () => {
    const t = runUntil({ rps: steadyStateRps(P) }, { power: false, brake: true, openSum: 0 }, P, (s) => s.rps <= 0);
    expect(t).toBeGreaterThanOrEqual(8);
    expect(t).toBeLessThanOrEqual(10);
  });

  it('ブレーキ無しの惰性はずっと長い（1分以上）', () => {
    const t = runUntil({ rps: steadyStateRps(P) }, { power: false, brake: false, openSum: 0 }, P, (s) => s.rps <= 0, 120);
    expect(t).toBeGreaterThan(60);
  });

  it('カバーが開くほど定常回転数がわずかに下がる（仮説の結合）', () => {
    const closed = steadyStateRps(P, 0);
    const one = steadyStateRps(P, 1);
    const all = steadyStateRps(P, 8);
    expect(one).toBeLessThan(closed);
    expect(all).toBeLessThan(one);
    expect(all / closed).toBeGreaterThan(0.99); // 1% 未満の差
    expect(steadyStateRps({ ...P, openLoad: 0 }, 8)).toBeCloseTo(closed, 9);
  });

  it('回転数は負にも同期超過にもならない', () => {
    let s: DriveState = { rps: 0 };
    for (let i = 0; i < 1000; i += 1) {
      s = stepDrive(s, { power: false, brake: true, openSum: 0 }, P, 0.01);
      expect(s.rps).toBeGreaterThanOrEqual(0);
    }
    s = { rps: 60 };
    s = stepDrive(s, { power: true, brake: false, openSum: 0 }, P, 1);
    expect(s.rps).toBeLessThanOrEqual(60);
  });
});
