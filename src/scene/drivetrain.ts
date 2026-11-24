// サイレン本体以外の部品：ベース、軸受ユニット、マグネットカバー、カップリング、駆動電動機、電磁制動装置、
// 変速歯車装置、建屋。長さは mm、原点は中央ベースの中心の床、y が上。
//
// 並びは説明書の第1図、形と色は伊賀機の映像（フィン付きの電動機、幅の狭い鋳物の歯車箱、錆色の軸受台、
// 軸受の横に立つ箱形のマグネットカバー、足つきの低いベース）。YAMAHA のロゴ・銘板は作らない。
import * as THREE from 'three';
import { Builder, arcBox, boxAt, cylX, cylY, gearGeometry, hexHead, latheX, rotX, springGeometry, xf } from './geom';
import { gearTrain, type GearTrain } from './geartrain';
import { DIM } from './layout';
import type { Materials } from './materials';

export const AXIS_Y = DIM.baseHeight + DIM.axisHeight;
const TOP = DIM.baseHeight;
const TAU = Math.PI * 2;

/** ベース 1 枚（x0〜x1、幅 width）。足、補強のリブ、吊り環、基礎ボルト。 */
export function addBase(b: Builder, m: Materials, x0: number, x1: number, width: number): void {
  const w = width / 2;
  const foot = 30;
  // 胴と、上面の縁
  b.add(m.base, boxAt(x0 + 12, x1 - 12, foot, TOP - 16, -w + 10, w - 10));
  b.add(m.base, boxAt(x0 + 2, x1 - 2, TOP - 16, TOP, -w, w));
  b.add(m.base, boxAt(x0 + 2, x1 - 2, foot, foot + 14, -w, w));
  // 側面のリブ
  const n = Math.max(2, Math.round((x1 - x0) / 280));
  for (let i = 0; i <= n; i += 1) {
    const x = x0 + 30 + ((x1 - x0 - 60) * i) / n;
    for (const s of [-1, 1]) b.add(m.base, boxAt(x - 7, x + 7, foot + 14, TOP - 16, s * (w - 10), s * w));
  }
  // 足（丸い座）と基礎ボルト
  for (const x of [x0 + 110, x1 - 110]) {
    for (const s of [-1, 1]) {
      b.add(m.base, cylY(48, 0, foot, 28), xf(x, 0, s * (w - 30)));
      b.add(m.base, boxAt(x - 45, x + 45, foot, foot + 26, s * (w - 4), s * (w + 52)));
      b.add(m.steel, cylY(9, foot + 26, foot + 62, 12), xf(x, 0, s * (w + 26)));
      b.add(m.steel, hexHead(27, 16), xf(x, foot + 26, s * (w + 26)));
    }
  }
  // 吊り環
  const ring = new THREE.TorusGeometry(20, 5, 8, 24);
  for (const s of [-1, 1]) {
    const x = (x0 + x1) / 2;
    b.add(m.steel, ring, xf(x, TOP - 52, s * (w + 8), 0, 0, 0));
    b.add(m.steel, cylX(7, -5, 5, 12), xf(x, TOP - 30, s * (w + 4), 0, Math.PI / 2, 0));
  }
}

/** 対の間の軸受ユニット（軸承・軸筒・グリスカップ・締付ボルト・ノックピン）。第2図の右半分。 */
export function addBearingUnit(b: Builder, m: Materials, px: number): void {
  const half = 76;
  // 座と柱
  b.add(m.cast, boxAt(px - 104, px + 104, TOP, TOP + 22, -92, 92));
  b.add(m.cast, boxAt(px - 62, px + 62, TOP + 22, AXIS_Y - 40, -58, 58));
  for (const s of [-1, 1]) {
    b.add(m.cast, boxAt(px - 8, px + 8, TOP + 22, AXIS_Y - 60, s * 58, s * 86));
    b.add(m.cast, boxAt(px + s * 62, px + s * 96, TOP + 22, AXIS_Y - 90, -9, 9));
  }
  // 軸筒（上下 2 つ割り）と合わせ面のつば
  b.add(m.cast, latheX([[-half, 52], [-half, 70], [-half + 14, 74], [half - 14, 74], [half, 70], [half, 52]], 48), xf(px, AXIS_Y, 0));
  b.add(m.cast, boxAt(px - half + 6, px + half - 6, AXIS_Y - 10, AXIS_Y + 10, -104, 104));
  for (const x of [px - 44, px + 44]) {
    for (const s of [-1, 1]) {
      b.add(m.steel, hexHead(19, 12), xf(x, AXIS_Y + 10, s * 90));
      b.add(m.steel, cylY(6, AXIS_Y - 22, AXIS_Y + 10, 10), xf(x, 0, s * 90));
      b.add(m.steel, hexHead(19, 10), xf(x, AXIS_Y - 10, s * 90, Math.PI, 0, 0));
    }
  }
  // グリスカップ
  for (const x of [px - 42, px + 42]) {
    b.add(m.steel, cylY(5, AXIS_Y + 72, AXIS_Y + 88, 10), xf(x, 0, 0));
    b.add(m.steel, hexHead(14, 8), xf(x, AXIS_Y + 84, 0));
    b.add(m.brass, cylY(9, AXIS_Y + 92, AXIS_Y + 112, 20, 15), xf(x, 0, 0));
    b.add(m.brass, cylY(16, AXIS_Y + 112, AXIS_Y + 118, 20, 13), xf(x, 0, 0));
  }
  // 締付ボルトとノックピン
  for (const x of [px - 82, px + 82]) {
    for (const z of [-68, 68]) b.add(m.steel, hexHead(26, 16), xf(x, TOP + 22, z));
  }
  b.add(m.steel, cylY(6, TOP + 22, TOP + 34, 10), xf(px - 82, 0, 0));
}

/** マグネットカバー（軸受の横に立つ箱）。両端の壁に、開閉カバーのピンが通る窓がある。 */
export function addMagnetBox(b: Builder, m: Materials, px: number): void {
  const { x, zNear, zFar, top } = DIM.magnetBox;
  const hx = x / 2;
  const y1 = AXIS_Y + top;
  const t = 2;
  // 手前・奥・ふた
  b.add(m.box, boxAt(px - hx, px + hx, TOP, y1, zNear, zNear + t));
  b.add(m.box, boxAt(px - hx, px + hx, TOP, y1, zFar - t, zFar));
  b.add(m.box, boxAt(px - hx - 6, px + hx + 6, y1, y1 + t, zNear - 6, zFar + 6));
  b.add(m.box, boxAt(px - hx - 6, px + hx + 6, y1 - 14, y1, zNear - 6, zNear - 4));
  b.add(m.box, boxAt(px - hx - 6, px + hx + 6, y1 - 14, y1, zFar + 4, zFar + 6));
  // 両端の壁（ピンの通る窓を残す）
  const sy0 = AXIS_Y - 50;
  const sy1 = AXIS_Y + 50;
  const sz0 = 126;
  const sz1 = 176;
  for (const s of [-1, 1]) {
    const xa = px + s * (hx - t);
    const xb = px + s * hx;
    b.add(m.box, boxAt(xa, xb, TOP, sy0, zNear, zFar));
    b.add(m.box, boxAt(xa, xb, sy1, y1, zNear, zFar));
    b.add(m.box, boxAt(xa, xb, sy0, sy1, zNear, sz0));
    b.add(m.box, boxAt(xa, xb, sy0, sy1, sz1, zFar));
    b.add(m.box, boxAt(px + s * (hx + 6), px + s * (hx + 4), y1 - 14, y1, zNear - 6, zFar + 6));
  }
  // ふたの止めねじ
  for (const sx of [-1, 1]) {
    for (const z of [zNear + 16, zFar - 16]) b.add(m.steel, cylY(5, y1 + t, y1 + t + 3, 12), xf(px + sx * (hx - 14), 0, z));
  }
}

/** フランジ形のカップリング。原点が合わせ面。軸と一緒に回す。 */
export function buildCoupling(m: Materials): THREE.Group {
  const b = new Builder();
  b.add(m.motor, latheX([[-48, DIM.shaftRadius], [-48, 40], [-20, 42], [-20, 66], [-1, 66], [-1, DIM.shaftRadius]], 40));
  b.add(m.motor, latheX([[1, DIM.shaftRadius], [1, 66], [20, 66], [20, 42], [48, 40], [48, DIM.shaftRadius]], 40));
  for (let i = 0; i < 4; i += 1) {
    const r = rotX((i / 4) * TAU + 0.3);
    b.add(m.steel, cylX(5, -30, 30, 10), new THREE.Matrix4().multiplyMatrices(r, xf(0, 54, 0)));
    b.add(m.steel, cylX(9, -27, -20, 6), new THREE.Matrix4().multiplyMatrices(r, xf(0, 54, 0)));
    b.add(m.steel, cylX(9, 20, 27, 6), new THREE.Matrix4().multiplyMatrices(r, xf(0, 54, 0)));
  }
  // キー（回っているのが見える印）
  b.add(m.iron, boxAt(-48, -22, 38, 44, -5, 5));
  b.add(m.iron, boxAt(22, 48, 38, 44, -5, 5));
  const g = b.build();
  g.position.y = AXIS_Y;
  return g;
}

/** 駆動電動機（全閉・フィン付き、両軸）。銘板は作らない。 */
export function addMotor(b: Builder, m: Materials, mx: number): void {
  const { length, radius } = DIM.motor;
  const h = length / 2;
  const at = xf(mx, AXIS_Y, 0);
  b.add(m.motor, cylX(radius, -h + 40, h - 40, 48), at);
  // 冷却フィン（足と端子箱の所は省く）
  const fins = 32;
  for (let i = 0; i < fins; i += 1) {
    const a = (i / fins) * TAU;
    const down = Math.cos(a) < -0.72;
    const side = Math.sin(a) > 0.86;
    if (down || side) continue;
    b.add(m.motor, boxAt(-h + 52, h - 52, radius - 2, radius + 17, -2.5, 2.5), new THREE.Matrix4().multiplyMatrices(at, rotX(a)));
  }
  // 両端のブラケット
  for (const s of [-1, 1]) {
    const p: [number, number][] = [
      [s * (h - 40), radius + 6],
      [s * (h - 28), radius + 6],
      [s * (h - 14), radius - 18],
      [s * h, 78],
      [s * (h + 14), 62],
      [s * (h + 14), DIM.shaftRadius + 6],
    ];
    b.add(m.motor, latheX(p, 48), at);
    for (let i = 0; i < 4; i += 1) {
      const r = new THREE.Matrix4().multiplyMatrices(at, rotX((i / 4) * TAU + Math.PI / 4));
      b.add(m.steel, cylX(8, s * (h - 28), s * (h - 20), 6), new THREE.Matrix4().multiplyMatrices(r, xf(0, radius + 12, 0)));
      b.add(m.motor, boxAt(s * (h - 40), s * (h - 28), radius - 4, radius + 22, -13, 13), r);
    }
  }
  // 足と台
  const footY = AXIS_Y - radius - 12;
  for (const s of [-1, 1]) {
    b.add(m.motor, boxAt(mx - h + 60, mx + h - 60, footY, footY + 16, s * 95, s * 170));
    b.add(m.motor, boxAt(mx - h + 70, mx + h - 70, footY + 16, AXIS_Y - 70, s * 100, s * 128));
    for (const x of [mx - h + 85, mx + h - 85]) b.add(m.steel, hexHead(24, 14), xf(x, footY + 16, s * 150));
  }
  b.add(m.base, boxAt(mx - h + 40, mx + h - 40, TOP, footY, -185, 185));
  // 端子箱（+z 側）と電線管
  b.add(m.motor, boxAt(mx - 62, mx + 62, AXIS_Y - 48, AXIS_Y + 58, radius - 6, radius + 62));
  b.add(m.motor, boxAt(mx - 68, mx + 68, AXIS_Y - 54, AXIS_Y + 64, radius + 62, radius + 68));
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) b.add(m.steel, cylX(4, 0, 3, 10), xf(mx + sx * 58, AXIS_Y + 5 + sy * 50, radius + 68, 0, -Math.PI / 2, 0));
  }
  b.add(m.iron, cylY(14, TOP, AXIS_Y - 48, 16), xf(mx, 0, radius + 30));
  // 吊りボルト
  const eye = new THREE.TorusGeometry(15, 4.5, 8, 24);
  b.add(m.steel, eye, xf(mx, AXIS_Y + radius + 32, 0, 0, Math.PI / 2, 0));
  b.add(m.steel, cylY(7, AXIS_Y + radius, AXIS_Y + radius + 18, 10), xf(mx, 0, 0));
}

/** 電磁制動装置の中身（ドラム・シュー・腕・調整桿・マグネット）。カバーは別（addBrakeCover）。 */
export function addBrake(b: Builder, m: Materials, bx: number): void {
  const { drumRadius: r, drumWidth: w } = DIM.brake;
  const at = xf(bx, AXIS_Y, 0);
  b.add(m.iron, latheX([[-w / 2, DIM.shaftRadius], [-w / 2, r], [w / 2, r], [w / 2, r - 14], [-w / 2 + 14, r - 14], [-w / 2 + 14, 46], [w / 2 - 6, 46], [w / 2 - 6, DIM.shaftRadius]], 56), at);
  const armTop = AXIS_Y + r + 62;
  for (const s of [-1, 1]) {
    const c = (s * Math.PI) / 2;
    // シュー（ライニングと受け）
    b.add(m.lining, arcBox(r + 1, r + 9, -w / 2 + 6, w / 2 - 6, c - 0.85, c + 0.85), at);
    b.add(m.cast, arcBox(r + 9, r + 22, -w / 2 + 6, w / 2 - 6, c - 0.85, c + 0.85), at);
    // 腕（下の支点から上の調整桿まで）
    const z = s * (r + 36);
    b.add(m.cast, boxAt(bx - 16, bx + 16, TOP + 30, armTop + 14, z - 11, z + 11));
    b.add(m.cast, boxAt(bx - 20, bx + 20, AXIS_Y - 22, AXIS_Y + 22, s * (r + 20), z));
    b.add(m.cast, boxAt(bx - 34, bx + 34, TOP, TOP + 46, z - 24, z + 24));
    b.add(m.steel, cylX(8, bx - 26, bx + 26, 14), xf(0, TOP + 34, z));
    b.add(m.steel, hexHead(22, 12), xf(bx, armTop, z + s * 11, (s * Math.PI) / 2, 0, 0));
  }
  // ターン・バックの調整桿とスプリング
  b.add(m.steel, cylX(7, -(r + 70), r + 70, 12), xf(bx, armTop, 0, 0, Math.PI / 2, 0));
  b.add(m.steel, cylX(13, -22, 22, 6), xf(bx, armTop, 0, 0, Math.PI / 2, 0));
  b.add(m.spring, springGeometry(90, 13, 8, 2), xf(bx, armTop, r + 20, Math.PI / 2, 0, 0));
  // マグネット（腕を開いてブレーキをゆるめる）
  b.add(m.core, boxAt(bx - 30, bx + 30, armTop + 16, armTop + 62, -42, 42));
  b.add(m.coil, cylY(30, armTop + 22, armTop + 56, 24), xf(bx, 0, 0));
  b.add(m.iron, boxAt(bx - 34, bx + 34, armTop + 62, armTop + 68, -(r + 50), r + 50));
}

export function addBrakeCover(b: Builder, m: Materials, bx: number): void {
  const { x, y, z } = DIM.brake;
  const hx = x / 2;
  const hz = z / 2;
  const y1 = TOP + y;
  const t = 2.5;
  for (const s of [-1, 1]) {
    b.add(m.box, boxAt(bx - hx, bx + hx, TOP, y1, s * hz, s * (hz - t)));
    // 軸の通る切欠きを残した端の壁
    const xa = bx + s * hx;
    const xb = bx + s * (hx - t);
    b.add(m.box, boxAt(xa, xb, AXIS_Y + 60, y1, -hz, hz));
    b.add(m.box, boxAt(xa, xb, TOP, AXIS_Y + 60, 60, hz));
    b.add(m.box, boxAt(xa, xb, TOP, AXIS_Y + 60, -hz, -60));
    b.add(m.box, boxAt(xa, xb, TOP, AXIS_Y - 60, -60, 60));
  }
  b.add(m.box, boxAt(bx - hx - 8, bx + hx + 8, y1, y1 + t, -hz - 8, hz + 8));
  b.add(m.box, boxAt(bx - hx - 8, bx + hx + 8, y1 - 18, y1, hz + 5, hz + 8));
  b.add(m.box, boxAt(bx - hx - 8, bx + hx + 8, y1 - 18, y1, -hz - 8, -hz - 5));
}

export interface GearCaseParts {
  /** 入力軸の歯車（原点が歯車の中心）。 */
  readonly input: THREE.Object3D;
  /** 副軸（ダブルギヤー）。 */
  readonly counter: THREE.Object3D;
  /** 出力軸の歯車。 */
  readonly output: THREE.Object3D;
  readonly train: GearTrain;
}

/** 歯車が位相 0 のときにかみ合うための、副軸の歯車の角度のずれ。 */
export function counterAngle(train: GearTrain, inputTurns: number): number {
  return -inputTurns * TAU * (train.z1 / train.z2) + Math.PI / train.z2;
}

/**
 * 変速歯車装置の中身（歯車・副軸・油受け）。入力は −dir 側、出力は +dir 側。
 * 上の箱は別（addGearCaseCover）。
 */
export function buildGears(b: Builder, m: Materials, gx: number, dir: 1 | -1, num: number, den: number): GearCaseParts {
  const train = gearTrain(num, den);
  const mod = DIM.gearModule;
  const centre = (mod * (train.z1 + train.z2)) / 2;
  const width = 26;
  const xin = gx - dir * 22;
  const xout = gx + dir * 22;
  const { x, z } = DIM.gearCase;
  const hx = x / 2;
  const hz = z / 2;
  // 油受け（下の箱。ダブルギヤーの軸心まで油が入る）
  const tubTop = AXIS_Y - centre;
  const t = 8;
  b.add(m.gearCase, boxAt(gx - hx, gx + hx, TOP, TOP + t, -hz, hz));
  for (const s of [-1, 1]) {
    b.add(m.gearCase, boxAt(gx - hx, gx + hx, TOP, tubTop, s * hz, s * (hz - t)));
    b.add(m.gearCase, boxAt(gx + s * hx, gx + s * (hx - t), TOP, tubTop, -hz, hz));
    b.add(m.gearCase, boxAt(gx - hx - 14, gx + hx + 14, TOP, TOP + 14, s * hz, s * (hz + 34)));
    for (const sx of [-1, 1]) b.add(m.steel, hexHead(22, 13), xf(gx + sx * (hx - 6), TOP + 14, s * (hz + 18)));
  }
  const mk = (geom: THREE.BufferGeometry, px: number, py: number): THREE.Object3D => {
    const mesh = new THREE.Mesh(geom, m.gear);
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.add(mesh);
    g.position.set(px, py, 0);
    return g;
  };
  const input = mk(gearGeometry(train.z1, mod, width, DIM.shaftRadius), xin, AXIS_Y);
  const output = mk(gearGeometry(train.z4, mod, width, DIM.shaftRadius), xout, AXIS_Y);
  // 副軸：1 段目の従動歯車（z2）と 2 段目の駆動歯車（z3）。z3 は出力の歯車とかみ合うように角度をずらす。
  const counter = new THREE.Group();
  const g2 = new THREE.Mesh(gearGeometry(train.z2, mod, width, 12), m.gear);
  g2.position.x = xin - gx;
  const g3 = new THREE.Mesh(gearGeometry(train.z3, mod, width, 12), m.gear);
  g3.position.x = xout - gx;
  g3.rotation.x = -Math.PI / train.z2 + (train.z4 % 2 === 0 ? Math.PI / train.z3 : 0);
  const axle = new THREE.Mesh(cylX(13, -hx + 4, hx - 4, 20), m.steel);
  counter.add(g2, g3, axle);
  counter.position.set(gx, AXIS_Y - centre, 0);
  return { input, counter, output, train };
}

/** 変速歯車装置の箱（幅の狭い鋳物。軸の高さで上下に割れる）。 */
export function addGearCaseCover(b: Builder, m: Materials, gx: number, num: number, den: number): void {
  const train = gearTrain(num, den);
  const centre = (DIM.gearModule * (train.z1 + train.z2)) / 2;
  const { x, z, top } = DIM.gearCase;
  const hx = x / 2;
  const hz = z / 2;
  const y0 = AXIS_Y - centre;
  const y1 = AXIS_Y + top;
  const t = 8;
  for (const s of [-1, 1]) {
    b.add(m.gearCase, boxAt(gx - hx, gx + hx, y0, y1, s * hz, s * (hz - t)));
    const xa = gx + s * hx;
    const xb = gx + s * (hx - t);
    b.add(m.gearCase, boxAt(xa, xb, AXIS_Y + 40, y1, -hz, hz));
    b.add(m.gearCase, boxAt(xa, xb, y0, AXIS_Y + 40, 40, hz));
    b.add(m.gearCase, boxAt(xa, xb, y0, AXIS_Y + 40, -hz, -40));
    b.add(m.gearCase, boxAt(xa, xb, y0, AXIS_Y - 40, -40, 40));
    // 軸受のふた
    b.add(m.gearCase, latheX([[0, 34], [0, 58], [10, 58], [16, 44], [16, 34]], 32), xf(xa, AXIS_Y, 0, 0, s > 0 ? 0 : Math.PI, 0));
    b.add(m.gearCase, latheX([[0, 0], [0, 30], [8, 30], [12, 20], [12, 0]], 24), xf(xa, y0, 0, 0, s > 0 ? 0 : Math.PI, 0));
    // 合わせ面のつばとボルト
    b.add(m.gearCase, boxAt(gx - hx - 4, gx + hx + 4, AXIS_Y - 8, AXIS_Y + 8, s * hz, s * (hz + 22)));
    for (const sx of [-1, 1]) {
      b.add(m.steel, hexHead(19, 12), xf(gx + sx * (hx - 22), AXIS_Y + 8, s * (hz + 11)));
    }
  }
  // ふた（丸みのある上面）と注油口
  b.add(m.gearCase, boxAt(gx - hx - 3, gx + hx + 3, y1, y1 + 10, -hz - 3, hz + 3));
  b.add(m.steel, cylY(16, y1 + 10, y1 + 22, 6), xf(gx, 0, 0));
  b.add(m.steel, cylY(11, y1 + 22, y1 + 28, 16), xf(gx, 0, 0));
}

/** 建屋（伊賀機：アルミ製、4.4 × 1.5 × 2.0 m）。正面（−z、マグネットカバーの反対側）は扉を開けた状態で、背面と両側がルーバー。 */
export function buildBuilding(m: Materials, lengthX: number): THREE.Group {
  const b = new Builder();
  const hx = lengthX / 2;
  const hz = DIM.building.z / 2;
  const h = DIM.building.y;
  const post = 50;
  // 柱と梁
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.add(m.louver, boxAt(sx * hx, sx * (hx - post), 0, h, sz * hz, sz * (hz - post)));
    b.add(m.louver, boxAt(sx * hx, sx * (hx - post), h - post, h, -hz, hz));
    b.add(m.louver, boxAt(sx * hx, sx * (hx - post), 0, 30, -hz, hz));
  }
  b.add(m.louver, boxAt(-hx, hx, h - post, h, -hz, -hz + post));
  b.add(m.louver, boxAt(-hx, hx, h - post, h, hz - post, hz));
  b.add(m.louver, boxAt(-hx, hx, 0, 30, hz - post, hz));
  b.add(m.louver, boxAt(-25, 25, 0, h, hz - post, hz));
  // 屋根（手前へ少し下がる）
  const roof = new THREE.BoxGeometry(lengthX + 160, 24, DIM.building.z + 220);
  b.add(m.louver, roof, xf(0, h + 30, 0, -0.05, 0, 0));
  // ルーバーの羽板
  const pitch = 62;
  const n = Math.floor((h - post - 60) / pitch);
  for (let i = 0; i < n; i += 1) {
    const y = 48 + i * pitch;
    const back = new THREE.BoxGeometry(lengthX - 2 * post, 2.5, 74);
    b.add(m.louver, back, xf(0, y + 26, hz - 26, 0.7, 0, 0));
    for (const sx of [-1, 1]) {
      const side = new THREE.BoxGeometry(74, 2.5, DIM.building.z - 2 * post);
      b.add(m.louver, side, xf(sx * (hx - 26), y + 26, 0, 0, 0, sx * -0.7));
    }
  }
  return b.build();
}
