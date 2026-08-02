import { describe, expect, it } from 'vitest';
import { effectivePromptSession } from '../../src/chat/mode';
import { Store } from '../../src/state/store';

describe('conversation session boundary', () => {
  it('does not expose the audio voice slot as a conversation setting', () => {
    const legacySession = {
      persona: '',
      identity: '',
      scenario: 'casual' as const,
      length: 'natural' as const,
      voice: 'alternate',
    };

    expect(effectivePromptSession(legacySession, 'open-chat')).not.toHaveProperty('voice');
    expect(new Store().get().session).not.toHaveProperty('voice');
  });
});
