import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dialogueBlocks,
  composeRewardReply,
  nextOpenChatRewardTurn,
  openingVisualFor,
  selectOpenChatReward,
} from '../../src/chat/open-chat-visuals';
import { Store } from '../../src/state/store';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

describe('Open Chat visual beats', () => {
  it('places the opening visual after the second spoken sentence', () => {
    expect(
      dialogueBlocks(
        '*Màn hình rung nhẹ.* Câu đầu tiên. Câu thứ hai! Câu thứ ba?',
        openingVisualFor('rin').id,
        2,
        true
      ).map((block) => block.kind)
    ).toEqual(['beat', 'speech', 'speech', 'visual', 'speech']);
  });

  it('does not reveal the visual before sentence two finishes streaming', () => {
    const id = openingVisualFor('rin').id;
    expect(dialogueBlocks('Câu đầu tiên. Câu thứ', id, 2, false)).not.toContainEqual({
      kind: 'visual',
      visualId: id,
    });
    expect(dialogueBlocks('Câu đầu tiên. Câu thứ hai!', id, 2, false)).toContainEqual({
      kind: 'visual',
      visualId: id,
    });
  });

  it('falls back to the end for a completed one-sentence line', () => {
    const id = openingVisualFor('momo').id;
    expect(dialogueBlocks('Lại đây.', id, 2, true).at(-1)).toEqual({
      kind: 'visual',
      visualId: id,
    });
  });
});

describe('Open Chat visual rewards', () => {
  it('schedules the next reward three to five user turns later', () => {
    expect(nextOpenChatRewardTurn(7, () => 0)).toBe(10);
    expect(nextOpenChatRewardTurn(7, () => 0.999)).toBe(12);
  });

  it('selects only unseen reward images for the active resident', () => {
    const first = selectOpenChatReward('kagura', [], () => 0);
    expect(first?.residentId).toBe('kagura');
    expect(first?.kind).toBe('reward');

    const second = selectOpenChatReward('kagura', [first!.id], () => 0);
    expect(second?.id).not.toBe(first?.id);
    expect(selectOpenChatReward('kagura', [first!.id, second!.id], () => 0)).toBeNull();
  });

  it('claims a due reward once and schedules the next one from the claimed turn', () => {
    const store = new Store(() => 0);
    store.beginEncounter('rin');
    expect(store.peekOpenChatReward()).toBeNull();

    for (let turn = 0; turn < 3; turn++) {
      store.pushTurn({ from: 'user', text: `Lượt ${turn + 1}` });
    }
    const reward = store.peekOpenChatReward();
    expect(reward?.residentId).toBe('rin');

    store.consumeOpenChatReward(reward!.id);
    expect(store.peekOpenChatReward()).toBeNull();
    expect(store.get().openChatRewards.rin).toEqual({
      seenIds: [reward!.id],
      nextTurn: 6,
    });
  });

  it('keeps the model reply intact and speaks the authored bridge after the image', () => {
    const visual = selectOpenChatReward('rin', [], () => 0)!;
    const composed = composeRewardReply('Em nghe rồi. Đoạn đó khó thật.', visual);
    const blocks = dialogueBlocks(
      composed.text,
      visual.id,
      composed.visualAfterSentence,
      true
    );

    expect(composed.text).toBe(`Em nghe rồi. Đoạn đó khó thật. ${visual.followUp}`);
    expect(blocks.map((block) => block.kind)).toEqual([
      'speech',
      'speech',
      'visual',
      'speech',
      'speech',
    ]);
  });
});
