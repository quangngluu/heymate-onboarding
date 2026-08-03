import { drawScene, type SceneDrawFailureReason, type SceneDrawRequest } from './scene';
import type { ScenePerspective } from '../config/canon-view';
import type { Store } from '../state/store';

type SceneJobOwner = Pick<
  Store,
  'get' | 'commitCredit' | 'releaseCredit' | 'keepShot'
>;

type SceneDrawer = (input: SceneDrawRequest) => ReturnType<typeof drawScene>;

export type SceneJobResult =
  | { status: 'ready'; url: string; fromCache: boolean }
  | { status: 'stale' }
  | {
      status: 'failed';
      reason: SceneDrawFailureReason | 'busy' | 'payment' | 'presentation';
    };

export interface SceneJob {
  id: string;
  cacheKey: string;
  request: SceneDrawRequest;
  expected: { perspective: ScenePerspective; withSubject: boolean };
  billing: { kind: 'free' } | { kind: 'reserved'; reservationId: string };
  isCurrent: () => boolean;
  stalePolicy: 'refund-and-discard' | 'cache-and-keep';
  present: (url: string) => boolean | Promise<boolean>;
}

/** Shared cache, validation, cancellation and settlement lifecycle for scene jobs. */
export class SceneJobRuntime {
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly owner: SceneJobOwner,
    private readonly drawer: SceneDrawer = drawScene
  ) {}

  private release(job: SceneJob): void {
    if (job.billing.kind === 'reserved') {
      this.owner.releaseCredit(job.billing.reservationId);
    }
  }

  private settle(job: SceneJob): boolean {
    return job.billing.kind === 'free'
      ? true
      : this.owner.commitCredit(job.billing.reservationId);
  }

  private async present(job: SceneJob, url: string): Promise<boolean> {
    try {
      return await job.present(url);
    } catch {
      return false;
    }
  }

  cancel(id?: string): void {
    if (id) {
      this.active.get(id)?.abort();
      return;
    }
    for (const controller of this.active.values()) controller.abort();
  }

  async run(job: SceneJob): Promise<SceneJobResult> {
    if (this.active.has(job.id)) return { status: 'failed', reason: 'busy' };

    const cached = this.owner.get().sceneShots[job.cacheKey];
    if (cached) {
      // Reuse never costs another credit. A reservation made before the cache
      // lookup is only a hold and can be released without a ledger entry.
      this.release(job);
      if (!job.isCurrent()) return { status: 'stale' };
      if (!(await this.present(job, cached))) {
        return { status: 'failed', reason: 'presentation' };
      }
      if (!job.isCurrent()) return { status: 'stale' };
      return { status: 'ready', url: cached, fromCache: true };
    }

    const controller = new AbortController();
    this.active.set(job.id, controller);
    let result: Awaited<ReturnType<SceneDrawer>>;
    try {
      result = await this.drawer({ ...job.request, signal: controller.signal });
    } catch {
      this.release(job);
      return { status: 'failed', reason: 'drawer' };
    } finally {
      this.active.delete(job.id);
    }

    if (!result.ok) {
      this.release(job);
      return { status: 'failed', reason: result.reason };
    }
    if (
      result.perspective !== job.expected.perspective ||
      result.withSubject !== job.expected.withSubject
    ) {
      this.release(job);
      return { status: 'failed', reason: 'invalid' };
    }

    if (!job.isCurrent()) {
      if (job.stalePolicy === 'cache-and-keep') {
        this.owner.keepShot(job.cacheKey, result.url);
        if (!this.settle(job)) return { status: 'failed', reason: 'payment' };
      } else {
        this.release(job);
      }
      return { status: 'stale' };
    }

    if (!(await this.present(job, result.url))) {
      this.release(job);
      return { status: 'failed', reason: 'presentation' };
    }
    if (!job.isCurrent()) {
      this.release(job);
      return { status: 'stale' };
    }
    this.owner.keepShot(job.cacheKey, result.url);
    if (!this.settle(job)) return { status: 'failed', reason: 'payment' };
    return { status: 'ready', url: result.url, fromCache: false };
  }
}
