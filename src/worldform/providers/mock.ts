import { fnv1a } from '../../util/hash';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageProvider,
  ThreeDGenerationInput,
  ThreeDJobStatus,
  ThreeDProvider,
  ThreeDSubmission,
} from './types';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return replacements[char];
  });
}

function mockConcept(input: ImageGenerationInput): string {
  const hue = fnv1a(`${input.requestHash}:${input.seed}`) % 360;
  const side = input.view === 'side';
  const back = input.view === 'back';
  const headX = side ? 414 : 384;
  const bodyWidth = side ? 170 : 260;
  const label = input.view.toLocaleUpperCase('en-US');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="960" viewBox="0 0 768 960">
    <defs>
      <radialGradient id="g" cx="50%" cy="35%" r="68%"><stop offset="0" stop-color="hsl(${hue} 52% 28%)"/><stop offset="1" stop-color="#0b0b0e"/></radialGradient>
      <linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 76% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 42) % 360} 58% 28%)"/></linearGradient>
    </defs>
    <rect width="768" height="960" fill="url(#g)"/>
    <ellipse cx="384" cy="838" rx="230" ry="64" fill="#111" stroke="hsl(${hue} 70% 58%)" stroke-width="8"/>
    <path d="M154 838 Q384 780 614 838 L586 880 Q384 922 182 880Z" fill="#18181d"/>
    <circle cx="${headX}" cy="250" r="118" fill="url(#m)"/>
    <path d="M${384 - bodyWidth / 2} 390 Q384 330 ${384 + bodyWidth / 2} 390 L560 758 Q384 810 208 758Z" fill="url(#m)" stroke="#ece4d7" stroke-opacity=".45" stroke-width="5"/>
    <path d="M270 480 L182 690 M498 480 L586 690" stroke="#1d1e24" stroke-width="58" stroke-linecap="round"/>
    <path d="M320 750 L286 832 M448 750 L482 832" stroke="#24242b" stroke-width="70" stroke-linecap="round"/>
    ${back ? '<path d="M300 420 Q384 520 468 420" fill="none" stroke="#f2eadc" stroke-width="16" opacity=".5"/>' : ''}
    <text x="48" y="72" fill="#f3eee5" font-family="system-ui,sans-serif" font-size="24" letter-spacing="6">WORLDFORM / MOCK ${label}</text>
    <text x="48" y="112" fill="hsl(${hue} 72% 70%)" font-family="system-ui,sans-serif" font-size="32" font-weight="700">${escapeXml(input.archetypeName)}</text>
    <text x="48" y="926" fill="#aaa3a0" font-family="system-ui,sans-serif" font-size="18">Deterministic local adapter — no provider cost</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class MockImageProvider implements ImageProvider {
  readonly name = 'worldform-mock-image';

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    return {
      uri: mockConcept(input),
      mimeType: 'image/svg+xml',
      providerJobId: `mock-image-${input.requestHash}`,
      providerModel: 'deterministic-svg-v1',
      providerUnits: 0,
      estimatedCostUsd: 0,
      mock: true,
    };
  }
}

function encodeJob(input: ThreeDGenerationInput): string {
  const payload = JSON.stringify({ hash: input.requestHash, model: input.fallbackModelUrl });
  return `mock-3d.${encodeURIComponent(payload)}`;
}

export class MockThreeDProvider implements ThreeDProvider {
  readonly name = 'worldform-mock-3d';

  async createFromImages(input: ThreeDGenerationInput): Promise<ThreeDSubmission> {
    return { providerJobId: encodeJob(input), providerModel: 'existing-prototype-glb' };
  }

  async getJob(providerJobId: string): Promise<ThreeDJobStatus> {
    try {
      const parsed = JSON.parse(decodeURIComponent(providerJobId.replace(/^mock-3d\./, ''))) as {
        model: string;
      };
      return {
        status: 'succeeded',
        progress: 100,
        modelUrls: { glb: parsed.model },
        previewUrl: parsed.model.replace(/assets\/champion-([^/.]+)\.glb(?:\?.*)?$/i, 'assets/thumbs/$1.webp'),
        providerUnits: 0,
        estimatedCostUsd: 0,
      };
    } catch {
      return { status: 'failed', progress: 0, error: 'invalid mock job' };
    }
  }
}
