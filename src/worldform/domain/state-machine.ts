import { WORLDFORM_PROMPT_VERSION } from './prompt-compiler';
import type {
  BuildRevision,
  ConceptView,
  WorldformBuild,
  WorldformStatus,
} from './types';

const ALLOWED: Record<WorldformStatus, readonly WorldformStatus[]> = {
  DRAFT: ['IDENTITY_READY', 'FAILED'],
  IDENTITY_READY: ['DRAFT', 'ROLE_SELECTED', 'FAILED'],
  ROLE_SELECTED: ['IDENTITY_READY', 'FRONT_GENERATING', 'FAILED'],
  FRONT_GENERATING: ['FRONT_REVIEW', 'FAILED'],
  FRONT_REVIEW: ['IDENTITY_READY', 'ROLE_SELECTED', 'FRONT_GENERATING', 'MULTIVIEW_GENERATING', 'FAILED'],
  MULTIVIEW_GENERATING: ['MULTIVIEW_REVIEW', 'FAILED'],
  MULTIVIEW_REVIEW: ['MULTIVIEW_GENERATING', 'MODEL_GENERATING', 'FAILED'],
  MODEL_GENERATING: ['MODEL_QC', 'FAILED'],
  MODEL_QC: ['MANUFACTURING_REVIEW', 'FAILED'],
  MANUFACTURING_REVIEW: ['APPROVED', 'FAILED'],
  APPROVED: [],
  FAILED: [
    'DRAFT',
    'IDENTITY_READY',
    'ROLE_SELECTED',
    'FRONT_GENERATING',
    'FRONT_REVIEW',
    'MULTIVIEW_GENERATING',
    'MULTIVIEW_REVIEW',
    'MODEL_GENERATING',
    'MODEL_QC',
    'MANUFACTURING_REVIEW',
  ],
};

export function currentRevision(build: WorldformBuild): BuildRevision | null {
  return build.revisions.find((revision) => revision.id === build.selectedRevisionId) ?? null;
}

export function conceptAsset(revision: BuildRevision | null, view: ConceptView) {
  return revision?.assets.find((asset) => asset.kind === 'concept' && asset.view === view) ?? null;
}

function transitionGuard(build: WorldformBuild, next: WorldformStatus): string | null {
  const revision = currentRevision(build);
  if (next === 'IDENTITY_READY' && !build.identity) return 'identity is required';
  if (next === 'ROLE_SELECTED' && (!build.identity || !build.selectedArchetypeId)) {
    return 'identity and an archetype are required';
  }
  if (next === 'FRONT_REVIEW' && !conceptAsset(revision, 'front')) return 'front asset is required';
  if (next === 'MULTIVIEW_GENERATING' && !build.frontApprovedRevisionId) {
    return 'front approval is required';
  }
  if (
    next === 'MULTIVIEW_REVIEW' &&
    (!conceptAsset(revision, 'front') || !conceptAsset(revision, 'side') || !conceptAsset(revision, 'back'))
  ) {
    return 'front, side, and back assets are required';
  }
  if (next === 'MODEL_GENERATING' && !build.multiviewApprovedRevisionId) {
    return 'multiview approval is required';
  }
  if (next === 'MODEL_QC' && !revision?.assets.some((asset) => asset.kind === 'model')) {
    return '3D model asset is required';
  }
  if (next === 'MANUFACTURING_REVIEW' && !revision?.qc) return 'QC result is required';
  if (next === 'APPROVED' && build.manualReview.status !== 'approved') {
    return 'manual manufacturing approval is required';
  }
  return null;
}

export function transitionBuild(
  build: WorldformBuild,
  next: WorldformStatus,
  now = Date.now()
): WorldformBuild {
  if (build.status === next) return build;
  if (!ALLOWED[build.status].includes(next)) {
    throw new Error(`invalid Worldform transition: ${build.status} -> ${next}`);
  }
  const blocked = transitionGuard(build, next);
  if (blocked) throw new Error(`cannot enter ${next}: ${blocked}`);
  return { ...build, status: next, updatedAt: now };
}

export function createWorldformBuild(input: {
  id: string;
  worldPackId: string;
  worldPackVersion: string;
  manufacturingProfileId: string;
  now?: number;
  frontPreviewLimit?: number;
}): WorldformBuild {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    worldPackId: input.worldPackId,
    worldPackVersion: input.worldPackVersion,
    manufacturingProfileId: input.manufacturingProfileId,
    status: 'DRAFT',
    identity: null,
    recommendations: [],
    selectedArchetypeId: null,
    selectedRevisionId: null,
    revisions: [],
    jobs: [],
    usage: [],
    successfulFrontPreviews: 0,
    frontPreviewLimit: input.frontPreviewLimit ?? 4,
    frontApprovedRevisionId: null,
    multiviewApprovedRevisionId: null,
    manualReview: { status: 'not-requested' },
    failure: null,
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createBuildRevision(input: {
  id: string;
  number: number;
  worldPackVersion: string;
  archetypeId: string;
  worldBodyId: string;
  signatureKitId: string;
  seed: number;
  now?: number;
}): BuildRevision {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    number: input.number,
    worldPackVersion: input.worldPackVersion,
    archetypeId: input.archetypeId,
    worldBodyId: input.worldBodyId,
    signatureKitId: input.signatureKitId,
    promptVersion: WORLDFORM_PROMPT_VERSION,
    seed: input.seed,
    assets: [],
    prompts: {},
    qc: null,
    createdAt: now,
    updatedAt: now,
  };
}
