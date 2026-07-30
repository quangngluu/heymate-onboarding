// Asking for a picture of the place she just described, with her in it.
//
// Entirely optional and entirely off the critical path: it is fired after her
// line is already on screen, and a failure means no picture, never a stall.
//
// The subject is her own offscreen render, so the drawing model is carrying a
// likeness rather than inventing one. If her model has not finished loading the
// capture returns null and the server draws the place empty instead.

import { residentById } from '../config/residents';
import { subjectShot } from '../three/subject';

export async function drawScene(
  residentId: string,
  text: string,
  scene?: string
): Promise<string | null> {
  try {
    const subject = await subjectShot(residentById(residentId).modelUrl).catch(() => null);
    const res = await fetch('/api/scene-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residentId, text, scene, subject: subject ?? undefined }),
      // Composing her into a place is a heavier model than drawing an empty
      // room, so the client waits longer when it sent a subject.
      signal: AbortSignal.timeout(subject ? 80000 : 40000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}
