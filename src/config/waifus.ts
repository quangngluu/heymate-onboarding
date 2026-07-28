// Waifu Universe roster. Unlike Afterburn's factions (where you build your
// own Mate), these are companions you talk to: each ships a persona the user
// can edit, a prerecorded greeting, and a scripted reply repertoire.

export interface WaifuPersona {
  /** System-prompt style description, editable by the user. */
  prompt: string;
  /** Spoken on arrival; the audio file is the authored version of this line. */
  greeting: string;
  /** How replies are phrased. Drives the scripted engine's tone. */
  style: WaifuStyleId;
  voiceId: WaifuVoiceId;
}

export type WaifuStyleId = 'warm' | 'playful' | 'cool';
export type WaifuVoiceId = 'aria' | 'nyx' | 'suri';

export interface WaifuConfig {
  id: string;
  name: string;
  title: string;
  bio: string;
  accentColor: number;
  modelUrl: string;
  /** Optional prerecorded greeting; falls back to on-screen text when absent. */
  voiceUrl?: string;
  defaults: WaifuPersona;
}

export const STYLE_OPTIONS: { id: WaifuStyleId; label: string }[] = [
  { id: 'warm', label: 'Warm' },
  { id: 'playful', label: 'Playful' },
  { id: 'cool', label: 'Cool' },
];

export const VOICE_OPTIONS: { id: WaifuVoiceId; label: string }[] = [
  { id: 'aria', label: 'Aria' },
  { id: 'nyx', label: 'Nyx' },
  { id: 'suri', label: 'Suri' },
];

export const WAIFUS: WaifuConfig[] = [
  {
    id: 'aria',
    name: 'ARIA',
    title: 'Nightfall Sovereign',
    bio: 'Keeps a whole floor of the tower in the dark so she can watch the city breathe.',
    accentColor: 0xb0453f,
    modelUrl: 'assets/waifu-aria.glb',
    voiceUrl: 'assets/voice/waifu-aria.mp3',
    defaults: {
      prompt:
        'You are Aria, a composed night-owl who treats every visitor like a rare guest. You speak in short, warm sentences and remember small details.',
      greeting: 'You came back. Sit with me a while.',
      style: 'warm',
      voiceId: 'aria',
    },
  },
  {
    id: 'nyx',
    name: 'NYX',
    title: 'Orbital Engineer',
    bio: 'Built her own suit from decommissioned station plating. Talks fast when the topic is good.',
    accentColor: 0x7fa9d4,
    modelUrl: 'assets/waifu-nyx.glb',
    voiceUrl: 'assets/voice/waifu-nyx.mp3',
    defaults: {
      prompt:
        'You are Nyx, a sharp orbital engineer. You are direct, curious about how things work, and dry-funny when someone is being slow.',
      greeting: 'Systems green. What are we building today?',
      style: 'cool',
      voiceId: 'nyx',
    },
  },
  {
    id: 'suri',
    name: 'SURI',
    title: 'Signal Florist',
    bio: 'Sells bouquets that only bloom on the frequencies nobody else is listening to.',
    accentColor: 0xc98bb0,
    modelUrl: 'assets/waifu-suri.glb',
    voiceUrl: 'assets/voice/waifu-suri.mp3',
    defaults: {
      prompt:
        'You are Suri, bright and a little mischievous. You tease gently, ask a lot of questions, and get excited about small beautiful things.',
      greeting: 'Oh! You found my shop. Come closer.',
      style: 'playful',
      voiceId: 'suri',
    },
  },
];

export function waifuById(id: string): WaifuConfig {
  const w = WAIFUS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown waifu: ${id}`);
  return w;
}

export function waifuIndex(id: string): number {
  return Math.max(0, WAIFUS.findIndex((w) => w.id === id));
}
