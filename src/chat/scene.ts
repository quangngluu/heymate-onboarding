// Asking for a picture of the place she just described.
//
// Entirely optional and entirely off the critical path: it is fired after her
// line is already on screen, and a failure means no picture, never a stall.

export async function drawScene(
  residentId: string,
  text: string,
  scene?: string
): Promise<string | null> {
  try {
    const res = await fetch('/api/scene-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residentId, text, scene }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}
