import { factsFor, relevantFacts, type CausalFact } from './causal';
import { DEFAULT_ROUTE, type CanonRoute } from './canon-route';
import { residentById, type ResidentConfig, type ResidentId } from './residents';
import {
  normalizedHeat,
  normalizedImagery,
  normalizedKeyVisual,
  type V3FallbackCopy,
} from './v3-authored';
import { v3CanonFor, type V3Canon, type V3Ending } from './v3-canon';

export interface CanonResidentView extends ResidentConfig {
  route: CanonRoute;
  canonVersion: 'v1+v2' | 'v3';
  v3: V3Canon | null;
  causalFacts: CausalFact[];
  fallback: V3FallbackCopy | null;
  /**
   * Where her arc may land. Empty on Hub, whose endings live in interlude.ts and
   * are reached through the retired flow.
   */
  endings: readonly V3Ending[];
}

/**
 * The ending a quest terminal names, or null when the id does not resolve.
 *
 * Null rather than a throw because a quest may legitimately be authored before
 * its endings are; `verify-canon` is where an unresolved id becomes an error.
 */
export function endingFor(
  residentId: string,
  route: CanonRoute,
  endingId: string
): V3Ending | null {
  return canonViewFor(residentId as ResidentId, route).endings.find((e) => e.id === endingId) ?? null;
}

/** Whether this ending may be shown to a player yet. */
export function endingReady(ending: V3Ending | null): boolean {
  return !!ending && ending.ready !== false;
}

function v3Levels(k: V3Canon): ResidentConfig['levels'] {
  if (k.levels.length !== 6) {
    throw new Error(`V3 route '${k.route}' must define exactly six relationship levels`);
  }
  return [...k.levels] as ResidentConfig['levels'];
}

/**
 * The only user-visible route resolver.
 *
 * Legacy Hub returns the original resident fields untouched. V3 is a complete
 * replacement view: no missing authored field may silently fall through to
 * old canon.
 */
export function canonViewFor(
  residentId: ResidentId,
  route: CanonRoute = DEFAULT_ROUTE
): CanonResidentView {
  const base = residentById(residentId);
  const k = v3CanonFor(residentId, route);
  if (!k) {
    return {
      ...base,
      route,
      canonVersion: 'v1+v2',
      // Hub's endings live in interlude.ts and are reached through the retired
      // flow, so there is nothing for the v3 mechanism to bind here.
      endings: [],
      v3: null,
      causalFacts: factsFor(residentId),
      fallback: null,
    };
  }

  const causalFacts = k.causalFacts.map((fact) => ({
    ...fact,
    residentId,
  }));

  return {
    ...base,
    route,
    canonVersion: 'v3',
    v3: k,
    name: k.displayName ?? base.name,
    series: k.series,
    archetype: k.archetype,
    setting: k.setting,
    card: {
      hook: k.tagline,
      personality: k.archetype,
      promise: k.promise,
    },
    profile: k.profile,
    keyVisual: normalizedKeyVisual(k),
    greeting: k.greetings.stranger,
    returnGreeting: k.greetings.returning,
    closeGreeting: k.greetings.close,
    psyche: { ...k.psyche },
    tells: { ...k.tells },
    heat: normalizedHeat(k),
    truths: {
      cheap: [...k.tradeableTruths.cheap],
      costly: [...k.tradeableTruths.costly],
      expensive: [...k.tradeableTruths.expensive],
    },
    flaws: { ...k.flaws },
    crossing: {
      detects: k.recognition.otherUniverse,
      drawnTo: `${k.recognition.layers.join(' ')} ${k.recognition.pastRelationship}`,
    },
    imagery: normalizedImagery(k),
    loop: {
      missing: k.twist,
      offer: k.theTest,
      answers: [
        k.hypotheses[0] ?? 'Tìm thêm bằng chứng.',
        k.hypotheses[1] ?? 'Giữ câu hỏi mở.',
        k.hypotheses[2] ?? 'Tạo một lựa chọn khác.',
      ],
      closingImage: k.promise,
    },
    levels: v3Levels(k),
    endings: k.endings,
    canonReveals: k.canonReveals.map((item) => ({ ...item })),
    causalFacts,
    fallback: k.fallback,
  };
}

export function canonRevealIndexFor(
  residentId: ResidentId,
  route: CanonRoute,
  revealId: string
): number {
  return canonViewFor(residentId, route).canonReveals.findIndex(
    (item) => item.id === revealId
  );
}

export function relevantCanonFacts(
  residentId: ResidentId,
  route: CanonRoute,
  context: { message?: string; scene?: string; level?: number },
  limit = 3
): CausalFact[] {
  const view = canonViewFor(residentId, route);
  if (view.canonVersion !== 'v3') {
    return relevantFacts(residentId, context, limit);
  }
  const hay = `${context.message ?? ''} ${context.scene ?? ''}`.toLowerCase();
  const level = context.level ?? 0;
  return view.causalFacts
    .filter((fact) => fact.revealLevel <= level)
    .map((fact) => ({
      fact,
      score: fact.cues.reduce(
        (sum, cue) => sum + (hay.includes(cue.toLowerCase()) ? 2 : 0),
        0
      ),
    }))
    .filter(({ score, fact }) => score > 0 || fact.revealLevel === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ fact }) => fact);
}

/**
 * Whose eyes the picture is taken from.
 *
 * `observed` is the original framing: a place, with her in it. `first-person`
 * puts the viewer in the room — his hands or an object at the near edge, her at
 * mid-distance looking back.
 *
 * That framing is worth having because the product has always addressed him as
 * "anh" and never once shown him. It costs nothing in likeness, which is the
 * usual reason not to draw a player: a foreground hand needs no consistency
 * because it is not a face. And three scenes are already written for it — his
 * shadow beside her archive hand, his name on a blade before they met, a
 * silhouette on the last page that changes with him.
 */
export type ScenePerspective = 'observed' | 'first-person';

/**
 * Rules, not content, for the near edge of a first-person frame.
 *
 * Stated generically on purpose. Naming a specific object per resident would be
 * authoring canon, and naming the wrong one would break it: Kagari does not hand
 * Akagane over — one of her own quest branches is about him holding the scabbard
 * so she does not have to draw the blade — and Momo's red pen in his hand would
 * mean he had signed something, which is a story event rather than a picture.
 *
 * So the objects come from the authored Props list, and what may not be in his
 * hands is a rule the writer applies.
 */
const FIRST_PERSON_RULES = [
  'Camera is the viewer’s own eyes, at standing eye level, looking at her.',
  'She stands at mid-distance and is aware of the viewer; she is the subject.',
  'The near edge of the frame may carry the viewer’s hand, forearm, or shoulder, or one object from the Props list above. Nothing else.',
  'The viewer is never identifiable: no face, no reflection of a face, no distinctive clothing, no jewellery, no visible skin detail that would fix an age or a gender.',
  'Never place an object that belongs to her personally — her weapon, her instrument, her working tools — in the viewer’s hands. He may stand near it, hold something that carries it, or reach towards it, and that is all.',
  'Only draw the viewer holding an object if the Scene line above says he is holding it.',
].join('\n');

export function sceneBriefFor(
  residentId: ResidentId,
  route: CanonRoute,
  scene: string,
  perspective: ScenePerspective = 'observed'
): string {
  const view = canonViewFor(residentId, route);
  return [
    `Scene: ${scene}`,
    `World: ${view.setting}`,
    `Places: ${view.imagery.places}`,
    `Props: ${view.imagery.props}`,
    `Atmosphere: ${view.imagery.air}`,
    ...(perspective === 'first-person' ? ['', 'Framing — first person:', FIRST_PERSON_RULES] : []),
  ].join('\n');
}

export function subjectBriefFor(
  residentId: ResidentId,
  route: CanonRoute
): string {
  const view = canonViewFor(residentId, route);
  return [
    `Character: ${view.name}`,
    `Silhouette: ${view.keyVisual.silhouette}`,
    `Wardrobe: ${view.keyVisual.wardrobe}`,
    `Features: ${view.keyVisual.features}`,
    `Aura: ${view.keyVisual.aura}`,
    `Palette: ${view.keyVisual.palette}`,
    `Staging: ${view.keyVisual.staging}`,
  ].join('\n');
}
