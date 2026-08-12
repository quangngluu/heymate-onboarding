import { describe, expect, it } from 'vitest';
import { improvisedCanonFromState } from '../../src/chat/improvised-canon';

describe('improvisedCanonFromState', () => {
  it('returns an empty list when the model reports nothing', () => {
    expect(improvisedCanonFromState({ canon: null })).toEqual([]);
    expect(improvisedCanonFromState({})).toEqual([]);
    expect(improvisedCanonFromState(null)).toEqual([]);
  });

  it('reads well-formed facts', () => {
    const facts = improvisedCanonFromState({
      canon: [{ kind: 'place', text: '  Quán mì   dưới cầu vượt.  ' }],
    });
    expect(facts).toEqual([{ kind: 'place', text: 'Quán mì dưới cầu vượt.' }]);
  });

  it('caps at two entries per turn', () => {
    const facts = improvisedCanonFromState({
      canon: [
        { kind: 'place', text: 'một' },
        { kind: 'object', text: 'hai' },
        { kind: 'person', text: 'ba' },
      ],
    });
    expect(facts).toHaveLength(2);
  });

  it('drops unknown kinds and empty text', () => {
    const facts = improvisedCanonFromState({
      canon: [
        { kind: 'spaceship', text: 'không hợp lệ' },
        { kind: 'place', text: '   ' },
        { kind: 'event', text: 'hợp lệ' },
      ],
    });
    expect(facts).toEqual([{ kind: 'event', text: 'hợp lệ' }]);
  });

  it('drops entries carrying direct identifiers', () => {
    const facts = improvisedCanonFromState({
      canon: [
        { kind: 'place', text: 'ghé https://example.com nhé' },
        { kind: 'person', text: 'mail cho a@b.com' },
        { kind: 'habit', text: 'em dậy trước bình minh' },
      ],
    });
    expect(facts).toEqual([{ kind: 'habit', text: 'em dậy trước bình minh' }]);
  });

  it('truncates overlong text', () => {
    const facts = improvisedCanonFromState({
      canon: [{ kind: 'place', text: 'x'.repeat(400) }],
    });
    expect(facts[0].text).toHaveLength(160);
  });
});
