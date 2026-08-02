import { segments, type Segment } from './dialogue';
import type { ResidentId, ScenarioId } from '../config/residents';

export type OpenChatVisualKind = 'opening' | 'reward';
export type OpenChatVisualFrame = 'lcd' | 'blade' | 'page';

export interface OpenChatVisual {
  id: string;
  residentId: ResidentId;
  kind: OpenChatVisualKind;
  src: string;
  frame: OpenChatVisualFrame;
  label: string;
  caption: string;
  alt: string;
  /** Authored continuation spoken after a reward image. */
  followUp: string;
  prompts: readonly [string, string];
  scenarios: readonly ScenarioId[];
}

export type OpenChatDialogueBlock =
  | Segment
  | { kind: 'visual'; visualId: string };

const ALL_SCENARIOS: readonly ScenarioId[] = [
  'casual',
  'latenight',
  'together',
  'goodnight',
];

/**
 * Authored, locally shipped FAL Kontext frames. Generation happens offline
 * from frozen renders of the stage GLBs; Open Chat never calls FAL at runtime.
 * `scripts/open-chat-fal-provenance.json` binds every file to its request and hash.
 */
export const OPEN_CHAT_VISUALS: readonly OpenChatVisual[] = [
  {
    id: 'rin-opening-signal',
    residentId: 'rin',
    kind: 'opening',
    src: 'assets/open-chat/rin-opening-signal.webp',
    frame: 'lcd',
    label: 'KÊNH KHÔI PHỤC',
    caption: 'Rin tự giữ mình trên một màn hình nhiễu — bằng chứng rằng cô vẫn chọn được điều sẽ phát tiếp.',
    alt: 'Rin đứng trong ánh xanh lạnh trên một màn hình tín hiệu bị nhiễu.',
    followUp: '',
    prompts: ['Tín hiệu này từ đâu?', 'Vì sao em giữ khung này?'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'rin-reward-afterimage',
    residentId: 'rin',
    kind: 'reward',
    src: 'assets/open-chat/rin-reward-afterimage.webp',
    frame: 'lcd',
    label: 'DỮ LIỆU LỆCH NHỊP',
    caption: 'Cùng một tín hiệu, lệch đi một góc nhỏ. Rin giữ cả hai vì chưa quyết định khung nào gần với mình hơn.',
    alt: 'Rin hiện ở góc nhìn nghiêng trong một panel dữ liệu xanh lạnh.',
    followUp: 'Em kéo khung này ra vì đoạn anh vừa nói. Nếu cùng một người nhìn khác đi chỉ vì đổi góc, anh tin góc nào trước?',
    prompts: ['Cho anh xem góc còn lại', 'Em tin góc nào hơn?'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'rin-reward-held-frame',
    residentId: 'rin',
    kind: 'reward',
    src: 'assets/open-chat/rin-reward-held-frame.webp',
    frame: 'lcd',
    label: 'KHUNG ĐƯỢC GIỮ LẠI',
    caption: 'Không phải frame nào cũng cần giải mã. Rin giữ khung này chỉ vì lần này cô không muốn nó biến mất.',
    alt: 'Rin đứng trong một panel tối có viền cyan như một frame được giữ lại.',
    followUp: 'Khung này không giải được gì cả. Em chỉ chưa muốn xoá nó — anh có cần mọi thứ phải có lý do không?',
    prompts: ['Cứ giữ nó lại', 'Trong khung có gì quan trọng?'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'kagura-opening-reflection',
    residentId: 'kagura',
    kind: 'opening',
    src: 'assets/open-chat/kagura-opening-reflection.webp',
    frame: 'blade',
    label: 'MẶT KIẾM GIỮ ẢNH',
    caption: 'Kagari nghiêng Akagane vừa đủ để mặt kiếm trả lại hình cô, thay cho một lời giới thiệu mềm hơn.',
    alt: 'Kagari hiện trong ánh đỏ sẫm như một hình phản chiếu trên mặt đại đao.',
    followUp: '',
    prompts: ['Thanh kiếm nhìn thấy gì?', 'Sao em đứng gần cửa?'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'kagura-reward-vigil',
    residentId: 'kagura',
    kind: 'reward',
    src: 'assets/open-chat/kagura-reward-vigil.webp',
    frame: 'blade',
    label: 'MỘT GÓC KHÁC CỦA AKAGANE',
    caption: 'Mặt kiếm vẫn nằm giữa Kagari và người nhìn, nhưng góc nghiêng mới để lộ cô đang nhìn qua nó chứ không trốn sau nó.',
    alt: 'Kagari và Akagane được nhìn từ một góc nghiêng trong panel viền đỏ.',
    followUp: 'Đoạn anh vừa nói làm em nhớ khung này. Anh nhìn thanh kiếm trước hay nhìn người đang cầm nó trước?',
    prompts: ['Anh nhìn em trước', 'Vì sao kiếm luôn ở giữa?'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'kagura-reward-rest',
    residentId: 'kagura',
    kind: 'reward',
    src: 'assets/open-chat/kagura-reward-rest.webp',
    frame: 'blade',
    label: 'GÓC KHÔNG CHE KHUẤT',
    caption: 'Đổi góc một lần nữa: Akagane vẫn ở đó, nhưng Kagari không còn để lưỡi kiếm che hết khuôn mặt mình.',
    alt: 'Kagari nhìn qua Akagane từ phía đối diện trong một panel viền đỏ.',
    followUp: 'Em thường chọn chỗ đứng khiến người khác thấy kiếm trước khi thấy em. Khung này thì ngược lại — anh thấy khác không?',
    prompts: ['Anh thấy em rõ hơn', 'Em có thể đặt kiếm xuống không?'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'momo-opening-page',
    residentId: 'momo',
    kind: 'opening',
    src: 'assets/open-chat/momo-opening-page.webp',
    frame: 'page',
    label: 'TRANG TỰ LẬT',
    caption: 'Momo để một trang trắng tự lật đến đúng hình cô, như thể Route Zero vừa chọn người bước vào.',
    alt: 'Momo hiện giữa ánh tím ấm trên một trang sách đang tự lật.',
    followUp: '',
    prompts: ['Trang này muốn nói gì?', 'Em đã biết anh sẽ đến à?'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'momo-reward-first-train',
    residentId: 'momo',
    kind: 'reward',
    src: 'assets/open-chat/momo-reward-first-train.webp',
    frame: 'page',
    label: 'TRANG TRƯỚC GIỜ ĐÓNG CỬA',
    caption: 'Momo tự đặt hình mình vào một trang gần trắng — ít điều khoản hơn những trang cô thường đưa cho khách.',
    alt: 'Momo hiện trên một panel tối viền tím như hình được đặt vào trang sách.',
    followUp: 'Khung này xuất hiện đúng lúc anh nói vậy. Trước chuyến tàu đầu, em thường giỏi đoán người khác hơn là trả lời mình muốn gì.',
    prompts: ['Vậy lúc này em muốn gì?', 'Đừng đoán anh, hỏi đi'],
    scenarios: ALL_SCENARIOS,
  },
  {
    id: 'momo-reward-no-price',
    residentId: 'momo',
    kind: 'reward',
    src: 'assets/open-chat/momo-reward-no-price.webp',
    frame: 'page',
    label: 'KHÔNG GHI GIÁ',
    caption: 'Một trang Route Zero không có điều khoản hay cái giá nào, chỉ có Momo ở lại trong hình.',
    alt: 'Momo mỉm cười trong một trang tối không có chữ hay điều khoản.',
    followUp: 'Trang này làm em khó chịu một cách thú vị: không có giá, không có điều khoản. Anh sẽ viết gì vào đó, hay để trống?',
    prompts: ['Để trống với em', 'Viết một điều không trao đổi'],
    scenarios: ALL_SCENARIOS,
  },
] as const;

export function openingVisualFor(residentId: ResidentId): OpenChatVisual {
  const visual = OPEN_CHAT_VISUALS.find(
    (item) => item.residentId === residentId && item.kind === 'opening'
  );
  if (!visual) throw new Error(`Missing Open Chat opening visual for ${residentId}`);
  return visual;
}

export function visualById(id: string): OpenChatVisual | null {
  return OPEN_CHAT_VISUALS.find((item) => item.id === id) ?? null;
}

interface SentencePiece {
  text: string;
  complete: boolean;
}

function speechSentences(text: string): SentencePiece[] {
  const out: SentencePiece[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.!?…]/u.test(text[i])) continue;
    while (i + 1 < text.length && /[.!?…]/u.test(text[i + 1])) i++;
    while (i + 1 < text.length && /["'”’]/u.test(text[i + 1])) i++;
    const sentence = text.slice(start, i + 1).trim();
    if (sentence) out.push({ text: sentence, complete: true });
    start = i + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push({ text: tail, complete: false });
  return out;
}

/** Count the spoken sentences in a committed line; stage-direction beats do not count. */
export function countSpokenSentences(text: string): number {
  return segments(text).reduce(
    (count, segment) =>
      segment.kind === 'speech' ? count + speechSentences(segment.text).length : count,
    0
  );
}

export function composeRewardReply(
  replyText: string,
  visual: OpenChatVisual
): { text: string; visualAfterSentence: number } {
  const base = replyText.trim();
  const committed = /[.!?…]["'”’]?$/u.test(base) ? base : `${base}.`;
  return {
    text: `${committed} ${visual.followUp}`.trim(),
    visualAfterSentence: Math.max(1, countSpokenSentences(committed)),
  };
}

/**
 * Turn authored dialogue into render blocks and put the image after a spoken
 * sentence boundary. During streaming, an unfinished sentence never unlocks
 * the image early; once the full line is committed, short copy falls back to
 * showing the visual at the end.
 */
export function dialogueBlocks(
  text: string,
  visualId?: string,
  afterSentence = 2,
  complete = true
): OpenChatDialogueBlock[] {
  return dialogueBlocksFromSegments(segments(text), visualId, afterSentence, complete);
}

export function dialogueBlocksFromSegments(
  source: readonly Segment[],
  visualId?: string,
  afterSentence = 2,
  complete = true
): OpenChatDialogueBlock[] {
  const out: OpenChatDialogueBlock[] = [];
  let spoken = 0;
  let placed = false;
  for (const segment of source) {
    if (segment.kind === 'beat') {
      out.push(segment);
      continue;
    }
    for (const sentence of speechSentences(segment.text)) {
      out.push({ kind: 'speech', text: sentence.text });
      if (sentence.complete) spoken++;
      if (visualId && !placed && spoken >= afterSentence) {
        out.push({ kind: 'visual', visualId });
        placed = true;
      }
    }
  }
  if (visualId && complete && !placed) {
    out.push({ kind: 'visual', visualId });
  }
  return out;
}

/** A stored target makes the random wait stable across reloads. */
export function nextOpenChatRewardTurn(
  currentTurn: number,
  random: () => number = Math.random
): number {
  const roll = Math.min(0.999999, Math.max(0, random()));
  return currentTurn + 3 + Math.floor(roll * 3);
}

export function selectOpenChatReward(
  residentId: ResidentId,
  seenIds: readonly string[],
  random: () => number = Math.random,
  scenario?: ScenarioId
): OpenChatVisual | null {
  const seen = new Set(seenIds);
  const candidates = OPEN_CHAT_VISUALS.filter(
    (item) =>
      item.residentId === residentId &&
      item.kind === 'reward' &&
      !seen.has(item.id) &&
      (!scenario || item.scenarios.includes(scenario))
  );
  if (!candidates.length) return null;
  const roll = Math.min(0.999999, Math.max(0, random()));
  return candidates[Math.floor(roll * candidates.length)];
}
