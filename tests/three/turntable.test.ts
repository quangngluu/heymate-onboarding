import { describe, expect, it } from 'vitest';
import { turntableYawFromDrag } from '../../src/three/turntable';

describe('turntableYawFromDrag', () => {
  it('maps horizontal drag to model yaw', () => {
    expect(turntableYawFromDrag(0.2, 50)).toBeCloseTo(0.65);
  });

  it('allows continuous rotation in both directions without a gate', () => {
    expect(turntableYawFromDrag(0, 1000)).toBe(9);
    expect(turntableYawFromDrag(0, -1000)).toBe(-9);
  });

  it('continues from the yaw captured at pointer down', () => {
    expect(turntableYawFromDrag(Math.PI * 2, 200)).toBeCloseTo(Math.PI * 2 + 1.8);
  });
});
