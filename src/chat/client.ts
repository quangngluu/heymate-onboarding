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

export type ChatSource = 'model' | 'scripted';

export interface ChatOutcome extends ReplyResult {
  source: ChatSource;
}

/** Skip the network entirely once we know there is no endpoint here. */
let endpointAvailable = true;

export async function getReply(
  message: string,
  ctx: ReplyContext,
  history: ChatTurn[],
  opts: { idle?: boolean; level?: number; quest?: { prompt: string; objective: string } } = {}
): Promise<ChatOutcome> {
  // An idle nudge is already-authored dialogue, not a user message that the
  // scripted engine should try to answer. The model may vary it, but offline
  // and unavailable deployments must still let her speak first.
  const scripted = opts.idle ? { text: message } : scriptedReply(message, ctx);

  if (!endpointAvailable) return { ...scripted, source: 'scripted' };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residentId: ctx.resident.id,
        session: ctx.session,
        memories: ctx.memories,
        revealed: ctx.revealed,
        revealNow: opts.idle ? undefined : (dueEpisodeIndex(ctx) ?? undefined),
        idle: opts.idle,
        level: opts.level ?? 0,
        quest: opts.quest,
        history: history.map((t) => ({
          role: t.from === 'user' ? 'user' : 'assistant',
          content: t.text,
        })),
        message,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (res.status === 404 || res.status === 503) {
      endpointAvailable = false; // no function deployed here
      return { ...scripted, source: 'scripted' };
    }
    if (!res.ok) return { ...scripted, source: 'scripted' };

    const data = (await res.json()) as { text?: string };
    if (!data.text) return { ...scripted, source: 'scripted' };
    // The reveal schedule stays owned by the app, not the model.
    return {
      text: data.text,
      revealedRung: opts.idle ? undefined : scripted.revealedRung,
      source: 'model',
    };
  } catch {
    return { ...scripted, source: 'scripted' };
  }
}
