import { CHARACTERS } from '../config/characters';
import { WAIFUS, waifuById, type WaifuPersona } from '../config/waifus';

export type Step =
  | 'gallery' // universe picker (outer)
  | 'arrival' // creator universe: portal intro
  | 'studio' // creator universe: pick character + generate
  | 'reveal' // creator universe: your Mate
  | 'joined' // creator universe: lineup
  | 'stage'; // companion universe: waifu on the base

export type GenMode = 'text' | 'photo';

export interface GenInput {
  mode: GenMode;
  text: string;
  /** Local object URL for the uploaded photo preview. Never leaves the browser. */
  photoUrl: string | null;
  photoName: string | null;
}

export type GenPhase = 'idle' | 'processing' | 'done';

export interface ChatTurn {
  from: 'user' | 'waifu';
  text: string;
}

export interface AppState {
  step: Step;
  /** null while browsing the gallery. */
  universeId: string | null;

  // --- companion universe ---
  waifuId: string;
  /** Per-waifu persona overrides applied on top of the config defaults. */
  personas: Record<string, WaifuPersona>;
  chat: ChatTurn[];
  chatOpen: boolean;
  /** True while a greeting or reply is "being spoken" (drives base pulse). */
  speaking: boolean;

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

function defaultPersonas(): Record<string, WaifuPersona> {
  const out: Record<string, WaifuPersona> = {};
  for (const w of WAIFUS) out[w.id] = { ...w.defaults };
  return out;
}

const initialState: AppState = {
  step: 'gallery',
  universeId: null,
  waifuId: WAIFUS[0].id,
  personas: defaultPersonas(),
  chat: [],
  chatOpen: false,
  speaking: false,
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

const STORAGE_KEY = 'heymate.personas.v1';

export class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();

  constructor() {
    // Persona edits survive a reload; nothing else is persisted.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, WaifuPersona>;
        this.state = { ...this.state, personas: { ...this.state.personas, ...saved } };
      }
    } catch {
      /* private mode or corrupt entry: fall back to defaults */
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

  // ---- companion ----

  selectWaifu(id: string): void {
    if (this.state.waifuId === id) return;
    this.set({ waifuId: id, chat: [], chatOpen: false, speaking: false });
  }

  persona(id = this.state.waifuId): WaifuPersona {
    return this.state.personas[id] ?? waifuById(id).defaults;
  }

  updatePersona(id: string, patch: Partial<WaifuPersona>): void {
    const personas = { ...this.state.personas, [id]: { ...this.persona(id), ...patch } };
    this.set({ personas });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(personas));
    } catch {
      /* storage unavailable: keep the in-memory edit */
    }
  }

  resetPersona(id: string): void {
    const personas = { ...this.state.personas, [id]: { ...waifuById(id).defaults } };
    this.set({ personas });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(personas));
    } catch {
      /* ignore */
    }
  }

  pushTurn(turn: ChatTurn): void {
    this.set({ chat: [...this.state.chat, turn].slice(-40) });
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

  /** Back to the gallery; per-universe progress resets, personas persist. */
  leaveUniverse(): void {
    const { photoUrl } = this.state.gen;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    this.set({
      ...initialState,
      personas: this.state.personas,
    });
  }

  restart(): void {
    this.leaveUniverse();
  }
}

export const store = new Store();
