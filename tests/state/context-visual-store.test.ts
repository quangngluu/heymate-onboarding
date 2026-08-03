import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store, availableCredits } from '../../src/state/store';
import { createContextVisual } from '../../src/chat/context-visual';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

describe('context visual credit reservation', () => {
  it('locks the image price and records one spend only after delivery commits', () => {
    const store = new Store();
    const before = store.get().credits;

    expect(store.reserveCredit('draw-1', 'sceneImage')).toBe(true);
    expect(store.get().credits).toBe(before);
    expect(availableCredits(store.get())).toBe(before - 4);
    expect(store.get().transactions).toHaveLength(0);

    expect(store.commitCredit('draw-1')).toBe(true);
    expect(store.get().credits).toBe(before - 4);
    expect(store.get().transactions.at(-1)).toMatchObject({
      kind: 'spend',
      feature: 'sceneImage',
      amount: 4,
    });
  });

  it('updates only the stable resident turn that owns a generated visual', () => {
    const store = new Store();
    store.beginEncounter('rin');
    const reply = store.pushTurn({ from: 'resident', text: 'Em giữ khung đó.' });
    const visual = createContextVisual({
      residentId: 'rin',
      turnId: reply.id!,
      intent: {
        sceneBrief: 'Màn hình xanh trong phòng lưu trữ tối.',
        caption: 'Một khung hình được giữ lại.',
        confidence: 0.9,
      },
      payment: 'paid',
    });

    expect(store.attachContextVisual('rin', reply.id!, visual)).toBe(true);
    store.beginEncounter('kagura');
    expect(
      store.updateContextVisual('rin', reply.id!, visual.jobId, {
        status: 'ready',
        src: 'https://images.example/frame.jpg',
      })
    ).toBe(true);
    expect(store.get().chat).toEqual([]);

    store.beginEncounter('rin');
    expect(store.get().chat.at(-1)?.contextVisual).toMatchObject({
      jobId: visual.jobId,
      status: 'ready',
      src: 'https://images.example/frame.jpg',
    });
  });

  it('reserves one free slot and records a consumed generation attempt', () => {
    const store = new Store();

    expect(store.reserveFreeContextVisual('rin', 'free-1')).toBe(true);
    expect(store.reserveFreeContextVisual('rin', 'free-2')).toBe(false);
    expect(store.releaseFreeContextVisual('rin', 'free-1')).toBe(true);
    expect(store.reserveFreeContextVisual('rin', 'free-2')).toBe(true);
    expect(store.commitFreeContextVisual('rin', 'free-2', 3)).toBe(true);
    expect(store.contextVisualProgressFor('rin')).toEqual({
      freeState: 'consumed',
      lastDeliveredTurn: 3,
    });
    expect(store.reserveFreeContextVisual('rin', 'free-3')).toBe(false);
  });

  it('does not mint another free frame after leaving and re-entering the universe', () => {
    const store = new Store();
    store.beginEncounter('rin');
    expect(store.reserveFreeContextVisual('rin', 'free-1')).toBe(true);
    expect(store.commitFreeContextVisual('rin', 'free-1', 2)).toBe(true);

    store.leaveUniverse();
    store.beginEncounter('rin');

    expect(store.contextVisualProgressFor('rin')).toEqual({
      freeState: 'consumed',
      lastDeliveredTurn: 2,
    });
    expect(store.reserveFreeContextVisual('rin', 'free-2')).toBe(false);
  });

  it('does not retry a consumed free attempt after reload', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const first = new Store();
    first.beginEncounter('rin');
    const reply = first.pushTurn({ from: 'resident', text: 'Em đang dựng lại.' });
    const visual = createContextVisual({
      residentId: 'rin',
      turnId: reply.id,
      intent: {
        sceneBrief: 'Kho lưu trữ tối với Frame 12.',
        caption: 'Frame 12 hiện lại.',
        confidence: 0.9,
      },
      payment: 'free-auto',
    });
    first.reserveFreeContextVisual('rin', visual.jobId);
    first.attachContextVisual('rin', reply.id, visual);
    first.commitFreeContextVisual('rin', visual.jobId, 1);

    const restored = new Store();
    restored.beginEncounter('rin');

    expect(restored.get().chat.at(-1)?.contextVisual?.status).toBe('failed');
    expect(restored.contextVisualProgressFor('rin')).toEqual({
      freeState: 'consumed',
      lastDeliveredTurn: 1,
    });
  });
});
