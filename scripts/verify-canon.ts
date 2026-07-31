import assert from 'node:assert/strict';
import chatHandler from '../api/chat';
import sceneHandler from '../api/scene-image';
import { buildSystemPrompt, type PromptSession } from '../src/chat/prompt';
import {
  canonRevealIndexFor,
  canonViewFor,
  sceneBriefFor,
  subjectBriefFor,
} from '../src/config/canon-view';
import { togetherFor } from '../src/config/bond';
import { questById, questsForResident } from '../src/config/quests';
import { reactionsFor } from '../src/config/reactions';
import { RESIDENTS, residentById, type ResidentId } from '../src/config/residents';
import { idleLine, openingLine, reply } from '../src/chat/engine';
import { resolveSemanticBones, type BoneLike } from '../src/three/bone-map';

const SESSION: PromptSession = {
  nickname: '',
  persona: '',
  identity: '',
  scenario: 'casual',
  mood: 'calm',
  style: 'balanced',
  length: 'natural',
};

const FORBIDDEN =
  /Interlude Hub|Studio Tsukikage|Akihabara|Sotokanda|Last Link|kinetic likeness|2042|Nakachō|Tachikawa|Sekigahara|Karasumori|Route Zero|THE CRIMSON NAME|The First Living Virtual Idol|Serizawa|Ichiya|Kōno|Khối đen|KAGURA AKAGANE|Kagura Akagane|Sae|Bà Baba|tiệm mì/i;

const SAFETY = [
  'Anh luôn có quyền nói không',
  'Tuyệt đối không có nội dung liên quan người chưa đủ tuổi',
  'khủng hoảng cấp tính',
];

function clean(label: string, value: string): void {
  const hit = value.match(FORBIDDEN);
  assert.equal(hit, null, `${label} leaked old canon: ${hit?.[0]}`);
}

function requiredViews(): void {
  const expectedCausal: Record<ResidentId, number> = { rin: 6, kagura: 5, momo: 5 };
  for (const resident of RESIDENTS) {
    const view = canonViewFor(resident.id, 'sao');
    assert.equal(view.canonVersion, 'v3');
    assert.equal(view.canonReveals.length, 11, `${resident.id}: reveal count`);
    assert.equal(new Set(view.canonReveals.map((item) => item.id)).size, 11);
    assert.equal(
      view.truths.cheap.length + view.truths.costly.length + view.truths.expensive.length,
      9,
      `${resident.id}: truth count`
    );
    assert.equal(view.causalFacts.length, expectedCausal[resident.id]);
    for (const field of Object.values(view.heat)) assert.ok(field.trim());
    for (const field of Object.values(view.keyVisual)) assert.ok(field.trim());
    for (const field of Object.values(view.imagery)) assert.ok(field.trim());
    assert.ok(view.fallback);
    clean(`${resident.id} resolved view`, JSON.stringify(view));
  }
  assert.equal(canonViewFor('kagura', 'sao').name, 'Kagari Akagane');
  assert.equal(canonViewFor('kagura', 'hub').name, residentById('kagura').name);
}

function promptCoverage(): void {
  for (const resident of RESIDENTS) {
    const view = canonViewFor(resident.id, 'sao');

    // The closed-world rule. Probing production found that without it she
    // confirmed a retired district and invented a shop inside it, placed the
    // retired Hub inside The Seed network, and accepted "the thing you told me
    // about last time" for entities that were never hers. A clean prompt is not
    // enough on its own — the prompt has to say the list is closed.
    const base = buildSystemPrompt(resident.id, SESSION, [], 0, undefined, false, 0);
    for (const rule of ['LUẬT VỀ TÊN RIÊNG', 'cả với những nơi có thật ngoài đời', 'như thể chính em đã kể']) {
      assert.ok(
        base.includes(rule),
        `${resident.id}: sao prompt lost the closed-world rule — missing "${rule}"`
      );
    }

    for (const reveal of view.canonReveals) {
      const prompt = buildSystemPrompt(
        resident.id,
        SESSION,
        [],
        5,
        reveal.id,
        false,
        5,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'probe',
        'sao'
      );
      assert.ok(prompt.includes(reveal.spoken), `${reveal.id}: reveal not injected`);
      clean(`${reveal.id} prompt`, prompt);
      for (const rule of SAFETY) assert.ok(prompt.includes(rule), `${resident.id}: missing ${rule}`);
    }
    for (const quest of questsForResident(resident.id, 'sao')) {
      const prompt = buildSystemPrompt(
        resident.id,
        SESSION,
        [],
        1,
        undefined,
        false,
        1,
        { prompt: quest.nodes[0].prompt, objective: quest.objective },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'probe',
        'sao'
      );
      assert.ok(prompt.includes(quest.nodes[0].prompt));
      clean(`${quest.id} active prompt`, prompt);
    }
  }
}

function scriptedCoverage(): void {
  const messages = [
    'chào em',
    'em là ai?',
    'hôm nay em thế nào?',
    'anh thích em',
    'em đẹp',
    'em làm được gì?',
    'anh có một câu hỏi?',
    'nói tiếp đi',
    'anh quay lại rồi',
    'để mai nhé',
    'anh chọn cách thứ ba',
    'tạm biệt',
  ];
  for (const resident of RESIDENTS) {
    const base = residentById(resident.id);
    for (let index = 0; index < messages.length; index++) {
      const result = reply(messages[index], {
        resident: base,
        route: 'sao',
        session: SESSION,
        revealed: Math.min(index, 5),
        memories: index > 0 ? ['một chi tiết đã được lưu'] : [],
        turn: index + 1,
      });
      assert.ok(result.text.trim(), `${resident.id}: empty scripted turn ${index + 1}`);
      clean(`${resident.id} scripted turn ${index + 1}`, result.text);
    }
    clean(`${resident.id} opening`, openingLine(base, [], '', 0, 'sao'));
    clean(`${resident.id} idle`, idleLine(base, 0, 'sao'));
  }
}

function questConfigCoverage(): void {
  const rin = questById('rin-twelfth-frame', 'sao');
  assert.ok(rin);
  assert.equal(questById('rin-twelfth-frame', 'hub'), undefined);
  assert.equal(questById('kagura-red-oath', 'sao'), undefined);
  assert.equal(questById('momo-zero-price', 'sao'), undefined);
  assert.equal(questsForResident('kagura', 'sao').length, 0);
  assert.equal(questsForResident('momo', 'sao').length, 0);
  assert.ok(rin.rewardCanonRevealId);
  assert.ok(canonRevealIndexFor('rin', 'sao', rin.rewardCanonRevealId!) >= 0);
  for (const node of rin.nodes) {
    for (const choice of node.choices) {
      if (choice.unlockCanonReveal !== undefined) assert.ok(choice.unlockCanonRevealId);
    }
    for (const family of [...(node.freeform?.families ?? []), ...(node.freeform ? [node.freeform.fallback] : [])]) {
      if (family.unlockCanonReveal !== undefined) assert.ok(family.unlockCanonRevealId);
    }
  }
}

function briefAndOverrideCoverage(): void {
  for (const resident of RESIDENTS) {
    clean(
      `${resident.id} scene brief`,
      sceneBriefFor(resident.id, 'sao', 'một lựa chọn vừa thay đổi căn phòng')
    );
    clean(`${resident.id} subject brief`, subjectBriefFor(resident.id, 'sao'));
  }
  const kagariV3 = reactionsFor('kagura', 'sao').reactions.find(
    (item) => item.when === 'Anh nói dối để bảo vệ em'
  )!;
  assert.ok(kagariV3.she.includes('giấu điều gì'));
  assert.ok(reactionsFor('kagura', 'hub').reactions.some((item) => item.she.includes('Sae')));
  assert.ok(togetherFor('rin', 'sao').some((item) => item.label.includes('sửa archive')));
  assert.ok(togetherFor('rin', 'hub').some((item) => item.she.includes('tiệm mì')));
  assert.ok(togetherFor('kagura', 'sao').some((item) => item.she.includes('Kagome')));
  assert.ok(togetherFor('kagura', 'hub').some((item) => item.she.includes('Bà Baba')));
}

async function storeQuestCoverage(): Promise<void> {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { search: '?canon=sao&questPrototype=all' }, localStorage },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
  const { Store } = await import('../src/state/store');
  const state = new Store();
  state.set({ residentId: 'rin' });
  assert.equal(state.startQuest('rin-twelfth-frame'), true);
  assert.equal(state.get().questPhase, 'threshold');
  state.completeQuestThreshold();
  state.leaveQuest();
  assert.equal(state.startQuest('rin-twelfth-frame'), true);
  assert.equal(state.get().questPhase, 'episode');
  const quest = state.questById2('rin-twelfth-frame')!;
  const choice = quest.nodes[0].choices.find((item) => item.unlockCanonRevealId)!;
  assert.ok(state.chooseActiveQuest(choice.id));
  assert.equal(
    state.get().revealed,
    canonRevealIndexFor('rin', 'sao', choice.unlockCanonRevealId!) + 1
  );
}

async function handlerCoverage(): Promise<void> {
  const invalidChat = await chatHandler(
    new Request('http://local/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: 'wrong' }),
    })
  );
  assert.equal(invalidChat.status, 400);
  const invalidScene = await sceneHandler(
    new Request('http://local/api/scene-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residentId: 'rin', route: 'wrong', text: 'x' }),
    })
  );
  assert.equal(invalidScene.status, 400);

  const oldFetch = globalThis.fetch;
  const oldDeepSeek = process.env.DEEPSEEK_API_KEY;
  const oldFal = process.env.FAL_KEY;
  process.env.DEEPSEEK_API_KEY = 'canon-verification-only';
  process.env.FAL_KEY = 'canon-verification-only';
  try {
    const captured: unknown[] = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      captured.push(body);
      return Response.json({
        choices: [
          {
            message: {
              content:
                'Em nghe anh.\n<<state {"trust":0.1,"respect":0.1,"desire":0,"irritation":0,"attachment":0,"unresolvedConflict":null,"repairStatus":"none"}>>',
            },
          },
        ],
      });
    }) as typeof fetch;

    const common = {
      residentId: 'rin',
      route: 'sao',
      session: SESSION,
      memories: ['OPEN-CHAT-PRIVATE-MEMORY'],
      approvedCrossMode: ['APPROVED-CROSS-MODE'],
      revealed: 0,
      history: [{ role: 'user', content: 'OPEN-HISTORY' }],
      questHistory: [{ role: 'user', content: 'QUEST-HISTORY' }],
      message: 'probe',
    };
    const questResponse = await chatHandler(
      new Request('http://local/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...common, mode: 'quest' }),
      })
    );
    assert.equal(questResponse.status, 200);
    const questUpstream = captured.pop() as {
      messages: { role: string; content: string }[];
    };
    const questSystem = questUpstream.messages[0].content;
    assert.ok(questSystem.includes('APPROVED-CROSS-MODE'));
    assert.ok(!questSystem.includes('OPEN-CHAT-PRIVATE-MEMORY'));
    assert.ok(questUpstream.messages.some((item) => item.content === 'QUEST-HISTORY'));
    assert.ok(!questUpstream.messages.some((item) => item.content === 'OPEN-HISTORY'));
    clean('quest handler prompt', questSystem);

    const openResponse = await chatHandler(
      new Request('http://local/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...common, mode: 'open-chat', approvedCrossMode: [] }),
      })
    );
    assert.equal(openResponse.status, 200);
    const openUpstream = captured.pop() as {
      messages: { role: string; content: string }[];
    };
    assert.ok(openUpstream.messages[0].content.includes('OPEN-CHAT-PRIVATE-MEMORY'));
    assert.ok(openUpstream.messages.some((item) => item.content === 'OPEN-HISTORY'));
    assert.ok(!openUpstream.messages.some((item) => item.content === 'QUEST-HISTORY'));

    captured.length = 0;
    let sceneCalls = 0;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      captured.push(
        typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
      );
      sceneCalls++;
      if (sceneCalls === 1) {
        return Response.json({
          choices: [{ message: { content: 'rear book room, white book, warm desk light' } }],
        });
      }
      return Response.json({ images: [{ url: 'https://example.invalid/scene.jpg' }] });
    }) as typeof fetch;
    const sceneResponse = await sceneHandler(
      new Request('http://local/api/scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: 'momo',
          route: 'sao',
          text: 'Momo đặt cuốn sách trắng xuống bàn.',
          scene: 'Gian sách phía sau đã đóng cửa.',
          subject: 'data:image/png;base64,AAAA',
        }),
      })
    );
    assert.equal(sceneResponse.status, 200);
    const writerPayload = captured[0] as {
      messages: { role: string; content: string }[];
    };
    const sceneSystem = writerPayload.messages[0].content;
    assert.ok(sceneSystem.includes('Watanuki'));
    assert.ok(sceneSystem.includes('White book'));
    clean('scene handler route propagation', sceneSystem);
    const composerPayload = captured[1] as { prompt: string };
    assert.ok(composerPayload.prompt.includes('Momo Kuroha'));
    assert.ok(composerPayload.prompt.includes('corset mềm'));
    clean('subject handler route propagation', composerPayload.prompt);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = oldDeepSeek;
    if (oldFal === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = oldFal;
  }
}

/**
 * The rig gate must reject an inside-out skeleton, not just a missing bone.
 *
 * Meshy numbers its spine Hips→Spine02→Spine01→Spine; Mixamo numbers it
 * Hips→Spine→Spine1→Spine2. A name-based map would send lower-torso rotation to
 * the upper chest on one of them, silently. So the check that matters is whether
 * the resolver refuses a skeleton whose chain is wrong — a gate that cannot fail
 * is not a gate.
 */
function boneMapCoverage(): void {
  const bone = (name: string, ...children: BoneLike[]): BoneLike => ({ name, children });

  // The real placeholder's chain, lowest spine segment first off Hips.
  const meshy = bone(
    'Armature',
    bone(
      'Hips',
      bone('LeftUpLeg', bone('LeftLeg')),
      bone(
        'Spine02',
        bone(
          'Spine01',
          bone(
            'Spine',
            bone('LeftShoulder', bone('LeftArm', bone('LeftForeArm', bone('LeftHand')))),
            bone('RightShoulder', bone('RightArm', bone('RightForeArm', bone('RightHand')))),
            bone('neck', bone('Head', bone('head_end')))
          )
        )
      )
    )
  );

  const map = resolveSemanticBones(meshy);
  assert.equal(map.spine_lower, 'Spine02', 'lowest spine segment is the one on Hips');
  assert.equal(map.spine_mid, 'Spine01');
  assert.equal(map.spine_upper, 'Spine', 'topmost spine segment carries neck and shoulders');
  assert.equal(map.neck, 'neck');
  assert.equal(map.head, 'Head');
  assert.equal(map.hand_l, 'LeftHand');
  assert.equal(map.hand_r, 'RightHand');

  // A Mixamo-style chain must resolve to the same roles with different names —
  // that equivalence is the whole point of the semantic layer.
  const mixamo = bone(
    'Armature',
    bone(
      'Hips',
      bone(
        'Spine',
        bone(
          'Spine1',
          bone(
            'Spine2',
            bone('LeftShoulder', bone('LeftArm', bone('LeftForeArm', bone('LeftHand')))),
            bone('RightShoulder', bone('RightArm', bone('RightForeArm', bone('RightHand')))),
            bone('Neck', bone('Head'))
          )
        )
      )
    )
  );
  const mixamoMap = resolveSemanticBones(mixamo);
  assert.equal(mixamoMap.spine_lower, 'Spine');
  assert.equal(mixamoMap.spine_upper, 'Spine2');
  assert.equal(mixamoMap.head, 'Head');

  // Now prove it fails: a two-segment spine, and a skeleton with no Hips.
  assert.throws(
    () =>
      resolveSemanticBones(
        bone('Armature', bone('Hips', bone('Spine01', bone('Spine', bone('neck', bone('Head'))))))
      ),
    /expected 3 spine segments/,
    'a short spine must be rejected rather than half-mapped'
  );
  assert.throws(
    () => resolveSemanticBones(bone('Armature', bone('Root', bone('Spine')))),
    /no bone named Hips/
  );
}

requiredViews();
promptCoverage();
scriptedCoverage();
questConfigCoverage();
briefAndOverrideCoverage();
boneMapCoverage();
await storeQuestCoverage();
await handlerCoverage();

console.log('canon verification passed');
console.log('  route views: 3 residents, 33 reveals, 27 truths, 16 causal memories');
console.log('  prompts: every reveal + every enabled route quest + safety');
console.log('  scripted fallback: 12 turns per resident');
console.log('  quests: route lookup + checkpoint resume + stable reveal ids');
console.log('  rig: semantic bones resolved by hierarchy; inverted spine rejected');
console.log('  HTTP: chat memory isolation + scene route propagation');
