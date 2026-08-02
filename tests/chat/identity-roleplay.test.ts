import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../src/chat/prompt';

describe('roleplay identity prompt', () => {
  it('treats a selected character as the visitor identity, not a costume', () => {
    const prompt = buildSystemPrompt(
      'rin',
      {
        persona: '',
        identity: 'Kirito',
        scenario: 'casual',
        face: 'companion',
        length: 'natural',
      },
      [],
      0
    );

    expect(prompt).toContain('Tối nay anh bước vào với tư cách: "Kirito".');
    expect(prompt).toContain('Anh CHÍNH LÀ người đó, không phải người đang cosplay.');
    expect(prompt).toContain('vũ khí, năng lực, lời nguyền');
  });
});
