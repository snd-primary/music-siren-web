import { describe, expect, it } from 'vitest';
import { buildMachine } from './machine';
import { DEFAULT_MACHINE_PARAMS, initialMachineState, stepMachine, type MachineInput } from './simulation';
import { IGA_8 } from '../presets/iga-8';

const machine = buildMachine(IGA_8);
const P = DEFAULT_MACHINE_PARAMS;
const idle: MachineInput = { power: false, brake: false, keys: machine.sirens.map(() => false) };

describe('開閉カバー（伊賀の映像の立ち上がりに当てはめた揺れ）', () => {
  const dt = 0.0005;
  const keys = machine.sirens.map((_, i) => i === 2);
  const still = { ...P, cover: { ...P.cover, wander: 0 } };

  /** 通電してから sec 秒の開度の列（dt ごと）。 */
  function openTrace(params = still, sec = 0.6): number[] {
    let s = initialMachineState(machine, params);
    const trace: number[] = [];
    for (let k = 0; k < Math.round(sec / dt); k += 1) {
      s = stepMachine(machine, s, { ...idle, keys }, params, dt);
      trace.push(s.covers[2] ?? 0);
    }
    return trace;
  }

  it('立ち上がりは速い（停止位置の 10→90% が 30 ms 以内。映像では 6〜20 ms）', () => {
    const tr = openTrace();
    const rest = P.cover.restAngle;
    const t10 = tr.findIndex((c) => c >= 0.1 * rest) * dt;
    const t90 = tr.findIndex((c) => c >= 0.9 * rest) * dt;
    expect(t90 - t10).toBeLessThan(0.03);
  });

  it('停止位置で止まらず、重なりきる位置を通って揺れる（最初の山は定常の 1.15〜1.3 倍、30〜80 ms）', () => {
    const tr = openTrace();
    const steady = tr[tr.length - 1] ?? 1;
    const first = tr.slice(0, Math.round(0.1 / dt));
    const peak = Math.max(...first);
    // 重なりきる位置を行きと帰りの 2 回通るので、最初に山の頂上近くに達した時刻を見る
    const tPeak = first.findIndex((c) => c >= peak * 0.99) * dt;
    expect(peak / steady).toBeGreaterThan(1.15);
    expect(peak / steady).toBeLessThan(1.3);
    expect(tPeak).toBeGreaterThan(0.03);
    expect(tPeak).toBeLessThan(0.08);
  });

  it('揺れは約 8 Hz で、0.4 秒で定常の ±3% に収まる', () => {
    const tr = openTrace();
    const steady = tr[tr.length - 1] ?? 1;
    for (let k = Math.round(0.4 / dt); k < tr.length; k += 1) expect(Math.abs((tr[k] ?? 0) / steady - 1)).toBeLessThan(0.03);
    // 0.1 秒より後で、開度が定常を下から上へ横切る間隔が周期
    const ups: number[] = [];
    for (let k = Math.round(0.1 / dt); k < Math.round(0.4 / dt); k += 1) {
      if ((tr[k - 1] ?? 0) < steady && (tr[k] ?? 0) >= steady) ups.push(k * dt);
    }
    expect(ups.length).toBeGreaterThanOrEqual(1);
    const angles: number[] = [];
    let s = initialMachineState(machine, still);
    for (let k = 0; k < Math.round(0.4 / dt); k += 1) {
      s = stepMachine(machine, s, { ...idle, keys }, still, dt);
      angles.push(s.coverAngles[2] ?? 0);
    }
    const rest = P.cover.restAngle;
    const crossings: number[] = [];
    for (let k = 1; k < angles.length; k += 1) if ((angles[k - 1] ?? 0) < rest && (angles[k] ?? 0) >= rest) crossings.push(k * dt);
    const period = (crossings[1] ?? 0) - (crossings[0] ?? 0);
    expect(1 / period).toBeGreaterThan(7);
    expect(1 / period).toBeLessThan(9);
  });

  it('開いている間は、停止位置のずれでゆっくり揺れる（開度の相対の揺れ 3〜12%。映像では 7〜18%）', () => {
    const tr = openTrace(P, 20).slice(Math.round(0.5 / dt));
    const mean = tr.reduce((a, b) => a + b, 0) / tr.length;
    const rel = Math.sqrt(tr.reduce((a, b) => a + (b - mean) ** 2, 0) / tr.length) / mean;
    expect(rel).toBeGreaterThan(0.03);
    expect(rel).toBeLessThan(0.12);
  });

  it('通電を切るとスプリングで closeTime かけて閉じ、閉じている間は揺れない', () => {
    let s = initialMachineState(machine);
    for (let k = 0; k < Math.round(0.5 / dt); k += 1) s = stepMachine(machine, s, { ...idle, keys }, P, dt);
    const start = s.coverAngles[2] ?? 0;
    let t = 0;
    while ((s.covers[2] ?? 0) > 0) {
      s = stepMachine(machine, s, idle, P, dt);
      t += dt;
    }
    expect(t).toBeCloseTo(start * P.cover.closeTime, 2);
    for (let k = 0; k < Math.round(2 / dt); k += 1) {
      s = stepMachine(machine, s, idle, P, dt);
      expect(s.covers[2]).toBe(0);
      expect(s.coverAngles[2]).toBe(0);
    }
  });

  it('他のサイレンのカバーは動かない', () => {
    let s = initialMachineState(machine);
    for (let k = 0; k < Math.round(0.5 / dt); k += 1) s = stepMachine(machine, s, { ...idle, keys }, P, dt);
    expect(s.covers.filter((c) => c > 0)).toHaveLength(1);
  });

  it('空気室の圧：閉じている間にたまり、開くと約 0.3 秒で抜ける', () => {
    let s = initialMachineState(machine);
    expect(s.surges[2]).toBeCloseTo(P.cover.surge, 9);
    for (let k = 0; k < Math.round(1 / dt); k += 1) s = stepMachine(machine, s, { ...idle, keys }, still, dt);
    expect(s.surges[2] ?? 1).toBeLessThan(P.cover.surge * 0.4);
    for (let k = 0; k < Math.round(1 / dt); k += 1) s = stepMachine(machine, s, idle, still, dt);
    expect(s.surges[2] ?? 0).toBeGreaterThan(P.cover.surge * 0.95);
  });
});

describe('開閉の速さの限界（1秒に3回まで）', () => {
  it('閉じてすぐ通電し直しても、前に開き始めてから minCycle 経つまで開かない', () => {
    const dt = 0.001;
    const on = { ...idle, keys: machine.sirens.map((_, i) => i === 0) };
    let s = initialMachineState(machine);
    let t = 0;
    const run = (inp: MachineInput, sec: number) => {
      for (let k = 0; k < Math.round(sec / dt); k += 1) {
        s = stepMachine(machine, s, inp, P, dt);
        t += dt;
      }
    };
    run(on, 0.1); // 開く
    expect(s.covers[0]).toBeGreaterThan(0.6);
    run(idle, 0.13); // 閉じる（t = 0.23）
    expect(s.covers[0]).toBe(0);
    run(on, 0.05); // t = 0.28：まだ 1/3 秒経っていない
    expect(s.covers[0]).toBe(0);
    run(on, 0.1); // t = 0.38：0.333 で開き始めている
    expect(s.covers[0]).toBeGreaterThan(0.4);
  });

  it('1秒に4回の連打は、3回しか開かない', () => {
    const dt = 0.001;
    let s = initialMachineState(machine);
    let opens = 0;
    let wasPulled = false;
    for (let k = 0; k < 1000; k += 1) {
      const key = k % 250 < 125; // 4 Hz、デューティ 50%
      s = stepMachine(machine, s, { ...idle, keys: machine.sirens.map((_, i) => i === 0 && key) }, P, dt);
      const pulled = s.coverPulled[0] ?? false;
      if (pulled && !wasPulled) opens += 1;
      wasPulled = pulled;
    }
    expect(opens).toBeLessThanOrEqual(3);
    expect(opens).toBeGreaterThanOrEqual(2);
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
