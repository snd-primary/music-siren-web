// 音曲カム。カムドラムが 1 回転する間に、各サイレンのマグネット回路をブラッシで断続する。
// 曲（数字譜）を機種に当てはめて「サイレンごとの通電区間」に直す。純粋関数。

import { degreeKey, parseDegree } from './degree';
import type { Machine } from './machine';
import type { Song } from '../songs/types';

export interface CamTrack {
  readonly sirenIndex: number;
  /** 通電区間 [開始秒, 終了秒] の列（昇順、重ならない）。 */
  readonly segments: readonly (readonly [number, number])[];
}

export interface CamProgram {
  readonly songId: string;
  /** 曲の長さ [s]（最後の音の終わりまで）。 */
  readonly durationSec: number;
  readonly tracks: readonly CamTrack[];
}

export interface CamOptions {
  /** 音の終わりで、次の音の前に切る時間 [s]。同じ音の連打を区切る。 */
  readonly releaseSec: number;
}

export const DEFAULT_CAM_OPTIONS: CamOptions = { releaseSec: 0.06 };

/** 曲をこの機種で鳴らせるか。鳴らせない音階を返す（空なら鳴らせる）。 */
export function missingDegrees(song: Song, machine: Machine): string[] {
  const have = new Set(machine.sirens.map((s) => degreeKey(s.degree)));
  const missing = new Set<string>();
  for (const e of song.events) {
    const key = degreeKey(parseDegree(e.degree));
    if (!have.has(key)) missing.add(key);
  }
  return [...missing];
}

export function compileSong(song: Song, machine: Machine, options: CamOptions = DEFAULT_CAM_OPTIONS): CamProgram {
  const missing = missingDegrees(song, machine);
  if (missing.length > 0) throw new RangeError(`${song.title}: この機種にない音 ${missing.join(', ')}`);
  const secPerBeat = 60 / song.bpm;
  const bySiren = new Map<number, [number, number][]>();
  for (const e of song.events) {
    const key = degreeKey(parseDegree(e.degree));
    const siren = machine.sirens.find((s) => degreeKey(s.degree) === key);
    if (!siren) continue;
    const on = e.start * secPerBeat;
    const off = Math.max(on + 0.02, (e.start + e.duration) * secPerBeat - options.releaseSec);
    const list = bySiren.get(siren.index) ?? [];
    list.push([on, off]);
    bySiren.set(siren.index, list);
  }
  const tracks: CamTrack[] = [...bySiren.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sirenIndex, segs]) => {
      segs.sort((a, b) => a[0] - b[0]);
      // 重なりは結合する
      const merged: [number, number][] = [];
      for (const seg of segs) {
        const last = merged[merged.length - 1];
        if (last && seg[0] <= last[1]) last[1] = Math.max(last[1], seg[1]);
        else merged.push([seg[0], seg[1]]);
      }
      return { sirenIndex, segments: merged };
    });
  const durationSec = song.events.reduce((m, e) => Math.max(m, (e.start + e.duration) * secPerBeat), 0);
  return { songId: song.id, durationSec, tracks };
}

/** 時刻 t [s] に通電しているサイレン。machine.sirens と同じ順。 */
export function camKeysAt(program: CamProgram, sirenCount: number, t: number): boolean[] {
  const keys = new Array<boolean>(sirenCount).fill(false);
  for (const track of program.tracks) {
    for (const [on, off] of track.segments) {
      if (t >= on && t < off) {
        keys[track.sirenIndex] = true;
        break;
      }
      if (on > t) break;
    }
  }
  return keys;
}
