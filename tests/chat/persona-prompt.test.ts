import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../src/chat/prompt';

describe('persona prompt injection', () => {
  it('keeps persona instructions beyond the legacy 180-character cap', () => {
    const persona = `đầu-${'x'.repeat(300)}-cuối`;
    const prompt = buildSystemPrompt(
      'rin',
      {
        persona,
        identity: '',
        scenario: 'casual',
        face: 'companion',
        length: 'natural',
      },
      [],
      0
    );

    expect(prompt).toContain(JSON.stringify(persona));
  });
});
