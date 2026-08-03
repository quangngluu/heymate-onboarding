import { drawScene } from '../chat/scene';
import { SceneJobRuntime } from '../chat/scene-job-runtime';
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
  | 'get'
  | 'conversationScope'
  | 'reserveCredit'
  | 'commitCredit'
  | 'releaseCredit'
  | 'keepShot'
  | 'showShot'
>;

type SceneDrawer = typeof drawScene;
type ScenePresenter = (url: string) => void | boolean | Promise<boolean>;

/**
 * Owns the asynchronous lifetime of a Quest drawing.
 *
 * Main emits a committed outcome. This runtime resolves the visual, charges,
 * draws and handles the intentional split between durable cache ownership and
 * session-only transcript attachment.
 */
export class QuestVisualRuntime {
  private readonly jobs: SceneJobRuntime;

  constructor(
    private readonly owner: VisualStore,
    private readonly drawer: SceneDrawer = drawScene,
    private readonly presentScene: ScenePresenter = () => {}
  ) {
    this.jobs = new SceneJobRuntime(owner, drawer);
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
    const expectedSubject = spec.subjectStrategy !== 'none';
    const jobId = `${scope}:${event.turn}:${spec.cacheKey}`;
    if (!this.owner.reserveCredit(jobId, 'sceneImage')) return;
    const result = await this.jobs.run({
      id: jobId,
      cacheKey: spec.cacheKey,
      request: {
        residentId: event.quest.residentId,
        route: event.quest.route,
        text: event.choice.outcome,
        scene: spec.scene,
        perspective: spec.perspective,
        subjectStrategy: spec.subjectStrategy,
      },
      expected: { perspective: spec.perspective, withSubject: expectedSubject },
      billing: { kind: 'reserved', reservationId: jobId },
      isCurrent: () => this.owner.conversationScope === scope,
      stalePolicy: 'cache-and-keep',
      present: async (url) => (await this.presentScene(url)) !== false,
    });
    if (result.status === 'ready') {
      this.owner.showShot(scope, event.turn, spec.cacheKey);
    }
  }
}
