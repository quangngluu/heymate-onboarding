import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KAGURA_FIGURINE_VARIANT,
  KAGURA_FIGURINE_VARIANTS,
  formatVndPrice,
  parseVndPrice,
} from '../../src/config/figurine-products';
import { residentById } from '../../src/config/residents';

describe('Kagura figurine product variants', () => {
  it('keeps the resident original separate from all three premium editions', () => {
    const original = residentById('kagura').modelUrl;

    expect(original).toBe('assets/figurines/kagura-original.glb');
    expect(KAGURA_FIGURINE_VARIANTS.map((variant) => variant.modelUrl)).not.toContain(original);
    const path = fileURLToPath(new URL(`../../public/${original}`, import.meta.url));
    expect(statSync(path).size).toBeGreaterThan(8_000_000);
  });

  it('ships exactly three static previews backed by distinct lazy model URLs', () => {
    expect(KAGURA_FIGURINE_VARIANTS.map((variant) => variant.id)).toEqual([
      'three-d',
      'two-five-d',
      'ink',
    ]);
    expect(new Set(KAGURA_FIGURINE_VARIANTS.map((variant) => variant.previewUrl)).size).toBe(3);
    expect(new Set(KAGURA_FIGURINE_VARIANTS.map((variant) => variant.modelUrl)).size).toBe(3);
    expect(new Set(KAGURA_FIGURINE_VARIANTS.map((variant) => variant.glowMapUrl)).size).toBe(3);
    expect(new Set(KAGURA_FIGURINE_VARIANTS.map((variant) => variant.transitionImageUrl)).size).toBe(3);
    expect(DEFAULT_KAGURA_FIGURINE_VARIANT).toBe('three-d');
  });

  it('uses the matching authored still for each edition reveal', () => {
    for (const variant of KAGURA_FIGURINE_VARIANTS) {
      const fileStem = variant.id === 'two-five-d' ? '2-5d' : variant.id === 'three-d' ? '3d' : 'ink';
      expect(variant.previewUrl).toContain(`kagura-${fileStem}-preview`);
      expect(variant.modelUrl).toContain(`kagura-${fileStem}.glb`);
      expect(variant.transitionImageUrl).toBe(variant.previewUrl);
      expect(variant.transitionImageUrl).toContain(`kagura-${fileStem}-preview`);
    }
  });

  it('keeps full-detail compressed assets instead of the over-simplified demo meshes', () => {
    for (const variant of KAGURA_FIGURINE_VARIANTS) {
      const path = fileURLToPath(
        new URL(`../../public/${variant.modelUrl}`, import.meta.url)
      );
      const bytes = statSync(path).size;
      expect(bytes).toBeGreaterThan(8_000_000);
      expect(bytes).toBeLessThan(22_000_000);
      const glowPath = fileURLToPath(
        new URL(`../../public/${variant.glowMapUrl}`, import.meta.url)
      );
      expect(statSync(glowPath).size).toBeGreaterThan(100_000);
      const transitionPath = fileURLToPath(
        new URL(`../../public/${variant.transitionImageUrl}`, import.meta.url)
      );
      expect(statSync(transitionPath).size).toBeGreaterThan(50_000);
    }
  });

  it('keeps displayed VND labels and cart arithmetic in sync', () => {
    expect(parseVndPrice('6.999.000 ₫')).toBe(6_999_000);
    expect(formatVndPrice(6_999_000 * 2)).toBe('13.998.000 ₫');
  });
});
