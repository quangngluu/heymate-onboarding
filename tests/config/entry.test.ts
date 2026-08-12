import { describe, expect, it } from 'vitest';
import {
  ENTRY_GALLERY_ALLOW,
  TEASER_GATE,
  shouldPlayTeaser,
  visibleUniverses,
} from '../../src/config/entry';
import { UNIVERSES } from '../../src/config/universes';

describe('entry gallery visibility', () => {
  it('defaults the gate to always for testing', () => {
    expect(TEASER_GATE).toBe('always');
  });

  it('shows only allow-listed universes, hiding Afterburn', () => {
    const visible = visibleUniverses();
    expect(visible.map((universe) => universe.id)).toEqual(['waifu-universe']);
    expect(visible.map((universe) => universe.id)).not.toContain('afterburn-city');
  });

  it('preserves source order and only surfaces known ids', () => {
    const visible = visibleUniverses(UNIVERSES);
    for (const universe of visible) expect(ENTRY_GALLERY_ALLOW).toContain(universe.id);
  });

  it('plays the teaser every time under the always gate regardless of prior entry', () => {
    expect(shouldPlayTeaser(false, 'always')).toBe(true);
    expect(shouldPlayTeaser(true, 'always')).toBe(true);
  });

  it('under first-visit, plays only when the universe was not entered before', () => {
    expect(shouldPlayTeaser(false, 'first-visit')).toBe(true);
    expect(shouldPlayTeaser(true, 'first-visit')).toBe(false);
  });
});
