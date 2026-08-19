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
import {
  contextVisualIntentFromState,
  type ContextVisualIntent,
} from './context-visual';
import { improvisedCanonFromState, type ImprovisedFact } from './improvised-canon';

export type ChatSource = 'model' | 'scripted';

export interface ChatOutcome extends ReplyResult {
  source: ChatSource;
  /** What she reported about the relationship after this turn, if anything. */
  rapport?: unknown;
  /** Optional scene suggestion; generation and billing remain client policy. */
  visualIntent?: ContextVisualIntent;
  /** What she just invented about her own world, for the caller to record. */
  canon?: ImprovisedFact[];
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
    /**
     * Ledger lines the caller already retrieved and budgeted for this message.
     * Retrieval stays here because the ledger lives in this browser, so the
     * 800-character ceiling is enforced before the request leaves.
     */
    improvisedCanon?: string[];
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
        improvisedCanon: opts.improvisedCanon ?? [],
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

    const data = (await res.json()) as {
      text?: string;
      rapport?: unknown;
      visualIntent?: unknown;
      canon?: unknown;
      unavailable?: boolean;
    };
    if (data.unavailable === true) {
      endpointAvailable = false; // no model configured here
      return { ...scripted, source: 'scripted' };
    }
    if (!data.text) return { ...scripted, source: 'scripted' };
    // The reveal schedule stays owned by the app, not the model.
    return {
      text: data.text,
      revealedRung: opts.idle ? undefined : scripted.revealedRung,
      source: 'model',
      rapport: data.rapport,
      visualIntent:
        mode === 'open-chat'
          ? contextVisualIntentFromState({ visualIntent: data.visualIntent }) ?? undefined
          : undefined,
      // Re-sanitized on arrival rather than trusted: the server already
      // filtered it, but this is the boundary the store is written from, and
      // Quest must never grow the improvised ledger.
      canon:
        mode === 'open-chat'
          ? improvisedCanonFromState({ canon: data.canon })
          : [],
    };
  } catch {
    return { ...scripted, source: 'scripted' };
  }
}
