import { describe, expect, it } from 'vitest';
import {
  createBuildRevision,
  createWorldformBuild,
  transitionBuild,
} from '../../src/worldform/domain/state-machine';
import type { GenerationAsset, UserIdentity } from '../../src/worldform/domain/types';

const identity: UserIdentity = {
  photo: { fileName: 'me.png', mimeType: 'image/png', dataUri: 'data:image/png;base64,YQ==' },
  appearance: { recognitionCues: [] },
  desiredSelf: { description: 'A city guardian', feelings: ['protected'] },
};

function asset(revisionId: string, view: 'front' | 'side' | 'back'): GenerationAsset {
  return {
    id: view,
    revisionId,
    kind: 'concept',
    view,
    uri: `data:image/svg+xml,${view}`,
    mimeType: 'image/svg+xml',
    requestHash: view,
    provider: 'test',
    createdAt: 1,
    mock: true,
  };
}

describe('Worldform state machine approval gates', () => {
  it('refuses side/back generation before explicit front approval', () => {
    const build = {
      ...createWorldformBuild({
        id: 'HM-WF-1',
        worldPackId: 'afterburn-city',
        worldPackVersion: '1.0.0',
        manufacturingProfileId: 'factory',
        now: 1,
      }),
      identity,
      selectedArchetypeId: 'signal-runner',
      status: 'FRONT_REVIEW' as const,
    };
    expect(() => transitionBuild(build, 'MULTIVIEW_GENERATING', 2)).toThrow(
      'front approval is required'
    );
  });

  it('refuses 3D before all three views are explicitly approved', () => {
    const revision = {
      ...createBuildRevision({
        id: 'rev-1',
        number: 1,
        worldPackVersion: '1.0.0',
        archetypeId: 'signal-runner',
        worldBodyId: 'signal-runner-body',
        signatureKitId: 'signal-runner-kit',
        seed: 1,
        now: 1,
      }),
      assets: [asset('rev-1', 'front'), asset('rev-1', 'side'), asset('rev-1', 'back')],
    };
    const build = {
      ...createWorldformBuild({
        id: 'HM-WF-1',
        worldPackId: 'afterburn-city',
        worldPackVersion: '1.0.0',
        manufacturingProfileId: 'factory',
        now: 1,
      }),
      status: 'MULTIVIEW_REVIEW' as const,
      identity,
      selectedArchetypeId: 'signal-runner',
      selectedRevisionId: revision.id,
      revisions: [revision],
      frontApprovedRevisionId: revision.id,
    };
    expect(() => transitionBuild(build, 'MODEL_GENERATING', 2)).toThrow(
      'multiview approval is required'
    );
  });

  it('never treats automatic QC as manufacturing approval', () => {
    const build = {
      ...createWorldformBuild({
        id: 'HM-WF-1',
        worldPackId: 'afterburn-city',
        worldPackVersion: '1.0.0',
        manufacturingProfileId: 'factory',
        now: 1,
      }),
      status: 'MANUFACTURING_REVIEW' as const,
    };
    expect(() => transitionBuild(build, 'APPROVED', 2)).toThrow(
      'manual manufacturing approval is required'
    );
  });
});
