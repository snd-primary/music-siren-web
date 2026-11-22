import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRIVE_PARAMS,
  IGA_DRIVE_PARAMS,
  INITIAL_DRIVE_STATE,
  TOKIWA_10B_DRIVE_PARAMS,
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

  it('既定は伊賀機', () => {
    expect(P).toBe(IGA_DRIVE_PARAMS);
  });

  it('伊賀機：定常は公称の 0.98694 倍（映像の実測）', () => {
    expect(steadyStateRps(P) / 60).toBeCloseTo(0.98694, 3);
  });

  it('伊賀機：起動から定常の 2% 以内に入るまで 11〜12.5 秒（映像では START 約 2.0 秒 → 約 13.6 秒）', () => {
    const target = steadyStateRps(P);
    const t = runUntil(INITIAL_DRIVE_STATE, { power: true, brake: false, openSum: 0 }, P, (s) => s.rps >= target * 0.98);
    expect(t).toBeGreaterThanOrEqual(11);
    expect(t).toBeLessThanOrEqual(12.5);
  });

  it('伊賀機：起動のグライドはほぼ一定の加速（映像：8〜12 秒で約 0.09/s）', () => {
    const sync = synchronousRps(P);
    let s: DriveState = INITIAL_DRIVE_STATE;
    let t40 = -1;
    let t90 = -1;
    for (let t = 0; t < 20 && t90 < 0; t += DT) {
      s = stepDrive(s, { power: true, brake: false, openSum: 0 }, P, DT);
      if (t40 < 0 && s.rps >= 0.4 * sync) t40 = t;
      if (s.rps >= 0.9 * sync) t90 = t;
    }
    const slope = 0.5 / (t90 - t40);
    expect(slope).toBeGreaterThan(0.08);
    expect(slope).toBeLessThan(0.1);
  });

  it('伊賀機：電源断から映像の惰性をなぞる（10 秒で 0.76、20 秒で 0.61、24 秒で 0.56）', () => {
    // 映像：40.3 秒で電源断。50.1 秒 0.758、60.1 秒 0.606、64.2 秒 0.558（同期回転数比）
    const sync = synchronousRps(P);
    let s: DriveState = { rps: steadyStateRps(P) };
    const at = new Map<number, number>();
    for (let i = 1; i <= 24000; i += 1) {
      s = stepDrive(s, { power: false, brake: true, openSum: 0 }, P, DT);
      if (i % 1000 === 0) at.set(i / 1000, s.rps / sync);
    }
    expect(at.get(10)).toBeCloseTo(0.758, 2);
    expect(at.get(20)).toBeCloseTo(0.606, 2);
    expect(at.get(24)).toBeCloseTo(0.558, 2);
  });

  it('伊賀機：ブレーキが劣化しているので、止まるまで 2〜4 分かかる', () => {
    const t = runUntil({ rps: steadyStateRps(P) }, { power: false, brake: true, openSum: 0 }, P, (s) => s.rps <= 0);
    expect(t).toBeGreaterThan(120);
    expect(t).toBeLessThan(240);
  });

  it('ブレーキが効けば止まるのは早くなる（劣化具合のパラメータ）', () => {
    const worn = runUntil({ rps: steadyStateRps(P) }, { power: false, brake: true, openSum: 0 }, P, (s) => s.rps <= 0);
    const fresh = runUntil({ rps: steadyStateRps(P) }, { power: false, brake: true, openSum: 0 }, { ...P, brakeTorque: 0.6 }, (s) => s.rps <= 0);
    expect(fresh).toBeLessThan(worn / 5);
  });

  describe('トキハ本店（10B）', () => {
    const T = TOKIWA_10B_DRIVE_PARAMS;

    it('起動：定常の 2% 以内に入るまで 4.5〜6.5 秒（映像では約 5.4 秒）', () => {
      const target = steadyStateRps(T);
      const t = runUntil(INITIAL_DRIVE_STATE, { power: true, brake: false, openSum: 0 }, T, (s) => s.rps >= target * 0.98);
      expect(t).toBeGreaterThanOrEqual(4.5);
      expect(t).toBeLessThanOrEqual(6.5);
    });

    it('停止：電源断＋ブレーキで 8〜10 秒（説明書）', () => {
      const t = runUntil({ rps: steadyStateRps(T) }, { power: false, brake: true, openSum: 0 }, T, (s) => s.rps <= 0);
      expect(t).toBeGreaterThanOrEqual(8);
      expect(t).toBeLessThanOrEqual(10);
    });
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
