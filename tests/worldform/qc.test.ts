import { describe, expect, it } from 'vitest';
import {
  AFTERBURN_WORLD_PACK_V1,
  RESIN_FACTORY_DRAFT_V1,
} from '../../src/worldform/domain/fixtures';
import type { GeometryMetadata } from '../../src/worldform/domain/types';
import { assessGeometry } from '../../src/worldform/qc/qc';

const cleanGeometry: GeometryMetadata = {
  meshExists: true,
  nonZeroVolume: true,
  baseDiameterMm: 50,
  heightMm: 128,
  manifold: true,
  watertight: true,
  disconnectedComponents: 1,
  degenerateFaces: 0,
  invertedNormals: 0,
  baseContact: true,
};

describe('Worldform modular QC', () => {
  it('validates MAS configuration but keeps connector fit unknown', () => {
    const result = assessGeometry({
      id: 'qc-1',
      revisionId: 'rev-1',
      geometry: cleanGeometry,
      profile: RESIN_FACTORY_DRAFT_V1,
      modularity: {
        attachmentSystem: AFTERBURN_WORLD_PACK_V1.attachmentSystem,
        archetype: AFTERBURN_WORLD_PACK_V1.archetypes[3],
      },
      now: 1,
    });

    expect(result.overall).toBe('warning');
    expect(result.modularity).toMatchObject({
      systemId: 'mate-attachment-system',
      systemVersion: '1.0.0',
      configuration: 'pass',
      connectorFit: 'unknown',
      bodyReadsCompleteWithoutSignature: true,
    });
    expect(result.warnings).toContain(
      'Connector fit/tolerance chưa có bằng chứng từ factory profile và physical test.'
    );
  });

  it('fails QC when the World Body no longer satisfies the modular contract', () => {
    const archetype = structuredClone(AFTERBURN_WORLD_PACK_V1.archetypes[0]);
    archetype.worldBody.standaloneWithoutSignature = false;
    const result = assessGeometry({
      id: 'qc-2',
      revisionId: 'rev-2',
      geometry: cleanGeometry,
      profile: RESIN_FACTORY_DRAFT_V1,
      modularity: {
        attachmentSystem: AFTERBURN_WORLD_PACK_V1.attachmentSystem,
        archetype,
      },
      now: 1,
    });

    expect(result.overall).toBe('fail');
    expect(result.modularity.configuration).toBe('fail');
    expect(result.warnings).toContain(
      'MAS configuration: World Body must read as complete without the Signature Kit.'
    );
  });
});
