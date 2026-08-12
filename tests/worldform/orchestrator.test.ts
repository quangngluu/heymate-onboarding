import { describe, expect, it } from 'vitest';
import type { UserIdentity } from '../../src/worldform/domain/types';
import { WorldformOrchestrator } from '../../src/worldform/orchestrator';
import { MockImageProvider, MockThreeDProvider } from '../../src/worldform/providers/mock';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageProvider,
} from '../../src/worldform/providers/types';
import type { ModelInspector } from '../../src/worldform/qc/model-inspector';
import { assessGeometry } from '../../src/worldform/qc/qc';
import { MemoryWorldformRepository } from '../../src/worldform/repository';

const identity: UserIdentity = {
  photo: {
    fileName: 'me.jpg',
    mimeType: 'image/jpeg',
    dataUri: 'data:image/jpeg;base64,YQ==',
  },
  appearance: { recognitionCues: ['round glasses', 'short black hair'] },
  desiredSelf: {
    description: 'Someone quiet who finds hidden signals and protects people.',
    feelings: ['mysterious', 'calm'],
  },
};

const inspector: ModelInspector = {
  async inspect(input) {
    return assessGeometry({
      id: input.id,
      revisionId: input.revisionId,
      profile: input.profile,
      modularity: {
        attachmentSystem: input.attachmentSystem,
        archetype: input.archetype,
      },
      now: input.now,
      geometry: {
        meshExists: true,
        nonZeroVolume: true,
        baseDiameterMm: 50,
        heightMm: 128,
        manifold: true,
        watertight: false,
        disconnectedComponents: 2,
        degenerateFaces: 0,
        invertedNormals: null,
        baseContact: true,
      },
    });
  },
};

function runtime(imageProvider: ImageProvider = new MockImageProvider()) {
  let now = 1_000;
  return new WorldformOrchestrator({
    repository: new MemoryWorldformRepository(),
    imageProvider,
    threeDProvider: new MockThreeDProvider(),
    modelInspector: inspector,
    now: () => now++,
    random: () => 0.42,
  });
}

async function readyFront(orchestrator: WorldformOrchestrator) {
  let build = orchestrator.createBuild();
  build = orchestrator.setIdentity(build.id, identity);
  build = orchestrator.selectArchetype(build.id, build.recommendations[0].archetypeId);
  return orchestrator.generateFront(build.id);
}

describe('WorldformOrchestrator', () => {
  it('executes the cost-gated flow and stops at human manufacturing review', async () => {
    const orchestrator = runtime();
    let build = await readyFront(orchestrator);
    expect(build.status).toBe('FRONT_REVIEW');
    expect(build.successfulFrontPreviews).toBe(1);
    await expect(orchestrator.generateMultiview(build.id)).rejects.toThrow(
      'approve the front before generating views'
    );

    build = orchestrator.approveFront(build.id);
    build = await orchestrator.generateMultiview(build.id);
    expect(build.status).toBe('MULTIVIEW_REVIEW');
    expect(build.revisions[0].assets.filter((asset) => asset.kind === 'concept')).toHaveLength(3);

    build = orchestrator.approveMultiview(build.id);
    build = await orchestrator.startModel(build.id);
    expect(build.status).toBe('MODEL_GENERATING');
    build = await orchestrator.pollModel(build.id);
    expect(build.status).toBe('MODEL_QC');
    build = await orchestrator.runQC(build.id);
    expect(build.status).toBe('MANUFACTURING_REVIEW');
    expect(build.revisions[0].qc).toMatchObject({
      overall: 'warning',
      manufacturing: { manualReviewRequired: true },
      modularity: {
        configuration: 'pass',
        connectorFit: 'unknown',
      },
    });
    expect(build.revisions[0]).toMatchObject({
      worldBodyId: 'afterburn-resonance-listener-body-v1',
      signatureKitId: 'resonance-halo-kit-v1',
    });
    expect(() => orchestrator.recordManufacturingDecision(build.id, 'approved', '')).not.toThrow();
  });

  it('preserves old revisions when the visitor retries a front', async () => {
    const orchestrator = runtime();
    let build = await readyFront(orchestrator);
    const firstAsset = build.revisions[0].assets[0].uri;
    build = await orchestrator.generateFront(build.id);
    expect(build.status).toBe('FRONT_REVIEW');
    expect(build.revisions).toHaveLength(2);
    expect(build.revisions[0].assets[0].uri).toBe(firstAsset);
    expect(build.selectedRevisionId).toBe(build.revisions[1].id);
    expect(build.events.some((event) => event.name === 'front_generation_completed')).toBe(true);
  });

  it('does not consume preview quota when provider infrastructure fails', async () => {
    const fallback = new MockImageProvider();
    let calls = 0;
    const failOnce: ImageProvider = {
      name: 'fail-once',
      async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
        calls++;
        if (calls === 1) throw new Error('upstream unavailable');
        return fallback.generate(input);
      },
    };
    const orchestrator = runtime(failOnce);
    let build = orchestrator.createBuild();
    build = orchestrator.setIdentity(build.id, identity);
    build = orchestrator.selectArchetype(build.id, build.recommendations[0].archetypeId);
    build = await orchestrator.generateFront(build.id);
    expect(build.status).toBe('FAILED');
    expect(build.successfulFrontPreviews).toBe(0);

    build = orchestrator.retryFailure(build.id);
    expect(build.status).toBe('ROLE_SELECTED');
    build = await orchestrator.generateFront(build.id);
    expect(build.status).toBe('FRONT_REVIEW');
    expect(build.successfulFrontPreviews).toBe(1);
  });

  it('retries only one inconsistent view in a new revision', async () => {
    const orchestrator = runtime();
    let build = await readyFront(orchestrator);
    build = orchestrator.approveFront(build.id);
    build = await orchestrator.generateMultiview(build.id);
    const original = build.revisions[0];
    const originalSide = original.assets.find((asset) => asset.view === 'side')!;
    const originalBack = original.assets.find((asset) => asset.view === 'back')!;

    build = await orchestrator.retryView(build.id, 'side');
    expect(build.revisions).toHaveLength(2);
    const retry = build.revisions[1];
    expect(retry.assets.find((asset) => asset.view === 'back')?.requestHash).toBe(
      originalBack.requestHash
    );
    expect(retry.assets.find((asset) => asset.view === 'side')?.requestHash).not.toBe(
      originalSide.requestHash
    );
  });
});
