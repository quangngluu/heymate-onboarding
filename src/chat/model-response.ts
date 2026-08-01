const STATE_RE = /<<\s*state\s*(\{[\s\S]*?\})\s*>>/;

/**
 * Remove the private relationship-state envelope from model prose. A missing
 * or malformed envelope is non-fatal; callers retain their previous state.
 */
export function splitModelState(raw: string): { text: string; state: unknown | null } {
  const match = raw.match(STATE_RE);
  const marker = raw.search(/<<\s*state\b/iu);
  const text = (marker === -1 ? raw : raw.slice(0, marker)).trim();
  if (!match) return { text, state: null };
  try {
    return { text, state: JSON.parse(match[1]) as unknown };
  } catch {
    return { text, state: null };
  }
}

/** Keep only the final complete sentence when the model hits its token cap. */
export function trimModelProse(
  text: string | undefined,
  finishReason?: string
): string | undefined {
  if (!text || finishReason !== 'length') return text;
  const cut = Math.max(
    text.lastIndexOf('.'),
    text.lastIndexOf('!'),
    text.lastIndexOf('?'),
    text.lastIndexOf('\u2026')
  );
  return cut > text.length * 0.4 ? text.slice(0, cut + 1) : text;
}
