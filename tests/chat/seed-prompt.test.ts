import { describe, expect, it } from 'vitest';
import { buildSeedPrompt } from '../../src/chat/seed-prompt';
import { SEED_CHAR_CEILING } from '../../src/config/seed';

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
});
