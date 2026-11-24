// 音の調整パネル。合成（audio/synth.ts）と開閉カバー（mechanism/simulation.ts）のパラメータを、
// 鳴らしながらスライダーで動かす。値はブラウザに保存し、既定値との差分を JSON で書き出せる
// （聴いて決めた値を ADR とコードの既定値に戻すため）。
import { DEFAULT_SYNTH, type SynthParams } from '../audio/synth';
import { DEFAULT_COVER_PARAMS, type CoverParams } from '../mechanism/simulation';

export interface Tuning {
  readonly synth: SynthParams;
  readonly cover: CoverParams;
}

/** パネルの既定値。コードの既定値に、利得 0 dB（何もしない）の 3 つめのフォルマントを足して、試せるようにする。 */
export const DEFAULT_TUNING: Tuning = {
  synth: { ...DEFAULT_SYNTH, formants: [...DEFAULT_SYNTH.formants, { hz: 3200, gainDb: 0, q: 2 }] },
  cover: DEFAULT_COVER_PARAMS,
};

type Path = readonly (string | number)[];

interface Control {
  readonly group: string;
  readonly label: string;
  readonly path: Path;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** 対数目盛り（周波数など）。 */
  readonly log?: boolean;
  readonly unit?: string;
}

const formantControls = (index: number, name: string): Control[] => [
  { group: 'フォルマント', label: `${name} 周波数`, path: ['synth', 'formants', index, 'hz'], min: 100, max: 8000, step: 10, log: true, unit: 'Hz' },
  { group: 'フォルマント', label: `${name} 利得`, path: ['synth', 'formants', index, 'gainDb'], min: -40, max: 30, step: 0.5, unit: 'dB' },
  { group: 'フォルマント', label: `${name} Q`, path: ['synth', 'formants', index, 'q'], min: 0.3, max: 10, step: 0.1 },
];

export const CONTROLS: readonly Control[] = [
  { group: '窓（パルスの形）', label: '羽根車の窓の幅', path: ['synth', 'rotorWidth'], min: 0.03, max: 0.5, step: 0.005 },
  { group: '窓（パルスの形）', label: '窓孔の幅', path: ['synth', 'windowWidth'], min: 0.03, max: 0.5, step: 0.005 },
  { group: '窓（パルスの形）', label: '縁のぼけ', path: ['synth', 'edgeBlur'], min: 0, max: 0.2, step: 0.005 },
  { group: '窓（パルスの形）', label: '漏れ', path: ['synth', 'leak'], min: 0, max: 0.3, step: 0.005 },
  { group: '音量・高域・雑音', label: '音量', path: ['synth', 'gain'], min: 0.02, max: 0.4, step: 0.005 },
  { group: '音量・高域・雑音', label: '放射のローパス', path: ['synth', 'radiationCutoffHz'], min: 200, max: 16000, step: 50, log: true, unit: 'Hz' },
  { group: '音量・高域・雑音', label: '気流の雑音の量', path: ['synth', 'jet'], min: 0, max: 2, step: 0.01 },
  { group: '音量・高域・雑音', label: '気流の雑音のローパス', path: ['synth', 'jetCutoffHz'], min: 200, max: 16000, step: 50, log: true, unit: 'Hz' },
  ...formantControls(0, '山'),
  ...formantControls(1, '谷'),
  ...formantControls(2, '追加'),
  { group: '開閉カバー', label: '停止位置', path: ['cover', 'restAngle'], min: 0.5, max: 1, step: 0.01 },
  { group: '開閉カバー', label: '揺れの振動数', path: ['cover', 'bounceHz'], min: 2, max: 15, step: 0.05, unit: 'Hz' },
  { group: '開閉カバー', label: '揺れの減衰比', path: ['cover', 'bounceDamping'], min: 0.02, max: 1, step: 0.005 },
  { group: '開閉カバー', label: 'ストッパーの反発', path: ['cover', 'stopRestitution'], min: 0, max: 1, step: 0.005 },
  { group: '開閉カバー', label: '停止位置のずれ', path: ['cover', 'wander'], min: 0, max: 0.15, step: 0.005 },
  { group: '開閉カバー', label: '閉じる時間', path: ['cover', 'closeTime'], min: 0.01, max: 0.3, step: 0.005, unit: 's' },
  { group: '開閉カバー', label: '圧の山', path: ['cover', 'surge'], min: 0, max: 1.5, step: 0.01 },
  { group: '開閉カバー', label: '圧の山が抜ける時定数', path: ['cover', 'surgeReleaseSec'], min: 0.02, max: 1, step: 0.01, unit: 's' },
  { group: '開閉カバー', label: '圧がたまる時定数', path: ['cover', 'surgeFillSec'], min: 0.005, max: 0.5, step: 0.005, unit: 's' },
];

export function getAt(root: unknown, path: Path): number {
  let v: unknown = root;
  for (const key of path) v = (v as Record<string | number, unknown>)[key];
  return v as number;
}

/** path の位置の値だけを差し替えた新しいオブジェクトを返す（元は変えない）。 */
export function setAt<T>(root: T, path: Path, value: number): T {
  const [head, ...rest] = path;
  if (head === undefined) return value as T;
  const child = setAt((root as Record<string | number, unknown>)[head], rest, value);
  if (Array.isArray(root)) {
    const copy = [...root];
    copy[head as number] = child;
    return copy as T;
  }
  return { ...root, [head]: child };
}

/** 既定値と違う値だけを取り出す（フォルマントは 1 つでも違えば配列ごと）。貼り付けて共有するためのもの。 */
export function diffTuning(tuning: Tuning, base: Tuning = DEFAULT_TUNING): { synth?: Partial<SynthParams>; cover?: Partial<CoverParams> } {
  const pick = <T extends object>(a: T, b: T): Partial<T> | undefined => {
    const out: Partial<T> = {};
    for (const key of Object.keys(a) as (keyof T)[]) {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out[key] = a[key];
    }
    return Object.keys(out).length ? out : undefined;
  };
  const synth = pick(tuning.synth, base.synth);
  const cover = pick(tuning.cover, base.cover);
  return { ...(synth ? { synth } : {}), ...(cover ? { cover } : {}) };
}

/** 保存してあった差分を既定値に重ねる。壊れた値・範囲外の値は捨てる。 */
export function applyDiff(diff: unknown, base: Tuning = DEFAULT_TUNING): Tuning {
  let tuning = base;
  for (const c of CONTROLS) {
    let v: unknown = diff;
    for (const key of c.path) v = v === null || typeof v !== 'object' ? undefined : (v as Record<string | number, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= c.min && v <= c.max) tuning = setAt(tuning, c.path, v);
  }
  return tuning;
}

const STORAGE_KEY = 'music-siren-tuning-v1';

function load(): Tuning {
  try {
    return applyDiff(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return DEFAULT_TUNING;
  }
}

function save(tuning: Tuning): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diffTuning(tuning)));
  } catch {
    // 保存できなくても調整は続けられる。
  }
}

const digits = (step: number): number => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
const snap = (c: Control, v: number): number => Math.min(c.max, Math.max(c.min, Number((Math.round(v / c.step) * c.step).toFixed(6))));
const SLIDER_STEPS = 1000;
const toSlider = (c: Control, v: number): number =>
  Math.round((c.log ? Math.log(v / c.min) / Math.log(c.max / c.min) : (v - c.min) / (c.max - c.min)) * SLIDER_STEPS);
const fromSlider = (c: Control, pos: number): number => {
  const x = pos / SLIDER_STEPS;
  return snap(c, c.log ? c.min * (c.max / c.min) ** x : c.min + (c.max - c.min) * x);
};

/**
 * パネルを root の中に作る。値が変わるたびに onChange を呼ぶ。保存してあった値を返すので、
 * 呼び出し側は最初にそれを適用する。
 */
export function createTuningPanel(root: HTMLElement, onChange: (tuning: Tuning) => void): Tuning {
  let tuning = load();
  const rows: { control: Control; slider: HTMLInputElement; number: HTMLInputElement; row: HTMLElement }[] = [];
  const output = document.createElement('pre');
  output.className = 'tuning-output';

  const refresh = (): void => {
    for (const { control, slider, number, row } of rows) {
      const v = getAt(tuning, control.path);
      slider.value = String(toSlider(control, v));
      if (document.activeElement !== number) number.value = v.toFixed(digits(control.step));
      row.classList.toggle('changed', v !== getAt(DEFAULT_TUNING, control.path));
    }
    const diff = diffTuning(tuning);
    output.textContent = Object.keys(diff).length ? JSON.stringify(diff, null, 2) : '（既定値のまま）';
  };
  const set = (control: Control, value: number): void => {
    if (!Number.isFinite(value)) return;
    tuning = setAt(tuning, control.path, snap(control, value));
    save(tuning);
    refresh();
    onChange(tuning);
  };

  let group: HTMLElement | null = null;
  let groupName = '';
  for (const control of CONTROLS) {
    if (control.group !== groupName) {
      groupName = control.group;
      group = document.createElement('div');
      group.className = 'tuning-group';
      const title = document.createElement('h3');
      title.textContent = groupName;
      group.append(title);
      root.append(group);
    }
    const row = document.createElement('label');
    row.className = 'tuning-row';
    const name = document.createElement('span');
    name.textContent = control.unit ? `${control.label} [${control.unit}]` : control.label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(SLIDER_STEPS);
    slider.step = '1';
    slider.addEventListener('input', () => set(control, fromSlider(control, Number(slider.value))));
    // ダブルクリックでその項目だけ既定値に戻す。
    slider.addEventListener('dblclick', () => set(control, getAt(DEFAULT_TUNING, control.path)));
    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(control.min);
    number.max = String(control.max);
    number.step = String(control.step);
    number.addEventListener('change', () => set(control, Number(number.value)));
    row.append(name, slider, number);
    group?.append(row);
    rows.push({ control, slider, number, row });
  }

  const buttons = document.createElement('div');
  buttons.className = 'tuning-buttons';
  const reset = document.createElement('button');
  reset.textContent = '全部を既定値に戻す';
  reset.addEventListener('click', () => {
    tuning = DEFAULT_TUNING;
    save(tuning);
    refresh();
    onChange(tuning);
  });
  const copy = document.createElement('button');
  copy.textContent = '変更した値をコピー';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(JSON.stringify(diffTuning(tuning), null, 2)).then(() => {
      copy.textContent = 'コピーした';
      setTimeout(() => (copy.textContent = '変更した値をコピー'), 1200);
    });
  });
  buttons.append(copy, reset);
  const note = document.createElement('small');
  note.textContent = '変更した項目は色が付く。スライダーのダブルクリックでその項目だけ戻る。値はこのブラウザに保存される。';
  root.append(buttons, note, output);

  refresh();
  return tuning;
}
