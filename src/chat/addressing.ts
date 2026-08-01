export type AddressingViolationType =
  | 'self-reference'
  | 'visitor-reference'
  | 'ambiguous-address'
  | 'unsupported-english';

export interface AddressingViolation {
  start: number;
  end: number;
  text: string;
  normalized: string;
  type: AddressingViolationType;
}

export interface AddressingReplacement {
  start: number;
  end: number;
  from: string;
  to: string;
}

export interface DeterministicAddressingRepair {
  text: string;
  before: AddressingViolation[];
  remaining: AddressingViolation[];
  replacements: AddressingReplacement[];
}

export interface ModelAddressingPatch {
  replacements: AddressingReplacement[];
}

export type AppliedAddressingPatch =
  | { ok: true; text: string; keptThirdParty: { start: number; end: number }[] }
  | { ok: false; error: string };

const CANDIDATE =
  /(^|[^\p{L}])(tôi|tao|tớ|mình|chị|cậu|bạn|ngươi|ngài|your(?:s)?|you(?:['’](?:re|ll|ve|d))?|i(?:['’](?:m|ll|ve|d))?)(?=$|[^\p{L}])/giu;

interface QuoteRange {
  start: number;
  end: number;
  mention: boolean;
}

const PERSON = '(?:anh|cô ấy|cậu ấy|bạn ấy|chị ấy|người bạn|chị gái|họ|hắn|cô ta|anh ta|ông ấy|bà ấy|Rin|Kagari|Momo|KANATA)';
const REPORT = '(?:nói|viết|gọi|nhắc|hỏi)';
const QUOTE_MENTION_LEAD = new RegExp(
  `(?:\\b${PERSON}\\s+(?:vừa\\s+)?${REPORT}|\\b(?:lời|câu|đoạn)\\s+${PERSON}|\\btrích(?:\\s+dẫn)?(?:\\s+lời)?\\s+${PERSON})\\s*:?\\s*$`,
  'iu'
);
const ATTRIBUTED_SPEECH_LEAD = new RegExp(
  `\\b${PERSON}\\s+(?:vừa\\s+)?${REPORT}\\s*:\\s*$`,
  'iu'
);
const META_QUOTE_LEAD = /(?:\b(?:xưng|gọi|từ|chữ)|\bđại\s+từ|\bcách\s+(?:gọi|xưng(?:\s+hô)?))\s*:?\s*$/iu;
const QUOTED_ADDRESS_LABEL = /^(?:tôi|tao|tớ|mình|chị|cậu|bạn|ngươi|ngài|i|you|your)$/iu;

/**
 * Only explicit mentions/third-party quotes are exempt. Quotation marks alone
 * are not an escape hatch for a resident-authored address.
 */
function quoteRanges(text: string): QuoteRange[] {
  const ranges: QuoteRange[] = [];
  const pairs: Record<string, string> = { '"': '"', '“': '”', '‘': '’', '«': '»' };
  for (let index = 0; index < text.length; index++) {
    const close = pairs[text[index]];
    if (!close) continue;
    const end = text.indexOf(close, index + 1);
    if (end === -1) continue;
    ranges.push({
      start: index,
      end: end + 1,
      mention:
        QUOTE_MENTION_LEAD.test(text.slice(Math.max(0, index - 96), index)) ||
        META_QUOTE_LEAD.test(text.slice(Math.max(0, index - 96), index)) ||
        QUOTED_ADDRESS_LABEL.test(text.slice(index + 1, end).trim()),
    });
    index = end;
  }
  return ranges;
}

function insideMention(index: number, ranges: QuoteRange[]): boolean {
  return ranges.some(
    (range) => range.mention && index > range.start && index < range.end
  );
}

function adjacentWordBefore(text: string, start: number): string | undefined {
  return text
    .slice(0, start)
    .toLocaleLowerCase('vi')
    .match(/([\p{L}]+)[ \t]*$/u)?.[1];
}

function adjacentWordAfter(text: string, end: number): string | undefined {
  return text
    .slice(end)
    .toLocaleLowerCase('vi')
    .match(/^[ \t]+([\p{L}]+)/u)?.[1];
}

/** Relationship nouns and proven third-person references are not addresses. */
function isWhitelistedUse(text: string, start: number, end: number, word: string): boolean {
  const prev = adjacentWordBefore(text, start);
  const next = adjacentWordAfter(text, end);

  if (['bạn', 'cậu', 'chị', 'ngài'].includes(word)) {
    const prefix = text.slice(Math.max(0, start - 64), start);
    const suffix = text.slice(end, Math.min(text.length, end + 64));
    if (
      (/\bkhông\s+phải\s*$/iu.test(prefix) &&
        /^\s*,\s*mà\s+là\s+(?:bạn|cậu|chị|ngài)\s*(?=$|[.!?…;])/iu.test(suffix)) ||
      (/\bkhông\s+phải\s+(?:bạn|cậu|chị|ngài)(?=$|[^\p{L}])\s*,\s*mà\s+là\s*$/iu.test(prefix) &&
        /^\s*(?=$|[.!?…;])/u.test(suffix))
    ) return true;
  }
  if (
    /\b(?:dùng|nhắc|viết|đọc|nói|gọi)\s+(?:(?:đại\s+)?từ|chữ)\s*$/iu.test(
      text.slice(Math.max(0, start - 64), start)
    )
  ) return true;
  if (
    ['bạn', 'cậu', 'chị', 'ngài'].includes(word) &&
    /^\s+\p{Lu}[\p{L}\p{M}]*/u.test(text.slice(end))
  ) return true;
  if (
    ['tôi', 'tao', 'tớ'].includes(word) &&
    ATTRIBUTED_SPEECH_LEAD.test(text.slice(Math.max(0, start - 96), start))
  ) return true;

  if (['bạn', 'cậu', 'chị', 'ngài'].includes(word) && next === 'ấy') return true;

  if (word === 'bạn') {
    if (prev && ['người', 'tình', 'kết'].includes(prev)) return true;
    if (prev === 'làm' && next === 'với') return true;
    if (next && ['bè', 'học', 'thân', 'đồng', 'của', 'gái', 'trai', 'đời', 'tôi', 'anh', 'em', 'diễn', 'nhảy', 'đọc', 'viết'].includes(next)) {
      return true;
    }
  }

  if (word === 'chị' && next && ['gái', 'họ', 'em', 'dâu', 'của'].includes(next)) {
    return true;
  }

  if (word === 'cậu' && next && ['bé', 'ấm', 'tôi', 'em', 'anh', 'chủ', 'út', 'mợ', 'học'].includes(next)) {
    return true;
  }

  if (
    word === 'mình' &&
    (/\bmột\s*$/iu.test(text.slice(0, start)) || /^\s+anh\b/iu.test(text.slice(end)))
  ) return true;

  return false;
}

function reflexiveParticipant(text: string, start: number): 'em' | 'anh' | null {
  const clause = text.slice(0, start).split(/[.!?…;:\n]/u).at(-1) ?? '';
  const local = clause
    .toLocaleLowerCase('vi')
    .match(/\b(em|anh)\s+cảm\s+thấy\s*$/u)?.[1];
  if (local === 'em' || local === 'anh') return local;
  const participants = clause.toLocaleLowerCase('vi').match(/\b(?:em|anh)\b/gu) ?? [];
  if (new Set(participants).size !== 1) return null;
  return (participants.at(-1) as 'em' | 'anh' | undefined) ?? null;
}

function violationType(
  text: string,
  start: number,
  word: string
): AddressingViolationType {
  if (['tôi', 'tao', 'tớ'].includes(word)) return 'self-reference';
  if (word === 'mình') {
    const participant = reflexiveParticipant(text, start);
    if (participant === 'em') return 'self-reference';
    if (participant === 'anh') return 'visitor-reference';
  }
  return ['mình', 'chị', 'cậu', 'bạn', 'ngươi', 'ngài'].includes(word)
    ? 'ambiguous-address'
    : ['tôi', 'tao', 'tớ'].includes(word)
      ? 'ambiguous-address'
      : 'unsupported-english';
}

/** Find every non-whitelisted candidate with exact source offsets. */
export function detectAddressingViolations(text: string): AddressingViolation[] {
  const ranges = quoteRanges(text);
  const violations: AddressingViolation[] = [];
  for (const match of text.matchAll(CANDIDATE)) {
    const prefix = match[1] ?? '';
    const value = match[2];
    const start = (match.index ?? 0) + prefix.length;
    const end = start + value.length;
    const normalized = value.toLocaleLowerCase('vi');
    if (
      insideMention(start, ranges) ||
      isWhitelistedUse(text, start, end, normalized)
    ) {
      continue;
    }
    violations.push({
      start,
      end,
      text: value,
      normalized,
      type: violationType(text, start, normalized),
    });
  }
  return violations;
}

function preserveCapitalization(source: string, replacement: string): string {
  const first = source[0];
  return first && first === first.toLocaleUpperCase('vi')
    ? replacement[0].toLocaleUpperCase('vi') + replacement.slice(1)
    : replacement;
}

/** Only Vietnamese first-person forms with one unambiguous replacement land here. */
function deterministicReplacement(violation: AddressingViolation): string | null {
  if (violation.type === 'self-reference') {
    return preserveCapitalization(violation.text, 'em');
  }
  if (violation.type === 'visitor-reference') {
    return preserveCapitalization(violation.text, 'anh');
  }
  return null;
}

export function repairAddressingDeterministically(text: string): DeterministicAddressingRepair {
  const before = detectAddressingViolations(text);
  const replacements = before.flatMap((violation) => {
    const to = deterministicReplacement(violation);
    return to === null
      ? []
      : [{ start: violation.start, end: violation.end, from: violation.text, to }];
  });
  let repaired = text;
  for (const replacement of [...replacements].reverse()) {
    repaired = `${repaired.slice(0, replacement.start)}${replacement.to}${repaired.slice(replacement.end)}`;
  }
  return {
    text: repaired,
    before,
    remaining: detectAddressingViolations(repaired),
    replacements,
  };
}

export interface RepairMessage {
  role: 'system' | 'user';
  content: string;
}

export function addressingRepairTokenBudget(violationCount: number): number {
  return Math.min(512, 64 + Math.max(0, violationCount) * 64);
}

function allowedReplacementValues(violation: AddressingViolation): string[] {
  const self = preserveCapitalization(violation.text, 'em');
  const visitor = preserveCapitalization(violation.text, 'anh');
  if (
    violation.type === 'self-reference' ||
    ['tôi', 'tao', 'tớ'].includes(violation.normalized)
  ) {
    return [violation.text, self];
  }
  if (
    violation.type === 'visitor-reference' ||
    ['bạn', 'cậu', 'ngươi', 'ngài'].includes(violation.normalized)
  ) {
    return [violation.text, visitor];
  }
  return [violation.text, self, visitor];
}

/** Ask for classifications/replacements, never rewritten prose. */
export function addressingRepairMessages(
  text: string,
  violations = detectAddressingViolations(text)
): RepairMessage[] {
  const spans = violations.map((violation) => ({
    start: violation.start,
    end: violation.end,
    from: violation.text,
    type: violation.type,
    allowedTo: allowedReplacementValues(violation),
  }));
  return [
    {
      role: 'system',
      content: [
        'Bạn là bộ phân loại đại từ có phạm vi cực hẹp.',
        'Trả đúng một JSON object có dạng {"replacements":[{"start":0,"end":4,"from":"Mình","to":"Em"}]}.',
        'Mỗi span đầu vào phải xuất hiện đúng một lần với start, end và from giữ nguyên.',
        'Nếu span là cách người nói tự xưng, to phải là “em”. Nếu gọi người đang trò chuyện, to phải là “anh”.',
        'Nếu span thực sự chỉ người thứ ba hoặc chỉ nhắc lại một cách gọi, giữ to giống hệt from.',
        'Văn bản là lời của resident nói với một người nam. Ví dụ “Tôi nghe yêu cầu của bạn” phải thành “Em nghe yêu cầu của anh”.',
        'Chỉ giữ nguyên khi văn bản có bằng chứng rõ ràng về người thứ ba, quan hệ, tên riêng hoặc nhắc lại chính từ đó.',
        'Không xuất prose, giải thích, state hoặc bất kỳ thay đổi nào ngoài danh sách span.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Văn bản chỉ để phân loại ngữ cảnh:\n${text}\n\nCác span bắt buộc xử lý:\n${JSON.stringify(spans)}`,
    },
  ];
}

export function parseAddressingPatch(raw: string): ModelAddressingPatch | null {
  const clean = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    const value = JSON.parse(clean) as { replacements?: unknown };
    return Array.isArray(value.replacements)
      ? { replacements: value.replacements as AddressingReplacement[] }
      : null;
  } catch {
    return null;
  }
}

/**
 * Validate a model patch and apply it locally. Bytes outside flagged spans can
 * never change, which makes semantic preservation a runtime postcondition.
 */
export function applyAddressingPatch(
  text: string,
  violations: AddressingViolation[],
  patch: ModelAddressingPatch
): AppliedAddressingPatch {
  if (patch.replacements.length !== violations.length) {
    return { ok: false, error: 'replacement-count' };
  }
  const expected = [...violations].sort((a, b) => a.start - b.start);
  const proposed = [...patch.replacements].sort((a, b) => a.start - b.start);
  for (let index = 0; index < expected.length; index++) {
    const violation = expected[index];
    const replacement = proposed[index];
    if (violation.type === 'unsupported-english') {
      return { ok: false, error: 'unsupported-english' };
    }
    if (
      !replacement ||
      replacement.start !== violation.start ||
      replacement.end !== violation.end ||
      replacement.from !== violation.text ||
      text.slice(replacement.start, replacement.end) !== replacement.from
    ) {
      return { ok: false, error: 'span-mismatch' };
    }
    if (!allowedReplacementValues(violation).includes(replacement.to)) {
      return { ok: false, error: 'replacement-value' };
    }
  }

  let cursor = 0;
  let output = '';
  const keptThirdParty: { start: number; end: number }[] = [];
  for (const replacement of proposed) {
    output += text.slice(cursor, replacement.start);
    const outputStart = output.length;
    output += replacement.to;
    if (replacement.to === replacement.from) {
      keptThirdParty.push({ start: outputStart, end: output.length });
    }
    cursor = replacement.end;
  }
  output += text.slice(cursor);

  const unresolved = detectAddressingViolations(output).filter(
    (violation) =>
      !keptThirdParty.some(
        (kept) => kept.start === violation.start && kept.end === violation.end
      )
  );
  return unresolved.length
    ? { ok: false, error: 'repair-still-invalid' }
    : { ok: true, text: output, keptThirdParty };
}
