// 手続き生成の部品。長さはすべて mm（機械全体のグループを 0.001 倍して m にする）。
// 軸は x。軸に垂直な面の角度 a は +y から +z へ測る（mechanism/linkage.ts と同じ）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

class MeshData {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  /** 2 列の頂点を帯にする。面の向きは法線に合わせて自動でそろえる。 */
  strip(a: readonly THREE.Vector3[], b: readonly THREE.Vector3[], normals: readonly THREE.Vector3[], uvA: readonly [number, number][], uvB: readonly [number, number][]): void {
    const base = this.pos.length / 3;
    const n = a.length;
    for (let i = 0; i < n; i += 1) {
      const pa = a[i]!;
      const pb = b[i]!;
      const nn = normals[i]!;
      this.pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      this.nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
      this.uv.push(...uvA[i]!, ...uvB[i]!);
    }
    const e1 = new THREE.Vector3().subVectors(b[0]!, a[0]!);
    const e2 = new THREE.Vector3().subVectors(a[1]!, a[0]!);
    const flip = e1.cross(e2).dot(normals[0]!) < 0;
    for (let i = 0; i < n - 1; i += 1) {
      const a0 = base + 2 * i;
      const b0 = a0 + 1;
      const a1 = a0 + 2;
      const b1 = a0 + 3;
      if (flip) this.idx.push(a0, a1, b0, b0, a1, b1);
      else this.idx.push(a0, b0, a1, b0, b1, a1);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

const polar = (x: number, r: number, a: number): THREE.Vector3 => new THREE.Vector3(x, r * Math.cos(a), r * Math.sin(a));

/**
 * 厚みのある円弧の板（円筒の一部）。半径 r0〜r1、軸方向 x0〜x1、角度 a0〜a1。
 * 一周ぶん（a1 − a0 = 2π）なら輪になり、端の面は作らない。
 */
export function arcBox(r0: number, r1: number, x0: number, x1: number, a0 = 0, a1 = TAU, segments?: number): THREE.BufferGeometry {
  const span = a1 - a0;
  const full = Math.abs(span) >= TAU - 1e-6;
  const n = segments ?? Math.max(2, Math.ceil(Math.abs(span) / (Math.PI / 36)));
  const m = new MeshData();
  const S = 0.01; // テクスチャの 1 周期 = 100 mm
  const angles = Array.from({ length: n + 1 }, (_, i) => a0 + (span * i) / n);
  const radial = angles.map((a) => new THREE.Vector3(0, Math.cos(a), Math.sin(a)));
  const inward = radial.map((v) => v.clone().negate());
  const uvs = (r: number, v: number): [number, number][] => angles.map((a) => [a * r * S, v * S]);
  // 外周・内周
  m.strip(angles.map((a) => polar(x0, r1, a)), angles.map((a) => polar(x1, r1, a)), radial, uvs(r1, x0), uvs(r1, x1));
  if (r0 > 0) m.strip(angles.map((a) => polar(x0, r0, a)), angles.map((a) => polar(x1, r0, a)), inward, uvs(r0, x0), uvs(r0, x1));
  // 軸方向の両端の面
  const nx0 = angles.map(() => new THREE.Vector3(-1, 0, 0));
  const nx1 = angles.map(() => new THREE.Vector3(1, 0, 0));
  const mid = (r0 + r1) / 2;
  m.strip(angles.map((a) => polar(x0, r0, a)), angles.map((a) => polar(x0, r1, a)), nx0, uvs(mid, r0), uvs(mid, r1));
  m.strip(angles.map((a) => polar(x1, r0, a)), angles.map((a) => polar(x1, r1, a)), nx1, uvs(mid, r0), uvs(mid, r1));
  if (!full) {
    for (const [a, sign] of [[a0, -1], [a1, 1]] as const) {
      const s = sign * Math.sign(span || 1);
      const nrm = new THREE.Vector3(0, -Math.sin(a) * s, Math.cos(a) * s);
      m.strip([polar(x0, r0, a), polar(x1, r0, a)], [polar(x0, r1, a), polar(x1, r1, a)], [nrm, nrm], [[x0 * S, r0 * S], [x1 * S, r0 * S]], [[x0 * S, r1 * S], [x1 * S, r1 * S]]);
    }
  }
  return m.build();
}

/** 軸（x）まわりの回転体。輪郭は [x, 半径] の列。 */
export function latheX(profile: readonly (readonly [number, number])[], segments = 48): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.001), x)), segments);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** x 方向の円柱。 */
export function cylX(radius: number, x0: number, x1: number, segments = 32): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, Math.abs(x1 - x0), segments);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}

/** y 方向の円柱（下端 y0、上端 y1）。 */
export function cylY(radius: number, y0: number, y1: number, segments = 24, radiusTop = radius): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radiusTop, radius, Math.abs(y1 - y0), segments);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}

/** 範囲で指定する直方体。テクスチャは面の大きさに合わせて並べる（1 周期 = 100 mm）。 */
export function boxAt(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const sx = Math.abs(x1 - x0);
  const sy = Math.abs(y1 - y0);
  const sz = Math.abs(z1 - z0);
  const g = new THREE.BoxGeometry(sx, sy, sz);
  // 面の順は ±x, ±y, ±z（各 4 頂点）。uv の横・縦に当たる寸法を掛ける。
  const dims: [number, number][] = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  const uv = g.getAttribute('uv');
  const ox = (x0 + x1) * 0.0037;
  const oy = (y0 + z0) * 0.0041;
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f]![0] * 0.01 + ox, uv.getY(i) * dims[f]![1] * 0.01 + oy);
    }
  }
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** 六角ボルトの頭（座金つき）。軸は y、座面が y = 0。 */
export function hexHead(acrossFlats: number, height: number): THREE.BufferGeometry {
  const r = acrossFlats / Math.sqrt(3);
  const head = cylY(r, height * 0.18, height, 6);
  const washer = cylY(r * 1.25, 0, height * 0.18, 20);
  return merge([head, washer]);
}

/** 平歯車。軸は x、幅 width を x = 0 の両側に振り分ける。角度 0（+y）に歯の中心が来る。 */
export function gearGeometry(teeth: number, module: number, width: number, bore = 12): THREE.BufferGeometry {
  const rp = (module * teeth) / 2;
  const ra = rp + module;
  const rf = rp - 1.25 * module;
  const pitch = TAU / teeth;
  const shape = new THREE.Shape();
  // Shape の面は (X, Y)。押し出したあと rotateY で、押し出し方向 → x、X → −z、Y → y に写す。
  const pt = (r: number, a: number): [number, number] => [-r * Math.sin(a), r * Math.cos(a)];
  for (let i = 0; i < teeth; i += 1) {
    const c = i * pitch;
    const pts = [pt(rf, c - pitch * 0.5), pt(rf, c - pitch * 0.3), pt(ra, c - pitch * 0.13), pt(ra, c + pitch * 0.13), pt(rf, c + pitch * 0.3)];
    for (const [j, p] of pts.entries()) {
      if (i === 0 && j === 0) shape.moveTo(p[0], p[1]);
      else shape.lineTo(p[0], p[1]);
    }
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, bore, 0, TAU, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** コイルばね。原点から −y へ、長さ length。 */
export function springGeometry(length: number, radius: number, turns: number, wire: number): THREE.BufferGeometry {
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
      // 両端の 6% は巻かずにまっすぐ（掛け金）
      const s = Math.min(1, Math.max(0, (t - 0.06) / 0.88));
      const r = t < 0.06 || t > 0.94 ? radius * Math.min(1, Math.min(t, 1 - t) / 0.06) : radius;
      const a = s * turns * TAU;
      return target.set(r * Math.cos(a), -t * length, r * Math.sin(a));
    }
  }
  return new THREE.TubeGeometry(new Helix(), turns * 16, wire, 6);
}

/** 位置・回転の行列。 */
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
}

/** 軸まわりに角度 a だけ回す行列。 */
export function rotX(a: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationX(a);
}

function normalize(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  g.clearGroups();
  return g;
}

export function merge(geoms: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geoms.map(normalize));
  if (!merged) throw new Error('形状を結合できない');
  return merged;
}

/** 材質ごとに形状を集めて、材質 1 つにつきメッシュ 1 つにまとめる。 */
export class Builder {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): this {
    const g = normalize(geometry);
    if (matrix) g.applyMatrix4(matrix);
    const list = this.parts.get(material);
    if (list) list.push(g);
    else this.parts.set(material, [g]);
    return this;
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [material, geoms] of this.parts) {
      const mesh = new THREE.Mesh(merge(geoms), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}
