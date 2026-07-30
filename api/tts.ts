// Serverless text-to-speech. Keys stay server-side; the browser only ever
// receives a URL to a finished audio file.
//
// The provider is asynchronous: submit text, then poll until the export is
// done. We poll here rather than in the browser so the client stays a single
// await, and we cap the wait so a slow render degrades to text-only instead
// of hanging the conversation.

import { delivery, type Delivery } from '../src/chat/dialogue';

export const config = { runtime: 'edge' };

const ENDPOINT = 'https://spoonai-tts-api.lucylab.io/json-rpc';
const MINIMAX_ENDPOINT = 'https://api.minimax.io/v1/t2a_v2';
const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 25000;

interface TtsRequest {
  text: string;
  /** Per-resident voice; falls back to the account default. */
  voiceId?: string;
  speed?: number;
  /**
   * The written line with its *beats* intact, and the session mood. Only
   * MiniMax can use them, so the markup is composed here rather than in the
   * browser: a provider that cannot read a pause tag would say it out loud.
   */
  raw?: string;
  mood?: string;
  /** Ask for raw PCM as it renders rather than a finished file. */
  stream?: boolean;
  /** Per-voice loudness trim; clips from different clones do not match. */
  vol?: number;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keep both MiniMax paths on the exact same emotional performance settings. */
function voiceSetting(body: TtsRequest, performed: Delivery, defaultVoice?: string) {
  const speed = clamp(finite(body.speed, 1) * performed.speedScale, 0.5, 2);
  return {
    voice_id: body.voiceId || defaultVoice,
    speed: Number(speed.toFixed(2)),
    vol: finite(body.vol, 1),
    pitch: performed.pitch,
    ...(performed.emotion ? { emotion: performed.emotion } : {}),
  };
}

async function rpc(key: string, method: string, input: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ method, input }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as { result?: Record<string, unknown>; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message ?? 'rpc-error');
  return data.result ?? {};
}

/**
 * MiniMax renders in one synchronous call rather than a job you poll, and it
 * can stream. This is the non-streaming form: enough to judge the voices
 * before rebuilding the playback path around chunks.
 */
async function minimax(body: TtsRequest, text: string): Promise<Response> {
  const key = process.env.MINIMAX_API_KEY;
  const defaultVoice = process.env.MINIMAX_VOICE_ID;
  if (!key) return Response.json({ error: 'not-configured' }, { status: 503 });

  const performed = delivery(body.raw || text, body.mood);
  if (body.stream) return minimaxStream(key, body, performed, defaultVoice);
  const upstream = await fetch(MINIMAX_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.MINIMAX_MODEL || 'speech-2.8-turbo',
      text: performed.text || text,
      voice_setting: voiceSetting(body, performed, defaultVoice),
      audio_setting: { format: 'mp3', sample_rate: 32000 },
      language_boost: 'Vietnamese',
    }),
    signal: AbortSignal.timeout(25000),
  });

  const data = (await upstream.json()) as {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  };
  // A MiniMax failure still arrives as HTTP 200 with a code in the envelope.
  if (data.base_resp?.status_code) {
    return Response.json(
      { error: 'upstream', code: data.base_resp.status_code, detail: data.base_resp.status_msg },
      { status: 502 }
    );
  }
  const hex = data.data?.audio;
  if (!hex) return Response.json({ error: 'no-audio' }, { status: 502 });

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new Response(bytes, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' },
  });
}

const PCM_RATE = 32000;

/**
 * Relay the render as it happens.
 *
 * MiniMax answers a streaming request with server-sent events carrying hex
 * audio. We unwrap them into a plain byte stream of signed 16-bit PCM, which
 * the browser can schedule piece by piece without a decoder. PCM rather than
 * mp3 because a decoder needs whole frames and a fragment of an mp3 is not
 * one; raw samples simply butt together.
 *
 * The provider's final event repeats the entire clip, so it is dropped.
 */
function minimaxStream(
  key: string,
  body: TtsRequest,
  performed: Delivery,
  defaultVoice?: string
): Response {
  const out = new TransformStream<Uint8Array, Uint8Array>();
  const writer = out.writable.getWriter();

  void (async () => {
    try {
      const upstream = await fetch(MINIMAX_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.MINIMAX_MODEL || 'speech-2.8-turbo',
          text: performed.text,
          stream: true,
          voice_setting: voiceSetting(body, performed, defaultVoice),
          audio_setting: { format: 'pcm', sample_rate: PCM_RATE },
          language_boost: 'Vietnamese',
        }),
        signal: AbortSignal.timeout(30000),
      });
      const reader = upstream.body?.getReader();
      if (!reader) throw new Error('no-body');

      const decoder = new TextDecoder();
      let buf = '';
      const drain = async () => {
        for (;;) {
          const cut = buf.indexOf('\n\n');
          if (cut < 0) break;
          const event = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const line = event.split(/\r?\n/).find((l) => l.startsWith('data:'));
          if (!line) continue;
          let parsed: { data?: { audio?: string; status?: number } };
          try {
            parsed = JSON.parse(line.slice(5));
          } catch {
            continue;
          }
          // status 2 is the summary, and it carries a copy of the whole clip.
          if (parsed.data?.status !== 1) continue;
          const hex = parsed.data.audio;
          if (!hex) continue;
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
          await writer.write(bytes);
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        await drain();
      }
      buf += decoder.decode();
      await drain();
    } catch {
      // A broken stream ends the response; the caller falls back to text.
    } finally {
      await writer.close().catch(() => undefined);
    }
  })();

  return new Response(out.readable, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Sample-Rate': String(PCM_RATE),
      'Cache-Control': 'no-store',
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const key = process.env.SPOON_API_KEY;
  const defaultVoice = process.env.SPOON_VOICE_ID;
  const usingMiniMax = process.env.TTS_PROVIDER === 'minimax';
  if (!usingMiniMax && (!key || !defaultVoice)) {
    return Response.json({ error: 'not-configured' }, { status: 503 });
  }

  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim().slice(0, 600);
  if (!text) return Response.json({ error: 'empty-text' }, { status: 400 });

  // One switch decides the provider, so a bad swap is one env var to undo.
  if (process.env.TTS_PROVIDER === 'minimax') {
    try {
      return await minimax(body, text);
    } catch (e) {
      return Response.json({ error: 'upstream', detail: String(e).slice(0, 120) }, { status: 502 });
    }
  }

  // Everything past the switch is the Spoon path. The guard above already
  // rejected a missing Spoon key for it; restated here so it is a type fact
  // too, rather than something only the control flow knows.
  if (!key || !defaultVoice) return Response.json({ error: 'not-configured' }, { status: 503 });

  try {
    // The account allows one export at a time; a burst of lines can collide,
    // so back off briefly rather than dropping the line.
    let submitted: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        submitted = await rpc(key, 'ttsLongText', {
          text,
          userVoiceId: body.voiceId || defaultVoice,
          speed: body.speed ?? 1,
        });
        break;
      } catch (e) {
        // "export in progress" is our own queue colliding; "Redis is loading"
        // is the provider warming up. Both clear on their own.
        const msg = String(e);
        const transient = msg.includes('export in progress') || msg.includes('Redis is loading');
        if (!transient || attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    if (!submitted) return Response.json({ error: 'busy' }, { status: 503 });
    const jobId = submitted.projectExportId as string | undefined;
    if (!jobId) return Response.json({ error: 'no-job' }, { status: 502 });

    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
      const status = await rpc(key, 'getExportStatus', { projectExportId: jobId });
      const state = status.state as string;
      if (state === 'completed' && typeof status.url === 'string') {
        // The provider echoes its CORS headers three times, which browsers
        // treat as invalid, so we relay the bytes from our own origin.
        const audio = await fetch(status.url, { signal: AbortSignal.timeout(20000) });
        if (!audio.ok) return Response.json({ error: 'fetch-audio' }, { status: 502 });
        return new Response(audio.body, {
          headers: {
            'Content-Type': 'audio/wav',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
      if (state === 'failed') return Response.json({ error: 'render-failed' }, { status: 502 });
      if (Date.now() > deadline) return Response.json({ error: 'timeout', jobId }, { status: 504 });
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  } catch (e) {
    return Response.json({ error: 'upstream', detail: String(e).slice(0, 120) }, { status: 502 });
  }
}
