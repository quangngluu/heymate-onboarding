// Optimize a character GLB for web delivery:
//   1. gltf-transform: prune + resize all textures to <=1024 and encode WebP
//   2. gltfpack: Meshopt geometry compression (-cc)
//
// Runtime requirements this implies (already wired in the app):
//   - MeshoptDecoder for EXT_meshopt_compression
//   - Browser WebP decode for EXT_texture_webp (all modern browsers)
//
// Usage: node scripts/optimize-glb.mjs <input.glb> <output.glb>

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const [, , inPath, outPath, sizeArg, simplifyArg] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: optimize-glb.mjs <input.glb> <output.glb> [baseColorSize=1024] [simplifyRatio]');
  process.exit(1);
}
const texSize = Number(sizeArg) || 1024;
// Secondary maps (normal/ORM) read fine at half resolution on stylized toys;
// emissive is mostly flat glow shapes and survives 512.
const halfSize = Math.max(512, texSize / 2);
const simplify = Number(simplifyArg) || 0;

const io = new NodeIO();
const doc = await io.read(resolve(inPath));

await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality: 80, slots: /baseColor/i }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [halfSize, halfSize], quality: 82, slots: /(normal|metallicRoughness|occlusion)/i }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80, slots: /emissive/i })
);

const tmp = mkdtempSync(join(tmpdir(), 'glbopt-'));
const mid = join(tmp, 'mid.glb');
await io.write(mid, doc);

const packArgs = ['gltfpack', '-i', mid, '-o', resolve(outPath), '-cc', '-kn'];
if (simplify > 0) packArgs.push('-si', String(simplify));
execFileSync('npx', packArgs, { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });

const inMB = (statSync(resolve(inPath)).size / 1e6).toFixed(1);
const outMB = (statSync(resolve(outPath)).size / 1e6).toFixed(2);
console.log(`${inPath} ${inMB}MB -> ${outPath} ${outMB}MB`);
