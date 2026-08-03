import { drawScene } from './scene';
import { SceneJobRuntime } from './scene-job-runtime';
import {
  createContextVisual,
  decideContextVisual,
  type ContextVisualIntent,
  type GeneratedOpenChatVisual,
} from './context-visual';
import type { ResidentId } from '../config/residents';
import type { Store } from '../state/store';
import { chatConversationScope } from '../state/store';

type OpenChatVisualStore = Pick<
  Store,
  | 'get'
  | 'conversationScope'
  | 'contextVisualProgressFor'
  | 'hasOutstandingContextVisual'
  | 'attachContextVisual'
  | 'updateContextVisual'
  | 'reserveFreeContextVisual'
  | 'releaseFreeContextVisual'
  | 'commitFreeContextVisual'
  | 'markPaidContextVisualDelivered'
  | 'reserveCredit'
  | 'commitCredit'
  | 'releaseCredit'
  | 'keepShot'
>;

type SceneDrawer = typeof drawScene;
type ScenePresenter = (url: string) => boolean | Promise<boolean>;

export interface OpenChatVisualCommitted {
  residentId: ResidentId;
  turnId: string;
  userTurn: number;
  intent: ContextVisualIntent;
}

/** Open Chat adapter: policy + stable turn ownership around the shared scene job. */
export class OpenChatVisualRuntime {
  private readonly jobs: SceneJobRuntime;

  constructor(
    private readonly owner: OpenChatVisualStore,
    drawer: SceneDrawer = drawScene,
    private readonly presentScene: ScenePresenter = async () => true
  ) {
    this.jobs = new SceneJobRuntime(owner, drawer);
  }

  private visualFor(residentId: ResidentId, turnId: string): GeneratedOpenChatVisual | null {
    const turns =
      residentId === this.owner.get().residentId
        ? this.owner.get().chat
        : this.owner.get().transcripts[residentId] ?? [];
    return turns.find((turn) => turn.id === turnId)?.contextVisual ?? null;
  }

  private ownsJob(input: OpenChatVisualCommitted, jobId: string): boolean {
    if (this.owner.conversationScope !== chatConversationScope(input.residentId)) return false;
    const current = this.owner.get();
    const turn = current.chat.find((item) => item.id === input.turnId);
    if (turn?.contextVisual?.jobId !== jobId) return false;
    if (turn.contextVisual.status !== 'generating' && turn.contextVisual.status !== 'ready') {
      return false;
    }
    return true;
  }

  private isFocused(input: OpenChatVisualCommitted, jobId: string): boolean {
    return (
      this.ownsJob(input, jobId) &&
      this.owner.get().chat.at(-1)?.id === input.turnId
    );
  }

  private releaseFree(input: OpenChatVisualCommitted, visual: GeneratedOpenChatVisual): void {
    if (visual.payment === 'free-auto') {
      this.owner.releaseFreeContextVisual(input.residentId, visual.jobId);
    }
  }

  private async generate(
    input: OpenChatVisualCommitted,
    visual: GeneratedOpenChatVisual
  ): Promise<void> {
    const result = await this.jobs.run({
      id: visual.jobId,
      cacheKey: visual.cacheKey,
      request: {
        residentId: input.residentId,
        text: visual.sceneBrief,
        scene: visual.sceneBrief,
        perspective: 'observed',
        subjectStrategy: 'identity',
        source: 'open-chat',
      },
      expected: { perspective: 'observed', withSubject: true },
      billing:
        visual.payment === 'paid'
          ? { kind: 'reserved', reservationId: visual.jobId }
          : { kind: 'free' },
      isCurrent: () => this.ownsJob(input, visual.jobId),
      stalePolicy: 'refund-and-discard',
      present: async (url) => {
        if (!this.ownsJob(input, visual.jobId)) return false;
        if (
          !this.owner.updateContextVisual(input.residentId, input.turnId, visual.jobId, {
            status: 'ready',
            src: url,
          })
        ) {
          return false;
        }
        // A slow job still belongs to its original card after the visitor
        // continues chatting. Only the focused turn may take over the live
        // backdrop; older ready cards remain available through “Xem lại ảnh”.
        if (!this.isFocused(input, visual.jobId)) return true;
        return (await this.presentScene(url)) && this.ownsJob(input, visual.jobId);
      },
    });

    if (result.status === 'ready') {
      if (visual.payment === 'paid') {
        this.owner.markPaidContextVisualDelivered(input.residentId, input.userTurn);
      }
      return;
    }

    const retryable =
      visual.payment === 'paid' &&
      this.owner.conversationScope === chatConversationScope(input.residentId) &&
      this.owner.get().chat.at(-1)?.id === input.turnId;
    this.owner.updateContextVisual(input.residentId, input.turnId, visual.jobId, {
      status: retryable ? 'offered' : 'failed',
      src: undefined,
    });
  }

  async replyCommitted(input: OpenChatVisualCommitted): Promise<void> {
    if (this.owner.conversationScope !== chatConversationScope(input.residentId)) return;
    const progress = this.owner.contextVisualProgressFor(input.residentId);
    const decision = decideContextVisual({
      intent: input.intent,
      progress: {
        freeAttemptUsed: progress.freeState === 'consumed',
        lastDeliveredTurn: progress.lastDeliveredTurn,
      },
      userTurn: input.userTurn,
      hasOutstandingOffer: this.owner.hasOutstandingContextVisual(input.residentId),
    });
    if (decision.kind === 'skip') return;

    const visual = createContextVisual({
      residentId: input.residentId,
      turnId: input.turnId,
      intent: input.intent,
      payment: decision.kind === 'generate-free' ? 'free-auto' : 'paid',
    });
    // A repeated model suggestion is not a new product. Never put a paid CTA
    // in front of bytes the visitor already generated.
    if (this.owner.get().sceneShots[visual.cacheKey]) return;
    if (
      visual.payment === 'free-auto' &&
      !this.owner.reserveFreeContextVisual(input.residentId, visual.jobId)
    ) {
      return;
    }
    if (!this.owner.attachContextVisual(input.residentId, input.turnId, visual)) {
      this.releaseFree(input, visual);
      return;
    }
    // The cost boundary is a free generation attempt, not unlimited provider
    // retries until one image happens to deliver. Consume it immediately before
    // dispatch; a failed attempt never charges credits but cannot be replayed.
    if (
      visual.payment === 'free-auto' &&
      !this.owner.commitFreeContextVisual(input.residentId, visual.jobId, input.userTurn)
    ) {
      this.owner.updateContextVisual(input.residentId, input.turnId, visual.jobId, {
        status: 'failed',
      });
      return;
    }
    if (visual.status === 'generating') await this.generate(input, visual);
  }

  async request(turnId: string): Promise<boolean> {
    const state = this.owner.get();
    if (state.activeQuestId) return false;
    const residentId = state.residentId;
    const visual = this.visualFor(residentId, turnId);
    if (!visual || visual.status !== 'offered') return false;
    const input: OpenChatVisualCommitted = {
      residentId,
      turnId,
      userTurn: state.turns,
      intent: {
        sceneBrief: visual.sceneBrief,
        caption: visual.caption,
        confidence: visual.confidence,
      },
    };
    const held =
      visual.payment === 'paid'
        ? this.owner.reserveCredit(visual.jobId, 'sceneImage')
        : this.owner.reserveFreeContextVisual(residentId, visual.jobId);
    if (!held) return false;
    if (
      !this.owner.updateContextVisual(residentId, turnId, visual.jobId, {
        status: 'generating',
      })
    ) {
      if (visual.payment === 'paid') this.owner.releaseCredit(visual.jobId);
      else this.owner.releaseFreeContextVisual(residentId, visual.jobId);
      return false;
    }
    await this.generate(input, visual);
    return true;
  }

  dismiss(turnId: string): boolean {
    const state = this.owner.get();
    if (state.activeQuestId) return false;
    const visual = this.visualFor(state.residentId, turnId);
    if (!visual || visual.payment !== 'paid' || visual.status !== 'offered') return false;
    return this.owner.updateContextVisual(state.residentId, turnId, visual.jobId, {
      status: 'failed',
      src: undefined,
    });
  }

  cancel(): void {
    this.jobs.cancel();
  }
}
