// She writes her own scene once ours have run out.
//
// The five authored quests per resident are the spine of her story and they
// end. Rather than let the ladder stop there, she is asked for another one in
// the same shape: an invitation in her voice, an objective, and three answers a
// visitor could honestly give. Nothing here opens a memory, because there are
// none left; the reward is credits.

import { buildSystemPrompt, type PromptSession } from '../src/chat/prompt';
import { RESIDENTS } from '../src/config/residents';
import { DEFAULT_DARK_VARIANT, type DarkVariant } from '../src/config/dark-patterns';
import { DEFAULT_ROUTE, type CanonRoute } from '../src/config/canon-route';

interface QuestRequest {
  residentId: string;
  session: PromptSession;
  memories: string[];
  revealed: number;
  level?: number;
  /** Titles she has already used, so she does not circle the same ground. */
  used: string[];
  /** Narrative pressure variant this session is running. */
  dark?: DarkVariant;
  route?: CanonRoute;
}

export const config = { runtime: 'edge' };

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

const SHAPE = `Trả về DUY NHẤT một object JSON, không kèm giải thích, không kèm dấu \`\`\`:
{
  "title": "tên cảnh, 2 đến 4 chữ",
  "prompt": "lời em mời anh, một hoặc hai câu, đúng giọng em",
  "objective": "một câu ngắn nói anh cần đưa em điều gì",
  "options": ["ba câu trả lời anh có thể đưa ra", "mỗi câu là lời của anh", "mỗi câu ít nhất 20 ký tự"]
}`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return Response.json({ error: 'not-configured' }, { status: 503 });

  let body: QuestRequest;
  try {
    body = (await req.json()) as QuestRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }

  if (!RESIDENTS.some((resident) => resident.id === body.residentId)) {
    return Response.json({ error: 'unknown-resident' }, { status: 400 });
  }
  const route = body.route ?? DEFAULT_ROUTE;
  if (route !== 'origin' && route !== 'hub' && route !== 'sao') {
    return Response.json({ error: 'unknown-route' }, { status: 400 });
  }

  // Her canon and her voice, so the scene sounds like her and not like a form.
  const system = buildSystemPrompt(
    body.residentId,
    body.session,
    body.memories ?? [],
    body.revealed ?? 0,
    undefined,
    false,
    body.level ?? 0,
    undefined,
    undefined,
    body.dark ?? DEFAULT_DARK_VARIANT,
    undefined,
    undefined,
    undefined,
    undefined,
    route
    // Scene invitations stay at the default register regardless of the session:
    // a quest hook is structure, not intimacy.
  );

  const used = (Array.isArray(body.used) ? body.used : [])
    .filter((title): title is string => typeof title === 'string')
    .slice(-12)
    .join('; ');
  const ask = [
    'Em hãy nghĩ ra một cảnh mới để mời anh vào, giống những nhiệm vụ em từng mở nhưng không lặp lại chúng.',
    used ? `Những cảnh đã dùng rồi, đừng lặp: ${used}.` : '',
    'Cảnh phải hỏi anh một điều thật về đời anh, không phải câu đố, không phải trò chơi chữ.',
    'Ba lựa chọn là lời của anh, ba hướng khác nhau, mỗi câu nghe như người thật nói.',
    SHAPE,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 1,
        max_tokens: 420,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: ask },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!upstream.ok) return Response.json({ error: 'upstream' }, { status: 502 });

    const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as {
      title?: string;
      prompt?: string;
      objective?: string;
      options?: string[];
    };

    const options = (Array.isArray(parsed.options) ? parsed.options : [])
      .filter((option): option is string => typeof option === 'string' && option.trim().length >= 20)
      .map((option) => option.trim().slice(0, 160))
      .slice(0, 3);
    if (
      !parsed.title ||
      !parsed.prompt ||
      !parsed.objective ||
      options.length !== 3 ||
      new Set(options.map((option) => option.toLocaleLowerCase('vi-VN'))).size !== 3
    ) {
      return Response.json({ error: 'bad-shape' }, { status: 502 });
    }

    return Response.json({
      title: parsed.title.trim().slice(0, 40),
      prompt: parsed.prompt.trim().slice(0, 240),
      objective: parsed.objective.trim().slice(0, 120),
      options,
    });
  } catch {
    return Response.json({ error: 'upstream' }, { status: 502 });
  }
}
