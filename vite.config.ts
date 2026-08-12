import { execSync } from 'node:child_process';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Runs the same chat endpoint as the deployed edge function during
 * `npm run dev`, using DEEPSEEK_API_KEY from .env.local. Without this the dev
 * server 404s on /api/chat and the app silently drops to scripted replies,
 * which makes local behaviour differ from production.
 */
function devChatApi(key: string, model: string): Plugin {
  return {
    name: 'dev-chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        try {
          // Run the real edge handler in development so prompt derivation,
          // repair, timeouts and failure semantics cannot drift by copy/paste.
          process.env.DEEPSEEK_API_KEY ??= key;
          process.env.DEEPSEEK_MODEL ??= model;
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const method = req.method ?? 'GET';
          const { default: handler } = await server.ssrLoadModule('/api/chat.ts');
          const response = await handler(
            new Request(`http://localhost${req.url ?? '/api/chat'}`, {
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

/** Generic Vite bridge for the new Worldform edge adapters. */
function devWorldformApi(
  route: '/api/worldform-image' | '/api/worldform-3d',
  modulePath: '/api/worldform-image.ts' | '/api/worldform-3d.ts',
  environment: Record<string, string>
): Plugin {
  return {
    name: `dev-${route.slice(1).replaceAll('/', '-')}`,
    configureServer(server) {
      server.middlewares.use(route, async (req, res) => {
        try {
          for (const [name, value] of Object.entries(environment)) {
            process.env[name] ??= value;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const method = req.method ?? 'GET';
          const contentType = Array.isArray(req.headers['content-type'])
            ? req.headers['content-type'][0]
            : req.headers['content-type'];
          const { default: handler } = await server.ssrLoadModule(modulePath);
          const response = await handler(
            new Request(`http://localhost${req.url ?? route}`, {
              method,
              headers: { 'Content-Type': contentType ?? 'application/json' },
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

/**
 * A build id the running page can report.
 *
 * Manual releases provide VITE_BUILD_ID explicitly. Git-connected Vercel builds
 * expose VERCEL_GIT_COMMIT_SHA; local builds fall back to git.
 * Without this a stale tab is indistinguishable from a fresh one, which cost a
 * QA cycle: a superseded bundle kept working from memory while its asset URL
 * 404ed, and the resulting bug report described something already fixed.
 */
function buildId(env: Record<string, string>): string {
  if (env.VITE_BUILD_ID?.trim()) return env.VITE_BUILD_ID.trim();
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    server: { port: 5199 },
    build: { target: 'es2022' },
    define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId(env)) },
    plugins: [
      devChatApi(env.DEEPSEEK_API_KEY ?? '', env.DEEPSEEK_MODEL ?? 'deepseek-chat'),
      devTtsApi(env.SPOON_API_KEY ?? '', env.SPOON_VOICE_ID ?? ''),
      devQuestApi(env.DEEPSEEK_API_KEY ?? ''),
      devSceneImageApi(env.DEEPSEEK_API_KEY ?? '', env.FAL_KEY ?? ''),
      devWorldformApi('/api/worldform-image', '/api/worldform-image.ts', {
        FAL_KEY: env.FAL_KEY ?? '',
      }),
      devWorldformApi('/api/worldform-3d', '/api/worldform-3d.ts', {
        MESHY_API_KEY: env.MESHY_API_KEY ?? '',
      }),
    ],
  };
});
