// A picture of the place, not of her.
//
// She is already on the stage in three dimensions, so drawing her again beside
// herself is both redundant and a promise we cannot keep: a text-to-image model
// gives a different face every call. What the scene does not have is the room
// she is describing, the object she will not put down, the night she keeps
// coming back to. That is what this draws, and a place needs no likeness to
// stay consistent.
//
// Two hops, both off the critical path: the writer turns her line into a short
// visual brief with no people in it, then FLUX Schnell draws it in four steps.
// Failure at either hop returns nothing and the conversation carries on.

import { residentById } from '../src/config/residents';

interface SceneRequest {
  residentId: string;
  /** What she just said, or the invitation she just opened. */
  text: string;
}

export const config = { runtime: 'edge' };

const WRITER = 'https://api.deepseek.com/chat/completions';
const DRAWER = 'https://fal.run/fal-ai/flux/schnell';

/** Each resident's world, so three sets of pictures never blur together. */
const LOOK: Record<string, string> = {
  rin: 'near-future Akihabara at 3am, cyan and steel, screen glow, wet asphalt, dense signage, cinematic still, shallow depth of field',
  kagura:
    'between feudal Japan and a modern Japanese city, deep red and lacquer black, ember light, shrine timber and cold neon, cinematic still',
  momo: 'Tokyo after the last train, violet and dark plum, paper lanterns and vending-machine light, soft rain, cinematic still',
};

const BRIEF = `Bạn viết brief cho một tấm ảnh minh hoạ bối cảnh.
Đọc câu nói dưới đây và mô tả CẢNH VẬT hoặc ĐỒ VẬT mà nó gợi ra.
Luật:
- Tuyệt đối không có người, không khuôn mặt, không cơ thể, không bóng người.
- Chỉ nơi chốn và đồ vật: căn phòng, con đường, chiếc cốc, màn hình, thanh kiếm, ô cửa.
- Một câu tiếng Anh, dưới 30 từ, chỉ danh từ và tính từ thị giác.
- Không giải thích, không dấu ngoặc kép, chỉ trả về câu đó.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const writerKey = process.env.DEEPSEEK_API_KEY;
  const drawerKey = process.env.FAL_KEY;
  if (!writerKey || !drawerKey) return Response.json({ error: 'not-configured' }, { status: 503 });

  let body: SceneRequest;
  try {
    body = (await req.json()) as SceneRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim().slice(0, 600);
  if (!text) return Response.json({ error: 'empty-text' }, { status: 400 });

  let resident;
  try {
    resident = residentById(body.residentId);
  } catch {
    return Response.json({ error: 'unknown-resident' }, { status: 400 });
  }

  try {
    const brief = await fetch(WRITER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${writerKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        max_tokens: 90,
        temperature: 0.7,
        messages: [
          { role: 'system', content: `${BRIEF}\nBối cảnh của nhân vật: ${resident.setting}` },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!brief.ok) return Response.json({ error: 'writer' }, { status: 502 });

    const briefData = (await brief.json()) as { choices?: { message?: { content?: string } }[] };
    const subject = (briefData.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
    if (!subject) return Response.json({ error: 'no-brief' }, { status: 502 });

    const prompt = `${subject}. ${LOOK[resident.id] ?? ''}. No people, no figures, empty of humans.`;

    const drawn = await fetch(DRAWER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${drawerKey}` },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_4_3',
        // Schnell is distilled to four; more steps buy nothing here.
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!drawn.ok) {
      const detail = await drawn.text();
      return Response.json({ error: 'drawer', detail: detail.slice(0, 160) }, { status: 502 });
    }

    const drawnData = (await drawn.json()) as { images?: { url?: string }[] };
    const url = drawnData.images?.[0]?.url;
    if (!url) return Response.json({ error: 'no-image' }, { status: 502 });

    return Response.json({ url, prompt: subject });
  } catch {
    return Response.json({ error: 'upstream' }, { status: 502 });
  }
}
