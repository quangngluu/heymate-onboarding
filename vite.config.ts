import { defineConfig, loadEnv, type Plugin } from 'vite';

const MAX_TOKENS = { short: 70, natural: 130, expressive: 180 } as const;
/** Headroom for the trailing state line; see STATE_BUDGET in api/chat.ts. */
const STATE_BUDGET = 90;
const INVALID_ADDRESSING = /(^|[^\p{L}])(?:tôi|tao|tớ|mình(?!\s+anh(?=$|[^\p{L}]))|chị|cậu|bạn|ngươi|ngài|i|you|your)(?=$|[^\p{L}])/iu;

function hasInvalidAddressing(text: string): boolean {
  return INVALID_ADDRESSING.test(text);
}

/**
 * Runs the same chat endpoint as the deployed edge function during
 * `npm run dev`, using DEEPSEEK_API_KEY from .env.local. Without this the dev
 * server 404s on /api/chat and the app silently drops to scripted replies,
 * which makes local behaviour differ from production.
 */
function devChatApi(key: string): Plugin {
  return {
    name: 'dev-chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        res.setHeader('Content-Type', 'application/json');
        if (!key) {
          res.statusCode = 503;
          return res.end(JSON.stringify({ error: 'not-configured' }));
        }
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (
            body.route !== undefined &&
            body.route !== 'origin' &&
            body.route !== 'hub' &&
            body.route !== 'sao'
          ) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'unknown-route' }));
          }
          const route = body.route ?? 'hub';
          const { buildSystemPrompt } = await server.ssrLoadModule('/src/chat/prompt.ts');
          let system = buildSystemPrompt(
            body.residentId,
            body.session,
            body.mode === 'quest' ? [] : body.memories ?? [],
            body.revealed ?? 0,
            body.idle ? undefined : body.revealNow,
            body.idle,
            body.level ?? 0,
            body.quest,
            body.story,
            body.dark,
            body.maturity,
            body.bond,
            body.rapport,
            body.message,
            route
          );
          const approved = (Array.isArray(body.approvedCrossMode) ? body.approvedCrossMode : [])
            .filter((line: unknown): line is string => typeof line === 'string')
            .map((line: string) => line.trim().slice(0, 240))
            .filter(Boolean)
            .slice(-8);
          if (approved.length) {
            const guard = `KÝ ỨC ĐƯỢC PHÉP QUA CHẾ ĐỘ\n${approved
              .map((line: string) => `- ${line}`)
              .join('\n')}\nKhông suy diễn thêm chi tiết đời thật ngoài danh sách này.`;
            const contract = 'BẮT BUỘC Ở CUỐI MỖI LƯỢT';
            const at = system.lastIndexOf(contract);
            system =
              at === -1
                ? `${system}\n\n${guard}`
                : `${system.slice(0, at)}${guard}\n\n${system.slice(at)}`;
          }
          const model = 'deepseek-chat';
          const messages = [
            { role: 'system', content: system },
            ...(body.mode === 'quest' ? body.questHistory ?? [] : body.history ?? []).slice(-12),
            {
              role: 'user',
              content: body.idle
                ? '[The visitor is quiet. Speak first now.]'
                : String(body.message ?? '').slice(0, 500),
            },
          ];
          const upstream = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.92,
              max_tokens: (MAX_TOKENS[body.session.length] ?? MAX_TOKENS.natural) + STATE_BUDGET,
              stop: ['\nUser:', '\nYou:', '\nAnh:'],
            }),
          });
          const data = await upstream.json();
          const raw = data?.choices?.[0]?.message?.content?.trim();
          if (!raw) {
            res.statusCode = 502;
            return res.end(JSON.stringify({ error: 'empty' }));
          }
          const stateMatch = raw.match(/<<\s*state\s*(\{[\s\S]*?\})\s*>>/);
          const text = raw.replace(/<<\s*state\s*\{[\s\S]*?\}\s*>>/, '').trim();
          let rapport;
          if (stateMatch) {
            try {
              rapport = JSON.parse(stateMatch[1]);
            } catch {
              rapport = undefined;
            }
          }
          if (!text) {
            res.statusCode = 502;
            return res.end(JSON.stringify({ error: 'empty' }));
          }
          if (!hasInvalidAddressing(text)) return res.end(JSON.stringify({ text, rapport }));

          const retry = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content:
                    `${system}\n\nLUẬT CUỐI CÙNG KHÔNG ĐƯỢC VI PHẠM: Hãy tạo một câu trả lời mới cho anh ngay bây giờ. Phải là tiếng Việt tự nhiên. Em luôn xưng "em" và người đang trò chuyện luôn là "anh". Không dùng bất kỳ đại từ quan hệ nào khác. Chỉ trả lời bằng lời thoại.`,
                },
                ...messages.slice(1),
              ],
              temperature: 0.7,
              max_tokens: (MAX_TOKENS[body.session.length] ?? MAX_TOKENS.natural) + STATE_BUDGET,
              stop: ['\nUser:', '\nYou:', '\nAnh:'],
            }),
          });
          const retryData = await retry.json();
          const rewritten = retryData?.choices?.[0]?.message?.content?.trim();
          if (!rewritten || hasInvalidAddressing(rewritten)) {
            res.statusCode = 502;
            return res.end(JSON.stringify({ error: 'invalid-addressing' }));
          }
          res.end(JSON.stringify({ text: rewritten }));
        } catch {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'unreachable' }));
        }
      });
    },
  };
}

/**
 * Mirrors the deployed Spoon TTS handler in Vite development. Keeping this
 * route available locally matters because the stage prepares speech before it
 * reveals a reply; a dev-only 404 otherwise makes local behaviour misleading.
 */
function devTtsApi(key: string, defaultVoice: string): Plugin {
  return {
    name: 'dev-tts-api',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const contentType = Array.isArray(req.headers['content-type'])
          ? req.headers['content-type'][0]
          : req.headers['content-type'];

        try {
          // The serverless handler reads Vercel-style environment variables.
          // Only fill absent values so an explicitly exported local value wins.
          process.env.SPOON_API_KEY ??= key;
          process.env.SPOON_VOICE_ID ??= defaultVoice;

          const { default: handler } = await server.ssrLoadModule('/api/tts.ts');
          const response = await handler(
            new Request(`http://localhost${req.url ?? '/api/tts'}`, {
              method: req.method,
              headers: { 'Content-Type': contentType ?? 'application/json' },
              body: Buffer.concat(chunks),
            })
          );

          res.statusCode = response.status;
          response.headers.forEach((value, header) => res.setHeader(header, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'unreachable' }));
        }
      });
    },
  };
}

/**
 * Mirrors the edge scene-writer in Vite too. Without it, generated quests
 * silently never arrive during local QA while production takes a different
 * route.
 */
function devQuestApi(key: string): Plugin {
  return {
    name: 'dev-quest-api',
    configureServer(server) {
      server.middlewares.use('/api/quest', async (req, res) => {
        try {
          // The edge handler reads Vercel-style environment variables; Vite's
          // loaded .env.local values must be supplied explicitly in dev.
          process.env.DEEPSEEK_API_KEY ??= key;
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const method = req.method ?? 'GET';
          const { default: handler } = await server.ssrLoadModule('/api/quest.ts');
          const response = await handler(
            new Request(`http://localhost${req.url ?? '/api/quest'}`, {
              method,
              headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
              body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
            })
          );

          res.statusCode = response.status;
          response.headers.forEach((value, header) => res.setHeader(header, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'unreachable' }));
        }
      });
    },
  };
}

/** Keep optional branch illustrations on the same route in dev and Vercel. */
function devSceneImageApi(writerKey: string, drawerKey: string): Plugin {
  return {
    name: 'dev-scene-image-api',
    configureServer(server) {
      server.middlewares.use('/api/scene-image', async (req, res) => {
        try {
          process.env.DEEPSEEK_API_KEY ??= writerKey;
          process.env.FAL_KEY ??= drawerKey;
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const method = req.method ?? 'GET';
          const { default: handler } = await server.ssrLoadModule('/api/scene-image.ts');
          const response = await handler(
            new Request(`http://localhost${req.url ?? '/api/scene-image'}`, {
              method,
              headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
              body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
            })
          );

          res.statusCode = response.status;
          response.headers.forEach((value, header) => res.setHeader(header, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'unreachable' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    server: { port: 5199 },
    build: { target: 'es2022' },
    plugins: [
      devChatApi(env.DEEPSEEK_API_KEY ?? ''),
      devTtsApi(env.SPOON_API_KEY ?? '', env.SPOON_VOICE_ID ?? ''),
      devQuestApi(env.DEEPSEEK_API_KEY ?? ''),
      devSceneImageApi(env.DEEPSEEK_API_KEY ?? '', env.FAL_KEY ?? ''),
    ],
  };
});
