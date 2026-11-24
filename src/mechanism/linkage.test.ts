import { describe, expect, it } from 'vitest';
import { DEFAULT_LINKAGE, coverRotation, linkagePose, pinAngleClosed, portPitch, seatedArmatureY } from './linkage';
import { DEFAULT_MACHINE_PARAMS, initialMachineState, stepMachine } from './simulation';
import { buildMachine } from './machine';
import { PRESETS } from '../presets';

const g = DEFAULT_LINKAGE;
const PORTS = [5, 6, 8, 9, 10, 12, 15, 18];

describe('開閉カバーのリンク機構', () => {
  it('θ = 1 で、開閉カバーは窓の半ピッチだけ回る', () => {
    for (const ports of PORTS) {
      expect(coverRotation(ports, 0)).toBe(0);
      expect(coverRotation(ports, 1)).toBeCloseTo(Math.PI / ports, 12);
    }
  });

  it('ピンは軸から一定の距離を保ち、行程は水平をはさんで上下対称', () => {
    for (const ports of PORTS) {
      const closed = linkagePose(g, ports, 0);
      const open = linkagePose(g, ports, 1);
      expect(Math.hypot(closed.pin.y, closed.pin.z)).toBeCloseTo(g.pinRadius, 9);
      expect(Math.hypot(open.pin.y, open.pin.z)).toBeCloseTo(g.pinRadius, 9);
      expect(closed.pin.y).toBeCloseTo(-open.pin.y, 9);
      expect(closed.pin.y).toBeGreaterThan(0); // 閉で上、開くと下がる
      expect(pinAngleClosed(ports) + portPitch(ports) / 4).toBeCloseTo(Math.PI / 2, 12);
    }
  });

  it('開くほどアマチュアの隙間は狭まり、θ = 1 で seatGap になる', () => {
    for (const ports of PORTS) {
      let prev = Infinity;
      for (let i = 0; i <= 20; i += 1) {
        const gap = linkagePose(g, ports, i / 20).armatureGap;
        expect(gap).toBeLessThan(prev);
        prev = gap;
      }
      expect(linkagePose(g, ports, 1).armatureGap).toBeCloseTo(g.seatGap, 9);
      expect(linkagePose(g, ports, 0).armatureGap).toBeGreaterThan(5);
    }
  });

  it('開くほどスプリングは伸びる（戻す力が増える）', () => {
    for (const ports of PORTS) {
      let prev = 0;
      for (let i = 0; i <= 20; i += 1) {
        const len = linkagePose(g, ports, i / 20).springLength;
        expect(len).toBeGreaterThan(prev);
        prev = len;
      }
    }
  });

  it('フォークの溝の中でピンが滑る量は、フォークの長さ（±16 mm）に収まる', () => {
    for (const ports of PORTS) {
      const d = [0, 0.25, 0.5, 0.75, 1].map((t) => linkagePose(g, ports, t).forkDistance);
      const mid = linkagePose(g, ports, 0.5).forkDistance; // レバーの長さはここに合わせて作る
      for (const x of d) expect(Math.abs(x - mid)).toBeLessThan(16);
    }
  });

  it('マグネットの鉄心の位置は、θ = 1 のアマチュアの位置から決まる', () => {
    for (const ports of PORTS) {
      const pose = linkagePose(g, ports, 1);
      expect(seatedArmatureY(g, ports)).toBeCloseTo(g.pivot.y + g.armatureArm * Math.sin(pose.leverAngle), 12);
    }
  });

  it('機構の状態の揺れが、そのままレバーとアマチュアに出る（音と同じ角度を読む）', () => {
    const machine = buildMachine(PRESETS[0]!);
    const params = DEFAULT_MACHINE_PARAMS;
    let state = initialMachineState(machine, params);
    const keys = machine.sirens.map((_, i) => i === 0);
    const ports = machine.sirens[0]!.ports;
    const gaps: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      state = stepMachine(machine, state, { power: false, brake: false, keys }, params, 0.002);
      const pose = linkagePose(g, ports, state.coverAngles[0]!);
      // 音が読む開度（covers）と、3D が読むレバーの姿勢は、同じ角度から決まる
      expect(pose.coverRotation).toBeCloseTo((state.covers[0]! * Math.PI) / ports, 12);
      expect(pose.armatureGap).toBeGreaterThanOrEqual(g.seatGap - 1e-9);
      gaps.push(pose.armatureGap);
    }
    // 引かれて隙間が詰まり、ストッパーで跳ね返って一度戻る（隙間が極小のあと増える）
    const minIndex = gaps.indexOf(Math.min(...gaps));
    expect(minIndex).toBeLessThan(gaps.length - 1);
    expect(Math.max(...gaps.slice(minIndex))).toBeGreaterThan(gaps[minIndex]! + 0.3);
  });
});
