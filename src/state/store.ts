import { CHARACTERS } from '../config/characters';
import { segments } from '../chat/dialogue';
import {
  PERSONAL_OUTPUTS,
  defaultBond,
  defaultRapport,
  sanitizeRapport,
  type BondDna,
  type Rapport,
} from '../config/bond';
import { RESIDENTS, type ResidentId } from '../config/residents';
import {
  questById,
  questNode,
  questsForResident,
  resolveFreeform,
  type QuestChoice,
  type QuestDefinition,
} from '../config/quests';
import type { LengthId, ScenarioId } from '../config/residents';
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
import { resolveCanonRoute } from '../config/canon-route';
import { canonRevealIndexFor } from '../config/canon-view';
import { presentableEndingFor, questPlayable } from '../quest/endings';
import type { V3Ending } from '../config/v3-canon';
import {
  nextOpenChatRewardTurn,
  selectOpenChatReward,
  visualById,
  type OpenChatVisual,
} from '../chat/open-chat-visuals';
import type {
  GeneratedOpenChatVisual,
  OpenChatContextProgress,
} from '../chat/context-visual';

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
  /** Stable owner for async visual work; legacy persisted turns may omit it. */
  id?: string;
  from: 'user' | 'resident';
  text: string;
  /** Open Chat only: an authored character frame inserted inside this reply. */
  visualId?: string;
  /** Spoken sentence boundary after which the visual becomes visible. */
  visualAfterSentence?: number;
  /** A model-suggested scene whose generation lifecycle belongs to this turn. */
  contextVisual?: GeneratedOpenChatVisual;
}

export interface OpenChatRewardProgress {
  seenIds: string[];
  nextTurn: number;
}

export type ConversationScope = `chat:${ResidentId}` | `quest:${string}`;

export type CanonType =
  | 'fixed'
  | 'branch'
  | 'relationship'
  | 'player-created'
  | 'speculation'
  | 'rejected';

/** A permanent fact produced inside Quest Mode, separate from any transcript. */
export interface CanonLedgerEntry {
  id: string;
  residentId: ResidentId;
  questId: string;
  nodeId: string;
  canonType: CanonType;
  text: string;
  createdAt: number;
}

/**
 * The small, deliberate bridge between modes.
 *
 * Raw Open Chat turns never enter this list. Only a stable principle or a
 * relationship event selected by product logic may cross the boundary.
 */
export interface CrossModeMemory {
  id: string;
  residentId: ResidentId;
  direction: 'chat-to-quest' | 'quest-to-chat' | 'both';
  kind:
    | 'preference'
    | 'boundary'
    | 'principle'
    | 'relationship'
    | 'private-object'
    | 'oath'
    | 'nickname'
    | 'conflict';
  text: string;
  createdAt: number;
}

/** Session-only: applies to this encounter and is never persisted. */
export interface SessionSetup {
  /** Visitor preference for the resident's conversational presence, never canon. */
  persona: string;
  /** Open Chat context. Quest scenes ignore it and supply their own setting. */
  scenario: ScenarioId;
  length: LengthId;
  /** Who the visitor is entering as. Free text; never a list. */
  identity: string;
}

/** Persisted per resident, and only after the user spends a credit. */
export interface SavedProgress {
  memories: string[];
  revealed: number;
  /** Legacy only: migrated into bond.address when a v1 save is loaded. */
  nickname?: string;
  persona: string;
  /** Who he came in as last time, so she can greet that person again. */
  identity: string;
  visits: number;
  completedQuests: string[];
  /**
   * The relationship this player shaped, and where it currently stands.
   *
   * These persist per resident because they are the whole point: two players
   * with the same resident should not have the same her. Optional so saves
   * written before the bond layer keep loading.
   */
  bond?: BondDna;
  rapport?: Rapport;
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

export interface CreditReservation {
  id: string;
  feature: Spend;
  amount: number;
  createdAt: number;
}

export interface QuestChoiceResult {
  quest: QuestDefinition;
  choice: QuestChoice;
  completed: boolean;
  nextPrompt?: string;
  /** Present only for a valid terminal; null means the fail-closed surface. */
  ending?: V3Ending | null;
  error?: 'ending-unavailable';
}

function defaultSession(): SessionSetup {
  return {
    persona: '',
    scenario: 'casual',
    length: 'natural',
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
  /** Open Chat only. Quest dialogue is held in `questChat`. */
  chat: ChatTurn[];
  /**
   * Every resident's transcript, kept across a switch and across a reload.
   *
   * `chat` is the one on stage; this is where the others wait. Leaving her for
   * someone else used to throw the conversation away, so coming back opened on
   * the greeting again — she remembered the bond and not a word of how it was
   * earned. Written on every turn rather than at the save gate, because the
   * gate buys *memories she will quote*, which is a different promise from
   * simply not losing the thread.
   */
  transcripts: Record<string, ChatTurn[]>;
  /** Current Quest Mode scene transcript. Never merged into Open Chat. */
  questChat: ChatTurn[];
  /** Quest dialogue persisted per authored arc for checkpoint resumes. */
  questTranscripts: Record<string, ChatTurn[]>;
  /** User turns spent with the resident on stage; gates the free encounter. */
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
  /**
   * The bond and the relationship state for the resident on stage.
   *
   * Live copies: `progress[id]` holds what was paid for and kept, these hold
   * what is true right now. Rapport moves every turn, so it cannot wait for a
   * save gate — but it is only written to disk when a chapter is saved.
   */
  bond: BondDna;
  rapport: Rapport;
  sessionPanelOpen: boolean;
  walletOpen: boolean;
  questHubOpen: boolean;
  activeQuestId: string | null;
  activeQuestNodeId: string | null;
  /** Session-only landing being presented; the permanent id lives in questEndings. */
  activeQuestEndingId: string | null;
  questPhase: 'none' | 'threshold' | 'episode' | 'ending';
  questInterruptible: boolean;
  saveGateOpen: boolean;
  /** Full 360 inspection, bought or unlocked by code. Per resident. */
  viewUnlocked: Record<string, boolean>;
  unlockGateOpen: boolean;
  credits: number;
  /** Session-only holds; the durable balance changes only after delivery. */
  creditReservations: Record<string, CreditReservation>;
  transactions: CreditTransaction[];
  onboardingCompleted: string[];
  /** Set when a spend was refused, so the dock can say which one and why. */
  broke: Spend | null;
  storyFlags: Record<string, string[]>;
  questOutcomes: Record<string, string>;
  /**
   * Which authored ending each finished quest landed on, by ending id.
   *
   * Separate from `questOutcomes`, which holds the last branch's prose. This is
   * the arc's landing, and it exists because the endings were authored and
   * nothing recorded reaching one.
   */
  questEndings: Record<string, string>;
  /** Every authored consequence in order, not only the final ending. */
  questHistory: Record<string, string[]>;
  /** Permanent Quest facts, classified independently from relationship memory. */
  canonLedger: CanonLedgerEntry[];
  /** Explicitly approved summaries that may cross the mode boundary. */
  crossModeMemory: CrossModeMemory[];
  /** Last safe node for each unfinished quest. */
  questCheckpoints: Record<string, string>;
  /** Turn the last scene closed on, so the next one does not follow instantly. */
  questClosedAt: number;
  /**
   * Pictures of branch outcomes keyed by the versioned visual cache key.
   * Repeating the same resolved specification must not redraw it.
   */
  sceneShots: Record<string, string>;
  /** Which cached shot belongs to a scoped conversation turn. Session only. */
  turnShots: Record<string, string>;
  /** Per-resident authored reward deck progress; Open Chat only. */
  openChatRewards: Record<string, OpenChatRewardProgress>;
  /** Per-resident generated-frame allowance and cooldown. */
  openChatContext: Record<string, OpenChatContextProgress>;

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

export function chatConversationScope(residentId: ResidentId): ConversationScope {
  return `chat:${residentId}`;
}

export function questConversationScope(questId: string): ConversationScope {
  return `quest:${questId}`;
}

export function shotOwnerKey(scope: ConversationScope, turn: number): string {
  return `${scope}:${turn}`;
}

/** Changes when either an owner or its attached cache key changes. */
export function shotAssignmentsSignature(turnShots: Record<string, string>): string {
  return Object.entries(turnShots)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([owner, cacheKey]) => `${owner}=${cacheKey}`)
    .join('|');
}

/** Balance that remains spendable after in-flight deliveries reserve their price. */
export function availableCredits(
  state: Pick<AppState, 'credits' | 'creditReservations'>
): number {
  const reserved = Object.values(state.creditReservations).reduce(
    (total, reservation) => total + reservation.amount,
    0
  );
  return Math.max(0, state.credits - reserved);
}

const initialState: AppState = {
  step: 'gallery',
  universeId: null,
  residentId: RESIDENTS[0].id,
  session: defaultSession(),
  progress: {},
  chat: [],
  transcripts: {},
  questChat: [],
  questTranscripts: {},
  turns: 0,
  speaking: false,
  thinking: false,
  voicing: false,
  reveal: null,
  revealed: 0,
  bond: defaultBond(),
  rapport: defaultRapport(),
  sessionPanelOpen: false,
  walletOpen: false,
  questHubOpen: false,
  activeQuestId: null,
  activeQuestNodeId: null,
  activeQuestEndingId: null,
  questPhase: 'none',
  questInterruptible: false,
  saveGateOpen: false,
  viewUnlocked: {},
  unlockGateOpen: false,
  credits: START_CREDITS,
  creditReservations: {},
  transactions: [],
  onboardingCompleted: [],
  broke: null,
  storyFlags: {},
  questOutcomes: {},
  questEndings: {},
  questHistory: {},
  canonLedger: [],
  crossModeMemory: [],
  questCheckpoints: {},
  questClosedAt: -99,
  sceneShots: {},
  turnShots: {},
  openChatRewards: {},
  openChatContext: {},

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

// v1 contains Hub/origin test conversations and numeric reveal progress. K
// explicitly chose a clean v3 cutover, so no legacy story state is migrated.
const STORAGE_KEY = 'heymate.progress.sao.v1';

function legacyAddress(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, 28)
    : '';
}

function migrateSavedProgress(saved: SavedProgress): SavedProgress {
  const { nickname, ...current } = saved;
  const bond = { ...defaultBond(), ...(saved.bond ?? {}) };
  if (!bond.address) bond.address = legacyAddress(nickname);
  return {
    ...current,
    persona: saved.persona ?? '',
    identity: saved.identity ?? '',
    completedQuests: saved.completedQuests ?? [],
    bond,
    rapport: sanitizeRapport(saved.rapport ?? defaultRapport()),
  };
}

function migrateProgress(progress: Record<string, SavedProgress>): Record<string, SavedProgress> {
  return Object.fromEntries(
    Object.entries(progress).map(([residentId, saved]) => [residentId, migrateSavedProgress(saved)])
  );
}

function restoreOpenChatTranscripts(
  transcripts: Record<string, ChatTurn[]>
): Record<string, ChatTurn[]> {
  return Object.fromEntries(
    Object.entries(transcripts).map(([residentId, turns]) => [
      residentId,
      turns.map((turn) =>
        turn.contextVisual?.status === 'generating'
          ? {
              ...turn,
              contextVisual: {
                ...turn.contextVisual,
                status:
                  turn.contextVisual.payment === 'free-auto'
                    ? ('failed' as const)
                    : ('offered' as const),
                src: undefined,
              },
            }
          : turn
      ),
    ])
  );
}

export class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();
  private turnSerial = 0;

  constructor(private random: () => number = Math.random) {
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
          questEndings?: Record<string, string>;
          questHistory?: Record<string, string[]>;
          transcripts?: Record<string, ChatTurn[]>;
          questTranscripts?: Record<string, ChatTurn[]>;
          canonLedger?: CanonLedgerEntry[];
          crossModeMemory?: CrossModeMemory[];
          questCheckpoints?: Record<string, string>;
          openChatRewards?: Record<string, OpenChatRewardProgress>;
          openChatContext?: Record<string, OpenChatContextProgress>;
        };
        this.state = {
          ...this.state,
          progress: migrateProgress(saved.progress ?? {}),
          transcripts: restoreOpenChatTranscripts(saved.transcripts ?? {}),
          questTranscripts: saved.questTranscripts ?? {},
          credits: saved.credits ?? this.state.credits,
          viewUnlocked: saved.viewUnlocked ?? {},
          transactions: saved.transactions ?? [],
          onboardingCompleted: saved.onboardingCompleted ?? [],
          storyFlags: saved.storyFlags ?? {},
          sceneShots: saved.sceneShots ?? {},
          questOutcomes: saved.questOutcomes ?? {},
          questEndings: saved.questEndings ?? {},
          questHistory: saved.questHistory ?? {},
          canonLedger: saved.canonLedger ?? [],
          crossModeMemory: saved.crossModeMemory ?? [],
          questCheckpoints: saved.questCheckpoints ?? {},
          openChatRewards: saved.openChatRewards ?? {},
          openChatContext: Object.fromEntries(
            Object.entries(saved.openChatContext ?? {}).map(([residentId, progress]) => [
              residentId,
              {
                freeState: progress.freeState === 'consumed' ? 'consumed' : 'available',
                lastDeliveredTurn:
                  typeof progress.lastDeliveredTurn === 'number'
                    ? progress.lastDeliveredTurn
                    : null,
              } satisfies OpenChatContextProgress,
            ])
          ),
        };
      }
    } catch {
      /* private mode or corrupt entry: start fresh */
    }
  }

  get(): AppState {
    return this.state;
  }

  /** Scope currently owning the visible transcript. */
  get conversationScope(): ConversationScope {
    return this.state.activeQuestId
      ? questConversationScope(this.state.activeQuestId)
      : chatConversationScope(this.state.residentId);
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
          questEndings: this.state.questEndings,
          questHistory: this.state.questHistory,
          transcripts: this.state.transcripts,
          questTranscripts: this.state.questTranscripts,
          canonLedger: this.state.canonLedger,
          crossModeMemory: this.state.crossModeMemory,
          questCheckpoints: this.state.questCheckpoints,
          openChatRewards: this.state.openChatRewards,
          openChatContext: this.state.openChatContext,
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
      return migrateSavedProgress(saved);
    }
    return {
      memories: [],
      revealed: 0,
      persona: '',
      identity: '',
      visits: 0,
      completedQuests: [],
      bond: defaultBond(),
      rapport: defaultRapport(),
    };
  }

  /** Open a resident, resuming her transcript and any saved progress. */
  beginEncounter(id: ResidentId): void {
    const saved = this.progressFor(id);
    // Park whoever was on stage before picking the next one up, so a switch
    // mid-sentence does not cost the sentence.
    const transcripts = this.state.chat.length
      ? { ...this.state.transcripts, [this.state.residentId]: this.state.chat }
      : this.state.transcripts;
    const resumed = transcripts[id] ?? [];
    const turns = resumed.filter((t) => t.from === 'user').length;
    const rewardProgress = this.state.openChatRewards[id] ?? {
      seenIds: [],
      nextTurn: nextOpenChatRewardTurn(turns, this.random),
    };
    this.set({
      residentId: id,
      transcripts,
      chat: resumed,
      questChat: [],
      // Derived, not reset. The free allowance is spent per resident, so it has
      // to come back with her — otherwise hopping away and back mints turns.
      turns,
      openChatRewards: {
        ...this.state.openChatRewards,
        [id]: rewardProgress,
      },
      speaking: false,
      thinking: false,
      voicing: false,
      reveal: null,
      revealed: saved.revealed,
      bond: saved.bond ?? defaultBond(),
      rapport: saved.rapport ?? defaultRapport(),
      sessionPanelOpen: false,
      walletOpen: false,
      questHubOpen: false,
      activeQuestId: null,
      activeQuestNodeId: null,
      activeQuestEndingId: null,
      questPhase: 'none',
      questInterruptible: false,
      saveGateOpen: false,
      unlockGateOpen: false,
      session: {
        ...defaultSession(),
        persona: saved.persona,
        identity: saved.identity,
      },
    });
  }

  /** Shape the bond. Never touches who she is — see config/bond.ts. */
  updateBond(patch: Partial<BondDna>): void {
    this.set({ bond: { ...this.state.bond, ...patch } });
  }

  /** Add to the private canon. Only ever from something that happened. */
  addSharedCanon(entry: string): void {
    const line = entry.trim().slice(0, 200);
    if (!line || this.state.bond.sharedCanon.includes(line)) return;
    this.updateBond({ sharedCanon: [...this.state.bond.sharedCanon, line].slice(-12) });
  }

  /** Mint an object that exists only in this save. */
  addPrivateObject(entry: string): void {
    const line = entry.trim().slice(0, 160);
    if (!line || this.state.bond.privateObjects.includes(line)) return;
    this.updateBond({ privateObjects: [...this.state.bond.privateObjects, line].slice(-8) });
  }

  /**
   * Take the relationship state she reported after a turn.
   *
   * Sanitised on the way in: it arrives from a model, so every number is
   * clamped and every string is bounded. A missing report leaves the previous
   * state in place rather than resetting it, which is the whole reason this
   * exists.
   */
  applyRapport(next: unknown): void {
    if (!next) return;
    this.set({ rapport: sanitizeRapport(next) });
  }

  updateSession(patch: Partial<SessionSetup>): void {
    this.set({ session: { ...this.state.session, ...patch } });
  }

  resetSession(): void {
    const saved = this.progressFor();
    this.set({
      session: { ...defaultSession(), persona: saved.persona },
    });
  }

  pushTurn(turn: ChatTurn): ChatTurn & { id: string } {
    const committed = {
      ...turn,
      id: turn.id ?? `${this.state.residentId}-${Date.now().toString(36)}-${this.turnSerial++}`,
    };
    const turns = committed.from === 'user' ? this.state.turns + 1 : this.state.turns;
    const chat = [...this.state.chat, committed].slice(-60);
    // Open Chat is mirrored and written out every turn. Quest Mode has its own
    // transcript and must never reach this path.
    this.set({
      chat,
      turns,
      transcripts: { ...this.state.transcripts, [this.state.residentId]: chat },
    });
    this.persist();
    return committed;
  }

  /** Attach a generated visual contract to exactly one stable resident turn. */
  attachContextVisual(
    residentId: ResidentId,
    turnId: string,
    visual: GeneratedOpenChatVisual
  ): boolean {
    const source =
      residentId === this.state.residentId
        ? this.state.chat
        : this.state.transcripts[residentId] ?? [];
    const index = source.findIndex((turn) => turn.id === turnId && turn.from === 'resident');
    if (index === -1 || source[index].contextVisual) return false;
    const next = source.map((turn, at) =>
      at === index ? { ...turn, contextVisual: visual } : turn
    );
    this.set({
      ...(residentId === this.state.residentId ? { chat: next } : {}),
      transcripts: { ...this.state.transcripts, [residentId]: next },
    });
    this.persist();
    return true;
  }

  /** Patch only the job that still owns its original turn. */
  updateContextVisual(
    residentId: ResidentId,
    turnId: string,
    jobId: string,
    patch: Partial<Pick<GeneratedOpenChatVisual, 'status' | 'src'>>
  ): boolean {
    const source =
      residentId === this.state.residentId
        ? this.state.chat
        : this.state.transcripts[residentId] ?? [];
    const index = source.findIndex(
      (turn) => turn.id === turnId && turn.contextVisual?.jobId === jobId
    );
    if (index === -1) return false;
    const next = source.map((turn, at) =>
      at === index
        ? { ...turn, contextVisual: { ...turn.contextVisual!, ...patch } }
        : turn
    );
    this.set({
      ...(residentId === this.state.residentId ? { chat: next } : {}),
      transcripts: { ...this.state.transcripts, [residentId]: next },
    });
    this.persist();
    return true;
  }

  contextVisualProgressFor(residentId = this.state.residentId): OpenChatContextProgress {
    return this.state.openChatContext[residentId] ?? {
      freeState: 'available',
      lastDeliveredTurn: null,
    };
  }

  reserveFreeContextVisual(residentId: ResidentId, jobId: string): boolean {
    const progress = this.contextVisualProgressFor(residentId);
    if (progress.freeState !== 'available') return false;
    this.set({
      openChatContext: {
        ...this.state.openChatContext,
        [residentId]: { ...progress, freeState: 'reserved', freeJobId: jobId },
      },
    });
    return true;
  }

  releaseFreeContextVisual(residentId: ResidentId, jobId: string): boolean {
    const progress = this.contextVisualProgressFor(residentId);
    if (progress.freeState !== 'reserved' || progress.freeJobId !== jobId) return false;
    this.set({
      openChatContext: {
        ...this.state.openChatContext,
        [residentId]: {
          freeState: 'available',
          lastDeliveredTurn: progress.lastDeliveredTurn,
        },
      },
    });
    return true;
  }

  commitFreeContextVisual(
    residentId: ResidentId,
    jobId: string,
    userTurn: number
  ): boolean {
    const progress = this.contextVisualProgressFor(residentId);
    if (progress.freeState !== 'reserved' || progress.freeJobId !== jobId) return false;
    this.set({
      openChatContext: {
        ...this.state.openChatContext,
        [residentId]: {
          freeState: 'consumed',
          lastDeliveredTurn: userTurn,
        },
      },
    });
    this.persist();
    return true;
  }

  markPaidContextVisualDelivered(residentId: ResidentId, userTurn: number): void {
    const progress = this.contextVisualProgressFor(residentId);
    this.set({
      openChatContext: {
        ...this.state.openChatContext,
        [residentId]: { ...progress, lastDeliveredTurn: userTurn },
      },
    });
    this.persist();
  }

  hasOutstandingContextVisual(residentId = this.state.residentId): boolean {
    const turns =
      residentId === this.state.residentId
        ? this.state.chat
        : this.state.transcripts[residentId] ?? [];
    return turns.some(
      (turn) =>
        turn.contextVisual?.status === 'offered' ||
        turn.contextVisual?.status === 'generating'
    );
  }

  /** Return the due authored reward without consuming it while a reply is in flight. */
  peekOpenChatReward(): OpenChatVisual | null {
    if (this.state.activeQuestId) return null;
    const progress = this.state.openChatRewards[this.state.residentId];
    if (!progress || this.state.turns < progress.nextTurn) return null;
    return selectOpenChatReward(
      this.state.residentId,
      progress.seenIds,
      this.random,
      this.state.session.scenario
    );
  }

  /** Consume only a valid reward owned by the resident currently in Open Chat. */
  consumeOpenChatReward(id: string): boolean {
    if (this.state.activeQuestId) return false;
    const visual = visualById(id);
    if (!visual || visual.kind !== 'reward' || visual.residentId !== this.state.residentId) {
      return false;
    }
    const current = this.state.openChatRewards[this.state.residentId];
    if (!current || current.seenIds.includes(id) || this.state.turns < current.nextTurn) {
      return false;
    }
    this.set({
      openChatRewards: {
        ...this.state.openChatRewards,
        [this.state.residentId]: {
          seenIds: [...current.seenIds, id],
          nextTurn: nextOpenChatRewardTurn(this.state.turns, this.random),
        },
      },
    });
    this.persist();
    return true;
  }

  /** Append one turn to the active Quest scene without touching Open Chat. */
  pushQuestTurn(turn: ChatTurn): void {
    const questId = this.state.activeQuestId;
    if (!questId) return;
    const questChat = [...this.state.questChat, turn].slice(-80);
    this.set({
      questChat,
      questTranscripts: { ...this.state.questTranscripts, [questId]: questChat },
    });
    this.persist();
  }

  /** The transcript visible in the current mode. */
  get visibleChat(): ChatTurn[] {
    return this.state.activeQuestId ? this.state.questChat : this.state.chat;
  }

  approvedForQuest(id = this.state.residentId): CrossModeMemory[] {
    return this.state.crossModeMemory.filter(
      (memory) =>
        memory.residentId === id &&
        (memory.direction === 'chat-to-quest' || memory.direction === 'both')
    );
  }

  approvedForChat(id = this.state.residentId): CrossModeMemory[] {
    return this.state.crossModeMemory.filter(
      (memory) =>
        memory.residentId === id &&
        (memory.direction === 'quest-to-chat' || memory.direction === 'both')
    );
  }

  /** Add an approved bridge summary; never accepts or stores a raw turn. */
  approveCrossMode(
    memory: Omit<CrossModeMemory, 'id' | 'residentId' | 'createdAt'>,
    residentId = this.state.residentId
  ): void {
    const text = memory.text.trim().slice(0, 240);
    if (!text) return;
    const duplicate = this.state.crossModeMemory.some(
      (item) =>
        item.residentId === residentId &&
        item.direction === memory.direction &&
        item.text === text
    );
    if (duplicate) return;
    const createdAt = Date.now();
    this.set({
      crossModeMemory: [
        ...this.state.crossModeMemory,
        {
          ...memory,
          id: `${residentId}:${createdAt}:${this.state.crossModeMemory.length}`,
          residentId,
          text,
          createdAt,
        },
      ].slice(-80),
    });
    this.persist();
  }

  /**
   * How many lines she has said since he last said anything.
   *
   * Counted in *bubbles*, not turns, because that is the unit he sees and the
   * unit he would count: one reply is split by sentence into several bubbles, so
   * a greeting alone is already two. Beats are excluded — an action is the room,
   * not her talking.
   *
   * Derived from the transcript rather than kept in a field, so it survives a
   * reload and a switch away and back, and cannot drift out of step with what is
   * on screen. The greeting and any scene she opened both count, because from
   * his side they are all her talking into the same silence.
   */
  get unansweredLines(): number {
    const chat = this.state.chat;
    let n = 0;
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i].from === 'user') break;
      n += segments(chat[i].text).filter((seg) => seg.kind === 'speech').length;
    }
    return n;
  }

  /** Forget one resident's transcript. Her bond and memories are untouched. */
  clearTranscript(id = this.state.residentId): void {
    const transcripts = { ...this.state.transcripts };
    delete transcripts[id];
    this.set({
      transcripts,
      ...(id === this.state.residentId ? { chat: [], turns: 0 } : {}),
    });
    this.persist();
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
    return availableCredits(this.state) >= COST[what];
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

  /** Hold a disclosed price without changing the durable balance or ledger. */
  reserveCredit(id: string, what: Spend): boolean {
    if (!id || this.state.creditReservations[id]) return false;
    if (!this.canAfford(what)) {
      this.set({ broke: what });
      return false;
    }
    this.set({
      creditReservations: {
        ...this.state.creditReservations,
        [id]: { id, feature: what, amount: COST[what], createdAt: Date.now() },
      },
      broke: null,
    });
    return true;
  }

  /** Settle exactly one successful reserved delivery. */
  commitCredit(id: string): boolean {
    const reservation = this.state.creditReservations[id];
    if (!reservation) return false;
    const creditReservations = { ...this.state.creditReservations };
    delete creditReservations[id];
    const transaction = this.transaction('spend', reservation.feature, reservation.amount);
    this.set({
      credits: this.state.credits - reservation.amount,
      creditReservations,
      transactions: [...this.state.transactions, transaction].slice(-30),
      broke: null,
    });
    this.persist();
    return true;
  }

  /** Release a failed, cancelled or stale hold; idempotent and ledger-free. */
  releaseCredit(id: string): boolean {
    if (!this.state.creditReservations[id]) return false;
    const creditReservations = { ...this.state.creditReservations };
    delete creditReservations[id];
    this.set({ creditReservations });
    return true;
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

  /** Spend a credit to keep the selected memories for next time. */
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
        persona: this.state.session.persona || prev.persona,
        identity: this.state.session.identity || prev.identity,
        visits: prev.visits + 1,
        completedQuests: prev.completedQuests,
        bond: this.state.bond,
        rapport: this.state.rapport,
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
    const route = resolveCanonRoute();
    return questsForResident(id, route).filter((quest) => questPlayable(quest, route));
  }

  questById2(id: string): QuestDefinition | undefined {
    return questById(id, resolveCanonRoute());
  }

  /** The next scene she has not run yet, if there is one. */
  nextQuest(id = this.state.residentId): QuestDefinition | undefined {
    const done = this.progressFor(id).completedQuests;
    return this.questsFor(id).find((q) => !done.includes(q.id));
  }

  startQuest(id: string): boolean {
    const quest = this.questById2(id);
    if (!quest || quest.residentId !== this.state.residentId) return false;
    if (!questPlayable(quest, resolveCanonRoute())) return false;
    if (this.nextQuest()?.id !== id) return false;
    const prev = this.progressFor(quest.residentId);
    const revealed = Math.max(prev.revealed, 1);
    const hasCheckpoint = !!this.state.questCheckpoints[id];
    const checkpoint = this.state.questCheckpoints[id] ?? quest.startNodeId;
    // Leaving during Episode 0 restarts the threshold. A transcript alone is
    // not a safe camera stop; only an explicit checkpoint may skip it.
    const resumed = hasCheckpoint || (!quest.threshold && !!this.state.questTranscripts[id]?.length);
    this.set({
      progress: {
        ...this.state.progress,
        [quest.residentId]: { ...prev, revealed },
      },
      revealed: Math.max(this.state.revealed, revealed),
      activeQuestId: id,
      activeQuestNodeId: checkpoint,
      activeQuestEndingId: null,
      questChat: resumed ? this.state.questTranscripts[id] ?? [] : [],
      questPhase: quest.threshold && !resumed ? 'threshold' : 'episode',
      questInterruptible: false,
      questHubOpen: false,
    });
    this.persist();
    return true;
  }

  completeQuestThreshold(): void {
    const id = this.state.activeQuestId;
    const quest = id ? this.questById2(id) : undefined;
    if (!quest || this.state.questPhase !== 'threshold') return;
    this.set({
      questPhase: 'episode',
      questInterruptible: false,
      questCheckpoints: {
        ...this.state.questCheckpoints,
        [quest.id]: quest.startNodeId,
      },
    });
    this.persist();
  }

  /** Return to Open Chat while keeping the latest safe Quest checkpoint. */
  leaveQuest(): void {
    if (!this.state.activeQuestId) return;
    this.set({
      activeQuestId: null,
      activeQuestNodeId: null,
      activeQuestEndingId: null,
      questPhase: 'none',
      questInterruptible: false,
      questChat: [],
      questClosedAt: this.state.turns,
    });
    this.persist();
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
  keepShot(cacheKey: string, url: string): void {
    this.set({ sceneShots: { ...this.state.sceneShots, [cacheKey]: url } });
    this.persist();
  }

  /**
   * Attach a drawing only while its captured transcript still owns the UI.
   * Late valid responses may enter the cache but cannot cross this guard.
   */
  showShot(scope: ConversationScope, turn: number, cacheKey: string): boolean {
    if (scope !== this.conversationScope) return false;
    this.set({
      turnShots: {
        ...this.state.turnShots,
        [shotOwnerKey(scope, turn)]: cacheKey,
      },
    });
    return true;
  }

  chooseActiveQuest(choiceId: string): QuestChoiceResult | null {
    if (this.state.questPhase !== 'episode') return null;
    const id = this.state.activeQuestId;
    const quest = id ? this.questById2(id) : undefined;
    if (!quest || quest.residentId !== this.state.residentId) return null;
    const node = questNode(quest, this.state.activeQuestNodeId ?? quest.startNodeId);
    const choice = node.choices.find((item) => item.id === choiceId);
    if (!choice) return null;
    return this.applyQuestChoice(quest, node.id, choice);
  }

  /** Resolve and persist a player-authored action in the active scene. */
  submitQuestAction(action: string): QuestChoiceResult | null {
    if (this.state.questPhase !== 'episode') return null;
    const id = this.state.activeQuestId;
    const quest = id ? this.questById2(id) : undefined;
    if (!quest || quest.residentId !== this.state.residentId) return null;
    const node = questNode(quest, this.state.activeQuestNodeId ?? quest.startNodeId);
    const choice = resolveFreeform(node, action.trim());
    if (!choice) return null;
    return this.applyQuestChoice(quest, node.id, choice);
  }

  private applyQuestChoice(
    quest: QuestDefinition,
    nodeId: string,
    choice: QuestChoice
  ): QuestChoiceResult | null {
    const prev = this.progressFor();
    if (!choice.nextNodeId && prev.completedQuests.includes(quest.id)) return null;

    const route = resolveCanonRoute();
    const ending = choice.nextNodeId
      ? undefined
      : presentableEndingFor(quest, route, choice.endingId);
    if (!choice.nextNodeId && !ending) {
      console.error(
        `[quest-ending] Refusing unavailable ending '${choice.endingId ?? 'missing'}' for '${quest.id}'`
      );
      this.set({
        activeQuestEndingId: null,
        questPhase: 'ending',
        questInterruptible: false,
        questClosedAt: this.state.turns,
      });
      return { quest, choice, completed: true, ending: null, error: 'ending-unavailable' };
    }

    const residentFlags = this.state.storyFlags[quest.residentId] ?? [];
    const storyFlags = {
      ...this.state.storyFlags,
      [quest.residentId]: residentFlags.includes(choice.flag)
        ? residentFlags
        : [...residentFlags, choice.flag],
    };
    const stableRevealIndex = choice.unlockCanonRevealId
      ? canonRevealIndexFor(quest.residentId, route, choice.unlockCanonRevealId)
      : -1;
    if (choice.unlockCanonRevealId && stableRevealIndex < 0) {
      throw new Error(
        `Quest '${quest.id}' references unknown reveal '${choice.unlockCanonRevealId}'`
      );
    }
    if (quest.route === 'sao' && choice.unlockCanonReveal !== undefined && !choice.unlockCanonRevealId) {
      throw new Error(`V3 quest '${quest.id}' must unlock canon by stable id`);
    }
    const unlockIndex =
      stableRevealIndex >= 0 ? stableRevealIndex : choice.unlockCanonReveal;
    const revealed =
      unlockIndex === undefined
        ? prev.revealed
        : Math.max(prev.revealed, unlockIndex + 1);
    const createdAt = Date.now();
    const canonEntry: CanonLedgerEntry = {
      id: `${quest.id}:${nodeId}:${createdAt}:${this.state.canonLedger.length}`,
      residentId: quest.residentId,
      questId: quest.id,
      nodeId,
      canonType: choice.playerAuthored ? 'player-created' : 'branch',
      text: choice.outcome,
      createdAt,
    };
    // Grow the bond BEFORE snapshotting it into progress. The other order
    // persists a bond one entry behind, so the newest branch would be missing
    // from the save it was supposed to be part of.
    if (choice.crossMode) {
      const sharedSummary = choice.crossMode.text ?? choice.outcome;
      this.addSharedCanon(sharedSummary);
      this.approveCrossMode(
        {
          direction: 'quest-to-chat',
          kind: choice.crossMode.kind,
          text: sharedSummary,
        },
        quest.residentId
      );
    }
    if (!choice.nextNodeId && !prev.completedQuests.includes(quest.id)) {
      // A finished chapter has to leave behind something that exists only in
      // this save. Lore alone gives him more of her story; this gives him a thing.
      this.addPrivateObject(PERSONAL_OUTPUTS[quest.residentId].object);
    }
    const progress = {
      ...this.state.progress,
      [quest.residentId]: {
        ...prev,
        revealed,
        bond: this.state.bond,
        rapport: this.state.rapport,
      },
    };
    const questHistory = {
      ...this.state.questHistory,
      [quest.id]: [...(this.state.questHistory[quest.id] ?? []), choice.outcome].slice(-12),
    };
    const canonLedger = [...this.state.canonLedger, canonEntry].slice(-240);
    if (choice.nextNodeId) {
      const next = questNode(quest, choice.nextNodeId);
      this.set({
        progress,
        revealed: Math.max(this.state.revealed, revealed),
        activeQuestNodeId: choice.nextNodeId,
        storyFlags,
        questOutcomes: { ...this.state.questOutcomes, [quest.id]: choice.outcome },
        questHistory,
        canonLedger,
        questCheckpoints: {
          ...this.state.questCheckpoints,
          [quest.id]: choice.nextNodeId,
        },
      });
      this.persist();
      return { quest, choice, completed: false, nextPrompt: next.prompt };
    }

    progress[quest.residentId] = {
      ...progress[quest.residentId],
      completedQuests: [...prev.completedQuests, quest.id],
    };
    const transaction = this.transaction('earn', 'storyQuest', STORY_QUEST_REWARD);
    const questCheckpoints = { ...this.state.questCheckpoints };
    delete questCheckpoints[quest.id];
    this.set({
      progress,
      revealed: Math.max(this.state.revealed, revealed),
      credits: this.state.credits + STORY_QUEST_REWARD,
      transactions: [...this.state.transactions, transaction].slice(-30),
      storyFlags,
      questOutcomes: { ...this.state.questOutcomes, [quest.id]: choice.outcome },
      questEndings: choice.endingId
        ? { ...this.state.questEndings, [quest.id]: choice.endingId }
        : this.state.questEndings,
      activeQuestEndingId: ending!.id,
      questHistory,
      canonLedger,
      questCheckpoints,
      questPhase: 'ending',
      questInterruptible: false,
      questClosedAt: this.state.turns,
    });
    this.persist();
    return { quest, choice, completed: true, ending };
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
      questEndings: this.state.questEndings,
      questHistory: this.state.questHistory,
      questCheckpoints: this.state.questCheckpoints,
      transcripts: this.state.transcripts,
      questTranscripts: this.state.questTranscripts,
      canonLedger: this.state.canonLedger,
      crossModeMemory: this.state.crossModeMemory,
      sceneShots: this.state.sceneShots,
      openChatRewards: this.state.openChatRewards,
      openChatContext: this.state.openChatContext,
    });
  }

  restart(): void {
    this.leaveUniverse();
  }
}

export const store = new Store();
