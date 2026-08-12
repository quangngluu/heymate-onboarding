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

  // SEED_CHAR_CEILING (3000) bounds only the fixed core assembled below: the
  // six seed entries plus the improvisation and state-contract prose. The
  // visitor-controlled additions are capped separately and are not part of
  // this budget — persona at 600 chars, identity at 120, and the retrieved
  // ledger at IMPROVISED_CANON_CHAR_BUDGET (800, see improvised-canon.ts) —
  // so a fully-loaded prompt can exceed 3000 by design.
  const blocks: string[] = [
    // `silhouetteFor` in seed.ts returns '' for an unmapped resident, but the
    // guard above already throws before that could ever be the case here.
    // `whoSheIs` is folded into the heading itself, so it can never be
    // silently dropped by the filter below — only the optional silhouette
    // can. That keeps this line consistent with the four seed entries after
    // it, none of which are ever conditionally omitted: the core is not
    // negotiable.
    [`EM LÀ AI\n${seed.whoSheIs}`, seed.silhouette].filter(Boolean).join('\n'),
    seed.voice,
    seed.boundaries,
    seed.invariants,
    seed.reflex,
  ];

  blocks.push(
    [
      'CÁCH EM ỨNG BIẾN',
      'Em được phép nghĩ ra chi tiết đời sống, nơi chốn, đồ vật, thói quen của mình khi cần.',
      'Không mâu thuẫn với điều trên, không viết lại điều đã thành thật.',
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
      'Xuống dòng, rồi thêm đúng một dòng máy đọc, không có gì sau nó:',
      '<<state {"trust":0.00,"respect":0.00,"desire":0.00,"irritation":0.00,"attachment":0.00,"canon":null}>>',
      `Năm con số là GIÁ TRỊ TUYỆT ĐỐI từ 0.00 tới 1.00 sau lượt này; trước lượt: trust ${rapport.trust.toFixed(2)}, respect ${rapport.respect.toFixed(2)}, desire ${rapport.desire.toFixed(2)}, irritation ${rapport.irritation.toFixed(2)}, attachment ${rapport.attachment.toFixed(2)}. Mỗi lượt chỉ nhích rất nhỏ.`,
      `canon là null ở hầu hết lượt, chỉ điền khi vừa khẳng định chi tiết mới về thế giới của mình, tối đa ${IMPROVISED_CANON_PER_TURN} mục: [{"kind":"…","text":"câu ngắn tiếng Việt"}].`,
      `kind chỉ nhận: ${IMPROVISED_CANON_KINDS.join(', ')}.`,
      'Không đưa tên thật, địa chỉ, liên hệ, URL hay bí mật của anh vào canon.',
      'Dòng này bị hệ thống cắt trước khi anh thấy; không nhắc tới nó, không bỏ nó.',
    ].join('\n')
  );

  return blocks.join('\n\n');
}
