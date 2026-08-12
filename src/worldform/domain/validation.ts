import type {
  MateAttachmentSystem,
  ManufacturingProfile,
  SignatureAssetDefinition,
  UserIdentity,
  WorldArchetype,
  WorldPack,
  WorldformBuild,
} from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function nonEmpty(values: readonly string[]): boolean {
  return values.length > 0 && values.every((value) => value.trim().length > 0);
}

function optionalPositive(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0);
}

export function validateMateAttachmentSystem(system: MateAttachmentSystem): ValidationResult {
  const errors: string[] = [];
  if (!system.id.trim()) errors.push('attachment system id is required');
  if (!SEMVER_RE.test(system.version)) errors.push('attachment system version must be semver');
  const connectorIds = new Set<string>();
  for (const connector of system.connectors) {
    if (!connector.id.trim() || connectorIds.has(connector.id)) {
      errors.push(`invalid attachment connector id: ${connector.id}`);
    }
    connectorIds.add(connector.id);
    if (!optionalPositive(connector.nominalDiameterMm)) {
      errors.push(`connector ${connector.id} diameter must be positive or null`);
    }
    if (!connector.orientationKeyRequired) {
      errors.push(`connector ${connector.id} must define an orientation key`);
    }
  }
  const portIds = new Set<string>();
  for (const port of system.ports) {
    if (portIds.has(port.id)) errors.push(`duplicate attachment port: ${port.id}`);
    portIds.add(port.id);
    if (!connectorIds.has(port.connectorId)) {
      errors.push(`port ${port.id} references an unknown connector`);
    }
    if (!port.purpose.trim()) errors.push(`port ${port.id} needs a purpose`);
  }
  const headPort = system.ports.find((port) => port.id === 'head_dock');
  const headConnector = system.connectors.find(
    (connector) => connector.id === headPort?.connectorId
  );
  if (!headPort || headConnector?.method !== 'magnetic_keyed') {
    errors.push('head_dock must use a keyed magnetic connector');
  }
  if (!system.connectors.some((connector) => connector.method === 'mechanical_keyed_peg')) {
    errors.push('MAS requires a mechanical keyed asset connector');
  }
  return { ok: errors.length === 0, errors };
}

function validateSignatureAsset(
  asset: SignatureAssetDefinition,
  archetype: WorldArchetype,
  system: MateAttachmentSystem,
  label: string
): string[] {
  const errors: string[] = [];
  if (!asset.id.trim() || !asset.name.trim()) errors.push(`${label} identity is required`);
  if (!asset.loreFunction.trim()) errors.push(`${label} needs a lore function`);
  if (!asset.silhouetteCue.trim()) errors.push(`${label} needs a silhouette cue`);
  if (!asset.portIds.length) errors.push(`${label} must attach to at least one hardpoint`);
  for (const portId of asset.portIds) {
    const port = system.ports.find((candidate) => candidate.id === portId);
    const bodyPort = archetype.worldBody.hardpoints.find(
      (candidate) => candidate.portId === portId
    );
    if (!port) errors.push(`${label} references unknown port ${portId}`);
    if (!bodyPort || bodyPort.availability !== 'active') {
      errors.push(`${label} requires inactive body port ${portId}`);
    }
    if (port && !port.allowedSignatureTypes.includes(asset.type)) {
      errors.push(`${label} type ${asset.type} is incompatible with ${portId}`);
    }
    if (port?.connectorId !== asset.connectorId || bodyPort?.connectorId !== asset.connectorId) {
      errors.push(`${label} connector does not match ${portId}`);
    }
  }
  return errors;
}

export function validateModularArchetype(
  archetype: WorldArchetype,
  system: MateAttachmentSystem
): ValidationResult {
  const errors: string[] = [];
  const body = archetype.worldBody;
  const kit = archetype.signatureKit;
  if (!body.id.trim() || !body.name.trim()) errors.push('World Body identity is required');
  if (!nonEmpty(body.outfit.required) || !nonEmpty(body.silhouette)) {
    errors.push('World Body needs silhouette and required outfit rules');
  }
  const bodyPortIds = new Set(body.hardpoints.map((hardpoint) => hardpoint.portId));
  if (bodyPortIds.size !== body.hardpoints.length) errors.push('World Body hardpoints must be unique');
  for (const systemPort of system.ports) {
    if (!bodyPortIds.has(systemPort.id)) {
      errors.push(`World Body is missing standard hardpoint geometry ${systemPort.id}`);
    }
  }
  for (const hardpoint of body.hardpoints) {
    const systemPort = system.ports.find((port) => port.id === hardpoint.portId);
    if (!systemPort || systemPort.connectorId !== hardpoint.connectorId) {
      errors.push(`World Body hardpoint ${hardpoint.portId} does not match MAS`);
    }
    if (!hardpoint.concealmentRule.trim()) {
      errors.push(`World Body hardpoint ${hardpoint.portId} needs a concealment rule`);
    }
  }
  const headDock = body.hardpoints.find((hardpoint) => hardpoint.portId === 'head_dock');
  if (!headDock || headDock.availability !== 'active') {
    errors.push('World Body requires an active head_dock');
  }
  if (!body.standaloneWithoutSignature) {
    errors.push('World Body must read as complete without the Signature Kit');
  }
  if (!kit.id.trim() || !kit.name.trim()) errors.push('Signature Kit identity is required');
  if (!kit.compatibleWorldBodyIds.includes(body.id)) {
    errors.push('Signature Kit must declare its compatible World Body');
  }
  errors.push(...validateSignatureAsset(kit.hero, archetype, system, 'hero Signature Asset'));
  if (kit.secondaryAccent) {
    errors.push(
      ...validateSignatureAsset(kit.secondaryAccent, archetype, system, 'secondary accent')
    );
  }
  return { ok: errors.length === 0, errors };
}

export function validateWorldPack(pack: WorldPack): ValidationResult {
  const errors: string[] = [];
  if (!pack.worldId.trim()) errors.push('world_id is required');
  if (!SEMVER_RE.test(pack.version)) errors.push('world version must be semver');
  if (!pack.displayName.trim()) errors.push('display_name is required');
  if (!nonEmpty(pack.visualIdentity.genre)) errors.push('visual identity genre is required');
  if (!nonEmpty(pack.visualIdentity.renderStyle)) errors.push('render style is required');
  if (!nonEmpty(pack.visualIdentity.negativeStyle)) errors.push('negative style rules are required');
  if (!nonEmpty(pack.baseGrammar.motifs)) errors.push('base grammar motifs are required');
  if (!nonEmpty(pack.baseGrammar.forbidden)) errors.push('base grammar forbidden rules are required');
  errors.push(...validateMateAttachmentSystem(pack.attachmentSystem).errors);
  if (pack.archetypes.length < 4 || pack.archetypes.length > 8) {
    errors.push('a World Pack must define 4-8 archetypes');
  }
  const ids = new Set<string>();
  for (const archetype of pack.archetypes) {
    if (!archetype.id.trim() || ids.has(archetype.id)) errors.push(`invalid archetype id: ${archetype.id}`);
    ids.add(archetype.id);
    if (!archetype.name.trim() || !archetype.fantasy.trim()) {
      errors.push(`archetype ${archetype.id} needs a name and fantasy`);
    }
    if (!archetype.prototypeCharacterId.trim()) {
      errors.push(`archetype ${archetype.id} needs a prototype character`);
    }
    errors.push(
      ...validateModularArchetype(archetype, pack.attachmentSystem).errors.map(
        (error) => `archetype ${archetype.id}: ${error}`
      )
    );
  }
  return { ok: errors.length === 0, errors };
}

export function validateManufacturingProfile(profile: ManufacturingProfile): ValidationResult {
  const errors: string[] = [];
  if (!profile.id.trim() || !profile.name.trim()) errors.push('manufacturing profile identity is required');
  if (!(profile.base.diameterMm > 0) || profile.base.diameterToleranceMm < 0) {
    errors.push('base dimensions must be positive');
  }
  if (!(profile.height.minMm > 0) || profile.height.maxMm < profile.height.minMm) {
    errors.push('height range is invalid');
  }
  for (const [key, value] of Object.entries(profile.geometry)) {
    if (!optionalPositive(value)) errors.push(`${key} must be positive or null`);
  }
  if (!optionalPositive(profile.assembly.maxPartCount)) {
    errors.push('maxPartCount must be positive or null');
  }
  if (!optionalPositive(profile.assembly.connectorToleranceMm)) {
    errors.push('connectorToleranceMm must be positive or null');
  }
  if (
    profile.assembly.validatedAttachmentSystemVersion !== null &&
    !SEMVER_RE.test(profile.assembly.validatedAttachmentSystemVersion)
  ) {
    errors.push('validated attachment system version must be semver or null');
  }
  return { ok: errors.length === 0, errors };
}

export function validateUserIdentity(identity: UserIdentity): ValidationResult {
  const errors: string[] = [];
  if (!identity.photo.fileName.trim() || !DATA_IMAGE_RE.test(identity.photo.dataUri)) {
    errors.push('a supported identity photo is required');
  }
  if (!identity.desiredSelf.description.trim()) errors.push('desired-self description is required');
  if (identity.desiredSelf.feelings.length < 1 || identity.desiredSelf.feelings.length > 3) {
    errors.push('choose between one and three desired feelings');
  }
  if (new Set(identity.desiredSelf.feelings).size !== identity.desiredSelf.feelings.length) {
    errors.push('desired feelings must be unique');
  }
  return { ok: errors.length === 0, errors };
}

export function validateWorldformBuild(build: WorldformBuild): ValidationResult {
  const errors: string[] = [];
  if (!build.id.trim()) errors.push('build id is required');
  if (!build.worldPackId.trim() || !build.worldPackVersion.trim()) errors.push('world version is required');
  if (!build.manufacturingProfileId.trim()) errors.push('manufacturing profile is required');
  if (build.frontPreviewLimit < 1) errors.push('front preview limit must be positive');
  if (build.successfulFrontPreviews > build.frontPreviewLimit) errors.push('front preview quota exceeded');
  const revisionIds = new Set(build.revisions.map((revision) => revision.id));
  if (revisionIds.size !== build.revisions.length) errors.push('revision ids must be unique');
  if (build.selectedRevisionId && !revisionIds.has(build.selectedRevisionId)) {
    errors.push('selected revision does not exist');
  }
  return { ok: errors.length === 0, errors };
}

export function assertValid(result: ValidationResult, label: string): void {
  if (!result.ok) throw new Error(`${label}: ${result.errors.join('; ')}`);
}
