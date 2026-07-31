// A picture of the place she just described — with her in it, when we have a
// likeness we did not have to invent.
//
// This used to draw places with nobody in them, because a text-to-image model
// gives a different face every call and a second Rin beside the real one is a
// promise the app cannot keep. Image-to-image removes that objection: when the
// client sends her own offscreen render as the subject, FLUX Kontext places
// *that* figure into the scene instead of imagining one. Her face, outfit and
// pose are carried, not guessed.
//
// So there are two draw paths, chosen by whether a subject arrived:
//   subject present -> Kontext, she is in the room.
//   subject absent  -> Schnell, the room is empty, exactly as before.
// The empty-room path stays because her model may not be loaded yet, and a
// missing subject must degrade rather than fail.
//
// Every hop is off the critical path: it is fired after her line is on screen,
// and any failure means no picture, never a stall.

import {
  canonViewFor,
  sceneBriefFor,
  subjectBriefFor,
} from '../src/config/canon-view';
import { DEFAULT_ROUTE, type CanonRoute } from '../src/config/canon-route';
import type { ResidentId } from '../src/config/residents';

interface SceneRequest {
  residentId: string;
  route?: CanonRoute;
  /** The outcome of the branch: what the choice left behind. */
  text: string;
  /** The scene it belongs to, so the drawing is of that scene and not of a mood. */
  scene?: string;
  /**
   * Her render as a data URI, from `src/three/subject.ts`. Optional: without it
   * the place is drawn empty. `image_url` on fal accepts a data URI directly,
   * so nothing is uploaded to storage first.
   */
  subject?: string;
}

export const config = { runtime: 'edge' };

const WRITER = 'https://api.deepseek.com/chat/completions';
/** No subject: draw the room. Distilled to four steps, cheap and fast. */
const DRAWER = 'https://fal.run/fal-ai/flux/schnell';
/** Subject supplied: put that exact figure into the room. */
const COMPOSER = 'https://fal.run/fal-ai/flux-pro/kontext';

/** Only ever a base64 image, and only one small enough to sit in a JSON body. */
const SUBJECT_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const SUBJECT_MAX = 1_400_000;

function usableSubject(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s || s.length > SUBJECT_MAX || !SUBJECT_RE.test(s)) return null;
  return s;
}

const BRIEF_EMPTY = `Bạn viết brief cho một tấm ảnh minh hoạ bối cảnh trong một câu chuyện cụ thể.
Luật:
- Tuyệt đối không có người, không khuôn mặt, không cơ thể, không bóng người.
- Chỉ nơi chốn và đồ vật.
- PHẢI lấy nơi chốn và đồ vật từ danh sách bối cảnh được cho, không được tự nghĩ ra một khung cảnh chung chung. Chọn đúng một nơi và một hoặc hai đồ vật khớp nhất với chuyện vừa xảy ra.
- Nếu chuyện vừa xảy ra có một vật cụ thể được nhắc tới, vật đó phải là chủ thể của ảnh.
- Một câu tiếng Anh, dưới 35 từ, chỉ danh từ và tính từ thị giác.
- Không giải thích, không dấu ngoặc kép, chỉ trả về câu đó.`;

/**
 * When she is going into the picture, the brief has to describe the room and
 * where she stands in it — but never her, because her appearance comes from the
 * render, and any adjective about her face or outfit here would fight it.
 */
const BRIEF_WITH_SUBJECT = `Bạn viết brief cho một tấm ảnh: nhân vật chính đứng trong một bối cảnh cụ thể của truyện.
Luật:
- KHÔNG miêu tả nhân vật: không nói về mặt, tóc, tuổi, trang phục, vũ khí hay dáng người. Ngoại hình của cô ấy đã có sẵn từ ảnh gốc.
- Chỉ miêu tả: nơi chốn, một hoặc hai đồ vật, ánh sáng, và cô ấy đứng ở đâu trong khung (ví dụ: standing at the counter, seen from behind, small against the hall).
- PHẢI lấy nơi chốn và đồ vật từ danh sách bối cảnh được cho, không được tự nghĩ ra khung cảnh chung chung. Chọn đúng một nơi khớp nhất với chuyện vừa xảy ra.
- Không có người nào khác trong ảnh.
- Một câu tiếng Anh, dưới 35 từ, chỉ danh từ và tính từ thị giác.
- Không giải thích, không dấu ngoặc kép, chỉ trả về câu đó.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: SceneRequest;
  try {
    body = (await req.json()) as SceneRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }
  const route = body.route ?? DEFAULT_ROUTE;
  if (route !== 'origin' && route !== 'hub' && route !== 'sao') {
    return Response.json({ error: 'unknown-route' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim().slice(0, 600);
  if (!text) return Response.json({ error: 'empty-text' }, { status: 400 });

  let resident: ReturnType<typeof canonViewFor>;
  try {
    resident = canonViewFor(body.residentId as ResidentId, route);
  } catch {
    return Response.json({ error: 'unknown-resident' }, { status: 400 });
  }
  const writerKey = process.env.DEEPSEEK_API_KEY;
  const drawerKey = process.env.FAL_KEY;
  if (!writerKey || !drawerKey) return Response.json({ error: 'not-configured' }, { status: 503 });

  const subject = usableSubject(body.subject);

  try {
    const brief = await fetch(WRITER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${writerKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        max_tokens: 90,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: [
              subject ? BRIEF_WITH_SUBJECT : BRIEF_EMPTY,
              '',
              sceneBriefFor(resident.id, route, body.scene ?? text),
            ].join('\n'),
          },
          {
            role: 'user',
            content: body.scene ? `Cảnh: ${body.scene}\nVừa xảy ra: ${text}` : text,
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!brief.ok) return Response.json({ error: 'writer' }, { status: 502 });

    const briefData = (await brief.json()) as { choices?: { message?: { content?: string } }[] };
    const sceneBrief = (briefData.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
    if (!sceneBrief) return Response.json({ error: 'no-brief' }, { status: 502 });

    const look = `${resident.setting}. ${resident.keyVisual.palette} cinematic still, shallow depth of field`;

    // Two different asks. Kontext is given an image and told what to change,
    // so the instruction is about the surroundings and explicitly about what
    // must NOT change; Schnell is given only words, so the instruction is the
    // whole picture.
    const [endpoint, payload] = subject
      ? [
          COMPOSER,
          {
            prompt: [
              `Place this exact character into a new environment: ${sceneBrief}.`,
              `Environment style: ${look}.`,
              // From the key art, so a composed frame and a poster agree on who
              // she is. Wardrobe and features first: those are what drift.
              subjectBriefFor(resident.id, route),
              'Keep the character identical: same face, same hairstyle, same outfit, same pose, same proportions. Do not redraw or restyle her.',
              'Relight her to match the environment and ground her in it with contact shadows and reflections.',
              'Remove the grey backdrop and the display stand entirely. She is a person in a place, not a figurine on a base.',
              'She is the only person in the frame.',
            ].join(' '),
            image_url: subject,
            aspect_ratio: '4:3',
            // Kontext drifts off the reference above ~4; below it starts
            // ignoring the environment instruction.
            guidance_scale: 3.5,
            num_images: 1,
            output_format: 'jpeg',
            safety_tolerance: '2',
          },
        ]
      : [
          DRAWER,
          {
            prompt: `${sceneBrief}. ${look}. ${resident.keyVisual.palette} No people, no figures, empty of humans.`,
            image_size: 'landscape_4_3',
            // Schnell is distilled to four; more steps buy nothing here.
            num_inference_steps: 4,
            num_images: 1,
            enable_safety_checker: true,
          },
        ];

    const drawn = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${drawerKey}` },
      body: JSON.stringify(payload),
      // Kontext is a far bigger model than Schnell and needs the room.
      signal: AbortSignal.timeout(subject ? 70000 : 30000),
    });
    if (!drawn.ok) {
      const detail = await drawn.text();
      return Response.json({ error: 'drawer', detail: detail.slice(0, 160) }, { status: 502 });
    }

    const drawnData = (await drawn.json()) as {
      images?: { url?: string }[];
      has_nsfw_concepts?: boolean[];
    };
    const url = drawnData.images?.[0]?.url;
    if (!url) return Response.json({ error: 'no-image' }, { status: 502 });
    // Kontext reports rather than blocks. A flagged frame is dropped here, so a
    // refund happens instead of the picture appearing.
    if (drawnData.has_nsfw_concepts?.[0]) return Response.json({ error: 'flagged' }, { status: 502 });

    return Response.json({ url, prompt: sceneBrief, withSubject: !!subject });
  } catch {
    return Response.json({ error: 'upstream' }, { status: 502 });
  }
}
