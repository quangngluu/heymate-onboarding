// A reply can carry two things: what she does, and what she says.
//
// The model writes the doing as *asterisked beats* inline with the dialogue.
// They read well, but they are stage directions: a voice engine reading them
// aloud breaks the illusion the beat was there to create. So the two are split
// once, here, and every consumer picks the half it needs — the log renders
// both, differently; the speech synthesiser only ever gets the spoken half.

export type Segment = { kind: 'beat' | 'speech'; text: string };

/** Longest an unterminated beat is allowed to run before we call it speech. */
const RUNAWAY_BEAT = 90;

/**
 * Where an unclosed beat ends.
 *
 * The model sometimes opens a beat and forgets the closing marker. Matching
 * pairs only would leave that text as speech, so the marker shows up on screen
 * and the voice reads the stage direction aloud. A beat is short and lower
 * case; the dialogue after it restarts with a capital. So the beat ends at
 * whichever comes first: a sentence terminator, a word that starts a new
 * sentence, or a length no real beat reaches.
 */
function unclosedBeatEnd(rest: string): number {
  const stop = rest.search(/[.!?…]/);
  const capital = rest.slice(1).search(/\s\p{Lu}/u);
  const ends = [
    stop === -1 ? Infinity : stop + 1,
    capital === -1 ? Infinity : capital + 1,
    RUNAWAY_BEAT,
    rest.length,
  ];
  return Math.min(...ends);
}

/** Split a line into her actions and her words, in order, dropping blanks. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const push = (kind: Segment['kind'], raw: string) => {
    // Any marker that survived parsing is noise: never render it, never say it.
    const t = raw.replace(/\*/g, '').trim();
    if (t) out.push({ kind, text: t });
  };

  let i = 0;
  let last = 0;
  while (i < text.length) {
    if (text[i] !== '*') {
      i++;
      continue;
    }
    let open = i;
    while (text[open] === '*') open++;
    const close = text.indexOf('*', open);
    const end = close === -1 ? open + unclosedBeatEnd(text.slice(open)) : close;

    push('speech', text.slice(last, i));
    push('beat', text.slice(open, end));

    i = end;
    while (text[i] === '*') i++;
    last = i;
  }
  push('speech', text.slice(last));

  const all = out.length ? out : [{ kind: 'speech' as const, text: text.replace(/\*/g, '').trim() }];
  return all.flatMap((seg) => (seg.kind === 'speech' ? chunk(seg.text) : [seg]));
}

/**
 * One long paragraph in a single bubble reads as a wall. Someone talking to
 * you sends a couple of sentences, then a couple more. Split on sentence
 * boundaries, keeping very short sentences with the one that follows so a
 * two-word line never gets a bubble of its own.
 */
const MIN_CHUNK = 34;
const MAX_CHUNK = 150;

function chunk(text: string): Segment[] {
  // The terminator has to be followed by a space or the end of the line, or
  // "chậm lại 0.3 giây" becomes two bubbles split through the number.
  const sentences = text.match(/[\s\S]*?(?:[.!?\u2026]+(?=\s|$)|$)/g)?.filter((s) => s.trim()) ?? [text];
  const out: Segment[] = [];
  let buf = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const next = buf ? `${buf} ${s}` : s;
    if (buf && next.length > MAX_CHUNK) {
      out.push({ kind: 'speech', text: buf });
      buf = s;
    } else {
      buf = next;
    }
    if (buf.length >= MIN_CHUNK) {
      out.push({ kind: 'speech', text: buf });
      buf = '';
    }
  }
  if (buf) {
    // A trailing scrap joins the previous bubble rather than standing alone.
    if (out.length && buf.length < MIN_CHUNK) out[out.length - 1].text += ` ${buf}`;
    else out.push({ kind: 'speech', text: buf });
  }
  return out.length ? out : [{ kind: 'speech', text }];
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

// ---------------------------------------------------------------------------
// Delivery
//
// A beat is dropped from the spoken half, which leaves the two halves of a
// line running together with no gap where the action happened. That is why
// delivery sounds flat even when the writing is not. MiniMax gives us the
// three things needed to put the moment back: `<#s#>` pauses, interjection
// tags on the 2.8 models, and an emotion on the voice. All three are derived
// from what the writer already wrote, so nobody has to annotate anything.

/** Interjections MiniMax renders as sound rather than words. */
const SOUNDS: [RegExp, string][] = [
  [/\b(cười (phá|lớn|ph[aá] l[eê]n))|bật cười to/i, '(laughs)'],
  [/cười|khúc khích|nhếch mép/i, '(chuckle)'],
  [/thở dài|thở hắt/i, '(sighs)'],
  [/hít (một )?hơi|hít vào/i, '(inhale)'],
  [/thở ra|buông hơi/i, '(exhale)'],
  [/hắng giọng|đằng hắng/i, '(clear-throat)'],
  [/\bho\b|ho khan/i, '(coughs)'],
  [/ngân nga|hát khẽ|ậm ừ/i, '(humming)'],
  [/nín thở|hụt hơi|nghẹn/i, '(gasps)'],
  [/khịt mũi/i, '(sniffs)'],
  [/\bừm\b|ậm/i, '(emm)'],
];

/** What a beat says about how the next line should land. */
const FEELINGS: [RegExp, string][] = [
  [/cười|tủm tỉm|nheo mắt|trêu|nhếch mép/i, 'happy'],
  [/thở dài|cúi (đầu|mặt)|lặng|buồn|khẽ nói/i, 'sad'],
  [/nhíu mày|siết|gắt|lườm/i, 'angry'],
  [/nhướn mày|khựng|sững|tròn mắt|ngẩng phắt/i, 'surprised'],
];

export type Delivery = { text: string; emotion?: string };

function match(table: [RegExp, string][], beat: string): string | undefined {
  for (const [re, value] of table) if (re.test(beat)) return value;
  return undefined;
}

/**
 * Turn a written reply into something a voice can perform: the spoken half,
 * with a breath where each action happened, the action rendered as a sound
 * when it makes one, and an emotion taken from the first beat that names one.
 *
 * `mood` is the session setting, used when no beat says otherwise.
 */
export function delivery(raw: string, mood?: string): Delivery {
  const parts: string[] = [];
  let emotion: string | undefined;

  for (const seg of segments(raw)) {
    if (seg.kind === 'speech') {
      parts.push(seg.text);
      continue;
    }
    emotion ??= match(FEELINGS, seg.text);
    const sound = match(SOUNDS, seg.text);
    // The action itself takes a moment, whether or not it makes a noise.
    parts.push(sound ? `${sound}<#0.25#>` : '<#0.4#>');
  }

  return {
    // A short rest between sentences matches the rhythm of the bubbles
    // arriving one after another on screen.
    text: parts.join(' ').replace(/([.!?…])\s+(?=\S)/g, '$1<#0.22#> ').trim(),
    emotion: emotion ?? MOOD_FEELING[mood ?? ''],
  };
}

const MOOD_FEELING: Record<string, string | undefined> = {
  calm: 'calm',
  playful: 'happy',
  caring: 'calm',
  energetic: 'happy',
  serious: 'fluent',
};
