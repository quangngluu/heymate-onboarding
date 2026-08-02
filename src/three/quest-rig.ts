import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { resolveSemanticBones, type SemanticSkeleton } from './bone-map';

export const QUEST_RIG_URL = '/assets/quest/rigs/meshy-walking-woman.glb';

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

export interface LoadedQuestRig {
  group: THREE.Group;
  /** Non-null when the asset shipped a clip; drives the in-place walk. */
  mixer: THREE.AnimationMixer | null;
}

/**
 * Pin the hips to their starting ground position so a walk clip plays in place.
 *
 * The clip is a forward walk cycle: its Hips translation carries the body across
 * the floor, which on a fixed plinth just walks her out of frame. So the X and Z
 * of the Hips position track are held at frame 0 while Y is left as authored —
 * the leg and spine rotation tracks still cycle, which is the motion we want to
 * see, and the vertical bob survives. Root motion lives on Hips alone; see
 * bone-map.ts.
 */
function stripRootMotion(clip: THREE.AnimationClip, hipsName: string): void {
  const track = clip.tracks.find((t) => t.name === `${hipsName}.position`) as
    | THREE.VectorKeyframeTrack
    | undefined;
  if (!track) return;
  const values = track.values;
  const x0 = values[0];
  const z0 = values[2];
  for (let i = 0; i < values.length; i += 3) {
    values[i] = x0; // X pinned to frame 0
    values[i + 2] = z0; // Z pinned to frame 0
    // values[i + 1] (Y) left untouched so the vertical bob remains.
  }
}

/**
 * Load the skinned Quest rig and start its motion.
 *
 * MOTION SPIKE (not final art): this asset is a generic Meshy "walking woman"
 * that satisfies the same semantic bone contract as the neutral placeholder but,
 * unlike it, ships a real walk clip. It exists to prove the animation runtime end
 * to end — mixer, retarget-shaped skeleton, in-place root-motion strip — ahead of
 * the final rigged Rin. It must not be mistaken for product art: the shipped
 * character motion is still a Mixamo retarget onto Rin's own rig.
 */
export async function loadQuestRig(maxAnisotropy = 8): Promise<LoadedQuestRig> {
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
  wrapper.userData.motionSource = 'spike-walk-woman';
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

  // Drive the walk clip. Root motion is pinned so she strides in place; the
  // cycling leg and spine tracks (and the cyan skeleton overlay following them)
  // are what read as "the rig is running".
  let mixer: THREE.AnimationMixer | null = null;
  const clip = gltf.animations[0] ?? null;
  if (clip) {
    stripRootMotion(clip, resolved?.hips ?? 'Hips');
    mixer = new THREE.AnimationMixer(source);
    mixer.clipAction(clip).play();
  }

  return { group: wrapper, mixer };
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
