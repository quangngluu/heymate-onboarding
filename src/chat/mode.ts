import type { PromptSession } from './prompt';
import type { Face } from '../config/face';
import type { ResidentId } from '../config/residents';

export type ConversationMode = 'open-chat' | 'quest';

/** Face is a property of the active product mode, never a visitor setting. */
export function faceForMode(mode: ConversationMode): Face {
  return mode === 'quest' ? 'story' : 'companion';
}

export type PromptSessionInput = Omit<PromptSession, 'face'> & {
  /** Accepted only so stale clients can be normalised safely. Never trusted. */
  face?: unknown;
};

/**
 * Construct the prompt-facing session at the request boundary.
 *
 * Spreading first is deliberate: a legacy `face` value cannot overwrite the
 * mode-derived value that is written last.
 */
export function effectivePromptSession(
  session: PromptSessionInput,
  mode: ConversationMode
): PromptSession {
  return {
    persona: session.persona,
    identity: session.identity,
    scenario: session.scenario,
    length: session.length,
    face: faceForMode(mode),
  };
}

export type ConversationScope = `chat:${ResidentId}` | `quest:${string}`;

interface ConversationState {
  residentId: ResidentId;
  activeQuestId: string | null;
}

export interface ConversationToken {
  residentId: ResidentId;
  scope: ConversationScope;
  epoch: number;
}

function scopeFor(state: ConversationState): ConversationScope {
  return state.activeQuestId
    ? `quest:${state.activeQuestId}`
    : `chat:${state.residentId}`;
}

/** Invalidates asynchronous work whenever the visible conversation changes. */
export class ConversationLifetime {
  private epoch = 0;

  capture(state: ConversationState): ConversationToken {
    return { residentId: state.residentId, scope: scopeFor(state), epoch: this.epoch };
  }

  transition(): void {
    this.epoch += 1;
  }

  isCurrent(token: ConversationToken, state: ConversationState): boolean {
    return (
      token.epoch === this.epoch &&
      token.residentId === state.residentId &&
      token.scope === scopeFor(state)
    );
  }
}
