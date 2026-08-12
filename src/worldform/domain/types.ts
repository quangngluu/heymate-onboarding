export const WORLDFORM_STATUSES = [
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
  'APPROVED',
  'FAILED',
] as const;

export type WorldformStatus = (typeof WORLDFORM_STATUSES)[number];
export type ConceptView = 'front' | 'side' | 'back';
export type SignatureType =
  | 'weapon'
  | 'vfx'
  | 'companion'
  | 'relic'
  | 'back_rig'
  | 'wearable'
  | 'terrain';
export type MatePortId =
  | 'head_dock'
  | 'back_port'
  | 'hand_left_port'
  | 'hand_right_port'
  | 'waist_port'
  | 'base_port';
export type FeelId =
  | 'powerful'
  | 'free'
  | 'mysterious'
  | 'protected'
  | 'fearless'
  | 'elegant'
  | 'wild'
  | 'calm'
  | 'unpredictable';

export interface MateFormStandard {
  id: string;
  version: string;
  baseDiameterTargetMm: number;
  totalHeightMm: { min: number; max: number };
  formLanguage: string[];
  structuralRules: string[];
  identityArchitecture: {
    faceMeaning: string;
    hairMeaning: string;
    bodyMeaning: string;
    signatureMeaning: string;
    headPortableAcrossWorlds: boolean;
  };
}

export interface AttachmentConnector {
  id: string;
  method: 'magnetic_keyed' | 'mechanical_keyed_peg';
  nominalDiameterMm: number | null;
  orientationKeyRequired: boolean;
  productionStatus: 'engineering_hypothesis' | 'factory_validated';
}

export interface AttachmentPortDefinition {
  id: MatePortId;
  connectorId: string;
  allowedSignatureTypes: SignatureType[];
  purpose: string;
}

export interface MateAttachmentSystem {
  id: string;
  version: string;
  connectors: AttachmentConnector[];
  ports: AttachmentPortDefinition[];
  rules: {
    maxHeroSignatureAssets: 1;
    maxSecondaryAccents: 1;
    detachedBodyMustReadComplete: true;
    assetMagnetsAllowed: false;
  };
}

export interface BodyHardpoint {
  portId: MatePortId;
  connectorId: string;
  availability: 'active' | 'reserved';
  concealmentRule: string;
}

export interface WorldBody {
  id: string;
  name: string;
  silhouette: string[];
  pose: {
    family: string;
    stance: string;
    symmetry: 'symmetric' | 'slightly-asymmetric' | 'asymmetric';
  };
  outfit: { required: string[]; optional: string[] };
  hardpoints: BodyHardpoint[];
  standaloneWithoutSignature: boolean;
}

export interface SignatureAssetDefinition {
  id: string;
  name: string;
  type: SignatureType;
  loreFunction: string;
  silhouetteCue: string;
  portIds: Exclude<MatePortId, 'head_dock'>[];
  connectorId: string;
  variants: string[];
}

export interface SignatureKit {
  id: string;
  name: string;
  hero: SignatureAssetDefinition;
  secondaryAccent: SignatureAssetDefinition | null;
  compatibleWorldBodyIds: string[];
}

export interface WorldArchetype {
  id: string;
  name: string;
  fantasy: string;
  rationale: string;
  /** Existing display sculpt used only by the executable prototype adapter. */
  prototypeCharacterId: string;
  worldBody: WorldBody;
  signatureKit: SignatureKit;
  recognitionKeywords: string[];
  feelingAffinity: FeelId[];
}

export interface WorldPack {
  worldId: string;
  version: string;
  displayName: string;
  rights: {
    status: 'original' | 'licensed' | 'prototype_reference_only';
    commercialUse: boolean;
  };
  visualIdentity: {
    genre: string[];
    renderStyle: string[];
    materials: string[];
    negativeStyle: string[];
  };
  baseGrammar: { motifs: string[]; forbidden: string[] };
  attachmentSystem: MateAttachmentSystem;
  archetypes: WorldArchetype[];
}

export interface ManufacturingProfile {
  id: string;
  name: string;
  base: { diameterMm: number; diameterToleranceMm: number };
  height: { minMm: number; maxMm: number };
  geometry: {
    minSupportedThicknessMm: number | null;
    minUnsupportedThicknessMm: number | null;
    minDetailMm: number | null;
    minWireDiameterMm: number | null;
    maxDisconnectedParts: number | null;
  };
  assembly: {
    maxPartCount: number | null;
    allowedDetachedAccessories: boolean;
    validatedAttachmentSystemVersion: string | null;
    connectorToleranceMm: number | null;
  };
  status: 'draft_factory_validation' | 'factory_validated' | 'retired';
}

export interface IdentityPhoto {
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  dataUri: string;
  width?: number;
  height?: number;
}

export interface UserIdentity {
  photo: IdentityPhoto;
  appearance: {
    recognitionCues: string[];
    hair?: string;
    eyewear?: string;
    facialHair?: string;
  };
  desiredSelf: {
    description: string;
    feelings: FeelId[];
  };
}

export interface RoleRecommendation {
  archetypeId: string;
  rationale: string;
  rank: number;
}

export type AssetKind = 'source-photo' | 'concept' | 'model' | 'model-preview';

export interface GenerationAsset {
  id: string;
  revisionId: string;
  kind: AssetKind;
  view?: ConceptView;
  uri: string;
  mimeType: string;
  requestHash: string;
  provider: string;
  providerModel?: string;
  createdAt: number;
  mock: boolean;
}

export type GenerationOperation =
  | 'front_image_generation'
  | 'side_image_generation'
  | 'back_image_generation'
  | 'multi_image_to_3d';

export interface GenerationUsage {
  id: string;
  buildId: string;
  revisionId: string;
  jobId: string;
  provider: string;
  operation: GenerationOperation;
  providerUnits: number;
  estimatedCostUsd: number | null;
  durationMs: number;
  status: 'success' | 'failed' | 'cached';
  createdAt: number;
}

export interface GenerationJob {
  id: string;
  revisionId: string;
  requestHash: string;
  provider: string;
  operation: GenerationOperation;
  providerJobId?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GeometryMetadata {
  meshExists: boolean;
  nonZeroVolume: boolean | null;
  baseDiameterMm: number | null;
  heightMm: number | null;
  manifold: boolean | null;
  watertight: boolean | null;
  disconnectedComponents: number | null;
  degenerateFaces: number | null;
  invertedNormals: number | null;
  baseContact: boolean | null;
}

export interface QCResult {
  id: string;
  revisionId: string;
  overall: 'pass' | 'warning' | 'fail';
  dimensions: {
    baseDiameterMm: number | null;
    heightMm: number | null;
    pass: boolean | null;
  };
  mesh: {
    exists: boolean;
    nonZeroVolume: boolean | null;
    watertight: boolean | null;
    manifold: boolean | null;
    components: number | null;
    degenerateFaces: number | null;
    invertedNormals: number | null;
  };
  manufacturing: {
    baseContact: boolean | null;
    thinGeometry: 'pass' | 'warning' | 'unknown';
    manualReviewRequired: boolean;
  };
  modularity: {
    systemId: string | null;
    systemVersion: string | null;
    worldBodyId: string | null;
    signatureKitId: string | null;
    configuration: 'pass' | 'fail' | 'not-assessed';
    connectorFit: 'pass' | 'fail' | 'unknown';
    bodyReadsCompleteWithoutSignature: boolean | null;
  };
  warnings: string[];
  createdAt: number;
}

export interface BuildRevision {
  id: string;
  number: number;
  worldPackVersion: string;
  archetypeId: string;
  worldBodyId: string;
  signatureKitId: string;
  promptVersion: string;
  seed: number;
  assets: GenerationAsset[];
  prompts: Partial<Record<ConceptView, string>>;
  qc: QCResult | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorldformFailure {
  stage: GenerationOperation | 'validation' | 'qc';
  message: string;
  retryStatus: Exclude<WorldformStatus, 'FAILED' | 'APPROVED'>;
  occurredAt: number;
}

export interface WorldformEvent {
  name: string;
  at: number;
  data?: Record<string, string | number | boolean | null>;
}

export interface WorldformBuild {
  id: string;
  worldPackId: string;
  worldPackVersion: string;
  manufacturingProfileId: string;
  status: WorldformStatus;
  identity: UserIdentity | null;
  recommendations: RoleRecommendation[];
  selectedArchetypeId: string | null;
  selectedRevisionId: string | null;
  revisions: BuildRevision[];
  jobs: GenerationJob[];
  usage: GenerationUsage[];
  successfulFrontPreviews: number;
  frontPreviewLimit: number;
  frontApprovedRevisionId: string | null;
  multiviewApprovedRevisionId: string | null;
  manualReview: {
    status: 'not-requested' | 'requested' | 'approved' | 'rejected';
    requestedAt?: number;
    decidedAt?: number;
    note?: string;
  };
  failure: WorldformFailure | null;
  events: WorldformEvent[];
  createdAt: number;
  updatedAt: number;
}
