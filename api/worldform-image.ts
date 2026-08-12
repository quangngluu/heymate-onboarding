// Worldform image adapter. The browser sends a compiled, bounded prompt and a
// single canonical source image; the FAL credential never leaves this edge.

export const config = { runtime: 'edge' };

interface WorldformImageRequest {
  view: 'front' | 'side' | 'back';
  prompt: string;
  sourceImage: string;
  requestHash: string;
  seed?: number;
}

const FAL_KONTEXT = 'https://fal.run/fal-ai/flux-pro/kontext';
const DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const HASH = /^[a-f0-9]{8,64}$/;
const MAX_SOURCE = 2_400_000;
const MAX_PROMPT = 7_000;

function validSource(value: string): boolean {
  if (value.length > MAX_SOURCE) return false;
  if (DATA_IMAGE.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body: WorldformImageRequest;
  try {
    body = (await req.json()) as WorldformImageRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }

  if (!['front', 'side', 'back'].includes(body.view)) {
    return Response.json({ error: 'invalid-view' }, { status: 400 });
  }
  const prompt = String(body.prompt ?? '').trim();
  const sourceImage = String(body.sourceImage ?? '').trim();
  const requestHash = String(body.requestHash ?? '').trim();
  if (!prompt || prompt.length > MAX_PROMPT) {
    return Response.json({ error: 'invalid-prompt' }, { status: 400 });
  }
  if (!validSource(sourceImage)) {
    return Response.json({ error: 'invalid-source-image' }, { status: 400 });
  }
  if (!HASH.test(requestHash)) {
    return Response.json({ error: 'invalid-request-hash' }, { status: 400 });
  }
  const key = process.env.FAL_KEY;
  if (!key) return Response.json({ error: 'not-configured' }, { status: 503 });

  try {
    const response = await fetch(FAL_KONTEXT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
      body: JSON.stringify({
        prompt,
        image_url: sourceImage,
        aspect_ratio: '4:5',
        guidance_scale: body.view === 'front' ? 4 : 3.5,
        num_images: 1,
        output_format: 'jpeg',
        safety_tolerance: '3',
        seed: Number.isSafeInteger(body.seed) ? body.seed : undefined,
      }),
      signal: AbortSignal.timeout(75_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 180);
      return Response.json({ error: 'image-provider', detail }, { status: 502 });
    }
    const result = (await response.json()) as {
      request_id?: string;
      images?: { url?: string; content_type?: string }[];
      has_nsfw_concepts?: boolean[];
    };
    const uri = result.images?.[0]?.url;
    if (!uri) return Response.json({ error: 'no-image' }, { status: 502 });
    if (result.has_nsfw_concepts?.[0]) {
      return Response.json({ error: 'flagged' }, { status: 422 });
    }
    return Response.json(
      {
        uri,
        mimeType: result.images?.[0]?.content_type ?? 'image/jpeg',
        providerJobId: result.request_id ?? `fal-${requestHash}`,
        providerModel: 'fal-ai/flux-pro/kontext',
        // FAL does not return a stable dollar amount in this response. One unit
        // means one completed provider invocation, as required by the PRD.
        providerUnits: 1,
        estimatedCostUsd: null,
        mock: false,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 180) : 'unreachable';
    return Response.json({ error: 'image-provider-unreachable', detail }, { status: 502 });
  }
}
