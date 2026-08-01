import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelSpeech, renderSpeech } from '../../src/chat/voice';

afterEach(() => {
  cancelSpeech();
  vi.unstubAllGlobals();
});

describe('speech cancellation', () => {
  it('aborts an in-flight clip so the next conversation can use the provider queue', async () => {
    const calls: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        if (!signal) throw new Error('missing abort signal');
        calls.push(signal);
        if (calls.length === 2) return new Response('', { status: 503 });
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        });
      })
    );

    const oldClip = renderSpeech('old conversation');
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    const nextClip = renderSpeech('new conversation');

    await expect(oldClip).resolves.toBeNull();
    await expect(nextClip).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[0].aborted).toBe(true);
  });
});
