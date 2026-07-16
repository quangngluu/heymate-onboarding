import { FACTIONS, type FactionConfig } from './factions';

export interface UniverseConfig {
  id: string;
  name: string;
  tagline: string;
  factions: FactionConfig[];
  /** Environment tint knobs consumed by the stage builder. */
  env: {
    background: number;
    fog: { color: number; near: number; far: number };
    ground: number;
    coreColor: number;
  };
}

export const UNIVERSES: UniverseConfig[] = [
  {
    id: 'afterburn-city',
    name: 'Afterburn City',
    tagline: 'One machine language, four ways to speak it.',
    factions: FACTIONS,
    env: {
      background: 0x0c0b0d,
      fog: { color: 0x0c0b0d, near: 11, far: 30 },
      ground: 0x151215,
      coreColor: 0xe8d9c4,
    },
  },
];

export function universeById(id: string): UniverseConfig {
  const u = UNIVERSES.find((x) => x.id === id);
  if (!u) throw new Error(`Unknown universe: ${id}`);
  return u;
}
