// Character roster — two per faction, ordered as they stand in the studio.
// modelUrl points at an optimized GLB in public/assets; when a file is
// missing (Kira's model has not been provided yet) the app falls back to the
// clearly-labeled procedural proxy and upgrades automatically once the file
// exists.

export interface CharacterConfig {
  id: string;
  name: string;
  title: string;
  factionId: string;
  bio: string;
  modelUrl: string;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    id: 'rex',
    name: 'REX',
    title: 'Road Captain',
    factionId: 'red-shift',
    bio: 'Leads every convoy from the front, helmet on his hip, route in his head.',
    modelUrl: 'assets/champion-rex.glb',
  },
  {
    id: 'vexa',
    name: 'VEXA',
    title: 'Signal Runner',
    factionId: 'red-shift',
    bio: 'Scouts the locked districts and marks the gaps before anyone else moves.',
    modelUrl: 'assets/champion-vexa.glb',
  },
  {
    id: 'grind',
    name: 'GRIND',
    title: 'Pack Alpha',
    factionId: 'razorpack',
    bio: 'Wears a wrecked hauler as armor and calls it a fair trade.',
    modelUrl: 'assets/champion-grind.glb',
  },
  {
    id: 'hex',
    name: 'HEX',
    title: 'Crash Mechanic',
    factionId: 'razorpack',
    bio: 'Can rebuild a burned-out drivetrain in the dark, mid-argument.',
    modelUrl: 'assets/extra-hex.glb',
  },
  {
    id: 'vale',
    name: 'VALE',
    title: 'Retrieval Commander',
    factionId: 'ward-9',
    bio: 'Closes incidents before the news vans arrive. Every time.',
    modelUrl: 'assets/champion-vale.glb',
  },
  {
    id: 'k6',
    name: 'UNIT K-6',
    title: 'Pursuit Officer',
    factionId: 'ward-9',
    bio: 'Built for the chase. Files the paperwork anyway.',
    modelUrl: 'assets/extra-k6.glb',
  },
  {
    id: 'iona',
    name: 'IONA',
    title: 'Frequency Seer',
    factionId: 'null-choir',
    bio: 'Hears the city breathing under the traffic and writes it down.',
    modelUrl: 'assets/champion-iona.glb',
  },
  {
    id: 'echo',
    name: 'ECHO',
    title: 'Resonance Subject',
    factionId: 'null-choir',
    bio: 'The experiment ended. The signal never did.',
    modelUrl: 'assets/extra-echo.glb',
  },
];

export function characterById(id: string): CharacterConfig {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
}

export function characterIndex(id: string): number {
  return Math.max(0, CHARACTERS.findIndex((x) => x.id === id));
}
