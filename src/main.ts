// 画面。機構モデル（mechanism/）を requestAnimationFrame で進め、その状態を音響（audio/）に渡す。
// 3D（scene/）も同じ状態を読む予定。
import { AudioEngine } from './audio/engine';
import { formatDegree, degreeRatio } from './mechanism/degree';
import { buildMachine, type Machine } from './mechanism/machine';
import { machineFrequencies, nominalMotorRps, sirenFrequency } from './mechanism/pitch';
import { ratioToNumber, ratioToString } from './mechanism/ratio';
import {
  DEFAULT_MACHINE_PARAMS,
  initialMachineState,
  stepMachine,
  type MachineInput,
  type MachineParams,
  type MachineState,
} from './mechanism/simulation';
import { PRESETS } from './presets';
import { SirenScene } from './scene/scene';

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`見つからない: ${sel}`);
  return el;
};

const presetSelect = $<HTMLSelectElement>('#preset');
const supplySelect = $<HTMLSelectElement>('#supply');
const startButton = $<HTMLButtonElement>('#start');
const stopButton = $<HTMLButtonElement>('#stop');
const readout = $<HTMLElement>('#readout');
const keysBox = $<HTMLElement>('#keys');
const tablesBox = $<HTMLElement>('#tables');
const viewCanvas = $<HTMLCanvasElement>('#view');
const buildingCheck = $<HTMLInputElement>('#building');
const seeThroughCheck = $<HTMLInputElement>('#seethrough');

const KEYBOARD = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", ']'];

let machine: Machine = buildMachine(PRESETS[0]!);
let params: MachineParams = DEFAULT_MACHINE_PARAMS;
let state: MachineState = initialMachineState(machine);
let input: MachineInput = { power: false, brake: false, keys: machine.sirens.map(() => false) };
let engine: AudioEngine | null = null;
const view = new SirenScene(viewCanvas);
let keyButtons: HTMLButtonElement[] = [];
/** 鍵盤の並び（低い音から）→ サイレンの index。 */
let keyOrder: number[] = [];

function nominalRps(): number {
  return nominalMotorRps({ supplyHz: params.drive.supplyHz, poles: params.drive.poles, slip: 0 });
}

function setKey(sirenIndex: number, down: boolean): void {
  const keys = [...input.keys];
  if (keys[sirenIndex] === down) return;
  keys[sirenIndex] = down;
  input = { ...input, keys };
  const pos = keyOrder.indexOf(sirenIndex);
  keyButtons[pos]?.classList.toggle('down', down);
}

function rebuildMachine(): void {
  const spec = PRESETS.find((p) => p.id === presetSelect.value) ?? PRESETS[0]!;
  machine = buildMachine(spec);
  state = initialMachineState(machine);
  input = { power: false, brake: false, keys: machine.sirens.map(() => false) };
  startButton.disabled = false;
  stopButton.disabled = true;
  engine?.setMachine(machine, nominalRps());
  view.setMachine(machine);

  // 鍵盤：低い音から並べる。
  keyOrder = [...machine.sirens]
    .sort((a, b) => ratioToNumber(degreeRatio(a.degree)) - ratioToNumber(degreeRatio(b.degree)))
    .map((s) => s.index);
  keysBox.replaceChildren();
  keyButtons = keyOrder.map((index, pos) => {
    const siren = machine.sirens[index]!;
    const b = document.createElement('button');
    const hz = sirenFrequency(machine, siren, nominalRps());
    b.innerHTML = `<b>${formatDegree(siren.degree)}</b><i>${hz.toFixed(0)} Hz · ${KEYBOARD[pos] ?? ''}</i>`;
    const down = (e: Event) => {
      e.preventDefault();
      setKey(index, true);
    };
    const up = () => setKey(index, false);
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
    keysBox.append(b);
    return b;
  });
}

function renderTables(): void {
  tablesBox.replaceChildren();
  for (const spec of PRESETS) {
    const m = buildMachine(spec);
    const table = document.createElement('table');
    table.createCaption().textContent = `${spec.name}（${spec.key.at60Hz} 調 / ${spec.key.at50Hz} 調）`;
    const head = table.insertRow();
    for (const h of ['配置', '音階', 'ポート数', '軸', '変速比', '60Hz', '50Hz']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    }
    const f60 = machineFrequencies(m, nominalMotorRps({ supplyHz: 60, poles: 2, slip: 0 }));
    const f50 = machineFrequencies(m, nominalMotorRps({ supplyHz: 50, poles: 2, slip: 0 }));
    for (const s of m.sirens) {
      const shaft = m.shafts.find((sh) => sh.id === s.shaftId);
      const row = table.insertRow();
      for (const c of [
        String(s.index + 1),
        formatDegree(s.degree),
        String(s.ports),
        s.shaftId,
        shaft ? ratioToString(shaft.ratio) : '?',
        (f60.get(s.index) ?? 0).toFixed(1),
        (f50.get(s.index) ?? 0).toFixed(1),
      ]) {
        row.insertCell().textContent = c;
      }
    }
    tablesBox.append(table);
  }
}

async function start(): Promise<void> {
  if (!engine) {
    engine = await AudioEngine.create();
    engine.setMachine(machine, nominalRps());
  }
  await engine.resume();
  input = { ...input, power: true, brake: false };
  startButton.disabled = true;
  stopButton.disabled = false;
}

function stop(): void {
  // 実機は電源断で電磁ブレーキが効く。
  input = { ...input, power: false, brake: true };
  startButton.disabled = false;
  stopButton.disabled = true;
}

function updateReadout(): void {
  const rps = state.drive.rps;
  const steady = nominalRps() * (1 - params.drive.slip);
  const pct = steady > 0 ? (rps / steady) * 100 : 0;
  const mode = input.power ? '運転中' : input.brake && rps > 0 ? '制動中' : rps > 0 ? '惰性' : '停止中';
  readout.textContent = `${mode}  モーター ${rps.toFixed(1)} rps（定常の ${pct.toFixed(0)}%）`;
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  // 駆動系は 2 ms 刻みで安定に積分する。
  const sub = Math.max(1, Math.ceil(dt / 0.002));
  for (let i = 0; i < sub; i += 1) state = stepMachine(machine, state, input, params, dt / sub);
  if (state.drive.rps === 0 && input.brake) input = { ...input, brake: false };
  engine?.update(state);
  view.update(state);
  view.render();
  updateReadout();
  requestAnimationFrame(frame);
}

for (const spec of PRESETS) {
  const opt = document.createElement('option');
  opt.value = spec.id;
  opt.textContent = spec.name;
  presetSelect.append(opt);
}
presetSelect.addEventListener('change', rebuildMachine);
supplySelect.addEventListener('change', () => {
  params = { ...params, drive: { ...params.drive, supplyHz: Number(supplySelect.value) } };
  rebuildMachine();
});
startButton.addEventListener('click', () => void start());
stopButton.addEventListener('click', stop);
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const pos = KEYBOARD.indexOf(e.key);
  const index = keyOrder[pos];
  if (index !== undefined) {
    e.preventDefault();
    setKey(index, true);
  }
});
window.addEventListener('keyup', (e) => {
  const index = keyOrder[KEYBOARD.indexOf(e.key)];
  if (index !== undefined) setKey(index, false);
});
window.addEventListener('blur', () => {
  for (const i of keyOrder) setKey(i, false);
});

const applyViewOptions = () => view.setOptions({ showBuilding: buildingCheck.checked, seeThrough: seeThroughCheck.checked });
buildingCheck.addEventListener('change', applyViewOptions);
seeThroughCheck.addEventListener('change', applyViewOptions);
window.addEventListener('resize', () => view.resize());

rebuildMachine();
renderTables();
requestAnimationFrame(frame);
