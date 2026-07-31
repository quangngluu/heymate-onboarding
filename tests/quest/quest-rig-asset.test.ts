import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';

const assetPath = resolve('public/assets/quest/rigs/meshy-biped-placeholder.glb');

describe('Quest rig placeholder asset gate', () => {
  it('ships one real skinned, materialized character with the required semantic bones', async () => {
    expect(existsSync(assetPath), `Missing Quest rig at ${assetPath}`).toBe(true);

    await MeshoptDecoder.ready;
    const document = await new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
      .read(assetPath);
    const root = document.getRoot();
    const names = new Set(root.listNodes().map((node) => node.getName()));
    const required = [
      'Hips',
      'Spine',
      'Spine01',
      'Spine02',
      'neck',
      'Head',
      'LeftHand',
      'RightHand',
    ];

    expect(root.listSkins().length).toBeGreaterThanOrEqual(1);
    expect(root.listMaterials().length).toBeGreaterThanOrEqual(1);
    expect(required.filter((name) => !names.has(name))).toEqual([]);
  });
});
