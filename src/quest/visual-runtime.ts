import { drawScene } from '../chat/scene';
import type { QuestChoice, QuestDefinition, QuestNode } from '../config/quests';
import type { Store } from '../state/store';
import { questConversationScope } from '../state/store';
import {
  resolveQuestVisual,
  type QuestVisualCapabilities,
  type QuestVisualVersions,
} from './visuals';

export interface QuestOutcomeCommitted {
  quest: Pick<
    QuestDefinition,
    'id' | 'residentId' | 'route' | 'title' | 'synopsis'
  >;
  node: Pick<QuestNode, 'id' | 'prompt' | 'presentation'>;
  choice: Pick<QuestChoice, 'id' | 'outcome' | 'imageKey' | 'nextNodeId'>;
  turn: number;
  playerAction?: string;
  /** Test/release seam for proving a contract or asset bump misses old cache. */
  versions?: QuestVisualVersions;
  /** Kept off in E0; E3 may enable this only after its ship gates pass. */
  capabilities?: QuestVisualCapabilities;
}

type VisualStore = Pick<
  Store,
  'get' | 'spend' | 'refund' | 'keepShot' | 'showShot'
>;

type SceneDrawer = typeof drawScene;
type ScenePresenter = (url: string) => void;

/**
 * Owns the asynchronous lifetime of a Quest drawing.
 *
 * Main emits a committed outcome. This runtime resolves the visual, charges,
 * draws and handles the intentional split between durable cache ownership and
 * session-only transcript attachment.
 */
export class QuestVisualRuntime {
  constructor(
    private readonly owner: VisualStore,
    private readonly drawer: SceneDrawer = drawScene,
    private readonly presentScene: ScenePresenter = () => {}
  ) {}

  private attach(
    scope: ReturnType<typeof questConversationScope>,
    turn: number,
    cacheKey: string,
    url: string
  ): void {
    if (this.owner.showShot(scope, turn, cacheKey)) this.presentScene(url);
  }

  async outcomeCommitted(event: QuestOutcomeCommitted): Promise<void> {
    const imageKey = event.choice.imageKey;
    if (!imageKey) return;

    const spec = resolveQuestVisual(
      {
        residentId: event.quest.residentId,
        route: event.quest.route,
        questId: event.quest.id,
        questTitle: event.quest.title,
        questSynopsis: event.quest.synopsis,
        nodeId: event.node.id,
        nodePrompt: event.node.prompt,
        choiceId: event.choice.id,
        imageKey,
        outcomeText: event.choice.outcome,
        terminal: !event.choice.nextNodeId,
        presentation: event.node.presentation,
        playerAction: event.playerAction,
      },
      event.versions,
      event.capabilities
    );
    const scope = questConversationScope(event.quest.id);
    const cached = this.owner.get().sceneShots[spec.cacheKey];
    if (cached) {
      this.attach(scope, event.turn, spec.cacheKey, cached);
      return;
    }
    if (!this.owner.spend('sceneImage')) return;

    const result = await this.drawer({
      residentId: event.quest.residentId,
      route: event.quest.route,
      text: event.choice.outcome,
      scene: spec.scene,
      perspective: spec.perspective,
      subjectStrategy: spec.subjectStrategy,
    });
    if (!result.ok) {
      this.owner.refund('sceneImage');
      return;
    }

    const expectedSubject = spec.subjectStrategy !== 'none';
    if (
      result.perspective !== spec.perspective ||
      result.withSubject !== expectedSubject
    ) {
      this.owner.refund('sceneImage');
      return;
    }

    // Valid generated work remains reusable even if navigation made its former
    // turn ineligible to receive it.
    this.owner.keepShot(spec.cacheKey, result.url);
    this.attach(scope, event.turn, spec.cacheKey, result.url);
  }
}
