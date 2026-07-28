import { CHARACTERS } from '../config/characters';
import { RESIDENTS, type ResidentId, type VoiceSlot } from '../config/residents';
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
  visits: number;
}

export const FREE_TURNS = 5;

function defaultSession(): SessionSetup {
  return {
    nickname: '',
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
  chatOpen: boolean;
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
  saveGateOpen: boolean;
  credits: number;

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
  chatOpen: false,
  turns: 0,
  speaking: false,
  thinking: false,
  voicing: false,
  revealed: 0,
  sessionPanelOpen: false,
  saveGateOpen: false,
  credits: 3,
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
        const saved = JSON.parse(raw) as { progress: Record<string, SavedProgress>; credits?: number };
        this.state = {
          ...this.state,
          progress: saved.progress ?? {},
          credits: saved.credits ?? this.state.credits,
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
        JSON.stringify({ progress: this.state.progress, credits: this.state.credits })
      );
    } catch {
      /* storage unavailable: keep the in-memory copy */
    }
  }

  // ---- companion ----

  progressFor(id = this.state.residentId): SavedProgress {
    return this.state.progress[id] ?? { memories: [], revealed: 0, nickname: '', visits: 0 };
  }

  /** Start a fresh encounter with a resident, seeded by any saved progress. */
  beginEncounter(id: ResidentId): void {
    const saved = this.progressFor(id);
    this.set({
      residentId: id,
      chat: [],
      chatOpen: false,
      turns: 0,
      speaking: false,
      thinking: false,
      voicing: false,
      revealed: saved.revealed,
      sessionPanelOpen: false,
      saveGateOpen: false,
      session: { ...defaultSession(), nickname: saved.nickname },
    });
  }

  updateSession(patch: Partial<SessionSetup>): void {
    this.set({ session: { ...this.state.session, ...patch } });
  }

  resetSession(): void {
    this.set({ session: { ...defaultSession(), nickname: this.progressFor().nickname } });
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
    const conversational = memories.filter((m) => !m.startsWith('to call you '));
    const progress = {
      ...this.state.progress,
      [id]: {
        memories: [...prev.memories, ...conversational].slice(-8),
        revealed: this.state.revealed,
        nickname: this.state.session.nickname || prev.nickname,
        visits: prev.visits + 1,
      },
    };
    this.set({ progress, credits: this.state.credits - 1, saveGateOpen: false });
    this.persist();
    return true;
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
    this.set({ ...initialState, progress: this.state.progress, credits: this.state.credits });
  }

  restart(): void {
    this.leaveUniverse();
  }
}

export const store = new Store();
