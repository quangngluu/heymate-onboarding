import { describe, expect, it } from 'vitest';
import type { QuestVisualContext } from '../../src/quest/visuals';
import {
  QUEST_VISUAL_SPEC_VERSION,
  resolveQuestVisual,
} from '../../src/quest/visuals';

const base: QuestVisualContext = {
  residentId: 'rin',
  route: 'sao',
  questId: 'rin-twelfth-frame',
  questTitle: 'Frame thứ mười hai',
  questSynopsis: 'Archive chứa một frame không tồn tại.',
  nodeId: 'frame-12',
  nodePrompt: 'Anh muốn nhìn chi tiết nào trước?',
  choiceId: 'inspect-footprint',
  imageKey: 'rin-frame12-footprint',
  outcomeText: 'Dấu chân có chiều sâu.',
  terminal: false,
  presentation: {
    camera: 'follow',
    ambience: ['server-hum'],
    visualState: 'archive-corridor',
  },
};

describe('Quest visual resolver', () => {
  const cases: Array<{
    name: string;
    patch: Partial<QuestVisualContext>;
    perspective: 'observed' | 'first-person';
    subject: 'identity' | 'none';
  }> = [
    { name: 'follow camera', patch: {}, perspective: 'observed', subject: 'identity' },
    {
      name: 'object point-of-view camera',
      patch: { presentation: { ...base.presentation!, camera: 'object-pov' } },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'side composition camera',
      patch: { presentation: { ...base.presentation!, camera: 'side-composition' } },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'close encounter camera',
      patch: { presentation: { ...base.presentation!, camera: 'close-encounter' } },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'wide mutation camera',
      patch: { presentation: { ...base.presentation!, camera: 'wide-mutation' } },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'choice without a presentation',
      patch: { presentation: undefined },
      perspective: 'observed',
      subject: 'none',
    },
    {
      name: 'terminal choice',
      patch: { terminal: true, choiceId: 'open-audio' },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'nonterminal choice',
      patch: { terminal: false, choiceId: 'inspect-headset' },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'free-form terminal family',
      patch: { terminal: true, choiceId: 'freeform:private-copy', playerAction: 'Tạo một bản riêng' },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'free-form fallback family',
      patch: { terminal: true, choiceId: 'freeform:authored-protocol', playerAction: 'Đổi quy tắc' },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'presentation mutation',
      patch: {
        presentation: {
          ...base.presentation!,
          camera: 'object-pov',
          visualState: 'frame-open',
          mutation: 'open-channel',
        },
      },
      perspective: 'observed',
      subject: 'identity',
    },
    {
      name: 'another authored node',
      patch: { nodeId: 'enter-frame', choiceId: 'ask-rin-enter' },
      perspective: 'observed',
      subject: 'identity',
    },
  ];

  it.each(cases)('resolves $name', ({ patch, perspective, subject }) => {
    const spec = resolveQuestVisual({ ...base, ...patch });

    expect(spec).toMatchObject({
      perspective,
      subjectStrategy: subject,
      pose: null,
    });
    expect(spec.cacheKey).toContain(QUEST_VISUAL_SPEC_VERSION);
    expect(spec.scene).toContain(base.questTitle);
  });

  it('keys the same image independently by choice and presentation', () => {
    const original = resolveQuestVisual(base);
    const choiceChanged = resolveQuestVisual({ ...base, choiceId: 'inspect-headset' });
    const presentationChanged = resolveQuestVisual({
      ...base,
      presentation: { ...base.presentation!, camera: 'object-pov' },
    });

    expect(choiceChanged.cacheKey).not.toBe(original.cacheKey);
    expect(presentationChanged.cacheKey).not.toBe(original.cacheKey);
  });

  it('keys dynamic free-form scene input without exposing the raw action', () => {
    const first = resolveQuestVisual({ ...base, playerAction: 'Tạo một bản riêng' });
    const second = resolveQuestVisual({ ...base, playerAction: 'Viết một quy tắc khác' });

    expect(second.cacheKey).not.toBe(first.cacheKey);
    expect(first.cacheKey).not.toContain(encodeURIComponent('Tạo một bản riêng'));
  });

  it('keeps object-pov observed until E3 explicitly enables first-person', () => {
    const context = {
      ...base,
      presentation: { ...base.presentation!, camera: 'object-pov' as const },
    };

    const e0 = resolveQuestVisual(context);
    const e3 = resolveQuestVisual(context, undefined, { firstPerson: true });

    expect(e0.perspective).toBe('observed');
    expect(e3.perspective).toBe('first-person');
    expect(e3.cacheKey).not.toBe(e0.cacheKey);
  });

  it('misses the old cache identity when either contract version changes', () => {
    const original = resolveQuestVisual(base);
    const promptBump = resolveQuestVisual(base, {
      specVersion: 'quest-visual-v2',
      subjectAssetVersion: 'rin-static-v1',
    });
    const assetBump = resolveQuestVisual(base, {
      specVersion: QUEST_VISUAL_SPEC_VERSION,
      subjectAssetVersion: 'rin-production-a2',
    });

    expect(promptBump.cacheKey).not.toBe(original.cacheKey);
    expect(assetBump.cacheKey).not.toBe(original.cacheKey);
  });
});
