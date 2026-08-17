import { describe, expect, it } from 'vitest';
import { openingLine } from '../../src/chat/engine';
import { residentById } from '../../src/config/residents';

describe('owner-only return greeting', () => {
  it('returns the authored owner greeting for an owner on return', () => {
    const kagura = residentById('kagura');
    expect(kagura.ownerGreeting).toBeTruthy();
    expect(
      openingLine(kagura, ['một kỷ niệm'], 'Anh', 0, 'origin', true)
    ).toBe(kagura.ownerGreeting);
  });

  it('falls back to the normal greeting path when not owned or when no owner greeting exists', () => {
    const kagura = residentById('kagura');
    const rin = residentById('rin');
    expect(rin.ownerGreeting).toBeUndefined();
    expect(openingLine(kagura, ['một kỷ niệm'], 'Anh', 0, 'origin', false)).not.toBe(
      kagura.ownerGreeting
    );
    expect(openingLine(rin, ['một kỷ niệm'], 'Anh', 0, 'origin', true)).not.toBe(
      kagura.ownerGreeting
    );
  });
});
