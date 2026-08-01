import { describe, expect, it } from 'vitest';
import {
  applyAddressingPatch,
  addressingRepairTokenBudget,
  addressingRepairMessages,
  detectAddressingViolations,
  parseAddressingPatch,
  repairAddressingDeterministically,
} from '../../src/chat/addressing';

describe('addressing detector', () => {
  it.each([
    'Người bạn của em đứng cạnh chị gái Rin.',
    'Bạn gái của KANATA đang đợi.',
    'Bạn Mai đang đợi ở ngoài.',
    'Đó là bạn đời của cô ấy.',
    'Cậu ấy đã để lại một câu cho bạn ấy.',
    'Cậu chủ bảo ngài ấy đã gặp ngài Chủ tịch.',
    'Em vẫn ở một mình, chỉ mình anh nghe thấy.',
    'Anh vừa nói: “Tôi không biết người bạn đó.”',
    'Em nhớ lời anh: "You called her chị gái."',
    'Hắn nói: Tao không biết.',
  ])('allows proven relationship nouns and explicit quoted mentions: %s', (text) => {
    expect(detectAddressingViolations(text)).toEqual([]);
  });

  it('does not let quotation marks or a vague lead hide the resident own address', () => {
    expect(
      detectAddressingViolations('“Tôi sẽ gọi bạn.”').map((item) => item.text)
    ).toEqual(['Tôi', 'bạn']);
    expect(
      detectAddressingViolations('Em có một câu rồi “Tôi gọi bạn.”').map(
        (item) => item.text
      )
    ).toEqual(['Tôi', 'bạn']);
  });

  it('returns exact spans and keeps ambiguous address visible', () => {
    const text = 'Chỉ mình mới biết. Chị sẽ kể cho cậu.';
    const violations = detectAddressingViolations(text);
    expect(violations.map((item) => text.slice(item.start, item.end))).toEqual([
      'mình',
      'Chị',
      'cậu',
    ]);
    expect(violations.map((item) => item.type)).toEqual([
      'ambiguous-address',
      'ambiguous-address',
      'ambiguous-address',
    ]);
  });

  it('does not mistake direct address for the compound “làm bạn với”', () => {
    expect(detectAddressingViolations('Em sẽ làm bạn im lặng.').map((item) => item.text)).toEqual([
      'bạn',
    ]);
    expect(detectAddressingViolations('Em có thể làm bạn với cô ấy.')).toEqual([]);
  });

  it('preserves relationship nouns used as predicate labels or contrasts', () => {
    expect(
      detectAddressingViolations('Một người bạn. Không phải bạn, mà là chị.')
    ).toEqual([]);
    expect(
      detectAddressingViolations('Anh là bạn, không phải khách.').map((item) => item.text)
    ).toEqual(['bạn']);
    expect(
      detectAddressingViolations('Không phải bạn làm em buồn.').map((item) => item.text)
    ).toEqual(['bạn']);
    expect(
      detectAddressingViolations('Người em chọn là bạn.').map((item) => item.text)
    ).toEqual(['bạn']);
    expect(
      detectAddressingViolations('Không phải bạn, mà là chị đã gọi em.').map(
        (item) => item.text
      )
    ).toEqual(['bạn', 'chị']);
    expect(
      detectAddressingViolations('Không phải bạn, mà là cậu ấy làm điều đó.').map(
        (item) => item.text
      )
    ).toEqual(['bạn']);
  });

  it('marks English pronouns and contractions as unsupported instead of token-repairing them', () => {
    const violations = detectAddressingViolations("I'm here for you and your choice.");
    expect(violations.map((item) => item.text)).toEqual(["I'm", 'you', 'your']);
    expect(violations.every((item) => item.type === 'unsupported-english')).toBe(true);
  });
});

describe('deterministic addressing repair', () => {
  it('repairs only unambiguous Vietnamese self-reference', () => {
    const result = repairAddressingDeterministically(
      'Tôi nghĩ bạn đúng. Mình vẫn ở đây, chị không cần vội.'
    );
    expect(result.text).toBe('Em nghĩ bạn đúng. Mình vẫn ở đây, chị không cần vội.');
    expect(result.replacements.map((item) => [item.from, item.to])).toEqual([
      ['Tôi', 'Em'],
    ]);
    expect(result.remaining.map((item) => item.normalized)).toEqual(['bạn', 'mình', 'chị']);
  });

  it('resolves reflexive mình from the nearest participant in its clause', () => {
    expect(
      repairAddressingDeterministically(
        'Em tự hứa với mình. Anh chưa biết mình cần gì.'
      ).text
    ).toBe('Em tự hứa với em. Anh chưa biết anh cần gì.');
    expect(
      repairAddressingDeterministically(
        'Em gặp anh, và anh cảm thấy mình không cần hoàn hảo.'
      ).text
    ).toBe('Em gặp anh, và anh cảm thấy anh không cần hoàn hảo.');
  });

  it('leaves reflexive mình ambiguous when both participants occur in the clause', () => {
    for (const text of [
      'Em nói với anh rằng mình sẽ ở lại.',
      'Em biết anh muốn mình ở lại.',
      'Em biết anh cần mình lúc này.',
    ]) {
      const result = repairAddressingDeterministically(text);
      expect(result.text).toBe(text);
      expect(result.remaining.map((item) => item.text)).toEqual(['mình']);
    }
  });

  it.each([
    'Em không dùng từ “tôi”; em vẫn xưng “em”.',
    'Cô ấy dùng đại từ tôi trong lá thư.',
    'Anh vừa nhắc chữ “tôi”.',
  ])('does not deterministically rewrite a metalinguistic or third-party use: %s', (text) => {
    const result = repairAddressingDeterministically(text);
    expect(result.text).toBe(text);
    expect(result.replacements).toEqual([]);
    expect(result.remaining).toEqual([]);
  });

  it('keeps explicitly named forms of address inside metalinguistic quotes', () => {
    expect(detectAddressingViolations('Em thấy xưng "tôi" với anh thì kỳ.')).toEqual([]);
    expect(detectAddressingViolations('Em dùng từ “bạn” cho cách gọi đó.')).toEqual([]);
    expect(detectAddressingViolations('Nếu em gọi anh là "bạn" thì nghe lạnh.')).toEqual([]);
    expect(detectAddressingViolations('Em dùng "I" và "you" như nhãn.')).toEqual([]);
  });

  it('treats a first-person stage direction as resident-authored speech', () => {
    expect(repairAddressingDeterministically('*Tôi đặt kiếm xuống.*').text).toBe(
      '*Em đặt kiếm xuống.*'
    );
  });

  it('preserves nouns while repairing a possessive self-reference', () => {
    expect(repairAddressingDeterministically('Cậu tôi vừa đến.').text).toBe('Cậu em vừa đến.');
    expect(
      repairAddressingDeterministically('Bạn tôi và bạn diễn của em đang đợi.').text
    ).toBe('Bạn em và bạn diễn của em đang đợi.');
    expect(
      repairAddressingDeterministically('Người bạn nói: “Tôi gặp chị gái rồi.” Tôi sẽ đợi cậu.').text
    ).toBe('Người bạn nói: “Tôi gặp chị gái rồi.” Em sẽ đợi cậu.');
  });

  it('repairs resident references and leaves visitor references for classification', () => {
    const result = repairAddressingDeterministically(
      'Tôi nghe bạn. Nhưng nếu bạn muốn nói với tôi thì cứ nói.'
    );
    expect(result.text).toBe('Em nghe bạn. Nhưng nếu bạn muốn nói với em thì cứ nói.');
    expect(result.remaining.map((item) => item.text)).toEqual(['bạn', 'bạn']);
  });

  it('does not treat the resident marker as a third-party attribution', () => {
    expect(repairAddressingDeterministically('Em nói: Tôi vẫn ở đây.').text).toBe(
      'Em nói: Em vẫn ở đây.'
    );
  });

  it('does not confuse prepositions or possessive handwriting with meta mentions', () => {
    const result = repairAddressingDeterministically(
      'Từ tôi đến bạn, chẳng ai biết. Chữ tôi xấu nhưng anh vẫn đọc được.'
    );
    expect(result.text).toBe(
      'Từ em đến bạn, chẳng ai biết. Chữ em xấu nhưng anh vẫn đọc được.'
    );
    expect(result.remaining.map((item) => item.text)).toEqual(['bạn']);
  });

  it('does not whitelist a relation across formatting or sentence boundaries', () => {
    expect(
      detectAddressingViolations('*nhìn thẳng bạn*\nEm vẫn ở đây.').map(
        (item) => item.text
      )
    ).toEqual(['bạn']);
    expect(
      detectAddressingViolations('Một người. Bạn vẫn ở đây.').map(
        (item) => item.text
      )
    ).toEqual(['Bạn']);
    expect(
      detectAddressingViolations('Em nhớ một người\nBạn vẫn ở đây.').map(
        (item) => item.text
      )
    ).toEqual(['Bạn']);
    expect(
      detectAddressingViolations('Em đợi bạn\nấy mới tới.').map((item) => item.text)
    ).toEqual(['bạn']);
  });
});

describe('validated model patch', () => {
  it('applies exact span replacements while preserving every other byte', () => {
    const text = 'Mình vẫn giữ Frame 12 và gọi bạn vào.';
    const violations = detectAddressingViolations(text);
    const result = applyAddressingPatch(text, violations, {
      replacements: violations.map((item) => ({
        start: item.start,
        end: item.end,
        from: item.text,
        to: item.normalized === 'mình' ? 'Em' : 'anh',
      })),
    });
    expect(result).toMatchObject({ ok: true, text: 'Em vẫn giữ Frame 12 và gọi anh vào.' });
  });

  it('allows an exact no-op only as an explicit third-party classification', () => {
    const text = 'Chị đang đợi ở ngoài.';
    const violations = detectAddressingViolations(text);
    expect(applyAddressingPatch(text, violations, {
      replacements: violations.map((item) => ({
        start: item.start,
        end: item.end,
        from: item.text,
        to: item.text,
      })),
    })).toMatchObject({ ok: true, text });
  });

  it('rejects role-inverting replacements for self and visitor pronouns', () => {
    const visitorText = 'Em sẽ đợi bạn.';
    const visitor = detectAddressingViolations(visitorText);
    expect(applyAddressingPatch(visitorText, visitor, {
      replacements: [{
        start: visitor[0].start,
        end: visitor[0].end,
        from: visitor[0].text,
        to: 'em',
      }],
    })).toEqual({ ok: false, error: 'replacement-value' });

    const selfText = 'Cô ấy nghĩ tôi sai.';
    const self = detectAddressingViolations(selfText);
    expect(applyAddressingPatch(selfText, self, {
      replacements: [{
        start: self[0].start,
        end: self[0].end,
        from: self[0].text,
        to: 'anh',
      }],
    })).toEqual({ ok: false, error: 'replacement-value' });
  });

  it('rejects prose rewrites, span drift and unsupported English', () => {
    const text = 'Mình vẫn giữ Frame 12.';
    const violations = detectAddressingViolations(text);
    expect(parseAddressingPatch('Em đã xoá Frame 12.')).toBeNull();
    expect(applyAddressingPatch(text, violations, {
      replacements: [{ start: 0, end: 4, from: 'Mình', to: 'Em đã xoá' }],
    })).toEqual({ ok: false, error: 'replacement-value' });

    const english = "I'm here for you.";
    expect(applyAddressingPatch(english, detectAddressingViolations(english), {
      replacements: detectAddressingViolations(english).map((item) => ({
        start: item.start,
        end: item.end,
        from: item.text,
        to: item.text,
      })),
    })).toEqual({ ok: false, error: 'unsupported-english' });
  });

  it('builds a constrained JSON patch prompt without relationship state', () => {
    const messages = addressingRepairMessages('Mình vẫn nhớ.');
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain('JSON object');
    expect(messages[0].content).toContain('start, end và from giữ nguyên');
    expect(messages.map((message) => message.content).join('\n')).not.toContain('rapport');
  });

  it('tells the classifier only role-safe replacement values', () => {
    const messages = addressingRepairMessages('Tôi sẽ đợi bạn.');
    const prompt = messages[1].content;
    expect(prompt).toContain('"allowedTo":["Tôi","Em"]');
    expect(prompt).toContain('"allowedTo":["bạn","anh"]');
  });

  it('budgets enough JSON tokens for a long list of constrained spans', () => {
    expect(addressingRepairTokenBudget(1)).toBe(128);
    expect(addressingRepairTokenBudget(13)).toBe(512);
  });
});
