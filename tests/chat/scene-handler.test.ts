import { afterEach, describe, expect, it, vi } from 'vitest';
import sceneHandler from '../../api/scene-image';

const oldDeepSeek = process.env.DEEPSEEK_API_KEY;
const oldFal = process.env.FAL_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (oldDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = oldDeepSeek;
  if (oldFal === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = oldFal;
});

describe('scene-image handler', () => {
  it('falls back to the authored canon brief when the writer times out', async () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    process.env.FAL_KEY = 'test';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(
        Response.json({ images: [{ url: 'https://images.example/frame.jpg' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await sceneHandler(
      new Request('http://local/api/scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: 'rin',
          route: 'sao',
          text: 'Dấu chân có chiều sâu trong Frame 12.',
          scene: 'Motion Archive Corridor, frozen volumetric frame.',
          perspective: 'observed',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://images.example/frame.jpg',
      withSubject: false,
      perspective: 'observed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const drawer = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { prompt: string };
    expect(drawer.prompt).toContain('Performance archive corridor');
    expect(drawer.prompt).toContain('Frame 12');
  });

  it('uses the reviewed Kontext safety tolerance for a resident subject', async () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    process.env.FAL_KEY = 'test';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(
        Response.json({ images: [{ url: 'https://images.example/frame.jpg' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await sceneHandler(
      new Request('http://local/api/scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: 'rin',
          route: 'sao',
          text: 'Rin bước qua hành lang lưu trữ.',
          scene: 'Performance archive corridor, Frame 12.',
          perspective: 'observed',
          subject: 'data:image/webp;base64,AAAA',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const composer = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      safety_tolerance?: string;
    };
    expect(composer.safety_tolerance).toBe('3');
  });

  it('sends only the bounded scene brief for an Open Chat draw', async () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    process.env.FAL_KEY = 'test';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: 'Dark archive room, one cyan monitor, Frame 12.' } }],
        })
      )
      .mockResolvedValueOnce(
        Response.json({ images: [{ url: 'https://images.example/context.jpg' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await sceneHandler(
      new Request('http://local/api/scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: 'rin',
          route: 'sao',
          source: 'open-chat',
          text: 'Liên hệ riêng của anh là visitor@example.com.',
          scene: 'Kho lưu trữ tối với Frame 12 sáng giữa phòng.',
          perspective: 'first-person',
        }),
      })
    );

    expect(response.status).toBe(200);
    const requests = fetchMock.mock.calls.map((call) => String(call[1]?.body));
    expect(requests.join('\n')).not.toContain('visitor@example.com');
    await expect(response.json()).resolves.toMatchObject({ perspective: 'observed' });
  });
});
