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

  it('モーターのトルクは起動で startTorque、滑り = kneeSlip で最大 1、同期で 0', () => {
    expect(motorTorque(0, P)).toBeCloseTo(P.startTorque, 9);
    expect(motorTorque(1 - P.kneeSlip, P)).toBeCloseTo(1, 9);
    expect(motorTorque(1 - P.kneeSlip / 2, P)).toBeCloseTo(0.5, 9);
    expect(motorTorque(1, P)).toBe(0);
  });

  it('起動：定常の 2% 以内に入るまで 4.5〜6.5 秒（トキハ本店の映像では約 5.4 秒）', () => {
    const target = steadyStateRps(P);
    const t = runUntil(INITIAL_DRIVE_STATE, { power: true, brake: false, openSum: 0 }, P, (s) => s.rps >= target * 0.98);
    expect(t).toBeGreaterThanOrEqual(4.5);
    expect(t).toBeLessThanOrEqual(6.5);
  });

  it('起動のグライドはほぼ一定の加速（トキハ：2.2〜5.4 秒で 0.20/s）', () => {
    // 定常の 40% と 90% に達する時刻の間の平均加速度
    const sync = synchronousRps(P);
    let s: DriveState = INITIAL_DRIVE_STATE;
    let t40 = -1;
    let t90 = -1;
    for (let t = 0; t < 10 && t90 < 0; t += DT) {
      s = stepDrive(s, { power: true, brake: false, openSum: 0 }, P, DT);
      if (t40 < 0 && s.rps >= 0.4 * sync) t40 = t;
      if (s.rps >= 0.9 * sync) t90 = t;
    }
    const slope = 0.5 / (t90 - t40);
    expect(slope).toBeGreaterThan(0.16);
    expect(slope).toBeLessThan(0.24);
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
