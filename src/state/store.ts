import { CHARACTERS } from '../config/characters';
import { RESIDENTS, type ResidentId, type VoiceSlot } from '../config/residents';
import { questById, questsForResident, type QuestDefinition } from '../config/quests';
import type { LengthId, MoodId, ScenarioId, StyleId } from '../config/residents';

export type Step =
  | 'gallery' // universe picker (outer)
  | 'arrival' // creator universe: portal intro
  | 'studio' // creator universe: pick character + generate
  | 'reveal' // creator universe: your Mate
  | 'joined' // creator universe: lineup
  | 'stage'; // companion universe: resident on the base

export type GenMode = 'text' | 'photo';

export interface GenInput {
  mode: GenMode;
  text: string;
  photoUrl: string | null;
  photoName: string | null;
}

export type GenPhase = 'idle' | 'processing' | 'done';

export interface ChatTurn {
  from: 'user' | 'resident';
  text: string;
}

/** Session-only: applies to this encounter and is never persisted. */
export interface SessionSetup {
  nickname: string;
  /** Visitor preference for the resident's conversational presence, never canon. */
  persona: string;
  scenario: ScenarioId;
  mood: MoodId;
  style: StyleId;
  length: LengthId;
  voice: VoiceSlot;
}

/** Persisted per resident, and only after the user spends a credit. */
export interface SavedProgress {
  memories: string[];
  revealed: number;
  nickname: string;
  persona: string;
  visits: number;
  completedQuests: string[];
}

export const FREE_TURNS = 5;
export const FREE_VOICE_MESSAGES = 5;

/** Mock unlock code, as if printed on the figurine's box. */
export const UNLOCK_CODE = 'HEYMATE360';

function defaultSession(): SessionSetup {
  return {
    nickname: '',
    persona: '',
    scenario: 'casual',
    mood: 'calm',
    style: 'balanced',
    length: 'natural',
    voice: 'signature',
  };
}

export interface AppState {
  step: Step;
  universeId: string | null;

  // --- companion universe ---
  residentId: ResidentId;
  session: SessionSetup;
  /** Saved-and-paid progress, keyed by resident. */
  progress: Record<string, SavedProgress>;
  chat: ChatTurn[];
  /** User turns spent this session; gates the free encounter. */
  turns: number;
  speaking: boolean;
  /** True while her reply is in flight. */
  thinking: boolean;
  /** True while her voice is being rendered (seconds, not instant). */
  voicing: boolean;
  /** Session-scoped reveal count, seeded from saved progress. */
  revealed: number;
  sessionPanelOpen: boolean;
  activeQuestId: string | null;
  saveGateOpen: boolean;
  /** Full 360 inspection, bought or unlocked by code. Per resident. */
  viewUnlocked: Record<string, boolean>;
  unlockGateOpen: boolean;
  credits: number;
  /** Dedicated usage economy for "let her say it" TTS requests. */
  voiceFreeUses: number;
  voiceCredits: number;

  // --- creator universe ---
  characterId: string;
  gen: GenInput;
  genPhase: GenPhase;
  variantSeed: number | null;
  variantLabel: string | null;
  mateName: string;

  transitioning: boolean;
  error: string | null;
}

const initialState: AppState = {
  step: 'gallery',
  universeId: null,
  residentId: RESIDENTS[0].id,
  session: defaultSession(),
  progress: {},
  chat: [],
  turns: 0,
  speaking: false,
  thinking: false,
  voicing: false,
  revealed: 0,
  sessionPanelOpen: false,
  activeQuestId: null,
  saveGateOpen: false,
  viewUnlocked: {},
  unlockGateOpen: false,
  credits: 3,
  voiceFreeUses: 0,
  voiceCredits: 0,
  characterId: CHARACTERS[0].id,
  gen: { mode: 'text', text: '', photoUrl: null, photoName: null },
  genPhase: 'idle',
  variantSeed: null,
  variantLabel: null,
  mateName: '',
  transitioning: false,
  error: null,
};

type Listener = (state: AppState, prev: AppState) => void;

const STORAGE_KEY = 'heymate.progress.v1';

export class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          progress: Record<string, SavedProgress>;
          credits?: number;
          viewUnlocked?: Record<string, boolean>;
          voiceFreeUses?: number;
          voiceCredits?: number;
        };
        this.state = {
          ...this.state,
          progress: saved.progress ?? {},
          credits: saved.credits ?? this.state.credits,
          viewUnlocked: saved.viewUnlocked ?? {},
          voiceFreeUses: saved.voiceFreeUses ?? this.state.voiceFreeUses,
          voiceCredits: saved.voiceCredits ?? this.state.voiceCredits,
        };
      }
    } catch {
      /* private mode or corrupt entry: start fresh */
    }
  }

  get(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<AppState>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    for (const fn of this.listeners) fn(this.state, prev);
  }

  goto(step: Step): void {
    this.set({ step, error: null });
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          progress: this.state.progress,
          credits: this.state.credits,
          viewUnlocked: this.state.viewUnlocked,
          voiceFreeUses: this.state.voiceFreeUses,
          voiceCredits: this.state.voiceCredits,
        })
      );
    } catch {
      /* storage unavailable: keep the in-memory copy */
    }
  }

  // ---- companion ----

  progressFor(id = this.state.residentId): SavedProgress {
    const saved = this.state.progress[id];
    if (saved) {
      return {
        ...saved,
        persona: saved.persona ?? '',
        completedQuests: saved.completedQuests ?? [],
      };
    }
    return {
      memories: [],
      revealed: 0,
      nickname: '',
      persona: '',
      visits: 0,
      completedQuests: [],
    };
  }

  /** Start a fresh encounter with a resident, seeded by any saved progress. */
  beginEncounter(id: ResidentId): void {
    const saved = this.progressFor(id);
    this.set({
      residentId: id,
      chat: [],
          turns: 0,
      speaking: false,
      thinking: false,
      voicing: false,
      revealed: saved.revealed,
      sessionPanelOpen: false,
          activeQuestId: null,
          saveGateOpen: false,
      unlockGateOpen: false,
      session: { ...defaultSession(), nickname: saved.nickname, persona: saved.persona },
    });
  }

  updateSession(patch: Partial<SessionSetup>): void {
    this.set({ session: { ...this.state.session, ...patch } });
  }

  resetSession(): void {
    const saved = this.progressFor();
    this.set({ session: { ...defaultSession(), nickname: saved.nickname, persona: saved.persona } });
  }

  pushTurn(turn: ChatTurn): void {
    const turns = turn.from === 'user' ? this.state.turns + 1 : this.state.turns;
    this.set({ chat: [...this.state.chat, turn].slice(-60), turns });
  }

  get freeTurnsLeft(): number {
    return Math.max(0, FREE_TURNS - this.state.turns);
  }

  /**
   * Spend a credit to keep the selected memories for next time. The nickname
   * is stored as a setting rather than a memory, so callbacks never try to
   * say "you mentioned to call you Q".
   */
  saveChapter(memories: string[]): boolean {
    if (this.state.credits < 1) return false;
    const id = this.state.residentId;
    const prev = this.progressFor(id);
    const conversational = memories.filter((m) => !m.startsWith('gọi anh là '));
    const progress = {
      ...this.state.progress,
      [id]: {
        memories: [...prev.memories, ...conversational].slice(-8),
        revealed: this.state.revealed,
        nickname: this.state.session.nickname || prev.nickname,
        persona: this.state.session.persona || prev.persona,
        visits: prev.visits + 1,
        completedQuests: prev.completedQuests,
      },
    };
    this.set({ progress, credits: this.state.credits - 1, saveGateOpen: false });
    this.persist();
    return true;
  }

  /** Turn-around view: one credit, or a code from a physical box insert. */
  unlockView(withCode?: string): 'ok' | 'bad-code' | 'no-credits' {
    if (withCode === '__owned') {
      // A variant the user made is theirs; no purchase involved.
    } else if (withCode !== undefined) {
      if (withCode.trim().toUpperCase() !== UNLOCK_CODE) return 'bad-code';
    } else if (this.state.credits < 1) {
      return 'no-credits';
    }
    this.set({
      viewUnlocked: { ...this.state.viewUnlocked, [this.state.residentId]: true },
      credits: withCode === undefined ? this.state.credits - 1 : this.state.credits,
      unlockGateOpen: false,
    });
    this.persist();
    return 'ok';
  }

  get viewIsUnlocked(): boolean {
    return !!this.state.viewUnlocked[this.state.residentId];
  }

  get voiceFreeRemaining(): number {
    return Math.max(0, FREE_VOICE_MESSAGES - this.state.voiceFreeUses);
  }

  /** Consume a free TTS use first, then a paid voice credit. */
  spendVoiceMessage(): 'free' | 'credit' | 'none' {
    if (this.voiceFreeRemaining > 0) {
      this.set({ voiceFreeUses: this.state.voiceFreeUses + 1 });
      this.persist();
      return 'free';
    }
    if (this.state.voiceCredits > 0) {
      this.set({ voiceCredits: this.state.voiceCredits - 1 });
      this.persist();
      return 'credit';
    }
    return 'none';
  }

  /** Start the next quest in a resident's ordered story path. */
  startQuest(id: string): boolean {
    const quest = questById(id);
    if (!quest || quest.residentId !== this.state.residentId) return false;
    const saved = this.progressFor();
    const next = questsForResident(quest.residentId).find((item) => !saved.completedQuests.includes(item.id));
    if (next?.id !== id) return false;
    this.set({ activeQuestId: id });
    return true;
  }

  /** A thoughtful answer completes the active quest and permanently unlocks its story beat. */
  completeActiveQuest(message: string): QuestDefinition | null {
    const id = this.state.activeQuestId;
    const quest = id ? questById(id) : undefined;
    if (!quest || quest.residentId !== this.state.residentId || message.trim().length < quest.minCharacters) {
      return null;
    }
    const prev = this.progressFor();
    if (prev.completedQuests.includes(quest.id)) return null;
    const progress = {
      ...this.state.progress,
      [quest.residentId]: {
        ...prev,
        revealed: Math.max(prev.revealed, quest.rewardEpisode + 1),
        completedQuests: [...prev.completedQuests, quest.id],
      },
    };
    this.set({
      progress,
      revealed: Math.max(this.state.revealed, quest.rewardEpisode + 1),
      activeQuestId: null,
        });
    this.persist();
    return quest;
  }

  // ---- creator ----

  selectCharacter(id: string): void {
    if (this.state.characterId !== id) {
      this.set({ characterId: id, genPhase: 'idle', variantSeed: null, variantLabel: null });
    }
  }

  setGen(patch: Partial<GenInput>): void {
    this.set({ gen: { ...this.state.gen, ...patch } });
  }

  clearPhoto(): void {
    const { photoUrl } = this.state.gen;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    this.setGen({ photoUrl: null, photoName: null });
  }

  /** Back to the gallery. Saved progress and credits survive. */
  leaveUniverse(): void {
    const { photoUrl } = this.state.gen;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    this.set({
      ...initialState,
      progress: this.state.progress,
      credits: this.state.credits,
      viewUnlocked: this.state.viewUnlocked,
      voiceFreeUses: this.state.voiceFreeUses,
      voiceCredits: this.state.voiceCredits,
    });
  }

  restart(): void {
    this.leaveUniverse();
  }
}

export const store = new Store();
