import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

describe('entry-cinematic store flags', () => {
  it('defaults both flags false', () => {
    const store = new Store();
    expect(store.get().waifuUniverseEntered).toBe(false);
    expect(store.get().editionsRevealed).toBe(false);
  });

  it('persists waifuUniverseEntered across a reload', () => {
    new Store().markWaifuUniverseEntered();
    expect(new Store().get().waifuUniverseEntered).toBe(true);
  });

  it('does not persist editionsRevealed', () => {
    const store = new Store();
    store.revealEditions();
    expect(store.get().editionsRevealed).toBe(true);
    expect(new Store().get().editionsRevealed).toBe(false);
  });

  it('re-hides editions when the universe is left', () => {
    const store = new Store();
    store.revealEditions();
    store.leaveUniverse();
    expect(store.get().editionsRevealed).toBe(false);
  });

  it('keeps waifuUniverseEntered true in memory across an in-session leave', () => {
    const store = new Store();
    store.markWaifuUniverseEntered();
    store.leaveUniverse();
    expect(store.get().waifuUniverseEntered).toBe(true);
  });
});
