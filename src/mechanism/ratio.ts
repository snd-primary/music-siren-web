// 有理数。変速比・音律比を浮動小数の誤差なしに扱うため。

export interface Ratio {
  readonly num: number;
  readonly den: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function ratio(num: number, den = 1): Ratio {
  if (!Number.isInteger(num) || !Number.isInteger(den) || den === 0) {
    throw new RangeError(`不正な比: ${num}/${den}`);
  }
  const sign = den < 0 ? -1 : 1;
  const g = gcd(num, den) || 1;
  return { num: (sign * num) / g, den: (sign * den) / g };
}

export const ONE: Ratio = ratio(1, 1);

export function mulRatio(a: Ratio, b: Ratio): Ratio {
  return ratio(a.num * b.num, a.den * b.den);
}

export function ratioEquals(a: Ratio, b: Ratio): boolean {
  return a.num * b.den === b.num * a.den;
}

export function ratioToNumber(r: Ratio): number {
  return r.num / r.den;
}

export function ratioToString(r: Ratio): string {
  return r.den === 1 ? String(r.num) : `${r.num}/${r.den}`;
}
