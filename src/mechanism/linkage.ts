// 開閉カバーを動かすリンク機構（マグネット・レバー・スプリング）の運動学。純粋関数。
//
// 音も 3D も、開閉カバーの角度 θ（simulation.ts の coverAngles。0 = 閉、1 = 窓が重なりきる位置）だけを読む。
// ここでは θ から、開閉カバーの回転角・ピンの位置・レバーの角度・アマチュアの隙間・スプリングの長さを導く。
// 揺れも跳ね返りも θ に入っているので、レバーもアマチュアもスプリングも音と同じ動きをする
// （docs/adr/0017-3d-from-figures-and-video.md）。
//
// 座標：サイレンの軸を x として、軸に垂直な面の (y, z)。y は上、角度 a は +y から +z へ測る。
// 長さは mm、角度は rad。
//
// 確定していること（説明書）：マグネットがレバーを引くと開き、スプリングで戻る。開閉カバーの背板にピンがある。
// 仮定：レバーの形と向き。伊賀機のマグネットカバーは軸受の横に立つ箱で、中は映像に写っていない。
//   ここでは、箱の中で水平に寝たレバーが、片端の支点で回り、他端のフォークでピンをくわえ、
//   支点の近くのアマチュアを下のマグネットが引く形にした。

export interface LinkageGeometry {
  /** ピンの、軸からの距離。 */
  readonly pinRadius: number;
  /** レバーの支点。 */
  readonly pivot: { readonly y: number; readonly z: number };
  /** 支点からアマチュアの中心までの距離。 */
  readonly armatureArm: number;
  /** 支点から、スプリングを掛ける点までの距離。 */
  readonly springArm: number;
  /** スプリングの固定側。 */
  readonly springAnchor: { readonly y: number; readonly z: number };
  /** θ = 1（ストッパー）でのアマチュアと鉄心の隙間。 */
  readonly seatGap: number;
}

export const DEFAULT_LINKAGE: LinkageGeometry = {
  pinRadius: 150,
  pivot: { y: 0, z: 295 },
  armatureArm: 45,
  springArm: 100,
  springAnchor: { y: 78, z: 195 },
  seatGap: 1.5,
};

export interface LinkagePose {
  /** 開閉カバーの回転角（閉からの角度）。θ = 1 で窓の半ピッチ。 */
  readonly coverRotation: number;
  /** ピンの位置。 */
  readonly pin: { readonly y: number; readonly z: number };
  /** レバーの角度（水平 = 0、ピン側が下がると負）。 */
  readonly leverAngle: number;
  /** 支点からピンまでの距離（フォークの溝の中をピンが滑る）。 */
  readonly forkDistance: number;
  /** アマチュアと鉄心の隙間。 */
  readonly armatureGap: number;
  /** スプリングを掛けた点の位置。 */
  readonly springEnd: { readonly y: number; readonly z: number };
  readonly springLength: number;
}

/** 窓 1 ピッチの角度。 */
export function portPitch(ports: number): number {
  return (2 * Math.PI) / ports;
}

/** 開閉カバーの回転角。閉（0）では板が窓孔の上、θ = 1 で半ピッチ回って窓が重なる。 */
export function coverRotation(ports: number, coverAngle: number): number {
  return (coverAngle * portPitch(ports)) / 2;
}

/** 閉じているときのピンの角度。行程が水平（+z）をはさんで上下対称になるように置く。 */
export function pinAngleClosed(ports: number): number {
  return Math.PI / 2 - portPitch(ports) / 4;
}

function leverAngleAt(g: LinkageGeometry, ports: number, coverAngle: number): { angle: number; pin: { y: number; z: number } } {
  const a = pinAngleClosed(ports) + coverRotation(ports, coverAngle);
  const pin = { y: g.pinRadius * Math.cos(a), z: g.pinRadius * Math.sin(a) };
  return { angle: Math.atan2(pin.y - g.pivot.y, g.pivot.z - pin.z), pin };
}

export function linkagePose(g: LinkageGeometry, ports: number, coverAngle: number): LinkagePose {
  const { angle, pin } = leverAngleAt(g, ports, coverAngle);
  const seated = leverAngleAt(g, ports, 1).angle;
  const springEnd = { y: g.pivot.y + g.springArm * Math.sin(angle), z: g.pivot.z - g.springArm * Math.cos(angle) };
  return {
    coverRotation: coverRotation(ports, coverAngle),
    pin,
    leverAngle: angle,
    forkDistance: Math.hypot(pin.y - g.pivot.y, pin.z - g.pivot.z),
    armatureGap: g.seatGap + g.armatureArm * (Math.sin(angle) - Math.sin(seated)),
    springEnd,
    springLength: Math.hypot(springEnd.y - g.springAnchor.y, springEnd.z - g.springAnchor.z),
  };
}

/** θ = 1 でのアマチュアの中心の高さ（レバーの中心線上）。マグネットの鉄心はこの下に置く。 */
export function seatedArmatureY(g: LinkageGeometry, ports: number): number {
  return g.pivot.y + g.armatureArm * Math.sin(leverAngleAt(g, ports, 1).angle);
}
