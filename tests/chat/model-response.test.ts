import { describe, expect, it } from 'vitest';
import { splitModelState, trimModelProse } from '../../src/chat/model-response';

describe('model response normalization', () => {
  it('removes relationship state before returning prose', () => {
    expect(
      splitModelState(
        'Em vẫn ở đây.\n<<state {"trust":0.4,"unresolvedConflict":null}>>'
      )
    ).toEqual({
      text: 'Em vẫn ở đây.',
      state: { trust: 0.4, unresolvedConflict: null },
    });
  });

  it('removes an incomplete state envelope instead of leaking it as dialogue', () => {
    expect(splitModelState('Em vẫn ở đây.\n<<state {"trust":0.4')).toEqual({
      text: 'Em vẫn ở đây.',
      state: null,
    });
  });

  it('trims only an incomplete length-limited tail', () => {
    const prose = 'Em đã đến và khóa cửa cẩn thận. Nhưng cánh cửa vẫn đang';
    expect(trimModelProse(prose, 'length')).toBe('Em đã đến và khóa cửa cẩn thận.');
    expect(trimModelProse(prose, 'stop')).toBe(prose);
  });

  it('keeps a short response when there is no safe sentence boundary', () => {
    expect(trimModelProse('Em vẫn đang đợi', 'length')).toBe('Em vẫn đang đợi');
  });
});
