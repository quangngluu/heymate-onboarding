import { describe, expect, it } from 'vitest';
import {
  ConversationLifetime,
  effectivePromptSession,
  faceForMode,
} from '../../src/chat/mode';

const session = {
  nickname: 'K',
  persona: 'ít lời',
  identity: '',
  scenario: 'casual' as const,
  length: 'natural' as const,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('mode-derived face', () => {
  it('maps Open Chat to companion and Quest to story', () => {
    expect(faceForMode('open-chat')).toBe('companion');
    expect(faceForMode('quest')).toBe('story');
  });

  it('ignores a legacy face value at the request boundary', () => {
    expect(effectivePromptSession({ ...session, face: 'story' }, 'open-chat').face).toBe(
      'companion'
    );
    expect(effectivePromptSession({ ...session, face: 'companion' }, 'quest').face).toBe(
      'story'
    );
  });
});

describe('conversation lifetime', () => {
  it('rejects an Open Chat reply resolved after Quest starts', async () => {
    const lifetime = new ConversationLifetime();
    const state = { residentId: 'rin' as const, activeQuestId: null as string | null };
    const token = lifetime.capture(state);
    const reply = deferred<{ text: string; rapport: number }>();
    const applied: string[] = [];

    const completion = reply.promise.then((result) => {
      if (lifetime.isCurrent(token, state)) {
        applied.push(result.text, `rapport:${result.rapport}`, 'tts');
      }
    });

    state.activeQuestId = 'rin-twelfth-frame';
    lifetime.transition();
    reply.resolve({ text: 'late-open-chat', rapport: 1 });
    await completion;

    expect(applied).toEqual([]);
  });

  it('rejects a Quest reply resolved after returning to Open Chat', async () => {
    const lifetime = new ConversationLifetime();
    const state = {
      residentId: 'rin' as const,
      activeQuestId: 'rin-twelfth-frame' as string | null,
    };
    const token = lifetime.capture(state);
    const reply = deferred<string>();
    const applied: string[] = [];

    const completion = reply.promise.then((text) => {
      if (lifetime.isCurrent(token, state)) applied.push(text, 'tts');
    });

    lifetime.transition();
    state.activeQuestId = null;
    reply.resolve('late-quest');
    await completion;

    expect(applied).toEqual([]);
  });
});
