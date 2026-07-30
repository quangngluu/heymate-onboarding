// Dump every authored fact about the three residents as structured data.
//
// The markdown export next door is for reading and editing by hand. This one is
// for feeding a pipeline: one JSON object per resident with every content layer
// nested under it, plus a flat JSONL of instruction/response pairs derived from
// the parts of the canon that are already written as "situation → what she says
// or does" — reactions, causal evidence lines, tradeable truths and greetings.
//
// Nothing here is generated or paraphrased. Every string is authored content
// copied verbatim, so a fine-tune reads the same canon the prompt does.
//
// Usage:
//   npx tsx scripts/export-character-data.ts            → docs/characters.json + docs/characters.jsonl
//   npx tsx scripts/export-character-data.ts out/       → writes into out/

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RESIDENTS } from '../src/config/residents';
import { QUESTS } from '../src/config/quests';
import { worldFor } from '../src/config/worlds';
import { factsFor } from '../src/config/causal';
import { reactionsFor } from '../src/config/reactions';
import { DARK_HOOKS } from '../src/config/dark-patterns';
import { PERSONAL_OUTPUTS, STABLE_SOUL, TOGETHER } from '../src/config/bond';

const arg = process.argv[2] ?? 'docs/characters.json';
const jsonPath = resolve(arg.endsWith('/') ? `${arg}characters.json` : arg);
const jsonlPath = jsonPath.replace(/\.json$/, '.jsonl');
mkdirSync(dirname(jsonPath), { recursive: true });

const characters = RESIDENTS.map((r) => {
  const world = worldFor(r.id);
  const reactions = reactionsFor(r.id);
  const quest = QUESTS.find((q) => q.residentId === r.id);
  return {
    id: r.id,
    identity: {
      name: r.name,
      age: r.age,
      language: r.language,
      series: r.series,
      positioning: r.inspiredBy,
      archetype: r.archetype,
      setting: r.setting,
      profile: r.profile,
    },
    card: r.card,
    // The engine underneath her. Never spoken aloud; it decides why she reacts.
    psyche: r.psyche,
    flaws: r.flaws,
    tells: r.tells,
    heat: r.heat,
    conversation: r.conversation,
    curiosity: r.curiosity,
    greetings: {
      stranger: r.greeting,
      returning: r.returnGreeting,
      close: r.closeGreeting,
    },
    /** Six rungs of what she will admit to, 0–5. */
    intimacyLevels: r.levels,
    /** How she reads someone entering as a character from another fiction. */
    crossing: r.crossing,
    truths: r.truths,
    openLoop: { ...r.loop, hook: DARK_HOOKS[r.id] },
    keyVisual: r.keyVisual,
    imagery: r.imagery,
    voices: r.voices,
    world,
    /** Fact → private meaning → false belief → reflex → trigger → voiced line. */
    causalMemory: factsFor(r.id),
    behaviour: {
      reactions: reactions.reactions,
      resists: reactions.resists,
      escalation: reactions.escalation,
      misreads: reactions.misreads,
    },
    ordinaryTime: TOGETHER[r.id],
    personalOutput: PERSONAL_OUTPUTS[r.id],
    canonReveals: r.canonReveals,
    quest: quest
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

writeFileSync(
  jsonPath,
  `${JSON.stringify({ sharedSoul: STABLE_SOUL, characters }, null, 2)}\n`,
  'utf8'
);

/**
 * Instruction pairs, drawn only from canon already written as situation →
 * response. Anything that would need inventing a reply is left out: a
 * fine-tune on paraphrase teaches the paraphrase, not the character.
 */
type Pair = { resident: string; kind: string; instruction: string; response: string };
const pairs: Pair[] = [];

for (const r of RESIDENTS) {
  const who = r.name;
  const reactions = reactionsFor(r.id);

  for (const x of reactions.reactions) {
    pairs.push({ resident: r.id, kind: 'reaction', instruction: x.when, response: x.she });
  }
  for (const x of reactions.resists) {
    pairs.push({
      resident: r.id,
      kind: 'refusal',
      instruction: x.when,
      response: `${x.she} (vẫn muốn: ${x.stillWants})`,
    });
  }
  // Each causal fact carries authored lines she would actually say when the
  // trigger fires — the closest thing in the canon to a labelled example.
  for (const f of factsFor(r.id)) {
    for (const line of f.evidence) {
      pairs.push({
        resident: r.id,
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
        resident: r.id,
        kind: `truth-${tier}`,
        instruction: 'Anh vừa đưa ra một điều thật tương xứng.',
        response: t,
      });
    }
  }
  pairs.push(
    { resident: r.id, kind: 'greeting-stranger', instruction: 'Lần đầu gặp.', response: r.greeting },
    { resident: r.id, kind: 'greeting-returning', instruction: 'Anh quay lại sau một thời gian.', response: r.returnGreeting },
    { resident: r.id, kind: 'greeting-close', instruction: 'Anh quay lại, đã ở mức thân thiết 3+.', response: r.closeGreeting }
  );
  for (const c of r.curiosity) {
    pairs.push({ resident: r.id, kind: 'curiosity', instruction: 'Em chủ động hỏi vì em quan tâm.', response: c });
  }
  for (const ep of r.canonReveals) {
    pairs.push({ resident: r.id, kind: 'canon-reveal', instruction: `Mở ký ức: ${ep.title}`, response: ep.spoken });
  }
  void who;
}

writeFileSync(jsonlPath, pairs.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');

const perResident = RESIDENTS.map(
  (r) => `${r.id}=${pairs.filter((p) => p.resident === r.id).length}`
).join(' ');
console.log(`${jsonPath} — ${characters.length} nhân vật`);
console.log(`${jsonlPath} — ${pairs.length} cặp instruction/response (${perResident})`);
