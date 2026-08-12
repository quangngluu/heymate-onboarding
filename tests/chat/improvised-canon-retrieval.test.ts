import { describe, expect, it } from 'vitest';
import {
  IMPROVISED_CANON_CHAR_BUDGET,
  IMPROVISED_CANON_MAX_ENTRIES,
  relevantImprovisedCanon,
} from '../../src/chat/improvised-canon';
import type { CanonLedgerEntry } from '../../src/state/store';

function entry(over: Partial<CanonLedgerEntry> & { text: string }): CanonLedgerEntry {
  return {
    id: over.id ?? over.text,
    residentId: (over.residentId ?? 'kagura') as CanonLedgerEntry['residentId'],
    canonType: 'player-created',
    createdAt: over.createdAt ?? 0,
    source: 'chat',
    ...over,
  } as CanonLedgerEntry;
}

describe('relevantImprovisedCanon', () => {
  it('returns nothing for an empty ledger', () => {
    expect(relevantImprovisedCanon([], 'kagura', 'chào em')).toEqual([]);
  });

  it('excludes other residents', () => {
    const ledger = [entry({ text: 'của rin', residentId: 'rin' })];
    expect(relevantImprovisedCanon(ledger, 'kagura', 'rin')).toEqual([]);
  });

  it('prefers entries the message actually touches', () => {
    const ledger = [
      entry({ text: 'Em ghét cà phê đen.', createdAt: 1 }),
      entry({ text: 'Quán mì dưới cầu vượt là chỗ em quen.', createdAt: 2 }),
    ];
    const out = relevantImprovisedCanon(ledger, 'kagura', 'đi ăn mì không em');
    expect(out[0]).toContain('Quán mì');
  });

  it('holds the ceiling against a 500-entry ledger', () => {
    const ledger = Array.from({ length: 500 }, (_, i) =>
      entry({ text: `Sự thật số ${i} về quán mì dưới cầu vượt.`, createdAt: i })
    );
    const out = relevantImprovisedCanon(ledger, 'kagura', 'quán mì');

    expect(out.length).toBeLessThanOrEqual(IMPROVISED_CANON_MAX_ENTRIES);
    expect(out.join('\n').length).toBeLessThanOrEqual(IMPROVISED_CANON_CHAR_BUDGET);
  });

  it('never exceeds the character budget even with long entries', () => {
    const ledger = Array.from({ length: 12 }, (_, i) =>
      entry({ text: `${'y'.repeat(150)} ${i}`, createdAt: i })
    );
    const out = relevantImprovisedCanon(ledger, 'kagura', 'y');
    expect(out.join('\n').length).toBeLessThanOrEqual(IMPROVISED_CANON_CHAR_BUDGET);
  });
});
