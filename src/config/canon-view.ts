import { factsFor, relevantFacts, type CausalFact } from './causal';
import { DEFAULT_ROUTE, type CanonRoute } from './canon-route';
import { residentById, type ResidentConfig, type ResidentId } from './residents';
import {
  normalizedHeat,
  normalizedImagery,
  normalizedKeyVisual,
  type V3FallbackCopy,
} from './v3-authored';
import { v3CanonFor, type V3Canon } from './v3-canon';

export interface CanonResidentView extends ResidentConfig {
  route: CanonRoute;
  canonVersion: 'v1+v2' | 'v3';
  v3: V3Canon | null;
  causalFacts: CausalFact[];
  fallback: V3FallbackCopy | null;
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

export function sceneBriefFor(
  residentId: ResidentId,
  route: CanonRoute,
  scene: string
): string {
  const view = canonViewFor(residentId, route);
  return [
    `Scene: ${scene}`,
    `World: ${view.setting}`,
    `Places: ${view.imagery.places}`,
    `Props: ${view.imagery.props}`,
    `Atmosphere: ${view.imagery.air}`,
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
