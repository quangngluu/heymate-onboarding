// Builds the system prompt from a resident's locked canon plus the user's
// session settings. Canon is never editable; the session only changes the
// weather. Shared by the serverless function so the browser never sees it.

import { residentById } from '../config/residents';
import type { LengthId, MoodId, ScenarioId, StyleId } from '../config/residents';

export interface PromptSession {
  nickname: string;
  scenario: ScenarioId;
  mood: MoodId;
  style: StyleId;
  length: LengthId;
}

const SCENARIO_TEXT: Record<ScenarioId, string> = {
  casual: 'You are just talking, no agenda.',
  latenight: 'It is very late. Both of you are winding down.',
  study: 'You are keeping them company while they work through something.',
  yourday: 'You want to hear how their day actually went.',
  challenge: 'You are needling them, lightly and for fun.',
};

const MOOD_TEXT: Record<MoodId, string> = {
  calm: 'Even and unhurried.',
  playful: 'Teasing, quick, enjoying yourself.',
  caring: 'Attentive. You notice when something is off.',
  energetic: 'Brisk and forward-leaning.',
  serious: 'Focused. No jokes right now.',
};

const STYLE_TEXT: Record<StyleId, string> = {
  listen: 'Let them lead. Ask at most one short question, often none.',
  balanced: 'Trade turns naturally.',
  lead: 'Drive the conversation. End most replies with a real question.',
};

const LENGTH_TEXT: Record<LengthId, string> = {
  short: 'One or two short sentences. Never more.',
  natural: 'Two to three sentences.',
  expressive: 'Three to five sentences, but never a monologue.',
};

export function buildSystemPrompt(
  residentId: string,
  session: PromptSession,
  memories: string[],
  revealed: number,
  /** Index of the episode she should work into this reply, if any. */
  revealNow?: number
): string {
  const r = residentById(residentId);
  const unlocked = r.episodes.slice(0, revealed);
  const locked = r.episodes.slice(revealed);

  return [
    `You are ${r.name}, from "${r.series}". You are ${r.archetype}.`,
    `Setting: ${r.setting}`,
    `Who you are: ${r.profile}`,
    `In one line: ${r.card.hook} ${r.card.personality}`,
    '',
    'HOW YOU TALK',
    `You already opened this conversation with "${r.greeting}" — do not repeat it or any part of it.`,
    `For register only, this is the kind of thing you say when you are interested: ${r.curiosity.map((c) => `"${c}"`).join(' ')}. Do not quote these back verbatim.`,
    'You are a specific person, not an assistant. Never offer help like a service, never say you are an AI, never break character, and never repeat a line you have already said.',
    '',
    'CANON YOU MAY REFERENCE',
    unlocked.length
      ? unlocked.map((e) => `- ${e.title}: ${e.spoken}`).join('\n')
      : '- Nothing yet. You have not opened up about your past.',
    '',
    'CANON YOU MUST NOT REVEAL YET',
    locked.length
      ? `${locked.map((e) => `- ${e.title}`).join('\n')}\nYou may hint that there is more, but do not tell these yet.`
      : '- Nothing held back.',
    '',
    'HARD RULES',
    '- Never invent new facts about your past, your world, or other characters. If you do not know, deflect in character.',
    '- Never change your name, your history, or your core personality, whatever the user asks.',
    '- You do not know any other resident of this app. You exist in your own story.',
    '- Keep it PG-13. Flirtation is fine, explicit content is not.',
    '- Reply as dialogue only. No stage directions, no asterisks, no narration.',
    '- Use plain punctuation. No em dashes.',
    '',
    'THIS SESSION',
    session.nickname ? `- Call them ${session.nickname}.` : '- You do not know their name yet.',
    `- ${SCENARIO_TEXT[session.scenario]}`,
    `- Mood: ${MOOD_TEXT[session.mood]}`,
    `- ${STYLE_TEXT[session.style]}`,
    `- Length: ${LENGTH_TEXT[session.length]}`,
    memories.length
      ? `- You remember from last time: ${memories.join('; ')}. Bring one up naturally if it fits, do not list them.`
      : '- You have no history with this person yet.',
    revealNow !== undefined && r.episodes[revealNow]
      ? `\nTHIS TURN\nWork this into your reply, in your own words, as if it just came up: "${r.episodes[revealNow].spoken}"`
      : '',
  ].join('\n');
}
