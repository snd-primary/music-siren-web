import { describe, expect, it } from 'vitest';
import { buildMachine } from './machine';
import { DEFAULT_MACHINE_PARAMS, initialMachineState, snapToSteady, snapToStop, stepMachine, type MachineInput } from './simulation';
import { steadyStateRps } from './drive';
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

  it('停止位置で止まらず、ストッパーまで行く（最初の山は定常の 1.05〜1.3 倍、30〜80 ms）', () => {
    const tr = openTrace();
    const steady = tr[tr.length - 1] ?? 1;
    const first = tr.slice(0, Math.round(0.1 / dt));
    const peak = Math.max(...first);
    const tPeak = first.findIndex((c) => c >= peak * 0.99) * dt;
    expect(peak / steady).toBeGreaterThan(1.05);
    expect(peak / steady).toBeLessThan(1.3);
    expect(tPeak).toBeGreaterThan(0.03);
    expect(tPeak).toBeLessThan(0.08);
  });

  it('ストッパーに当たって跳ね返り、約 130 ms 後の 2 回目の山も 1 回目に近い高さになる', () => {
    const tr = openTrace(still, 1.2);
    const maxima: { t: number; v: number }[] = [];
    for (let k = 1; k + 1 < tr.length; k += 1) {
      const c = tr[k] ?? 0;
      if (c >= (tr[k - 1] ?? 0) && c > (tr[k + 1] ?? 0)) maxima.push({ t: k * dt, v: c });
    }
    const [first, second] = maxima;
    expect(first?.v ?? 0).toBeGreaterThan(0.99); // ストッパーまで行く
    expect((second?.v ?? 0) / (first?.v ?? 1)).toBeGreaterThan(0.95);
    const gap = (second?.t ?? 0) - (first?.t ?? 0);
    expect(gap).toBeGreaterThan(0.11);
    expect(gap).toBeLessThan(0.16);
  });

  it('揺れは 0.8 秒で定常の ±3% に収まる', () => {
    const tr = openTrace(still, 1.5);
    const steady = tr[tr.length - 1] ?? 1;
    for (let k = Math.round(0.8 / dt); k < tr.length; k += 1) expect(Math.abs((tr[k] ?? 0) / steady - 1)).toBeLessThan(0.03);
  });

  it('カバーはストッパーより先へは行かない', () => {
    let s = initialMachineState(machine, still);
    for (let k = 0; k < Math.round(1 / dt); k += 1) {
      s = stepMachine(machine, s, { ...idle, keys }, still, dt);
      expect(s.coverAngles[2] ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('開いている間は、停止位置のずれでゆっくり揺れる（開度の相対の揺れ 2〜8%）', () => {
    const tr = openTrace(P, 20).slice(Math.round(0.5 / dt));
    const mean = tr.reduce((a, b) => a + b, 0) / tr.length;
    const rel = Math.sqrt(tr.reduce((a, b) => a + (b - mean) ** 2, 0) / tr.length) / mean;
    expect(rel).toBeGreaterThan(0.02);
    expect(rel).toBeLessThan(0.08);
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

describe('閉じる側（伊賀の映像、docs/adr/0014-cover-close-and-no-residual-pressure.md）', () => {
  const dt = 0.0005;
  const keys = machine.sirens.map((_, i) => i === 2);

  it('全開から 30〜70 ms で閉じる', () => {
    expect(P.cover.closeTime).toBeGreaterThanOrEqual(0.03);
    expect(P.cover.closeTime).toBeLessThanOrEqual(0.07);
  });

  it('閉じきってから 100 ms で圧はたまり終わり（95% 以上）、閉じたあとの漏れ音は平ら（残圧の余韻は無い）', () => {
    let s = initialMachineState(machine);
    for (let k = 0; k < Math.round(1 / dt); k += 1) s = stepMachine(machine, s, { ...idle, keys }, P, dt);
    while ((s.covers[2] ?? 0) > 0) s = stepMachine(machine, s, idle, P, dt);
    for (let k = 0; k < Math.round(0.1 / dt); k += 1) s = stepMachine(machine, s, idle, P, dt);
    const early = s.surges[2] ?? 0;
    expect(early).toBeGreaterThan(P.cover.surge * 0.95);
    for (let k = 0; k < Math.round(0.5 / dt); k += 1) s = stepMachine(machine, s, idle, P, dt);
    // 漏れの流量は (1 + surge) に比例する。100 ms 後から 0.5 秒の変化は 0.3 dB 未満。
    expect(20 * Math.log10((1 + (s.surges[2] ?? 0)) / (1 + early))).toBeLessThan(0.3);
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

describe('デバッグ用の即時定常・即時停止', () => {
  it('即時定常：定常回転数になり、通電したまま進めても変わらない', () => {
    let s = snapToSteady(initialMachineState(machine), P);
    expect(s.drive.rps).toBeCloseTo(steadyStateRps(P.drive), 9);
    for (let k = 0; k < 500; k += 1) s = stepMachine(machine, s, { ...idle, power: true }, P, 0.002);
    expect(s.drive.rps / steadyStateRps(P.drive)).toBeCloseTo(1, 4);
  });

  it('即時停止：回転 0・全カバー閉・圧はたまった状態。軸の位相は保つ', () => {
    let s = snapToSteady(initialMachineState(machine), P);
    const keys = machine.sirens.map((_, i) => i < 3);
    for (let k = 0; k < 200; k += 1) s = stepMachine(machine, s, { ...idle, power: true, keys }, P, 0.002);
    const turns = s.shaftTurns;
    const stopped = snapToStop(s, P);
    expect(stopped.drive.rps).toBe(0);
    expect(stopped.covers.every((c) => c === 0)).toBe(true);
    expect(stopped.coverAngles.every((c) => c === 0)).toBe(true);
    expect(stopped.coverPulled.every((p) => !p)).toBe(true);
    expect(stopped.surges.every((v) => v === P.cover.surge)).toBe(true);
    expect(stopped.shaftTurns).toEqual(turns);
    // 止めたあとは、すぐにまた開ける（minCycle の待ちが残らない）
    const after = stepMachine(machine, stopped, { ...idle, keys }, P, 0.002);
    expect(after.coverPulled.slice(0, 3)).toEqual([true, true, true]);
  });
});
