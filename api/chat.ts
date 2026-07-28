// Serverless chat endpoint. The API key lives here, in a server-side env var,
// and never reaches the browser. The client falls back to the scripted engine
// whenever this endpoint is unavailable or errors, so the demo never breaks.

import { buildSystemPrompt, type PromptSession } from '../src/chat/prompt';

interface ChatRequest {
  residentId: string;
  session: PromptSession;
  memories: string[];
  revealed: number;
  revealNow?: number;
  idle?: boolean;
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
}

// Edge runtime: this is a thin fetch proxy, so cold starts stay small.
export const config = { runtime: 'edge' };

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
const MAX_TOKENS = { short: 70, natural: 130, expressive: 180 } as const;
const INVALID_ADDRESSING = /(^|[^\p{L}])(?:tôi|tao|tớ|mình(?!\s+anh(?=$|[^\p{L}]))|chị|cậu|bạn|ngươi|ngài|i|you|your)(?=$|[^\p{L}])/iu;

/** Never leak a model turn that breaks the app-wide em/anh relationship. */
function hasInvalidAddressing(text: string): boolean {
  return INVALID_ADDRESSING.test(text);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return Response.json({ error: 'not-configured' }, { status: 503 });
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }

  let system: string;
  try {
    system = buildSystemPrompt(
      body.residentId,
      body.session,
      body.memories ?? [],
      body.revealed ?? 0,
      body.revealNow,
      body.idle
    );
  } catch {
    return Response.json({ error: 'unknown-resident' }, { status: 400 });
  }

  const messages = [
    { role: 'system', content: system },
    ...(body.history ?? []).slice(-12),
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
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return Response.json({ error: 'empty' }, { status: 502 });
    if (!hasInvalidAddressing(text)) return Response.json({ text });

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
        max_tokens: MAX_TOKENS[body.session.length] ?? MAX_TOKENS.natural,
        stop: ['\nUser:', '\nYou:', '\nAnh:'],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!retry.ok) return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    const retryData = (await retry.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const rewritten = retryData.choices?.[0]?.message?.content?.trim();
    if (!rewritten || hasInvalidAddressing(rewritten)) {
      return Response.json({ error: 'invalid-addressing' }, { status: 502 });
    }
    return Response.json({ text: rewritten });
  } catch {
    return Response.json({ error: 'unreachable' }, { status: 502 });
  }
}
