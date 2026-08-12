import type { GenerationAsset, GenerationJob, WorldformBuild } from './domain/types';
import { validateWorldformBuild } from './domain/validation';

export interface CachedAsset {
  buildId: string;
  asset: GenerationAsset;
}

export interface CachedJob {
  buildId: string;
  job: GenerationJob;
}

/** Persistence seam for the Worldform Build aggregate. */
export interface WorldformRepository {
  get(id: string): WorldformBuild | null;
  list(): WorldformBuild[];
  save(build: WorldformBuild): void;
  latestForWorld(worldPackId: string): WorldformBuild | null;
  findAssetByRequestHash(requestHash: string): CachedAsset | null;
  findSucceededJobByRequestHash(requestHash: string): CachedJob | null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertBuild(build: WorldformBuild): void {
  const validation = validateWorldformBuild(build);
  if (!validation.ok) throw new Error(`invalid Worldform build: ${validation.errors.join('; ')}`);
}

/** Test/server adapter with the same copy-on-read semantics as localStorage. */
export class MemoryWorldformRepository implements WorldformRepository {
  private readonly builds = new Map<string, WorldformBuild>();

  get(id: string): WorldformBuild | null {
    const build = this.builds.get(id);
    return build ? clone(build) : null;
  }

  list(): WorldformBuild[] {
    return [...this.builds.values()].map(clone).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  save(build: WorldformBuild): void {
    assertBuild(build);
    this.builds.set(build.id, clone(build));
  }

  latestForWorld(worldPackId: string): WorldformBuild | null {
    return this.list().find((build) => build.worldPackId === worldPackId) ?? null;
  }

  findAssetByRequestHash(requestHash: string): CachedAsset | null {
    for (const build of this.list()) {
      for (const revision of build.revisions) {
        const asset = revision.assets.find((candidate) => candidate.requestHash === requestHash);
        if (asset) return { buildId: build.id, asset: clone(asset) };
      }
    }
    return null;
  }

  findSucceededJobByRequestHash(requestHash: string): CachedJob | null {
    for (const build of this.list()) {
      const job = build.jobs.find(
        (candidate) => candidate.requestHash === requestHash && candidate.status === 'succeeded'
      );
      if (job) return { buildId: build.id, job: clone(job) };
    }
    return null;
  }
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'heymate.worldform.builds.v1';

/** Browser adapter. Generated data is prototype-local until durable storage exists. */
export class LocalStorageWorldformRepository implements WorldformRepository {
  constructor(
    private readonly storage: StorageLike = localStorage,
    private readonly key = STORAGE_KEY
  ) {}

  private read(): WorldformBuild[] {
    try {
      const value = this.storage.getItem(this.key);
      if (!value) return [];
      const builds = JSON.parse(value) as WorldformBuild[];
      return Array.isArray(builds)
        ? builds.filter((build) => validateWorldformBuild(build).ok)
        : [];
    } catch {
      return [];
    }
  }

  get(id: string): WorldformBuild | null {
    const build = this.read().find((candidate) => candidate.id === id);
    return build ? clone(build) : null;
  }

  list(): WorldformBuild[] {
    return this.read().map(clone).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  save(build: WorldformBuild): void {
    assertBuild(build);
    const builds = this.read();
    const index = builds.findIndex((candidate) => candidate.id === build.id);
    if (index >= 0) builds[index] = clone(build);
    else builds.push(clone(build));
    this.storage.setItem(this.key, JSON.stringify(builds));
  }

  latestForWorld(worldPackId: string): WorldformBuild | null {
    return this.list().find((build) => build.worldPackId === worldPackId) ?? null;
  }

  findAssetByRequestHash(requestHash: string): CachedAsset | null {
    for (const build of this.list()) {
      for (const revision of build.revisions) {
        const asset = revision.assets.find((candidate) => candidate.requestHash === requestHash);
        if (asset) return { buildId: build.id, asset: clone(asset) };
      }
    }
    return null;
  }

  findSucceededJobByRequestHash(requestHash: string): CachedJob | null {
    for (const build of this.list()) {
      const job = build.jobs.find(
        (candidate) => candidate.requestHash === requestHash && candidate.status === 'succeeded'
      );
      if (job) return { buildId: build.id, job: clone(job) };
    }
    return null;
  }
}
