import { describe, expect, it } from 'vitest';
import chatHandler from '../../api/chat';
import questHandler from '../../api/quest';
import sceneHandler from '../../api/scene-image';

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://local${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('v3-only public APIs', () => {
  it.each([
    ['chat', chatHandler, '/api/chat'],
    ['quest', questHandler, '/api/quest'],
    ['scene', sceneHandler, '/api/scene-image'],
  ] as const)('rejects the retired Hub route on %s', async (_name, handler, path) => {
    const response = await handler(post(path, { route: 'hub' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'retired-route' });
  });
});
