// Convert a Meshy-style OBJ + PBR texture pack into a glTF-binary (GLB).
//
// Expects in the input directory:
//   base.obj            — geometry (positions/uvs/normals)
//   texture_diffuse.png — base color
//   texture_pbr.png     — packed ORM (R=occlusion, G=roughness, B=metallic)
//   texture_normal.png  — tangent-space normal map
//   texture_emissive.png (optional)
//
// Usage: node scripts/convert-obj-to-glb.mjs <inputDir> <output.glb>

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const [, , inDir, outPath] = process.argv;
if (!inDir || !outPath) {
  console.error('usage: convert-obj-to-glb.mjs <inputDir> <output.glb>');
  process.exit(1);
}

const objText = readFileSync(resolve(inDir, 'base.obj'), 'utf8');
const group = new OBJLoader().parse(objText);
const meshes = [];
group.traverse((o) => {
  if (o.isMesh) meshes.push(o);
});
if (meshes.length === 0) throw new Error('No mesh found in OBJ');

const doc = new Document();
const buffer = doc.createBuffer();

function texture(name, file) {
  const p = resolve(inDir, file);
  if (!existsSync(p)) return null;
  return doc.createTexture(name).setImage(readFileSync(p)).setMimeType('image/png');
}

const baseColor = texture('baseColor', 'texture_diffuse.png');
const orm = texture('orm', 'texture_pbr.png');
const normalTex = texture('normal', 'texture_normal.png');
const emissive = texture('emissive', 'texture_emissive.png');

const material = doc.createMaterial('character').setDoubleSided(false);
if (baseColor) material.setBaseColorTexture(baseColor);
if (orm) {
  material.setMetallicRoughnessTexture(orm);
  material.setOcclusionTexture(orm);
  material.setMetallicFactor(1).setRoughnessFactor(1);
}
if (normalTex) material.setNormalTexture(normalTex);
if (emissive) {
  material.setEmissiveTexture(emissive);
  material.setEmissiveFactor([1, 1, 1]);
}

const scene = doc.createScene('scene');
const root = doc.createNode('character');
scene.addChild(root);

for (const m of meshes) {
  const g = m.geometry;
  const prim = doc.createPrimitive().setMaterial(material);
  const pos = g.getAttribute('position');
  prim.setAttribute(
    'POSITION',
    doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos.array)).setBuffer(buffer)
  );
  const normal = g.getAttribute('normal');
  if (normal) {
    prim.setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(normal.array)).setBuffer(buffer)
    );
  }
  const uv = g.getAttribute('uv');
  if (uv) {
    prim.setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv.array)).setBuffer(buffer)
    );
  }
  if (g.index) {
    prim.setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.index.array)).setBuffer(buffer)
    );
  }
  const mesh = doc.createMesh(m.name || 'mesh').addPrimitive(prim);
  root.addChild(doc.createNode(m.name || 'mesh').setMesh(mesh));
}

await new NodeIO().write(resolve(outPath), doc);
console.log('wrote', outPath, `(${meshes.length} mesh(es))`);
