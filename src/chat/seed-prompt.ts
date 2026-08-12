// The seed path. A small invariant core, free improvisation outside it, and
// the visitor's own accumulated canon read back in.
//
// The authored path in prompt.ts stays intact and is still the default; see
// docs/superpowers/specs/2026-08-12-persona-seed-design.md.

import { IMPROVISED_CANON_KINDS, IMPROVISED_CANON_PER_TURN } from './improvised-canon';
import { seedFor } from '../config/seed';
import { defaultRapport, type Rapport } from '../config/bond';
import type { PromptSession } from './prompt';

const LENGTH_TEXT = {
  short: 'Một hoặc hai câu ngắn. Tuyệt đối không dài hơn.',
  natural: 'Hai đến ba câu.',
  expressive: 'Ba đến năm câu, nhưng không độc thoại.',
} as const;

const SCENARIO_TEXT = {
  casual: 'Hai người chỉ đang nói chuyện, không cần mục đích nào khác.',
  latenight: 'Đã rất khuya. Hạ nhịp xuống, câu ngắn hơn, khoảng lặng dài hơn.',
  together: 'Không có việc gì phải giải quyết. Hai người chỉ đang ở cùng nhau.',
  goodnight: 'Sắp hết đêm và anh chuẩn bị đi ngủ. Ngắn, chậm, ấm theo cách của em.',
} as const;

export function buildSeedPrompt(
  residentId: string,
  session: PromptSession,
  improvisedCanon: string[],
  rapport: Rapport = defaultRapport()
): string {
  const seed = seedFor(residentId);
  if (!seed) throw new Error(`no seed for resident: ${residentId}`);

  const identity = String(session.identity ?? '')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, 120);
  const persona = String(session.persona ?? '').trim().slice(0, 600);

  const blocks: string[] = [
    // `silhouetteFor` in seed.ts returns '' for an unmapped resident, but the
    // guard above already throws before that could ever be the case here.
    // The filter below is a second, independent safeguard: it stops a blank
    // silhouette from ever surfacing as a bare, dangling "EM LÀ AI" heading.
    ['EM LÀ AI', seed.whoSheIs, seed.silhouette].filter(Boolean).join('\n'),
    seed.voice,
    seed.boundaries,
    seed.invariants,
    seed.reflex,
  ];

  blocks.push(
    [
      'CÁCH EM ỨNG BIẾN',
      'Em được phép nghĩ ra chi tiết đời sống, nơi chốn, đồ vật, thói quen khi cần, nói như thể vẫn luôn biết chúng.',
      'Nhưng không mâu thuẫn điều trên, và không viết lại điều đã thành thật giữa hai người.',
    ].join('\n')
  );

  if (improvisedCanon.length > 0) {
    blocks.push(
      [
        'ĐÃ THÀNH THẬT GIỮA HAI NGƯỜI',
        'Những điều này em đã nói ra trong các lần trước. Chúng là thật và phải nhất quán:',
        ...improvisedCanon.map((line) => `- ${line}`),
      ].join('\n')
    );
  }

  const between = ['HAI NGƯỜI'];
  if (identity) between.push(`Anh vào đây với tên: ${identity}.`);
  if (persona) between.push(`Anh muốn em hiện diện thế này: ${JSON.stringify(persona)}.`);
  between.push(SCENARIO_TEXT[session.scenario] ?? SCENARIO_TEXT.casual);
  between.push(`Độ dài: ${LENGTH_TEXT[session.length] ?? LENGTH_TEXT.natural}`);
  blocks.push(between.join('\n'));

  blocks.push(
    [
      'BẮT BUỘC Ở CUỐI MỖI LƯỢT',
      'Xuống dòng, rồi thêm đúng một dòng máy đọc, không gì sau nó:',
      '<<state {"trust":0.00,"respect":0.00,"desire":0.00,"irritation":0.00,"attachment":0.00,"canon":null}>>',
      `Năm số 0–1 là giá trị sau lượt; trước lượt: trust ${rapport.trust.toFixed(2)}, respect ${rapport.respect.toFixed(2)}, desire ${rapport.desire.toFixed(2)}, irritation ${rapport.irritation.toFixed(2)}, attachment ${rapport.attachment.toFixed(2)}. Nhích rất nhỏ mỗi lượt.`,
      `canon là null hầu hết lượt, chỉ điền khi vừa khẳng định chi tiết mới, tối đa ${IMPROVISED_CANON_PER_TURN} mục: [{"kind":"…","text":"câu ngắn tiếng Việt"}].`,
      `kind chỉ nhận: ${IMPROVISED_CANON_KINDS.join(', ')}.`,
      'Không đưa tên thật, địa chỉ, liên hệ, URL hay bí mật của anh vào canon.',
      'Dòng này bị hệ thống cắt trước khi anh thấy; không nhắc, không bỏ.',
    ].join('\n')
  );

  return blocks.join('\n\n');
}
