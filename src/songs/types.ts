// 曲データ。数字譜（移動ド）で書き、機種の主音に合わせて鳴らす。
// 音の表記は mechanism/degree.ts と同じ："1".."7"、上のオクターブは "1^"（"i"）、下は "5_"。
// 保護期間の切れた曲だけを入れる。音曲カムの編曲は耳コピせず、8 音用に自分で編曲する。
// 和音は声部の重ね合わせで書く（parseVoices）。同時に始まって終わるだけなら "[1 3 5]/2" でもよい
// （docs/adr/0011-songs-as-voices.md）。

export interface NoteEvent {
  /** 音階。 */
  readonly degree: string;
  /** 開始位置 [拍]。 */
  readonly start: number;
  /** 長さ [拍]。 */
  readonly duration: number;
}

export interface Song {
  readonly id: string;
  readonly title: string;
  readonly composer: string;
  /** 出典や編曲のメモ。 */
  readonly note: string;
  /** 1 分あたりの拍数。 */
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly events: readonly NoteEvent[];
}

/** 数字譜の文字列から NoteEvent を作る簡易記法。
 *  トークンは「音 [/長さ]」。長さは拍数（省略時 1）。"-" は休符（長さ指定可）。"|" は小節線で無視する。
 *  例： "3 5 5/2 | 3 2 1/2 | 2 3 5 3 | 2/4"
 *  和音は "[1 3 5]/2" のように角括弧でまとめる。 */
export function parseScore(text: string): NoteEvent[] {
  return parseScoreWithLength(text).events;
}

/** parseScore と同じだが、休符を含めた全体の長さ [拍] も返す。 */
export function parseScoreWithLength(text: string): { events: NoteEvent[]; beats: number } {
  const events: NoteEvent[] = [];
  let t = 0;
  const tokens = text
    .replace(/\|/g, ' ')
    .split(/\s+/)
    .filter((s) => s.length > 0);
  let chord: string[] | null = null;
  for (const raw of tokens) {
    let tok = raw;
    if (tok.startsWith('[')) {
      chord = [];
      tok = tok.slice(1);
    }
    let closes = false;
    let lenText = '';
    const slash = tok.indexOf('/');
    if (slash >= 0) {
      lenText = tok.slice(slash + 1);
      tok = tok.slice(0, slash);
    }
    if (tok.endsWith(']')) {
      closes = true;
      tok = tok.slice(0, -1);
    }
    if (chord) {
      if (tok !== '-' && tok.length > 0) chord.push(tok);
      if (closes) {
        const duration = lenText ? Number(lenText) : 1;
        if (!(duration > 0)) throw new RangeError(`長さが不正: ${raw}`);
        for (const degree of chord) events.push({ degree, start: t, duration });
        t += duration;
        chord = null;
      }
      continue;
    }
    const duration = lenText ? Number(lenText) : 1;
    if (!(duration > 0)) throw new RangeError(`長さが不正: ${raw}`);
    if (tok !== '-') events.push({ degree: tok, start: t, duration });
    t += duration;
  }
  if (chord) throw new RangeError('和音の括弧が閉じていない');
  return { events, beats: t };
}

/**
 * 声部を重ねて 1 曲にする。各声部は parseScore の記法で、休符を含めた長さ（拍数）が揃っていること。
 * 例：parseVoices(`3 5 5/2 | 3 2 1/2`, `1/2 3/2 | 5/2 3/2`)
 * 旋律が動く下で別の音を伸ばす、のように "[...]" では書けない和声を書くのに使う。
 */
export function parseVoices(...voices: string[]): NoteEvent[] {
  const parsed = voices.map(parseScoreWithLength);
  const beats = parsed[0]?.beats ?? 0;
  parsed.forEach((v, i) => {
    if (Math.abs(v.beats - beats) > 1e-9) throw new RangeError(`声部 ${i + 1} の長さ ${v.beats} 拍が、声部 1 の ${beats} 拍と違う`);
  });
  return parsed.flatMap((v) => v.events).sort((a, b) => a.start - b.start);
}

/** 同じ音が、別の声部などで時間的に重なっているところ（同じサイレンなので鳴り分けられない）。 */
export function unisonOverlaps(events: readonly NoteEvent[]): { degree: string; start: number }[] {
  const out: { degree: string; start: number }[] = [];
  const sorted = [...events].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i] as NoteEvent;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j] as NoteEvent;
      if (b.start >= a.start + a.duration) break;
      if (b.degree === a.degree) out.push({ degree: a.degree, start: b.start });
    }
  }
  return out;
}

/** 同時に鳴っている音の数の最大。 */
export function maxPolyphony(events: readonly NoteEvent[]): number {
  const edges = events.flatMap((e) => [
    { t: e.start, d: 1 },
    { t: e.start + e.duration, d: -1 },
  ]);
  // 同じ時刻なら、終わりを先に数える（つながった音を重ねて数えない）
  edges.sort((a, b) => a.t - b.t || a.d - b.d);
  let n = 0;
  let max = 0;
  for (const e of edges) {
    n += e.d;
    max = Math.max(max, n);
  }
  return max;
}

export function songLengthBeats(song: Song): number {
  return song.events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
}
