import { describe, expect, it } from 'vitest';
import { swayAlpha } from '../../src/three/pointer-sway';

/**
 * PointerSway itself needs DOM (`window.matchMedia`, `pointermove` listeners),
 * so only the pure easing helper is exercised here. The publish-on-change and
 * pointerleave/reset behaviours are covered by the headless QA probe, which
 * drives real pointer events against the running page.
 */

function settle(frames: number, dt: number): number {
  let smooth = 0;
  for (let i = 0; i < frames; i++) {
    smooth += (1 - smooth) * swayAlpha(dt);
  }
  return smooth;
}

describe('swayAlpha', () => {
  it('is frame-rate independent: 30 Hz and 120 Hz settle to the same value', () => {
    const at30 = settle(30, 1 / 30); // 1 second total
    const at120 = settle(120, 1 / 120); // 1 second total
    expect(at30).toBeCloseTo(at120, 5);
  });

  it('never exceeds the (0,1) range and grows with a larger step', () => {
    expect(swayAlpha(0)).toBe(0);
    expect(swayAlpha(1 / 60)).toBeCloseTo(0.055, 6);
    expect(swayAlpha(1)).toBeGreaterThan(swayAlpha(1 / 60));
    expect(swayAlpha(1)).toBeLessThan(1);
  });
});
