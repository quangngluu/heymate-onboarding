import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROUTE, resolveCanonRoute } from '../../src/config/canon-route';
import { Store } from '../../src/state/store';

class MemoryStorage {
  private values = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(seed)) this.values.set(key, value);
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function runtime(search = '', seed: Record<string, string> = {}): MemoryStorage {
  const storage = new MemoryStorage(seed);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    location: { search },
    localStorage: storage,
  });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('v3 production cutover', () => {
  it('uses the source-anime canon as the only public default', () => {
    runtime();

    expect(DEFAULT_ROUTE).toBe('sao');
    expect(resolveCanonRoute()).toBe('sao');
  });

  it('migrates a sticky Hub route to v3 instead of replaying v1', () => {
    const storage = runtime('', { 'heymate.canonRoute': 'hub' });

    expect(resolveCanonRoute()).toBe('sao');
    expect(storage.getItem('heymate.canonRoute')).toBe('sao');
  });

  it('does not expose legacy canon through a public query parameter', () => {
    runtime('?canon=hub');

    expect(resolveCanonRoute()).toBe('sao');
  });

  it('does not load the discarded test save', () => {
    runtime('', {
      'heymate.progress.v1': JSON.stringify({
        progress: {
          rin: {
            memories: ['Interlude Hub test memory'],
            revealed: 5,
            nickname: 'Test',
            persona: '',
            identity: '',
            visits: 10,
            completedQuests: ['legacy'],
          },
        },
        transcripts: {
          rin: [{ from: 'resident', text: 'Old Hub transcript' }],
        },
      }),
    });

    const state = new Store().get();
    expect(state.progress).toEqual({});
    expect(state.transcripts).toEqual({});
  });

  it('opens Rin Quest on the public v3 route without a prototype flag', () => {
    runtime();
    const store = new Store();
    store.beginEncounter('rin');

    expect(store.startQuest('rin-twelfth-frame')).toBe(true);
  });
});
