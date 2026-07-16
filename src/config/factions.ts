// Faction content configuration — AFTERBURN CITY.
//
// Design language: one shared "vehicle DNA" reinterpreted four ways —
// fairings → aero shoulder/hip armor, headlights → visor/LED strips,
// tail lights → back light bars, tires → rubber texture cues, speedometer →
// round gauge displays, heat vents → collar/limb vents, vehicle paint →
// glossy enamel + leather + scuffed metal + warning decals.
//
// Scene code reads only from these records — adding a universe/faction
// should not require touching the onboarding engine. No weapons or combat
// props: the collectible DNA forbids them (Vale's baton is intentionally cut).

export type MaterialRole = 'primary' | 'secondary' | 'accent' | 'skin' | 'hair' | 'pedestal' | 'glow';

export interface Palette {
  id: string;
  label: string;
  primary: number;
  secondary: number;
  accent: number;
}

export type AccentKind =
  | 'scarf'
  | 'satchel'
  | 'belt'
  | 'collarTrim'
  | 'shoulderDrape'
  | 'cuffs'
  | 'headPods';

export interface AccentOption {
  id: string;
  label: string;
  kind: AccentKind;
}

export interface SilhouetteSpec {
  // Generic pieces (shared library)
  hood?: boolean;
  strap?: boolean;
  kneePads?: boolean;
  coatSkirt?: boolean;
  highCollar?: boolean;
  vest?: boolean;
  shoulderPanels?: boolean;
  backModule?: boolean;
  // Vehicle-DNA pieces (Afterburn City)
  shoulderFairings?: boolean; // aero shells swept like a bike fairing
  ledStrip?: boolean; // light bar chest → shoulder
  backHelmet?: boolean; // full-face helmet clipped on the back
  asymShoulder?: boolean; // one oversized cut-fender pauldron
  scrapPanels?: boolean; // asymmetric salvaged armor plates
  beltGauge?: boolean; // round speedometer display on the belt
  neckRing?: boolean; // magnetic-field ring around the neck
  wristRings?: boolean; // paired rings at the wrists
  sensoryCrown?: boolean; // low sensory hood/crown band
  glowSeam?: boolean; // energy seam running down the torso
}

export type EmblemGlyph = 'chevron' | 'jaw' | 'gauge' | 'halo';

export interface RosterEntry {
  name: string;
  title: string;
}

export interface FactionConfig {
  id: string;
  name: string;
  belief: string;
  traits: [string, string, string];
  personality: string;
  /** Champion figurine (roster[0]) + supporting cast for future expansion. */
  roster: RosterEntry[];
  /** UI + rim-light accent. */
  accentColor: number;
  palettes: [Palette, Palette, Palette];
  /** Locked faction silhouette — never editable by the user. */
  silhouette: SilhouetteSpec;
  accents: [AccentOption, AccentOption, AccentOption];
  emblem: EmblemGlyph;
}

export const FACTIONS: FactionConfig[] = [
  {
    id: 'red-shift',
    name: 'RED//SHIFT',
    belief: 'Speed is freedom. The city can’t fence what it can’t catch.',
    traits: ['Free-spirited', 'Quick', 'Loyal'],
    personality: 'Street riders running data through locked-down districts.',
    roster: [
      { name: 'Rex', title: 'Road Captain' },
      { name: 'Kira', title: 'Signal Runner' },
    ],
    accentColor: 0xd8402c,
    palettes: [
      { id: 'signal-run', label: 'Signal Run', primary: 0xc2261f, secondary: 0x26282d, accent: 0xf2eee0 },
      { id: 'ivory-lap', label: 'Ivory Lap', primary: 0xe9e2d2, secondary: 0xc2261f, accent: 0x26282d },
      { id: 'night-circuit', label: 'Night Circuit', primary: 0x26282d, secondary: 0xc2261f, accent: 0xf2eee0 },
    ],
    silhouette: { shoulderFairings: true, ledStrip: true, kneePads: true, backHelmet: true },
    accents: [
      { id: 'courier-pack', label: 'Courier pack', kind: 'satchel' },
      { id: 'racing-belt', label: 'Racing belt', kind: 'belt' },
      { id: 'rider-scarf', label: 'Rider scarf', kind: 'scarf' },
    ],
    emblem: 'chevron',
  },
  {
    id: 'razorpack',
    name: 'RAZORPACK',
    belief: 'Everything broken belongs to us.',
    traits: ['Feral', 'Resourceful', 'Loud'],
    personality: 'Scavenger riders who weld crash wreckage into armor.',
    roster: [
      { name: 'Grind', title: 'Pack Alpha' },
      { name: 'Hex', title: 'Crash Mechanic' },
    ],
    accentColor: 0xc9d426,
    palettes: [
      { id: 'acid-rush', label: 'Acid Rush', primary: 0x1f2023, secondary: 0xc9d426, accent: 0xc26a1f },
      { id: 'rust-heap', label: 'Rust Heap', primary: 0x8a4a1c, secondary: 0x1f2023, accent: 0xc9d426 },
      { id: 'hazard-line', label: 'Hazard Line', primary: 0xb9c322, secondary: 0x1f2023, accent: 0x8a4a1c },
    ],
    silhouette: { asymShoulder: true, scrapPanels: true, kneePads: true },
    accents: [
      { id: 'scrap-pouch', label: 'Scrap pouch', kind: 'satchel' },
      { id: 'weld-cuffs', label: 'Weld cuffs', kind: 'cuffs' },
      { id: 'ear-guards', label: 'Ear guards', kind: 'headPods' },
    ],
    emblem: 'jaw',
  },
  {
    id: 'ward-9',
    name: 'WARD-9',
    belief: 'Order is a service. We deliver it on time.',
    traits: ['Cold', 'Precise', 'Relentless'],
    personality: 'Contracted urban control and tech-retrieval unit.',
    roster: [
      { name: 'Vale', title: 'Retrieval Commander' },
      { name: 'Unit K-6', title: 'Pursuit Officer' },
    ],
    accentColor: 0xb32020,
    palettes: [
      { id: 'ceramic-order', label: 'Ceramic Order', primary: 0xe3e6e8, secondary: 0x3a3f45, accent: 0xb32020 },
      { id: 'graphite-watch', label: 'Graphite Watch', primary: 0x3a3f45, secondary: 0xe3e6e8, accent: 0xb32020 },
      { id: 'gunmetal-silent', label: 'Gunmetal Silent', primary: 0x596068, secondary: 0xe3e6e8, accent: 0xdde3ea },
    ],
    silhouette: { coatSkirt: true, highCollar: true, shoulderPanels: true, beltGauge: true },
    accents: [
      { id: 'sensor-collar', label: 'Sensor collar', kind: 'collarTrim' },
      { id: 'hard-cape', label: 'Hard half-cape', kind: 'shoulderDrape' },
      { id: 'utility-rig', label: 'Utility rig', kind: 'belt' },
    ],
    emblem: 'gauge',
  },
  {
    id: 'null-choir',
    name: 'NULL CHOIR',
    belief: 'The city hums. We simply listen.',
    traits: ['Serene', 'Uncanny', 'Attuned'],
    personality: 'Survivors of a neural program, tuned to an invisible frequency.',
    roster: [
      { name: 'Iona', title: 'Frequency Seer' },
      { name: 'Echo', title: 'Resonance Subject' },
    ],
    accentColor: 0x9c8fd6,
    palettes: [
      { id: 'bone-hymn', label: 'Bone Hymn', primary: 0xe8e4da, secondary: 0xb7a6d9, accent: 0x79dfe0 },
      { id: 'lavender-drift', label: 'Lavender Drift', primary: 0xb7a6d9, secondary: 0xe8e4da, accent: 0x79dfe0 },
      { id: 'liquid-chrome', label: 'Liquid Chrome', primary: 0xaeb6bf, secondary: 0xe8e4da, accent: 0xb7a6d9 },
    ],
    silhouette: { neckRing: true, wristRings: true, sensoryCrown: true, glowSeam: true },
    accents: [
      { id: 'resonance-ring', label: 'Resonance ring', kind: 'collarTrim' },
      { id: 'containment-cuffs', label: 'Containment cuffs', kind: 'cuffs' },
      { id: 'sensory-pods', label: 'Sensory pods', kind: 'headPods' },
    ],
    emblem: 'halo',
  },
];

export function factionById(id: string): FactionConfig {
  const f = FACTIONS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown faction: ${id}`);
  return f;
}
