/**
 * Authored, deterministic bridge from Open Chat attachment to the figurine
 * shop. This is not an LLM turn: it fires once per save, in Kagura's voice,
 * and only while she is still unpurchased.
 *
 * Canon note: the line is anchored to Kagura's locked card promise —
 * "Giành lấy niềm tin của em. Giữ những điều em không còn tự nhớ được."
 * The figurine is how the visitor keeps her image present; the copy does not
 * invent a new body-lore for her.
 */
export interface BridgeBeat {
  id: string;
  residentId: 'kagura';
  line: string;
  ctaLabel: string;
}

export function bridgeBeatFor(residentId: string): BridgeBeat | null {
  if (residentId !== 'kagura') return null;
  return {
    id: 'kagura-physical-form',
    residentId: 'kagura',
    line: "Anh đã giành lấy niềm tin của em. Em không giỏi nói mấy lời này, nhưng em muốn anh nhìn thấy em thật rõ — hình hài em vẫn đứng đây, không phải qua lời kể. Anh xem thử được không?",
    ctaLabel: 'Xem hình hài của em',
  };
}
