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

/** The roles quest content and the animation runtime are allowed to name. */
export type SemanticBone =
  | 'hips'
  | 'spine_lower'
  | 'spine_mid'
  | 'spine_upper'
  | 'neck'
  | 'head'
  | 'hand_l'
  | 'hand_r';

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
  // else, the chain was resolved wrongly and the hands cannot be trusted.
  const handL = descend(upper, /^left_?hand$/i);
  const handR = descend(upper, /^right_?hand$/i);
  if (!handL || !handR) {
    throw new BoneMapError(
      `hands must descend from the topmost spine segment (${upper.name}); ` +
        `left=${handL?.name ?? 'missing'} right=${handR?.name ?? 'missing'}`
    );
  }

  return {
    hips: hips.name,
    spine_lower: lower.name,
    spine_mid: mid.name,
    spine_upper: upper.name,
    neck: neck.name,
    head: head.name,
    hand_l: handL.name,
    hand_r: handR.name,
  };
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
