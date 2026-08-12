import { describe, expect, it } from 'vitest';
import {
  AFTERBURN_WORLD_PACK_V1,
  MATE_ATTACHMENT_SYSTEM_V1,
  RESIN_FACTORY_DRAFT_V1,
} from '../../src/worldform/domain/fixtures';
import {
  assertValid,
  validateMateAttachmentSystem,
  validateManufacturingProfile,
  validateModularArchetype,
  validateUserIdentity,
  validateWorldPack,
} from '../../src/worldform/domain/validation';
import { recommendArchetypes } from '../../src/worldform/domain/recommend';
import type { UserIdentity } from '../../src/worldform/domain/types';

const identity: UserIdentity = {
  photo: {
    fileName: 'me.jpg',
    mimeType: 'image/jpeg',
    dataUri: 'data:image/jpeg;base64,YQ==',
  },
  appearance: { recognitionCues: ['round glasses', 'short black hair'] },
  desiredSelf: {
    description: 'Someone quiet who notices hidden patterns and protects people.',
    feelings: ['mysterious', 'calm'],
  },
};

describe('Worldform domain fixtures', () => {
  it('ships a schema-valid, bounded Afterburn World Pack', () => {
    expect(validateWorldPack(AFTERBURN_WORLD_PACK_V1)).toEqual({ ok: true, errors: [] });
    expect(AFTERBURN_WORLD_PACK_V1.archetypes).toHaveLength(4);
    expect(AFTERBURN_WORLD_PACK_V1.rights.commercialUse).toBe(false);
  });

  it('freezes MAS v1 as a modular grammar while keeping 3 mm a hypothesis', () => {
    expect(validateMateAttachmentSystem(MATE_ATTACHMENT_SYSTEM_V1)).toEqual({
      ok: true,
      errors: [],
    });
    const assetConnector = MATE_ATTACHMENT_SYSTEM_V1.connectors.find(
      (connector) => connector.method === 'mechanical_keyed_peg'
    );
    expect(assetConnector).toMatchObject({
      nominalDiameterMm: 3,
      orientationKeyRequired: true,
      productionStatus: 'engineering_hypothesis',
    });
    expect(MATE_ATTACHMENT_SYSTEM_V1.rules).toMatchObject({
      maxHeroSignatureAssets: 1,
      maxSecondaryAccents: 1,
      detachedBodyMustReadComplete: true,
      assetMagnetsAllowed: false,
    });
  });

  it('gives every World Body standard geometry and a compatible bounded Signature Kit', () => {
    for (const archetype of AFTERBURN_WORLD_PACK_V1.archetypes) {
      expect(
        validateModularArchetype(archetype, AFTERBURN_WORLD_PACK_V1.attachmentSystem)
      ).toEqual({ ok: true, errors: [] });
      expect(archetype.worldBody.hardpoints.map((hardpoint) => hardpoint.portId)).toEqual(
        expect.arrayContaining(AFTERBURN_WORLD_PACK_V1.attachmentSystem.ports.map((port) => port.id))
      );
      expect(archetype.worldBody.standaloneWithoutSignature).toBe(true);
      expect(archetype.signatureKit.hero).toBeTruthy();
      expect(archetype.signatureKit.secondaryAccent === null || typeof archetype.signatureKit.secondaryAccent === 'object').toBe(true);
    }
  });

  it('rejects a Signature Asset that bypasses an active compatible hardpoint', () => {
    const archetype = structuredClone(AFTERBURN_WORLD_PACK_V1.archetypes[0]);
    archetype.signatureKit.hero.type = 'weapon';
    archetype.signatureKit.hero.portIds = ['base_port'];
    const result = validateModularArchetype(
      archetype,
      AFTERBURN_WORLD_PACK_V1.attachmentSystem
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('hero Signature Asset type weapon is incompatible with base_port');
  });

  it('keeps unknown factory constraints null instead of inventing values', () => {
    expect(validateManufacturingProfile(RESIN_FACTORY_DRAFT_V1)).toEqual({
      ok: true,
      errors: [],
    });
    expect(RESIN_FACTORY_DRAFT_V1.geometry.minSupportedThicknessMm).toBeNull();
    expect(RESIN_FACTORY_DRAFT_V1.geometry.minDetailMm).toBeNull();
    expect(RESIN_FACTORY_DRAFT_V1.assembly.validatedAttachmentSystemVersion).toBeNull();
    expect(RESIN_FACTORY_DRAFT_V1.assembly.connectorToleranceMm).toBeNull();
  });

  it('requires a photo, desired self, and one-to-three unique feelings', () => {
    expect(validateUserIdentity(identity)).toEqual({ ok: true, errors: [] });
    expect(
      validateUserIdentity({
        ...identity,
        photo: { ...identity.photo, dataUri: 'https://example.com/not-owned.jpg' },
        desiredSelf: { description: '', feelings: [] },
      }).errors
    ).toEqual([
      'a supported identity photo is required',
      'desired-self description is required',
      'choose between one and three desired feelings',
    ]);
  });

  it('recommends roles deterministically without fake percentages', () => {
    const recommendations = recommendArchetypes(AFTERBURN_WORLD_PACK_V1, identity);
    expect(recommendations).toHaveLength(3);
    expect(recommendations[0]).toMatchObject({ archetypeId: 'resonance-listener', rank: 1 });
    expect(recommendations.every((item) => !('score' in item))).toBe(true);
  });

  it('throws a useful aggregate error at the validation seam', () => {
    expect(() => assertValid({ ok: false, errors: ['one', 'two'] }, 'fixture')).toThrow(
      'fixture: one; two'
    );
  });
});
