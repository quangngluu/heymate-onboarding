// Asking for a picture of the place she just described, with her in it.
//
// Entirely optional and off the critical path: callers already committed the
// line before invoking this transport. Failures are values so credit/cache
// ownership can be handled without guessing what `null` meant.

import { canonViewFor } from '../config/canon-view';
import type { ScenePerspective } from '../config/canon-view';
import { resolveCanonRoute, type CanonRoute } from '../config/canon-route';
import type { ResidentId } from '../config/residents';
import { subjectShot } from '../three/subject';

export type SceneDrawFailureReason =
  | 'flagged'
  | 'writer'
  | 'drawer'
  | 'timeout'
  | 'invalid'
  | 'unconfigured';

export type SceneDrawResult =
  | {
      ok: true;
      url: string;
      perspective: ScenePerspective;
      withSubject: boolean;
    }
  | { ok: false; reason: SceneDrawFailureReason };

export interface SceneDrawRequest {
  residentId: ResidentId;
  route?: CanonRoute;
  text: string;
  scene?: string;
  perspective?: ScenePerspective;
  subjectStrategy?: 'identity' | 'identity+pose' | 'none';
  source?: 'quest' | 'open-chat';
  /** Optional caller-owned cancellation for stale conversation work. */
  signal?: AbortSignal;
}

function failedReason(error: unknown): SceneDrawFailureReason {
  switch (error) {
    case 'flagged':
      return 'flagged';
    case 'writer':
    case 'no-brief':
      return 'writer';
    case 'drawer':
    case 'no-image':
    case 'upstream':
      return 'drawer';
    case 'not-configured':
      return 'unconfigured';
    default:
      return 'invalid';
  }
}

function sceneRequestSignal(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([external, timeout]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  external.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  if (external.aborted || timeout.aborted) controller.abort();
  return controller.signal;
}

export async function drawScene(input: SceneDrawRequest): Promise<SceneDrawResult> {
  // E2 must supply and validate a second pose reference. Falling back to the
  // current identity-only capture would silently pretend that contract exists.
  if (input.subjectStrategy === 'identity+pose') {
    return { ok: false, reason: 'invalid' };
  }
  try {
    const route = input.route ?? resolveCanonRoute();
    const resident = canonViewFor(input.residentId, route);
    const subject =
      input.subjectStrategy === 'none'
        ? null
        : await subjectShot(resident.modelUrl).catch(() => null);
    const res = await fetch('/api/scene-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residentId: input.residentId,
        route,
        text: input.text,
        scene: input.scene,
        source: input.source,
        perspective: input.perspective ?? 'observed',
        subject: subject ?? undefined,
      }),
      signal: sceneRequestSignal(input.signal, subject ? 80000 : 40000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: unknown } | null;
      return { ok: false, reason: failedReason(data?.error) };
    }

    const data = (await res.json().catch(() => null)) as {
      url?: unknown;
      perspective?: unknown;
      withSubject?: unknown;
    } | null;
    if (
      !data ||
      typeof data.url !== 'string' ||
      !data.url.trim() ||
      (data.perspective !== 'observed' && data.perspective !== 'first-person') ||
      typeof data.withSubject !== 'boolean'
    ) {
      return { ok: false, reason: 'invalid' };
    }
    return {
      ok: true,
      url: data.url,
      perspective: data.perspective,
      withSubject: data.withSubject,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return {
      ok: false,
      reason: name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'drawer',
    };
  }
}
