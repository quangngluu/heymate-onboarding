import type { ConceptView, GeometryMetadata } from '../domain/types';

export interface ImageGenerationInput {
  buildId: string;
  revisionId: string;
  view: ConceptView;
  prompt: string;
  sourceImage: string;
  requestHash: string;
  seed: number;
  archetypeName: string;
}

export interface ImageGenerationResult {
  uri: string;
  mimeType: string;
  providerJobId: string;
  providerModel?: string;
  providerUnits: number;
  estimatedCostUsd: number | null;
  mock: boolean;
}

export interface ImageProvider {
  readonly name: string;
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}

export interface ThreeDGenerationInput {
  buildId: string;
  revisionId: string;
  images: [string, string, string];
  requestHash: string;
  texturePrompt: string;
  fallbackModelUrl: string;
}

export interface ThreeDSubmission {
  providerJobId: string;
  providerModel?: string;
}

export interface ThreeDJobStatus {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  modelUrls?: { glb?: string; obj?: string; stl?: string };
  previewUrl?: string;
  providerUnits?: number;
  estimatedCostUsd?: number | null;
  geometry?: GeometryMetadata;
  error?: string;
}

export interface ThreeDProvider {
  readonly name: string;
  createFromImages(input: ThreeDGenerationInput): Promise<ThreeDSubmission>;
  getJob(providerJobId: string): Promise<ThreeDJobStatus>;
}
