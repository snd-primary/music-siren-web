import { describe, expect, it } from 'vitest';
import { buildMachine } from '../mechanism/machine';
import { PRESETS } from '../presets';
import { DIM, layoutMachine } from './layout';

describe('配置', () => {
  it.each([
    ['iga-8', 3866],
    ['10a', 4466],
    ['10b', 4466],
    ['12a', 5036],
    ['12c', 5432],
  ])('%s の全長は第4図の %d mm', (id, total) => {
    const m = buildMachine(PRESETS.find((p) => p.id === id)!);
    expect(layoutMachine(m).totalLength).toBe(total);
  });

  it('伊賀機は左右 2 対ずつ（羽根車 2 枚 × 4 組）', () => {
    const l = layoutMachine(buildMachine(PRESETS[0]!));
    expect(l.pairs).toHaveLength(4);
    expect(l.pairs.filter((p) => p.side === 'left')).toHaveLength(2);
    expect(l.pairs.every((p) => p.sirenIndexes.length === 2)).toBe(true);
    expect(l.extraGears).toHaveLength(0);
  });

  it('10B は左 3 対・右 2 対で、全サイレンが 1 回ずつ置かれる', () => {
    const m = buildMachine(PRESETS.find((p) => p.id === '10b')!);
    const l = layoutMachine(m);
    expect(l.pairs.filter((p) => p.side === 'left')).toHaveLength(3);
    expect(l.pairs.filter((p) => p.side === 'right')).toHaveLength(2);
    expect(l.sirens.map((s) => s.sirenIndex)).toEqual(m.sirens.map((s) => s.index));
  });

  it('左のサイレンは負の x、右は正の x で、中央ベースに食い込まない', () => {
    for (const spec of PRESETS) {
      const m = buildMachine(spec);
      const l = layoutMachine(m);
      for (const p of l.sirens) {
        const s = m.sirens[p.sirenIndex]!;
        if (s.side === 'left') expect(p.x).toBeLessThan(-l.centerLength / 2);
        else expect(p.x).toBeGreaterThan(l.centerLength / 2);
        expect(Math.abs(p.x) + DIM.drumLength / 2).toBeLessThanOrEqual(l.centerLength / 2 + (s.side === 'left' ? l.leftLength : l.rightLength));
      }
    }
  });

  it('12C は左ベースに歯車箱が 1 つあり、その外側に 10/9 の 2 台が来る', () => {
    const m = buildMachine(PRESETS.find((p) => p.id === '12c')!);
    const l = layoutMachine(m);
    expect(l.extraGears).toHaveLength(1);
    const gearX = l.extraGears[0]!.x;
    for (const p of l.sirens) {
      const s = m.sirens[p.sirenIndex]!;
      if (s.shaftId === 'L1') expect(p.x).toBeLessThan(gearX);
      else if (s.side === 'left') expect(p.x).toBeGreaterThan(gearX);
    }
  });
});
