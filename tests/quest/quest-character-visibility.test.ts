import { describe, expect, it } from 'vitest';
import { questCharacterVisibility } from '../../src/three/waifu-stage';

describe('Quest character presentation', () => {
  it('shows no sculpt or generic rig on the shipping Quest path', () => {
    expect(
      questCharacterVisibility({ questMode: true, debugRig: false, hasRig: true, isHero: true })
    ).toEqual({ resident: false, rig: false });
  });

  it('keeps the motion spike available only behind its explicit debug flag', () => {
    expect(
      questCharacterVisibility({ questMode: true, debugRig: true, hasRig: true, isHero: true })
    ).toEqual({ resident: false, rig: true });
  });
});
