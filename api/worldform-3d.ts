// Meshy Multi-Image-to-3D adapter. Tasks are submitted and polled separately;
// the browser never waits synchronously for 3D generation to finish.

export const config = { runtime: 'edge' };

const MESHY = 'https://api.meshy.ai/openapi/v1/multi-image-to-3d';
const DATA_IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE = 3_800_000;

interface CreateRequest {
  images: string[];
  texturePrompt?: string;
  requestHash?: string;
}

function validImage(value: string): boolean {
  if (!value || value.length > MAX_IMAGE) return false;
  if (DATA_IMAGE.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mappedStatus(status: string): 'queued' | 'running' | 'succeeded' | 'failed' {
  if (status === 'SUCCEEDED') return 'succeeded';
  if (status === 'FAILED' || status === 'CANCELED' || status === 'EXPIRED') return 'failed';
  if (status === 'PENDING') return 'queued';
  return 'running';
}

export default async function handler(req: Request): Promise<Response> {
  const key = process.env.MESHY_API_KEY;
  if (!key) return Response.json({ error: 'not-configured' }, { status: 503 });
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
    if (!/^[0-9A-Za-z-]{8,96}$/.test(id)) {
      return Response.json({ error: 'invalid-job-id' }, { status: 400 });
    }
    try {
      const response = await fetch(`${MESHY}/${encodeURIComponent(id)}`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 180);
        return Response.json({ error: 'three-d-provider', detail }, { status: 502 });
      }
      const task = (await response.json()) as {
        status?: string;
        progress?: number;
        model_urls?: { glb?: string; obj?: string; stl?: string };
        thumbnail_url?: string;
        consumed_credits?: number;
        task_error?: { message?: string };
      };
      return Response.json(
        {
          status: mappedStatus(task.status ?? ''),
          progress: Number.isFinite(task.progress) ? task.progress : 0,
          modelUrls: task.model_urls,
          previewUrl: task.thumbnail_url,
          providerUnits: Number.isFinite(task.consumed_credits) ? task.consumed_credits : 0,
          estimatedCostUsd: null,
          error: task.task_error?.message || undefined,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 180) : 'unreachable';
      return Response.json({ error: 'three-d-provider-unreachable', detail }, { status: 502 });
    }
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body: CreateRequest;
  try {
    body = (await req.json()) as CreateRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }
  if (!Array.isArray(body.images) || body.images.length !== 3 || !body.images.every(validImage)) {
    return Response.json({ error: 'three-valid-images-required' }, { status: 400 });
  }
  const texturePrompt = String(body.texturePrompt ?? '').trim().slice(0, 600);
  try {
    const response = await fetch(MESHY, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_urls: body.images,
        ai_model: 'latest',
        should_texture: true,
        enable_pbr: true,
        texture_resolution: '2k',
        texture_prompt: texturePrompt || undefined,
        should_remesh: false,
        image_enhancement: false,
        remove_lighting: true,
        moderation: true,
        target_formats: ['glb', 'obj', 'stl'],
        auto_size: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 180);
      return Response.json({ error: 'three-d-provider', detail }, { status: 502 });
    }
    const data = (await response.json()) as { result?: string };
    if (!data.result) return Response.json({ error: 'missing-job-id' }, { status: 502 });
    return Response.json(
      { providerJobId: data.result, providerModel: 'meshy-latest' },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 180) : 'unreachable';
    return Response.json({ error: 'three-d-provider-unreachable', detail }, { status: 502 });
  }
}
