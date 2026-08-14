// Exchanges server-only Hume credentials for a short-lived browser token.
// The credential pair never crosses this edge boundary.

export const config = { runtime: 'edge' };

const TOKEN_ENDPOINT = 'https://api.hume.ai/oauth2-cc/token';

interface HumeTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

function basicCredential(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const apiKey = process.env.HUME_API_KEY;
  const secretKey = process.env.HUME_SECRET_KEY;
  if (!apiKey || !secretKey) return json({ error: 'not-configured' }, 503);

  try {
    const upstream = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicCredential(`${apiKey}:${secretKey}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) return json({ error: 'upstream' }, 502);

    const data = (await upstream.json()) as HumeTokenResponse;
    if (
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      typeof data.expires_in !== 'number' ||
      !Number.isFinite(data.expires_in)
    ) {
      return json({ error: 'upstream' }, 502);
    }

    return json({ access_token: data.access_token, expires_in: data.expires_in }, 200);
  } catch {
    return json({ error: 'upstream' }, 502);
  }
}
