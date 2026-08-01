import type { ScenePerspective } from '../config/canon-view';
import type { CanonRoute } from '../config/canon-route';
import type { QuestPresentation } from '../config/quests';
import type { ResidentId } from '../config/residents';

export const QUEST_VISUAL_SPEC_VERSION = 'quest-visual-v1';

/** Production-facing pose vocabulary; E2 will bind these to a verified asset. */
export type QuestPoseId = 'standing' | 'headTilt' | 'reaching' | 'turnedAway';

const SUBJECT_ASSET_VERSION: Record<ResidentId, string> = {
  rin: 'rin-static-v1',
  kagura: 'kagura-static-v1',
  momo: 'momo-static-v1',
};

export interface QuestVisualContext {
  residentId: ResidentId;
  route: CanonRoute;
  questId: string;
  questTitle: string;
  questSynopsis: string;
  nodeId: string;
  nodePrompt: string;
  choiceId: string;
  imageKey: string;
  outcomeText: string;
  terminal: boolean;
  presentation?: QuestPresentation;
  playerAction?: string;
}

export interface QuestVisualSpec {
  cacheKey: string;
  pose: QuestPoseId | 'frame12-pair' | null;
  perspective: ScenePerspective;
  subjectStrategy: 'identity' | 'identity+pose' | 'none';
  scene: string;
}

export interface QuestVisualVersions {
  specVersion: string;
  subjectAssetVersion: string;
}

export interface QuestVisualCapabilities {
  /** E3 owns enabling this after its identity and flagged-retry gates pass. */
  firstPerson: boolean;
}

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

/** Keep cache identity aligned with dynamic prompt material without storing it verbatim. */
function textFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function presentationKey(presentation?: QuestPresentation): string {
  if (!presentation) return 'none';
  return [
    presentation.camera,
    presentation.visualState,
    presentation.mutation ?? 'none',
  ].join('+');
}

/**
 * Resolve authored Quest intent into one immutable draw specification.
 *
 * This function deliberately knows nothing about fetch, DOM, credits or Store.
 * Posed subjects remain disabled until E2's identity gate passes.
 */
export function resolveQuestVisual(
  context: QuestVisualContext,
  versions: QuestVisualVersions = {
    specVersion: QUEST_VISUAL_SPEC_VERSION,
    subjectAssetVersion: SUBJECT_ASSET_VERSION[context.residentId],
  },
  capabilities: QuestVisualCapabilities = { firstPerson: false }
): QuestVisualSpec {
  const presentation = presentationKey(context.presentation);
  const perspective: ScenePerspective =
    capabilities.firstPerson && context.presentation?.camera === 'object-pov'
      ? 'first-person'
      : 'observed';
  const subjectStrategy = context.presentation ? 'identity' : 'none';
  const branchKind = context.terminal ? 'terminal' : 'continuation';
  const playerAction = context.playerAction?.trim() ?? '';
  const action = playerAction ? ` Anh tự hành động: ${playerAction}` : '';

  return {
    cacheKey: [
      'quest-shot',
      versions.specVersion,
      versions.subjectAssetVersion,
      context.route,
      context.residentId,
      context.questId,
      context.nodeId,
      context.imageKey,
      context.choiceId,
      branchKind,
      presentation,
      playerAction ? `action-${textFingerprint(playerAction)}` : 'action-none',
      capabilities.firstPerson ? 'first-person-on' : 'first-person-off',
    ]
      .map(keyPart)
      .join(':'),
    pose: null,
    perspective,
    subjectStrategy,
    scene: `${context.questTitle}. ${context.questSynopsis} ${context.nodePrompt}${action}`,
  };
}
