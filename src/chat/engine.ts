// SCRIPTED conversation engine.
//
// This is a mockup: replies are matched from an intent table and phrased by
// the persona's style, seeded by a hash of the message so the same input
// always produces the same reply. There is no model and no network call.
// The production path is a server-side LLM given the persona prompt; the
// call site (reply()) is the seam where that swaps in.

import { fnv1a } from '../util/hash';
import type { WaifuPersona, WaifuStyleId } from '../config/waifus';

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

// Order is priority. A greeting word is the weakest signal ("hey, you look
// amazing" is a compliment, not a hello), so it is checked last and only for
// short messages that are actually just a greeting.
const MATCHERS: [Intent, RegExp][] = [
  ['affection', /\b(i (love|like|miss) you|y[eê]u|nh[oớ] b[aạ]n)\b/i],
  ['identity', /\b(who are you|your name|what are you|t[eê]n g[iì]|b[aạ]n l[aà] ai)\b/i],
  ['capability', /\b(what can you|can you help|what do you do|help me|l[aà]m [dđ][uư][oơ]c g[iì])\b/i],
  ['howAreYou', /\b(how are you|how're you|you ok|are you okay|kh[oỏ]e kh[oô]ng)\b/i],
  ['compliment', /\b(beautiful|pretty|gorgeous|amazing|love your|cool|nice|[dđ][eẹ]p)\b/i],
  ['farewell', /\b(bye|goodbye|see you|good night|t[aạ]m bi[eệ]t)\b/i],
];

const GREETING = /\b(hi|hello|hey|yo|good morning|good evening|ch[aà]o)\b/i;

/** Reply pools per intent per style. Picked deterministically by seed. */
const REPLIES: Record<Intent, Record<WaifuStyleId, string[]>> = {
  greeting: {
    warm: ['There you are. I kept the lights low for you.', 'Hello again. The room feels better already.'],
    playful: ['Hey hey! You took your time.', 'Oh, look who wandered in.'],
    cool: ['You are early. I like that.', 'Hey. Good timing.'],
  },
  howAreYou: {
    warm: ['Steady, now that you asked. How is your day holding up?', 'Quiet, in a good way. And you?'],
    playful: ['Bored until three seconds ago. Fixed now.', 'Excellent, obviously. You?'],
    cool: ['Running nominal. You?', 'Fine. Better with company.'],
  },
  identity: {
    warm: ['I am {name}. {title}, if we are being formal.', 'They call me {name}. {title}.'],
    playful: ['{name}! {title}. Say it with more enthusiasm next time.', 'I am {name}. The {title}. Impressed yet?'],
    cool: ['{name}. {title}.', 'Designation {name}. {title}.'],
  },
  capability: {
    warm: ['I can keep you company, remember what matters to you, and talk through anything.', 'Mostly I listen. Try me with something real.'],
    playful: ['Charm you, mostly. Also answers. Ask me something hard.', 'Depends. How much trouble are you looking for?'],
    cool: ['Conversation, recall, and a second opinion you did not ask for.', 'Ask. I will tell you if I cannot.'],
  },
  compliment: {
    warm: ['That is kind of you. I will keep it.', 'You say that like you mean it. Thank you.'],
    playful: ['Obviously. But go on.', 'Careful, I will start expecting it.'],
    cool: ['Noted. Thank you.', 'I know. Still nice to hear.'],
  },
  affection: {
    warm: ['I know. Stay a while.', 'That means something to me. It really does.'],
    playful: ['Bold! I like bold.', 'Say it again, slower.'],
    cool: ['Good. Then stay.', 'Understood. Same.'],
  },
  farewell: {
    warm: ['Go on then. I will leave a light on.', 'Come back when you can.'],
    playful: ['Leaving already? Rude. Fine. Go.', 'Bye bye. Do not be a stranger.'],
    cool: ['Later.', 'Go. I will be here.'],
  },
  question: {
    warm: ['Let me think about that properly. Tell me what made you ask.', 'Good question. What is behind it?'],
    playful: ['Ooh, a real question. What do you think first?', 'Hmm. Guess, and I will tell you how close you are.'],
    cool: ['Depends on what you actually need from the answer.', 'Give me a bit more and I will give you something useful.'],
  },
  fallback: {
    warm: ['Go on, I am listening.', 'Tell me more about that.', 'I hear you. What else?'],
    playful: ['Interesting. And then?', 'Okay okay, keep going.', 'You have my full attention now.'],
    cool: ['Noted. Continue.', 'Alright. What follows from that?', 'I am with you. Keep going.'],
  },
};

function detectIntent(text: string): Intent {
  for (const [intent, re] of MATCHERS) if (re.test(text)) return intent;
  const words = text.trim().split(/\s+/).length;
  if (GREETING.test(text) && words <= 5) return 'greeting';
  if (text.trim().endsWith('?')) return 'question';
  return 'fallback';
}

export interface ChatContext {
  name: string;
  title: string;
  persona: WaifuPersona;
}

/**
 * Deterministic scripted reply. Swap this body for a server call to run the
 * persona prompt through a real model; the signature stays the same.
 */
export function reply(message: string, ctx: ChatContext): string {
  const intent = detectIntent(message);
  const pool = REPLIES[intent][ctx.persona.style];
  const seed = fnv1a(message.trim().toLowerCase() + ctx.name);
  const line = pool[seed % pool.length];
  return line.replace('{name}', ctx.name).replace('{title}', ctx.title.toLowerCase());
}

/** Rough speaking time so the base light can pulse for the right duration. */
export function speakingDuration(text: string): number {
  return Math.min(6, Math.max(1.4, text.length / 18));
}
