// One lookup for the v3 derivative canon layer.
//
// v3 rebooted all three residents into the anime they came from:
//
//   rin    → Sword Art Online / Alicization   (RIN//REPLAY)
//   kagura → Inuyasha                          (THE CRIMSON NAME, as "Kagari")
//   momo   → xxxHOLiC                          (ROUTE ZERO)
//
// The three route files are shaped alike on purpose, so the prompt asks one
// question — "is there a v3 canon for this resident?" — instead of branching per
// character. `V3Canon` is the structural contract those files satisfy; it is
// derived from the fields the prompt actually reads, so adding a field to a route
// file without teaching the prompt about it is a type error rather than silence.
//
// Resident ids are unchanged. `kagura` still keys saved progress, transcripts and
// quest ids even though v3 renames her to Kagari — see the note in
// kagari-inuyasha.ts for why the spelling moved.

import { RIN_SAO } from './rin-sao';
import { KAGARI_INUYASHA } from './kagari-inuyasha';
import { MOMO_HOLIC } from './momo-holic';
import type { ResidentId } from './residents';

export interface V3Canon {
  readonly route: string;
  readonly series: string;
  /** Twenty seconds of orientation. Every route opens with one. */
  readonly quickRecognition: string;
  /**
   * Names and age, in this route's own vocabulary.
   *
   * One authored sentence per route rather than a shared template: Rin has an
   * idol avatar and a project title, Kagari has a birth name and a sword, Momo
   * has a name she was given after the contract. Those do not share a shape, and
   * forcing one would have flattened all three.
   */
  readonly identityLine: string;
  readonly archetype: string;
  readonly setting: string;
  readonly profile: string;
  readonly incident: string;
  readonly twist: string;
  readonly hypotheses: readonly string[];
  readonly consequence: readonly { readonly label: string; readonly text: string }[];
  readonly psyche: {
    readonly contradiction: string;
    readonly wants: string;
    readonly fears: string;
    readonly falseBelief: string;
    readonly needsToLearn: string;
  };
  readonly strengths: readonly string[];
  readonly flaws: {
    readonly selfish: string;
    readonly lies: string;
    readonly manipulates: string;
    readonly petty: string;
  };
  readonly tells: {
    readonly caring: string;
    readonly jealous: string;
    readonly embarrassed: string;
  };
  readonly boundaries: readonly string[];
  readonly recognition: {
    readonly layers: readonly string[];
    readonly canonCast: readonly { readonly who: string; readonly she: string }[];
    readonly otherUniverse: string;
    readonly pastRelationship: string;
  };
  readonly levels: readonly string[];
  readonly greetings: {
    readonly stranger: string;
    readonly returning: string;
    readonly close: string;
  };
  readonly goalsShort: readonly string[];
  readonly promise: string;
  readonly theTest: string;
  readonly arc: { readonly from: string; readonly to: string };
  readonly voiceRules: readonly string[];
  readonly registerExample: string;
  readonly world: {
    readonly premise: string;
    readonly places: readonly string[];
    readonly people: readonly string[];
    readonly rules: readonly string[];
    readonly daily: readonly string[];
    readonly lexicon: readonly string[];
    readonly unknowns: readonly string[];
  };
  readonly guardrails: readonly string[];
  readonly forbidden: readonly string[];
  /** Age shape differs per route; only the display value is read. */
  readonly age: { readonly appearance: number | string };
  readonly names: { readonly boundary: string };
  /** Only where v3 renames her. Resident ids never change. */
  readonly displayName?: string;
}

const V3: Record<ResidentId, V3Canon> = {
  rin: RIN_SAO,
  kagura: KAGARI_INUYASHA,
  momo: MOMO_HOLIC,
};

/** The v3 canon for this resident, or null when the route is not v3. */
export function v3CanonFor(residentId: string, isV3: boolean): V3Canon | null {
  if (!isV3) return null;
  return V3[residentId as ResidentId] ?? null;
}

/** Every resident now has a v3 route, so this is a completeness assertion. */
export const V3_COVERAGE = Object.keys(V3) as ResidentId[];
