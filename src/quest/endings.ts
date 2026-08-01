import { endingFor, endingReady } from '../config/canon-view';
import type { CanonRoute } from '../config/canon-route';
import type { QuestDefinition } from '../config/quests';
import type { V3Ending } from '../config/v3-canon';

type EndingResolver = (
  residentId: string,
  route: CanonRoute,
  endingId: string
) => V3Ending | null;

/** Every authored way a quest can stop, including free-form families. */
export function terminalEndingIds(quest: QuestDefinition): (string | undefined)[] {
  return quest.nodes.flatMap((node) => [
    ...node.choices
      .filter((choice) => !choice.nextNodeId)
      .map((choice) => choice.endingId),
    ...(node.freeform
      ? [...node.freeform.families, node.freeform.fallback]
          .filter((family) => !family.nextNodeId)
          .map((family) => family.endingId)
      : []),
  ]);
}

/**
 * Resolve an ending only when the complete presenter contract is safe to show.
 * `ready` is the editorial gate; the remaining checks fail closed if an
 * incomplete record is ever marked ready by mistake.
 */
export function presentableEndingFor(
  quest: QuestDefinition,
  route: CanonRoute,
  endingId: string | undefined,
  resolveEnding: EndingResolver = endingFor
): V3Ending | null {
  if (!endingId || quest.route !== route) return null;
  const ending = resolveEnding(quest.residentId, route, endingId);
  if (
    !endingReady(ending) ||
    !ending?.label.trim() ||
    !ending.what.trim() ||
    !ending.closingLine?.trim() ||
    /MISSING INPUT/.test(`${ending.label} ${ending.what} ${ending.closingLine}`)
  ) {
    return null;
  }
  return ending;
}

/** No visitor may enter an arc unless every possible landing can be presented. */
export function questPlayable(
  quest: QuestDefinition,
  route: CanonRoute,
  resolveEnding: EndingResolver = endingFor
): boolean {
  const terminals = terminalEndingIds(quest);
  return (
    quest.route === route &&
    terminals.length > 0 &&
    terminals.every(
      (endingId) => presentableEndingFor(quest, route, endingId, resolveEnding) !== null
    )
  );
}

export type QuestEndingPresentation =
  | { kind: 'ready'; label: string; what: string; closingLine: string }
  | { kind: 'unavailable'; title: string; body: string };

/** Pure view model shared by the UI and tests; never returns placeholder text. */
export function endingPresentation(ending: V3Ending | null): QuestEndingPresentation {
  if (
    !endingReady(ending) ||
    !ending?.label.trim() ||
    !ending.what.trim() ||
    !ending.closingLine?.trim() ||
    /MISSING INPUT/.test(`${ending.label} ${ending.what} ${ending.closingLine}`)
  ) {
    return {
      kind: 'unavailable',
      title: 'Kết cục chưa thể mở',
      body: 'Phần kết không tải được. Lựa chọn của anh vẫn an toàn; hãy về Open Chat.',
    };
  }
  return {
    kind: 'ready',
    label: ending.label,
    what: ending.what,
    closingLine: ending.closingLine,
  };
}
