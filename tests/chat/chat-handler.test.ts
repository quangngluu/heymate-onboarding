import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/chat';

const originalKey = process.env.DEEPSEEK_API_KEY;

function request(): Request {
  return new Request('http://local/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      residentId: 'rin',
      mode: 'open-chat',
      session: {
        nickname: '',
        persona: '',
        identity: '',
        scenario: 'casual',
        length: 'natural',
      },
      memories: [],
      revealed: 0,
      history: [],
      questHistory: [],
      message: 'Nói tiếp đi.',
      route: 'sao',
    }),
  });
}

function upstream(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('chat addressing repair ladder', () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });

  it('returns a validated Open Chat visual intent without exposing private state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        upstream(
          'Em thấy Frame 12 sáng lên.\n<<state {"trust":0.4,"respect":0.4,"desire":0.2,"irritation":0.1,"attachment":0.3,"unresolvedConflict":null,"repairStatus":"none","visualIntent":{"sceneBrief":"Kho lưu trữ tối với Frame 12 sáng giữa phòng.","caption":"Frame 12 trở lại sau câu trả lời.","confidence":0.9}}>>'
        )
      )
    );

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: 'Em thấy Frame 12 sáng lên.',
      rapport: {
        trust: 0.4,
        respect: 0.4,
        desire: 0.2,
        irritation: 0.1,
        attachment: 0.3,
        unresolvedConflict: null,
        repairStatus: 'none',
        lastBoundary: null,
      },
      visualIntent: {
        sceneBrief: 'Kho lưu trữ tối với Frame 12 sáng giữa phòng.',
        caption: 'Frame 12 trở lại sau câu trả lời.',
        confidence: 0.9,
      },
    });
  });

  it('asks the model for a visual only when the current turn contains a concrete scene', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream('Em vẫn nghe anh.'));
    vi.stubGlobal('fetch', fetchMock);

    await handler(request());

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      messages: { role: string; content: string }[];
      max_tokens: number;
    };
    const system = body.messages.find((message) => message.role === 'system')?.content ?? '';
    expect(system).toContain('"visualIntent":null');
    expect(system).toContain('chỉ đề xuất ảnh khi');
    expect(system).toContain('không chép lại nguyên tin nhắn');
    expect(body.max_tokens).toBe(300);
  });

  it('does not flag third-party relationship nouns or explicit quoted mentions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      upstream('Người bạn của em nhắc lại lời anh: “Tôi sẽ đến.”')
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: 'Người bạn của em nhắc lại lời anh: “Tôi sẽ đến.”',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repairs unambiguous address deterministically and keeps original rapport', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      upstream(
        'Tôi sẽ đợi anh.\n<<state {"trust":2,"respect":0.4,"desire":0.2,"irritation":0.1,"attachment":0.3,"unresolvedConflict":null,"repairStatus":"none"}>>'
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.text).toBe('Em sẽ đợi anh.');
    expect(body.rapport.trust).toBe(1);
    expect(body.rapport.respect).toBe(0.4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses one constrained patch pass and keeps original rapport', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        upstream(
          'Mình vẫn ở đây.\n<<state {"trust":0.42,"respect":0.4,"desire":0.2,"irritation":0.1,"attachment":0.3,"unresolvedConflict":null,"repairStatus":"none"}>>'
        )
      )
      .mockResolvedValueOnce(
        upstream('{"replacements":[{"start":0,"end":4,"from":"Mình","to":"Em"}]}')
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await response.json();
    const repairInit = fetchMock.mock.calls[1][1] as RequestInit;
    const repairBody = JSON.parse(String(repairInit.body));

    expect(response.status).toBe(200);
    expect(body.text).toBe('Em vẫn ở đây.');
    expect(body.rapport.trust).toBe(0.42);
    expect(body.rapport.unresolvedConflict).toBeNull();
    expect(repairBody.temperature).toBe(0);
    expect(repairBody.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(repairBody.messages)).not.toContain('0.42');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a repair that tries to change branch facts outside the flagged span', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(upstream('Mình vẫn giữ Frame 12.'))
        .mockResolvedValueOnce(upstream('Em đã xoá Frame 12.'))
    );

    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'invalid-addressing' });
  });

  it('rejects a truncated repair patch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(upstream('Mình vẫn ở đây.'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: '{"replacements":[{"start":0,"end":4,"from":"Mình","to":"Em"}]}',
                  },
                  finish_reason: 'length',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
    );

    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'invalid-addressing' });
  });

  it('fails closed on English contractions instead of producing token hybrids', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream("I'm here for you."));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'invalid-addressing' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns invalid-addressing when the repair upstream fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(upstream('Mình vẫn ở đây.')).mockResolvedValueOnce(
        new Response('failed', { status: 500 })
      )
    );

    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'invalid-addressing' });
  });

  it('preserves the original upstream failure contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('failed', { status: 429 })));

    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream', status: 429 });
  });
});
