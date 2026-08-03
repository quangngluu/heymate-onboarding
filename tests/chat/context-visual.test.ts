import { describe, expect, it } from 'vitest';
import {
  contextVisualIntentFromState,
  decideContextVisual,
} from '../../src/chat/context-visual';

describe('Open Chat context visual intent', () => {
  it('accepts one bounded visual moment from the private model state', () => {
    expect(
      contextVisualIntentFromState({
        visualIntent: {
          sceneBrief: 'Kho lưu trữ tối, Frame 12 sáng trên màn hình giữa phòng.',
          caption: 'Frame 12 hiện lại đúng lúc Rin thôi né câu hỏi.',
          confidence: 0.91,
        },
      })
    ).toEqual({
      sceneBrief: 'Kho lưu trữ tối, Frame 12 sáng trên màn hình giữa phòng.',
      caption: 'Frame 12 hiện lại đúng lúc Rin thôi né câu hỏi.',
      confidence: 0.91,
    });
  });

  it('drops a scene brief that contains direct contact information', () => {
    expect(
      contextVisualIntentFromState({
        visualIntent: {
          sceneBrief: 'Màn hình hiện email visitor@example.com giữa căn phòng.',
          caption: 'Một địa chỉ riêng tư xuất hiện.',
          confidence: 0.95,
        },
      })
    ).toBeNull();
  });

  it('automatically delivers the first high-confidence visual for free', () => {
    expect(
      decideContextVisual({
        intent: {
          sceneBrief: 'Kho lưu trữ với Frame 12 trên màn hình.',
          caption: 'Frame 12 hiện lại.',
          confidence: 0.9,
        },
        progress: { freeAttemptUsed: false, lastDeliveredTurn: null },
        userTurn: 2,
        hasOutstandingOffer: false,
      })
    ).toEqual({ kind: 'generate-free' });
  });

  it('offers a disclosed paid draw after the free frame and cooldown', () => {
    expect(
      decideContextVisual({
        intent: {
          sceneBrief: 'Cửa kho mở ra phía hành lang đỏ.',
          caption: 'Cánh cửa đổi màu sau câu trả lời.',
          confidence: 0.88,
        },
        progress: { freeAttemptUsed: true, lastDeliveredTurn: 3 },
        userTurn: 7,
        hasOutstandingOffer: false,
      })
    ).toEqual({ kind: 'offer-paid' });
  });
});
