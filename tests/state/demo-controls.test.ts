import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';

beforeEach(() => {
  const v = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => v.get(k) ?? null,
    setItem: (k: string, val: string) => v.set(k, val),
  });
});

describe('demo presenter controls', () => {
  it('replayAsReturning preserves owner state while clearing the live session', () => {
    const s = new Store();
    s.set({
      figurineOwned: true,
      ownedVariantId: 'three-d',
      waifuUniverseEntered: false,
      step: 'gallery',
      companionMode: 'playground',
      figurineDisplayMode: 'premium',
      chat: [{ from: 'resident', text: 'Câu cũ vẫn còn trên sân khấu.' }],
      collectibleOpen: true,
      checkoutOpen: true,
      paymentSim: 'qr',
      paymentMethod: 'momo',
    });
    s.replayAsReturning();
    const state = s.get();
    expect(state.figurineOwned).toBe(true);
    expect(state.ownedVariantId).toBe('three-d');
    expect(state.chat).toEqual([]);
    expect(state.waifuUniverseEntered).toBe(true);
    expect(state.step).toBe('stage');
    expect(state.companionMode).toBe('showcase');
    expect(state.figurineDisplayMode).toBe('original');
    expect(state.collectibleOpen).toBe(false);
    expect(state.checkoutOpen).toBe(false);
    expect(state.paymentSim).toBe('idle');
    expect(state.paymentMethod).toBe(null);
  });

  it('resetDemo returns to a fresh visitor and clears ownership and orders', () => {
    const s = new Store();
    s.addFigurineToCart('kagura', 'three-d');
    s.placeOrder({ name: 'A', phone: '0900', email: 'a@b.c', address: 'HN' });
    s.set({ figurineOwned: true, ownedVariantId: 'three-d', bridgeBeatShown: true });
    s.resetDemo();
    const state = s.get();
    expect(state.figurineOwned).toBe(false);
    expect(state.ownedVariantId).toBe(null);
    expect(state.bridgeBeatShown).toBe(false);
    expect(state.orders).toEqual([]);
    expect(state.cart).toEqual([]);
  });
});
