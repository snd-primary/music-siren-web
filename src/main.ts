// 当面は、配列表（公称値）を機構モデルから再現して表示するだけの画面。
// 音響（AudioWorklet）と 3D（Three.js）は mechanism/ の状態を読む形で後から載せる。
import { buildMachine } from './mechanism/machine';
import { formatDegree } from './mechanism/degree';
import { machineFrequencies, type DriveState } from './mechanism/pitch';
import { ratioToString } from './mechanism/ratio';
import { PRESETS } from './presets';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app が見つからない');

const drives: readonly DriveState[] = [
  { supplyHz: 60, poles: 2, slip: 0 },
  { supplyHz: 50, poles: 2, slip: 0 },
];

for (const spec of PRESETS) {
  const machine = buildMachine(spec);
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = `${spec.name}（${spec.key.at60Hz} 調 / ${spec.key.at50Hz} 調）`;
  table.append(caption);

  const head = table.insertRow();
  for (const h of ['配置', '音階', 'ポート数', '軸', '変速比', '60Hz', '50Hz']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.append(th);
  }

  const freqs = drives.map((d) => machineFrequencies(machine, d));
  for (const siren of machine.sirens) {
    const shaft = machine.shafts.find((s) => s.id === siren.shaftId);
    const row = table.insertRow();
    const cells = [
      String(siren.index + 1),
      formatDegree(siren.degree),
      String(siren.ports),
      siren.shaftId,
      shaft ? ratioToString(shaft.ratio) : '?',
      ...freqs.map((f) => (f.get(siren.index) ?? 0).toFixed(1)),
    ];
    for (const c of cells) row.insertCell().textContent = c;
  }
  app.append(table);
}
