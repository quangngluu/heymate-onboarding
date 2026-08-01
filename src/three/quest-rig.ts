import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { resolveSemanticBones, type SemanticSkeleton } from './bone-map';

export const QUEST_RIG_URL = '/assets/quest/rigs/meshy-biped-placeholder.glb';

/**
 * The semantic skeleton this rig resolved to, once loaded.
 *
 * Kept module-level so the animation runtime can ask "which bone is
 * `spine_upper` on the asset actually in the scene?" without re-walking it.
 */
let resolved: SemanticSkeleton | null = null;
let posable: THREE.Object3D | null = null;

export function questRigBones(): SemanticSkeleton | null {
  return resolved;
}

/**
 * The skinned model on its own, without the stage's skeleton overlay.
 *
 * The overlay exists so this technical placeholder visibly reads as a rig rather
 * than as final art, but it is presentation for the live stage and must not
 * travel: `SkeletonHelper` cannot be cloned — it rebuilds itself from a bone list
 * its copy does not have yet — so cloning the wrapper for an offscreen pose shot
 * throws inside three.js rather than anywhere near the caller.
 */
export function questRigPosable(): THREE.Object3D | null {
  return posable;
}

const QUEST_RIG_HEIGHT = 1.52;

export type QuestRigStatus = 'loading' | 'ready' | 'fallback';

export function setQuestRigStatus(status: QuestRigStatus): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.questRig = status;
  }
}

/**
 * Load the real skinned placeholder used to validate Quest staging.
 *
 * Meshy supplies the first skin only. Its bundled rest-pose clip was removed
 * during packing and is deliberately not used: authored movement will be
 * retargeted from Mixamo, so a placeholder animation cannot silently become
 * the product motion source.
 */
export async function loadQuestRig(maxAnisotropy = 8): Promise<THREE.Group> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(QUEST_RIG_URL);
  const source = gltf.scene;
  const bones = new Set<string>();
  let skinnedMeshes = 0;
  let materials = 0;

  source.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.add(object.name);
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    if (mesh.isSkinnedMesh) skinnedMeshes += 1;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials += meshMaterials.length;
    for (const material of meshMaterials as THREE.MeshStandardMaterial[]) {
      for (const map of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
        material.emissiveMap,
      ]) {
        if (!map) continue;
        map.anisotropy = maxAnisotropy;
        map.needsUpdate = true;
      }
    }
  });

  if (skinnedMeshes < 1 || materials < 1) {
    throw new Error(
      `Quest rig asset gate failed: skin=${skinnedMeshes}, materials=${materials}`
    );
  }

  // Resolve by walking the parent chain, not by matching bone names. The two
  // rigs in play number their spine in opposite directions, so a name check
  // would pass on a skeleton that animates inside-out. See bone-map.ts.
  try {
    resolved = resolveSemanticBones(source);
  } catch (error) {
    throw new Error(
      `Quest rig asset gate failed: skeleton did not resolve to the semantic ` +
        `contract — ${(error as Error).message}. Bones present: ${[...bones].join(', ')}`
    );
  }

  const initialBox = new THREE.Box3().setFromObject(source);
  const initialHeight = initialBox.getSize(new THREE.Vector3()).y || 1;
  source.scale.setScalar(QUEST_RIG_HEIGHT / initialHeight);
  source.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(source);
  const center = box.getCenter(new THREE.Vector3());
  source.position.set(-center.x, -box.min.y, -center.z);

  posable = source;

  const wrapper = new THREE.Group();
  wrapper.name = 'QuestRigPlaceholder';
  wrapper.userData.assetRole = 'skinned-placeholder';
  wrapper.userData.motionSource = 'mixamo-pending';
  wrapper.add(source);

  // The subtle bone overlay makes this technical prototype visibly a rig,
  // instead of letting a neutral base mesh be mistaken for final Rin art.
  const skeleton = new THREE.SkeletonHelper(source);
  skeleton.name = 'QuestRigSkeleton';
  const skeletonMaterial = skeleton.material as THREE.LineBasicMaterial;
  skeletonMaterial.color.setHex(0x63dcff);
  skeletonMaterial.transparent = true;
  skeletonMaterial.opacity = 0.22;
  skeletonMaterial.depthWrite = false;
  wrapper.add(skeleton);

  return wrapper;
}

export function disposeQuestRig(rig: THREE.Group): void {
  rig.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const meshMaterials = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];
    for (const material of meshMaterials) material.dispose();
  });
  rig.parent?.remove(rig);
}
