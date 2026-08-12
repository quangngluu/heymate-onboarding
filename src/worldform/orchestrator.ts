import {
  AFTERBURN_WORLD_PACK_V1,
  MATE_FORM_STANDARD_V01,
  RESIN_FACTORY_DRAFT_V1,
} from './domain/fixtures';
import { compileWorldformPrompt } from './domain/prompt-compiler';
import { recommendArchetypes } from './domain/recommend';
import {
  conceptAsset,
  createBuildRevision,
  createWorldformBuild,
  currentRevision,
  transitionBuild,
} from './domain/state-machine';
import type {
  BuildRevision,
  ConceptView,
  GenerationAsset,
  GenerationJob,
  GenerationOperation,
  GenerationUsage,
  ManufacturingProfile,
  MateFormStandard,
  UserIdentity,
  WorldArchetype,
  WorldPack,
  WorldformBuild,
  WorldformEvent,
  WorldformStatus,
} from './domain/types';
import {
  assertValid,
  validateManufacturingProfile,
  validateUserIdentity,
  validateWorldPack,
} from './domain/validation';
import { requestHash } from './hash';
import type { ImageProvider, ThreeDProvider } from './providers/types';
import type { ModelInspector } from './qc/model-inspector';
import type { WorldformRepository } from './repository';

interface WorldformDependencies {
  repository: WorldformRepository;
  imageProvider: ImageProvider;
  threeDProvider: ThreeDProvider;
  modelInspector: ModelInspector;
  worldPack?: WorldPack;
  mateForm?: MateFormStandard;
  manufacturingProfile?: ManufacturingProfile;
  now?: () => number;
  random?: () => number;
}

function operationFor(view: ConceptView): GenerationOperation {
  return `${view}_image_generation` as GenerationOperation;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : 'unknown provider failure';
}

function withRevision(
  build: WorldformBuild,
  revision: BuildRevision,
  now: number
): WorldformBuild {
  return {
    ...build,
    revisions: build.revisions.map((candidate) =>
      candidate.id === revision.id ? { ...revision, updatedAt: now } : candidate
    ),
    updatedAt: now,
  };
}

/**
 * Deep Worldform module. Callers ask for product actions; ordering, revision
 * ownership, caching, quota, settlement, and failure semantics stay local.
 */
export class WorldformOrchestrator {
  readonly worldPack: WorldPack;
  readonly mateForm: MateFormStandard;
  readonly manufacturingProfile: ManufacturingProfile;
  private readonly repository: WorldformRepository;
  private readonly imageProvider: ImageProvider;
  private readonly threeDProvider: ThreeDProvider;
  private readonly modelInspector: ModelInspector;
  private readonly clock: () => number;
  private readonly random: () => number;
  private serial = 0;

  constructor(dependencies: WorldformDependencies) {
    this.repository = dependencies.repository;
    this.imageProvider = dependencies.imageProvider;
    this.threeDProvider = dependencies.threeDProvider;
    this.modelInspector = dependencies.modelInspector;
    this.worldPack = dependencies.worldPack ?? AFTERBURN_WORLD_PACK_V1;
    this.mateForm = dependencies.mateForm ?? MATE_FORM_STANDARD_V01;
    this.manufacturingProfile =
      dependencies.manufacturingProfile ?? RESIN_FACTORY_DRAFT_V1;
    this.clock = dependencies.now ?? Date.now;
    this.random = dependencies.random ?? Math.random;
    assertValid(validateWorldPack(this.worldPack), 'World Pack');
    assertValid(validateManufacturingProfile(this.manufacturingProfile), 'Manufacturing Profile');
  }

  private id(prefix: string): string {
    this.serial++;
    const random = Math.floor(this.random() * 0xffffff)
      .toString(36)
      .padStart(5, '0');
    return `${prefix}-${this.clock().toString(36)}-${this.serial.toString(36)}${random}`;
  }

  private buildId(): string {
    const numeric = Math.abs(
      Number.parseInt(requestHash(`${this.clock()}:${this.random()}`).slice(0, 7), 16)
    ) % 10000;
    return `HM-WF-${numeric.toString().padStart(4, '0')}`;
  }

  private event(name: string, data?: WorldformEvent['data']): WorldformEvent {
    return { name, at: this.clock(), data };
  }

  private save(build: WorldformBuild): WorldformBuild {
    this.repository.save(build);
    return build;
  }

  private require(id: string): WorldformBuild {
    const build = this.repository.get(id);
    if (!build) throw new Error(`unknown Worldform build: ${id}`);
    return build;
  }

  private archetype(id: string | null): WorldArchetype {
    const archetype = this.worldPack.archetypes.find((candidate) => candidate.id === id);
    if (!archetype) throw new Error('select a valid World Archetype first');
    return archetype;
  }

  private appendEvent(
    build: WorldformBuild,
    name: string,
    data?: WorldformEvent['data']
  ): WorldformBuild {
    return { ...build, events: [...build.events, this.event(name, data)].slice(-240) };
  }

  private startJob(
    build: WorldformBuild,
    revisionId: string,
    operation: GenerationOperation,
    hash: string,
    provider: string
  ): { build: WorldformBuild; job: GenerationJob } {
    const now = this.clock();
    const job: GenerationJob = {
      id: this.id('job'),
      revisionId,
      requestHash: hash,
      provider,
      operation,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };
    return { build: { ...build, jobs: [...build.jobs, job], updatedAt: now }, job };
  }

  private updateJob(
    build: WorldformBuild,
    id: string,
    patch: Partial<GenerationJob>
  ): WorldformBuild {
    const now = this.clock();
    return {
      ...build,
      jobs: build.jobs.map((job) =>
        job.id === id ? { ...job, ...patch, updatedAt: now } : job
      ),
      updatedAt: now,
    };
  }

  private usage(input: Omit<GenerationUsage, 'id' | 'createdAt'>): GenerationUsage {
    return { ...input, id: this.id('usage'), createdAt: this.clock() };
  }

  private fail(
    build: WorldformBuild,
    input: {
      stage: GenerationOperation | 'validation' | 'qc';
      error: unknown;
      retryStatus: Exclude<WorldformStatus, 'FAILED' | 'APPROVED'>;
      jobId?: string;
      revisionId?: string;
      durationMs?: number;
    }
  ): WorldformBuild {
    const now = this.clock();
    const message = errorMessage(input.error);
    let failed = input.jobId
      ? this.updateJob(build, input.jobId, { status: 'failed', error: message })
      : build;
    if (input.jobId && input.revisionId && input.stage !== 'validation' && input.stage !== 'qc') {
      const job = failed.jobs.find((candidate) => candidate.id === input.jobId)!;
      failed = {
        ...failed,
        usage: [
          ...failed.usage,
          this.usage({
            buildId: failed.id,
            revisionId: input.revisionId,
            jobId: job.id,
            provider: job.provider,
            operation: input.stage,
            providerUnits: 0,
            estimatedCostUsd: null,
            durationMs: input.durationMs ?? 0,
            status: 'failed',
          }),
        ],
      };
    }
    failed = transitionBuild(failed, 'FAILED', now);
    failed = this.appendEvent(failed, 'generation_failed', {
      stage: input.stage,
      message,
    });
    return this.save({
      ...failed,
      failure: { stage: input.stage, message, retryStatus: input.retryStatus, occurredAt: now },
    });
  }

  createBuild(): WorldformBuild {
    const now = this.clock();
    const build = this.appendEvent(
      createWorldformBuild({
        id: this.buildId(),
        worldPackId: this.worldPack.worldId,
        worldPackVersion: this.worldPack.version,
        manufacturingProfileId: this.manufacturingProfile.id,
        now,
      }),
      'world_entered',
      { worldPackId: this.worldPack.worldId }
    );
    return this.save(build);
  }

  latestBuild(): WorldformBuild {
    const latest = this.repository.latestForWorld(this.worldPack.worldId);
    return latest?.worldPackVersion === this.worldPack.version ? latest : this.createBuild();
  }

  get(id: string): WorldformBuild {
    return this.require(id);
  }

  setIdentity(id: string, identity: UserIdentity): WorldformBuild {
    assertValid(validateUserIdentity(identity), 'User Identity');
    const current = this.require(id);
    if (!['DRAFT', 'IDENTITY_READY', 'ROLE_SELECTED', 'FRONT_REVIEW'].includes(current.status)) {
      throw new Error(`identity cannot change during ${current.status}`);
    }
    const recommendations = recommendArchetypes(this.worldPack, identity);
    let build: WorldformBuild = {
      ...current,
      identity,
      recommendations,
      selectedArchetypeId: null,
      selectedRevisionId: null,
      frontApprovedRevisionId: null,
      multiviewApprovedRevisionId: null,
      manualReview: { status: 'not-requested' },
      failure: null,
    };
    if (build.status !== 'IDENTITY_READY') build = transitionBuild(build, 'IDENTITY_READY', this.clock());
    build = this.appendEvent(build, 'identity_uploaded');
    build = this.appendEvent(build, 'desired_self_completed', {
      feelings: identity.desiredSelf.feelings.join(','),
    });
    recommendations.forEach((recommendation) => {
      build = this.appendEvent(build, 'archetype_recommended', {
        archetypeId: recommendation.archetypeId,
        rank: recommendation.rank,
      });
    });
    return this.save(build);
  }

  selectArchetype(id: string, archetypeId: string): WorldformBuild {
    const current = this.require(id);
    this.archetype(archetypeId);
    if (!['IDENTITY_READY', 'ROLE_SELECTED', 'FRONT_REVIEW'].includes(current.status)) {
      throw new Error(`archetype cannot change during ${current.status}`);
    }
    let build: WorldformBuild = {
      ...current,
      selectedArchetypeId: archetypeId,
      selectedRevisionId: null,
      frontApprovedRevisionId: null,
      multiviewApprovedRevisionId: null,
      manualReview: { status: 'not-requested' },
      failure: null,
    };
    if (build.status !== 'ROLE_SELECTED') build = transitionBuild(build, 'ROLE_SELECTED', this.clock());
    build = this.appendEvent(build, 'archetype_selected', { archetypeId });
    return this.save(build);
  }

  private makeAsset(input: {
    revisionId: string;
    kind: GenerationAsset['kind'];
    view?: ConceptView;
    uri: string;
    mimeType: string;
    hash: string;
    provider: string;
    providerModel?: string;
    mock: boolean;
  }): GenerationAsset {
    return {
      id: this.id('asset'),
      revisionId: input.revisionId,
      kind: input.kind,
      view: input.view,
      uri: input.uri,
      mimeType: input.mimeType,
      requestHash: input.hash,
      provider: input.provider,
      providerModel: input.providerModel,
      createdAt: this.clock(),
      mock: input.mock,
    };
  }

  private addAsset(build: WorldformBuild, asset: GenerationAsset): WorldformBuild {
    const revision = currentRevision(build);
    if (!revision || revision.id !== asset.revisionId) throw new Error('asset revision is stale');
    return withRevision(build, { ...revision, assets: [...revision.assets, asset] }, this.clock());
  }

  async generateFront(id: string): Promise<WorldformBuild> {
    let build = this.require(id);
    if (!['ROLE_SELECTED', 'FRONT_REVIEW'].includes(build.status)) {
      throw new Error(`front cannot generate during ${build.status}`);
    }
    if (!build.identity) throw new Error('identity is required');
    const identity = build.identity;
    if (build.successfulFrontPreviews >= build.frontPreviewLimit) {
      throw new Error(`front preview limit reached (${build.frontPreviewLimit})`);
    }
    const archetype = this.archetype(build.selectedArchetypeId);
    const number = build.revisions.length + 1;
    const revision = createBuildRevision({
      id: this.id('revision'),
      number,
      worldPackVersion: this.worldPack.version,
      archetypeId: archetype.id,
      worldBodyId: archetype.worldBody.id,
      signatureKitId: archetype.signatureKit.id,
      seed: Number.parseInt(
        requestHash(`${build.id}:${archetype.id}:${number}:${identity.desiredSelf.description}`),
        16
      ),
      now: this.clock(),
    });
    const prompt = compileWorldformPrompt({
      mateForm: this.mateForm,
      worldPack: this.worldPack,
      archetype,
      identity,
      manufacturing: this.manufacturingProfile,
      view: 'front',
    });
    const hash = requestHash({
      operation: 'front',
      source: requestHash(identity.photo.dataUri),
      prompt: prompt.text,
      promptVersion: prompt.version,
      seed: revision.seed,
    });
    revision.prompts.front = prompt.text;
    build = {
      ...build,
      selectedRevisionId: revision.id,
      revisions: [...build.revisions, revision],
      frontApprovedRevisionId: null,
      multiviewApprovedRevisionId: null,
      failure: null,
    };
    build = transitionBuild(build, 'FRONT_GENERATING', this.clock());
    const started = this.startJob(
      build,
      revision.id,
      'front_image_generation',
      hash,
      this.imageProvider.name
    );
    build = this.appendEvent(started.build, 'front_generation_started', {
      revision: revision.number,
    });
    this.save(build);
    const beganAt = this.clock();

    try {
      const cached = this.repository.findAssetByRequestHash(hash);
      let asset: GenerationAsset;
      let usageStatus: GenerationUsage['status'];
      let units = 0;
      let cost: number | null = 0;
      let provider = this.imageProvider.name;
      if (cached) {
        asset = this.makeAsset({
          revisionId: revision.id,
          kind: 'concept',
          view: 'front',
          uri: cached.asset.uri,
          mimeType: cached.asset.mimeType,
          hash,
          provider: cached.asset.provider,
          providerModel: cached.asset.providerModel,
          mock: cached.asset.mock,
        });
        provider = cached.asset.provider;
        usageStatus = 'cached';
      } else {
        const result = await this.imageProvider.generate({
          buildId: build.id,
          revisionId: revision.id,
          view: 'front',
          prompt: prompt.text,
          sourceImage: identity.photo.dataUri,
          requestHash: hash,
          seed: revision.seed,
          archetypeName: archetype.name,
        });
        asset = this.makeAsset({
          revisionId: revision.id,
          kind: 'concept',
          view: 'front',
          uri: result.uri,
          mimeType: result.mimeType,
          hash,
          provider: this.imageProvider.name,
          providerModel: result.providerModel,
          mock: result.mock,
        });
        units = result.providerUnits;
        cost = result.estimatedCostUsd;
        usageStatus = 'success';
        build = this.updateJob(build, started.job.id, { providerJobId: result.providerJobId });
      }
      build = this.addAsset(build, asset);
      build = this.updateJob(build, started.job.id, { status: 'succeeded' });
      build = {
        ...build,
        successfulFrontPreviews:
          usageStatus === 'success'
            ? build.successfulFrontPreviews + 1
            : build.successfulFrontPreviews,
        usage: [
          ...build.usage,
          this.usage({
            buildId: build.id,
            revisionId: revision.id,
            jobId: started.job.id,
            provider,
            operation: 'front_image_generation',
            providerUnits: units,
            estimatedCostUsd: cost,
            durationMs: this.clock() - beganAt,
            status: usageStatus,
          }),
        ],
      };
      build = transitionBuild(build, 'FRONT_REVIEW', this.clock());
      build = this.appendEvent(build, 'front_generation_completed', {
        cached: usageStatus === 'cached',
      });
      return this.save(build);
    } catch (error) {
      return this.fail(build, {
        stage: 'front_image_generation',
        error,
        retryStatus: 'ROLE_SELECTED',
        jobId: started.job.id,
        revisionId: revision.id,
        durationMs: this.clock() - beganAt,
      });
    }
  }

  approveFront(id: string): WorldformBuild {
    let build = this.require(id);
    if (build.status !== 'FRONT_REVIEW') throw new Error('front is not ready for review');
    const revision = currentRevision(build);
    if (!revision || !conceptAsset(revision, 'front')) throw new Error('front asset is missing');
    build = { ...build, frontApprovedRevisionId: revision.id };
    build = this.appendEvent(build, 'front_approved', { revision: revision.number });
    return this.save(build);
  }

  private async generateViews(
    initial: WorldformBuild,
    views: ConceptView[]
  ): Promise<WorldformBuild> {
    let build = initial;
    const revision = currentRevision(build);
    if (!revision || !build.identity) throw new Error('active revision and identity are required');
    const identity = build.identity;
    const archetype = this.archetype(build.selectedArchetypeId);
    const front = conceptAsset(revision, 'front');
    if (!front) throw new Error('approved front asset is missing');

    for (const view of views) {
      const current = currentRevision(build)!;
      if (conceptAsset(current, view)) continue;
      const prompt = compileWorldformPrompt({
        mateForm: this.mateForm,
        worldPack: this.worldPack,
        archetype,
        identity,
        manufacturing: this.manufacturingProfile,
        view,
      });
      const hash = requestHash({
        operation: view,
        source: front.requestHash,
        prompt: prompt.text,
        promptVersion: prompt.version,
        seed: current.seed,
      });
      build = withRevision(
        build,
        { ...current, prompts: { ...current.prompts, [view]: prompt.text } },
        this.clock()
      );
      const started = this.startJob(build, current.id, operationFor(view), hash, this.imageProvider.name);
      build = started.build;
      this.save(build);
      const beganAt = this.clock();
      try {
        const cached = this.repository.findAssetByRequestHash(hash);
        let asset: GenerationAsset;
        let usageStatus: GenerationUsage['status'];
        let units = 0;
        let cost: number | null = 0;
        let provider = this.imageProvider.name;
        if (cached) {
          asset = this.makeAsset({
            revisionId: current.id,
            kind: 'concept',
            view,
            uri: cached.asset.uri,
            mimeType: cached.asset.mimeType,
            hash,
            provider: cached.asset.provider,
            providerModel: cached.asset.providerModel,
            mock: cached.asset.mock,
          });
          usageStatus = 'cached';
          provider = cached.asset.provider;
        } else {
          const result = await this.imageProvider.generate({
            buildId: build.id,
            revisionId: current.id,
            view,
            prompt: prompt.text,
            sourceImage: front.uri,
            requestHash: hash,
            seed: current.seed,
            archetypeName: archetype.name,
          });
          asset = this.makeAsset({
            revisionId: current.id,
            kind: 'concept',
            view,
            uri: result.uri,
            mimeType: result.mimeType,
            hash,
            provider: this.imageProvider.name,
            providerModel: result.providerModel,
            mock: result.mock,
          });
          build = this.updateJob(build, started.job.id, { providerJobId: result.providerJobId });
          usageStatus = 'success';
          units = result.providerUnits;
          cost = result.estimatedCostUsd;
        }
        build = this.addAsset(build, asset);
        build = this.updateJob(build, started.job.id, { status: 'succeeded' });
        build = {
          ...build,
          usage: [
            ...build.usage,
            this.usage({
              buildId: build.id,
              revisionId: current.id,
              jobId: started.job.id,
              provider,
              operation: operationFor(view),
              providerUnits: units,
              estimatedCostUsd: cost,
              durationMs: this.clock() - beganAt,
              status: usageStatus,
            }),
          ],
        };
        build = this.appendEvent(build, `${view}_generation_completed`, {
          cached: usageStatus === 'cached',
        });
        this.save(build);
      } catch (error) {
        return this.fail(build, {
          stage: operationFor(view),
          error,
          retryStatus: 'MULTIVIEW_GENERATING',
          jobId: started.job.id,
          revisionId: current.id,
          durationMs: this.clock() - beganAt,
        });
      }
    }

    const ready = currentRevision(build);
    if (!ready || !conceptAsset(ready, 'side') || !conceptAsset(ready, 'back')) {
      return this.fail(build, {
        stage: 'back_image_generation',
        error: new Error('multiview is incomplete'),
        retryStatus: 'MULTIVIEW_GENERATING',
        revisionId: revision.id,
      });
    }
    build = transitionBuild(build, 'MULTIVIEW_REVIEW', this.clock());
    return this.save(build);
  }

  async generateMultiview(id: string): Promise<WorldformBuild> {
    let build = this.require(id);
    if (build.status === 'FRONT_REVIEW') {
      if (!build.frontApprovedRevisionId) throw new Error('approve the front before generating views');
      build = transitionBuild(build, 'MULTIVIEW_GENERATING', this.clock());
      build = this.appendEvent(build, 'multiview_generation_started');
      this.save(build);
    } else if (build.status !== 'MULTIVIEW_GENERATING') {
      throw new Error('front must be reviewed first');
    }
    return this.generateViews(build, ['side', 'back']);
  }

  async retryView(id: string, view: Exclude<ConceptView, 'front'>): Promise<WorldformBuild> {
    let build = this.require(id);
    if (build.status !== 'MULTIVIEW_REVIEW') throw new Error('multiview is not ready for retry');
    const previous = currentRevision(build);
    if (!previous || !conceptAsset(previous, 'front')) throw new Error('approved front is missing');
    const revision = createBuildRevision({
      id: this.id('revision'),
      number: build.revisions.length + 1,
      worldPackVersion: this.worldPack.version,
      archetypeId: previous.archetypeId,
      worldBodyId: previous.worldBodyId,
      signatureKitId: previous.signatureKitId,
      seed: Number.parseInt(requestHash(`${previous.seed}:${view}:${build.revisions.length + 1}`), 16),
      now: this.clock(),
    });
    revision.assets = previous.assets
      .filter((asset) => asset.kind === 'concept' && asset.view !== view)
      .map((asset) => ({ ...asset, id: this.id('asset'), revisionId: revision.id }));
    revision.prompts = Object.fromEntries(
      Object.entries(previous.prompts).filter(([key]) => key !== view)
    );
    build = {
      ...build,
      selectedRevisionId: revision.id,
      revisions: [...build.revisions, revision],
      frontApprovedRevisionId: revision.id,
      multiviewApprovedRevisionId: null,
    };
    build = transitionBuild(build, 'MULTIVIEW_GENERATING', this.clock());
    build = this.appendEvent(build, `${view}_retry`, { revision: revision.number });
    this.save(build);
    return this.generateViews(build, [view]);
  }

  approveMultiview(id: string): WorldformBuild {
    let build = this.require(id);
    if (build.status !== 'MULTIVIEW_REVIEW') throw new Error('multiview is not ready for approval');
    const revision = currentRevision(build);
    if (!revision || !conceptAsset(revision, 'front') || !conceptAsset(revision, 'side') || !conceptAsset(revision, 'back')) {
      throw new Error('three concept views are required');
    }
    build = { ...build, multiviewApprovedRevisionId: revision.id };
    build = this.appendEvent(build, 'multiview_approved', { revision: revision.number });
    return this.save(build);
  }

  async startModel(id: string): Promise<WorldformBuild> {
    let build = this.require(id);
    if (build.status !== 'MULTIVIEW_REVIEW') throw new Error('multiview must be reviewed first');
    if (!build.multiviewApprovedRevisionId) throw new Error('approve multiview before 3D');
    const revision = currentRevision(build);
    if (!revision) throw new Error('active revision is missing');
    const front = conceptAsset(revision, 'front');
    const side = conceptAsset(revision, 'side');
    const back = conceptAsset(revision, 'back');
    if (!front || !side || !back) throw new Error('three concept views are required');
    const archetype = this.archetype(build.selectedArchetypeId);
    const hash = requestHash({
      operation: 'multi-image-to-3d',
      images: [front.requestHash, side.requestHash, back.requestHash],
      promptVersion: revision.promptVersion,
      worldPackVersion: build.worldPackVersion,
    });
    build = transitionBuild(build, 'MODEL_GENERATING', this.clock());
    const started = this.startJob(
      build,
      revision.id,
      'multi_image_to_3d',
      hash,
      this.threeDProvider.name
    );
    build = this.appendEvent(started.build, '3d_generation_started');
    this.save(build);
    const cached = this.repository.findAssetByRequestHash(hash);
    if (cached?.asset.kind === 'model') {
      const model = this.makeAsset({
        revisionId: revision.id,
        kind: 'model',
        uri: cached.asset.uri,
        mimeType: cached.asset.mimeType,
        hash,
        provider: cached.asset.provider,
        providerModel: cached.asset.providerModel,
        mock: cached.asset.mock,
      });
      build = this.addAsset(build, model);
      build = this.updateJob(build, started.job.id, { status: 'succeeded' });
      build = {
        ...build,
        usage: [
          ...build.usage,
          this.usage({
            buildId: build.id,
            revisionId: revision.id,
            jobId: started.job.id,
            provider: cached.asset.provider,
            operation: 'multi_image_to_3d',
            providerUnits: 0,
            estimatedCostUsd: 0,
            durationMs: 0,
            status: 'cached',
          }),
        ],
      };
      build = transitionBuild(build, 'MODEL_QC', this.clock());
      return this.save(build);
    }

    try {
      const submission = await this.threeDProvider.createFromImages({
        buildId: build.id,
        revisionId: revision.id,
        images: [front.uri, side.uri, back.uri],
        requestHash: hash,
        texturePrompt: `Preserve the approved ${archetype.name} figurine palette and material separation.`,
        fallbackModelUrl: `assets/champion-${archetype.prototypeCharacterId}.glb`,
      });
      build = this.updateJob(build, started.job.id, {
        providerJobId: submission.providerJobId,
        status: 'running',
      });
      return this.save(build);
    } catch (error) {
      return this.fail(build, {
        stage: 'multi_image_to_3d',
        error,
        retryStatus: 'MULTIVIEW_REVIEW',
        jobId: started.job.id,
        revisionId: revision.id,
      });
    }
  }

  async pollModel(id: string): Promise<WorldformBuild> {
    let build = this.require(id);
    if (build.status !== 'MODEL_GENERATING') return build;
    const revision = currentRevision(build);
    if (!revision) throw new Error('active revision is missing');
    const job = [...build.jobs]
      .reverse()
      .find((candidate) => candidate.operation === 'multi_image_to_3d' && candidate.revisionId === revision.id);
    if (!job?.providerJobId) {
      return this.fail(build, {
        stage: 'multi_image_to_3d',
        error: new Error('provider job id is missing'),
        retryStatus: 'MULTIVIEW_REVIEW',
        jobId: job?.id,
        revisionId: revision.id,
      });
    }
    const beganAt = this.clock();
    try {
      const result = await this.threeDProvider.getJob(job.providerJobId);
      if (result.status === 'queued' || result.status === 'running') {
        build = this.updateJob(build, job.id, { status: result.status });
        return this.save(build);
      }
      if (result.status === 'failed') {
        return this.fail(build, {
          stage: 'multi_image_to_3d',
          error: new Error(result.error ?? '3D provider failed'),
          retryStatus: 'MULTIVIEW_REVIEW',
          jobId: job.id,
          revisionId: revision.id,
          durationMs: this.clock() - beganAt,
        });
      }
      const glb = result.modelUrls?.glb;
      if (!glb) throw new Error('3D provider returned no GLB');
      const model = this.makeAsset({
        revisionId: revision.id,
        kind: 'model',
        uri: glb,
        mimeType: 'model/gltf-binary',
        hash: job.requestHash,
        provider: this.threeDProvider.name,
        mock: this.threeDProvider.name.includes('mock'),
      });
      build = this.addAsset(build, model);
      if (result.previewUrl) {
        build = this.addAsset(
          build,
          this.makeAsset({
            revisionId: revision.id,
            kind: 'model-preview',
            uri: result.previewUrl,
            mimeType: 'image/webp',
            hash: requestHash(`${job.requestHash}:preview`),
            provider: this.threeDProvider.name,
            mock: this.threeDProvider.name.includes('mock'),
          })
        );
      }
      build = this.updateJob(build, job.id, { status: 'succeeded' });
      build = {
        ...build,
        usage: [
          ...build.usage,
          this.usage({
            buildId: build.id,
            revisionId: revision.id,
            jobId: job.id,
            provider: this.threeDProvider.name,
            operation: 'multi_image_to_3d',
            providerUnits: result.providerUnits ?? 0,
            estimatedCostUsd: result.estimatedCostUsd ?? null,
            durationMs: this.clock() - beganAt,
            status: 'success',
          }),
        ],
      };
      build = transitionBuild(build, 'MODEL_QC', this.clock());
      build = this.appendEvent(build, '3d_generation_completed');
      return this.save(build);
    } catch (error) {
      return this.fail(build, {
        stage: 'multi_image_to_3d',
        error,
        retryStatus: 'MULTIVIEW_REVIEW',
        jobId: job.id,
        revisionId: revision.id,
        durationMs: this.clock() - beganAt,
      });
    }
  }

  async runQC(id: string): Promise<WorldformBuild> {
    let build = this.require(id);
    if (build.status !== 'MODEL_QC') throw new Error('model is not ready for QC');
    const revision = currentRevision(build);
    const model = revision?.assets.find((asset) => asset.kind === 'model');
    if (!revision || !model) throw new Error('model asset is missing');
    try {
      const qc = await this.modelInspector.inspect({
        id: this.id('qc'),
        revisionId: revision.id,
        modelUri: model.uri,
        profile: this.manufacturingProfile,
        attachmentSystem: this.worldPack.attachmentSystem,
        archetype: this.archetype(revision.archetypeId),
        now: this.clock(),
      });
      build = withRevision(build, { ...revision, qc }, this.clock());
      build = transitionBuild(build, 'MANUFACTURING_REVIEW', this.clock());
      build = this.appendEvent(build, `qc_${qc.overall}`);
      return this.save(build);
    } catch (error) {
      return this.fail(build, { stage: 'qc', error, retryStatus: 'MODEL_QC', revisionId: revision.id });
    }
  }

  requestManufacturingReview(id: string): WorldformBuild {
    let build = this.require(id);
    if (build.status !== 'MANUFACTURING_REVIEW') throw new Error('QC must finish first');
    if (build.manualReview.status === 'requested') return build;
    build = {
      ...build,
      manualReview: { status: 'requested', requestedAt: this.clock() },
    };
    build = this.appendEvent(build, 'manufacturing_review_requested');
    return this.save(build);
  }

  recordManufacturingDecision(
    id: string,
    decision: 'approved' | 'rejected',
    note: string
  ): WorldformBuild {
    let build = this.require(id);
    if (build.status !== 'MANUFACTURING_REVIEW') throw new Error('build is not in manufacturing review');
    build = {
      ...build,
      manualReview: { status: decision, decidedAt: this.clock(), note: note.trim().slice(0, 500) },
    };
    if (decision === 'approved') build = transitionBuild(build, 'APPROVED', this.clock());
    build = this.appendEvent(build, `manufacturing_${decision}`);
    return this.save(build);
  }

  retryFailure(id: string): WorldformBuild {
    let build = this.require(id);
    if (build.status !== 'FAILED' || !build.failure) throw new Error('no retryable failure');
    const retryStatus = build.failure.retryStatus;
    build = { ...build, failure: null };
    build = transitionBuild(build, retryStatus, this.clock());
    return this.save(build);
  }
}
