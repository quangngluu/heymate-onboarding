// A reply can carry two things: what she does, and what she says.
//
// The model writes the doing as *asterisked beats* inline with the dialogue.
// They read well, but they are stage directions: a voice engine reading them
// aloud breaks the illusion the beat was there to create. So the two are split
// once, here, and every consumer picks the half it needs — the log renders
// both, differently; the speech synthesiser only ever gets the spoken half.

export type Segment = { kind: 'beat' | 'speech'; text: string };

const BEAT = /\*+([^*]+)\*+/g;

/** Split a line into her actions and her words, in order, dropping blanks. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(BEAT)) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ kind: 'speech', text: before });
    const beat = m[1].trim();
    if (beat) out.push({ kind: 'beat', text: beat });
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) out.push({ kind: 'speech', text: tail });
  return out.length ? out : [{ kind: 'speech', text: text.trim() }];
}

/**
 * The same split, cut off after `words` words counted across the whole line.
 * Used to uncover a reply gradually without re-deciding what is a beat.
 */
export function segmentsUpTo(text: string, words: number): Segment[] {
  let budget = words;
  const out: Segment[] = [];
  for (const seg of segments(text)) {
    if (budget <= 0) break;
    const parts = seg.text.split(/\s+/);
    if (parts.length <= budget) {
      out.push(seg);
      budget -= parts.length;
    } else {
      out.push({ kind: seg.kind, text: parts.slice(0, budget).join(' ') });
      budget = 0;
    }
  }
  return out;
}

/** Only what she says out loud. Empty when the line is pure action. */
export function spoken(text: string): string {
  return segments(text)
    .filter((s) => s.kind === 'speech')
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
