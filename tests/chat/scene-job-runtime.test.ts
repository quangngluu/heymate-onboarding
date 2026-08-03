import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneJobRuntime } from '../../src/chat/scene-job-runtime';
import { Store } from '../../src/state/store';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

describe('shared generated scene job runtime', () => {
  it('settles a reserved image credit only after a valid scene is presented', async () => {
    const owner = new Store();
    const before = owner.get().credits;
    expect(owner.reserveCredit('job-1', 'sceneImage')).toBe(true);
    const drawer = vi.fn(async () => ({
      ok: true as const,
      url: 'https://images.example/frame.jpg',
      perspective: 'observed' as const,
      withSubject: false,
    }));
    const present = vi.fn(async () => true);
    const runtime = new SceneJobRuntime(owner, drawer);

    const result = await runtime.run({
      id: 'job-1',
      cacheKey: 'context:frame-1',
      request: {
        residentId: 'rin',
        text: 'Màn hình xanh trong phòng lưu trữ tối.',
        scene: 'Màn hình xanh trong phòng lưu trữ tối.',
        perspective: 'observed',
        subjectStrategy: 'none',
      },
      expected: { perspective: 'observed', withSubject: false },
      billing: { kind: 'reserved', reservationId: 'job-1' },
      isCurrent: () => true,
      stalePolicy: 'refund-and-discard',
      present,
    });

    expect(result).toEqual({
      status: 'ready',
      url: 'https://images.example/frame.jpg',
      fromCache: false,
    });
    expect(present).toHaveBeenCalledWith('https://images.example/frame.jpg');
    expect(owner.get().credits).toBe(before - 4);
    expect(owner.get().transactions.filter((item) => item.feature === 'sceneImage')).toHaveLength(1);
    expect(owner.get().sceneShots['context:frame-1']).toBe('https://images.example/frame.jpg');
  });

  it('cancels stale work and releases the reservation without a refund transaction', async () => {
    const owner = new Store();
    const before = owner.get().credits;
    expect(owner.reserveCredit('job-2', 'sceneImage')).toBe(true);
    const drawer = vi.fn(
      (input: { signal?: AbortSignal }) =>
        new Promise<{ ok: false; reason: 'timeout' }>((resolve) => {
          input.signal?.addEventListener('abort', () => resolve({ ok: false, reason: 'timeout' }));
        })
    );
    const runtime = new SceneJobRuntime(owner, drawer);
    const pending = runtime.run({
      id: 'job-2',
      cacheKey: 'context:frame-2',
      request: {
        residentId: 'rin',
        text: 'Một hành lang tối.',
        subjectStrategy: 'none',
      },
      expected: { perspective: 'observed', withSubject: false },
      billing: { kind: 'reserved', reservationId: 'job-2' },
      isCurrent: () => false,
      stalePolicy: 'refund-and-discard',
      present: async () => true,
    });

    runtime.cancel('job-2');
    expect(await pending).toEqual({ status: 'failed', reason: 'timeout' });
    expect(owner.get().credits).toBe(before);
    expect(owner.get().creditReservations).toEqual({});
    expect(owner.get().transactions).toHaveLength(0);
  });

  it('releases a reservation when a drawer throws outside its normal result contract', async () => {
    const owner = new Store();
    expect(owner.reserveCredit('job-3', 'sceneImage')).toBe(true);
    const runtime = new SceneJobRuntime(owner, vi.fn(async () => {
      throw new Error('transport exploded');
    }));

    await expect(
      runtime.run({
        id: 'job-3',
        cacheKey: 'context:frame-3',
        request: { residentId: 'rin', text: 'Một hành lang tối.' },
        expected: { perspective: 'observed', withSubject: false },
        billing: { kind: 'reserved', reservationId: 'job-3' },
        isCurrent: () => true,
        stalePolicy: 'refund-and-discard',
        present: async () => true,
      })
    ).resolves.toEqual({ status: 'failed', reason: 'drawer' });
    expect(owner.get().creditReservations).toEqual({});
    expect(owner.get().transactions).toHaveLength(0);
  });
});
