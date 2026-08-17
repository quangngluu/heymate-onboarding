import { describe, expect, it, vi } from 'vitest';
import type { SceneDrawResult } from '../../src/chat/scene';
import type { QuestOutcomeCommitted } from '../../src/quest/visual-runtime';
import { QuestVisualRuntime } from '../../src/quest/visual-runtime';
import {
  QUEST_VISUAL_SPEC_VERSION,
  resolveQuestVisual,
} from '../../src/quest/visuals';
import {
  Store,
  chatConversationScope,
  questConversationScope,
  shotAssignmentsSignature,
  shotOwnerKey,
} from '../../src/state/store';

const event: QuestOutcomeCommitted = {
  quest: {
    id: 'A',
    residentId: 'rin',
    route: 'sao',
    title: 'Frame thứ mười hai',
    synopsis: 'Một frame không tồn tại.',
  },
  node: {
    id: 'channel-choice',
    prompt: 'Mở, xoá hay niêm phong?',
    presentation: {
      camera: 'object-pov',
      ambience: ['server-hum'],
      visualState: 'frame-12',
    },
  },
  choice: {
    id: 'open-audio',
    outcome: 'Một waveform thứ hai xuất hiện.',
    imageKey: 'rin-frame12-open-channel',
  },
  turn: 4,
};

function visualContext(input = event) {
  return {
    residentId: input.quest.residentId,
    route: input.quest.route,
    questId: input.quest.id,
    questTitle: input.quest.title,
    questSynopsis: input.quest.synopsis,
    nodeId: input.node.id,
    nodePrompt: input.node.prompt,
    choiceId: input.choice.id,
    imageKey: input.choice.imageKey!,
    outcomeText: input.choice.outcome,
    terminal: !input.choice.nextNodeId,
    presentation: input.node.presentation,
    playerAction: input.playerAction,
  };
}

describe('scoped shot ownership', () => {
  it('does not collide quest:A:4 with chat:rin:4', () => {
    const owner = new Store();
    owner.set({ residentId: 'rin' });
    const chat = chatConversationScope('rin');
    const quest = questConversationScope('A');

    expect(owner.showShot(chat, 4, 'chat-image')).toBe(true);
    owner.set({ activeQuestId: 'A' });
    expect(owner.showShot(quest, 4, 'quest-image')).toBe(true);

    expect(owner.get().turnShots[shotOwnerKey(chat, 4)]).toBe('chat-image');
    expect(owner.get().turnShots[shotOwnerKey(quest, 4)]).toBe('quest-image');
  });

  it('invalidates rendering when the same scoped owner receives a new cache key', () => {
    expect(shotAssignmentsSignature({ 'quest:A:4': 'old-cache' })).not.toBe(
      shotAssignmentsSignature({ 'quest:A:4': 'new-cache' })
    );
  });
});

describe('Quest visual runtime', () => {
  it('caches a late valid image but does not attach it after leaving its scope', async () => {
    const owner = new Store();
    owner.set({ activeQuestId: 'A', step: 'stage' });
    let finish!: (result: SceneDrawResult) => void;
    const drawer = vi.fn(() => new Promise<SceneDrawResult>((resolve) => { finish = resolve; }));
    const presentScene = vi.fn();
    const runtime = new QuestVisualRuntime(owner, drawer, presentScene);

    const pending = runtime.outcomeCommitted(event);
    owner.set({ activeQuestId: null, questPhase: 'none' });
    finish({
      ok: true,
      url: 'https://images.example/frame.jpg',
      perspective: 'observed',
      withSubject: true,
    });
    await pending;

    const key = resolveQuestVisual(visualContext()).cacheKey;
    expect(owner.get().sceneShots[key]).toBe('https://images.example/frame.jpg');
    expect(owner.get().turnShots[shotOwnerKey(questConversationScope('A'), 4)]).toBeUndefined();
    expect(presentScene).not.toHaveBeenCalled();
  });

  it('presents a valid active shot through the stage backdrop seam', async () => {
    const owner = new Store();
    owner.set({ activeQuestId: 'A', step: 'stage' });
    const drawer = vi.fn(async () => ({
      ok: true as const,
      url: 'https://images.example/frame.jpg',
      perspective: 'observed' as const,
      withSubject: true,
    }));
    const presentScene = vi.fn();
    const runtime = new QuestVisualRuntime(owner, drawer, presentScene);

    await runtime.outcomeCommitted(event);

    expect(presentScene).toHaveBeenCalledOnce();
    expect(presentScene).toHaveBeenCalledWith('https://images.example/frame.jpg');
  });

  it('draws again after a visual contract version bump instead of reusing old cache', async () => {
    const owner = new Store();
    owner.set({ activeQuestId: 'A', step: 'stage' });
    const oldKey = resolveQuestVisual(visualContext()).cacheKey;
    owner.keepShot(oldKey, 'https://images.example/old.jpg');
    const drawer = vi.fn(async () => ({
      ok: true as const,
      url: 'https://images.example/new.jpg',
      perspective: 'observed' as const,
      withSubject: true,
    }));
    const runtime = new QuestVisualRuntime(owner, drawer);

    await runtime.outcomeCommitted({
      ...event,
      versions: {
        specVersion: `${QUEST_VISUAL_SPEC_VERSION}-bump`,
        subjectAssetVersion: 'rin-production-a2',
      },
    });

    expect(drawer).toHaveBeenCalledOnce();
    expect(Object.values(owner.get().sceneShots)).toContain('https://images.example/new.jpg');
  });

  it('does not cache a downgraded observed response under a first-person spec', async () => {
    const owner = new Store();
    owner.set({ activeQuestId: 'A', step: 'stage' });
    const drawer = vi.fn(async () => ({
      ok: true as const,
      url: 'https://images.example/downgraded.jpg',
      perspective: 'observed' as const,
      withSubject: false,
    }));
    const runtime = new QuestVisualRuntime(owner, drawer);

    await runtime.outcomeCommitted({
      ...event,
      capabilities: { firstPerson: true },
    });

    expect(Object.values(owner.get().sceneShots)).not.toContain(
      'https://images.example/downgraded.jpg'
    );
    expect(owner.get().turnShots).toEqual({});
  });

  it('does not cache an empty-room fallback under an identity asset key', async () => {
    const owner = new Store();
    owner.set({ activeQuestId: 'A', step: 'stage' });
    const creditsBefore = owner.get().credits;
    const drawer = vi.fn(async () => ({
      ok: true as const,
      url: 'https://images.example/empty-room.jpg',
      perspective: 'observed' as const,
      withSubject: false,
    }));
    const runtime = new QuestVisualRuntime(owner, drawer);

    await runtime.outcomeCommitted(event);

    expect(Object.values(owner.get().sceneShots)).not.toContain(
      'https://images.example/empty-room.jpg'
    );
    expect(owner.get().turnShots).toEqual({});
    expect(owner.get().credits).toBe(creditsBefore);
  });
});
