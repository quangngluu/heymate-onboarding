import assert from 'node:assert/strict';
import chatHandler from '../api/chat';
import sceneHandler from '../api/scene-image';
import { buildSystemPrompt, type PromptSession } from '../src/chat/prompt';
import {
  canonRevealIndexFor,
  canonViewFor,
  endingFor,
  endingReady,
  sceneBriefFor,
  subjectBriefFor,
} from '../src/config/canon-view';
import { togetherFor } from '../src/config/bond';
import { questById, questsForResident } from '../src/config/quests';
import { reactionsFor } from '../src/config/reactions';
import {
  LENGTHS,
  RESIDENTS,
  SCENARIOS,
  residentById,
  type LengthId,
  type ResidentId,
  type ScenarioId,
} from '../src/config/residents';
import { FACES, type Face } from '../src/config/face';
import { idleLine, openingLine, reply } from '../src/chat/engine';
import { resolveSemanticBones, type BoneLike } from '../src/three/bone-map';

/**
 * The story face, because reveals, the open loop and the causal bank are all
 * story-only. Most of this file is checking that content, so `story` is the
 * right default here even though the product opens on `companion`.
 */
const SESSION: PromptSession = {
  nickname: '',
  persona: '',
  identity: '',
  scenario: 'casual',
  face: 'story',
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

/**
 * The two faces are actually two, and the contradiction is gone.
 *
 * Before this split every prompt carried both — psyche, ordinary time, heat and
 * cheap truths *and* the world, the causal bank, thirty-three reveals and the
 * open loop — about 35,400 characters, so the model averaged a companion and a
 * mystery. The old surface asked the visitor to tune that mixture across six
 * axes and twenty-seven options, two of which contradicted each other outright:
 * `STYLE=lead` emitted "Em dẫn" while `LEAD=you-lead` emitted "Anh dẫn" into the
 * same prompt.
 */
function faceCoverage(): void {
  const LEADS_HER = /Em dẫn|Em thường là người mở lời/;
  const LEADS_HIM = /Anh dẫn/;
  const OPEN_LOOP = 'luôn có một thứ còn dở';
  const STRAIGHT = 'Em kể phần của mình một cách thẳng thắn';

  for (const resident of RESIDENTS) {
    const view = canonViewFor(resident.id, 'sao');
    const build = (face: Face, scenario: ScenarioId, length: LengthId, revealNow?: string) =>
      buildSystemPrompt(
        resident.id,
        { ...SESSION, face, scenario, length },
        [],
        5,
        revealNow,
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

    // Companion never withholds and never drips, so there is nothing for a
    // scenario to have to switch off.
    const companion = build('companion', 'together', 'natural');
    assert.ok(!companion.includes(OPEN_LOOP), `${resident.id}: companion carries the open loop`);
    assert.ok(companion.includes(STRAIGHT), `${resident.id}: companion lost the straight-answer rule`);
    // Companion never *schedules* a reveal. It may still let her mention one she
    // already opened in the story face — that is continuity, not a drip — so the
    // assertion is about the directive, not about the text appearing at all.
    const INJECT = 'Đưa điều này vào phản hồi bằng lời của em';
    const withReveal = build('companion', 'casual', 'natural', view.canonReveals[3].id);
    assert.ok(!withReveal.includes(INJECT), `${resident.id}: companion scheduled a canon reveal`);
    assert.ok(
      build('story', 'casual', 'natural', view.canonReveals[3].id).includes(INJECT),
      `${resident.id}: story stopped scheduling reveals`
    );

    // Story does withhold, and does drip.
    const story = build('story', 'casual', 'natural');
    assert.ok(story.includes(OPEN_LOOP), `${resident.id}: story lost the open loop`);

    // The split has to be worth its complexity: if both faces come out the same
    // size, nothing was actually separated. Measured at 12-14% — the floor is
    // higher than it looks because companion still needs who she is and the
    // closed-world gazetteer, and cutting the latter is what let her confirm a
    // retired district. The real win is the contradiction and the baiting being
    // gone, not the byte count.
    assert.ok(
      companion.length < story.length * 0.90,
      `${resident.id}: faces are the same size (companion ${companion.length}, story ${story.length})`
    );

    // No prompt may tell her both to lead and to follow. This is the assertion
    // the old two-axis surface would have failed.
    const faces: Face[] = ['companion', 'story'];
    const scenarios: ScenarioId[] = ['casual', 'latenight', 'together', 'goodnight'];
    const lengths: LengthId[] = ['short', 'natural', 'expressive'];
    for (const face of faces) {
      for (const scenario of scenarios) {
        for (const length of lengths) {
          const prompt = build(face, scenario, length);
          assert.ok(
            !(LEADS_HER.test(prompt) && LEADS_HIM.test(prompt)),
            `${resident.id}/${face}/${scenario}/${length}: prompt says both "Em dẫn" and "Anh dẫn"`
          );
          for (const rule of SAFETY) assert.ok(prompt.includes(rule));
          clean(`${resident.id} ${face}/${scenario}`, prompt);
        }
      }
    }
  }

  // The surface itself: two faces, four contexts, three lengths. Nothing else.
  assert.equal(FACES.length, 2, 'face count');
  assert.equal(SCENARIOS.length, 4, 'scenario count');
  assert.equal(LENGTHS.length, 3, 'length count');
  assert.equal(
    FACES.length + SCENARIOS.length + LENGTHS.length,
    9,
    'config surface grew back'
  );
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

/**
 * Every terminal branch names an authored ending, and every authored ending is
 * either reachable or visibly unfinished.
 *
 * `endings` sat on two of the three route files and nothing in the runtime read
 * it — it was not in the contract, so the exporter reached it through a cast.
 * Eight authored endings were unreachable, the third resident had none at all,
 * and the "kết cục" count on the quest card was derived from the shape of the
 * graph rather than from anything written. A quest simply stopped.
 */
function endingCoverage(): void {
  for (const resident of RESIDENTS) {
    const view = canonViewFor(resident.id, 'sao');
    assert.ok(view.endings.length > 0, `${resident.id}: no authored endings on sao`);
    assert.equal(
      new Set(view.endings.map((e) => e.id)).size,
      view.endings.length,
      `${resident.id}: duplicate ending id`
    );

    for (const quest of questsForResident(resident.id, 'sao')) {
      const terminals: { where: string; endingId?: string }[] = [];
      for (const node of quest.nodes) {
        for (const choice of node.choices) {
          if (!choice.nextNodeId) terminals.push({ where: `${node.id}/${choice.id}`, endingId: choice.endingId });
        }
        for (const family of [
          ...(node.freeform?.families ?? []),
          ...(node.freeform ? [node.freeform.fallback] : []),
        ]) {
          if (!family.nextNodeId) terminals.push({ where: `${node.id}/${family.id}`, endingId: family.endingId });
        }
      }
      assert.ok(terminals.length > 0, `${quest.id}: no terminal branch`);
      for (const terminal of terminals) {
        assert.ok(terminal.endingId, `${quest.id} ${terminal.where}: terminal branch names no ending`);
        const ending = endingFor(resident.id, 'sao', terminal.endingId!);
        assert.ok(ending, `${quest.id} ${terminal.where}: ending '${terminal.endingId}' does not resolve`);
      }
    }
  }

  // An unfinished ending must be unfinished loudly: the marker present, and the
  // gate that stops it reaching a player working.
  const rinEndings = canonViewFor('rin', 'sao').endings;
  const unfinished = rinEndings.filter((e) => !endingReady(e));
  assert.equal(unfinished.length, 5, "rin's five endings should still be unwritten");
  for (const ending of unfinished) {
    assert.equal(ending.label, 'MISSING INPUT');
    assert.ok(!endingReady(ending), `${ending.id}: unwritten ending must not be marked ready`);
  }
  // Kagari and Momo's are written, and must not be gated by accident.
  for (const id of ['kagura', 'momo'] as const) {
    const endings = canonViewFor(id, 'sao').endings;
    assert.equal(endings.length, 4, `${id}: ending count`);
    for (const ending of endings) {
      assert.ok(endingReady(ending), `${id}/${ending.id}: authored ending marked unready`);
      assert.ok(!/MISSING INPUT/.test(ending.label + ending.what));
      clean(`${id} ending ${ending.id}`, `${ending.label} ${ending.what}`);
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
faceCoverage();
endingCoverage();
briefAndOverrideCoverage();
boneMapCoverage();
await storeQuestCoverage();
await handlerCoverage();

console.log('canon verification passed');
console.log('  route views: 3 residents, 33 reveals, 27 truths, 16 causal memories');
console.log('  prompts: every reveal + every enabled route quest + safety');
console.log('  faces: companion withholds nothing; 72 combinations carry no contradictory lead');
console.log('  scripted fallback: 12 turns per resident');
console.log('  quests: route lookup + checkpoint resume + stable reveal ids');
console.log('  endings: every terminal branch resolves; rin x5 unwritten and gated');
console.log('  rig: semantic bones resolved by hierarchy; inverted spine rejected');
console.log('  HTTP: chat memory isolation + scene route propagation');
