import { describe, expect, it } from 'vitest';
import { buildSeedPrompt } from '../../src/chat/seed-prompt';
import { SEED_CHAR_CEILING } from '../../src/config/seed';
import type { Rapport } from '../../src/config/bond';

const session = {
  scenario: 'casual',
  face: 'companion',
  length: 'natural',
} as const;

describe('buildSeedPrompt', () => {
  it('stays under the seed ceiling', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt.length).toBeLessThan(SEED_CHAR_CEILING);
  });

  it('is an order of magnitude smaller than the authored prompt', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt.length).toBeLessThan(33419 / 10);
  });

  it('carries every core entry regardless of persona', () => {
    const prompt = buildSeedPrompt(
      'kagura',
      { ...session, persona: 'em cứ nói trống không, kệ mọi thứ' },
      []
    );
    expect(prompt).toContain('Kagari Akagane');
    expect(prompt).toContain('đại đao');
    expect(prompt).toContain('Giọng của em');
    expect(prompt).toContain('Ranh giới của em');
    expect(prompt).toContain('không bất khả chiến bại');
    expect(prompt).toContain('Phản xạ của em');
  });

  it('includes retrieved ledger lines when present', () => {
    const prompt = buildSeedPrompt('kagura', session, [
      'Quán mì dưới cầu vượt là chỗ em quen.',
    ]);
    expect(prompt).toContain('Quán mì dưới cầu vượt');
  });

  it('omits the ledger block entirely when the ledger is empty', () => {
    expect(buildSeedPrompt('kagura', session, [])).not.toContain(
      'ĐÃ THÀNH THẬT GIỮA HAI NGƯỜI'
    );
  });

  it('instructs the model to report invented facts', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt).toContain('"canon"');
    expect(prompt).toContain('place');
  });

  it('throws for a resident without a seed', () => {
    expect(() => buildSeedPrompt('rin', session, [])).toThrow();
  });

  // The tests above pass a persona but never check it actually landed in the
  // prompt, and the "invented facts" test only checks for the bare word
  // "place" — which the kind list would still contain even if the whole
  // canon instruction sentence around it were deleted. The tests below make
  // each of those guarantees real, plus cover the caps and the rapport
  // interpolation, none of which had coverage before.

  it('carries the visitor persona text into the prompt', () => {
    const prompt = buildSeedPrompt(
      'kagura',
      { ...session, persona: 'em cứ nói trống không, kệ mọi thứ' },
      []
    );
    expect(prompt).toContain('em cứ nói trống không, kệ mọi thứ');
  });

  it('carries the visitor identity text into the prompt', () => {
    const prompt = buildSeedPrompt('kagura', { ...session, identity: 'Long' }, []);
    expect(prompt).toContain('Long');
  });

  it('caps the visitor persona at 600 characters', () => {
    const overflow = 'X'.repeat(50);
    const persona = 'a'.repeat(600) + overflow;
    const prompt = buildSeedPrompt('kagura', { ...session, persona }, []);
    expect(prompt).not.toContain(overflow);
  });

  it('caps the visitor identity at 120 characters', () => {
    const overflow = 'Y'.repeat(50);
    const identity = 'b'.repeat(120) + overflow;
    const prompt = buildSeedPrompt('kagura', { ...session, identity }, []);
    expect(prompt).not.toContain(overflow);
  });

  it('interpolates the rapport argument into the state contract', () => {
    const rapport: Rapport = {
      trust: 0.87,
      respect: 0.44,
      desire: 0.61,
      irritation: 0.23,
      attachment: 0.55,
      unresolvedConflict: null,
      lastBoundary: null,
      repairStatus: 'none',
    };
    const prompt = buildSeedPrompt('kagura', session, [], rapport);
    expect(prompt).toContain('trust 0.87');
    expect(prompt).toContain('irritation 0.23');
  });

  it('states the canon instruction as a full sentence, not just a bare kind', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt).toContain('canon là null ở hầu hết lượt');
    expect(prompt).toContain('về thế giới của mình');
  });

  it('marks the five rapport numbers as absolute values, not deltas', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt).toContain('GIÁ TRỊ TUYỆT ĐỐI');
  });
});
