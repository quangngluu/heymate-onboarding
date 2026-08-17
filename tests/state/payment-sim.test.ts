import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';

beforeEach(() => {
  const v = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => v.get(k) ?? null,
    setItem: (k: string, val: string) => v.set(k, val),
  });
});

describe('payment sim state machine', () => {
  it('runs method→qr→processing→success and marks order paid-demo + ownership', () => {
    const s = new Store();
    s.addFigurineToCart('kagura', 'three-d');
    const order = s.placeOrder({ name: 'A', phone: '0900', email: 'a@b.c', address: 'HN' });
    expect(order?.status).toBe('pending-payment');
    s.beginPayment();            expect(s.get().paymentSim).toBe('method');
    s.choosePaymentMethod('momo'); expect(s.get().paymentSim).toBe('qr'); expect(s.get().paymentMethod).toBe('momo');
    s.confirmPaymentSent();      expect(s.get().paymentSim).toBe('processing');
    s.completePaymentSim();      expect(s.get().paymentSim).toBe('success');
    expect(s.get().figurineOwned).toBe(true);
    expect(s.get().ownedVariantId).toBe('three-d');
    expect(s.get().orders.at(-1)?.status).toBe('paid-demo');
  });

  it('cancel resets to idle with no stuck state', () => {
    const s = new Store(); s.set({ paymentSim: 'qr', paymentMethod: 'vnpay' });
    s.cancelPaymentSim(); expect(s.get().paymentSim).toBe('idle'); expect(s.get().paymentMethod).toBe(null);
  });
});
