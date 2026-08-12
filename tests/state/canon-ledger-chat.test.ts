import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';

// This repo's vitest environment has no global localStorage (Node's is
// experimental and off by default), so every store test stubs one in. See
// tests/state/persona-store.test.ts for the same pattern.
class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

let storage: MemoryStorage;

describe('chat-born canon ledger entries', () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records improvised facts without a quest', () => {
    const store = new Store();
    store.recordImprovisedCanon('kagura', [
      { kind: 'place', text: 'Quán mì dưới cầu vượt, nơi em hay ngồi cuối ca.' },
    ]);

    const entries = store.get().canonLedger;
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('chat');
    expect(entries[0].questId).toBeUndefined();
    expect(entries[0].nodeId).toBeUndefined();
    expect(entries[0].refCount).toBe(0);
  });

  it('caps the ledger at 240 entries', () => {
    const store = new Store();
    for (let i = 0; i < 130; i += 1) {
      store.recordImprovisedCanon('kagura', [
        { kind: 'object', text: `vật thể ${i}` },
        { kind: 'habit', text: `thói quen ${i}` },
      ]);
    }
    expect(store.get().canonLedger).toHaveLength(240);
    expect(store.get().canonLedger.at(-1)?.text).toBe('thói quen 129');
  });

  it('defaults legacy persisted entries to the quest source', () => {
    localStorage.setItem(
      'heymate.progress.sao.v1',
      JSON.stringify({
        canonLedger: [
          {
            id: 'legacy-1',
            residentId: 'kagura',
            questId: 'q1',
            nodeId: 'n1',
            canonType: 'branch',
            text: 'cũ',
            createdAt: 1,
          },
        ],
      })
    );

    const store = new Store();
    expect(store.get().canonLedger[0].source).toBe('quest');
  });
});
