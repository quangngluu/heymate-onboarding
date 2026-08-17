import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';

beforeEach(() => {
  const v = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => v.get(k) ?? null,
    setItem: (k: string, val: string) => v.set(k, val),
  });
});

describe('bridge beat', () => {
  it('fires once for kagura after BRIDGE_TRIGGER_TURNS in playground, never after owning', () => {
    const s = new Store();
    s.set({ companionMode: 'playground', turns: 3 }); // kagura is default resident
    expect(s.peekBridgeBeat()?.residentId).toBe('kagura');
    s.consumeBridgeBeat();
    expect(s.get().bridgeBeatShown).toBe(true);
    expect(s.peekBridgeBeat()).toBe(null);           // one-shot
  });

  it('does not fire before threshold, outside playground, or when owned', () => {
    const s = new Store();
    s.set({ companionMode: 'playground', turns: 2 }); expect(s.peekBridgeBeat()).toBe(null);
    s.set({ companionMode: 'showcase', turns: 5 });   expect(s.peekBridgeBeat()).toBe(null);
    s.set({ companionMode: 'playground', turns: 5, figurineOwned: true }); expect(s.peekBridgeBeat()).toBe(null);
  });
});
