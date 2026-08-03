import { describe, expect, it } from 'vitest';
import { coverBackdropDimensions } from '../../src/three/nameplate';

describe('distant nameplate backdrop framing', () => {
  it('covers a landscape viewport with overscan without changing image aspect', () => {
    const depth = 17;
    const viewportAspect = 1440 / 900;
    const imageAspect = 4 / 3;
    const dimensions = coverBackdropDimensions(
      37,
      viewportAspect,
      depth,
      imageAspect,
      1.06
    );
    const projectedWidth =
      2 * depth * Math.tan((37 * Math.PI) / 360) * viewportAspect;

    expect(dimensions.width).toBeCloseTo(projectedWidth * 1.06);
    expect(dimensions.width / dimensions.height).toBeCloseTo(imageAspect);
  });

  it('keeps the established mobile scale while still covering its narrow frustum', () => {
    const desktop = coverBackdropDimensions(37, 1440 / 900, 17, 1, 1.06, 9.5);
    const mobile = coverBackdropDimensions(56, 390 / 844, 17, 1, 1.06, 9.5);
    const requiredMobileWidth =
      2 * 17 * Math.tan((56 * Math.PI) / 360) * (390 / 844) * 1.06;

    expect(mobile.width).toBeGreaterThanOrEqual(requiredMobileWidth);
    expect(mobile.height).toBe(9.5);
    expect(mobile.width).toBeLessThan(desktop.width);
    expect(mobile.width / mobile.height).toBe(1);
  });

  it('adds asymmetric camera-target offset to both sides of the cover width', () => {
    const centered = coverBackdropDimensions(56, 844 / 390, 17, 1, 1.06, 0, 0);
    const offset = coverBackdropDimensions(56, 844 / 390, 17, 1, 1.06, 0, 2.4);

    expect(offset.width).toBeCloseTo(centered.width + 2 * 2.4 * 1.06);
    expect(offset.width / offset.height).toBe(1);
  });

  it.each([
    ['portrait edge', 699 / 900],
    ['landscape edge', 701 / 900],
    ['rotated phone', 844 / 390],
  ])('covers the %s viewport after a responsive boundary change', (_, viewportAspect) => {
    const dimensions = coverBackdropDimensions(
      45,
      viewportAspect,
      17,
      16 / 9,
      1.06,
      9.5
    );
    const requiredWidth =
      2 * 17 * Math.tan((45 * Math.PI) / 360) * viewportAspect * 1.06;

    expect(dimensions.width).toBeGreaterThanOrEqual(requiredWidth);
    expect(dimensions.width / dimensions.height).toBeCloseTo(16 / 9);
  });
});
