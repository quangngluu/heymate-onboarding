import type {
  GeometryMetadata,
  MateAttachmentSystem,
  ManufacturingProfile,
  QCResult,
  WorldArchetype,
} from '../domain/types';
import { validateModularArchetype } from '../domain/validation';

export interface ModularityQCInput {
  attachmentSystem: MateAttachmentSystem;
  archetype: WorldArchetype;
}

export function assessGeometry(input: {
  id: string;
  revisionId: string;
  geometry: GeometryMetadata;
  profile: ManufacturingProfile;
  modularity?: ModularityQCInput;
  now?: number;
}): QCResult {
  const { geometry, profile } = input;
  const warnings: string[] = [];
  const hasDimensions = geometry.baseDiameterMm !== null && geometry.heightMm !== null;
  const dimensionsPass = hasDimensions
    ? Math.abs(geometry.baseDiameterMm! - profile.base.diameterMm) <= profile.base.diameterToleranceMm &&
      geometry.heightMm! >= profile.height.minMm &&
      geometry.heightMm! <= profile.height.maxMm
    : null;

  if (!geometry.meshExists) warnings.push('Không đọc được mesh hợp lệ.');
  if (geometry.nonZeroVolume === false) warnings.push('Mesh không có thể tích sử dụng được.');
  if (dimensionsPass === false) warnings.push('Kích thước nằm ngoài Manufacturing Profile.');
  if (dimensionsPass === null) warnings.push('Chưa xác định được kích thước vật lý đáng tin cậy.');
  if (geometry.watertight === false) warnings.push('Mesh chưa watertight.');
  if (geometry.watertight === null) warnings.push('Watertight chưa được xác nhận.');
  if (geometry.manifold === false) warnings.push('Mesh có cạnh non-manifold.');
  if (geometry.manifold === null) warnings.push('Manifold chưa được xác nhận.');
  if (geometry.baseContact === false) warnings.push('Chưa xác nhận được tiếp xúc liền mạch với base.');
  if (geometry.disconnectedComponents === null) warnings.push('Số phần rời chưa được xác nhận.');

  const modularValidation = input.modularity
    ? validateModularArchetype(
        input.modularity.archetype,
        input.modularity.attachmentSystem
      )
    : null;
  const modularConfiguration = !modularValidation
    ? 'not-assessed'
    : modularValidation.ok
      ? 'pass'
      : 'fail';
  if (modularValidation && !modularValidation.ok) {
    warnings.push(...modularValidation.errors.map((error) => `MAS configuration: ${error}.`));
  }
  if (input.modularity) {
    const system = input.modularity.attachmentSystem;
    const prototypeConnectors = system.connectors.filter(
      (connector) => connector.productionStatus === 'engineering_hypothesis'
    );
    if (prototypeConnectors.length) {
      warnings.push(
        `MAS v${system.version} vẫn là engineering hypothesis; đường kính peg và Head Dock chưa được factory xác nhận.`
      );
    }
    if (
      profile.assembly.validatedAttachmentSystemVersion !== system.version ||
      profile.assembly.connectorToleranceMm === null
    ) {
      warnings.push('Connector fit/tolerance chưa có bằng chứng từ factory profile và physical test.');
    }
    warnings.push('QC GLB hiện chưa đo trực tiếp geometry và orientation key của từng hardpoint.');
  }

  const hardFail =
    !geometry.meshExists ||
    geometry.nonZeroVolume === false ||
    dimensionsPass === false ||
    modularConfiguration === 'fail';
  const fullyKnownAndClean =
    dimensionsPass === true &&
    geometry.nonZeroVolume === true &&
    geometry.watertight === true &&
    geometry.manifold === true &&
    geometry.baseContact === true &&
    modularConfiguration !== 'fail' &&
    !input.modularity;

  return {
    id: input.id,
    revisionId: input.revisionId,
    overall: hardFail ? 'fail' : fullyKnownAndClean ? 'pass' : 'warning',
    dimensions: {
      baseDiameterMm: geometry.baseDiameterMm,
      heightMm: geometry.heightMm,
      pass: dimensionsPass,
    },
    mesh: {
      exists: geometry.meshExists,
      nonZeroVolume: geometry.nonZeroVolume,
      watertight: geometry.watertight,
      manifold: geometry.manifold,
      components: geometry.disconnectedComponents,
      degenerateFaces: geometry.degenerateFaces,
      invertedNormals: geometry.invertedNormals,
    },
    manufacturing: {
      baseContact: geometry.baseContact,
      thinGeometry:
        profile.geometry.minSupportedThicknessMm === null &&
        profile.geometry.minUnsupportedThicknessMm === null
          ? 'unknown'
          : 'warning',
      manualReviewRequired: true,
    },
    modularity: {
      systemId: input.modularity?.attachmentSystem.id ?? null,
      systemVersion: input.modularity?.attachmentSystem.version ?? null,
      worldBodyId: input.modularity?.archetype.worldBody.id ?? null,
      signatureKitId: input.modularity?.archetype.signatureKit.id ?? null,
      configuration: modularConfiguration,
      // A declared connector is not proof of fit. This stays unknown until a
      // measured physical coupon or an inspector with connector geometry data exists.
      connectorFit: 'unknown',
      bodyReadsCompleteWithoutSignature:
        input.modularity?.archetype.worldBody.standaloneWithoutSignature ?? null,
    },
    warnings,
    createdAt: input.now ?? Date.now(),
  };
}
