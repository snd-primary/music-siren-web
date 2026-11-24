// Three.js による手続き生成。外部モデルファイルも外部の画像も使わない。
// 配置は layout.ts（純粋関数）、動きは mechanism/simulation.ts の MachineState だけを読む：
//   軸の位相 → 羽根車・カップリング・歯車、開閉カバーの角度 → 開閉カバー・レバー・アマチュア・スプリング
//   （mechanism/linkage.ts）。音も同じ状態を読むので、揺れも跳ね返りも音と同じ動きになる。
// 部品の形は siren.ts と drivetrain.ts。YAMAHA のロゴ・銘板は再現しない。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Machine } from '../mechanism/machine';
import { ratioToNumber } from '../mechanism/ratio';
import type { MachineState } from '../mechanism/simulation';
import {
  AXIS_Y,
  addBase,
  addBearingUnit,
  addBrake,
  addBrakeCover,
  addGearCaseCover,
  addMagnetBox,
  addMotor,
  buildBuilding,
  buildCoupling,
  buildGears,
  counterAngle,
  type GearCaseParts,
} from './drivetrain';
import { Builder, cylX } from './geom';
import { unwrapInputTurns } from './geartrain';
import { DIM, layoutMachine } from './layout';
import { createMaterials, type Materials } from './materials';
import { bladeBlurGeometry, buildSiren, poseSiren, type SirenParts } from './siren';

const MM = 0.001;
const TAU = Math.PI * 2;

export interface SceneOptions {
  readonly showBuilding: boolean;
  /** サイレン本体の殻（開閉カバー・固定カバー）を透かす。 */
  readonly seeThrough: boolean;
  /** マグネットカバー・ブレーキカバー・歯車箱を外す。 */
  readonly hideHousings: boolean;
  /** 軸を通る縦の面で切って、手前（マグネットの反対側）の半分を取り除く（第2図のような断面）。 */
  readonly section: boolean;
}

interface Rotor {
  readonly object: THREE.Object3D;
  readonly shaftIndex: number;
}

interface GearSet extends GearCaseParts {
  readonly inShaft: number;
  readonly outShaft: number;
  readonly num: number;
  readonly den: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

export class SirenScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly materials: Materials;
  private readonly sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly sun: THREE.DirectionalLight;
  private machineGroup = new THREE.Group();
  private sirens: SirenParts[] = [];
  private blurMaterials: THREE.MeshStandardMaterial[] = [];
  private rotors: Rotor[] = [];
  private gearSets: GearSet[] = [];
  private shaftRatios: number[] = [];
  private housings: THREE.Object3D | null = null;
  private building: THREE.Object3D | null = null;
  private options: SceneOptions = { showBuilding: false, seeThrough: false, hideHousings: false, section: false };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.scene.background = new THREE.Color(0xc9d6e2);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.02, 60);
    this.camera.position.set(2.4, 1.3, 3.0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, AXIS_Y * MM, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.12;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x8a8478, 0.45));
    this.sun = new THREE.DirectionalLight(0xfff4e2, 2.0);
    this.sun.position.set(2.5, 5, -4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.materials = createMaterials();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), this.materials.floor);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
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
    const m = this.materials;
    if (this.building) this.building.visible = options.showBuilding;
    if (this.housings) this.housings.visible = !options.hideHousings;
    for (const mat of m.shells) {
      mat.transparent = options.seeThrough;
      mat.opacity = options.seeThrough ? 0.22 : 1;
      mat.depthWrite = !options.seeThrough;
      mat.needsUpdate = true;
    }
    for (const mat of m.sectioned) {
      mat.clippingPlanes = options.section ? [this.sectionPlane] : [];
      mat.clipShadows = true;
      mat.needsUpdate = true;
    }
    // 建屋の中は屋根で日が遮られるので、建屋を出したら日を正面の低い所から入れる
    this.sun.position.set(options.showBuilding ? 1.2 : 2.5, options.showBuilding ? 2.2 : 5, options.showBuilding ? -5 : -4);
  }

  setMachine(machine: Machine): void {
    this.scene.remove(this.machineGroup);
    this.machineGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const mat of this.blurMaterials) mat.dispose();
    const root = new THREE.Group();
    root.scale.setScalar(MM);
    this.machineGroup = root;
    this.sirens = [];
    this.rotors = [];
    this.gearSets = [];
    const m = this.materials;
    const layout = layoutMachine(machine);
    this.shaftRatios = machine.shafts.map((s) => ratioToNumber(s.ratio));
    const shaftIndexOf = (id: string): number => Math.max(0, machine.shafts.findIndex((s) => s.id === id));
    const directShaft = Math.max(0, machine.shafts.findIndex((s) => s.ratio.num === s.ratio.den));
    const sirenShaft = (sirenIndex: number | undefined): number => shaftIndexOf(machine.sirens[sirenIndex ?? 0]?.shaftId ?? '');
    this.blurMaterials = machine.shafts.map(
      () => new THREE.MeshStandardMaterial({ color: 0x34342f, roughness: 0.8, metalness: 0.2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    const blurGeometry = bladeBlurGeometry();

    const fixed = new Builder();
    const housings = new Builder();
    const half = layout.centerLength / 2;
    const k = layout.centerLength / DIM.centerBase8;

    // ベース（左・中央・右）
    addBase(fixed, m, -half - layout.leftLength, -half, DIM.baseWidth);
    addBase(fixed, m, -half, half, DIM.centerBaseWidth);
    addBase(fixed, m, half, half + layout.rightLength, DIM.baseWidth);

    // 軸（回っても見た目が変わらないので 1 本で置く。回転は丸ナット・キー・カップリングで見せる）
    // 変速歯車装置の中では、入力軸と出力軸が切れている。
    const xs = layout.sirens.map((p) => p.x);
    const cuts = [Math.min(...xs) - 20, DIM.center.gear * k, ...layout.extraGears.map((eg) => eg.x), Math.max(...xs) + 20].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const a = cuts[i]! + (i === 0 ? 0 : 3);
      const b = cuts[i + 1]! - (i + 2 === cuts.length ? 0 : 3);
      fixed.add(m.steel, cylX(DIM.shaftRadius, a, b, 32), new THREE.Matrix4().makeTranslation(0, AXIS_Y, 0));
    }

    // 中央ベース：電磁制動装置、駆動電動機、変速歯車装置（第1図の並び）
    const right = layout.pairs.filter((p) => p.side === 'right').sort((a, b) => a.x - b.x);
    const left = layout.pairs.filter((p) => p.side === 'left').sort((a, b) => b.x - a.x);
    const rightInner = sirenShaft(right[0]?.sirenIndexes[0]);
    addBrake(fixed, m, DIM.center.brake * k);
    addBrakeCover(housings, m, DIM.center.brake * k);
    addMotor(fixed, m, DIM.center.motor * k);
    const addGearSet = (x: number, dir: 1 | -1, inShaft: number, outShaft: number): void => {
      const a = machine.shafts[inShaft]!.ratio;
      const b = machine.shafts[outShaft]!.ratio;
      const n = b.num * a.den;
      const d = b.den * a.num;
      const g = gcd(n, d);
      const parts = buildGears(fixed, m, x, dir, n / g, d / g);
      addGearCaseCover(housings, m, x, n / g, d / g);
      root.add(parts.input, parts.counter, parts.output);
      this.gearSets.push({ ...parts, inShaft, outShaft, num: n / g, den: d / g });
    };
    addGearSet(DIM.center.gear * k, 1, directShaft, rightInner);
    for (const eg of layout.extraGears) {
      // 歯車箱の内側（中央寄り）の軸が入力、外側の軸が出力
      const side = eg.side === 'left' ? left : right;
      const inner = side.filter((p) => Math.abs(p.x) < Math.abs(eg.x)).at(-1);
      const outer = side.find((p) => Math.abs(p.x) > Math.abs(eg.x));
      if (inner && outer) addGearSet(eg.x, eg.side === 'left' ? -1 : 1, sirenShaft(inner.sirenIndexes[0]), sirenShaft(outer.sirenIndexes[0]));
    }

    // カップリング：中央ベースの 4 つと、対と対の間
    const addCoupling = (x: number, shaftIndex: number): void => {
      const c = buildCoupling(m);
      c.position.x = x;
      root.add(c);
      this.rotors.push({ object: c, shaftIndex });
    };
    DIM.center.couplings.forEach((x, i) => addCoupling(x * k, i === 3 ? rightInner : directShaft));
    for (const side of [left, right]) {
      for (let i = 0; i + 1 < side.length; i += 1) {
        const a = side[i]!;
        const b = side[i + 1]!;
        const gearBetween = layout.extraGears.some((eg) => Math.abs(eg.x) > Math.abs(a.x) && Math.abs(eg.x) < Math.abs(b.x));
        if (!gearBetween) addCoupling((a.x + b.x) / 2, sirenShaft(b.sirenIndexes[0]));
      }
    }

    // 対ごとの軸受ユニットとマグネットカバー
    for (const pair of layout.pairs) {
      addBearingUnit(fixed, m, pair.x);
      addMagnetBox(housings, m, pair.x);
    }

    // サイレン本体。吸気側（+x）が facing の向きになるように鏡映する。
    for (const placement of layout.sirens) {
      const siren = machine.sirens[placement.sirenIndex];
      if (!siren) continue;
      const shaftIndex = shaftIndexOf(siren.shaftId);
      const parts = buildSiren(m, siren.ports, siren.index, shaftIndex);
      parts.group.position.set(placement.x, AXIS_Y, 0);
      parts.group.scale.x = placement.facing;
      const blur = new THREE.Mesh(blurGeometry, this.blurMaterials[shaftIndex]);
      blur.renderOrder = 1;
      parts.group.add(blur);
      root.add(parts.group);
      this.sirens.push(parts);
    }

    root.add(fixed.build());
    this.housings = housings.build();
    root.add(this.housings);

    // 建屋（伊賀の寸法 4.4 × 1.5 × 2.0 m。機種が長いときは伸ばす）
    this.building = buildBuilding(m, Math.max(DIM.building.x, layout.totalLength + 500));
    root.add(this.building);

    this.scene.add(root);
    this.setOptions(this.options);

    // 影の範囲を機械に合わせる
    const span = (layout.totalLength * MM) / 2 + 0.6;
    const cam = this.sun.shadow.camera;
    cam.left = -span;
    cam.right = span;
    cam.top = 2.2;
    cam.bottom = -2.2;
    cam.near = 0.5;
    cam.far = 16;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(0, 0.3, 0);

    // 視点：右の端の対に寄った斜め前から。マグネットカバーは伊賀機の映像と同じく奥（+z）に来る。
    const focus = right.at(-1)?.x ?? 0;
    this.controls.target.set(focus * MM * 0.55, AXIS_Y * MM * 0.9, 0);
    this.camera.position.set(focus * MM + 1.15, AXIS_Y * MM + 0.55, -1.75);
  }

  update(state: MachineState): void {
    const rps = state.drive.rps;
    for (const s of this.sirens) {
      s.impeller.rotation.x = (state.shaftTurns[s.shaftIndex] ?? 0) * TAU;
      poseSiren(s, state.coverAngles[s.sirenIndex] ?? 0);
    }
    for (const r of this.rotors) r.object.rotation.x = (state.shaftTurns[r.shaftIndex] ?? 0) * TAU;
    for (const g of this.gearSets) {
      // 歯がかみ合ったまま回るように、折り返した位相から入力軸の回転数を取り戻す
      const t = unwrapInputTurns(state.shaftTurns[g.inShaft] ?? 0, state.shaftTurns[g.outShaft] ?? 0, g.num, g.den);
      g.input.rotation.x = t * TAU;
      g.counter.rotation.x = counterAngle(g.train, t);
      g.output.rotation.x = ((t * g.num) / g.den) * TAU;
    }
    // 速く回る羽根は、画面のコマ数では止まって見えたり逆に回って見えたりするので、残像に置き換える
    const blur = this.blurMaterials.map((mat, i) => {
      const amount = smoothstep(4, 12, Math.abs(rps * (this.shaftRatios[i] ?? 1)));
      mat.opacity = 0.72 * amount;
      mat.visible = amount > 0;
      return amount;
    });
    for (const s of this.sirens) s.blades.visible = (blur[s.shaftIndex] ?? 0) < 1;
  }

  /** 視点を置く（m）。確認用。 */
  setCamera(position: readonly [number, number, number], target: readonly [number, number, number]): void {
    this.camera.position.set(...position);
    this.controls.target.set(...target);
    this.controls.update();
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
