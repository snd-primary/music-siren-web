// 曲データ。数字譜（移動ド）で書き、機種の主音に合わせて鳴らす。
// 音の表記は mechanism/degree.ts と同じ："1".."7"、上のオクターブは "1^"（"i"）、下は "5_"。
// 保護期間の切れた曲だけを入れる。音曲カムの編曲は耳コピせず、8 音用に自分で編曲する。

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
  return events;
}

export function songLengthBeats(song: Song): number {
  return song.events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
}
