import type { LengthId } from './residents';

export interface PersonaTraits {
  tone: number;
  problem: 'listen' | 'solve' | 'challenge';
  energy: 'calm' | 'balanced' | 'energetic';
  humor: 'dry' | 'playful' | 'chaotic' | 'minimal';
  proactive: 'called' | 'sometimes' | 'often';
  relationship: 'friend' | 'companion' | 'mentor' | 'rival' | 'custom';
  relationshipCustom: string;
}

export function defaultPersonaTraits(): PersonaTraits {
  return {
    tone: 50,
    problem: 'solve',
    energy: 'balanced',
    humor: 'playful',
    proactive: 'sometimes',
    relationship: 'companion',
    relationshipCustom: '',
  };
}

const PROBLEM_PHRASE: Record<PersonaTraits['problem'], string> = {
  listen: 'khi anh có chuyện, em nghe anh nói trước đã, chưa vội khuyên',
  solve: 'khi anh có chuyện, em cùng anh gỡ, đưa hướng cụ thể',
  challenge: 'khi anh có chuyện, em dám thách lại anh, không dỗ cho qua',
};

const ENERGY_PHRASE: Record<PersonaTraits['energy'], string> = {
  calm: 'giữ năng lượng điềm tĩnh',
  balanced: 'năng lượng cân bằng',
  energetic: 'mang năng lượng sôi nổi',
};

const HUMOR_PHRASE: Record<PersonaTraits['humor'], string> = {
  dry: 'đùa kiểu tỉnh khô',
  playful: 'đùa vui, nhẹ nhàng',
  chaotic: 'đùa kiểu lầy, hơi loạn một chút',
  minimal: 'ít đùa, giữ chừng mực',
};

const PROACTIVE_PHRASE: Record<PersonaTraits['proactive'], string> = {
  called: 'chỉ chủ động khi anh gọi',
  sometimes: 'thỉnh thoảng chủ động khơi chuyện',
  often: 'chủ động thường xuyên, không đợi anh gọi',
};

const RELATIONSHIP_PHRASE: Record<Exclude<PersonaTraits['relationship'], 'custom'>, string> = {
  friend: 'một người bạn',
  companion: 'người đồng hành',
  mentor: 'người dẫn dắt',
  rival: 'một đối thủ của anh',
};

function tonePhrase(tone: number): string {
  if (tone < 34) return 'nói dịu dàng, mềm mỏng';
  if (tone <= 66) return 'nói vừa phải, không quá mềm cũng không quá gắt';
  return 'nói thẳng, ít vòng vo';
}

function customRelationship(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/["'“”‘’«»]/g, '')
    .trim()
    .slice(0, 40);
}

export function compilePersona(t: PersonaTraits, _length: LengthId): string {
  const relationship =
    t.relationship === 'custom'
      ? customRelationship(t.relationshipCustom) || 'người đồng hành'
      : RELATIONSHIP_PHRASE[t.relationship];

  return [
    `Lần này anh muốn em: ${tonePhrase(t.tone)}; ${PROBLEM_PHRASE[t.problem]}; ${ENERGY_PHRASE[t.energy]}; ${HUMOR_PHRASE[t.humor]}; ${PROACTIVE_PHRASE[t.proactive]}.`,
    `Phiên này em ở bên anh trong vai ${relationship} — khung này định nhịp cho lần gặp, không đổi canon hay ranh giới hai người.`,
  ].join(' ');
}
