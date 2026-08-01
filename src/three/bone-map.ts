// Semantic bone contract for Quest animation.
//
// Runtime and quest content name *roles*, never provider bones. The reason is
// concrete rather than stylistic: the two rigs in play number their spine in
// opposite directions.
//
//   Meshy placeholder   Hips → Spine02 → Spine01 → Spine → {shoulders, neck}
//   Mixamo              Hips → Spine   → Spine1  → Spine2 → {shoulders, Neck}
//
// Meshy's `Spine02` is the bone attached to Hips; Mixamo's `Spine` is. So
// `Spine → Spine`, the mapping a name-based adapter writes by default, sends the
// lower-torso rotation to the upper chest and the upper-chest rotation to the
// hips. The torso counter-rotates, nothing throws, and a bone-name presence
// check passes. It reads as bad animation rather than as a bug.
//
// Therefore: resolve by walking the parent chain from Hips, and treat a name as
// a label rather than as a position.

/**
 * The roles quest content and the animation runtime are allowed to name.
 *
 * The arms and legs are here because the first version was not: spine, neck, head
 * and hands only. Posing that set left the rig in its bind pose from the shoulders
 * out, so a still came back with the arms straight out to the sides — a mannequin
 * with a tilted head, visibly worse than the neutral sculpt it was meant to
 * improve. A hand role is useless while the arm holding it is horizontal.
 */
export type SemanticBone =
  | 'hips'
  | 'spine_lower'
  | 'spine_mid'
  | 'spine_upper'
  | 'neck'
  | 'head'
  | 'shoulder_l'
  | 'arm_l'
  | 'forearm_l'
  | 'hand_l'
  | 'shoulder_r'
  | 'arm_r'
  | 'forearm_r'
  | 'hand_r'
  | 'thigh_l'
  | 'shin_l'
  | 'foot_l'
  | 'thigh_r'
  | 'shin_r'
  | 'foot_r';

/** Just enough of a bone to resolve a skeleton; THREE.Bone satisfies it. */
export interface BoneLike {
  readonly name: string;
  readonly children: readonly BoneLike[];
}

export type SemanticSkeleton = Record<SemanticBone, string>;

/**
 * The spine chain, lowest first.
 *
 * Walks down from Hips choosing at each step the child that continues the spine:
 * the one that is itself an ancestor of the head. Limbs branch off Hips too, so
 * "first child" is not good enough.
 */
function spineChain(hips: BoneLike): BoneLike[] {
  const carriesHead = (bone: BoneLike): boolean =>
    /^head$/i.test(bone.name) ||
    bone.children.some((child) => carriesHead(child));

  const chain: BoneLike[] = [];
  let cursor: BoneLike | undefined = hips.children.find((child) => carriesHead(child));
  while (cursor) {
    chain.push(cursor);
    const next: BoneLike | undefined = cursor.children.find((child) => carriesHead(child));
    // Stop before neck/head: those are their own roles, not spine segments.
    if (!next || /^(neck|head)$/i.test(next.name)) break;
    cursor = next;
  }
  return chain;
}

function descend(from: BoneLike, match: RegExp): BoneLike | null {
  if (match.test(from.name)) return from;
  for (const child of from.children) {
    const hit = descend(child, match);
    if (hit) return hit;
  }
  return null;
}

export class BoneMapError extends Error {}

/**
 * Resolve a skeleton to semantic roles, or throw explaining what is wrong.
 *
 * Deliberately strict: a rig that cannot be resolved must fail loudly at load
 * rather than animate incorrectly.
 */
export function resolveSemanticBones(root: BoneLike): SemanticSkeleton {
  const hips = descend(root, /^hips$/i);
  if (!hips) throw new BoneMapError('no bone named Hips');

  const spine = spineChain(hips);
  if (spine.length < 3) {
    throw new BoneMapError(
      `expected 3 spine segments between Hips and neck, found ${spine.length}` +
        `${spine.length ? ` (${spine.map((b) => b.name).join(' → ')})` : ''}`
    );
  }
  const [lower, mid, upper] = spine;

  const neck = descend(upper, /^neck$/i);
  if (!neck) throw new BoneMapError(`no neck under ${upper.name}`);
  const head = descend(neck, /^head$/i);
  if (!head) throw new BoneMapError(`no head under ${neck.name}`);

  // Shoulders hang off the topmost spine segment. If they are found anywhere
  // else, the chain was resolved wrongly and the arms cannot be trusted.
  //
  // Walked as a chain rather than matched by name for the same reason as the
  // spine: both conventions agree on shoulder → arm → forearm → hand as a
  // hierarchy even where the names differ, so depth is the reliable signal.
  const limb = (root: BoneLike, side: 'left' | 'right', joints: number): BoneLike[] => {
    const start = descend(root, new RegExp(`^${side}_?(shoulder|upleg)$`, 'i'));
    if (!start) throw new BoneMapError(`no ${side} limb root under ${root.name}`);
    const chain = [start];
    let cursor = start;
    while (chain.length < joints) {
      // The single longest sub-chain: a hand may carry fingers, a foot a toe, and
      // taking the first child would pick a thumb over a forearm.
      const next = cursor.children
        .slice()
        .sort((a, b) => depth(b) - depth(a))[0];
      if (!next) break;
      chain.push(next);
      cursor = next;
    }
    if (chain.length < joints) {
      throw new BoneMapError(
        `${side} limb is ${chain.length} joints, expected ${joints} (${chain.map((b) => b.name).join(' → ')})`
      );
    }
    return chain;
  };

  const [shoulderL, armL, forearmL, handL] = limb(upper, 'left', 4);
  const [shoulderR, armR, forearmR, handR] = limb(upper, 'right', 4);
  const [thighL, shinL, footL] = limb(hips, 'left', 3);
  const [thighR, shinR, footR] = limb(hips, 'right', 3);

  return {
    hips: hips.name,
    spine_lower: lower.name,
    spine_mid: mid.name,
    spine_upper: upper.name,
    neck: neck.name,
    head: head.name,
    shoulder_l: shoulderL.name,
    arm_l: armL.name,
    forearm_l: forearmL.name,
    hand_l: handL.name,
    shoulder_r: shoulderR.name,
    arm_r: armR.name,
    forearm_r: forearmR.name,
    hand_r: handR.name,
    thigh_l: thighL.name,
    shin_l: shinL.name,
    foot_l: footL.name,
    thigh_r: thighR.name,
    shin_r: shinR.name,
    foot_r: footR.name,
  };
}

/** Longest path below this bone, in joints. */
function depth(bone: BoneLike): number {
  if (!bone.children.length) return 1;
  return 1 + Math.max(...bone.children.map(depth));
}

/**
 * Bind-pose facts a retarget must preserve, measured from the placeholder.
 *
 * `Armature` carries scale 0.01 because the asset is authored in centimetres,
 * and Hips sits 14.93cm forward of the armature origin in Z. A retarget that
 * zeroes either one moves the character.
 */
export const BIND_POSE_NOTES = {
  authoringScale: 0.01,
  hipsForwardZ: 14.93,
  /** Root motion lives on Hips alone, so it is cleanly strippable. */
  rootMotionBone: 'hips' as SemanticBone,
  /**
   * Clip first-frame hip heights vary 83.8 → 106.9 in authoring units, so
   * blending between clips needs Y normalisation or it pops ~23cm.
   */
  hipHeightRange: [83.8, 106.9] as const,
} as const;
