// Speech playback for resident replies.
//
// Rendering takes several seconds, so the text always lands first and the
// voice follows when it is ready. A request is abandoned the moment the user
// moves on (new line, different resident, left the stage) so an old line can
// never talk over a new one.

export type SpeakHandle = { cancelled: boolean };

let current: SpeakHandle | null = null;
/** The provider renders one clip at a time; serialise so lines never collide. */
let chain: Promise<unknown> = Promise.resolve();

/** Cancel whatever is being fetched or is about to play. */
export function cancelSpeech(): void {
  if (current) current.cancelled = true;
  current = null;
}

/**
 * Render `text` in the resident's voice and hand the URL back. Resolves null
 * when the endpoint is unavailable, times out, or the request was superseded,
 * in which case the caller simply stays text-only.
 */
export function renderSpeech(
  text: string,
  voiceId?: string,
  speed?: number,
  /** The written line, beats and all, so the server can shape delivery. */
  raw?: string,
  mood?: string,
  vol?: number
): Promise<string | null> {
  cancelSpeech();
  const handle: SpeakHandle = { cancelled: false };
  current = handle;
  const run = chain.then(() => request(text, handle, voiceId, speed, raw, mood, vol));
  chain = run.catch(() => undefined);
  return run;
}

async function request(
  text: string,
  handle: SpeakHandle,
  voiceId?: string,
  speed?: number,
  raw?: string,
  mood?: string,
  vol?: number
): Promise<string | null> {
  // Superseded while queued: never spend a render on a line nobody waits for.
  if (handle.cancelled) return null;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, speed, raw, mood, vol }),
      signal: AbortSignal.timeout(30000),
    });
    if (handle.cancelled || !res.ok) return null;
    const blob = await res.blob();
    if (handle.cancelled) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  } finally {
    if (current === handle) current = null;
  }
}
