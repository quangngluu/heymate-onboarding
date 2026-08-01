import { describe, expect, it } from 'vitest';
import { questById, questNode, resolveFreeform } from '../../src/config/quests';

describe('free-form Quest resolution', () => {
  const quest = questById('rin-twelfth-frame', 'sao');
  if (!quest) throw new Error('Rin Frame 12 quest is missing');
  const terminal = questNode(quest, 'channel-choice');

  it.each([
    ['matched family', 'Tạo một bản riêng', 'private-copy'],
    ['fallback family', 'Giữ một khoảng trống giữa hai nhịp', 'authored-protocol'],
  ])('carries the ending through the %s transform', (_case, action, endingId) => {
    expect(resolveFreeform(terminal, action)).toMatchObject({
      endingId,
      unlockCanonReveal: 2,
      unlockCanonRevealId: 'rin-v3-fluctlight-clause',
      playerAuthored: true,
    });
  });
});
