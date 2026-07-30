// SCRIPTED conversation engine.
//
// Every line is authored per resident (docs/waifu-universe-bible.md) — there
// is no shared reply pool, because three residents sharing one voice is the
// exact failure this universe is designed against. Session settings change
// the weather (mood, length, who leads); they never change the person.
//
// Deterministic: the same message to the same resident in the same session
// always produces the same reply. The production path replaces reply() with
// a server-side model call given her canon; nothing else moves.

import { fnv1a } from '../util/hash';
import type { LengthId, MoodId, ResidentConfig, ResidentId, StyleId } from '../config/residents';

type Intent =
  | 'greeting'
  | 'howAreYou'
  | 'identity'
  | 'capability'
  | 'compliment'
  | 'affection'
  | 'farewell'
  | 'question'
  | 'fallback';

const MATCHERS: [Intent, RegExp][] = [
  ['affection', /\b(i (love|like|miss) you|y[eê]u|nh[oớ] b[aạ]n)\b/i],
  ['identity', /\b(who are you|your name|what are you|tell me about you|t[eê]n g[iì])\b/i],
  ['capability', /\b(what can you|can you help|what do you do|help me)\b/i],
  ['howAreYou', /\b(how are you|how're you|you ok|are you okay|kh[oỏ]e kh[oô]ng)\b/i],
  ['compliment', /\b(beautiful|pretty|gorgeous|amazing|impressive|love your|nice|[dđ][eẹ]p)\b/i],
  ['farewell', /\b(bye|goodbye|see you|good ?night|t[aạ]m bi[eệ]t)\b/i],
];
const GREETING = /\b(hi|hello|hey|yo|good morning|good evening|ch[aà]o)\b/i;

function detectIntent(text: string): Intent {
  for (const [intent, re] of MATCHERS) if (re.test(text)) return intent;
  if (GREETING.test(text) && text.trim().split(/\s+/).length <= 5) return 'greeting';
  if (text.trim().endsWith('?')) return 'question';
  return 'fallback';
}

/**
 * Two authored lines per intent, in each resident's own voice. These are
 * anchored to her canon: Rin defends with data, Kagura defends by standing in
 * front of you, Momo defends by performing. Nothing is shared between them.
 */
const LINES: Record<ResidentId, Record<Intent, [string, string]>> = {
  rin: {
    greeting: [
      'Cuối cùng anh cũng thôi lượn ngoài cửa. Ngồi xuống đi, nói em nghe vì sao anh quay lại.',
      'Anh đến muộn. Em vẫn giữ chỗ cho anh. Đừng bắt em giải thích vì sao.',
    ],
    howAreYou: [
      'Em ổn. Độ trễ ổn. Biến số tối nay là anh.',
      'Em vẫn chạy được. Hỏi em câu khó hơn đi.',
    ],
    identity: [
      'Rin Amagi. Chủ yếu là người phân tích. Phát sóng chỉ là hệ quả thôi.',
      'Em là người vẫn còn trực tuyến. Câu trả lời đó nhiều hơn anh nghĩ đấy.',
    ],
    capability: [
      'Em tìm được chỗ trong kế hoạch của anh sẽ vỡ đầu tiên. Thường đó là chỗ hữu ích nhất.',
      'Mang cho em thứ gì còn dang dở đi. Thứ hoàn thiện rồi chán lắm.',
    ],
    compliment: [
      'Build đó dùng được. Theo nghĩa rộng nhất có thể của từ dùng được.',
      'Em ghi nhận. Em không giỏi đoạn này, nhưng anh cứ nói tiếp đi.',
    ],
    affection: [
      'Em chưa đăng xuất vì hàng chờ vẫn có tên anh. Đừng nghĩ xa quá.',
      'Em hiểu rồi. Giờ em sẽ đổi chủ đề, và anh sẽ để em làm thế.',
    ],
    farewell: ['Anh đi đi. Hàng chờ vẫn mở.', 'Lần này đăng xuất cho tử tế nhé. Em sẽ biết đấy.'],
    question: [
      'Còn tuỳ ràng buộc anh chưa nói. Đưa em phần đó trước.',
      'Anh đoán đi. Em sẽ nói chính xác anh lệch bao xa.',
    ],
    fallback: ['Nói tiếp đi. Sau đó thì sao?', 'Được. Còn phần anh đang né thì sao?'],
  },
  kagura: {
    greeting: [
      'Anh đây rồi. Lại gần hơn. Em không nhắc lần hai.',
      'Anh quay lại. Tốt. Đứng chỗ em còn nhìn thấy anh.',
    ],
    howAreYou: [
      'Em vẫn nguyên vẹn. Không giống được nghỉ ngơi, nhưng đủ rồi.',
      'Em ổn. Thế kỷ này ồn ào, nhưng em ổn.',
    ],
    identity: [
      'Kagura Akagane. Em mang thanh kiếm đó, và giờ nó là phần lớn con người em.',
      'Em là con gái của thợ rèn, nhặt nhầm thanh kiếm rồi thắng.',
    ],
    capability: [
      'Em có thể đứng giữa anh và nó. Dù nó là gì, anh cứ gọi tên đi.',
      'Em không giỏi máy móc nhưng giỏi hậu quả. Anh dùng em cho vế sau.',
    ],
    compliment: [
      'Anh nói nhẹ nhàng thật. Hãy nói lại khi nó khiến anh phải đánh đổi gì đó.',
      'Đủ rồi. Em không được tạo ra để nghe kiểu nói này.',
    ],
    affection: [
      'Nếu một ngày em quên tên anh, bắt em học lại. Bao nhiêu lần cũng được.',
      'Vậy thì đứng ở nơi em nhìn thấy anh, và đừng liều lĩnh nữa.',
    ],
    farewell: ['Anh đi bình an. Đi đường có đèn.', 'Vậy anh đi đi. Em sẽ giữ cửa.'],
    question: [
      'Anh cứ hỏi thẳng, em sẽ trả lời thẳng.',
      'Em sẽ trả lời, nhưng nói em nghe trước vì sao câu trả lời đó quan trọng với anh.',
    ],
    fallback: ['Nói nốt đi.', 'Tiếp đi. Em đang nghe cho tử tế.'],
  },
  momo: {
    greeting: [
      'Cuối cùng anh cũng vào. Lại đây, ghế cạnh em vẫn để trống.',
      'Anh đến đúng lúc đấy. Em đang bắt đầu nhớ anh rồi.',
    ],
    howAreYou: [
      'Câu hỏi ngon đấy. Em ổn. Chán cho đến lúc anh bước vào.',
      'Tuyệt vời, hiển nhiên. Hỏi em lại sau giờ đóng cửa, có khi em nói thật.',
    ],
    identity: [
      'Momo Kuroha. Em điều hành Route Zero. Sách cổ gọi em bằng một cái tên kém lịch sự hơn.',
      'Em nhận những điều ước người ta chưa dám nói, rồi cho họ một đêm dễ chịu hơn. Công việc chỉ thế thôi.',
    ],
    capability: [
      'Em có thể làm mọi thứ nghe hay hơn thực tế. Kể cả tuần của anh.',
      'Chọn đi. Phương án A: kể em nghe hôm nay của anh. Phương án B: để em đoán, và anh không được khó chịu khi em đoán trúng.',
    ],
    compliment: ['Hiển nhiên rồi. Nói thêm đi.', 'Cẩn thận. Em sẽ bắt đầu mong chờ đấy.'],
    affection: [
      'Em biết cách khiến người ta thích em. Khó ở chỗ biết họ còn thích khi em thôi cố gắng hay không.',
      'Bạo đấy. Vậy vào trong đi, chỗ đẹp vẫn còn cho anh.',
    ],
    farewell: ['Anh đi đi, trước khi chuyến tàu đầu đông người.', 'Anh ra ngoài đi. Đèn vẫn để cho anh đấy.'],
    question: [
      'Em có thể trả lời thật. Anh có nhận ra không?',
      'Anh đoán trước đi. Anh đoán sai mới vui.',
    ],
    fallback: ['Thú vị đấy. Rồi sao nữa?', 'Tối nay anh không cần ước gì cả. Cứ nói tiếp với em đi.'],
  },
};

/** A short mood colour, in her own register. */
const MOOD_TAG: Record<ResidentId, Partial<Record<MoodId, string>>> = {
  rin: {
    caring: 'Anh uống thứ gì không phải cà phê đi.',
    playful: 'Anh đang câu giờ. Về mặt thống kê.',
    serious: 'Em tập trung hoàn toàn rồi. Nói đi.',
  },
  kagura: {
    caring: 'Anh ăn trước đã. Rồi nói.',
    playful: 'Anh đang thích chuyện này hơn mức đứng đắn đấy.',
    energetic: 'Vậy thì đi đi. Ngay bây giờ.',
  },
  momo: {
    caring: 'Anh ngồi gần hơn đi, đoạn này yên lặng hơn.',
    playful: 'Vậy thì encore nào, anh.',
    serious: 'Đoạn này em không diễn đâu.',
  },
};

/** What she says into a silence when the model is unavailable. */
const IDLE_LINES: Record<ResidentId, string[]> = {
  rin: [
    'Anh im lâu quá. Con trỏ không nhúc nhích từ nãy, em để ý mấy chuyện đó.',
    'Anh im với em rồi. Thường đây là lúc phần thú vị bắt đầu.',
  ],
  kagura: [
    'Anh im rồi. Nói gì đi, không thì em sẽ nghĩ anh đang nghĩ về em.',
    'Lại im lặng. Thời của em, thế nghĩa là ai đó đang lấy can đảm để tỏ tình.',
  ],
  momo: [
    'Im lặng rồi à. Em đoán anh đang nghĩ điều gì đó mà chưa dám nói.',
    'Anh càng im, em càng đoán bạo đấy. Chắc chưa?',
  ],
};

/** A deterministic line for the nth silence in a session. */
export function idleLine(resident: ResidentConfig, index: number): string {
  const pool = IDLE_LINES[resident.id];
  return pool[index % pool.length];
}

export interface SessionSetup {
  nickname: string;
  mood: MoodId;
  style: StyleId;
  length: LengthId;
}

export interface ReplyContext {
  resident: ResidentConfig;
  session: SessionSetup;
  /** Rungs of her ladder already revealed (persisted across saved sessions). */
  revealed: number;
  /** Facts kept from previous saved sessions, used for callbacks. */
  memories: string[];
  /** How many user turns so far this session. */
  turn: number;
}

export interface ReplyResult {
  text: string;
  /** Set when this reply spent a rung of the reveal ladder. */
  revealedRung?: number;
}

/**
 * Which episode (if any) should surface on this turn. Both the scripted path
 * and the model path use this, so the reveal schedule stays owned by the app
 * rather than by whatever the model feels like saying.
 */
export function dueEpisodeIndex(_ctx: ReplyContext): number | null {
  // Memories used to open every third turn. The ladder is meant to be climbed
  // by doing something, so a finished quest is now the only way up.
  return null;
}

/** Retained for the scripted fallback, which has no quest state to read. */
function _dueEpisodeIndexByTurn(ctx: ReplyContext): number | null {
  const due = ctx.turn >= 3 && ctx.turn % 3 === 0 && ctx.revealed < ctx.resident.episodes.length;
  return due ? ctx.revealed : null;
}

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]*[.!?]/);
  return m ? m[0] : text;
}

/** Every resident addresses the visitor the same way, even when a name is saved. */
function visitorAddress(nickname: string): string {
  const name = nickname.trim().replace(/\s+/g, ' ').slice(0, 40);
  return name ? `Anh ${name}` : 'Anh';
}

/**
 * Deterministic scripted reply. Swap this body for a server call carrying the
 * resident's canon plus the session setup; the signature stays the same.
 */
export function reply(message: string, ctx: ReplyContext): ReplyResult {
  const { resident, session } = ctx;
  const intent = detectIntent(message);
  const seed = fnv1a(message.trim().toLowerCase() + resident.id + session.mood);
  const pair = LINES[resident.id][intent];
  let text = pair[seed % 2];
  let revealedRung: number | undefined;

  // A rung of the ladder lands on a deep turn, once per session, and only
  // when there is one left to give.
  const rungDue = dueEpisodeIndex(ctx) !== null && intent !== 'farewell';
  if (rungDue) {
    text = `${text} ${resident.episodes[ctx.revealed].spoken}`;
    revealedRung = ctx.revealed;
  }

  // Mood colours the line without changing who is speaking.
  const tag = MOOD_TAG[resident.id][session.mood];
  if (tag && !revealedRung && seed % 3 === 0) text = `${text} ${tag}`;

  // Who drives: she asks her own question, or she stays out of the way.
  if (session.style === 'lead' && !revealedRung && intent !== 'farewell') {
    text = `${text} ${resident.curiosity[seed % resident.curiosity.length]}`;
  } else if (session.style === 'listen') {
    text = text.replace(/\s*[^.!?]*\?$/, '').trim() || text;
  }

  // A saved memory surfaces as a callback rather than a status line.
  if (ctx.memories.length && ctx.turn === 1) {
    text = `${text} Lần trước anh nhắc đến ${ctx.memories[seed % ctx.memories.length]}. Em vẫn nhớ.`;
  }

  if (session.nickname && seed % 4 === 0) {
    text = `${visitorAddress(session.nickname)}. ${text}`;
  }

  if (session.length === 'short') text = firstSentence(text);
  return { text: text.trim(), revealedRung };
}

/**
 * How she opens. A stranger, someone she has met before, and someone she has
 * let in do not get the same first line; once there is history worth naming
 * she opens on that instead of on herself.
 */
export function openingLine(
  resident: ResidentConfig,
  memories: string[],
  nickname: string,
  revealed = 0
): string {
  if (!memories.length) return resident.greeting;
  if (revealed >= 3) return resident.closeGreeting;
  const who = visitorAddress(nickname);
  const memory = memories[0];
  switch (resident.id) {
    case 'rin':
      return `${who}, lần trước anh nhắc đến ${memory}. Em cứ nghĩ về đoạn đó. Kể em nghe đi.`;
    case 'kagura':
      return `${who}, lần trước anh nhắc đến ${memory}. Giờ chuyện đó đến đâu rồi, nói thẳng em nghe.`;
    case 'momo':
      return `${who}, lần trước anh kể về ${memory}. Em vẫn nhớ. Giờ chuyện đó đã đi đến đâu rồi?`;
  }
}

/** Rough speaking time so the base light pulses for the right duration. */
export function speakingDuration(text: string): number {
  return Math.min(7, Math.max(1.4, text.length / 18));
}
