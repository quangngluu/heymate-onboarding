import type { FactionConfig } from './factions';

export type HairId = 'crop' | 'swoop' | 'buns';
export type EyewearId = 'none' | 'visor' | 'round';
export type ExpressionId = 'calm' | 'confident' | 'playful';
export type EmblemPlacement = 'chest' | 'shoulder' | 'pedestal';

export interface CustomizationState {
  hair: HairId;
  eyewear: EyewearId;
  expression: ExpressionId;
  /** Faction accent-option id. */
  accent: string;
  /** Faction palette id. */
  palette: string;
  emblem: EmblemPlacement;
}

export const HAIR_OPTIONS: { id: HairId; label: string }[] = [
  { id: 'crop', label: 'Soft crop' },
  { id: 'swoop', label: 'Side swoop' },
  { id: 'buns', label: 'Twin buns' },
];

export const EYEWEAR_OPTIONS: { id: EyewearId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'visor', label: 'Visor' },
  { id: 'round', label: 'Round glasses' },
];

export const EXPRESSION_OPTIONS: { id: ExpressionId; label: string }[] = [
  { id: 'calm', label: 'Calm' },
  { id: 'confident', label: 'Confident' },
  { id: 'playful', label: 'Playful' },
];

export const EMBLEM_OPTIONS: { id: EmblemPlacement; label: string }[] = [
  { id: 'chest', label: 'Chest' },
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'pedestal', label: 'Pedestal' },
];

export function defaultCustomization(faction: FactionConfig): CustomizationState {
  return {
    hair: 'crop',
    eyewear: 'none',
    expression: 'calm',
    accent: faction.accents[0].id,
    palette: faction.palettes[0].id,
    emblem: 'chest',
  };
}

/** Coerce a (possibly cross-faction) customization into valid values for a faction. */
export function coerceForFaction(
  faction: FactionConfig,
  c: CustomizationState
): CustomizationState {
  const accent = faction.accents.some((a) => a.id === c.accent) ? c.accent : faction.accents[0].id;
  const palette = faction.palettes.some((p) => p.id === c.palette)
    ? c.palette
    : faction.palettes[0].id;
  return { ...c, accent, palette };
}
