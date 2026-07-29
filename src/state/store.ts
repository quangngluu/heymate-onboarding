import { CHARACTERS } from '../config/characters';
import { RESIDENTS, type ResidentId, type VoiceSlot } from '../config/residents';
import {
  questById,
  questNode,
  questsForResident,
  type QuestChoice,
  type QuestDefinition,
} from '../config/quests';
import type { LengthId, MoodId, ScenarioId, StyleId } from '../config/residents';
import {
  COST,
  START_CREDITS,
  STORY_QUEST_REWARD,
  TOPUP_AMOUNT,
  TOPUP_CODE,
  type CreditFeature,
  type Spend,
} from '../config/economy';
import {
  onboardingQuestFor,
  type OnboardingTrigger,
} from '../config/onboarding-quests';

export { COST } from '../config/economy';
export type { Spend } from '../config/economy';

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
  /** Who the visitor is entering as. Free text; never a list. */
  identity: string;
}

/** Persisted per resident, and only after the user spends a credit. */
export interface SavedProgress {
  memories: string[];
  revealed: number;
  nickname: string;
  persona: string;
  /** Who he came in as last time, so she can greet that person again. */
  identity: string;
  visits: number;
  completedQuests: string[];
}

/** Mock unlock code, as if printed on the figurine's box. */
export const UNLOCK_CODE = 'HEYMATE360';

export interface CreditTransaction {
  id: string;
  kind: 'earn' | 'spend';
  feature: CreditFeature;
  amount: number;
  createdAt: number;
}

export interface QuestChoiceResult {
  quest: QuestDefinition;
  choice: QuestChoice;
  completed: boolean;
  nextPrompt?: string;
}

function defaultSession(): SessionSetup {
  return {
    nickname: '',
    persona: '',
    scenario: 'casual',
    mood: 'calm',
    style: 'balanced',
    length: 'natural',
    voice: 'signature',
    identity: '',
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
  /**
   * A committed line being revealed word by word. Purely presentational: the
   * chat array is already complete, this only says how much of one turn has
   * been uncovered so far.
   */
  reveal: { turn: number; words: number } | null;
  /** Session-scoped reveal count, seeded from saved progress. */
  revealed: number;
  sessionPanelOpen: boolean;
  walletOpen: boolean;
  questHubOpen: boolean;
  activeQuestId: string | null;
  activeQuestNodeId: string | null;
  saveGateOpen: boolean;
  /** Full 360 inspection, bought or unlocked by code. Per resident. */
  viewUnlocked: Record<string, boolean>;
  unlockGateOpen: boolean;
  credits: number;
  transactions: CreditTransaction[];
  onboardingCompleted: string[];
  /** Set when a spend was refused, so the dock can say which one and why. */
  broke: Spend | null;
  storyFlags: Record<string, string[]>;
  questOutcomes: Record<string, string>;
  /** Every authored consequence in order, not only the final ending. */
  questHistory: Record<string, string[]>;
  /** Turn the last scene closed on, so the next one does not follow instantly. */
  questClosedAt: number;
  /**
   * Pictures of the places a branch left behind, keyed by the choice's
   * imageKey and persisted: taking the same branch again should not redraw it.
   */
  sceneShots: Record<string, string>;
  /** Which shot belongs to which turn on screen. Session only. */
  turnShots: Record<number, string>;

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
  reveal: null,
  revealed: 0,
  sessionPanelOpen: false,
  walletOpen: false,
  questHubOpen: false,
  activeQuestId: null,
  activeQuestNodeId: null,
  saveGateOpen: false,
  viewUnlocked: {},
  unlockGateOpen: false,
  credits: START_CREDITS,
  transactions: [],
  onboardingCompleted: [],
  broke: null,
  storyFlags: {},
  questOutcomes: {},
  questHistory: {},
  questClosedAt: -99,
  sceneShots: {},
  turnShots: {},

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
          transactions?: CreditTransaction[];
          onboardingCompleted?: string[];
          storyFlags?: Record<string, string[]>;
          sceneShots?: Record<string, string>;
          questOutcomes?: Record<string, string>;
          questHistory?: Record<string, string[]>;
        };
        this.state = {
          ...this.state,
          progress: saved.progress ?? {},
          credits: saved.credits ?? this.state.credits,
          viewUnlocked: saved.viewUnlocked ?? {},
          transactions: saved.transactions ?? [],
          onboardingCompleted: saved.onboardingCompleted ?? [],
          storyFlags: saved.storyFlags ?? {},
          sceneShots: saved.sceneShots ?? {},
          questOutcomes: saved.questOutcomes ?? {},
          questHistory: saved.questHistory ?? {},
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
          transactions: this.state.transactions,
          onboardingCompleted: this.state.onboardingCompleted,
          storyFlags: this.state.storyFlags,
          sceneShots: this.state.sceneShots,
          questOutcomes: this.state.questOutcomes,
          questHistory: this.state.questHistory,
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
        identity: saved.identity ?? '',
        completedQuests: saved.completedQuests ?? [],
      };
    }
    return {
      memories: [],
      revealed: 0,
      nickname: '',
      persona: '',
      identity: '',
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
      reveal: null,
      revealed: saved.revealed,
      sessionPanelOpen: false,
      walletOpen: false,
      questHubOpen: false,
      activeQuestId: null,
      activeQuestNodeId: null,
      saveGateOpen: false,
      unlockGateOpen: false,
      session: {
        ...defaultSession(),
        nickname: saved.nickname,
        persona: saved.persona,
        identity: saved.identity,
      },
    });
  }

  updateSession(patch: Partial<SessionSetup>): void {
    this.set({ session: { ...this.state.session, ...patch } });
  }

  resetSession(): void {
    const saved = this.progressFor();
    this.set({
      session: { ...defaultSession(), nickname: saved.nickname, persona: saved.persona },
    });
  }

  pushTurn(turn: ChatTurn): void {
    const turns = turn.from === 'user' ? this.state.turns + 1 : this.state.turns;
    this.set({ chat: [...this.state.chat, turn].slice(-60), turns });
  }

  /**
   * How close she is, 0 to 5. It tracks opened memories, and those only open
   * through a quest the visitor actually chose to finish, so the ladder can
   * never be climbed by talking a lot.
   */
  get level(): number {
    return Math.min(5, this.progressFor().revealed);
  }

  /** What a given action would leave her, or -1 when it cannot be afforded. */
  canAfford(what: Spend): boolean {
    return this.state.credits >= COST[what];
  }

  private transaction(kind: CreditTransaction['kind'], feature: CreditFeature, amount: number): CreditTransaction {
    const createdAt = Date.now();
    return {
      id: `${createdAt}-${this.state.transactions.length}`,
      kind,
      feature,
      amount,
      createdAt,
    };
  }

  /**
   * Take the price of an action. Refusal is recorded rather than thrown, so
   * the dock can name which action ran out instead of failing silently.
   */
  spend(what: Spend): boolean {
    if (!this.canAfford(what)) {
      this.set({ broke: what });
      return false;
    }
    const transaction = this.transaction('spend', what, COST[what]);
    this.set({
      credits: this.state.credits - COST[what],
      transactions: [...this.state.transactions, transaction].slice(-30),
      broke: null,
    });
    this.persist();
    return true;
  }

  /** Redeem the box code for more credits. */
  redeem(code: string): 'ok' | 'bad-code' {
    if (code.trim().toUpperCase() !== TOPUP_CODE) return 'bad-code';
    const transaction = this.transaction('earn', 'redeem', TOPUP_AMOUNT);
    this.set({
      credits: this.state.credits + TOPUP_AMOUNT,
      transactions: [...this.state.transactions, transaction].slice(-30),
      broke: null,
    });
    this.persist();
    return 'ok';
  }

  /** One-time, action-based rewards teach the product without polluting canon. */
  completeOnboarding(trigger: OnboardingTrigger): number {
    const quest = onboardingQuestFor(trigger);
    if (!quest || this.state.onboardingCompleted.includes(quest.id)) return 0;
    const transaction = this.transaction('earn', 'onboardingQuest', quest.rewardCredits);
    this.set({
      credits: this.state.credits + quest.rewardCredits,
      onboardingCompleted: [...this.state.onboardingCompleted, quest.id],
      transactions: [...this.state.transactions, transaction].slice(-30),
    });
    this.persist();
    return quest.rewardCredits;
  }

  /**
   * Spend a credit to keep the selected memories for next time. The nickname
   * is stored as a setting rather than a memory, so callbacks never try to
   * say "you mentioned to call you Q".
   */
  saveChapter(memories: string[]): boolean {
    if (!this.canAfford('saveChapter')) {
      this.set({ broke: 'saveChapter' });
      return false;
    }
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
        identity: this.state.session.identity || prev.identity,
        visits: prev.visits + 1,
        completedQuests: prev.completedQuests,
      },
    };
    const transaction = this.transaction('spend', 'saveChapter', COST.saveChapter);
    this.set({
      progress,
      credits: this.state.credits - COST.saveChapter,
      transactions: [...this.state.transactions, transaction].slice(-30),
      saveGateOpen: false,
      broke: null,
    });
    this.persist();
    return true;
  }

  /** Turn-around view: one credit, or a code from a physical box insert. */
  unlockView(withCode?: string): 'ok' | 'bad-code' | 'no-credits' {
    if (withCode === '__owned') {
      // A variant the user made is theirs; no purchase involved.
    } else if (withCode !== undefined) {
      // The box code and the top-up code both open the turntable; a visitor
      // who has just paid for credits should not be told no twice.
      const given = withCode.trim().toUpperCase();
      if (given !== UNLOCK_CODE && given !== TOPUP_CODE) return 'bad-code';
      if (given === TOPUP_CODE) {
        const transaction = this.transaction('earn', 'redeem', TOPUP_AMOUNT);
        this.set({
          credits: this.state.credits + TOPUP_AMOUNT,
          transactions: [...this.state.transactions, transaction].slice(-30),
        });
      }
    } else if (!this.canAfford('turntable')) {
      this.set({ broke: 'turntable' });
      return 'no-credits';
    }
    const spendsCredits = withCode === undefined;
    const transaction = spendsCredits
      ? this.transaction('spend', 'turntable', COST.turntable)
      : null;
    this.set({
      viewUnlocked: { ...this.state.viewUnlocked, [this.state.residentId]: true },
      credits: spendsCredits ? this.state.credits - COST.turntable : this.state.credits,
      transactions: transaction
        ? [...this.state.transactions, transaction].slice(-30)
        : this.state.transactions,
      unlockGateOpen: false,
      broke: null,
    });
    this.persist();
    return 'ok';
  }

  get viewIsUnlocked(): boolean {
    return !!this.state.viewUnlocked[this.state.residentId];
  }



  /** Start the next quest in a resident's ordered story path. */
  /** Exactly one authored arc per resident. */
  questsFor(id = this.state.residentId): QuestDefinition[] {
    return questsForResident(id);
  }

  questById2(id: string): QuestDefinition | undefined {
    return this.questsFor().find((q) => q.id === id) ?? questById(id);
  }

  /** The next scene she has not run yet, if there is one. */
  nextQuest(id = this.state.residentId): QuestDefinition | undefined {
    const done = this.progressFor(id).completedQuests;
    return this.questsFor(id).find((q) => !done.includes(q.id));
  }

  startQuest(id: string): boolean {
    const quest = this.questById2(id);
    if (!quest || quest.residentId !== this.state.residentId) return false;
    if (this.nextQuest()?.id !== id) return false;
    const prev = this.progressFor(quest.residentId);
    const revealed = Math.max(prev.revealed, 1);
    this.set({
      progress: {
        ...this.state.progress,
        [quest.residentId]: { ...prev, revealed },
      },
      revealed: Math.max(this.state.revealed, revealed),
      activeQuestId: id,
      activeQuestNodeId: quest.startNodeId,
      questHubOpen: false,
    });
    this.persist();
    return true;
  }

  /**
   * Advance an explicit branch. Free chat can enrich the scene, but only an
   * authored choice changes canon or pays a quest reward.
   */
  /**
   * Give back what an action charged for but never delivered. A drawing that
   * fails upstream must not quietly cost the visitor anything.
   */
  refund(what: Spend): void {
    const transaction = this.transaction('earn', what, COST[what]);
    this.set({
      credits: this.state.credits + COST[what],
      transactions: [...this.state.transactions, transaction].slice(-30),
    });
    this.persist();
  }

  /** Remember a drawing so the same branch never pays to be drawn twice. */
  keepShot(imageKey: string, url: string): void {
    this.set({ sceneShots: { ...this.state.sceneShots, [imageKey]: url } });
    this.persist();
  }

  /** Attach an already-known drawing to the line it belongs to. */
  showShot(turn: number, imageKey: string): void {
    this.set({ turnShots: { ...this.state.turnShots, [turn]: imageKey } });
  }

  chooseActiveQuest(choiceId: string): QuestChoiceResult | null {
    const id = this.state.activeQuestId;
    const quest = id ? this.questById2(id) : undefined;
    if (!quest || quest.residentId !== this.state.residentId) return null;
    const node = questNode(quest, this.state.activeQuestNodeId ?? quest.startNodeId);
    const choice = node.choices.find((item) => item.id === choiceId);
    if (!choice) return null;
    const residentFlags = this.state.storyFlags[quest.residentId] ?? [];
    const storyFlags = {
      ...this.state.storyFlags,
      [quest.residentId]: residentFlags.includes(choice.flag)
        ? residentFlags
        : [...residentFlags, choice.flag],
    };
    const prev = this.progressFor();
    const revealed =
      choice.unlockEpisode === undefined
        ? prev.revealed
        : Math.max(prev.revealed, choice.unlockEpisode + 1);
    const progress = {
      ...this.state.progress,
      [quest.residentId]: {
        ...prev,
        revealed,
      },
    };
    const questHistory = {
      ...this.state.questHistory,
      [quest.id]: [...(this.state.questHistory[quest.id] ?? []), choice.outcome].slice(-12),
    };
    if (choice.nextNodeId) {
      const next = questNode(quest, choice.nextNodeId);
      this.set({
        progress,
        revealed: Math.max(this.state.revealed, revealed),
        activeQuestNodeId: choice.nextNodeId,
        storyFlags,
        questOutcomes: { ...this.state.questOutcomes, [quest.id]: choice.outcome },
        questHistory,
      });
      this.persist();
      return { quest, choice, completed: false, nextPrompt: next.prompt };
    }

    if (prev.completedQuests.includes(quest.id)) return null;
    progress[quest.residentId] = {
      ...progress[quest.residentId],
      completedQuests: [...prev.completedQuests, quest.id],
    };
    const transaction = this.transaction('earn', 'storyQuest', STORY_QUEST_REWARD);
    this.set({
      progress,
      revealed: Math.max(this.state.revealed, revealed),
      credits: this.state.credits + STORY_QUEST_REWARD,
      transactions: [...this.state.transactions, transaction].slice(-30),
      storyFlags,
      questOutcomes: { ...this.state.questOutcomes, [quest.id]: choice.outcome },
      questHistory,
      activeQuestId: null,
      activeQuestNodeId: null,
      questClosedAt: this.state.turns,
    });
    this.persist();
    return { quest, choice, completed: true };
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
      transactions: this.state.transactions,
      onboardingCompleted: this.state.onboardingCompleted,
      storyFlags: this.state.storyFlags,
      questOutcomes: this.state.questOutcomes,
      questHistory: this.state.questHistory,
    });
  }

  restart(): void {
    this.leaveUniverse();
  }
}

export const store = new Store();
