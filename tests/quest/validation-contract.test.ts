import { describe, expect, it } from 'vitest';
import { QUEST_VALIDATION_RULES } from './validation-contract';

describe('Quest Phase 2 validation contract', () => {
  it('freezes all V1-V15 rules in order', () => {
    expect(QUEST_VALIDATION_RULES.map((rule) => rule.id)).toEqual(
      Array.from({ length: 15 }, (_, index) => `V${index + 1}`)
    );
  });

  it('allows only V4 and V14 to block runtime execution', () => {
    expect(
      QUEST_VALIDATION_RULES.filter((rule) => rule.runtime === 'block').map(
        (rule) => rule.id
      )
    ).toEqual(['V4', 'V14']);
  });

  it('reserves authoring errors for malformed interaction contracts', () => {
    expect(
      QUEST_VALIDATION_RULES.filter((rule) => rule.authoring === 'error').map(
        (rule) => rule.id
      )
    ).toEqual(['V9', 'V10', 'V15']);
  });

  for (const rule of QUEST_VALIDATION_RULES) {
    it.todo(`${rule.id} — ${rule.name}: authoring and runtime behavior`);
  }
});
