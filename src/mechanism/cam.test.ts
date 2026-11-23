import { describe, expect, it } from 'vitest';
import { buildMachine } from './machine';
import { camKeysAt, compileSong, missingDegrees } from './cam';
import { AUTO_IDLE, DEFAULT_AUTO_PARAMS, skipLeadIn, startAuto, stepAutoplay } from './autoplay';
import { degreeKey } from './degree';
import { PRESETS } from '../presets';
import { SONGS } from '../songs';
import { maxPolyphony, parseScore, parseVoices, songLengthBeats, unisonOverlaps } from '../songs/types';
import { IEJI } from '../songs/ieji';
import { FURUSATO } from '../songs/furusato';

const iga = buildMachine(PRESETS[0]!);

describe('数字譜の記法', () => {
  it('音と長さと休符と小節線', () => {
    expect(parseScore('3 5 5/2 | - 1/0.5')).toEqual([
      { degree: '3', start: 0, duration: 1 },
      { degree: '5', start: 1, duration: 1 },
      { degree: '5', start: 2, duration: 2 },
      { degree: '1', start: 5, duration: 0.5 },
    ]);
  });
  it('和音', () => {
    expect(parseScore('[1 3 5]/2 i')).toEqual([
      { degree: '1', start: 0, duration: 2 },
      { degree: '3', start: 0, duration: 2 },
      { degree: '5', start: 0, duration: 2 },
      { degree: 'i', start: 2, duration: 1 },
    ]);
  });
  it('声部の重ね合わせ：旋律が動く下で別の音を伸ばせる', () => {
    expect(parseVoices('3 5 5/2', '1/4')).toEqual([
      { degree: '3', start: 0, duration: 1 },
      { degree: '1', start: 0, duration: 4 },
      { degree: '5', start: 1, duration: 1 },
      { degree: '5', start: 2, duration: 2 },
    ]);
  });
  it('声部の長さ（休符込みの拍数）が違えば拒否', () => {
    expect(() => parseVoices('1 2 3', '1/2')).toThrow(/声部 2/);
    expect(() => parseVoices('1 2 -', '1/3')).not.toThrow();
  });
  it('同じ音の重なりと、同時に鳴る数を数える', () => {
    expect(unisonOverlaps(parseVoices('3 5', '- 5'))).toEqual([{ degree: '5', start: 1 }]);
    expect(unisonOverlaps(parseVoices('3 5', '5 3'))).toEqual([]);
    expect(maxPolyphony(parseVoices('1 2 3', '5/3', 'i - -'))).toBe(3);
    expect(maxPolyphony(parseScore('1 2 3'))).toBe(1);
  });
    it('不正な長さは拒否', () => {
    expect(() => parseScore('1/0')).toThrow();
  });
});

describe('曲データ', () => {
  it.each(SONGS)('$title は伊賀機（1〜i）で鳴らせる', (song) => {
    expect(missingDegrees(song, iga)).toEqual([]);
    expect(song.events.length).toBeGreaterThan(10);
    expect(songLengthBeats(song)).toBeGreaterThan(8);
  });
  it.each(SONGS)('$title：同じ音（同じサイレン）を声部どうしで重ねない', (song) => {
    expect(unisonOverlaps(song.events)).toEqual([]);
  });
  it.each(SONGS)('$title：同時に鳴るのは 3 音まで（伊賀の映像の家路では 2〜3 音）', (song) => {
    expect(maxPolyphony(song.events)).toBeLessThanOrEqual(3);
  });
  it('ふるさとは 3/4 拍子の 16 小節（＋余韻 1 小節）で、2 声', () => {
    expect(songLengthBeats(FURUSATO)).toBe(47); // 16 小節目の 2 拍目まで
    expect(maxPolyphony(FURUSATO.events)).toBe(2);
    // 伊賀機に無い低い 5̣・7̣ はオクターブ上に移してある
    expect(missingDegrees(FURUSATO, iga)).toEqual([]);
  });
  it('家路は和音で鳴る（2 声）', () => {
    expect(maxPolyphony(IEJI.events)).toBe(2);
    const prog = compileSong(IEJI, iga);
    let chordSec = 0;
    for (let t = 0; t < prog.durationSec; t += 0.01) if (camKeysAt(prog, iga.sirens.length, t).filter(Boolean).length >= 2) chordSec += 0.01;
    expect(chordSec / prog.durationSec).toBeGreaterThan(0.8);
  });
    it('下の 5̣ を使う曲は伊賀機では鳴らせない', () => {
    const song = { ...SONGS[0]!, events: parseScore('5_ 1') };
    expect(missingDegrees(song, iga)).toEqual(['5_']);
    expect(() => compileSong(song, iga)).toThrow(/5_/);
    const m10a = buildMachine(PRESETS.find((p) => p.id === '10a')!);
    expect(missingDegrees(song, m10a)).toEqual([]);
  });
});

describe('音曲カム', () => {
  it('曲をサイレンごとの通電区間に直す', () => {
    const song = { ...SONGS[0]!, bpm: 60, events: parseScore('1 1 3/2 | 1') };
    const prog = compileSong(song, iga, { releaseSec: 0.1 });
    const idx1 = iga.sirens.find((s) => degreeKey(s.degree) === '1')!.index;
    const idx3 = iga.sirens.find((s) => degreeKey(s.degree) === '3')!.index;
    expect(prog.durationSec).toBe(5);
    const t1 = prog.tracks.find((t) => t.sirenIndex === idx1)!;
    const t3 = prog.tracks.find((t) => t.sirenIndex === idx3)!;
    expect(t1.segments).toEqual([
      [0, 0.9],
      [1, 1.9],
      [4, 4.9],
    ]);
    expect(t3.segments).toEqual([[2, 3.9]]);
    expect(camKeysAt(prog, iga.sirens.length, 0.5)[idx1]).toBe(true);
    expect(camKeysAt(prog, iga.sirens.length, 0.95)[idx1]).toBe(false);
    expect(camKeysAt(prog, iga.sirens.length, 2.5)[idx3]).toBe(true);
    expect(camKeysAt(prog, iga.sirens.length, 2.5).filter(Boolean)).toHaveLength(1);
  });
});

describe('自動運転', () => {
  it('起動 → 待ち → 演奏 → 停止 → 待機、の順に進む', () => {
    const song = { ...SONGS[0]!, bpm: 60, events: parseScore('1/2') };
    const prog = compileSong(song, iga);
    const P = DEFAULT_AUTO_PARAMS;
    let st = startAuto();
    const dt = 0.1;
    const n = iga.sirens.length;
    const idx1 = iga.sirens.find((s) => degreeKey(s.degree) === '1')!.index;
    // 待ち：通電、鍵なし
    let r = stepAutoplay(st, prog, n, P, dt, false);
    expect(r.input.power).toBe(true);
    expect(r.input.keys.some(Boolean)).toBe(false);
    st = r.state;
    for (let t = dt; t < P.leadInSec + 0.05; t += dt) st = stepAutoplay(st, prog, n, P, dt, false).state;
    expect(st.phase).toBe('playing');
    // 演奏：1 が鳴る
    r = stepAutoplay(st, prog, n, P, dt, false);
    expect(r.input.keys[idx1]).toBe(true);
    st = r.state;
    for (let t = 0; t < prog.durationSec + P.tailSec + 0.2; t += dt) st = stepAutoplay(st, prog, n, P, dt, false).state;
    expect(st.phase).toBe('stopping');
    // 停止：電源断・ブレーキ。羽根車が止まったら待機へ
    r = stepAutoplay(st, prog, n, P, dt, false);
    expect(r.input.power).toBe(false);
    expect(r.input.brake).toBe(true);
    r = stepAutoplay(r.state, prog, n, P, dt, true);
    expect(r.state).toEqual(AUTO_IDLE);
    expect(r.input.brake).toBe(false);
  });

  it('待機中は何もしない。手動の鍵は重ねられる', () => {
    const r = stepAutoplay(AUTO_IDLE, null, 3, DEFAULT_AUTO_PARAMS, 0.1, true, [false, true, false]);
    expect(r.state).toEqual(AUTO_IDLE);
    expect(r.input).toEqual({ power: false, brake: false, keys: [false, true, false] });
  });
});

describe('開閉の速さの限界', () => {
  it('収録曲は伊賀機で、同じサイレンを 1/3 秒より短い間隔で開き直さない（YMSHA：1秒に2〜3回まで）', () => {
    for (const song of SONGS) {
      const program = compileSong(song, iga);
      for (const track of program.tracks) {
        for (let k = 1; k < track.segments.length; k += 1) {
          const gap = track.segments[k]![0] - track.segments[k - 1]![0];
          expect(gap, `${song.id} siren ${track.sirenIndex} at ${track.segments[k]![0].toFixed(2)}s`).toBeGreaterThanOrEqual(1 / 3);
        }
      }
    }
  });
});

describe('自動運転の待ち時間', () => {
  it('伊賀機は、演奏が始まるまでに定常回転数の 99% に達している', async () => {
    const { DEFAULT_DRIVE_PARAMS, INITIAL_DRIVE_STATE, stepDrive, steadyStateRps } = await import('./drive');
    let s = INITIAL_DRIVE_STATE;
    const dt = 0.001;
    for (let t = 0; t < DEFAULT_AUTO_PARAMS.leadInSec; t += dt) s = stepDrive(s, { power: true, brake: false, openSum: 0 }, DEFAULT_DRIVE_PARAMS, dt);
    expect(s.rps / steadyStateRps(DEFAULT_DRIVE_PARAMS)).toBeGreaterThan(0.99);
  });
});

describe('デバッグ用：起動待ちを飛ばす', () => {
  it('起動待ち中なら演奏の頭に飛び、それ以外の段階は変えない', () => {
    expect(skipLeadIn({ phase: 'starting', t: 3 })).toEqual({ phase: 'playing', t: 0 });
    expect(skipLeadIn({ phase: 'playing', t: 5 })).toEqual({ phase: 'playing', t: 5 });
    expect(skipLeadIn(AUTO_IDLE)).toEqual(AUTO_IDLE);
  });
});
