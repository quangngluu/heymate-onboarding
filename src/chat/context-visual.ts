import { COST } from '../config/economy';
import type { ResidentId } from '../config/residents';
import { fnv1a } from '../util/hash';

export interface ContextVisualIntent {
  sceneBrief: string;
  caption: string;
  confidence: number;
}

export type ContextVisualPayment = 'free-auto' | 'paid';
export type ContextVisualStatus = 'offered' | 'generating' | 'ready' | 'failed';

export interface GeneratedOpenChatVisual {
  kind: 'generated';
  jobId: string;
  cacheKey: string;
  sceneBrief: string;
  caption: string;
  confidence: number;
  status: ContextVisualStatus;
  payment: ContextVisualPayment;
  price: number;
  src?: string;
}

export const OPEN_CHAT_CONTEXT_VISUAL_VERSION = 'open-chat-context-v1';

export interface ContextVisualProgress {
  freeAttemptUsed: boolean;
  lastDeliveredTurn: number | null;
}

export interface OpenChatContextProgress {
  freeState: 'available' | 'reserved' | 'consumed';
  lastDeliveredTurn: number | null;
  freeJobId?: string;
}

export type ContextVisualDecision =
  | { kind: 'generate-free' }
  | { kind: 'offer-paid' }
  | { kind: 'skip'; reason: 'low-confidence' | 'cooldown' | 'outstanding' };

export const CONTEXT_VISUAL_CONFIDENCE = 0.82;
export const CONTEXT_VISUAL_COOLDOWN_TURNS = 4;

function cleanLine(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/gu, ' ').trim().slice(0, max)
    : '';
}

const DIRECT_IDENTIFIER_RE = /(?:https?:\/\/|www\.|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+?\d[\s().-]*){8,})/iu;

export function sanitizeContextSceneBrief(value: unknown): string | null {
  const sceneBrief = cleanLine(value, 240);
  return sceneBrief && !DIRECT_IDENTIFIER_RE.test(sceneBrief) ? sceneBrief : null;
}

/**
 * Read the optional visual suggestion from the model's private state envelope.
 * The model proposes only content; framing, billing and delivery stay app-owned.
 */
export function contextVisualIntentFromState(state: unknown): ContextVisualIntent | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as { visualIntent?: unknown }).visualIntent;
  if (!candidate || typeof candidate !== 'object') return null;
  const input = candidate as Record<string, unknown>;
  const sceneBrief = sanitizeContextSceneBrief(input.sceneBrief);
  const caption = cleanLine(input.caption, 140);
  const confidence = typeof input.confidence === 'number' ? input.confidence : NaN;
  if (!sceneBrief || !caption || !Number.isFinite(confidence)) return null;
  if (DIRECT_IDENTIFIER_RE.test(caption)) return null;
  return {
    sceneBrief,
    caption,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/** Product-owned limit: one generation attempt is free, later frames require a CTA. */
export function decideContextVisual(input: {
  intent: ContextVisualIntent;
  progress: ContextVisualProgress;
  userTurn: number;
  hasOutstandingOffer: boolean;
}): ContextVisualDecision {
  if (input.intent.confidence < CONTEXT_VISUAL_CONFIDENCE) {
    return { kind: 'skip', reason: 'low-confidence' };
  }
  if (input.hasOutstandingOffer) return { kind: 'skip', reason: 'outstanding' };
  if (
    input.progress.lastDeliveredTurn !== null &&
    input.userTurn - input.progress.lastDeliveredTurn < CONTEXT_VISUAL_COOLDOWN_TURNS
  ) {
    return { kind: 'skip', reason: 'cooldown' };
  }
  return input.progress.freeAttemptUsed
    ? { kind: 'offer-paid' }
    : { kind: 'generate-free' };
}

export function createContextVisual(input: {
  residentId: ResidentId;
  turnId: string;
  intent: ContextVisualIntent;
  payment: ContextVisualPayment;
}): GeneratedOpenChatVisual {
  const digest = fnv1a(
    [OPEN_CHAT_CONTEXT_VISUAL_VERSION, input.residentId, input.intent.sceneBrief]
      .join('|')
  )
    .toString(16)
    .padStart(8, '0');
  const cacheKey = `${OPEN_CHAT_CONTEXT_VISUAL_VERSION}:${input.residentId}:${digest}`;
  return {
    kind: 'generated',
    jobId: `${cacheKey}:${input.turnId}`,
    cacheKey,
    sceneBrief: input.intent.sceneBrief,
    caption: input.intent.caption,
    confidence: input.intent.confidence,
    status: input.payment === 'free-auto' ? 'generating' : 'offered',
    payment: input.payment,
    price: input.payment === 'paid' ? COST.sceneImage : 0,
  };
}
