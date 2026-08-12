import type {
  ManufacturingProfile,
  MateAttachmentSystem,
  MateFormStandard,
  WorldPack,
} from './types';

export const MATE_FORM_STANDARD_V01: MateFormStandard = {
  id: 'heymate-anime-figurine',
  version: '0.1.0',
  baseDiameterTargetMm: 50,
  totalHeightMm: { min: 100, max: 150 },
  formLanguage: [
    'stylized anime collectible proportions',
    'slightly oversized head',
    'simplified hands',
    'strong readable silhouette',
    'sculpted hair volumes instead of individual strands',
  ],
  structuralRules: [
    'integrated base inside the approved footprint',
    'no unsupported floating details',
    'props and effects connect to the character or base',
    'ornament is exaggerated enough to survive scale reduction',
  ],
  identityArchitecture: {
    faceMeaning: 'who I am',
    hairMeaning: 'identity adapted within bounded world grammar',
    bodyMeaning: 'who I become in this world',
    signatureMeaning: 'which universe I belong to',
    headPortableAcrossWorlds: true,
  },
};

/**
 * MAS v1 freezes the logical ecosystem, not factory fit. The 3 mm accessory
 * peg is deliberately marked as an engineering hypothesis until resin and
 * tolerance tests promote it to factory_validated.
 */
export const MATE_ATTACHMENT_SYSTEM_V1: MateAttachmentSystem = {
  id: 'mate-attachment-system',
  version: '1.0.0',
  connectors: [
    {
      id: 'mas-v1-head-magnetic-key',
      method: 'magnetic_keyed',
      nominalDiameterMm: null,
      orientationKeyRequired: true,
      productionStatus: 'engineering_hypothesis',
    },
    {
      id: 'mas-v1-asset-keyed-peg',
      method: 'mechanical_keyed_peg',
      nominalDiameterMm: 3,
      orientationKeyRequired: true,
      productionStatus: 'engineering_hypothesis',
    },
  ],
  ports: [
    {
      id: 'head_dock',
      connectorId: 'mas-v1-head-magnetic-key',
      allowedSignatureTypes: [],
      purpose: 'portable custom head identity',
    },
    {
      id: 'back_port',
      connectorId: 'mas-v1-asset-keyed-peg',
      allowedSignatureTypes: ['back_rig', 'wearable', 'vfx', 'companion'],
      purpose: 'rig, wing, supported VFX, or companion support',
    },
    {
      id: 'hand_left_port',
      connectorId: 'mas-v1-asset-keyed-peg',
      allowedSignatureTypes: ['weapon', 'relic', 'wearable'],
      purpose: 'left grip accessory',
    },
    {
      id: 'hand_right_port',
      connectorId: 'mas-v1-asset-keyed-peg',
      allowedSignatureTypes: ['weapon', 'relic', 'wearable'],
      purpose: 'right grip accessory',
    },
    {
      id: 'waist_port',
      connectorId: 'mas-v1-asset-keyed-peg',
      allowedSignatureTypes: ['relic', 'wearable'],
      purpose: 'small supported accessory',
    },
    {
      id: 'base_port',
      connectorId: 'mas-v1-asset-keyed-peg',
      allowedSignatureTypes: ['vfx', 'terrain', 'companion'],
      purpose: 'effect, terrain, or companion anchor',
    },
  ],
  rules: {
    maxHeroSignatureAssets: 1,
    maxSecondaryAccents: 1,
    detachedBodyMustReadComplete: true,
    assetMagnetsAllowed: false,
  },
};

const HEAD_DOCK = {
  portId: 'head_dock' as const,
  connectorId: 'mas-v1-head-magnetic-key',
  availability: 'active' as const,
  concealmentRule: 'hide the keyed magnetic dock inside the collar and hair volume',
};

function assetPort(
  portId: 'back_port' | 'hand_left_port' | 'hand_right_port' | 'waist_port' | 'base_port',
  availability: 'active' | 'reserved' = 'reserved'
) {
  return {
    portId,
    connectorId: 'mas-v1-asset-keyed-peg',
    availability,
    concealmentRule:
      availability === 'active'
        ? 'integrate the keyed interface into costume geometry without exposing a toy-like hole'
        : 'preserve the standard geometry under a removable or sculpted cover',
  };
}

export const AFTERBURN_WORLD_PACK_V1: WorldPack = {
  worldId: 'afterburn-city',
  version: '1.1.0',
  displayName: 'Afterburn City',
  rights: {
    status: 'original',
    // This repository is still a prototype. Production export stays closed
    // until K explicitly validates the commercial and manufacturing path.
    commercialUse: false,
  },
  visualIdentity: {
    genre: ['post-collapse motor city', 'street-machine mythology', 'neon industrial future'],
    renderStyle: [
      'premium stylized anime collectible figurine',
      'designed sculptural masses',
      'physical product photography on a neutral studio background',
    ],
    materials: [
      'glossy vehicle enamel',
      'worn leather',
      'scuffed metal',
      'rubber',
      'emissive signal strips',
    ],
    negativeStyle: [
      'photorealistic human cosplay',
      'generic cyberpunk streetwear',
      'floating effects',
      'thin hair strands',
      'character sheet',
    ],
  },
  baseGrammar: {
    motifs: ['road markings', 'machined rings', 'heat vents', 'signal chevrons'],
    forbidden: ['printed logo', 'text plaque', 'floating landscape', 'detached VFX'],
  },
  attachmentSystem: MATE_ATTACHMENT_SYSTEM_V1,
  archetypes: [
    {
      id: 'signal-runner',
      name: 'Signal Runner',
      fantasy: 'A fast, independent courier who finds routes through a city designed to stop them.',
      rationale: 'You protect people by staying mobile, reading the road, and choosing your own route.',
      prototypeCharacterId: 'rex',
      worldBody: {
        id: 'afterburn-signal-runner-body-v1',
        name: 'Signal Runner World Body',
        silhouette: ['aero shoulder fairings', 'rider layers', 'forward lean'],
        pose: { family: 'ready-launch', stance: 'relaxed but ready to move', symmetry: 'slightly-asymmetric' },
        outfit: {
          required: ['rider jacket', 'signal strip', 'road boots'],
          optional: ['racing belt', 'rider scarf'],
        },
        hardpoints: [HEAD_DOCK, assetPort('back_port', 'active'), assetPort('hand_left_port'), assetPort('hand_right_port'), assetPort('waist_port'), assetPort('base_port', 'active')],
        standaloneWithoutSignature: true,
      },
      signatureKit: {
        id: 'signal-route-rig-kit-v1',
        name: 'Route Beacon Rig',
        hero: {
          id: 'route-beacon-rig',
          name: 'Route Beacon Rig',
          type: 'back_rig',
          loreFunction: 'maps a safe route through hostile road signals',
          silhouetteCue: 'one compact asymmetric beacon mast rising behind the shoulder',
          portIds: ['back_port'],
          connectorId: 'mas-v1-asset-keyed-peg',
          variants: ['signal puck array', 'folded route scanner'],
        },
        secondaryAccent: {
          id: 'signal-trail-accent',
          name: 'Signal Trail',
          type: 'vfx',
          loreFunction: 'marks the route already secured by the runner',
          silhouetteCue: 'one low trail anchored directly to the base',
          portIds: ['base_port'],
          connectorId: 'mas-v1-asset-keyed-peg',
          variants: ['road dust', 'signal chevrons'],
        },
        compatibleWorldBodyIds: ['afterburn-signal-runner-body-v1'],
      },
      recognitionKeywords: ['free', 'fast', 'independent', 'protect', 'wander', 'runner', 'courier'],
      feelingAffinity: ['free', 'fearless', 'wild'],
    },
    {
      id: 'salvage-smith',
      name: 'Salvage Smith',
      fantasy: 'A resourceful maker who turns the city’s discarded machines into a second chance.',
      rationale: 'You meet damage with invention and would rather rebuild the rules than obey them.',
      prototypeCharacterId: 'grind',
      worldBody: {
        id: 'afterburn-salvage-smith-body-v1',
        name: 'Salvage Smith World Body',
        silhouette: ['asymmetric scrap armour', 'tool belt', 'broad grounded stance'],
        pose: { family: 'grounded-maker', stance: 'stable and hands-ready', symmetry: 'asymmetric' },
        outfit: {
          required: ['welded panels', 'work layers', 'protective boots'],
          optional: ['scrap pouch', 'weld cuffs', 'ear guards'],
        },
        hardpoints: [HEAD_DOCK, assetPort('back_port'), assetPort('hand_left_port'), assetPort('hand_right_port', 'active'), assetPort('waist_port', 'active'), assetPort('base_port')],
        standaloneWithoutSignature: true,
      },
      signatureKit: {
        id: 'salvage-torque-tool-kit-v1',
        name: 'Torque Forge Tool',
        hero: {
          id: 'torque-forge-tool',
          name: 'Torque Forge Tool',
          type: 'relic',
          loreFunction: 'rebuilds dead machine parts into usable city infrastructure',
          silhouetteCue: 'one oversized folding tool held low beside the body',
          portIds: ['hand_right_port'],
          connectorId: 'mas-v1-asset-keyed-peg',
          variants: ['torque driver', 'folding diagnostic arm'],
        },
        secondaryAccent: {
          id: 'salvage-pouch-accent',
          name: 'Salvage Pouch',
          type: 'wearable',
          loreFunction: 'carries the last reusable components recovered from the street',
          silhouetteCue: 'one compact pouch attached at the hip',
          portIds: ['waist_port'],
          connectorId: 'mas-v1-asset-keyed-peg',
          variants: ['scrap pouch', 'diagnostic capsule'],
        },
        compatibleWorldBodyIds: ['afterburn-salvage-smith-body-v1'],
      },
      recognitionKeywords: ['build', 'fix', 'maker', 'invent', 'resourceful', 'repair', 'wild'],
      feelingAffinity: ['powerful', 'wild', 'unpredictable'],
    },
    {
      id: 'recovery-officer',
      name: 'Recovery Officer',
      fantasy: 'A precise urban guardian who restores order without becoming another machine.',
      rationale: 'You want enough control to protect what matters, with discipline rather than spectacle.',
      prototypeCharacterId: 'vale',
      worldBody: {
        id: 'afterburn-recovery-officer-body-v1',
        name: 'Recovery Officer World Body',
        silhouette: ['structured coat', 'high collar', 'gauge belt', 'controlled vertical lines'],
        pose: { family: 'measured-guard', stance: 'upright and deliberate', symmetry: 'slightly-asymmetric' },
        outfit: {
          required: ['recovery coat', 'sensor collar', 'contract rig'],
          optional: ['hard cape', 'utility belt', 'shoulder panel'],
        },
        hardpoints: [HEAD_DOCK, assetPort('back_port'), assetPort('hand_left_port', 'active'), assetPort('hand_right_port'), assetPort('waist_port'), assetPort('base_port')],
        standaloneWithoutSignature: true,
      },
      signatureKit: {
        id: 'recovery-scanner-kit-v1',
        name: 'Recovery Scanner',
        hero: {
          id: 'recovery-scanner',
          name: 'Recovery Scanner',
          type: 'relic',
          loreFunction: 'reads damage contracts and marks what can still be recovered',
          silhouetteCue: 'one broad scanner plate extending from the left hand',
          portIds: ['hand_left_port'],
          connectorId: 'mas-v1-asset-keyed-peg',
          variants: ['contract scanner', 'evidence capsule'],
        },
        secondaryAccent: null,
        compatibleWorldBodyIds: ['afterburn-recovery-officer-body-v1'],
      },
      recognitionKeywords: ['order', 'protect', 'precise', 'control', 'guardian', 'calm', 'disciplined'],
      feelingAffinity: ['powerful', 'protected', 'calm', 'elegant'],
    },
    {
      id: 'resonance-listener',
      name: 'Resonance Listener',
      fantasy: 'A quiet observer tuned to signals the rest of the city cannot hear.',
      rationale: 'You lead through attention: noticing hidden patterns before anyone else knows they matter.',
      prototypeCharacterId: 'iona',
      worldBody: {
        id: 'afterburn-resonance-listener-body-v1',
        name: 'Resonance Listener World Body',
        silhouette: ['sensory crown', 'neck ring', 'long clean torso seam'],
        pose: { family: 'attentive-stillness', stance: 'calm with one listening gesture', symmetry: 'slightly-asymmetric' },
        outfit: {
          required: ['resonance suit', 'sensory crown', 'integrated glow seam'],
          optional: ['containment cuffs', 'signal pods'],
        },
        hardpoints: [HEAD_DOCK, assetPort('back_port', 'active'), assetPort('hand_left_port'), assetPort('hand_right_port'), assetPort('waist_port'), assetPort('base_port', 'active')],
        standaloneWithoutSignature: true,
      },
      signatureKit: {
        id: 'resonance-halo-kit-v1',
        name: 'Resonance Halo',
        hero: {
          id: 'resonance-halo',
          name: 'Resonance Halo',
          type: 'vfx',
          loreFunction: 'makes hidden machine frequencies visible and readable',
          silhouetteCue: 'one restrained arc linking the back support to the base',
          portIds: ['back_port', 'base_port'],
          connectorId: 'mas-v1-asset-keyed-peg',
          variants: ['signal lens arc', 'memory resonator arc'],
        },
        secondaryAccent: null,
        compatibleWorldBodyIds: ['afterburn-resonance-listener-body-v1'],
      },
      recognitionKeywords: ['mysterious', 'observe', 'listen', 'scholar', 'pattern', 'quiet', 'strange'],
      feelingAffinity: ['mysterious', 'calm', 'elegant', 'unpredictable'],
    },
  ],
};

export const RESIN_FACTORY_DRAFT_V1: ManufacturingProfile = {
  id: 'resin_factory_cn_v1',
  name: 'China Resin Figurine v1',
  base: { diameterMm: 50, diameterToleranceMm: 2 },
  height: { minMm: 100, maxMm: 150 },
  geometry: {
    minSupportedThicknessMm: null,
    minUnsupportedThicknessMm: null,
    minDetailMm: null,
    minWireDiameterMm: null,
    maxDisconnectedParts: null,
  },
  assembly: {
    maxPartCount: null,
    allowedDetachedAccessories: true,
    validatedAttachmentSystemVersion: null,
    connectorToleranceMm: null,
  },
  status: 'draft_factory_validation',
};
