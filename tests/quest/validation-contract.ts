export type AuthoringDisposition = 'warn' | 'error';
export type RuntimeDisposition = 'degrade' | 'observe' | 'block';

export interface QuestValidationRuleContract {
  id: `V${number}`;
  name: string;
  authoring: AuthoringDisposition;
  runtime: RuntimeDisposition;
  fallback: string;
}

/**
 * Executable copy of the V1-V15 contract from the Phase 2 appendix.
 *
 * WP0 freezes names and dispositions without changing runtime. WP1 replaces
 * each matching todo case with assertions against the public scene validator.
 */
export const QUEST_VALIDATION_RULES = [
  {
    id: 'V1',
    name: 'motion tag exists in the clip registry',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'shared emotional clip, then idle plus expression',
  },
  {
    id: 'V2',
    name: 'clip required bones are available on the rig',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'nearest clip supported by the available bones',
  },
  {
    id: 'V3',
    name: 'expression exists in the loaded facial set',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'body motion plus look-at only',
  },
  {
    id: 'V4',
    name: 'required scene props are loaded',
    authoring: 'warn',
    runtime: 'block',
    fallback: 'skip the beat without applying its mutation',
  },
  {
    id: 'V5',
    name: 'staging slot is defined and legal for the actor',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'previous slot, then corridor-mid',
  },
  {
    id: 'V6',
    name: 'camera preset frames its target',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'single-medium on the active actor',
  },
  {
    id: 'V7',
    name: 'projected subject bounds fit the declared safe area',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'passing preset, then delay the beat one step',
  },
  {
    id: 'V8',
    name: 'subtitle rectangle does not intersect the subject safe area',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'delay the subtitle for this beat',
  },
  {
    id: 'V9',
    name: 'interruptible beats provide an interrupt response',
    authoring: 'error',
    runtime: 'degrade',
    fallback: 'force the beat to non-interruptible',
  },
  {
    id: 'V10',
    name: 'protected interval stays within the beat duration',
    authoring: 'error',
    runtime: 'degrade',
    fallback: 'clamp the protected interval to the beat duration',
  },
  {
    id: 'V11',
    name: 'emotion decay has a reachable target expression',
    authoring: 'warn',
    runtime: 'degrade',
    fallback: 'hold the previous expression',
  },
  {
    id: 'V12',
    name: 'scene resource use stays within budget',
    authoring: 'warn',
    runtime: 'observe',
    fallback: 'share the archived presentation material',
  },
  {
    id: 'V13',
    name: 'the next beat is prepared before the current beat ends',
    authoring: 'warn',
    runtime: 'observe',
    fallback: 'play the authored line without adaptive wording',
  },
  {
    id: 'V14',
    name: 'outcome canon entry uses a recognized canon type',
    authoring: 'warn',
    runtime: 'block',
    fallback: 'refuse the commit and preserve prior canon state',
  },
  {
    id: 'V15',
    name: 'every decision point produces a visible mutation',
    authoring: 'error',
    runtime: 'degrade',
    fallback: 'apply a lighting shift',
  },
] as const satisfies readonly QuestValidationRuleContract[];
