import type { RoleRecommendation, UserIdentity, WorldPack } from './types';

function words(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase('en-US')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
}

/** Deterministic prototype interpretation; provider-backed analysis can replace this adapter later. */
export function recommendArchetypes(
  pack: WorldPack,
  identity: UserIdentity,
  limit = 3
): RoleRecommendation[] {
  const desired = words(
    [identity.desiredSelf.description, ...identity.appearance.recognitionCues].join(' ')
  );
  const feelings = new Set(identity.desiredSelf.feelings);

  return pack.archetypes
    .map((archetype, index) => {
      const keywordScore = archetype.recognitionKeywords.reduce(
        (score, keyword) => score + (desired.has(keyword.toLocaleLowerCase('en-US')) ? 3 : 0),
        0
      );
      const feelingScore = archetype.feelingAffinity.reduce(
        (score, feeling) => score + (feelings.has(feeling) ? 5 : 0),
        0
      );
      return { archetype, score: keywordScore + feelingScore, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, Math.min(limit, pack.archetypes.length)))
    .map(({ archetype }, rank) => ({
      archetypeId: archetype.id,
      rationale: archetype.rationale,
      rank: rank + 1,
    }));
}
