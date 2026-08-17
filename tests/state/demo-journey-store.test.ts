import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';

beforeEach(() => {
  const v = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => v.get(k) ?? null,
    setItem: (k: string, val: string) => v.set(k, val),
  });
});

describe('demo-journey state', () => {
  it('defaults are demo-clean', () => {
    const s = new Store().get();
    expect(s.figurineOwned).toBe(false);
    expect(s.ownedVariantId).toBe(null);
    expect(s.bridgeBeatShown).toBe(false);
    expect(s.paymentSim).toBe('idle');
    expect(s.paymentMethod).toBe(null);
  });

  it('persists figurineOwned/ownedVariantId/bridgeBeatShown across reload, not paymentSim', () => {
    const a = new Store();
    a.set({ figurineOwned: true, ownedVariantId: 'three-d', bridgeBeatShown: true, paymentSim: 'success' });
    (a as unknown as { persist(): void }).persist?.();
    const b = new Store().get();
    expect(b.figurineOwned).toBe(true);
    expect(b.ownedVariantId).toBe('three-d');
    expect(b.bridgeBeatShown).toBe(true);
    expect(b.paymentSim).toBe('idle'); // session-only resets
  });
});
