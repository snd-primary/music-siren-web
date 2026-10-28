import { describe, expect, it } from 'vitest';
import { buildMachine } from './machine';
import { DEFAULT_MACHINE_PARAMS, initialMachineState, stepMachine, type MachineInput } from './simulation';
import { IGA_8 } from '../presets/iga-8';

const machine = buildMachine(IGA_8);
const P = DEFAULT_MACHINE_PARAMS;
const idle: MachineInput = { power: false, brake: false, keys: machine.sirens.map(() => false) };

describe('開閉カバー', () => {
  it('マグネット通電で openTime かけて全開、切ると closeTime かけて全閉', () => {
    let s = initialMachineState(machine);
    const keys = machine.sirens.map((_, i) => i === 2);
    const dt = 0.005;
    let t = 0;
    while ((s.covers[2] ?? 0) < 1) {
      s = stepMachine(machine, s, { ...idle, keys }, P, dt);
      t += dt;
    }
    expect(Math.abs(t - P.cover.openTime)).toBeLessThanOrEqual(dt * 1.01);
    expect(s.covers.filter((c) => c > 0)).toHaveLength(1);
    t = 0;
    while ((s.covers[2] ?? 1) > 0) {
      s = stepMachine(machine, s, idle, P, dt);
      t += dt;
    }
    expect(Math.abs(t - P.cover.closeTime)).toBeLessThanOrEqual(dt * 1.01);
  });
});

describe('軸の位相', () => {
  it('回転数 × 変速比 × 時間だけ進み、0〜1 に巻き戻る', () => {
    let s = { ...initialMachineState(machine), drive: { rps: 60 } };
    // 電源を入れたまま 1 ステップ（回転数はほぼ 60 のまま）
    s = stepMachine(machine, s, { ...idle, power: true }, { ...P, drive: { ...P.drive, inertia: 1e9 } }, 0.01);
    const left = machine.shafts.findIndex((sh) => sh.id === 'L0');
    const right = machine.shafts.findIndex((sh) => sh.id === 'R1');
    expect(s.shaftTurns[left]).toBeCloseTo(0.6, 6);
    expect(s.shaftTurns[right]).toBeCloseTo(0.45, 6);
    for (const turns of s.shaftTurns) {
      expect(turns).toBeGreaterThanOrEqual(0);
      expect(turns).toBeLessThan(1);
    }
  });
});
