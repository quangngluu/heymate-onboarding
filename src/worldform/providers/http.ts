import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageProvider,
  ThreeDGenerationInput,
  ThreeDJobStatus,
  ThreeDProvider,
  ThreeDSubmission,
} from './types';

async function jsonOrError<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error ?? `provider request failed (${response.status})`);
  return data;
}

export class HttpImageProvider implements ImageProvider {
  readonly name = 'fal-worldform-image';

  constructor(private readonly endpoint = '/api/worldform-image') {}

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        view: input.view,
        prompt: input.prompt,
        sourceImage: input.sourceImage,
        requestHash: input.requestHash,
        seed: input.seed,
      }),
    });
    return jsonOrError<ImageGenerationResult>(response);
  }
}

export class HttpThreeDProvider implements ThreeDProvider {
  readonly name = 'meshy-multi-image-3d';

  constructor(private readonly endpoint = '/api/worldform-3d') {}

  async createFromImages(input: ThreeDGenerationInput): Promise<ThreeDSubmission> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: input.images,
        texturePrompt: input.texturePrompt,
        requestHash: input.requestHash,
      }),
    });
    return jsonOrError<ThreeDSubmission>(response);
  }

  async getJob(providerJobId: string): Promise<ThreeDJobStatus> {
    const response = await fetch(`${this.endpoint}?id=${encodeURIComponent(providerJobId)}`);
    return jsonOrError<ThreeDJobStatus>(response);
  }
}
