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

/**
 * The emotion her last line was read in.
 *
 * It lives here because this module is the one place every spoken line passes
 * through, and because the endpoint is a stateless edge function that cannot
 * remember it. Sent as `prev` so a reply naming no feeling sustains the mood
 * instead of resetting to neutral; updated from the `X-Emotion` the server
 * reports back. See the note on `delivery()` in dialogue.ts.
 */
let lastEmotion: string | undefined;

/** Cancel whatever is being fetched or is about to play. */
export function cancelSpeech(): void {
  if (current) current.cancelled = true;
  current = null;
}

/**
 * Forget the carried mood. Called when the conversation is no longer the same
 * conversation — a different resident, or a fresh encounter — because holding
 * Kagura's anger into Momo's first line is the same bug in the other direction.
 */
export function resetSpeechEmotion(): void {
  lastEmotion = undefined;
}

/** Remember what the server actually used, when it says. */
function rememberEmotion(res: Response): void {
  const chosen = res.headers.get('X-Emotion');
  if (chosen) lastEmotion = chosen;
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
  vol?: number
): Promise<string | null> {
  cancelSpeech();
  const handle: SpeakHandle = { cancelled: false };
  current = handle;
  const run = chain.then(() => request(text, handle, voiceId, speed, raw, vol));
  chain = run.catch(() => undefined);
  return run;
}

async function request(
  text: string,
  handle: SpeakHandle,
  voiceId?: string,
  speed?: number,
  raw?: string,
  vol?: number
): Promise<string | null> {
  // Superseded while queued: never spend a render on a line nobody waits for.
  if (handle.cancelled) return null;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, speed, raw, vol, prev: lastEmotion }),
      signal: AbortSignal.timeout(30000),
    });
    if (handle.cancelled || !res.ok) return null;
    rememberEmotion(res);
    const blob = await res.blob();
    if (handle.cancelled) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  } finally {
    if (current === handle) current = null;
  }
}

/**
 * Render `text` and hand back the audio as it arrives.
 *
 * The finished-file path costs the visitor the whole render before anything
 * happens. Here the first samples land in about half a second and playback
 * starts on them, so the rest renders while she is already talking. Resolves
 * to the number of seconds of audio delivered, or null when the stream
 * produced nothing and the caller should fall back.
 */
export async function streamSpeech(
  opts: {
    text: string;
    raw?: string;
    voiceId?: string;
    speed?: number;
    vol?: number;
  },
  onSamples: (samples: Float32Array, sampleRate: number) => void
): Promise<number | null> {
  cancelSpeech();
  const handle: SpeakHandle = { cancelled: false };
  current = handle;

  const run = chain.then(async () => {
    if (handle.cancelled) return null;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...opts, stream: true, prev: lastEmotion }),
        signal: AbortSignal.timeout(35000),
      });
      if (!res.ok || !res.body) return null;
      rememberEmotion(res);
      const rate = Number(res.headers.get('X-Sample-Rate')) || 32000;
      const reader = res.body.getReader();

      let frames = 0;
      // A sample can straddle two network chunks, so an odd trailing byte is
      // held back rather than dropped.
      let odd: Uint8Array | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (handle.cancelled) {
          void reader.cancel();
          break;
        }
        let bytes = value;
        if (odd) {
          const joined = new Uint8Array(odd.length + bytes.length);
          joined.set(odd);
          joined.set(bytes, odd.length);
          bytes = joined;
          odd = null;
        }
        if (bytes.length % 2) {
          odd = bytes.slice(bytes.length - 1);
          bytes = bytes.slice(0, bytes.length - 1);
        }
        if (!bytes.length) continue;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const samples = new Float32Array(bytes.length / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
        frames += samples.length;
        onSamples(samples, rate);
      }
      return frames ? frames / rate : null;
    } catch {
      return null;
    } finally {
      if (current === handle) current = null;
    }
  });

  chain = run.catch(() => undefined);
  return run;
}
