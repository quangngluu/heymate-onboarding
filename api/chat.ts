// Serverless chat endpoint. The API key lives here, in a server-side env var,
// and never reaches the browser. The client falls back to the scripted engine
// whenever this endpoint is unavailable or errors, so the demo never breaks.

import {
  buildSystemPrompt,
  type PromptSession,
  type PromptStoryState,
} from '../src/chat/prompt';
import { effectivePromptSession, type ConversationMode } from '../src/chat/mode';
import {
  applyAddressingPatch,
  addressingRepairTokenBudget,
  addressingRepairMessages,
  parseAddressingPatch,
  repairAddressingDeterministically,
} from '../src/chat/addressing';
import { splitModelState, trimModelProse } from '../src/chat/model-response';
import { contextVisualIntentFromState } from '../src/chat/context-visual';
import { buildSeedPrompt } from '../src/chat/seed-prompt';
import { seedFor } from '../src/config/seed';
import {
  improvisedCanonFromState,
  IMPROVISED_CANON_MAX_ENTRIES,
} from '../src/chat/improvised-canon';
import { DEFAULT_DARK_VARIANT, type DarkVariant } from '../src/config/dark-patterns';
import { DEFAULT_MATURITY, type MaturityLevel } from '../src/config/maturity';
import { DEFAULT_ROUTE, type CanonRoute } from '../src/config/canon-route';
import {
  defaultBond,
  defaultRapport,
  sanitizeRapport,
  type BondDna,
  type Rapport,
} from '../src/config/bond';

interface ChatRequest {
  residentId: string;
  mode?: ConversationMode;
  session: Omit<PromptSession, 'face'> & { face?: unknown };
  memories: string[];
  approvedCrossMode?: string[];
  revealed: number;
  revealNow?: number | string;
  idle?: boolean;
  level?: number;
  quest?: { prompt: string; objective: string };
  story?: PromptStoryState;
  /** Narrative pressure variant this session is running. */
  dark?: DarkVariant;
  /** Intimacy register. Never trusted upward without the client's own gate. */
  maturity?: MaturityLevel;
  /** Which canon layer this session runs on. */
  route?: CanonRoute;
  /** The relationship this player shaped. */
  bond?: BondDna;
  /** Where the two of them stood before this turn. */
  rapport?: Rapport;
  /**
   * Ledger lines the client already budgeted. Retrieval happens client-side
   * because the ledger lives in the visitor's browser, and the 800-character
   * ceiling is enforced where the data is.
   */
  improvisedCanon?: string[];
  history: { role: 'user' | 'assistant'; content: string }[];
  questHistory?: { role: 'user' | 'assistant'; content: string }[];
  message: string;
}

// Edge runtime: this is a thin fetch proxy, so cold starts stay small.
export const config = { runtime: 'edge' };

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
const MAX_TOKENS = { short: 120, natural: 220, expressive: 320 } as const;
const OPEN_CHAT_STATE_ALLOWANCE = 80;
/** Stay inside the client's 20s request timeout across both upstream calls. */
const TOTAL_UPSTREAM_BUDGET_MS = 18_000;

function deadlineSignal(deadline: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1, deadline - Date.now()));
}

function sanitizeCrossMode(input: unknown): string[] {
  return (Array.isArray(input) ? input : [])
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim().slice(0, 240))
    .filter(Boolean)
    .slice(-8);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }
  const route = body.route ?? DEFAULT_ROUTE;
  if (route !== 'sao') {
    const error = route === 'origin' || route === 'hub' ? 'retired-route' : 'unknown-route';
    return Response.json({ error }, { status: 400 });
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return Response.json({ error: 'not-configured' }, { status: 503 });
  }

  const mode: ConversationMode = body.mode === 'quest' ? 'quest' : 'open-chat';
  const session = effectivePromptSession(body.session, mode);
  // The flag is read here rather than in the browser because the prompt is
  // assembled server-side; Vite's client env does not exist in this runtime.
  // Quest keeps the authored path unconditionally — quests.ts content still
  // depends on the full authored canon — and a resident with no seed falls
  // back too, so the authored path stays the default whenever PERSONA_SEED is
  // unset.
  const useSeed =
    process.env.PERSONA_SEED === 'on' &&
    mode === 'open-chat' &&
    seedFor(body.residentId) !== null;

  let system: string;
  try {
    system = useSeed
      ? buildSeedPrompt(
          body.residentId,
          session,
          // The client already applied the 800-character retrieval budget; this
          // slice only stops a hand-rolled request from reopening it.
          (body.improvisedCanon ?? []).slice(0, IMPROVISED_CANON_MAX_ENTRIES),
          sanitizeRapport(body.rapport ?? defaultRapport())
        )
      : buildSystemPrompt(
          body.residentId,
          session,
          // Quest never reads saved Open Chat memories. Approved cross-mode lines
          // are delivered once, by the labelled guardrail block below, rather than
          // also being poured into this slot where they would read as "context he
          // once mentioned" and be stated twice.
          mode === 'quest' ? [] : body.memories ?? [],
          body.revealed ?? 0,
          body.revealNow,
          body.idle,
          body.level ?? 0,
          body.quest,
          body.story,
          body.dark ?? DEFAULT_DARK_VARIANT,
          body.maturity === 'explicit' ? 'explicit' : DEFAULT_MATURITY,
          body.bond ?? defaultBond(),
          sanitizeRapport(body.rapport ?? defaultRapport()),
          String(body.message ?? ''),
          route
        );
  } catch {
    return Response.json({ error: 'unknown-resident' }, { status: 400 });
  }

  // Quest requests never read `history`, even if a stale or malicious client
  // sends it. Only the dedicated Quest transcript may enter the scene.
  const scopedHistory =
    mode === 'quest' ? body.questHistory ?? [] : body.history ?? [];

  // The cross-mode guardrail is *inserted*, not appended.
  //
  // The prompt ends with the `<<state …>>` contract, and it ends there
  // deliberately — the last instruction is the one that actually gets obeyed,
  // and an earlier version of that block came back as ±0.1 deltas when it was
  // not final. Appending after it pushed the contract into second-to-last
  // place on exactly the requests that carry approved memory, so the rapport
  // numbers Quest Mode depends on were the ones at risk.
  const approvedLines = sanitizeCrossMode(body.approvedCrossMode);
  if (approvedLines.length) {
    const guard = `KÝ ỨC ĐƯỢC PHÉP QUA CHẾ ĐỘ\n${approvedLines
      .map((line) => `- ${line}`)
      .join('\n')}\nKhông suy diễn thêm chi tiết đời thật ngoài danh sách này.`;
    const CONTRACT = 'BẮT BUỘC Ở CUỐI MỖI LƯỢT';
    const at = system.lastIndexOf(CONTRACT);
    system =
      at === -1
        ? `${system}\n\n${guard}`
        : `${system.slice(0, at)}${guard}\n\n${system.slice(at)}`;
  }

  const messages = [
    { role: 'system', content: system },
    ...scopedHistory.slice(-12),
    {
      role: 'user',
      // This is a turn trigger, not dialogue from the visitor. Passing the
      // idle line as user text made the model answer it instead of taking the
      // initiative the prompt asks for.
      content: body.idle
        ? '[The visitor is quiet. Speak first now.]'
        : String(body.message ?? '').slice(0, 500),
    },
  ];

  try {
    const deadline = Date.now() + TOTAL_UPSTREAM_BUDGET_MS;
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.92, // a distinct voice without generic/canon-drifting improvisation
        max_tokens:
          (MAX_TOKENS[session.length] ?? MAX_TOKENS.natural) +
          (mode === 'open-chat' && !body.idle ? OPEN_CHAT_STATE_ALLOWANCE : 0),
        // She speaks as herself; stop the model from writing the user's turn.
        stop: ['\nUser:', '\nYou:', '\nAnh:'],
      }),
      signal: deadlineSignal(deadline),
    });

    if (!upstream.ok) {
      return Response.json({ error: 'upstream', status: upstream.status }, { status: 502 });
    }
    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const rawFull = data.choices?.[0]?.message?.content?.trim();
    if (!rawFull) return Response.json({ error: 'empty' }, { status: 502 });
    // Split the state off first, then trim. Doing it the other way round means a
    // reply that hit the cap has its state line cut by trimToSentence, and the
    // addressing check ends up reading JSON rather than prose.
    const { text: prose, state } = splitModelState(rawFull);
    const text = trimModelProse(prose, data.choices?.[0]?.finish_reason);
    if (!text) return Response.json({ error: 'empty' }, { status: 502 });
    const rapport = state ? sanitizeRapport(state) : undefined;
    const visualIntent =
      mode === 'open-chat' && !body.idle
        ? contextVisualIntentFromState(state)
        : null;
    // Only Open Chat may grow the ledger. Quest canon is authored and is
    // written by its own path, so anything a Quest reply puts on the state
    // line is discarded here rather than reaching the visitor's store.
    const canon = mode === 'open-chat' ? improvisedCanonFromState(state) : [];
    const success = (nextText: string) =>
      Response.json({
        text: nextText,
        rapport,
        ...(visualIntent ? { visualIntent } : {}),
        ...(canon.length > 0 ? { canon } : {}),
      });
    const deterministic = repairAddressingDeterministically(text);
    if (!deterministic.before.length) {
      return success(text);
    }
    if (!deterministic.remaining.length) {
      return success(deterministic.text);
    }
    // English contractions cannot be repaired safely by replacing a pronoun
    // token (`I'm` must never become `Em'm`). Fail closed to authored copy.
    if (deterministic.remaining.some((item) => item.type === 'unsupported-english')) {
      return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    }

    // The model may classify/replace only the exact remaining spans. The app
    // applies the validated patch locally, so facts outside those spans are
    // byte-for-byte immutable and original rapport remains authoritative.
    const retry = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: addressingRepairMessages(deterministic.text, deterministic.remaining),
        temperature: 0,
        max_tokens: addressingRepairTokenBudget(deterministic.remaining.length),
        response_format: { type: 'json_object' },
      }),
      signal: deadlineSignal(deadline),
    });
    if (!retry.ok) return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    const retryData = (await retry.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const repairChoice = retryData.choices?.[0];
    if (!repairChoice?.message?.content || repairChoice.finish_reason !== 'stop') {
      return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    }
    const patch = parseAddressingPatch(repairChoice.message.content);
    const applied = patch
      ? applyAddressingPatch(deterministic.text, deterministic.remaining, patch)
      : { ok: false as const, error: 'invalid-json' };
    if (!applied.ok) {
      return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    }
    return success(applied.text);
  } catch {
    return Response.json({ error: 'unreachable' }, { status: 502 });
  }
}
