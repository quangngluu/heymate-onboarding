// Chat transport. Tries the server-side model first; falls back to the
// scripted engine whenever the endpoint is missing, slow or failing — so the
// prototype always answers, and `npm run dev` (no serverless runtime) works.

import {
  dueEpisodeIndex,
  reply as scriptedReply,
  type ReplyContext,
  type ReplyResult,
} from './engine';
import type { ChatTurn } from '../state/store';
import type { PromptStoryState } from './prompt';
import {
  effectivePromptSession,
  type ConversationMode,
  type PromptSessionInput,
} from './mode';
import { resolveDarkVariant } from '../config/dark-patterns';
import { resolveMaturity } from '../config/maturity';
import { resolveCanonRoute } from '../config/canon-route';

export type ChatSource = 'model' | 'scripted';

export interface ChatOutcome extends ReplyResult {
  source: ChatSource;
  /** What she reported about the relationship after this turn, if anything. */
  rapport?: unknown;
}

/** Skip the network entirely once we know there is no endpoint here. */
let endpointAvailable = true;

export async function getReply(
  message: string,
  ctx: Omit<ReplyContext, 'session'> & { session: PromptSessionInput },
  history: ChatTurn[],
  opts: {
    idle?: boolean;
    mode?: ConversationMode;
    level?: number;
    quest?: { prompt: string; objective: string };
    approvedCrossMode?: string[];
    story?: PromptStoryState;
    bond?: unknown;
    rapport?: unknown;
  } = {}
): Promise<ChatOutcome> {
  const route = resolveCanonRoute();
  const bond = opts.bond as { address?: unknown } | undefined;
  const address = typeof bond?.address === 'string' ? bond.address : '';
  const routedContext: ReplyContext = {
    ...ctx,
    route,
    session: { address, length: ctx.session.length },
  };
  // An idle nudge is already-authored dialogue, not a user message that the
  // scripted engine should try to answer. The model may vary it, but offline
  // and unavailable deployments must still let her speak first.
  const scripted = opts.idle ? { text: message } : scriptedReply(message, routedContext);

  if (!endpointAvailable) return { ...scripted, source: 'scripted' };

  try {
    const mode = opts.mode ?? 'open-chat';
    const session = effectivePromptSession(ctx.session, mode);
    const mappedHistory = history.map((t) => ({
      role: t.from === 'user' ? ('user' as const) : ('assistant' as const),
      content: t.text,
    }));
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residentId: ctx.resident.id,
        session,
        memories: ctx.memories,
        mode,
        approvedCrossMode: opts.approvedCrossMode ?? [],
        revealed: ctx.revealed,
        revealNow: opts.idle ? undefined : (dueEpisodeIndex(routedContext) ?? undefined),
        idle: opts.idle,
        level: opts.level ?? 0,
        quest: opts.quest,
        story: opts.story,
        dark: resolveDarkVariant(),
        maturity: resolveMaturity(),
        route,
        bond: opts.bond,
        rapport: opts.rapport,
        // Separate request fields make it impossible for the server to
        // accidentally consume Open Chat turns while operating in Quest Mode.
        history: mode === 'open-chat' ? mappedHistory : [],
        questHistory: mode === 'quest' ? mappedHistory : [],
        message,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (res.status === 404 || res.status === 503) {
      endpointAvailable = false; // no function deployed here
      return { ...scripted, source: 'scripted' };
    }
    if (!res.ok) return { ...scripted, source: 'scripted' };

    const data = (await res.json()) as { text?: string; rapport?: unknown };
    if (!data.text) return { ...scripted, source: 'scripted' };
    // The reveal schedule stays owned by the app, not the model.
    return {
      text: data.text,
      revealedRung: opts.idle ? undefined : scripted.revealedRung,
      source: 'model',
      rapport: data.rapport,
    };
  } catch {
    return { ...scripted, source: 'scripted' };
  }
}
