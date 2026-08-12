// Pure entry-cinematic policy. Keeping this free of DOM and Three.js makes
// the visibility and playback decisions independently testable.

import { UNIVERSES, type UniverseConfig } from './universes';

export type TeaserGate = 'always' | 'first-visit';

/** Play on every entry while the cinematic flow is being evaluated. */
export const TEASER_GATE: TeaserGate = 'always';

/** Afterburn remains configured, but stays out of entry until it has a teaser. */
export const ENTRY_GALLERY_ALLOW: readonly string[] = ['waifu-universe'];

export function visibleUniverses(all: UniverseConfig[] = UNIVERSES): UniverseConfig[] {
  return all.filter((universe) => ENTRY_GALLERY_ALLOW.includes(universe.id));
}

export function shouldPlayTeaser(entered: boolean, gate: TeaserGate = TEASER_GATE): boolean {
  return gate === 'always' || !entered;
}
