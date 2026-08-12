import { describe, expect, it } from 'vitest';
import { SEED_CHAR_CEILING, seedFor } from '../../src/config/seed';

describe('resident seed', () => {
  it('has a seed for kagura', () => {
    expect(seedFor('kagura')).not.toBeNull();
  });

  it('has no seed for residents not yet converted', () => {
    expect(seedFor('rin')).toBeNull();
    expect(seedFor('momo')).toBeNull();
  });

  it('stays well under the prompt ceiling', () => {
    const seed = seedFor('kagura');
    const total = Object.values(seed!).join('\n').length;
    expect(total).toBeGreaterThan(1200);
    expect(total).toBeLessThan(SEED_CHAR_CEILING);
  });

  it('derives the silhouette from the shipped key visual', () => {
    const seed = seedFor('kagura');
    expect(seed!.silhouette).toContain('đại đao');
    expect(seed!.silhouette).toContain('lọn trắng');
  });

  it('keeps the invariants that protect what gets cast', () => {
    const seed = seedFor('kagura');
    expect(seed!.invariants).toContain('không bất khả chiến bại');
  });
});
