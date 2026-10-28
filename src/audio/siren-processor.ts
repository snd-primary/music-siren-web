/// <reference path="./worklet-globals.d.ts" />
// AudioWorklet 側。メインスレッドから機構の状態（モーター回転数、各カバーの開度）を受け取り、
// SirenSynth で毎サンプル合成する。設定（サイレンの構成）も message で受け取る。
import { SirenSynth, type SynthConfig, type SynthTarget } from './synth';

export type ProcessorMessage =
  | { readonly type: 'config'; readonly config: Omit<SynthConfig, 'sampleRate'> }
  | { readonly type: 'target'; readonly target: SynthTarget };

class SirenProcessor extends AudioWorkletProcessor {
  private synth: SirenSynth | null = null;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<ProcessorMessage>) => {
      const msg = e.data;
      if (msg.type === 'config') this.synth = new SirenSynth({ ...msg.config, sampleRate });
      else if (msg.type === 'target') this.synth?.setTarget(msg.target);
    };
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    const first = channels?.[0];
    if (!first) return true;
    if (this.synth) this.synth.render(first);
    else first.fill(0);
    for (let c = 1; c < channels.length; c += 1) channels[c]?.set(first);
    return true;
  }
}

registerProcessor('music-siren', SirenProcessor);
