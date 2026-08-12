import { describe, expect, it } from 'vitest';
import { sanitizeImprovisedCanon } from '../../api/chat';
import {
  IMPROVISED_CANON_CHAR_BUDGET,
  IMPROVISED_CANON_MAX_ENTRIES,
} from '../../src/chat/improvised-canon';

// `improvisedCanon` is attacker-controlled input to a public endpoint, and
// whatever survives is pasted into the system prompt under a heading asserting
// the lines are true. The client's own ceiling lives in relevantImprovisedCanon,
// which a hand-rolled POST never executes, so these are the bounds that hold.

const joined = (lines: string[]) => lines.join('\n').length;

describe('sanitizeImprovisedCanon', () => {
  it('drops everything that is not a string', () => {
    expect(
      sanitizeImprovisedCanon([
        'Quán mì dưới cầu vượt là chỗ em quen.',
        42,
        null,
        undefined,
        { text: 'em ở đâu' },
        ['nested'],
        true,
      ])
    ).toEqual(['Quán mì dưới cầu vượt là chỗ em quen.']);
  });

  it('returns nothing for input that is not an array at all', () => {
    expect(sanitizeImprovisedCanon(undefined)).toEqual([]);
    expect(sanitizeImprovisedCanon('Quán mì dưới cầu vượt.')).toEqual([]);
    expect(sanitizeImprovisedCanon({ 0: 'a', length: 1 })).toEqual([]);
  });

  it('truncates an over-long entry to the per-line cap', () => {
    const [line] = sanitizeImprovisedCanon(['ê'.repeat(5000)]);
    expect(line).toHaveLength(160);
  });

  it('collapses whitespace and drops entries left empty by trimming', () => {
    expect(
      sanitizeImprovisedCanon(['  ', '\n\t', '', 'Em   dậy\n\ntrước   bình minh.'])
    ).toEqual(['Em dậy trước bình minh.']);
  });

  it('cuts more than the maximum number of entries', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Chi tiết số ${i}.`);
    const kept = sanitizeImprovisedCanon(many);
    expect(kept).toHaveLength(IMPROVISED_CANON_MAX_ENTRIES);
    expect(kept[0]).toBe('Chi tiết số 0.');
  });

  it('enforces the total character budget when many near-limit entries arrive', () => {
    // Twelve entries are inside the count cap but 12 x 160 = 1920 characters,
    // far past the budget the prompt is allowed to carry.
    const near = Array.from({ length: IMPROVISED_CANON_MAX_ENTRIES }, () => 'ê'.repeat(160));
    const kept = sanitizeImprovisedCanon(near);

    expect(kept.length).toBeLessThan(IMPROVISED_CANON_MAX_ENTRIES);
    expect(joined(kept)).toBeLessThanOrEqual(IMPROVISED_CANON_CHAR_BUDGET);
    // Nothing survives unbounded: every kept line is still a full 160.
    expect(kept.every((line) => line.length === 160)).toBe(true);
  });

  it('cannot be pushed over the budget by a single oversized entry', () => {
    const kept = sanitizeImprovisedCanon(['ê'.repeat(100_000)]);
    expect(joined(kept)).toBeLessThanOrEqual(IMPROVISED_CANON_CHAR_BUDGET);
  });

  it('keeps a prefix of the input rather than reordering it', () => {
    // Four 160-character lines cost 643 of the 800 budget; the fifth would take
    // it to 804 and stops the walk. The short line behind it is dropped rather
    // than promoted into the gap the fifth left — what the server keeps is
    // always a prefix of what it was sent, never a repacked subset.
    const kept = sanitizeImprovisedCanon([
      ...Array.from({ length: 5 }, () => 'ê'.repeat(160)),
      'ngắn',
    ]);
    expect(kept).toHaveLength(4);
    expect(kept).not.toContain('ngắn');
    expect(joined(kept)).toBeLessThanOrEqual(IMPROVISED_CANON_CHAR_BUDGET);
  });

  it('passes a realistic already-budgeted payload through untouched', () => {
    const fromClient = [
      'Quán mì dưới cầu vượt là chỗ em quen.',
      'Em dậy trước bình minh để mài kiếm.',
    ];
    expect(sanitizeImprovisedCanon(fromClient)).toEqual(fromClient);
  });
});
