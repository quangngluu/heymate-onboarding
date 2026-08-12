// What she invents in free chat, and how it comes back.
//
// The old prompt forbade invention outright ("Bốn danh sách trên là toàn bộ
// thế giới em biết"). The seed drops that rule, so consistency is no longer
// authored up front — it accumulates here, per visitor.

import { DIRECT_IDENTIFIER_RE } from './context-visual';
import type { CanonLedgerEntry } from '../state/store';

export const IMPROVISED_CANON_KINDS = [
  'place',
  'person',
  'object',
  'event',
  'habit',
] as const;

export type ImprovisedCanonKind = (typeof IMPROVISED_CANON_KINDS)[number];

export interface ImprovisedFact {
  kind: ImprovisedCanonKind;
  text: string;
}

/** Hard cap per turn, so one reply cannot flood the ledger. */
export const IMPROVISED_CANON_PER_TURN = 2;

const MAX_FACT_CHARS = 160;

function isKind(value: unknown): value is ImprovisedCanonKind {
  return (
    typeof value === 'string' &&
    (IMPROVISED_CANON_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Read the optional invented-fact list from the model's private state
 * envelope. Malformed input is dropped silently: a bad envelope must never
 * cost the visitor their reply.
 */
export function improvisedCanonFromState(state: unknown): ImprovisedFact[] {
  if (!state || typeof state !== 'object') return [];
  const candidate = (state as { canon?: unknown }).canon;
  if (!Array.isArray(candidate)) return [];

  const facts: ImprovisedFact[] = [];
  for (const raw of candidate) {
    if (facts.length >= IMPROVISED_CANON_PER_TURN) break;
    if (!raw || typeof raw !== 'object') continue;
    const input = raw as Record<string, unknown>;
    if (!isKind(input.kind)) continue;
    const text =
      typeof input.text === 'string'
        ? input.text.replace(/\s+/gu, ' ').trim().slice(0, MAX_FACT_CHARS)
        : '';
    if (!text || DIRECT_IDENTIFIER_RE.test(text)) continue;
    facts.push({ kind: input.kind, text });
  }
  return facts;
}

/**
 * Architectural invariant, not a tuning knob. Without it the ledger grows
 * back into the 33k-character prompt this whole design removed.
 */
export const IMPROVISED_CANON_CHAR_BUDGET = 800;
export const IMPROVISED_CANON_MAX_ENTRIES = 12;

const STOP_WORDS = new Set([
  'anh', 'em', 'là', 'và', 'của', 'có', 'không', 'một', 'cho', 'với',
  'thì', 'ở', 'đi', 'này', 'đó', 'gì', 'nhé', 'ạ', 'à',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Pick the entries this turn actually touches, newest-first among equals,
 * and stop at the budget. Entries never invoked sink; they are never deleted.
 */
export function relevantImprovisedCanon(
  entries: CanonLedgerEntry[],
  residentId: string,
  message: string
): string[] {
  const cues = new Set(tokens(message));
  const scored = entries
    .filter((e) => e.source === 'chat' && e.residentId === residentId)
    .map((e) => {
      const overlap = tokens(e.text).reduce(
        (sum, word) => sum + (cues.has(word) ? 1 : 0),
        0
      );
      return { entry: e, overlap, refCount: e.refCount ?? 0 };
    })
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      if (b.refCount !== a.refCount) return b.refCount - a.refCount;
      return b.entry.createdAt - a.entry.createdAt;
    });

  const picked: string[] = [];
  let used = 0;
  for (const { entry } of scored) {
    if (picked.length >= IMPROVISED_CANON_MAX_ENTRIES) break;
    const cost = entry.text.length + (picked.length > 0 ? 1 : 0);
    if (used + cost > IMPROVISED_CANON_CHAR_BUDGET) continue;
    picked.push(entry.text);
    used += cost;
  }
  return picked;
}
