import { defineConfig, loadEnv, type Plugin } from 'vite';

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
          const { buildSystemPrompt } = await server.ssrLoadModule('/src/chat/prompt.ts');
          const system = buildSystemPrompt(
            body.residentId,
            body.session,
            body.memories ?? [],
            body.revealed ?? 0,
            body.revealNow
          );
          const upstream = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: system },
                ...(body.history ?? []).slice(-12),
                { role: 'user', content: String(body.message ?? '').slice(0, 500) },
              ],
              temperature: 1.1,
              max_tokens: 220,
            }),
          });
          const data = await upstream.json();
          const text = data?.choices?.[0]?.message?.content?.trim();
          if (!text) {
            res.statusCode = 502;
            return res.end(JSON.stringify({ error: 'empty' }));
          }
          res.end(JSON.stringify({ text }));
        } catch {
          res.statusCode = 502;
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
    plugins: [devChatApi(env.DEEPSEEK_API_KEY ?? '')],
  };
});
