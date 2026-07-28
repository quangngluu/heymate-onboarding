// Turns a session's conversation into the concrete list of things a resident
// would carry forward. The save gate shows exactly these, in plain words, and
// the user can drop any of them before spending a credit.
//
// Extraction is local pattern matching, not inference: if we cannot state a
// memory plainly, we do not offer it.

import type { ChatTurn } from '../state/store';

export interface MemoryCandidate {
  id: string;
  /** Reads as a sentence inside "She will remember: ..." */
  text: string;
  kind: 'nickname' | 'openLoop' | 'preference' | 'topic';
}

const PATTERNS: { kind: MemoryCandidate['kind']; re: RegExp; make: (m: RegExpMatchArray) => string }[] = [
  {
    kind: 'openLoop',
    re: /\b(?:i(?:'m| am)|im)\s+(preparing for|working on|studying for|training for)\s+(.{3,48}?)(?:[.!?,]|$)/i,
    make: (m) => `you are ${m[1].toLowerCase()} ${m[2].trim()}`,
  },
  {
    kind: 'openLoop',
    re: /\b(?:i have|i've got|tomorrow is|today is)\s+(?:an?\s+)?(.{3,44}?)\s*(?:tomorrow|today|next week)?(?:[.!?,]|$)/i,
    make: (m) => `you have ${m[1].trim()} coming up`,
  },
  {
    kind: 'preference',
    re: /\bi (?:really )?(?:like|love|enjoy|prefer)\s+(.{3,44}?)(?:[.!?,]|$)/i,
    make: (m) => `you like ${m[1].trim()}`,
  },
  {
    kind: 'preference',
    re: /\bi (?:hate|can't stand|cannot stand|dislike)\s+(.{3,44}?)(?:[.!?,]|$)/i,
    make: (m) => `you cannot stand ${m[1].trim()}`,
  },
  {
    kind: 'topic',
    re: /\bmy (job|team|thesis|project|band|shop|cat|dog|sister|brother|mother|father)\b/i,
    make: (m) => `your ${m[1].toLowerCase()}`,
  },
];

export function extractMemories(chat: ChatTurn[], nickname: string): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const seen = new Set<string>();
  const push = (kind: MemoryCandidate['kind'], text: string) => {
    const key = text.toLowerCase();
    if (seen.has(key) || out.length >= 4) return;
    seen.add(key);
    out.push({ id: `m${out.length}`, text, kind });
  };

  if (nickname.trim()) push('nickname', `to call you ${nickname.trim()}`);

  for (const turn of chat) {
    if (turn.from !== 'user') continue;
    for (const p of PATTERNS) {
      const m = turn.text.match(p.re);
      if (m) push(p.kind, p.make(m));
    }
  }
  return out;
}
