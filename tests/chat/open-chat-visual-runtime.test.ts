import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenChatVisualRuntime } from '../../src/chat/open-chat-visual-runtime';
import { createContextVisual } from '../../src/chat/context-visual';
import { Store } from '../../src/state/store';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

const intent = {
  sceneBrief: 'Kho lưu trữ tối với Frame 12 sáng giữa phòng.',
  caption: 'Frame 12 trở lại sau câu trả lời.',
  confidence: 0.9,
};

describe('Open Chat generated visual runtime', () => {
  it('delivers the first high-confidence frame for free without blocking text', async () => {
    const owner = new Store();
    owner.beginEncounter('rin');
    owner.pushTurn({ from: 'user', text: 'Cho anh xem Frame 12.' });
    const reply = owner.pushTurn({ from: 'resident', text: 'Em mở nó đây.' });
    const before = owner.get().credits;
    const drawer = vi.fn(async () => ({
      ok: true as const,
      url: 'https://images.example/frame.jpg',
      perspective: 'observed' as const,
      withSubject: true,
    }));
    const present = vi.fn(async () => true);
    const runtime = new OpenChatVisualRuntime(owner, drawer, present);

    await runtime.replyCommitted({
      residentId: 'rin',
      turnId: reply.id,
      userTurn: owner.get().turns,
      intent,
    });

    expect(owner.get().chat.at(-1)?.text).toBe('Em mở nó đây.');
    expect(owner.get().chat.at(-1)?.contextVisual).toMatchObject({
      payment: 'free-auto',
      status: 'ready',
      src: 'https://images.example/frame.jpg',
      price: 0,
    });
    expect(owner.get().credits).toBe(before);
    expect(owner.contextVisualProgressFor('rin')).toEqual({
      freeState: 'consumed',
      lastDeliveredTurn: 1,
    });
    expect(present).toHaveBeenCalledWith('https://images.example/frame.jpg');
  });

  it('offers the next eligible frame first and charges four credits only on explicit delivery', async () => {
    const owner = new Store();
    owner.beginEncounter('rin');
    owner.set({
      openChatContext: {
        rin: { freeState: 'consumed', lastDeliveredTurn: 1 },
      },
    });
    for (let turn = 0; turn < 5; turn++) {
      owner.pushTurn({ from: 'user', text: `Lượt ${turn + 1}` });
    }
    const reply = owner.pushTurn({ from: 'resident', text: 'Một cảnh khác vừa hiện ra.' });
    const drawer = vi.fn(async () => ({
      ok: true as const,
      url: 'https://images.example/paid.jpg',
      perspective: 'observed' as const,
      withSubject: true,
    }));
    const runtime = new OpenChatVisualRuntime(owner, drawer, async () => true);
    const before = owner.get().credits;

    await runtime.replyCommitted({
      residentId: 'rin',
      turnId: reply.id,
      userTurn: owner.get().turns,
      intent,
    });

    expect(owner.get().chat.at(-1)?.contextVisual).toMatchObject({
      payment: 'paid',
      status: 'offered',
      price: 4,
    });
    expect(drawer).not.toHaveBeenCalled();
    expect(owner.get().credits).toBe(before);

    await expect(runtime.request(reply.id)).resolves.toBe(true);
    expect(drawer).toHaveBeenCalledOnce();
    expect(owner.get().credits).toBe(before - 4);
    expect(owner.get().transactions.filter((item) => item.feature === 'sceneImage')).toHaveLength(1);
    expect(owner.get().chat.at(-1)?.contextVisual).toMatchObject({
      status: 'ready',
      src: 'https://images.example/paid.jpg',
    });
  });

  it('releases a paid hold when the generated texture cannot be presented', async () => {
    const owner = new Store();
    owner.beginEncounter('rin');
    owner.set({
      openChatContext: { rin: { freeState: 'consumed', lastDeliveredTurn: 0 } },
    });
    for (let turn = 0; turn < 4; turn++) {
      owner.pushTurn({ from: 'user', text: `Lượt ${turn + 1}` });
    }
    const reply = owner.pushTurn({ from: 'resident', text: 'Em thử dựng lại.' });
    const runtime = new OpenChatVisualRuntime(
      owner,
      vi.fn(async () => ({
        ok: true as const,
        url: 'https://images.example/unloadable.jpg',
        perspective: 'observed' as const,
        withSubject: true,
      })),
      async () => false
    );
    await runtime.replyCommitted({
      residentId: 'rin',
      turnId: reply.id,
      userTurn: owner.get().turns,
      intent,
    });
    const before = owner.get().credits;

    await runtime.request(reply.id);

    expect(owner.get().credits).toBe(before);
    expect(owner.get().creditReservations).toEqual({});
    expect(owner.get().transactions).toHaveLength(0);
    expect(owner.get().chat.at(-1)?.contextVisual).toMatchObject({ status: 'offered' });
  });

  it('keeps a slow frame on its owner card without reviving the backdrop after chat continues', async () => {
    const owner = new Store();
    owner.beginEncounter('rin');
    owner.pushTurn({ from: 'user', text: 'Cho anh xem.' });
    const reply = owner.pushTurn({ from: 'resident', text: 'Đợi một chút.' });
    let finish!: (value: {
      ok: true;
      url: string;
      perspective: 'observed';
      withSubject: true;
    }) => void;
    const drawer = vi.fn(
      () =>
        new Promise<{
          ok: true;
          url: string;
          perspective: 'observed';
          withSubject: true;
        }>((resolve) => {
          finish = resolve;
        })
    );
    const present = vi.fn(async () => true);
    const runtime = new OpenChatVisualRuntime(owner, drawer, present);
    const pending = runtime.replyCommitted({
      residentId: 'rin',
      turnId: reply.id,
      userTurn: owner.get().turns,
      intent,
    });

    owner.pushTurn({ from: 'user', text: 'Anh nói tiếp đây.' });
    finish({
      ok: true,
      url: 'https://images.example/late.jpg',
      perspective: 'observed',
      withSubject: true,
    });
    await pending;

    expect(owner.contextVisualProgressFor('rin')).toEqual({
      freeState: 'consumed',
      lastDeliveredTurn: 1,
    });
    expect(owner.get().chat.find((turn) => turn.id === reply.id)?.contextVisual).toMatchObject({
      status: 'ready',
      src: 'https://images.example/late.jpg',
    });
    expect(present).not.toHaveBeenCalled();
  });

  it('consumes the free attempt when generation fails instead of allowing unlimited retries', async () => {
    const owner = new Store();
    owner.beginEncounter('rin');
    owner.pushTurn({ from: 'user', text: 'Cho anh xem.' });
    const reply = owner.pushTurn({ from: 'resident', text: 'Em thử dựng lại.' });
    const runtime = new OpenChatVisualRuntime(
      owner,
      vi.fn(async () => ({ ok: false as const, reason: 'drawer' as const })),
      async () => true
    );

    await runtime.replyCommitted({
      residentId: 'rin',
      turnId: reply.id,
      userTurn: owner.get().turns,
      intent,
    });

    expect(owner.contextVisualProgressFor('rin')).toEqual({
      freeState: 'consumed',
      lastDeliveredTurn: 1,
    });
    expect(owner.get().chat.at(-1)?.contextVisual).toMatchObject({ status: 'failed' });
  });

  it('does not sell a draw that already exists in the generated-scene cache', async () => {
    const owner = new Store();
    owner.beginEncounter('rin');
    owner.set({
      openChatContext: { rin: { freeState: 'consumed', lastDeliveredTurn: 1 } },
    });
    const earlier = owner.pushTurn({ from: 'resident', text: 'Khung trước.' });
    const cachedRuntime = new OpenChatVisualRuntime(owner, vi.fn(), async () => true);
    const cachedVisual = createContextVisual({
      residentId: 'rin',
      turnId: earlier.id,
      intent,
      payment: 'paid',
    });
    owner.keepShot(cachedVisual.cacheKey, 'https://images.example/cached.jpg');
    for (let turn = 0; turn < 5; turn++) {
      owner.pushTurn({ from: 'user', text: `Lượt ${turn + 1}` });
    }
    const reply = owner.pushTurn({ from: 'resident', text: 'Vẫn là khung đó.' });

    await cachedRuntime.replyCommitted({
      residentId: 'rin',
      turnId: reply.id,
      userTurn: owner.get().turns,
      intent,
    });

    expect(owner.get().chat.at(-1)?.contextVisual).toBeUndefined();
  });

  it('lets the visitor dismiss an unpaid offer so later intents are not blocked forever', async () => {
    const owner = new Store();
    owner.beginEncounter('rin');
    owner.set({
      openChatContext: { rin: { freeState: 'consumed', lastDeliveredTurn: 1 } },
    });
    for (let turn = 0; turn < 5; turn++) {
      owner.pushTurn({ from: 'user', text: `Lượt ${turn + 1}` });
    }
    const reply = owner.pushTurn({ from: 'resident', text: 'Một cảnh được đề xuất.' });
    const runtime = new OpenChatVisualRuntime(owner, vi.fn(), async () => true);
    await runtime.replyCommitted({
      residentId: 'rin',
      turnId: reply.id,
      userTurn: owner.get().turns,
      intent,
    });

    expect(runtime.dismiss(reply.id)).toBe(true);
    expect(owner.get().chat.at(-1)?.contextVisual).toMatchObject({ status: 'failed' });
    expect(owner.hasOutstandingContextVisual('rin')).toBe(false);
    expect(owner.get().credits).toBe(100);
  });
});
