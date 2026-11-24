// 材質と手続きテクスチャ。外部の画像は使わず、ノイズから canvas に描く。
// 色は伊賀機の映像から拾った（青緑の塗装、地金の固定カバー、ベージュの吸気側、錆色の軸受台とカバー）。
import * as THREE from 'three';

type RGB = readonly [number, number, number];

const SIZE = 256;

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(y + 0x3c6ef372, 0x85ebca6b) ^ Math.imul(seed + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/** 継ぎ目なく並ぶ値ノイズ（0〜1）。cells は 1 辺のマス数。 */
function tileNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (i: number, j: number): number => hash2(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  const a = w(x0, y0) + (w(x0 + 1, y0) - w(x0, y0)) * sx;
  const b = w(x0, y0 + 1) + (w(x0 + 1, y0 + 1) - w(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

function fbm(u: number, v: number, cells: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let c = cells;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * tileNoise(u, v, c, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    c *= 2;
  }
  return sum / norm;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

interface Surface {
  readonly base: RGB;
  /** 大きなむら（汚れ・日焼け）の色と強さ。 */
  readonly grime?: { readonly color: RGB; readonly amount: number };
  /** 塗装のはげ（下地の色）と、はげる割合（0〜1）。 */
  readonly chips?: { readonly color: RGB; readonly amount: number };
  /** 錆の色と割合。 */
  readonly rust?: { readonly color: RGB; readonly amount: number };
  /** 細かい粒（鋳肌・コンクリート）の強さ。 */
  readonly grain?: number;
  readonly seed: number;
}

interface SurfaceTextures {
  readonly map: THREE.CanvasTexture;
  /** 緑 = 粗さ、青 = 金属らしさ（three.js の読み方）。 */
  readonly roughnessMap: THREE.CanvasTexture;
  readonly bumpMap: THREE.CanvasTexture;
}

function canvasTexture(data: Uint8ClampedArray, srgb: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D コンテキストを取れない');
  const img = ctx.createImageData(SIZE, SIZE);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function surfaceTextures(s: Surface, roughness: number, chipRoughness: number): SurfaceTextures {
  const color = new Uint8ClampedArray(SIZE * SIZE * 4);
  const rough = new Uint8ClampedArray(SIZE * SIZE * 4);
  const bump = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j += 1) {
    for (let i = 0; i < SIZE; i += 1) {
      const u = i / SIZE;
      const v = j / SIZE;
      const k = (j * SIZE + i) * 4;
      let c: RGB = s.base;
      let r = roughness;
      let h = 0.5;
      const fine = fbm(u, v, 32, s.seed + 5, 3);
      if (s.grime) {
        const g = fbm(u, v, 3, s.seed + 1, 4);
        c = mix(c, s.grime.color, smooth(0.35, 0.75, g) * s.grime.amount);
      }
      if (s.rust) {
        const g = fbm(u, v, 5, s.seed + 2, 5);
        const t = smooth(1 - s.rust.amount - 0.12, 1 - s.rust.amount + 0.08, g);
        c = mix(c, mix(s.rust.color, [s.rust.color[0] * 0.6, s.rust.color[1] * 0.5, s.rust.color[2] * 0.4], fine), t);
        r = r + (0.95 - r) * t;
        h += 0.2 * t * fine;
      }
      if (s.chips) {
        const g = fbm(u, v, 4, s.seed + 3, 5);
        const t = smooth(1 - s.chips.amount - 0.02, 1 - s.chips.amount + 0.02, g);
        c = mix(c, s.chips.color, t);
        r = r + (chipRoughness - r) * t;
        h -= 0.25 * t; // はげた所は塗膜の厚みだけ低い
      }
      const grain = s.grain ?? 0.15;
      const shade = 1 + (fine - 0.5) * grain;
      h += (fine - 0.5) * grain * 1.5;
      color[k] = c[0] * shade;
      color[k + 1] = c[1] * shade;
      color[k + 2] = c[2] * shade;
      color[k + 3] = 255;
      const rr = Math.min(1, Math.max(0, r + (fine - 0.5) * 0.25)) * 255;
      rough[k] = 255;
      rough[k + 1] = rr;
      rough[k + 2] = 255;
      rough[k + 3] = 255;
      const hh = Math.min(1, Math.max(0, h)) * 255;
      bump[k] = hh;
      bump[k + 1] = hh;
      bump[k + 2] = hh;
      bump[k + 3] = 255;
    }
  }
  return { map: canvasTexture(color, true), roughnessMap: canvasTexture(rough, false), bumpMap: canvasTexture(bump, false) };
}

interface MatOptions {
  readonly surface: Surface;
  readonly roughness: number;
  readonly metalness?: number;
  readonly chipRoughness?: number;
  readonly bumpScale?: number;
  readonly repeat?: number;
}

function textured(o: MatOptions): THREE.MeshStandardMaterial {
  const tex = surfaceTextures(o.surface, o.roughness, o.chipRoughness ?? o.roughness);
  for (const t of [tex.map, tex.roughnessMap, tex.bumpMap]) t.repeat.set(o.repeat ?? 1, o.repeat ?? 1);
  return new THREE.MeshStandardMaterial({
    map: tex.map,
    roughnessMap: tex.roughnessMap,
    roughness: 1,
    bumpMap: tex.bumpMap,
    bumpScale: o.bumpScale ?? 1.5,
    metalness: o.metalness ?? 0,
    side: THREE.DoubleSide,
  });
}

function plain(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
}

export interface Materials {
  /** 開閉カバー（青緑の塗装）。 */
  readonly paint: THREE.MeshStandardMaterial;
  /** 固定カバー（地金）。 */
  readonly bare: THREE.MeshStandardMaterial;
  /** 固定カバーの吸気側の環（ベージュ）。 */
  readonly shroud: THREE.MeshStandardMaterial;
  /** 羽根車。 */
  readonly impeller: THREE.MeshStandardMaterial;
  /** 羽根車のボス（錆止めの赤）。 */
  readonly hub: THREE.MeshStandardMaterial;
  /** 軸・ボルト・ピン。 */
  readonly steel: THREE.MeshStandardMaterial;
  /** 黒皮の鋼（レバー・金具）。 */
  readonly iron: THREE.MeshStandardMaterial;
  /** 軸受台・軸筒（錆色の鋳物）。 */
  readonly cast: THREE.MeshStandardMaterial;
  /** ベース。 */
  readonly base: THREE.MeshStandardMaterial;
  /** マグネットカバー・ブレーキカバー（錆びた鋼板）。 */
  readonly box: THREE.MeshStandardMaterial;
  /** 歯車箱（鋳物）。 */
  readonly gearCase: THREE.MeshStandardMaterial;
  readonly motor: THREE.MeshStandardMaterial;
  readonly coil: THREE.MeshStandardMaterial;
  readonly core: THREE.MeshStandardMaterial;
  readonly brass: THREE.MeshStandardMaterial;
  readonly spring: THREE.MeshStandardMaterial;
  readonly gear: THREE.MeshStandardMaterial;
  readonly lining: THREE.MeshStandardMaterial;
  readonly floor: THREE.MeshStandardMaterial;
  readonly louver: THREE.MeshStandardMaterial;
  /** 「カバーを透かす」で半透明にする材質（サイレン本体の殻）。 */
  readonly shells: readonly THREE.MeshStandardMaterial[];
  /** 断面表示で切る材質（サイレン本体・軸受・箱。レバーやマグネット、軸、歯車は切らずに残す）。 */
  readonly sectioned: readonly THREE.MeshStandardMaterial[];
}

export function createMaterials(): Materials {
  const paint = textured({
    surface: {
      base: [84, 112, 112],
      grime: { color: [112, 126, 120], amount: 0.7 },
      chips: { color: [170, 170, 162], amount: 0.1 },
      rust: { color: [104, 72, 50], amount: 0.05 },
      grain: 0.1,
      seed: 11,
    },
    roughness: 0.62,
    chipRoughness: 0.5,
    bumpScale: 2,
    repeat: 1,
  });
  const bare = textured({
    surface: { base: [168, 152, 150], grime: { color: [128, 118, 112], amount: 0.6 }, rust: { color: [124, 88, 70], amount: 0.1 }, grain: 0.18, seed: 23 },
    roughness: 0.55,
    metalness: 0.35,
    bumpScale: 1,
  });
  const shroud = textured({
    surface: { base: [162, 150, 112], grime: { color: [136, 126, 98], amount: 0.5 }, grain: 0.08, seed: 31 },
    roughness: 0.7,
    bumpScale: 0.8,
  });
  const impeller = textured({
    surface: { base: [96, 98, 96], grime: { color: [70, 66, 60], amount: 0.6 }, rust: { color: [110, 70, 50], amount: 0.12 }, grain: 0.2, seed: 41 },
    roughness: 0.6,
    metalness: 0.5,
  });
  const hub = textured({
    surface: { base: [128, 66, 48], grime: { color: [92, 58, 46], amount: 0.6 }, chips: { color: [90, 80, 74], amount: 0.1 }, grain: 0.2, seed: 53 },
    roughness: 0.75,
  });
  const cast = textured({
    surface: {
      base: [124, 92, 50],
      grime: { color: [104, 86, 58], amount: 0.6 },
      rust: { color: [104, 62, 36], amount: 0.25 },
      chips: { color: [120, 140, 128], amount: 0.06 },
      grain: 0.3,
      seed: 61,
    },
    roughness: 0.88,
    bumpScale: 3,
  });
  const base = textured({
    surface: {
      base: [112, 114, 100],
      grime: { color: [136, 132, 118], amount: 0.8 },
      rust: { color: [112, 84, 48], amount: 0.14 },
      chips: { color: [84, 108, 98], amount: 0.08 },
      grain: 0.3,
      seed: 71,
    },
    roughness: 0.92,
    bumpScale: 3,
    repeat: 1,
  });
  const box = textured({
    surface: { base: [104, 80, 52], grime: { color: [124, 106, 80], amount: 0.5 }, rust: { color: [92, 56, 34], amount: 0.22 }, grain: 0.22, seed: 83 },
    roughness: 0.85,
    bumpScale: 2,
  });
  const gearCase = textured({
    surface: { base: [122, 118, 102], grime: { color: [146, 140, 122], amount: 0.7 }, rust: { color: [130, 110, 80], amount: 0.12 }, grain: 0.4, seed: 97 },
    roughness: 0.95,
    bumpScale: 4,
    repeat: 1,
  });
  const motor = textured({
    surface: { base: [142, 138, 118], grime: { color: [116, 112, 98], amount: 0.6 }, chips: { color: [110, 108, 100], amount: 0.05 }, grain: 0.15, seed: 101 },
    roughness: 0.7,
    metalness: 0.1,
    bumpScale: 1.5,
    repeat: 2,
  });
  const floor = textured({
    surface: { base: [140, 138, 132], grime: { color: [118, 116, 110], amount: 0.5 }, grain: 0.35, seed: 113 },
    roughness: 0.96,
    bumpScale: 0.004,
    repeat: 8,
  });
  const louver = plain(0xb9bfc2, 0.5, 0.6);
  const steel = plain(0xa29e96, 0.5, 0.6);
  const iron = plain(0x5e5850, 0.72, 0.3);
  const coil = plain(0x6a3324, 0.6, 0.1);
  const core = plain(0x4a4a4c, 0.55, 0.5);
  const brass = plain(0xb08d3c, 0.4, 0.9);
  const spring = plain(0x8a8a8c, 0.45, 0.6);
  const gear = plain(0x9a958c, 0.45, 0.65);
  const lining = plain(0x2e2a26, 0.95, 0);

  const shells = [paint, bare, shroud];
  const sectioned = [paint, bare, shroud, impeller, hub, cast, box, gearCase, motor];
  return { paint, bare, shroud, impeller, hub, steel, iron, cast, base, box, gearCase, motor, coil, core, brass, spring, gear, lining, floor, louver, shells, sectioned };
}
