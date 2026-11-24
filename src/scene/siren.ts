// サイレン本体 1 台と、その開閉カバーを動かすリンク機構（レバー・アマチュア・マグネット・スプリング）。
//
// 構成は説明書の第2図：内から、羽根車（軸に丸ナットで固定）、固定カバー（軸筒にボルト止め）、
// 開閉カバー（鋼球で軸筒のまわりを回る椀形。背板にレバー用のピン）。背板の側が軸受、反対側が吸気口。
// 開閉カバーの窓から、閉じているときは固定カバーの地金が、開くと中の羽根車が見える（伊賀機の映像）。
//
// 座標：原点は軸上の本体中心、+x が吸気側、−x が軸受側。長さは mm。
// 軸受が逆側に来る台は、呼び出し側で x を鏡映する（scale.x = −1）。鏡映では軸まわりの回転の向きも
// マグネットの側（+z）も変わらないので、全部のサイレンが同じ向きに回る。
import * as THREE from 'three';
import { DEFAULT_LINKAGE, linkagePose, pinAngleClosed, portPitch, seatedArmatureY, type LinkageGeometry } from '../mechanism/linkage';
import { Builder, arcBox, boxAt, cylX, cylY, hexHead, latheX, rotX, springGeometry, xf } from './geom';
import { DIM } from './layout';
import type { Materials } from './materials';

const L = DIM.drumLength;
const BACK = -L / 2;
const FRONT = L / 2;
/** 窓の軸方向の範囲。 */
const WIN0 = BACK + 22;
const WIN1 = WIN0 + DIM.windowLength;
/** レバーの面（背板から軸受側へ）。 */
const LEVER_X = BACK - 14;
/** マグネットとアマチュアの中心。 */
const MAGNET_X = BACK - 42;
const SPRING_NOMINAL = 70;
/** 羽根の反り（外周での角度の遅れ）。 */
const BLADE_SWEEP = 0.5;

export interface SirenParts {
  readonly group: THREE.Group;
  readonly sirenIndex: number;
  readonly shaftIndex: number;
  readonly ports: number;
  /** 開閉カバー。軸まわりに回る。 */
  readonly openingCover: THREE.Group;
  /** 羽根車。 */
  readonly impeller: THREE.Group;
  /** 羽根（速く回ると消して、残像に置き換える）。 */
  readonly blades: THREE.Object3D;
  readonly lever: THREE.Group;
  readonly spring: THREE.Mesh;
  readonly linkage: LinkageGeometry;
}

/** 窓を抜いた円筒の胴。windowCenter(i) に窓の中心が来る。 */
function addRim(b: Builder, mat: THREE.Material, r0: number, r1: number, x0: number, x1: number, ports: number, phase: number): void {
  const pitch = portPitch(ports);
  const half = (pitch * DIM.windowWidthRatio) / 2;
  b.add(mat, arcBox(r0, r1, x0, WIN0));
  b.add(mat, arcBox(r0, r1, WIN1, x1));
  for (let i = 0; i < ports; i += 1) {
    const c = phase + i * pitch;
    b.add(mat, arcBox(r0, r1, WIN0, WIN1, c + half, c + pitch - half));
  }
}

function buildOpeningCover(m: Materials, ports: number, linkage: LinkageGeometry): THREE.Group {
  const b = new Builder();
  const pitch = portPitch(ports);
  const half = (pitch * DIM.windowWidthRatio) / 2;
  const r1 = DIM.coverRadius;
  const r0 = r1 - 4;
  // 胴。閉じているとき（回転 0）、窓は固定カバーの窓孔から半ピッチずれている。
  addRim(b, m.paint, r0, r1, BACK, FRONT, ports, pitch / 2);
  // 窓の縁の折り返し（第2図の側面図で、窓の上下に二重線がある）
  const lip = 2.5;
  const dA = 4 / r1;
  for (let i = 0; i < ports; i += 1) {
    const c = pitch / 2 + i * pitch;
    b.add(m.paint, arcBox(r1, r1 + lip, WIN0 - 4, WIN1 + 4, c - half - dA, c - half));
    b.add(m.paint, arcBox(r1, r1 + lip, WIN0 - 4, WIN1 + 4, c + half, c + half + dA));
    b.add(m.paint, arcBox(r1, r1 + lip, WIN0 - 4, WIN0, c - half, c + half));
    b.add(m.paint, arcBox(r1, r1 + lip, WIN1, WIN1 + 4, c - half, c + half));
  }
  // 吸気側のつば
  b.add(m.paint, arcBox(r0, DIM.flangeRadius, FRONT - 6, FRONT));
  // 背板と、鋼球の入る輪
  b.add(m.paint, arcBox(62, r1, BACK, BACK + 4));
  b.add(m.paint, arcBox(62, 86, BACK - 12, BACK));
  b.add(m.paint, latheX([[BACK, r1 - 10], [BACK - 3, r1 - 12], [BACK - 3, r1 - 30], [BACK, r1 - 32]], 96));
  // ピンの取付板（皿小ねじ 2 本）とピン
  const a = pinAngleClosed(ports);
  const pin = rotX(a);
  b.add(m.steel, boxAt(BACK - 6, BACK, linkage.pinRadius - 50, linkage.pinRadius + 22, -24, 24), pin);
  b.add(m.steel, cylX(7, BACK - 32, BACK - 6, 20), new THREE.Matrix4().multiplyMatrices(pin, xf(0, linkage.pinRadius, 0)));
  b.add(m.steel, cylX(10, BACK - 9, BACK - 6, 20), new THREE.Matrix4().multiplyMatrices(pin, xf(0, linkage.pinRadius, 0)));
  for (const z of [-14, 14]) {
    b.add(m.iron, cylX(5, BACK - 7.5, BACK - 6, 16), new THREE.Matrix4().multiplyMatrices(pin, xf(0, linkage.pinRadius - 34, z)));
  }
  return b.build();
}

function buildFixed(m: Materials, ports: number): THREE.Group {
  const b = new Builder();
  const r1 = DIM.fixedRadius;
  const r0 = r1 - 4;
  const x0 = BACK + 8;
  const x1 = FRONT - 3;
  addRim(b, m.bare, r0, r1, x0, x1, ports, 0);
  // 背板（軸筒にボルト止め）
  b.add(m.bare, arcBox(46, r1, x0, x0 + 3));
  // 吸気側の環と、吸気口の縁の丸み
  b.add(m.shroud, arcBox(DIM.eyeRadius, r1 + 2, x1, x1 + 3));
  const lipR = 4;
  const torus = new THREE.TorusGeometry(DIM.eyeRadius, lipR, 10, 72);
  torus.rotateY(Math.PI / 2);
  b.add(m.shroud, torus, xf(x1 + 1.5));
  // 軸筒の鼻（固定カバーを締め付けるつば）と、水よけカバー
  b.add(m.cast, latheX([[BACK - 70, 50], [BACK - 16, 50], [BACK - 16, 60], [x0, 60], [x0 + 6, 48], [x0 + 6, 30]], 40));
  b.add(m.box, latheX([[BACK - 13, 60], [BACK - 13, 96], [BACK - 4, 96], [BACK - 4, 93], [BACK - 10, 93]], 56));
  for (let i = 0; i < 4; i += 1) {
    const g = cylX(4.5, x0 + 3, x0 + 8, 6);
    b.add(m.steel, g, new THREE.Matrix4().multiplyMatrices(rotX((i / 4) * Math.PI * 2 + 0.4), xf(0, 54, 0)));
  }
  return b.build();
}

/** 羽根の子午面の輪郭（[x, 半径]）。第2図：外周はまっすぐ、内側は吸気口に向かって丸く広がる。 */
function bladeProfile(): [number, number][] {
  const xb = BACK + 20;
  const xf1 = FRONT - 9;
  const rt = DIM.impellerRadius;
  const pts: [number, number][] = [
    [xb, 50],
    [xb, rt],
    [xf1, rt],
    [xf1, 126],
  ];
  // 吸気側の内角から、背板側のボスへ向かう丸み
  const n = 8;
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const s = Math.sin((t * Math.PI) / 2);
    const c = 1 - Math.cos((t * Math.PI) / 2);
    pts.push([xf1 - (xf1 - xb - 26) * s, 126 - (126 - 62) * c]);
  }
  return pts;
}

function buildImpeller(m: Materials, ports: number): { group: THREE.Group; blades: THREE.Object3D } {
  const group = new THREE.Group();
  const b = new Builder();
  const xb = BACK + 16;
  // 背板
  b.add(m.impeller, arcBox(30, DIM.impellerRadius, xb, xb + 4));
  // ボス（錆止めの赤）
  b.add(m.hub, latheX([[xb + 4, 78], [xb + 10, 60], [xb + 26, 46], [8, 42], [8, DIM.shaftRadius]], 40));
  // 丸ナット（切欠き 4 つ）と座金。左右のねじが切ってあり、2 枚で締める。
  b.add(m.steel, cylX(40, 8, 11, 32));
  for (const x of [11, 24]) {
    b.add(m.steel, cylX(35, x, x + 11, 32));
    for (let i = 0; i < 4; i += 1) {
      b.add(m.iron, boxAt(x + 1, x + 10, 30, 36, -4, 4), rotX((i / 4) * Math.PI * 2 + (x === 11 ? 0 : 0.6)));
    }
  }
  // 軸のキー溝（回っているのが見える印）
  b.add(m.iron, boxAt(35, 62, DIM.shaftRadius - 2, DIM.shaftRadius + 0.6, -4, 4));
  group.add(b.build());

  // 羽根：羽根数 = ポート数（YMSHA）。子午面の輪郭は第2図、周方向の反りは資料に無いので仮定
  // （外周へ向かって回転と逆の向きに反る）。
  const blade = bladeGeometry();
  const bb = new Builder();
  const pitch = portPitch(ports);
  for (let i = 0; i < ports; i += 1) bb.add(m.impeller, blade, rotX(i * pitch + pitch / 2));
  const blades = bb.build();
  group.add(blades);
  return { group, blades };
}

/** 羽根 1 枚（薄い曲面。角度 0 = +y の向きに立つ）。 */
function bladeGeometry(): THREE.BufferGeometry {
  const xb = BACK + 20;
  const xf1 = FRONT - 9;
  const rIn = 50;
  const rOut = DIM.impellerRadius;
  /** 半径 r での羽根の前縁（吸気側の端）。bladeProfile の丸みと同じ形。 */
  const xMax = (r: number): number => {
    if (r >= 126) return xf1;
    if (r <= 62) return xb + 26;
    const c = 1 - (126 - r) / 64;
    return xf1 - (xf1 - xb - 26) * Math.sqrt(Math.max(0, 1 - c * c));
  };
  const nr = 18;
  const nx = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nr; i += 1) {
    const u = i / nr;
    const r = rIn + (rOut - rIn) * u;
    const a = -BLADE_SWEEP * u * u;
    for (let j = 0; j <= nx; j += 1) {
      const x = xb + (xMax(r) - xb) * (j / nx);
      pos.push(x, r * Math.cos(a), r * Math.sin(a));
      uv.push(x * 0.01, r * 0.01);
    }
  }
  for (let i = 0; i < nr; i += 1) {
    for (let j = 0; j < nx; j += 1) {
      const a = i * (nx + 1) + j;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 速く回っている羽根の残像（羽根の通る範囲の回転体）。 */
export function bladeBlurGeometry(): THREE.BufferGeometry {
  const pts = bladeProfile();
  return latheX([...pts, pts[0]!], 64);
}

function buildLinkageStatic(m: Materials, ports: number, g: LinkageGeometry): THREE.Group {
  const b = new Builder();
  const floorY = -DIM.axisHeight;
  const { pivot, springAnchor } = g;
  // 柱（箱の奥の壁ぎわ）と、支点の受け
  b.add(m.iron, boxAt(LEVER_X - 14, LEVER_X + 14, floorY, springAnchor.y + 14, pivot.z + 12, pivot.z + 18));
  b.add(m.iron, boxAt(LEVER_X - 34, LEVER_X + 34, floorY, floorY + 6, pivot.z - 20, pivot.z + 26));
  b.add(m.iron, boxAt(LEVER_X - 12, LEVER_X - 6, pivot.y - 14, pivot.y + 14, pivot.z - 10, pivot.z + 12));
  b.add(m.iron, boxAt(LEVER_X + 6, LEVER_X + 12, pivot.y - 14, pivot.y + 14, pivot.z - 10, pivot.z + 12));
  b.add(m.steel, cylX(5, LEVER_X - 15, LEVER_X + 15, 16), xf(0, pivot.y, pivot.z));
  // スプリングを掛ける腕
  b.add(m.iron, boxAt(LEVER_X - 4, LEVER_X + 4, springAnchor.y + 2, springAnchor.y + 12, springAnchor.z - 8, pivot.z + 12));
  b.add(m.steel, cylX(2.5, LEVER_X - 7, LEVER_X + 7, 10), xf(0, springAnchor.y, springAnchor.z));
  // マグネット：棚、継鉄、鉄心、コイル。鉄心の上面は、θ = 1 のアマチュアの下面から seatGap だけ下。
  const top = seatedArmatureY(g, ports) - 12 - g.seatGap;
  const mz = pivot.z - g.armatureArm;
  const shelf = top - 66;
  b.add(m.iron, boxAt(MAGNET_X - 26, MAGNET_X + 26, shelf - 6, shelf, mz - 28, pivot.z + 12));
  b.add(m.core, boxAt(MAGNET_X - 24, MAGNET_X + 24, shelf, shelf + 8, mz - 24, mz + 24));
  b.add(m.core, cylY(12, shelf + 8, top, 20), xf(MAGNET_X, 0, mz));
  b.add(m.coil, cylY(23, shelf + 10, top - 6, 28), xf(MAGNET_X, 0, mz));
  b.add(m.core, cylY(25, shelf + 8, shelf + 10, 28), xf(MAGNET_X, 0, mz));
  b.add(m.core, cylY(25, top - 6, top - 4, 28), xf(MAGNET_X, 0, mz));
  // レバーの停止位置を調節するボルト（閉じる側の当たり）。レバーの尾の上で、ナットで固定する。
  const stopZ = pivot.z + 4;
  b.add(m.steel, cylY(4, pivot.y + 14, pivot.y + 44, 10), xf(LEVER_X, 0, stopZ - 22));
  b.add(m.steel, hexHead(13, 7), xf(LEVER_X, pivot.y + 30, stopZ - 22));
  b.add(m.iron, boxAt(LEVER_X - 10, LEVER_X + 10, pivot.y + 24, pivot.y + 30, stopZ - 34, pivot.z + 12));
  return b.build();
}

function buildLever(m: Materials, ports: number, g: LinkageGeometry): THREE.Group {
  // レバーの座標：支点が原点、ピンの側が −z。
  const b = new Builder();
  const reach = linkagePose(g, ports, 0.5).forkDistance;
  // 腕
  b.add(m.iron, boxAt(-4, 4, -9, 9, -(reach - 16), 14));
  b.add(m.iron, cylX(13, -4, 4, 20));
  // フォーク（ピンをくわえる二股）
  for (const y of [-14, 14]) b.add(m.iron, boxAt(-4, 4, y - 5, y + 5, -(reach + 16), -(reach - 20)));
  // アマチュア（鉄心に吸い着く板）と、腕につなぐ金具
  const dx = MAGNET_X - LEVER_X;
  b.add(m.core, boxAt(dx - 26, dx + 26, -12, -4, -(g.armatureArm + 26), -(g.armatureArm - 26)));
  b.add(m.iron, boxAt(dx + 20, 4, -4, 4, -(g.armatureArm + 14), -(g.armatureArm - 14)));
  // スプリングを掛けるピン
  b.add(m.steel, cylX(2.5, -7, 7, 10), xf(0, 0, -g.springArm));
  const lever = b.build();
  lever.position.set(LEVER_X, g.pivot.y, g.pivot.z);
  return lever;
}

export function buildSiren(m: Materials, ports: number, sirenIndex: number, shaftIndex: number): SirenParts {
  const group = new THREE.Group();
  const linkage = DEFAULT_LINKAGE;
  group.add(buildFixed(m, ports));
  const openingCover = buildOpeningCover(m, ports, linkage);
  group.add(openingCover);
  const imp = buildImpeller(m, ports);
  group.add(imp.group);
  group.add(buildLinkageStatic(m, ports, linkage));
  const lever = buildLever(m, ports, linkage);
  group.add(lever);
  const spring = new THREE.Mesh(springGeometry(SPRING_NOMINAL, 6, 11, 1.1), m.spring);
  spring.castShadow = true;
  spring.position.set(LEVER_X, linkage.springAnchor.y, linkage.springAnchor.z);
  group.add(spring);
  const parts: SirenParts = { group, sirenIndex, shaftIndex, ports, openingCover, impeller: imp.group, blades: imp.blades, lever, spring, linkage };
  poseSiren(parts, 0);
  return parts;
}

/** 開閉カバーの角度 θ から、開閉カバー・レバー・スプリングの姿勢を決める。 */
export function poseSiren(s: SirenParts, coverAngle: number): void {
  const pose = linkagePose(s.linkage, s.ports, coverAngle);
  s.openingCover.rotation.x = pose.coverRotation;
  s.lever.rotation.x = pose.leverAngle;
  const dy = pose.springEnd.y - s.linkage.springAnchor.y;
  const dz = pose.springEnd.z - s.linkage.springAnchor.z;
  s.spring.rotation.x = Math.atan2(-dz, -dy);
  s.spring.scale.y = pose.springLength / SPRING_NOMINAL;
}
