// What she invents in free chat, and how it comes back.
//
// The old prompt forbade invention outright ("Bốn danh sách trên là toàn bộ
// thế giới em biết"). The seed drops that rule, so consistency is no longer
// authored up front — it accumulates here, per visitor.

import { DIRECT_IDENTIFIER_RE } from './context-visual';

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
