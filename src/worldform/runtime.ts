import { WorldformOrchestrator } from './orchestrator';
import { HttpImageProvider, HttpThreeDProvider } from './providers/http';
import { MockImageProvider, MockThreeDProvider } from './providers/mock';
import { BrowserGlbModelInspector } from './qc/model-inspector';
import { LocalStorageWorldformRepository } from './repository';
import { loadRawModel } from '../three/champions';

export interface WorldformRuntime {
  orchestrator: WorldformOrchestrator;
  mode: 'mock' | 'live';
}

let singleton: WorldformRuntime | null = null;

export function worldformRuntime(): WorldformRuntime {
  if (singleton) return singleton;
  const env = import.meta.env as Record<string, string | undefined>;
  const live = env.VITE_WORLDFORM_PROVIDER === 'live';
  singleton = {
    mode: live ? 'live' : 'mock',
    orchestrator: new WorldformOrchestrator({
      repository: new LocalStorageWorldformRepository(),
      imageProvider: live ? new HttpImageProvider() : new MockImageProvider(),
      threeDProvider: live ? new HttpThreeDProvider() : new MockThreeDProvider(),
      // Reuse the app loader: it already owns the renderer-dependent KTX2
      // setup and Meshopt decoder required by the shipped prototype GLBs.
      modelInspector: new BrowserGlbModelInspector(loadRawModel),
    }),
  };
  return singleton;
}
