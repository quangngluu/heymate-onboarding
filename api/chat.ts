// Serverless chat endpoint. The API key lives here, in a server-side env var,
// and never reaches the browser. The client falls back to the scripted engine
// whenever this endpoint is unavailable or errors, so the demo never breaks.

import {
  buildSystemPrompt,
  type PromptSession,
  type PromptStoryState,
} from '../src/chat/prompt';
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
  mode?: 'open-chat' | 'quest';
  session: PromptSession;
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
  history: { role: 'user' | 'assistant'; content: string }[];
  questHistory?: { role: 'user' | 'assistant'; content: string }[];
  message: string;
}

// Edge runtime: this is a thin fetch proxy, so cold starts stay small.
export const config = { runtime: 'edge' };

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
const MAX_TOKENS = { short: 120, natural: 220, expressive: 320 } as const;
/**
 * Headroom for the trailing `<<state {...}>>` line.
 *
 * Without it the state line is the first thing the token cap eats, which looked
 * like the model ignoring the instruction — it was answering fully and getting
 * truncated. The budget is not part of what she is allowed to say.
 */
const STATE_BUDGET = 90;
const INVALID_ADDRESSING = /(^|[^\p{L}])(?:tôi|tao|tớ|mình(?!\s+anh(?=$|[^\p{L}]))|chị|cậu|bạn|ngươi|ngài|i|you|your)(?=$|[^\p{L}])/iu;

/**
 * A reply stopped by the token cap ends mid-clause, which reads as a bug. Cut
 * back to the last sentence she finished; keep the whole thing if there is no
 * clean break to fall back to.
 */
function trimToSentence(text: string | undefined, finishReason?: string): string | undefined {
  if (!text || finishReason !== 'length') return text;
  const cut = Math.max(
    text.lastIndexOf('.'),
    text.lastIndexOf('!'),
    text.lastIndexOf('?'),
    text.lastIndexOf('\u2026')
  );
  return cut > text.length * 0.4 ? text.slice(0, cut + 1) : text;
}

/**
 * Pull the relationship state off the end of a reply.
 *
 * She is asked to append one `<<state {...}>>` line so trust, desire, respect,
 * irritation and any unresolved conflict survive the turn instead of resetting.
 * It is stripped here and never reaches the browser as text. A missing or
 * malformed line is not an error — the caller simply keeps the previous state,
 * which is the safe direction to fail in.
 */
const STATE_RE = /<<\s*state\s*(\{[\s\S]*?\})\s*>>/;

function splitState(text: string): { text: string; state: unknown | null } {
  const m = text.match(STATE_RE);
  if (!m) return { text, state: null };
  const clean = text.replace(STATE_RE, '').trim();
  try {
    return { text: clean, state: JSON.parse(m[1]) as unknown };
  } catch {
    return { text: clean, state: null };
  }
}

/** Never leak a model turn that breaks the app-wide em/anh relationship. */
function hasInvalidAddressing(text: string): boolean {
  return INVALID_ADDRESSING.test(text);
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
  if (route !== 'sao' && route !== 'origin' && route !== 'hub') {
    return Response.json({ error: 'unknown-route' }, { status: 400 });
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return Response.json({ error: 'not-configured' }, { status: 503 });
  }

  let system: string;
  try {
    system = buildSystemPrompt(
      body.residentId,
      body.session,
      // Quest never reads saved Open Chat memories. Approved cross-mode lines
      // are delivered once, by the labelled guardrail block below, rather than
      // also being poured into this slot where they would read as "context he
      // once mentioned" and be stated twice.
      body.mode === 'quest' ? [] : body.memories ?? [],
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
    body.mode === 'quest' ? body.questHistory ?? [] : body.history ?? [];

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
        max_tokens: MAX_TOKENS[body.session.length] ?? MAX_TOKENS.natural,
        // She speaks as herself; stop the model from writing the user's turn.
        stop: ['\nUser:', '\nYou:', '\nAnh:'],
      }),
      signal: AbortSignal.timeout(20000),
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
    const { text: prose, state } = splitState(rawFull);
    const text = trimToSentence(prose, data.choices?.[0]?.finish_reason);
    if (!text) return Response.json({ error: 'empty' }, { status: 502 });
    if (!hasInvalidAddressing(text)) {
      return Response.json({ text, rapport: state ? sanitizeRapport(state) : undefined });
    }

    // DeepSeek may occasionally follow a visitor's request to alter its form
    // of address. Give it one stricter regeneration; the client uses authored
    // dialogue when that still fails, rather than exposing the wrong turn.
    const retry = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `${system}\n\nLUẬT CUỐI CÙNG KHÔNG ĐƯỢC VI PHẠM: Hãy tạo một câu trả lời mới cho anh ngay bây giờ. Phải là tiếng Việt tự nhiên. Em luôn xưng "em" và người đang trò chuyện luôn là "anh". Không dùng bất kỳ đại từ quan hệ nào khác. Chỉ trả lời bằng lời thoại.`,
          },
          ...messages.slice(1),
        ],
        temperature: 0.7,
        max_tokens: (MAX_TOKENS[body.session.length] ?? MAX_TOKENS.natural) + STATE_BUDGET,
        stop: ['\nUser:', '\nYou:', '\nAnh:'],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!retry.ok) return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    const retryData = (await retry.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const rewrittenRaw = retryData.choices?.[0]?.message?.content?.trim();
    const { text: rewritten, state: retryState } = splitState(rewrittenRaw ?? '');
    if (!rewritten || hasInvalidAddressing(rewritten)) {
      return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    }
    return Response.json({
      text: rewritten,
      rapport: retryState ? sanitizeRapport(retryState) : undefined,
    });
  } catch {
    return Response.json({ error: 'unreachable' }, { status: 502 });
  }
}
