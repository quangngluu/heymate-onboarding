// Posed stills of the Quest rig, for the scene the writer just described.
//
// The scene endpoint composites her into a generated place by taking her own
// render as the subject, so her face and outfit are carried rather than guessed
// (see api/scene-image.ts and subject.ts). Until now that render was the static
// sculpt on the plinth: correct likeness, but always the same neutral stance, so
// she appeared *in* the scene rather than *doing* it.
//
// The Quest rig is skinned and its skeleton resolves to semantic roles, so it can
// be posed. A pose is authored over roles rather than bone names, because the two
// rigs in play number their spine in opposite directions — see bone-map.ts for
// what that costs if you get it wrong.
//
// Two figures matter as much as one. The Frame 12 slice turns on a difference
// between current Rin, who stands two centimetres right of the marker, and
// archived Rin, who stands dead centre and completes every motion. As a still
// with both in frame that reads immediately; as an animation it would need a
// runtime that does not exist yet.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { SemanticBone, SemanticSkeleton } from './bone-map';

/** Euler rotation in degrees, per semantic role. Absent roles keep rest pose. */
export type SemanticPose = Partial<Record<SemanticBone, readonly [number, number, number]>>;

export interface QuestFigure {
  pose: SemanticPose;
  /** Metres along X from centre. Two figures need to not occupy one space. */
  offsetX?: number;
  /** Turned towards or away from camera, in degrees. */
  turnY?: number;
  /**
   * Archived Rin is a recording, not a person in the room. Dimming and
   * desaturating her is the one visual difference the identity split can carry
   * in a still, since the rig has no facial channel to act with.
   */
  archived?: boolean;
}

/**
 * Poses the Quest beats actually need.
 *
 * Deliberately few and deliberately small. These are stills, so a pose only has
 * to read at a glance; the rig has no fingers and no facial bones, so anything
 * depending on either is not attempted here.
 */
export const QUEST_POSES: Record<string, SemanticPose> = {
  /**
   * Rest, but standing rather than bind pose.
   *
   * Most of the work here is bringing the arms *down*: the rig ships in an
   * A-pose, and every pose below has to undo that before anything it says about
   * the spine is legible. Z on the upper arm is the axis that lowers it.
   */
  standing: {
    spine_lower: [2, 0, 1],
    spine_upper: [-1, 4, 0],
    neck: [3, -4, 0],
    head: [-2, 5, 1],
    arm_l: [4, 0, -62],
    forearm_l: [-14, 0, -18],
    arm_r: [4, 0, 62],
    forearm_r: [-14, 0, 18],
    thigh_l: [0, 0, 3],
    thigh_r: [0, 0, -4],
  },
  /** The head tilt Frame 12 is about — she only does it when he is present. */
  headTilt: {
    spine_upper: [0, 2, -2],
    neck: [4, -6, -7],
    head: [-3, 6, -9],
    arm_l: [2, 0, -66],
    forearm_l: [-20, 0, -14],
    arm_r: [6, 0, 58],
    forearm_r: [-34, 0, 22],
    thigh_l: [0, 0, 3],
    thigh_r: [0, 0, -4],
  },
  /** Reaching towards a frame without touching it. */
  reaching: {
    spine_lower: [4, 0, 0],
    spine_mid: [3, -6, 0],
    spine_upper: [2, -10, 0],
    neck: [6, -8, 0],
    head: [2, -6, 0],
    arm_l: [2, 0, -58],
    forearm_l: [-18, 0, -16],
    arm_r: [-52, 0, 42],
    forearm_r: [-12, 0, 8],
    hand_r: [0, 0, -18],
    thigh_l: [0, 0, 4],
    thigh_r: [0, 0, -3],
  },
  /** Turned away, holding something back. */
  turnedAway: {
    spine_lower: [-2, 14, 0],
    spine_mid: [-1, 12, 0],
    spine_upper: [1, 10, 2],
    neck: [-4, 8, 0],
    head: [-6, 6, 0],
    arm_l: [8, 0, -70],
    forearm_l: [-40, 0, -26],
    arm_r: [4, 0, 68],
    forearm_r: [-30, 0, 20],
    thigh_l: [0, 0, 2],
    thigh_r: [0, 0, -3],
  },
  /**
   * Archived Rin: dead centre, upright, every motion completed.
   *
   * Still needs the arms lowered — "completed" is not the same as "unposed", and
   * leaving her in the A-pose would read as an error rather than as a recording.
   */
  archivedNeutral: {
    arm_l: [0, 0, -64],
    forearm_l: [-10, 0, -12],
    arm_r: [0, 0, 64],
    forearm_r: [-10, 0, 12],
  },
};

const RAD = Math.PI / 180;

/**
 * Apply a pose to a rig, by role.
 *
 * Additive on the rest pose rather than absolute: the bind pose carries real
 * information — a 14.9cm forward hip offset among other things — and overwriting
 * a bone's rotation outright would throw away whatever the rest pose encoded.
 */
export function applyPose(root: THREE.Object3D, bones: SemanticSkeleton, pose: SemanticPose): void {
  for (const [role, euler] of Object.entries(pose) as [SemanticBone, readonly [number, number, number]][]) {
    const bone = root.getObjectByName(bones[role]);
    if (!bone) continue;
    bone.rotation.set(
      bone.rotation.x + euler[0] * RAD,
      bone.rotation.y + euler[1] * RAD,
      bone.rotation.z + euler[2] * RAD
    );
  }
}

/** Mid grey, matching subject.ts: a cutout on black loses a dark outfit. */
const FIELD = 0x8a8a8a;
const W = 768;
const H = 1024;

let renderer: THREE.WebGLRenderer | null = null;

function ensureRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    // toDataURL needs the buffer to survive the render call.
    preserveDrawingBuffer: true,
    alpha: false,
  });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function dim(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const wasArray = Array.isArray(mesh.material);
    const materials = wasArray ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material];
    const dimmed = materials.map((source) => {
      const material = (source as THREE.MeshStandardMaterial).clone();
      // Solid, not ghostly. The first version used 0.42 opacity over a darkened
      // colour, which against the mid-grey field rendered her effectively
      // invisible — the pair shot came back looking like a single figure. It
      // would also not have survived the compositor, which treats this render as
      // a reference: a 40%-opacity figure is something it can simply decline to
      // draw. So the difference is carried by hue and light instead of by alpha.
      material.transparent = true;
      material.opacity = 0.88;
      // Desaturate towards cyan rather than darken: a recording of her, lit by
      // the archive rather than by the room.
      const grey = material.color.getHSL({ h: 0, s: 0, l: 0 });
      material.color.setHSL(0.52, Math.min(grey.s * 0.35, 0.22), Math.min(grey.l * 1.06, 0.78));
      material.emissive = new THREE.Color(0x1d4a5c);
      material.emissiveIntensity = 0.5;
      material.roughness = Math.min((material.roughness ?? 0.6) + 0.25, 1);
      return material;
    });
    // Give back the same shape that came in. Handing an array to a mesh whose
    // geometry has no groups is how the archived figure disappeared completely:
    // three.js indexes a material array by group, finds none, and draws nothing.
    // A 7KB flat-grey frame where a figure should be, and no error anywhere.
    mesh.material = wasArray ? dimmed : dimmed[0];
  });
}

/**
 * One or two posed figures on a neutral field, as a JPEG data URI.
 *
 * The rig is cloned per figure — `SkeletonUtils.clone` rather than
 * `Object3D.clone`, because a skinned mesh shares its skeleton otherwise and
 * posing one copy would pose both.
 *
 * Returns null rather than throwing: like every other step in the picture path,
 * a missing still means no picture, never a stall.
 */
export function posedShot(
  rig: THREE.Object3D,
  bones: SemanticSkeleton,
  figures: readonly QuestFigure[]
): string | null {
  if (!figures.length) return null;
  try {
    const gl = ensureRenderer();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FIELD);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(1.6, 2.4, 2.2);
    scene.add(key);

    for (const figure of figures) {
      const copy = cloneSkinned(rig);
      copy.position.x += figure.offsetX ?? 0;
      if (figure.turnY) copy.rotation.y += figure.turnY * RAD;
      applyPose(copy, bones, figure.pose);
      if (figure.archived) dim(copy);
      scene.add(copy);
    }

    // Frame everything present, in both axes. Two figures are wider than one, so
    // a height-only fit crops the pair at the edges — the same mistake the single
    // subject shot had to correct for Kagura's sword.
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const forHeight = size.y / 2 / Math.tan(vFov / 2);
    const forWidth = Math.max(size.x, size.z) / 2 / Math.tan(hFov / 2);
    const distance = Math.max(forHeight, forWidth) * 1.2;
    camera.position.set(centre.x, centre.y, centre.z + distance);
    camera.lookAt(centre);

    gl.render(scene, camera);
    const data = gl.domElement.toDataURL('image/jpeg', 0.86);
    scene.clear();
    return data;
  } catch (error) {
    // Fail soft, but not silently: a swallowed error here reads downstream as
    // "her model was not loaded yet", which is a different and much less
    // actionable problem.
    console.warn('posedShot failed', error);
    return null;
  }
}

/**
 * The Frame 12 pair: current Rin off-marker, archived Rin dead centre.
 *
 * Named rather than assembled at the call site because the offset *is* the
 * content — two centimetres right of the marker is the detail the whole slice
 * turns on, and it should not be a magic number in a UI file.
 */
export const FRAME12_PAIR: readonly QuestFigure[] = [
  { pose: QUEST_POSES.headTilt, offsetX: 0.32, turnY: -8 },
  { pose: QUEST_POSES.archivedNeutral, offsetX: -0.34, turnY: 4, archived: true },
];
