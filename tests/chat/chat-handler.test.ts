import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/chat';

const originalKey = process.env.DEEPSEEK_API_KEY;
const originalPersonaSeed = process.env.PERSONA_SEED;

function request(overrides: Record<string, unknown> = {}): Request {
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
      ...overrides,
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

// The state trailer is mandatory on every Open Chat turn, so every Open Chat
// turn has to be given room to write it. These numbers are stated literally
// rather than rebuilt from MAX_TOKENS + the allowance constants: a test that
// recomputes the value it is checking agrees with any change made to those
// constants, including a mistaken one. Spelled out, a change has to come here
// and be justified.
//
// Base for `length: 'natural'` is 220.
//   authored path: 220 + OPEN_CHAT_STATE_ALLOWANCE (80)  = 300
//   seed path:     220 + SEED_STATE_ALLOWANCE     (400)  = 620
describe('Open Chat state-line token allowance', () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
    delete process.env.PERSONA_SEED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalPersonaSeed === undefined) delete process.env.PERSONA_SEED;
    else process.env.PERSONA_SEED = originalPersonaSeed;
  });

  async function maxTokensFor(overrides: Record<string, unknown>): Promise<number> {
    const fetchMock = vi.fn().mockResolvedValue(upstream('Em vẫn nghe anh.'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request(overrides));
    expect(response.status).toBe(200);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return (JSON.parse(String(init.body)) as { max_tokens: number }).max_tokens;
  }

  it('gives an idle authored turn the same room as a spoken one', async () => {
    // Idle turns used to be denied the allowance while still being asked for
    // the trailer, so their rapport update had nowhere to go. This is the only
    // behaviour change on the default path, and it ships with PERSONA_SEED
    // unset — hence pinned here.
    expect(await maxTokensFor({ idle: true })).toBe(300);
  });

  it('keeps the spoken authored turn at its existing allowance', async () => {
    expect(await maxTokensFor({ idle: false })).toBe(300);
  });

  it('charges Quest nothing for a trailer it never asks for', async () => {
    expect(await maxTokensFor({ mode: 'quest', residentId: 'rin' })).toBe(220);
  });

  it('gives the seed path its own larger allowance, spoken and idle alike', async () => {
    process.env.PERSONA_SEED = 'on';
    expect(await maxTokensFor({ residentId: 'kagura', idle: false })).toBe(620);
    expect(await maxTokensFor({ residentId: 'kagura', idle: true })).toBe(620);
  });

  it('does not widen the allowance for a resident that has no seed', async () => {
    // The flag alone must not move the authored path. `rin` has no seed yet, so
    // `useSeed` stays false and the 80-token allowance still applies.
    process.env.PERSONA_SEED = 'on';
    expect(await maxTokensFor({ residentId: 'rin' })).toBe(300);
  });

  it('leaves the authored allowance in place when the flag is unset', async () => {
    // Same resident, same request, flag off: the seed allowance is reached only
    // through the flag, never through the resident.
    expect(await maxTokensFor({ residentId: 'kagura' })).toBe(300);
  });
});
