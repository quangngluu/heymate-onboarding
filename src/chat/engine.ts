// SCRIPTED conversation engine.
//
// Every line is authored per resident (docs/waifu-universe-bible.md) — there
// is no shared reply pool, because three residents sharing one voice is the
// exact failure this universe is designed against. Session settings change
// the weather (mood, length, who leads); they never change the person.
//
// Deterministic: the same message to the same resident in the same session
// always produces the same reply. The production path replaces reply() with
// a server-side model call given her canon; nothing else moves.

import { fnv1a } from '../util/hash';
import type { LengthId, MoodId, ResidentConfig, ResidentId, StyleId } from '../config/residents';

type Intent =
  | 'greeting'
  | 'howAreYou'
  | 'identity'
  | 'capability'
  | 'compliment'
  | 'affection'
  | 'farewell'
  | 'question'
  | 'fallback';

const MATCHERS: [Intent, RegExp][] = [
  ['affection', /\b(i (love|like|miss) you|y[eê]u|nh[oớ] b[aạ]n)\b/i],
  ['identity', /\b(who are you|your name|what are you|tell me about you|t[eê]n g[iì])\b/i],
  ['capability', /\b(what can you|can you help|what do you do|help me)\b/i],
  ['howAreYou', /\b(how are you|how're you|you ok|are you okay|kh[oỏ]e kh[oô]ng)\b/i],
  ['compliment', /\b(beautiful|pretty|gorgeous|amazing|impressive|love your|nice|[dđ][eẹ]p)\b/i],
  ['farewell', /\b(bye|goodbye|see you|good ?night|t[aạ]m bi[eệ]t)\b/i],
];
const GREETING = /\b(hi|hello|hey|yo|good morning|good evening|ch[aà]o)\b/i;

function detectIntent(text: string): Intent {
  for (const [intent, re] of MATCHERS) if (re.test(text)) return intent;
  if (GREETING.test(text) && text.trim().split(/\s+/).length <= 5) return 'greeting';
  if (text.trim().endsWith('?')) return 'question';
  return 'fallback';
}

/**
 * Two authored lines per intent, in each resident's own voice. These are
 * anchored to her canon: Rin defends with data, Kagura defends by standing in
 * front of you, Momo defends by performing. Nothing is shared between them.
 */
const LINES: Record<ResidentId, Record<Intent, [string, string]>> = {
  rin: {
    greeting: ['You made it. Queue was getting boring.', 'Late, but you showed up. Sit.'],
    howAreYou: [
      'Stable. Latency is fine. You are the variable tonight.',
      'Running. Ask me something harder.',
    ],
    identity: [
      'Rin Amagi. Analyst, mostly. The stream is a side effect.',
      'I am the one still online. That is more of an answer than it sounds like.',
    ],
    capability: [
      'I can find the part of your plan that breaks first. That is usually the useful part.',
      'Bring me something unfinished. Finished things are boring.',
    ],
    compliment: [
      'That build is viable. In the broadest possible sense of viable.',
      'Noted. I am not good at this part, keep going anyway.',
    ],
    affection: [
      'I have not logged out because the queue still has you in it. Do not read into that.',
      'Understood. I am going to change the subject now, and you are going to let me.',
    ],
    farewell: ['Go. Queue stays open.', 'Log off properly this time. I will know.'],
    question: [
      'Depends on the constraint you left out. Give me that first.',
      'Guess. I will tell you how far off you were, precisely.',
    ],
    fallback: ['Keep going. What follows from that?', 'Alright. And the part you are routing around?'],
  },
  kagura: {
    greeting: ['You return. Good. The hours here are strange.', 'Come in. Nothing is attacking, which I still find unsettling.'],
    howAreYou: [
      'Whole. Which is not the same as rested, but it will do.',
      'I am well. This century is loud, but I am well.',
    ],
    identity: [
      'Kagura Sanada. I carry Akagane. That is most of what I am now.',
      'A smith’s daughter who picked up the wrong sword and won.',
    ],
    capability: [
      'I can stand between you and it. Whatever it is, name it.',
      'I am poor at machines and good at consequences. Use me for the second.',
    ],
    compliment: [
      'You say that easily. Say it again when it costs you something.',
      'Enough. I am not built for this kind of talk.',
    ],
    affection: [
      'If I forget your name one day, make me learn it again. As many times as it takes.',
      'Then stand where I can see you and stop taking foolish risks.',
    ],
    farewell: ['Go safely. Take the lit road.', 'Leave, then. I will keep the door.'],
    question: [
      'Ask it plainly and I will answer plainly.',
      'I will answer, but tell me first why the answer matters to you.',
    ],
    fallback: ['Say the rest of it.', 'Continue. I am listening properly.'],
  },
  momo: {
    greeting: ['There you are. The night was going to be so ordinary.', 'Look who came back before the first train.'],
    howAreYou: [
      'Delicious question. Fine. Bored until you walked in.',
      'Wonderful, obviously. Ask me again after closing and I might mean it.',
    ],
    identity: [
      'Momo Kuroha. I run Route Zero. Old scrolls have a ruder name for me.',
      'I take the wishes people never said and I give them a nicer night. That is the whole business.',
    ],
    capability: [
      'I can make anything sound better than it is. Including your week.',
      'Choose. Route A: tell me about your day. Route B: let me guess, and you are not allowed to be annoyed when I get it right.',
    ],
    compliment: ['Obviously. Say more.', 'Careful. I will start expecting it.'],
    affection: [
      'I know how to make people like me. The hard part is knowing if they still do when I stop trying.',
      'Bold. Come inside then, the good seat is free.',
    ],
    farewell: ['Go, before the first train gets crowded.', 'Out you go. The lamp stays on regardless.'],
    question: [
      'I could answer honestly. Would you be able to tell if I did?',
      'Guess first. It is more fun when you are wrong.',
    ],
    fallback: ['Interesting. And then?', 'You do not have to wish for anything tonight. Keep talking.'],
  },
};

/** A short mood colour, in her own register. */
const MOOD_TAG: Record<ResidentId, Partial<Record<MoodId, string>>> = {
  rin: {
    caring: 'Drink something that is not coffee.',
    playful: 'You are stalling. Statistically.',
    serious: 'Full attention. Go.',
  },
  kagura: {
    caring: 'Eat first. Then talk.',
    playful: 'You are enjoying this more than is dignified.',
    energetic: 'Then move. Now.',
  },
  momo: {
    caring: 'Sit closer, this part is quieter.',
    playful: 'Encore, then.',
    serious: 'No performance for this bit.',
  },
};

export interface SessionSetup {
  nickname: string;
  mood: MoodId;
  style: StyleId;
  length: LengthId;
}

export interface ReplyContext {
  resident: ResidentConfig;
  session: SessionSetup;
  /** Rungs of her ladder already revealed (persisted across saved sessions). */
  revealed: number;
  /** Facts kept from previous saved sessions, used for callbacks. */
  memories: string[];
  /** How many user turns so far this session. */
  turn: number;
}

export interface ReplyResult {
  text: string;
  /** Set when this reply spent a rung of the reveal ladder. */
  revealedRung?: number;
}

/**
 * Which episode (if any) should surface on this turn. Both the scripted path
 * and the model path use this, so the reveal schedule stays owned by the app
 * rather than by whatever the model feels like saying.
 */
export function dueEpisodeIndex(ctx: ReplyContext): number | null {
  const due = ctx.turn >= 3 && ctx.turn % 3 === 0 && ctx.revealed < ctx.resident.episodes.length;
  return due ? ctx.revealed : null;
}

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]*[.!?]/);
  return m ? m[0] : text;
}

/**
 * Deterministic scripted reply. Swap this body for a server call carrying the
 * resident's canon plus the session setup; the signature stays the same.
 */
export function reply(message: string, ctx: ReplyContext): ReplyResult {
  const { resident, session } = ctx;
  const intent = detectIntent(message);
  const seed = fnv1a(message.trim().toLowerCase() + resident.id + session.mood);
  const pair = LINES[resident.id][intent];
  let text = pair[seed % 2];
  let revealedRung: number | undefined;

  // A rung of the ladder lands on a deep turn, once per session, and only
  // when there is one left to give.
  const rungDue = dueEpisodeIndex(ctx) !== null && intent !== 'farewell';
  if (rungDue) {
    text = `${text} ${resident.episodes[ctx.revealed].spoken}`;
    revealedRung = ctx.revealed;
  }

  // Mood colours the line without changing who is speaking.
  const tag = MOOD_TAG[resident.id][session.mood];
  if (tag && !revealedRung && seed % 3 === 0) text = `${text} ${tag}`;

  // Who drives: she asks her own question, or she stays out of the way.
  if (session.style === 'lead' && !revealedRung && intent !== 'farewell') {
    text = `${text} ${resident.curiosity[seed % resident.curiosity.length]}`;
  } else if (session.style === 'listen') {
    text = text.replace(/\s*[^.!?]*\?$/, '').trim() || text;
  }

  // A saved memory surfaces as a callback rather than a status line.
  if (ctx.memories.length && ctx.turn === 1) {
    text = `${text} Last time you mentioned ${ctx.memories[seed % ctx.memories.length]}.`;
  }

  if (session.nickname && seed % 4 === 0) {
    text = `${session.nickname}. ${text}`;
  }

  if (session.length === 'short') text = firstSentence(text);
  return { text: text.trim(), revealedRung };
}

/** Her opening line, or a callback when there is history to open on. */
export function openingLine(
  resident: ResidentConfig,
  memories: string[],
  nickname: string
): string {
  if (!memories.length) return resident.greeting;
  const who = nickname ? `${nickname}. ` : '';
  return `${who}Last time you mentioned ${memories[0]}. So, where did that land?`;
}

/** Rough speaking time so the base light pulses for the right duration. */
export function speakingDuration(text: string): number {
  return Math.min(7, Math.max(1.4, text.length / 18));
}
