import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReply } from '../../src/chat/client';
import { RESIDENTS } from '../../src/config/residents';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Open Chat visual transport', () => {
  it('carries a validated visual intent with the model reply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          text: 'Em giữ khung đó lại.',
          visualIntent: {
            sceneBrief: 'Màn hình xanh trong phòng lưu trữ tối.',
            caption: 'Một khung hình được giữ lại.',
            confidence: 0.9,
          },
        })
      )
    );

    const result = await getReply(
      'Em đang nhìn gì?',
      {
        resident: RESIDENTS[0],
        session: { address: '', length: 'natural' },
        revealed: 0,
        memories: [],
        turn: 2,
      },
      [],
      { mode: 'open-chat' }
    );

    expect(result.source).toBe('model');
    expect(result.visualIntent).toEqual({
      sceneBrief: 'Màn hình xanh trong phòng lưu trữ tối.',
      caption: 'Một khung hình được giữ lại.',
      confidence: 0.9,
    });
  });
});
