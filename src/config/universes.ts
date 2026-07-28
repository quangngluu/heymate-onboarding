import { FACTIONS, type FactionConfig } from './factions';
import { RESIDENTS, type ResidentConfig } from './residents';

/**
 * Two experience kinds share one engine:
 *  - 'companion': pick a resident, they take the base and you talk to them.
 *  - 'creator':   pick a character, then generate your own Mate from it.
 */
export type UniverseKind = 'companion' | 'creator';

export interface UniverseConfig {
  id: string;
  name: string;
  tagline: string;
  kind: UniverseKind;
  /** Gallery tile art; rendered from the roster when absent. */
  posterUrl?: string;
  accentColor: number;
  /** Populated for kind === 'creator'. */
  factions?: FactionConfig[];
  /** Populated for kind === 'companion'. */
  residents?: ResidentConfig[];
  env: {
    background: number;
    fog: { color: number; near: number; far: number };
    ground: number;
    coreColor: number;
    /** Companion stages use a procedural studio instead of a panorama. */
    studio?: { top: number; bottom: number; intensity: number };
  };
}

export const UNIVERSES: UniverseConfig[] = [
  {
    id: 'waifu-universe',
    name: 'Vũ trụ Waifu',
    tagline: 'Những nhân vật để anh trò chuyện. Các em sống trên bệ trưng bày, không chỉ trong ứng dụng.',
    kind: 'companion',
    accentColor: 0xc98bb0,
    posterUrl: 'assets/posters/waifu-universe.webp',
    residents: RESIDENTS,
    env: {
      background: 0x14121a,
      fog: { color: 0x14121a, near: 14, far: 34 },
      ground: 0x191720,
      coreColor: 0xf0e6ea,
      studio: { top: 0xb9b3c6, bottom: 0x14121a, intensity: 0.85 },
    },
  },
  {
    id: 'afterburn-city',
    name: 'Afterburn City',
    tagline: 'Một ngôn ngữ máy, bốn cách kể chuyện. Tạo Mate của riêng anh.',
    kind: 'creator',
    accentColor: 0xd8402c,
    posterUrl: 'assets/posters/afterburn-city.webp',
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
