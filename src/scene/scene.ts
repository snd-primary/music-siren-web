// Three.js による手続き生成。外部モデルファイルは使わない。
// 配置は layout.ts（純粋関数）、動きは mechanism/simulation.ts の MachineState だけを読む。
// YAMAHA のロゴ・銘板は再現しない。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Machine } from '../mechanism/machine';
import type { MachineState } from '../mechanism/simulation';
import { DIM, layoutMachine, type MachineLayout } from './layout';

const MM = 0.001;

const COLORS = {
  concrete: 0x9a968c,
  base: 0xb8b2a4,
  drum: 0xc9c2b0,
  drumDark: 0x5a564e,
  window: 0x1e1c1a,
  impeller: 0x8e8a80,
  shaft: 0x6f6a60,
  magnet: 0xbdb7a8,
  motor: 0x5d6b7a,
  brake: 0x4d4a44,
  gear: 0x7a7266,
  building: 0xd9dde3,
  ground: 0x6b6b66,
} as const;

interface SirenParts {
  readonly group: THREE.Group;
  /** 開閉カバー。開度で軸まわりに回る。 */
  readonly openingCover: THREE.Group;
  /** 羽根車。軸の位相で回る。 */
  readonly impeller: THREE.Group;
  readonly shaftIndex: number;
  readonly sirenIndex: number;
  readonly ports: number;
  readonly coverMaterials: THREE.MeshStandardMaterial[];
}

function cylinderAlongX(radius: number, length: number, material: THREE.Material, segments = 48, open = false): THREE.Mesh {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, open);
  g.rotateZ(Math.PI / 2);
  return new THREE.Mesh(g, material);
}

function box(x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(x * MM, y * MM, z * MM), material);
}

/** サイレン本体 1 台。原点が軸上の本体中心、+x が facing の向きになるように作り、呼び出し側で反転する。 */
function buildSiren(ports: number, sirenIndex: number, shaftIndex: number): SirenParts {
  const group = new THREE.Group();
  const r = DIM.coverRadius * MM;
  const len = DIM.drumLength * MM;
  const coverMaterials: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, side: THREE.DoubleSide });
    coverMaterials.push(m);
    return m;
  };

  // 固定カバー：外周の円筒と、内側（軸受側）の端板。窓孔は暗い矩形で表す。
  const fixed = new THREE.Group();
  fixed.add(cylinderAlongX(r - 0.008, len, mat(COLORS.drum), 64, true));
  const endPlate = new THREE.Mesh(new THREE.RingGeometry(DIM.shaftRadius * MM * 2, r - 0.008, 64), mat(COLORS.drum));
  endPlate.rotation.y = Math.PI / 2;
  endPlate.position.x = -len / 2;
  fixed.add(endPlate);
  const windowW = ((2 * Math.PI * r) / ports) * DIM.windowWidthRatio;
  const windowH = DIM.windowHeight * MM;
  const windowGeom = new THREE.PlaneGeometry(windowH, windowW);
  const windowMat = new THREE.MeshStandardMaterial({ color: COLORS.window, roughness: 1, side: THREE.DoubleSide });
  for (let i = 0; i < ports; i += 1) {
    const a = (i / ports) * Math.PI * 2;
    const w = new THREE.Mesh(windowGeom, windowMat);
    // 外周面に貼る。平面の法線（+z）を半径方向 (0, cos a, sin a) に向ける
    w.position.set(0, Math.cos(a) * (r - 0.006), Math.sin(a) * (r - 0.006));
    w.rotation.x = a - Math.PI / 2;
    fixed.add(w);
  }
  group.add(fixed);

  // 開閉カバー：窓の間を覆う板が ports 枚。閉じているとき（回転 0）は板が窓の真上に来る。
  // CylinderGeometry を rotateZ(π/2) すると、円周の角度 θ は軸まわりの角度 a = π/2 − θ に写る。
  // 板 1 枚を a ∈ [−Δ/2, +Δ/2] に作り、窓の角度 a_i だけ回して置く。
  const openingCover = new THREE.Group();
  const panelTheta = ((2 * Math.PI) / ports) * (1 - DIM.windowWidthRatio);
  const panelGeom = new THREE.CylinderGeometry(r, r, len, 12, 1, true, Math.PI / 2 - panelTheta / 2, panelTheta);
  panelGeom.rotateZ(Math.PI / 2);
  const panelMat = mat(COLORS.drum);
  for (let i = 0; i < ports; i += 1) {
    const panel = new THREE.Mesh(panelGeom, panelMat);
    panel.rotation.x = (i / ports) * Math.PI * 2;
    openingCover.add(panel);
  }
  // 外側の縁（リング）
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 8, 64), mat(COLORS.drum));
  rim.rotation.y = Math.PI / 2;
  rim.position.x = len / 2;
  openingCover.add(rim);
  const rim2 = rim.clone();
  rim2.position.x = -len / 2;
  openingCover.add(rim2);
  group.add(openingCover);

  // 羽根車：外側の面に背面がむき出し。円盤と放射状の羽根、中央のナット。
  const impeller = new THREE.Group();
  const ir = DIM.impellerRadius * MM;
  const disc = cylinderAlongX(ir, 0.008, new THREE.MeshStandardMaterial({ color: COLORS.impeller, roughness: 0.6, metalness: 0.4 }), 64);
  disc.position.x = len / 2 - 0.02;
  impeller.add(disc);
  const bladeGeom = new THREE.BoxGeometry(0.06, ir - 0.03, 0.006);
  const bladeMat = new THREE.MeshStandardMaterial({ color: COLORS.impeller, roughness: 0.6, metalness: 0.4 });
  for (let i = 0; i < ports; i += 1) {
    const blade = new THREE.Mesh(bladeGeom, bladeMat);
    blade.position.set(len / 2 - 0.055, 0, 0);
    blade.rotation.x = (i / ports) * Math.PI * 2;
    blade.translateY((ir - 0.03) / 2 + 0.02);
    impeller.add(blade);
  }
  const nut = cylinderAlongX(0.03, 0.03, new THREE.MeshStandardMaterial({ color: COLORS.shaft, roughness: 0.5, metalness: 0.5 }), 6);
  nut.position.x = len / 2 - 0.005;
  impeller.add(nut);
  group.add(impeller);

  return { group, openingCover, impeller, shaftIndex, sirenIndex, ports, coverMaterials };
}

export interface SceneOptions {
  readonly showBuilding: boolean;
  readonly seeThrough: boolean;
}

export class SirenScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private machineGroup = new THREE.Group();
  private sirens: SirenParts[] = [];
  private motorRotor: THREE.Object3D | null = null;
  private building: THREE.Object3D | null = null;
  private layout: MachineLayout | null = null;
  private directShaftIndex = 0;
  private options: SceneOptions = { showBuilding: false, seeThrough: false };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene.background = new THREE.Color(0xbfd3e6);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    this.camera.position.set(3.2, 1.6, 4.2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.5, 0);
    this.controls.enableDamping = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x667766, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 6, 3);
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    this.scene.add(ground);

    this.scene.add(this.machineGroup);
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 450;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setOptions(options: SceneOptions): void {
    this.options = options;
    if (this.building) this.building.visible = options.showBuilding;
    for (const s of this.sirens) {
      for (const m of s.coverMaterials) {
        m.transparent = options.seeThrough;
        m.opacity = options.seeThrough ? 0.25 : 1;
        m.depthWrite = !options.seeThrough;
        m.needsUpdate = true;
      }
    }
  }

  setMachine(machine: Machine): void {
    this.scene.remove(this.machineGroup);
    this.machineGroup = new THREE.Group();
    this.sirens = [];
    const layout = layoutMachine(machine);
    this.layout = layout;
    this.directShaftIndex = Math.max(0, machine.shafts.findIndex((s) => s.ratio.num === s.ratio.den));
    const g = this.machineGroup;
    const axisY = (DIM.baseHeight + DIM.axisHeight) * MM;

    // 基礎（左・中央・右）
    const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.95 });
    const bases: [number, number][] = [
      [-(layout.centerLength / 2 + layout.leftLength / 2), layout.leftLength],
      [0, layout.centerLength],
      [layout.centerLength / 2 + layout.rightLength / 2, layout.rightLength],
    ];
    for (const [x, len] of bases) {
      const b = box(len - 20, DIM.baseHeight, DIM.baseWidth, baseMat);
      b.position.set(x * MM, (DIM.baseHeight / 2) * MM, 0);
      g.add(b);
    }

    // 軸（左右それぞれ 1 本に見せる）
    const shaftMat = new THREE.MeshStandardMaterial({ color: COLORS.shaft, roughness: 0.45, metalness: 0.6 });
    const shaft = cylinderAlongX(DIM.shaftRadius * MM, layout.totalLength * MM - 0.1, shaftMat, 24);
    shaft.position.y = axisY;
    g.add(shaft);

    // 中央ベース：ブレーキ・モーター・変速歯車。配列表の順（左からブレーキ、モーター、歯車）。
    const brake = box(DIM.brake.x, DIM.brake.y, DIM.brake.z, new THREE.MeshStandardMaterial({ color: COLORS.brake, roughness: 0.8 }));
    brake.position.set(-layout.centerLength * 0.3 * MM, axisY, 0);
    g.add(brake);
    const motorMat = new THREE.MeshStandardMaterial({ color: COLORS.motor, roughness: 0.6, metalness: 0.3 });
    const motor = cylinderAlongX(DIM.motor.radius * MM, DIM.motor.length * MM, motorMat, 40);
    motor.position.set(0, axisY, 0);
    g.add(motor);
    const motorFoot = box(DIM.motor.length * 0.8, DIM.axisHeight, DIM.motor.radius * 1.6, motorMat);
    motorFoot.position.set(0, (DIM.baseHeight + DIM.axisHeight / 2) * MM, 0);
    g.add(motorFoot);
    const fan = new THREE.Group();
    const fanDisc = cylinderAlongX(DIM.motor.radius * 0.6 * MM, 0.01, new THREE.MeshStandardMaterial({ color: COLORS.impeller }), 24);
    fan.add(fanDisc);
    fan.position.set((DIM.motor.length / 2 + 8) * MM, axisY, 0);
    g.add(fan);
    this.motorRotor = fan;
    const gearMat = new THREE.MeshStandardMaterial({ color: COLORS.gear, roughness: 0.7, metalness: 0.3 });
    const gearBox = box(DIM.gearBox.x, DIM.gearBox.y, DIM.gearBox.z, gearMat);
    gearBox.position.set(layout.centerLength * 0.3 * MM, axisY, 0);
    g.add(gearBox);
    for (const eg of layout.extraGears) {
      const gb = box(DIM.gearBox.x * 1.3, DIM.gearBox.y * 1.3, DIM.gearBox.z * 1.3, gearMat);
      gb.position.set(eg.x * MM, axisY, 0);
      g.add(gb);
    }

    // 対ごとの軸受ユニット（軸筒）とマグネット箱、対の間のカップリング
    const bearingMat = new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.8 });
    const magnetMat = new THREE.MeshStandardMaterial({ color: COLORS.magnet, roughness: 0.85 });
    for (const pair of layout.pairs) {
      const pedestal = box(DIM.pairGap - 40, DIM.axisHeight, 260, bearingMat);
      pedestal.position.set(pair.x * MM, (DIM.baseHeight + DIM.axisHeight / 2) * MM, 0);
      g.add(pedestal);
      const housing = cylinderAlongX(0.07, (DIM.pairGap - 40) * MM, bearingMat, 24);
      housing.position.set(pair.x * MM, axisY, 0);
      g.add(housing);
      const magnet = box(DIM.magnetBox.x, DIM.magnetBox.y, DIM.magnetBox.z, magnetMat);
      magnet.position.set(pair.x * MM, (DIM.baseHeight + DIM.magnetBox.y / 2) * MM, (DIM.baseWidth / 2 - DIM.magnetBox.z / 2 - 20) * MM);
      g.add(magnet);
    }

    // サイレン本体
    for (const placement of layout.sirens) {
      const siren = machine.sirens[placement.sirenIndex];
      if (!siren) continue;
      const shaftIndex = machine.shafts.findIndex((s) => s.id === siren.shaftId);
      const parts = buildSiren(siren.ports, siren.index, shaftIndex);
      parts.group.position.set(placement.x * MM, axisY, 0);
      if (placement.facing < 0) parts.group.rotation.y = Math.PI;
      g.add(parts.group);
      this.sirens.push(parts);
    }

    // 建屋（伊賀の寸法 4.4 × 1.5 × 2.0 m）。中を見せるために半透明。
    const bld = new THREE.Group();
    const bx = Math.max(DIM.building.x, layout.totalLength + 500) * MM;
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(bx, DIM.building.y * MM, DIM.building.z * MM),
      new THREE.MeshStandardMaterial({ color: COLORS.building, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    );
    walls.position.y = (DIM.building.y / 2) * MM;
    bld.add(walls);
    bld.add(new THREE.LineSegments(new THREE.EdgesGeometry(walls.geometry), new THREE.LineBasicMaterial({ color: 0x55606a })).translateY(walls.position.y));
    bld.visible = this.options.showBuilding;
    g.add(bld);
    this.building = bld;

    this.scene.add(g);
    this.setOptions(this.options);
    this.controls.target.set(0, axisY, 0);
    this.camera.position.set(layout.totalLength * MM * 0.55, 1.5, layout.totalLength * MM * 0.7);
  }

  update(state: MachineState): void {
    for (const s of this.sirens) {
      const turns = state.shaftTurns[s.shaftIndex] ?? 0;
      s.impeller.rotation.x = turns * Math.PI * 2;
      const open = state.covers[s.sirenIndex] ?? 0;
      // 閉：板が窓の上（回転 0）。開：半ピッチ回って板が窓の間に来る。
      s.openingCover.rotation.x = (open * Math.PI) / s.ports;
    }
    if (this.motorRotor) {
      // モーター軸は直結の軸（変速比 1）と同じ位相
      const direct = this.directShaftIndex;
      this.motorRotor.rotation.x = (state.shaftTurns[direct] ?? 0) * Math.PI * 2;
    }
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
