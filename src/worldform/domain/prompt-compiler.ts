import type {
  ConceptView,
  ManufacturingProfile,
  MateFormStandard,
  UserIdentity,
  WorldArchetype,
  WorldPack,
} from './types';

export const WORLDFORM_PROMPT_VERSION = 'worldform-prompt-v0.2.0-mas-v1';

export interface PromptCompilerInput {
  mateForm: MateFormStandard;
  worldPack: WorldPack;
  archetype: WorldArchetype;
  identity: UserIdentity;
  manufacturing: ManufacturingProfile;
  view: ConceptView;
}

export interface GenerationPrompt {
  version: string;
  view: ConceptView;
  text: string;
}

function viewContract(view: ConceptView): string[] {
  if (view === 'front') {
    return [
      'Create exactly one straight front or near-front hero view.',
      'Show the entire figurine, its entire silhouette, and the entire integrated base.',
      'Use a neutral studio background. No text, UI, graphic layout, collage, or character sheet.',
    ];
  }
  return [
    `Create exactly one ${view} camera view of the approved front figurine.`,
    'The approved front reference is the canonical design source.',
    'Preserve exactly the same face, head, hair, World Body proportions, outfit, hidden attachment interfaces, Signature Kit, base, effects, and palette. Only the camera angle changes.',
    'No text, UI, graphic layout, collage, turnaround sheet, or second character.',
  ];
}

export function compileWorldformPrompt(input: PromptCompilerInput): GenerationPrompt {
  const { mateForm, worldPack, archetype, identity, manufacturing, view } = input;
  const { worldBody, signatureKit } = archetype;
  const assetConnector = worldPack.attachmentSystem.connectors.find(
    (connector) => connector.id === signatureKit.hero.connectorId
  );
  const assetConnectorDiameterMm = assetConnector?.nominalDiameterMm ?? null;
  const recognition = [
    ...identity.appearance.recognitionCues,
    identity.appearance.hair ? `hair: ${identity.appearance.hair}` : '',
    identity.appearance.eyewear ? `eyewear: ${identity.appearance.eyewear}` : '',
    identity.appearance.facialHair ? `facial hair: ${identity.appearance.facialHair}` : '',
  ].filter(Boolean);

  const blocks = [
    '[OUTPUT CONTRACT]',
    ...viewContract(view),
    '',
    '[MATE FORM]',
    ...mateForm.formLanguage.map((rule) => `- ${rule}`),
    ...mateForm.structuralRules.map((rule) => `- ${rule}`),
    '',
    '[WORLD VISUAL DNA]',
    `World: ${worldPack.displayName}.`,
    `Genre: ${worldPack.visualIdentity.genre.join(', ')}.`,
    `Render style: ${worldPack.visualIdentity.renderStyle.join(', ')}.`,
    `Materials: ${worldPack.visualIdentity.materials.join(', ')}.`,
    `Base motifs: ${worldPack.baseGrammar.motifs.join(', ')}.`,
    '',
    '[ARCHETYPE]',
    `${archetype.name}: ${archetype.fantasy}`,
    `World Body: ${worldBody.name}.`,
    `Silhouette: ${worldBody.silhouette.join(', ')}.`,
    `Pose: ${worldBody.pose.stance}; ${worldBody.pose.symmetry}.`,
    `Required outfit: ${worldBody.outfit.required.join(', ')}.`,
    '',
    '[PRODUCT ARCHITECTURE]',
    `FACE = ${mateForm.identityArchitecture.faceMeaning}. Preserve the visitor's recognisable face identity.`,
    `HAIR = ${mateForm.identityArchitecture.hairMeaning}. Adapt it without erasing recognition cues.`,
    `BODY = ${mateForm.identityArchitecture.bodyMeaning}. Use the selected World Body preset rather than inventing a new body system.`,
    `SIGNATURE ASSET = ${mateForm.identityArchitecture.signatureMeaning}.`,
    `The custom head must remain portable through ${worldPack.attachmentSystem.id} v${worldPack.attachmentSystem.version}.`,
    '',
    '[SIGNATURE KIT]',
    `Create exactly one hero Signature Asset: ${signatureKit.hero.name} (${signatureKit.hero.type}).`,
    `Lore function: ${signatureKit.hero.loreFunction}.`,
    `Silhouette cue: ${signatureKit.hero.silhouetteCue}.`,
    `Attach it only through ${signatureKit.hero.portIds.join(' + ')} using ${assetConnector?.method ?? signatureKit.hero.connectorId}.`,
    signatureKit.secondaryAccent
      ? `Allow at most one restrained secondary accent: ${signatureKit.secondaryAccent.name} (${signatureKit.secondaryAccent.type}), attached through ${signatureKit.secondaryAccent.portIds.join(' + ')}.`
      : 'Do not add a secondary accent.',
    'Do not add any other weapon, effect, companion, relic, rig, wearable, or terrain module.',
    'When the Signature Kit is removed, the World Body must still look intentionally complete.',
    '',
    '[MAS V1 ATTACHMENT RULES]',
    'Contain the standard Head Dock and body hardpoint geometry, but hide those interfaces inside the collar, costume, hand grip, or base design.',
    'The Head Dock uses a keyed magnetic concept; Signature Assets use mechanical keyed pegs, not magnets.',
    assetConnectorDiameterMm === null
      ? 'The asset connector diameter is not factory-defined. Do not invent it.'
      : `${assetConnectorDiameterMm} mm is an engineering prototype hypothesis for the asset peg, not a visually exposed production claim.`,
    'Do not show empty toy-like holes, exposed connector hardware, exploded parts, or assembly diagrams in the hero render.',
    '',
    '[USER IDENTITY]',
    `Desired self: ${identity.desiredSelf.description.trim()}.`,
    `Desired feeling: ${identity.desiredSelf.feelings.join(', ')}.`,
    `Preserve recognition cues: ${recognition.join(', ') || 'the supplied face and hair reference'}.`,
    'Do not preserve real-world clothing unless explicitly named as a recognition cue. The world transforms the clothing.',
    '',
    '[FIGURINE DESIGN LANGUAGE]',
    'Do not depict a realistic human wearing a costume.',
    'Transform the subject into a deliberately designed premium collectible figurine.',
    'Simplify realistic anatomy into stylized anime collectible proportions.',
    'Convert clothing into sculptural masses with exaggerated readable folds.',
    'Merge tiny decorative elements into stronger graphic shapes.',
    'Hair must read as designed sculpted volumes rather than individual strands.',
    'The Signature Kit must be physically supported by its declared MAS port or ports.',
    'The result must look like a manufactured character figure first, and a fictional character illustration second.',
    '',
    '[3D CONSTRAINTS]',
    `Design for a ${manufacturing.base.diameterMm} mm base target with ${manufacturing.base.diameterToleranceMm} mm tolerance.`,
    `Design for ${manufacturing.height.minMm}-${manufacturing.height.maxMm} mm total height including base and attached effects.`,
    'Do not invent unsupported wall, wire, detail thickness, peg fit, magnet, or connector tolerance values.',
    '',
    '[NEGATIVE]',
    ...[...worldPack.visualIdentity.negativeStyle, ...worldPack.baseGrammar.forbidden].map(
      (rule) => `- ${rule}`
    ),
  ];

  return { version: WORLDFORM_PROMPT_VERSION, view, text: blocks.join('\n') };
}
