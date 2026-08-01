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
  FIRST_PERSON_RULES,
  sceneBriefFor,
  type ScenePerspective,
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
   * Whose eyes the frame is from. Defaults to `observed`, the original framing;
   * `first-person` puts the viewer in the room. See canon-view.ts for why the
   * near edge of that frame is governed by a rule rather than by content.
   */
  perspective?: ScenePerspective;
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

/**
 * Same job as BRIEF_WITH_SUBJECT, with the near edge added.
 *
 * Needed as a separate block because BRIEF_WITH_SUBJECT forbids exactly the
 * clause first person requires. Told only to describe place, objects, light and
 * where she stands, the writer produced a perfectly good observed brief and the
 * framing rules sitting in its context went unused.
 *
 * The writer chooses the near-edge object rather than the drawer, because only
 * the writer can see the Props list and what just happened. The drawer is given
 * the camera; the writer is given the choice.
 */
const BRIEF_FIRST_PERSON = `Bạn viết brief cho một tấm ảnh chụp từ góc nhìn thứ nhất: người xem đang đứng trong cảnh, nhìn về phía nhân vật chính.
Luật:
- KHÔNG miêu tả nhân vật: không nói về mặt, tóc, tuổi, trang phục, vũ khí hay dáng người. Ngoại hình của cô ấy đã có sẵn từ ảnh gốc.
- Miêu tả: nơi chốn, một hoặc hai đồ vật, ánh sáng, và cô ấy đứng ở đâu phía trước người xem.
- PHẢI lấy nơi chốn và đồ vật từ danh sách bối cảnh được cho, không được tự nghĩ ra khung cảnh chung chung.
- Kết thúc bằng một mệnh đề ngắn nói rìa gần khung hình có gì: bàn tay, cẳng tay hoặc vai của người xem, hoặc đúng một đồ vật trong danh sách Props — và chỉ khi cảnh nói rằng anh ấy đang cầm nó.
- Không bao giờ đặt vũ khí, nhạc cụ hay dụng cụ làm việc của riêng cô ấy vào tay người xem.
- Không có người nào khác trong ảnh.
- Một câu tiếng Anh, dưới 40 từ, chỉ danh từ và tính từ thị giác.
- Không giải thích, không dấu ngoặc kép, chỉ trả về câu đó.`;

/**
 * What the drawing model is told, assembled from the brief and the framing.
 *
 * A named function rather than an inline literal so that `verify-canon` can
 * probe it. The bug this replaces was invisible to every existing check: the
 * brief was verified and correct, and the prompt built from it silently
 * contradicted the brief. Nothing could see that, because nothing could reach
 * this string without calling fal.
 */
export function composerPrompt(input: {
  sceneBrief: string;
  look: string;
  subjectBrief: string;
  perspective: ScenePerspective;
}): string {
  const first = input.perspective === 'first-person';
  return [
    // Front-loaded on purpose, and this is the whole difference between a
    // first-person frame and an observed one.
    //
    // With the same instruction sitting after four sentences of "keep her
    // identical", Kontext read the prompt as a relight and returned the centred
    // full-body portrait it was given — a correct picture of the wrong shot,
    // three times out of three. Moved to the front it produced a near edge three
    // times out of three, at unchanged guidance. Raising guidance instead was
    // tried first and was the wrong lever: it bought the near edge and paid for
    // it with a red blade in the viewer's hand, the display stand left in, and
    // one frame where she came back as a photoreal woman who was not her.
    //
    // The style clause is a fix for an observed defect, not a proven one: the
    // near edge tends to arrive photographic against a stylised figure, which
    // reads as a compositing error rather than as a point of view. It was added
    // after the front-loading result and has not been shown to work — one frame
    // drawn with it still came back with a photoreal hand.
    //
    // Two other defects are open and are not prompt problems. The display stand
    // survives into some first-person frames, and the placeholder model is
    // revealing enough that Kontext amplifies it and fal's own checker rejects
    // roughly one first-person call in three. Neither blocks the framing; both
    // block shipping it.
    first
      ? 'Reframe as a first-person point-of-view shot: the camera is the viewer’s own eyes, standing in the scene, and one of the viewer’s own hands or forearms enters the frame at the near edge, large and close and slightly out of focus, drawn in the same illustration style and palette as her.'
      : '',
    first
      ? `Recompose this exact character into that environment, at mid-distance in front of the viewer: ${input.sceneBrief}.`
      : `Place this exact character into a new environment: ${input.sceneBrief}.`,
    `Environment style: ${input.look}.`,
    // From the key art, so a composed frame and a poster agree on who
    // she is. Wardrobe and features first: those are what drift.
    input.subjectBrief,
    'Keep the character identical: same face, same hairstyle, same outfit, same pose, same proportions. Do not redraw or restyle her.',
    'Relight her to match the environment and ground her in it with contact shadows and reflections.',
    'Remove the grey backdrop and the display stand entirely. She is a person in a place, not a figurine on a base.',
    // The observed wording forbids the one thing first person is for. A hand at
    // the near edge is not a bystander, but the drawer has no way to know that,
    // so the rule has to say which it means.
    first
      ? 'Camera framing:\n' + FIRST_PERSON_RULES
      : 'She is the only person in the frame.',
    first
      ? 'She is the only whole figure in the frame. Apart from the viewer’s own near-edge hand, forearm or shoulder, there are no bystanders and no second figure.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: SceneRequest;
  try {
    body = (await req.json()) as SceneRequest;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }
  const route = body.route ?? DEFAULT_ROUTE;
  if (route !== 'sao') {
    const error = route === 'origin' || route === 'hub' ? 'retired-route' : 'unknown-route';
    return Response.json({ error }, { status: 400 });
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
  // First person only means anything when there is a figure to stand in front
  // of the viewer. With no subject the room is drawn empty, and an empty room
  // shot from someone's eyes is the same empty room.
  const perspective: ScenePerspective =
    subject && body.perspective === 'first-person' ? 'first-person' : 'observed';

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
              perspective === 'first-person'
                ? BRIEF_FIRST_PERSON
                : subject
                  ? BRIEF_WITH_SUBJECT
                  : BRIEF_EMPTY,
              '',
              sceneBriefFor(resident.id, route, body.scene ?? text, perspective),
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
            prompt: composerPrompt({
              sceneBrief,
              look,
              subjectBrief: subjectBriefFor(resident.id, route),
              perspective,
            }),
            image_url: subject,
            aspect_ratio: '4:3',
            // Kontext drifts off the reference above ~4; below it starts
            // ignoring the environment instruction. 3.5 is the balance for an
            // observed frame, where the reference already has the right shot
            // and only the surroundings change.
            //
            // First person is the opposite problem: the reference has the wrong
            // shot. Its composition — centred, full body, nothing in the
            // foreground — is exactly what has to give, so the text has to win
            // over the image and the scale goes up.
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

    // `perspective` is echoed rather than assumed: a first-person request with
    // no subject is downgraded above, and silently returning an observed frame
    // for a first-person ask is how the last version of this went unnoticed.
    return Response.json({ url, prompt: sceneBrief, withSubject: !!subject, perspective });
  } catch {
    return Response.json({ error: 'upstream' }, { status: 502 });
  }
}
