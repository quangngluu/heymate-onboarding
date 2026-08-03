import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawScene } from '../../src/chat/scene';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scene drawing result contract', () => {
  it('returns a structured success and sends an explicit no-subject request', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      url: 'https://images.example/frame.jpg',
      perspective: 'observed',
      withSubject: false,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(drawScene({
      residentId: 'rin',
      route: 'sao',
      text: 'Frame mở.',
      perspective: 'observed',
      subjectStrategy: 'none',
    })).resolves.toEqual({
      ok: true,
      url: 'https://images.example/frame.jpg',
      perspective: 'observed',
      withSubject: false,
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ residentId: 'rin', route: 'sao', perspective: 'observed' });
    expect(body).not.toHaveProperty('subject');
  });

  it.each([
    ['flagged', 502, 'flagged'],
    ['writer', 502, 'writer'],
    ['drawer', 502, 'drawer'],
    ['not-configured', 503, 'unconfigured'],
    ['unknown-error', 500, 'invalid'],
  ] as const)('maps %s failures without returning null', async (error, status, reason) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error }, { status })));

    await expect(drawScene({
      residentId: 'rin',
      route: 'sao',
      text: 'Frame mở.',
      subjectStrategy: 'none',
    })).resolves.toEqual({ ok: false, reason });
  });

  it('classifies an aborted transport as a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }));

    await expect(drawScene({
      residentId: 'rin',
      route: 'sao',
      text: 'Frame mở.',
      subjectStrategy: 'none',
    })).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('propagates caller cancellation into the image request', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('cancelled', 'AbortError'));
            });
            setTimeout(
              () => resolve(Response.json({ url: 'late', perspective: 'observed', withSubject: false })),
              30
            );
          })
      )
    );

    const pending = drawScene({
      residentId: 'rin',
      route: 'sao',
      text: 'Frame mở.',
      subjectStrategy: 'none',
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('rejects a malformed success body as invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ url: '' })));

    await expect(drawScene({
      residentId: 'rin',
      route: 'sao',
      text: 'Frame mở.',
      subjectStrategy: 'none',
    })).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it('fails closed on identity+pose until E2 supplies a verified transport', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(drawScene({
      residentId: 'rin',
      route: 'sao',
      text: 'Frame mở.',
      subjectStrategy: 'identity+pose',
    })).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
