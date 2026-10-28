// メインスレッド側。AudioContext と AudioWorkletNode を用意し、機構の状態を Worklet に送る。
import processorUrl from './siren-processor.ts?worker&url';
import type { Machine } from '../mechanism/machine';
import { ratioToNumber } from '../mechanism/ratio';
import type { MachineState } from '../mechanism/simulation';
import type { ProcessorMessage } from './siren-processor';
import { DEFAULT_SYNTH } from './synth';

export class AudioEngine {
  private constructor(
    private readonly context: AudioContext,
    private readonly node: AudioWorkletNode,
  ) {}

  /** ユーザー操作のあとに呼ぶこと（自動再生の制限）。 */
  static async create(): Promise<AudioEngine> {
    const context = new AudioContext({ latencyHint: 'interactive' });
    await context.audioWorklet.addModule(processorUrl);
    const node = new AudioWorkletNode(context, 'music-siren', { numberOfInputs: 0, outputChannelCount: [1] });
    node.connect(context.destination);
    return new AudioEngine(context, node);
  }

  async resume(): Promise<void> {
    if (this.context.state !== 'running') await this.context.resume();
  }

  setMachine(machine: Machine, nominalRps: number): void {
    const msg: ProcessorMessage = {
      type: 'config',
      config: {
        ...DEFAULT_SYNTH,
        nominalRps,
        sirens: machine.sirens.map((s) => {
          const shaft = machine.shafts.find((sh) => sh.id === s.shaftId);
          return { ports: s.ports, ratio: shaft ? ratioToNumber(shaft.ratio) : 1 };
        }),
      },
    };
    this.node.port.postMessage(msg);
  }

  update(state: MachineState): void {
    const msg: ProcessorMessage = { type: 'target', target: { motorRps: state.drive.rps, covers: state.covers } };
    this.node.port.postMessage(msg);
  }
}
