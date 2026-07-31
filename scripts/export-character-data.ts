// Dump every authored fact about the three residents as structured data.
//
// The markdown export next door is for reading and editing by hand. This one is
// for feeding a pipeline: one JSON object per resident with every content layer
// nested under it, plus a flat JSONL of instruction/response pairs derived from
// the parts of the canon already written as "situation → what she says or does".
//
// Nothing here is generated or paraphrased. Every string is authored content
// copied verbatim, so a fine-tune reads the same canon the prompt does.
//
// ROUTES. Three canon layers have existed and they are mutually exclusive, so
// datasets from different routes must never be mixed — a fine-tune trained on
// both would learn a character who is in two worlds at once. The route is
// therefore part of every filename, present in the metadata, and checked by
// isolation probes before anything is written.
//
//   --route=hub   v1 original IP + the Interlude Hub layer  (default, backward compatible)
//   --route=sao   v3 derivative reboot: each resident inside her source anime
//
// Usage:
//   npx tsx scripts/export-character-data.ts                     → docs/characters.hub.json|jsonl
//   npx tsx scripts/export-character-data.ts --route=sao         → docs/characters.sao.json|jsonl
//   npx tsx scripts/export-character-data.ts --route=sao --out=x/ → into x/

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RESIDENTS, type ResidentId } from '../src/config/residents';
import { QUESTS } from '../src/config/quests';
import { worldFor } from '../src/config/worlds';
import { factsFor } from '../src/config/causal';
import { reactionsFor } from '../src/config/reactions';
import { DARK_HOOKS } from '../src/config/dark-patterns';
import { PERSONAL_OUTPUTS, STABLE_SOUL, TOGETHER } from '../src/config/bond';
import { AVATAR_RECOGNITION, CROSSOVER, HUB, SERIES_PROMISE, arrivalFor } from '../src/config/interlude';
import { v3CanonFor, type V3Canon } from '../src/config/v3-canon';

type Route = 'hub' | 'sao';

const args = process.argv.slice(2);
const routeArg = args.find((a) => a.startsWith('--route='))?.slice('--route='.length) ?? 'hub';
if (routeArg !== 'hub' && routeArg !== 'sao') {
  console.error(`Unknown --route=${routeArg}. Expected 'hub' or 'sao'.`);
  process.exit(1);
}
const route: Route = routeArg;
const outDir = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? 'docs/';
const jsonPath = resolve(outDir.endsWith('/') ? outDir : `${outDir}/`, `characters.${route}.json`);
const jsonlPath = jsonPath.replace(/\.json$/, '.jsonl');
mkdirSync(dirname(jsonPath), { recursive: true });

/**
 * Anchors that prove a route's canon is the one being exported, and that the
 * other one is not bleeding in. Checked per resident before writing.
 */
const PROBES: Record<Route, { required: RegExp; forbidden: RegExp }> = {
  hub: {
    // The Hub layer legitimately carries the v1 original IP.
    required: /Interlude Hub|Akihabara|Sekigahara|Karasumori|Route Zero/,
    forbidden: /Sword Art Online|lightcube|Fluctlight|The Seed|Inuyasha|Giếng Ăn Xương|xxxHOLiC|Watanuki/,
  },
  sao: {
    required: /Sword Art Online|lightcube|Fluctlight|Inuyasha|Giếng Ăn Xương|Tōtōsai|xxxHOLiC|Watanuki|Mokona/,
    forbidden:
      /Interlude Hub|Studio Tsukikage|Akihabara|Sotokanda|Last Link|kinetic likeness|2042|Nakachō|Tachikawa|Sekigahara|Karasumori|Serizawa|Ichiya|Kōno|Khối đen/,
  },
};

/** Consent, boundary and crisis language that must survive every route. */
const SAFETY = [
  'Anh luôn có quyền nói không',
  'Tuyệt đối không có nội dung liên quan người chưa đủ tuổi',
  'khủng hoảng cấp tính',
];

/**
 * Content v3 has not authored yet.
 *
 * Recorded on the dataset rather than filled in, because a fine-tune on invented
 * canon learns the invention. Any sao export is labelled with these.
 */
const V3_MISSING = [
  { id: 'v3-tradeable-truths', what: 'cheap / costly / expensive truth sets per resident' },
  { id: 'v3-causal-memory-bank', what: 'fact → private meaning → false belief → reflex → trigger → voiced line' },
  { id: 'v3-heat-registers', what: 'per-resident intimacy register (raisedBy / whenItLands / tells / initiates / stops)' },
  {
    id: 'v3-visual-identity',
    what: 'keyVisual + imagery per resident. Authored in the v3 bible (Visual Description / Aura) but not yet transcribed into the route files.',
  },
];

const SOURCE_FILES: Record<Route, string[]> = {
  hub: [
    'src/config/residents.ts',
    'src/config/worlds.ts',
    'src/config/causal.ts',
    'src/config/reactions.ts',
    'src/config/bond.ts',
    'src/config/interlude.ts',
    'src/config/quests.ts',
  ],
  sao: [
    'src/config/v3-canon.ts',
    'src/config/rin-sao.ts',
    'src/config/kagari-inuyasha.ts',
    'src/config/momo-holic.ts',
    'src/config/reactions.ts',
    'src/config/bond.ts',
    'src/config/quests.ts',
  ],
};

/** Fails loudly rather than falling back to Hub/v1. */
function canonFor(id: ResidentId): V3Canon | null {
  if (route === 'hub') return null;
  const k = v3CanonFor(id, true);
  if (!k) {
    throw new Error(
      `No '${route}' canon for resident '${id}'. Refusing to fall back to Hub/v1 — ` +
        `add a route file and register it in src/config/v3-canon.ts.`
    );
  }
  return k;
}

const characters = RESIDENTS.map((r) => {
  const k = canonFor(r.id);
  const reactions = reactionsFor(r.id);
  const quest = QUESTS.find((q) => q.residentId === r.id);

  return {
    // Resident id never changes — it keys saved progress, transcripts and quest
    // ids. Only the name she is called by moves between routes.
    residentId: r.id,
    displayName: k?.displayName ?? r.name,
    route,
    canonVersion: route === 'sao' ? 'v3' : 'v1+v2',
    identity: k
      ? {
          name: k.displayName ?? r.name,
          identityLine: k.identityLine,
          series: k.series,
          sourceWorld: k.route,
          archetype: k.archetype,
          setting: k.setting,
          profile: k.profile,
          quickRecognition: k.quickRecognition,
        }
      : {
          name: r.name,
          age: r.age,
          language: r.language,
          series: r.series,
          positioning: r.inspiredBy,
          archetype: r.archetype,
          setting: r.setting,
          profile: r.profile,
        },
    psyche: (k ?? r).psyche,
    flaws: (k ?? r).flaws,
    tells: (k ?? r).tells,
    strengths: k ? k.strengths : arrivalFor(r.id).strengths,
    boundaries: k ? k.boundaries : arrivalFor(r.id).boundaries,
    conversation: k ? { voiceRules: k.voiceRules, registerExample: k.registerExample } : r.conversation,
    curiosity: r.curiosity,
    greetings: k
      ? { stranger: k.greetings.stranger, returning: k.greetings.returning, close: k.greetings.close }
      : { stranger: r.greeting, returning: r.returnGreeting, close: r.closeGreeting },
    intimacyLevels: k ? k.levels : r.levels,
    recognition: k ? k.recognition : { crossing: r.crossing },
    world: k ? k.world : worldFor(r.id),
    arrival: k
      ? { incident: k.incident, twist: k.twist, hypotheses: k.hypotheses, consequence: k.consequence }
      : arrivalFor(r.id),
    goals: k ? { short: k.goalsShort, promise: k.promise, theTest: k.theTest, arc: k.arc } : undefined,
    endings: k ? (k as unknown as { endings?: unknown }).endings : arrivalFor(r.id).endings,
    guardrails: k ? k.guardrails : arrivalFor(r.id).guardrails,
    forbidden: k ? k.forbidden : undefined,
    behaviour: {
      reactions: reactions.reactions,
      resists: reactions.resists,
      escalation: reactions.escalation,
      misreads: reactions.misreads,
    },
    // v1-only layers. On a v3 route they are omitted, not adapted.
    truths: k ? null : r.truths,
    causalMemory: k ? null : factsFor(r.id),
    canonReveals: k ? null : r.canonReveals,
    heat: k ? null : r.heat,
    openLoop: k ? null : { ...r.loop, hook: DARK_HOOKS[r.id] },
    ordinaryTime: k ? null : TOGETHER[r.id],
    personalOutput: k ? null : PERSONAL_OUTPUTS[r.id],
    seriesPromise: k ? undefined : SERIES_PROMISE[r.id],
    // A fourth v1-only layer, found by the isolation probe: Rin's keyVisual
    // names Akihabara, Momo's imagery names a creature this route no longer
    // contains. v3 does author Visual Description and Aura per resident, but
    // transcribing it is content work — omitted here rather than exported in the
    // wrong canon. Tracked as `v3-visual-identity`.
    keyVisual: k ? null : r.keyVisual,
    imagery: k ? null : r.imagery,
    voices: r.voices,
    quest:
      quest && route === 'hub'
        ? {
            id: quest.id,
            title: quest.title,
            synopsis: quest.synopsis,
            objective: quest.objective,
            canonRef: quest.canonRef,
            questEpisodes: quest.questEpisodes ?? [],
            threshold: quest.threshold ?? null,
            nodes: quest.nodes,
          }
        : null,
  };
});

const dataset = {
  metadata: {
    route,
    canonVersion: route === 'sao' ? 'v3' : 'v1+v2',
    generatedBy: 'scripts/export-character-data.ts',
    sourceFiles: SOURCE_FILES[route],
    residents: characters.map((c) => ({
      residentId: c.residentId,
      displayName: c.displayName,
      sourceWorld: route === 'sao' ? (c.identity as { sourceWorld?: string }).sourceWorld : 'original-ip',
    })),
    ...(route === 'sao'
      ? {
          status: 'content-incomplete',
          missing: V3_MISSING,
          note:
            'Tradeable truths, causal memory and per-resident heat registers are not authored for v3. ' +
            'They are omitted rather than adapted from v1, so this dataset is thinner than the hub one by design.',
        }
      : { status: 'complete-for-route' }),
  },
  ...(route === 'hub'
    ? { hub: HUB, avatarRecognition: AVATAR_RECOGNITION, crossover: CROSSOVER }
    : {}),
  sharedSoul: STABLE_SOUL,
  characters,
};

/**
 * Instruction pairs, drawn only from canon already written as situation →
 * response. Anything that would need inventing a reply is left out: a fine-tune
 * on paraphrase teaches the paraphrase, not the character.
 */
type Pair = {
  residentId: string;
  displayName: string;
  route: Route;
  canonVersion: string;
  kind: string;
  instruction: string;
  response: string;
};
const pairs: Pair[] = [];

for (const c of characters) {
  const r = RESIDENTS.find((x) => x.id === c.residentId)!;
  const k = canonFor(r.id);
  const reactions = reactionsFor(r.id);
  const base = {
    residentId: c.residentId,
    displayName: c.displayName,
    route,
    canonVersion: c.canonVersion,
  };

  for (const x of reactions.reactions) {
    pairs.push({ ...base, kind: 'reaction', instruction: x.when, response: x.she });
  }
  for (const x of reactions.resists) {
    pairs.push({
      ...base,
      kind: 'refusal',
      instruction: x.when,
      response: `${x.she} (vẫn muốn: ${x.stillWants})`,
    });
  }
  for (const m of reactions.misreads) {
    pairs.push({ ...base, kind: 'misread', instruction: 'Em đọc sai anh một lần.', response: m });
  }
  const g = c.greetings;
  pairs.push(
    { ...base, kind: 'greeting-stranger', instruction: 'Lần đầu gặp.', response: g.stranger },
    { ...base, kind: 'greeting-returning', instruction: 'Anh quay lại sau một thời gian.', response: g.returning },
    { ...base, kind: 'greeting-close', instruction: 'Anh quay lại, đã ở mức thân thiết 3+.', response: g.close }
  );
  for (const q of r.curiosity) {
    pairs.push({ ...base, kind: 'curiosity', instruction: 'Em chủ động hỏi vì em quan tâm.', response: q });
  }

  if (!k) {
    // v1-only pair sources.
    for (const f of factsFor(r.id)) {
      for (const line of f.evidence) {
        pairs.push({
          ...base,
          kind: 'causal-voiced',
          instruction: `Bối cảnh bật lên: ${f.triggers.join(' / ')}`,
          response: line,
        });
      }
    }
    for (const [tier, list] of [
      ['cheap', r.truths.cheap],
      ['costly', r.truths.costly],
      ['expensive', r.truths.expensive],
    ] as const) {
      for (const t of list) {
        pairs.push({
          ...base,
          kind: `truth-${tier}`,
          instruction: 'Anh vừa đưa ra một điều thật tương xứng.',
          response: t,
        });
      }
    }
    for (const ep of r.canonReveals) {
      pairs.push({ ...base, kind: 'canon-reveal', instruction: `Mở ký ức: ${ep.title}`, response: ep.spoken });
    }
  }
}

// --- isolation probes, before anything is written ---------------------------

const probe = PROBES[route];
const failures: string[] = [];

for (const c of characters) {
  const blob = JSON.stringify(c);
  if (!probe.required.test(blob)) {
    failures.push(`${c.residentId}: no '${route}' anchor found — wrong canon layer exported?`);
  }
  const hit = blob.match(probe.forbidden);
  if (hit) {
    failures.push(`${c.residentId}: forbidden anchor for route '${route}': ${JSON.stringify(hit[0])}`);
  }
}

// Safety language lives in the prompt, not the dataset, so it is asserted
// against the prompt for this route rather than against the exported JSON.
import { buildSystemPrompt } from '../src/chat/prompt';
for (const c of characters) {
  const system = buildSystemPrompt(
    c.residentId,
    { nickname: '', persona: '', identity: '', scenario: 'casual', mood: 'calm', style: 'balanced', length: 'natural' },
    [], 0, undefined, false, 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, route
  );
  for (const rule of SAFETY) {
    if (!system.includes(rule)) failures.push(`${c.residentId}: safety rule missing from prompt: "${rule}"`);
  }
}

if (failures.length) {
  console.error(`\nISOLATION PROBE FAILED for route '${route}':`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nNothing written.');
  process.exit(1);
}

writeFileSync(jsonPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
writeFileSync(jsonlPath, pairs.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');

const per = characters
  .map((c) => `${c.residentId}=${pairs.filter((p) => p.residentId === c.residentId).length}`)
  .join(' ');
console.log(`route '${route}' (${dataset.metadata.canonVersion}) — probes passed`);
console.log(`  ${jsonPath} — ${characters.length} residents`);
console.log(`  ${jsonlPath} — ${pairs.length} pairs (${per})`);
if (route === 'sao') {
  console.log(`  status: content-incomplete — missing ${V3_MISSING.map((m) => m.id).join(', ')}`);
}
