import { describe, expect, it } from 'vitest';
import {
  compilePersona,
  defaultPersonaTraits,
  type PersonaTraits,
} from '../../src/config/persona';

function withTrait<K extends keyof PersonaTraits>(
  key: K,
  value: PersonaTraits[K]
): PersonaTraits {
  return { ...defaultPersonaTraits(), [key]: value };
}

describe('compilePersona', () => {
  it.each([
    [0, 'nói dịu dàng, mềm mỏng'],
    [33, 'nói dịu dàng, mềm mỏng'],
    [34, 'nói vừa phải, không quá mềm cũng không quá gắt'],
    [66, 'nói vừa phải, không quá mềm cũng không quá gắt'],
    [67, 'nói thẳng, ít vòng vo'],
    [100, 'nói thẳng, ít vòng vo'],
  ])('maps tone %s to its exact band phrase', (tone, fragment) => {
    expect(compilePersona(withTrait('tone', tone), 'natural')).toContain(fragment);
  });

  it.each([
    ['listen', 'khi anh có chuyện, em nghe anh nói trước đã, chưa vội khuyên'],
    ['solve', 'khi anh có chuyện, em cùng anh gỡ, đưa hướng cụ thể'],
    ['challenge', 'khi anh có chuyện, em dám thách lại anh, không dỗ cho qua'],
  ] as const)('maps problem=%s to its exact phrase', (id, fragment) => {
    expect(compilePersona(withTrait('problem', id), 'natural')).toContain(fragment);
  });

  it.each([
    ['calm', 'giữ năng lượng điềm tĩnh'],
    ['balanced', 'năng lượng cân bằng'],
    ['energetic', 'mang năng lượng sôi nổi'],
  ] as const)('maps energy=%s to its exact phrase', (id, fragment) => {
    expect(compilePersona(withTrait('energy', id), 'natural')).toContain(fragment);
  });

  it.each([
    ['dry', 'đùa kiểu tỉnh khô'],
    ['playful', 'đùa vui, nhẹ nhàng'],
    ['chaotic', 'đùa kiểu lầy, hơi loạn một chút'],
    ['minimal', 'ít đùa, giữ chừng mực'],
  ] as const)('maps humor=%s to its exact phrase', (id, fragment) => {
    expect(compilePersona(withTrait('humor', id), 'natural')).toContain(fragment);
  });

  it.each([
    ['called', 'chỉ chủ động khi anh gọi'],
    ['sometimes', 'thỉnh thoảng chủ động khơi chuyện'],
    ['often', 'chủ động thường xuyên, không đợi anh gọi'],
  ] as const)('maps proactive=%s to its exact phrase', (id, fragment) => {
    expect(compilePersona(withTrait('proactive', id), 'natural')).toContain(fragment);
  });

  it.each([
    ['friend', 'trong vai một người bạn'],
    ['companion', 'trong vai người đồng hành'],
    ['mentor', 'trong vai người dẫn dắt'],
    ['rival', 'trong vai một đối thủ của anh'],
  ] as const)('maps relationship=%s to its exact phrase', (id, fragment) => {
    expect(compilePersona(withTrait('relationship', id), 'natural')).toContain(fragment);
  });

  it('sanitizes and bounds a custom relationship', () => {
    const persona = compilePersona(
      {
        ...defaultPersonaTraits(),
        relationship: 'custom',
        relationshipCustom:
          '  “người   giữ nhịp 1234567890123456789012345678901234567890”  ',
      },
      'natural'
    );

    expect(persona).toContain('trong vai người giữ nhịp 1234567890123456789012345 —');
    expect(persona).not.toContain('“');
    expect(persona).not.toContain('”');
  });

  it('falls back to companion when a custom relationship sanitizes to empty', () => {
    const persona = compilePersona(
      { ...defaultPersonaTraits(), relationship: 'custom', relationshipCustom: `  "''"  ` },
      'natural'
    );

    expect(persona).toContain('trong vai người đồng hành —');
  });

  it('assembles the exact two-sentence instruction and does not repeat length', () => {
    const traits: PersonaTraits = {
      tone: 80,
      problem: 'listen',
      energy: 'calm',
      humor: 'dry',
      proactive: 'called',
      relationship: 'friend',
      relationshipCustom: '',
    };
    const expected =
      'Lần này anh muốn em: nói thẳng, ít vòng vo; khi anh có chuyện, em nghe anh nói trước đã, chưa vội khuyên; giữ năng lượng điềm tĩnh; đùa kiểu tỉnh khô; chỉ chủ động khi anh gọi. Phiên này em ở bên anh trong vai một người bạn — khung này định nhịp cho lần gặp, không đổi canon hay ranh giới hai người.';

    expect(compilePersona(traits, 'short')).toBe(expected);
    expect(compilePersona(traits, 'expressive')).toBe(expected);
  });
});
