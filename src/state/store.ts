import { CHARACTERS } from '../config/characters';

export type Step = 'arrival' | 'studio' | 'reveal' | 'joined';

export type GenMode = 'text' | 'photo';

export interface GenInput {
  mode: GenMode;
  text: string;
  /** Local object URL for the uploaded photo preview. Never leaves the browser. */
  photoUrl: string | null;
  photoName: string | null;
}

export type GenPhase = 'idle' | 'processing' | 'done';

export interface AppState {
  step: Step;
  universeId: string;
  /** Character currently framed in the studio. */
  characterId: string;
  gen: GenInput;
  genPhase: GenPhase;
  /** Deterministic seed derived from the user's input; drives the variant. */
  variantSeed: number | null;
  /** Label of the variant colorway applied to the Mate. */
  variantLabel: string | null;
  mateName: string;
  transitioning: boolean;
  error: string | null;
}

const initialState: AppState = {
  step: 'arrival',
  universeId: 'afterburn-city',
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

export class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();

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

  selectCharacter(id: string): void {
    if (this.state.characterId !== id) {
      // A new base character invalidates any generated variant.
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

  restart(): void {
    const { photoUrl } = this.state.gen;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    this.set({ ...initialState });
  }
}

export const store = new Store();
