// Step views. The studio is the centerpiece: character info card bottom-left,
// character slider bottom-center, generation panel right. The oversized
// character name lives in the 3D scene (nameplate), not in the DOM.

import { h } from './dom';
import type { UIActions } from './actions';
import type { AppState } from '../state/store';
import { COPY } from '../config/copy';
import { FACES } from '../config/face';
import { factionById } from '../config/factions';
import { CHARACTERS, characterById, characterIndex } from '../config/characters';
import { characterThumb, monogramThumb } from '../three/thumbs';
import { UNIVERSES } from '../config/universes';
import {
  LENGTHS,
  RESIDENTS,
  SCENARIOS,
} from '../config/residents';
import { canonViewFor } from '../config/canon-view';
import { resolveCanonRoute } from '../config/canon-route';
import { questNode } from '../config/quests';
import {
  DARK_VARIANTS,
  GATE_COPY,
  darkMechanics,
  resolveDarkVariant,
} from '../config/dark-patterns';
import {
  FORBIDDEN_OPTIONS,
  bondCard,
  fantasiesFor,
  type LeadDynamic,
} from '../config/bond';
import { ONBOARDING_QUESTS } from '../config/onboarding-quests';
import { segments, segmentsUpTo } from '../chat/dialogue';
import { COST, store } from '../state/store';
import { extractMemories } from '../chat/memory';

export interface StepView {
  el: HTMLElement;
  update?(s: AppState, prev: AppState): void;
  destroy?(): void;
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// ---------- GALLERY (outer: pick a universe) ----------

export function galleryStep(actions: UIActions): StepView {
  const tiles = UNIVERSES.map((u) => {
    const poster = h('div', {
      class: 'tile-poster',
      style: `--accent:${cssColor(u.accentColor)}`,
    });
    if (u.posterUrl) {
      const img = h('img', { alt: '', src: u.posterUrl, draggable: 'false' }) as HTMLImageElement;
      img.addEventListener('error', () => img.remove(), { once: true });
      poster.append(img);
    }
    return h(
      'button',
      {
        class: 'universe-tile',
        'data-testid': `universe-${u.id}`,
        style: `--accent:${cssColor(u.accentColor)}`,
        onClick: () => actions.openUniverse(u.id),
      },
      poster,
      h('h2', { class: 'tile-name' }, u.name),
      h('p', { class: 'tile-tagline' }, u.tagline),
      h(
        'span',
        { class: 'tile-meta' },
        u.kind === 'companion'
          ? `${u.residents?.length ?? 0} nhân vật để trò chuyện`
          : `${u.factions?.length ?? 0} phe để tạo Mate`
      )
    );
  });

  const el = h(
    'section',
    { class: 'step step-gallery', 'aria-label': 'Chọn một vũ trụ' },
    h(
      'div',
      { class: 'gallery-wrap' },
      h('p', { class: 'kicker' }, COPY.gallery.kicker),
      h('h1', { class: 'headline' }, COPY.gallery.headline),
      h('p', { class: 'subline' }, COPY.gallery.subline),
      h('div', { class: 'universe-grid' }, ...tiles)
    )
  );
  return { el };
}

// ---------- COMPANION STAGE ----------
//
// Encounter first. The user meets the resident, hears her greeting and talks
// to her before any settings exist. "Set this session" only appears once she
// is no longer a stranger, and it never exposes a raw prompt.

export function stageStep(actions: UIActions, state: AppState): StepView {
  const srOnlyName = h('h1', { class: 'visually-hidden' });
  const info = h('aside', { class: 'panel stage-info' });
  const levelPips = h('div', { class: 'level-pips', 'aria-hidden': 'true' });
  const levelWhere = h('p', { class: 'level-where' });
  const levelNext = h('p', { class: 'level-next' });
  const levelBlock = h(
    'div',
    { class: 'level-block' },
    h('div', { class: 'level-head' }, h('span', { class: 'level-label' }, COPY.stage.levelLabel), levelPips),
    levelWhere,
    levelNext
  );
  // On a phone her card cannot stay open and leave room for her. Collapsed it
  // is a header; tapping anywhere outside a disclosure opens the rest.
  info.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('details')) return;
    info.classList.toggle('is-open');
  });

  // --- roster ---
  const roster = h('div', { role: 'radiogroup', 'aria-label': 'Các nhân vật', class: 'roster' });
  const rosterBtns: HTMLButtonElement[] = [];
  const canonRoute = resolveCanonRoute();
  RESIDENTS.forEach((base) => {
    const r = canonViewFor(base.id, canonRoute);
    const b = h(
      'button',
      {
        role: 'radio',
        'aria-checked': 'false',
        class: 'roster-chip',
        style: `--accent:${cssColor(r.accentColor)}`,
        onClick: () => actions.selectResident(r.id),
      },
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      // Both spellings ship; the stylesheet decides which one is on screen, so
      // the button's accessible name stays the full one on every width.
      h('span', { class: 'chip-full' }, r.name),
      h('span', { class: 'chip-short', 'aria-hidden': 'true' }, r.name.split(' ')[0])
    ) as HTMLButtonElement;
    b.setAttribute('aria-label', r.name);
    rosterBtns.push(b);
    roster.append(b);
  });

  // --- conversation ---
  //
  // What she says lives next to her, as cards on the stage. The controls live
  // in one dock at the bottom centre, so the scene is never behind a box.
  const log = h('div', { class: 'speech-log', 'aria-live': 'polite' });

  // "Để em nói hộ" is a mode of the same input, not another panel: the bar
  // changes what it does and says so, and one tap puts it back.
  let speakMode = false;
  let voiceLeftText = '';

  const input = h('input', {
    type: 'text',
    class: 'chat-input',
    placeholder: COPY.stage.inputPlaceholder,
    'aria-label': 'Tin nhắn cho em',
    maxlength: '220',
  }) as HTMLInputElement;
  const send = () => {
    const v = input.value.trim();
    if (!v) return;
    if (speakMode) {
      if (!store.canAfford('speakForMe')) {
        actions.speakCustomText(v);
        return;
      }
      input.value = '';
      actions.speakCustomText(v);
      speakMode = false;
      applyDockMode();
    } else {
      if (!store.canAfford('turn')) {
        actions.sendMessage(v);
        return;
      }
      input.value = '';
      actions.sendMessage(v);
    }
  };
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') send();
  });
  const sendBtn = h(
    'button',
    { class: 'btn btn-primary', onClick: send },
    `${COPY.stage.send} · ${COST.turn}`
  ) as HTMLButtonElement;
  const turnsLeft = h('span', { class: 'turns-left' });
  const dockHint = h('p', { class: 'dock-hint', hidden: true });
  const speakChip = h(
    'button',
    { class: 'dock-chip', 'data-testid': 'voice-speak-as' },
    COPY.stage.speakAs
  ) as HTMLButtonElement;
  const setChip = h(
    'button',
    { class: 'dock-chip', onClick: () => actions.openSessionPanel() },
    COPY.stage.setSessionShort
  ) as HTMLButtonElement;
  const micChip = h(
    'button',
    {
      class: 'dock-chip dock-mic is-locked',
      disabled: true,
      'aria-label': COPY.stage.voiceChat,
      'data-tip': COPY.stage.voiceChatLocked,
    },
    h('span', { class: 'mic-glyph', 'aria-hidden': 'true' }, '\u25cf'),
    COPY.stage.voiceChat
  ) as HTMLButtonElement;

  // Desktop keeps the labelled chips. On a phone the same secondary actions
  // sit behind one small control beside the composer, so the message stays
  // the dominant action.
  let mobileToolsOpen = false;
  const mobileQuestLabel = h('span', { class: 'mobile-tool-label' }, COPY.stage.quest);
  const mobileQuestBtn = h(
    'button',
    {
      class: 'mobile-tool-item',
      'aria-label': COPY.stage.quest,
      onClick: () => {
        setMobileToolsOpen(false);
        actions.openQuests();
      },
    },
    h('span', { class: 'mobile-tool-symbol', 'aria-hidden': 'true' }, '✦'),
    mobileQuestLabel
  ) as HTMLButtonElement;
  const mobileSpeakBtn = h(
    'button',
    {
      class: 'mobile-tool-item',
      'aria-label': COPY.stage.speakAs,
      onClick: () => {
        setMobileToolsOpen(false);
        speakChip.click();
      },
    },
    h('span', { class: 'mobile-tool-symbol', 'aria-hidden': 'true' }, '〰'),
    COPY.stage.speakAs
  ) as HTMLButtonElement;
  // Voice chat is not open yet. It stays visible as a labelled item in the
  // tools menu rather than as a dead 44px button inside the composer.
  const mobileMicBtn = h(
    'button',
    {
      class: 'mobile-tool-item mobile-mic is-locked',
      disabled: true,
      'aria-label': `${COPY.stage.voiceChat}. ${COPY.stage.voiceChatLocked}`,
      title: COPY.stage.voiceChatLocked,
    },
    h(
      'span',
      { class: 'mobile-tool-symbol mic-icon', 'aria-hidden': 'true' },
      h('span', { class: 'mic-stem' }),
      h('span', { class: 'mic-base' })
    ),
    COPY.stage.voiceChat
  ) as HTMLButtonElement;
  const mobileToolsMenu = h('div', { class: 'mobile-tools-menu', hidden: true }, mobileQuestBtn, mobileSpeakBtn, mobileMicBtn);
  const mobileToolsToggle = h(
    'button',
    {
      class: 'mobile-icon-btn mobile-tools-toggle',
      'aria-label': 'Mở nhiệm vụ và để em nói hộ',
      'aria-expanded': 'false',
      onClick: () => setMobileToolsOpen(!mobileToolsOpen),
    },
    h('span', { class: 'mobile-icon-symbol', 'aria-hidden': 'true' }, '＋')
  ) as HTMLButtonElement;
  const mobileSettingsBtn = h(
    'button',
    {
      class: 'mobile-icon-btn',
      'data-testid': 'session-settings-open',
      'aria-label': COPY.stage.setSession,
      'aria-expanded': 'false',
      onClick: () => {
        setMobileToolsOpen(false);
        actions.openSessionPanel();
      },
    },
    h('span', { class: 'mobile-icon-symbol mobile-gear', 'aria-hidden': 'true' }, '⚙')
  ) as HTMLButtonElement;

  function setMobileToolsOpen(open: boolean): void {
    mobileToolsOpen = open;
    mobileToolsMenu.hidden = !open;
    mobileToolsToggle.setAttribute('aria-expanded', String(open));
  }

  // A tag inside the field, plus quote marks around it: the bar has to look
  // like a line she will say out loud, not a message you are sending her.
  const modeTag = h('span', { class: 'field-tag', hidden: true }, COPY.stage.speakAs) as HTMLElement;
  // While a scene is open the dock carries it: what she asked, and three
  // answers a visitor could honestly give. Typing is always still open.
  const questLine = h('p', { class: 'quest-line' });
  // Spec 3.3 asks for a minimal current objective. Every node already carries
  // one and none of them were ever rendered, so the scene said what was
  // happening and never what the visitor was supposed to do about it.
  const questObjective = h('p', { class: 'quest-objective', hidden: true });
  const questEpisodeLabel = h('span', { class: 'quest-episode-label' }, 'QUEST MODE');
  const questCallBtn = h(
    'button',
    { class: 'btn btn-ghost xs quest-call', onClick: () => actions.interruptQuest() },
    'Gọi Rin'
  ) as HTMLButtonElement;
  const questReturnBtn = h(
    'button',
    { class: 'btn btn-ghost xs', onClick: () => actions.leaveQuest() },
    'Về chat'
  ) as HTMLButtonElement;
  const questHead = h(
    'div',
    { class: 'quest-mode-head' },
    questEpisodeLabel,
    h('div', { class: 'row' }, questCallBtn, questReturnBtn)
  );
  const questOptions = h('div', { class: 'quest-options' });
  const questActionInput = h('input', {
    type: 'text',
    class: 'quest-action-input',
    maxlength: '220',
    'aria-label': 'Hành động khác của anh',
  }) as HTMLInputElement;
  const submitQuestAction = () => {
    const action = questActionInput.value.trim();
    if (!action) return;
    questActionInput.value = '';
    actions.submitQuestAction(action);
  };
  questActionInput.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') submitQuestAction();
  });
  const questActionBtn = h(
    'button',
    { class: 'btn btn-secondary xs', onClick: submitQuestAction },
    'Thực hiện'
  ) as HTMLButtonElement;
  const questFreeform = h(
    'div',
    { class: 'quest-freeform', hidden: true },
    questActionInput,
    questActionBtn
  );
  const questStrip = h(
    'div',
    { class: 'quest-strip', hidden: true },
    questHead,
    questObjective,
    questLine,
    questOptions,
    questFreeform
  );

  const dock = h(
    'div',
    { class: 'stage-dock' },
    questStrip,
    h('div', { class: 'dock-top' }, h('div', { class: 'dock-chips' }, speakChip, micChip, setChip), turnsLeft),
    dockHint,
    h(
      'div',
      { class: 'dock-bar' },
      modeTag,
      mobileToolsToggle,
      mobileToolsMenu,
      h('div', { class: 'field-wrap' }, input),
      mobileSettingsBtn,
      sendBtn
    )
  );
  // Left is her dossier, right is her voice, bottom is what you do. The card
  // can step off the frame entirely when the visitor wants the stage clear.
  // On a phone she gets the screen and her dossier starts out of the way: one
  // viewport has to hold the roster, her, her words and the composer, and the
  // card is the only one of those the visitor can ask for later.
  const compact = window.matchMedia?.('(max-width: 700px)').matches ?? false;
  const setInfoHidden = (hidden: boolean) => {
    info.classList.toggle('is-hidden', hidden);
    info.toggleAttribute('inert', hidden);
    info.setAttribute('aria-hidden', String(hidden));
  };
  setInfoHidden(compact);
  const cardToggle = h(
    'button',
    { class: 'btn btn-ghost sm', 'aria-label': COPY.stage.cardToggle, 'aria-pressed': String(!compact), onClick: () => {
      const hidden = !info.classList.contains('is-hidden');
      setInfoHidden(hidden);
      cardToggle.setAttribute('aria-pressed', String(!hidden));
    } },
    h('span', { class: 'stage-control-icon', 'aria-hidden': 'true' }, '☰'),
    h('span', { class: 'stage-control-label' }, COPY.stage.cardToggle)
  ) as HTMLButtonElement;
  const leaveUniverseBtn = h(
    'button',
    { class: 'btn btn-ghost sm', 'aria-label': COPY.stage.leave, onClick: () => actions.leaveUniverse() },
    h('span', { class: 'stage-control-icon stage-back-icon', 'aria-hidden': 'true' }, '‹'),
    h('span', { class: 'stage-control-label' }, COPY.stage.leave)
  ) as HTMLButtonElement;
  const rail = h('div', { class: 'stage-rail' }, log);

  // --- session sheet (only after the encounter) ---
  const nickInput = h('input', {
    type: 'text',
    class: 'name-input',
    placeholder: COPY.stage.nicknamePlaceholder,
    'aria-label': COPY.stage.nickname,
    maxlength: '24',
  }) as HTMLInputElement;
  nickInput.addEventListener('change', () => actions.updateSession({ nickname: nickInput.value }));
  const identityInput = h('input', {
    type: 'text',
    class: 'name-input',
    placeholder: COPY.stage.identityPlaceholder,
    'aria-label': COPY.stage.identity,
    maxlength: '120',
  }) as HTMLInputElement;
  identityInput.addEventListener('change', () =>
    actions.updateSession({ identity: identityInput.value })
  );
  const personaInput = h('textarea', {
    class: 'persona-input',
    rows: '3',
    placeholder: COPY.stage.personaPlaceholder,
    'aria-label': COPY.stage.persona,
    maxlength: '180',
  }) as HTMLTextAreaElement;
  personaInput.addEventListener('input', () => actions.updateSession({ persona: personaInput.value }));

  function segment<T extends string>(
    label: string,
    options: { id: T; label: string }[],
    onPick: (id: T) => void
  ): { el: HTMLElement; btns: HTMLButtonElement[] } {
    const btns: HTMLButtonElement[] = [];
    const seg = h('div', { role: 'radiogroup', 'aria-label': label, class: 'segment' });
    for (const o of options) {
      const b = h(
        'button',
        { role: 'radio', 'aria-checked': 'false', class: 'segment-btn', onClick: () => onPick(o.id) },
        h('span', { class: 'segment-label' }, o.label)
      ) as HTMLButtonElement;
      btns.push(b);
      seg.append(b);
    }
    return {
      el: h('div', { class: 'custom-group' }, h('h3', { class: 'group-label' }, label), seg),
      btns,
    };
  }

  function selectField<T extends string>(
    label: string,
    options: readonly { id: T; label: string }[],
    onPick: (id: T) => void,
    className = ''
  ): { el: HTMLElement; select: HTMLSelectElement } {
    const select = h(
      'select',
      {
        class: `session-select${className ? ` ${className}` : ''}`,
        'aria-label': label,
        onChange: () => onPick(select.value as T),
      },
      ...options.map((option) => h('option', { value: option.id }, option.label))
    ) as HTMLSelectElement;
    return {
      el: h(
        'label',
        { class: 'session-setting-row' },
        h('span', { class: 'session-setting-label' }, label),
        h(
          'span',
          { class: 'session-select-wrap' },
          select,
          h('span', { class: 'session-select-chevron', 'aria-hidden': 'true' }, '›')
        )
      ),
      select,
    };
  }

  let identityCustomActive = false;
  const identityMode = selectField(
    'Vai của anh',
    [
      { id: 'self', label: 'Chính anh' },
      { id: 'character', label: 'Nhân vật khác…' },
    ] as const,
    (id) => {
      identityCustomActive = id === 'character';
      if (id === 'self') {
        identityInput.value = '';
        actions.updateSession({ identity: '' });
      }
      identityCustom.hidden = id !== 'character';
      if (id === 'character') requestAnimationFrame(() => identityInput.focus());
    }
  );
  const identityCustom = h(
    'div',
    { class: 'session-inline-custom', hidden: true },
    identityInput,
    h('p', { class: 'hint faint' }, COPY.stage.identityNote)
  );
  // The primary choice. Everything else in this sheet refines it.
  const face = selectField(
    'Em ở đây để',
    FACES.map((f) => ({ id: f.id, label: f.label })),
    (id) => actions.updateSession({ face: id })
  );
  const faceHint = h('p', { class: 'hint faint' }, '');
  const scen = selectField('Bối cảnh', SCENARIOS, (id) =>
    actions.updateSession({ scenario: id })
  );
  scen.select.dataset.testid = 'session-scenario';
  const len = selectField(COPY.stage.length, LENGTHS, (id) =>
    actions.updateSession({ length: id })
  );
  len.select.dataset.testid = 'session-length';

  // --- the bond: how she is with him, not who she is ---
  //
  // These sit in the same sheet as the session settings but they are a different
  // kind of thing and the copy says so: session settings are weather for one
  // visit, the bond persists and is what makes this her-with-him.
  const bondFantasy = h('div', { role: 'radiogroup', 'aria-label': 'Góc quan hệ', class: 'segment segment-stack' });
  const fantasyBtns = new Map<string, HTMLButtonElement>();
  const bondAddress = h('input', {
    type: 'text',
    class: 'chat-input',
    placeholder: 'Ví dụ: Player Zero',
    'aria-label': 'Em gọi anh là gì',
    maxlength: '28',
  }) as HTMLInputElement;
  bondAddress.addEventListener('change', () => store.updateBond({ address: bondAddress.value.trim() }));
  const leadSeg = segment(
    'Ai thường mở lời',
    [
      { id: 'she-leads', label: 'Em dẫn' },
      { id: 'contested', label: 'Đổi qua lại' },
      { id: 'you-lead', label: 'Anh dẫn' },
      { id: 'equals', label: 'Ngang nhau' },
    ] as { id: LeadDynamic; label: string }[],
    (id) => store.updateBond({ lead: id })
  );
  const forbidBox = h('div', { class: 'memory-list' });
  const forbidChecks = new Map<string, HTMLInputElement>();
  for (const o of FORBIDDEN_OPTIONS) {
    const box = h('input', { type: 'checkbox' }) as HTMLInputElement;
    box.addEventListener('change', () => {
      const on = [...forbidChecks.entries()].filter(([, b]) => b.checked).map(([id]) => id);
      store.updateBond({ forbidden: on });
    });
    forbidChecks.set(o.id, box);
    forbidBox.append(h('label', { class: 'memory-item' }, box, h('span', {}, o.label)));
  }
  const bondCardBox = h('div', { class: 'bond-card' });

  const sessionAdvanced = h(
    'details',
    { class: 'session-advanced', 'data-testid': 'session-advanced' },
    h('summary', {}, h('span', {}, 'Nâng cao')),
    h(
      'div',
      { class: 'session-advanced-body' },
      len.el,
      h('div', { class: 'custom-group' }, h('h3', { class: 'group-label' }, COPY.stage.nickname), nickInput),
      h(
        'div',
        { class: 'custom-group' },
        h('h3', { class: 'group-label' }, COPY.stage.persona),
        personaInput,
        h('p', { class: 'hint faint' }, COPY.stage.personaNote)
      ),
      h('div', { class: 'bond-divider' }),
      h(
        'p',
        { class: 'hint faint' },
        'Các mục dưới đây được giữ theo từng nhân vật và định hình mối quan hệ lâu dài.'
      ),
      h(
        'div',
        { class: 'custom-group' },
        h('h3', { class: 'group-label' }, 'Góc quan hệ anh muốn ở phía trước'),
        bondFantasy
      ),
      leadSeg.el,
      h(
        'div',
        { class: 'custom-group' },
        h('h3', { class: 'group-label' }, 'Em gọi anh là'),
        bondAddress,
        h('p', { class: 'hint faint' }, 'Để trống thì em tự đặt khi tới lúc.')
      ),
      h(
        'div',
        { class: 'custom-group' },
        h('h3', { class: 'group-label' }, 'Điều em không được làm'),
        forbidBox,
        h('p', { class: 'hint faint' }, 'Ranh giới của anh luôn được ưu tiên.')
      ),
      h(
        'div',
        { class: 'custom-group' },
        h('h3', { class: 'group-label bond-card-title' }, 'Mối quan hệ hiện tại'),
        bondCardBox
      )
    )
  );

  const sessionCard = h(
    'aside',
    { class: 'panel session-sheet' },
    h(
      'div',
      { class: 'row sheet-head' },
      h('h2', { class: 'panel-title' }, COPY.stage.setSession),
      h(
        'button',
        {
          class: 'chrome-btn',
          'data-testid': 'session-settings-close',
          'aria-label': 'Đóng thiết lập',
          onClick: () => actions.closeSessionPanel(),
        },
        '×'
      )
    ),
    h(
      'div',
      { class: 'sheet-body' },
      h('p', { class: 'session-impact-note' }, 'Ba lựa chọn này thay đổi cách em phản hồi rõ nhất.'),
      h(
        'div',
        { class: 'session-primary' },
        face.el,
        faceHint,
        identityMode.el,
        identityCustom,
        scen.el
      ),
      sessionAdvanced
    ),
    h(
      'div',
      { class: 'sheet-foot' },
      h(
        'button',
        {
          class: 'btn btn-ghost xs',
          onClick: () => {
            identityCustomActive = false;
            actions.resetSession();
          },
        },
        COPY.stage.resetSession
      ),
      h('button', { class: 'btn btn-primary', onClick: () => actions.closeSessionPanel() }, COPY.stage.applySession)
    )
  );
  const sessionSheet = h(
    'div',
    {
      class: 'modal-scrim session-scrim',
      hidden: true,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': COPY.stage.setSession,
      onClick: (e: Event) => {
        if (e.target === e.currentTarget) actions.closeSessionPanel();
      },
    },
    sessionCard
  );

  // --- save gate ---
  //
  // The action, the price and what is kept are identical in every variant.
  // Only the wording around the two buttons moves, which is what makes A/B/C
  // measurable: if behaviour changes, it changed because of the copy.
  const variant = resolveDarkVariant();
  const gate = GATE_COPY[variant];
  const mech = darkMechanics(variant);
  const memList = h('div', { class: 'memory-list' });
  const gateCost = h('p', { class: 'hint' });
  const gateUrgency = h('p', { class: 'hint gate-urgency', hidden: !gate.saveUrgency });
  const saveBtn = h('button', { class: 'btn btn-primary' }, COPY.stage.saveCta) as HTMLButtonElement;
  const skipBtn = h('button', { class: 'btn btn-ghost' }, gate.saveSkip) as HTMLButtonElement;
  const memChecks = new Map<string, HTMLInputElement>();
  saveBtn.addEventListener('click', () => {
    const keep = [...memChecks.entries()].filter(([, c]) => c.checked).map(([id]) => id);
    actions.saveChapter(keep);
  });

  // Obstructed exit: leaving costs a second tap it does not need to cost.
  // Deliberately visible as friction — it is the thing being measured.
  let skipArmed = false;
  skipBtn.addEventListener('click', () => {
    if (mech.obstructedExit && !skipArmed) {
      skipArmed = true;
      skipBtn.textContent = gate.skipConfirm;
      return;
    }
    skipArmed = false;
    skipBtn.textContent = gate.saveSkip;
    actions.continueWithoutSaving();
  });

  const saveGate = h(
    'div',
    { class: 'save-gate', hidden: true, role: 'dialog', 'aria-label': COPY.stage.saveTitle },
    h(
      'div',
      { class: 'panel gate-card' },
      ...(DARK_VARIANTS[variant].banner
        ? [h('p', { class: 'hint faint gate-banner' }, DARK_VARIANTS[variant].banner as string)]
        : []),
      h('h2', { class: 'panel-title' }, COPY.stage.saveTitle),
      h('p', { class: 'hint' }, gate.saveBody),
      gateUrgency,
      h('p', { class: 'group-label' }, COPY.stage.saveList),
      memList,
      gateCost,
      h('div', { class: 'row' }, skipBtn, saveBtn)
    )
  );

  // Fake urgency: a countdown against no deadline. It stops at zero and
  // nothing happens, because nothing was ever going to. Only variant C runs
  // it, and only under the banner above that says the clock is not real.
  let gateTimer: number | null = null;
  function stopGateCountdown(): void {
    if (gateTimer !== null) window.clearInterval(gateTimer);
    gateTimer = null;
  }
  function startGateCountdown(): void {
    stopGateCountdown();
    if (!mech.fakeUrgency) return;
    let left = 299;
    const paint = () => {
      const mm = Math.floor(left / 60);
      const ss = String(left % 60).padStart(2, '0');
      gateUrgency.textContent = `Chỉ còn ${mm}:${ss} để giữ lại chương này.`;
      if (left <= 0) stopGateCountdown();
      left -= 1;
    };
    paint();
    gateTimer = window.setInterval(paint, 1000);
  }

  // --- Quest Hub: story progression and onboarding rewards are different loops. ---
  const storyQuestList = h('div', { class: 'quest-list' });
  const onboardingQuestList = h('div', { class: 'quest-list onboarding-quest-list' });
  let questTab: 'story' | 'onboarding' = 'story';
  const storyTab = h('button', { class: 'quest-tab', role: 'tab' }, 'Cốt truyện') as HTMLButtonElement;
  const onboardingTab = h('button', { class: 'quest-tab', role: 'tab' }, 'Tân thủ') as HTMLButtonElement;
  function setQuestTab(tab: 'story' | 'onboarding'): void {
    questTab = tab;
    const story = tab === 'story';
    storyTab.setAttribute('aria-selected', String(story));
    onboardingTab.setAttribute('aria-selected', String(!story));
    storyTab.classList.toggle('is-active', story);
    onboardingTab.classList.toggle('is-active', !story);
    storyQuestList.hidden = !story;
    onboardingQuestList.hidden = story;
  }
  storyTab.addEventListener('click', () => setQuestTab('story'));
  onboardingTab.addEventListener('click', () => setQuestTab('onboarding'));
  setQuestTab('story');
  const questHub = h(
    'div',
    {
      class: 'modal-scrim quest-hub-scrim',
      hidden: true,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Quest Hub',
      onClick: (event: Event) => {
        if (event.target === event.currentTarget) actions.closeQuests();
      },
    },
    h(
      'aside',
      { class: 'panel quest-hub' },
      h(
        'div',
        { class: 'row sheet-head' },
        h('div', {}, h('p', { class: 'kicker' }, 'Quest Hub'), h('h2', { class: 'panel-title' }, 'Đi tiếp cùng em')),
        h('button', { class: 'chrome-btn', 'aria-label': 'Đóng Quest Hub', onClick: () => actions.closeQuests() }, '×')
      ),
      h('div', { class: 'quest-tabs', role: 'tablist', 'aria-label': 'Loại nhiệm vụ' }, storyTab, onboardingTab),
      h('p', { class: 'hint faint quest-hub-lead' }, COPY.stage.questLead),
      h('div', { class: 'quest-hub-body' }, storyQuestList, onboardingQuestList)
    )
  );

  // --- speak-for-me: a mode of the dock, wired here ---
  speakChip.addEventListener('click', () => {
    speakMode = !speakMode;
    applyDockMode();
    input.focus();
  });
  /** The dock states what the bar will do before the visitor commits to it. */
  function applyDockMode(): void {
    speakChip.classList.toggle('is-active', speakMode);
    speakChip.setAttribute('aria-pressed', String(speakMode));
    mobileSpeakBtn.classList.toggle('is-active', speakMode);
    mobileSpeakBtn.setAttribute('aria-pressed', String(speakMode));
    dock.classList.toggle('is-speak', speakMode);
    input.placeholder = speakMode ? COPY.stage.voiceMessagePlaceholder : COPY.stage.inputPlaceholder;
    sendBtn.textContent = speakMode
      ? `${COPY.stage.voiceMessageSend} · ${COST.speakForMe}`
      : `${COPY.stage.send} · ${COST.turn}`;
    modeTag.hidden = !speakMode;
    (dockHint as HTMLElement).hidden = !speakMode;
    dockHint.textContent = `${COPY.stage.voiceMessageLead} ${voiceLeftText}`;
  }
  applyDockMode();

  // --- turn-around unlock gate ---
  const codeInput = h('input', {
    type: 'text',
    class: 'name-input',
    placeholder: 'MÃ TRONG HỘP',
    'aria-label': COPY.stage.unlockCode,
    maxlength: '16',
  }) as HTMLInputElement;
  const unlockGate = h(
    'div',
    { class: 'save-gate', hidden: true, role: 'dialog', 'aria-label': COPY.stage.unlockTitle },
    h(
      'div',
      { class: 'panel gate-card' },
      h('h2', { class: 'panel-title' }, COPY.stage.unlockTitle),
      h('p', { class: 'hint' }, COPY.stage.unlockBody),
      h(
        'div',
        { class: 'row gate-choices' },
        h('button', { class: 'btn btn-secondary', onClick: () => actions.makeYourVersion() }, COPY.stage.unlockOwn),
        h('button', { class: 'btn btn-primary', onClick: () => actions.unlockView() }, COPY.stage.unlockCta)
      ),
      h('p', { class: 'hint faint' }, COPY.stage.unlockOwnNote),
      h('p', { class: 'group-label' }, COPY.stage.unlockCode),
      h(
        'div',
        { class: 'chat-row' },
        codeInput,
        h('button', { class: 'btn btn-secondary', onClick: () => actions.unlockView(codeInput.value) }, COPY.stage.unlockCodeCta)
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn-ghost xs', onClick: () => actions.closeUnlockGate() }, COPY.stage.unlockSkip)
      )
    )
  );

  const el = h(
    'section',
    { class: 'step step-stage', 'aria-label': 'Gặp nhân vật' },
    srOnlyName,
    h(
      'header',
      { class: 'stage-top' },
      leaveUniverseBtn,
      cardToggle
    ),
    info,
    sessionSheet,
    questHub,
    roster,
    rail,
    dock,
    saveGate,
    unlockGate
  );

  // The dock is the only thing whose height nobody controls: the quest strip
  // makes it two or three times taller. Publish that height so the rail above
  // can stay clear of it instead of guessing.
  const watchDock = new ResizeObserver(([entry]) => {
    // Border box, not content box: the dock's own padding and border are 26px
    // of the height the rail has to clear, and measuring the content box put
    // her last line exactly that far underneath it.
    const box = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
    el.style.setProperty('--dock-h', `${Math.round(box)}px`);
  });

  let lastResident = '';
  let lastRosterScrolledTo = '';
  let lastFantasyFor = '';
  let lastQuestId = '';
  let lastChatLen = -1;
  let lastChatScope = '';
  let lastWaiting = false;
  let lastRevealKey = '';
  let lastShotKeys = '';
  let lastGateOpen = false;
  watchDock.observe(dock);

  return {
    el,
    destroy() {
      watchDock.disconnect();
      stopGateCountdown();
    },
    update(s, prev) {
      const r = canonViewFor(s.residentId, canonRoute);
      const saved = s.progress[s.residentId];
      el.style.setProperty('--accent', cssColor(r.accentColor));

      if (s.residentId !== lastResident) {
        lastResident = s.residentId;
        srOnlyName.textContent = r.name;
        nickInput.value = s.session.nickname;
        personaInput.value = s.session.persona;
        // The card carries three layers: the hook, who she is, and what the
        // user gets. Full canon stays behind the story list.
        info.replaceChildren(
          h(
            'div',
            { class: 'row chip-row' },
            h('span', { class: 'chip chip-accent' }, saved?.visits ? `Lần gặp ${saved.visits + 1}` : 'Lần đầu gặp'),
            h('span', { class: 'chip' }, 'Tiếng Việt')
          ),
          h('h2', { class: 'card-name' }, r.name),
          h('p', { class: 'card-series' }, r.series.split(' - ')[0]),
          h('p', { class: 'card-hook' }, r.card.hook),
          h('p', { class: 'card-promise' }, r.card.promise),
          h('details', { class: 'profile-more' },
            h('summary', {}, 'Em là ai'),
            h('p', { class: 'card-bio' }, r.card.personality),
            h('p', { class: 'card-bio' }, r.profile),
            h('p', { class: 'card-setting' }, r.setting)
          ),
          levelBlock,
          h('details', { class: 'episode-block profile-more' },
            h('summary', {}, 'Câu chuyện của em'),
            h('div', { class: 'episode-list' })
          )
        );
      }
      if (document.activeElement !== nickInput) nickInput.value = s.session.nickname;
      if (document.activeElement !== identityInput) identityInput.value = s.session.identity;
      if (document.activeElement !== personaInput) personaInput.value = s.session.persona;
      if (s.session.identity) identityCustomActive = true;
      if (s.sessionPanelOpen && !prev.sessionPanelOpen) {
        identityCustomActive = Boolean(s.session.identity);
      }
      identityMode.select.value = identityCustomActive ? 'character' : 'self';
      identityCustom.hidden = !identityCustomActive;
      scen.select.value = s.session.scenario;
      face.select.value = s.session.face;
      len.select.value = s.session.length;
      const activeFace = FACES.find((f) => f.id === s.session.face) ?? FACES[0];
      faceHint.textContent = activeFace.hint;
      // Bối cảnh only means anything in the companion face; the story face takes
      // its scene from the quest, so offering it there would be a dead control.
      scen.el.hidden = s.session.face !== 'companion';
      const scenarioLabel = scen.select.selectedOptions[0]?.text ?? 'Thường ngày';
      const identityLabel = s.session.identity || 'Chính anh';
      const sessionSummary =
        s.session.face === 'companion'
          ? `${identityLabel} · ${activeFace.label} · ${scenarioLabel}`
          : `${identityLabel} · ${activeFace.label}`;
      setChip.textContent = sessionSummary;
      setChip.title = sessionSummary;
      mobileSettingsBtn.setAttribute('aria-label', `Cấu hình: ${sessionSummary}`);
      mobileSettingsBtn.title = sessionSummary;

      // Unlocked canon reveals read as her story opening up, locked ones as the
      // reason to keep going.
      const epList = info.querySelector('.episode-list');
      if (epList) {
        epList.replaceChildren(
          ...r.canonReveals.map((ep, i) => {
            const open = i < s.revealed;
            return h(
              'div',
              { class: `episode${open ? ' is-open' : ''}` },
              h('span', { class: 'episode-title' }, open ? ep.title : 'Chưa mở'),
              ...(open ? [h('p', { class: 'episode-body' }, ep.body)] : [])
            );
          })
        );
      }

      rosterBtns.forEach((b, i) => {
        const active = RESIDENTS[i].id === s.residentId;
        b.setAttribute('aria-checked', String(active));
        b.classList.toggle('is-active', active);
        // The roster is a sideways strip on a phone, so whoever is selected has
        // to be the one on screen — otherwise the highlight is off in the part
        // of the strip nobody scrolled to.
        if (active && lastRosterScrolledTo !== s.residentId && roster.scrollWidth > roster.clientWidth) {
          lastRosterScrolledTo = s.residentId;
          b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
      // The fantasy options are per-resident, so the list is rebuilt whenever
      // the resident changes rather than filtered on every frame.
      if (bondFantasy.childElementCount === 0 || s.residentId !== lastFantasyFor) {
        lastFantasyFor = s.residentId;
        fantasyBtns.clear();
        bondFantasy.replaceChildren(
          ...fantasiesFor(s.residentId).map((f) => {
            const b = h(
              'button',
              {
                role: 'radio',
                'aria-checked': 'false',
                class: 'segment-btn',
                onClick: () => store.updateBond({ fantasyId: f.id }),
              },
              h('span', { class: 'segment-label' }, f.label),
              h('small', {}, f.promise)
            ) as HTMLButtonElement;
            fantasyBtns.set(f.id, b);
            return b;
          })
        );
      }
      for (const [id, b] of fantasyBtns) {
        b.setAttribute('aria-checked', String(s.bond.fantasyId === id));
      }
      leadSeg.btns.forEach((b, i) =>
        b.setAttribute(
          'aria-checked',
          String((['she-leads', 'contested', 'you-lead', 'equals'] as const)[i] === s.bond.lead)
        )
      );
      if (document.activeElement !== bondAddress) bondAddress.value = s.bond.address;
      for (const [id, box] of forbidChecks) box.checked = s.bond.forbidden.includes(id);
      bondCardBox.replaceChildren(
        ...bondCard(s.residentId, s.bond).map((line) => h('p', { class: 'hint' }, line))
      );
      (sessionSheet as HTMLElement).hidden = !s.sessionPanelOpen;
      (questHub as HTMLElement).hidden = !s.questHubOpen;
      mobileQuestLabel.textContent = s.activeQuestId ? COPY.stage.questActive : COPY.stage.quest;
      mobileQuestBtn.classList.toggle('is-active', s.activeQuestId !== null);
      mobileSettingsBtn.setAttribute('aria-expanded', String(s.sessionPanelOpen));

      const openQuest = s.activeQuestId ? store.questById2(s.activeQuestId) : undefined;
      const openNode = openQuest
        ? questNode(openQuest, s.activeQuestNodeId ?? openQuest.startNodeId)
        : undefined;
      (questStrip as HTMLElement).hidden = !openQuest;
      dock.classList.toggle('is-quest', !!openQuest);
      el.classList.toggle('is-quest-mode', !!openQuest);
      el.dataset.questPhase = openQuest ? s.questPhase : '';
      questCallBtn.hidden = s.questPhase !== 'threshold' || r.id !== 'rin';
      questCallBtn.disabled = !s.questInterruptible;
      questEpisodeLabel.textContent =
        s.questPhase === 'threshold'
          ? 'EPISODE 0 · MOTION ARCHIVE CORRIDOR'
          : s.questPhase === 'ending'
            ? 'CHECKPOINT · FRAME 12'
            : 'EPISODE 1 · THE TWELFTH FRAME';
      const questKey =
        openQuest && openNode ? `${openQuest.id}:${openNode.id}:${s.questPhase}` : '';
      if (openQuest && openNode && questKey !== lastQuestId) {
        lastQuestId = questKey;
        questLine.textContent =
          s.questPhase === 'threshold'
            ? 'Đi theo Rin. Anh có thể gọi tên em để ngắt một câu thoại thường.'
            : openNode.prompt;
        questOptions.replaceChildren(
          ...openNode.choices.map((choice) =>
            h(
              'button',
              { class: 'quest-option', onClick: () => actions.chooseQuest(choice.id) },
              h('span', {}, choice.label),
              h('small', {}, `${COST.turn} credit`)
            )
          )
        );
        const objective = openNode.presentation?.objective;
        questObjective.textContent = objective ? `Việc cần làm: ${objective}` : '';
        (questObjective as HTMLElement).hidden = !objective;
        (questFreeform as HTMLElement).hidden = !openNode.freeform;
        if (openNode.freeform) {
          questActionInput.placeholder = openNode.freeform.invite;
        } else {
          questActionInput.value = '';
        }
      }
      if (openQuest && openNode && s.questPhase === 'threshold') {
        questLine.textContent = 'Đi theo Rin. Anh có thể gọi tên em để ngắt một câu thoại thường.';
        (questObjective as HTMLElement).hidden = true;
        (questOptions as HTMLElement).hidden = true;
        (questFreeform as HTMLElement).hidden = true;
      } else if (openQuest && s.questPhase === 'ending') {
        questLine.textContent = 'Frame đã đổi trạng thái. Canon đang được lưu…';
        (questOptions as HTMLElement).hidden = true;
        (questFreeform as HTMLElement).hidden = true;
      } else {
        (questOptions as HTMLElement).hidden = false;
      }
      if (!openQuest) {
        lastQuestId = '';
        (questFreeform as HTMLElement).hidden = true;
      }

      // One balance, and the price of whatever the bar is about to do.
      const price = speakMode ? COST.speakForMe : COST.turn;
      turnsLeft.textContent =
        s.credits >= price ? `${s.credits} credit còn lại` : COPY.stage.outOfTurns;
      turnsLeft.classList.toggle('is-broke', s.credits < price);
      // Let a broke visitor attempt the action: Store will refuse it and the
      // shared credit sheet can explain the exact shortfall and open Wallet.
      const blocked = s.thinking || s.voicing;
      input.disabled = blocked;
      sendBtn.disabled = blocked;

      // Waiting belongs in the conversation, as a turn she has not started,
      // rather than as a status line under the buttons.
      const visibleChat = openQuest ? s.questChat : s.chat;
      const chatScope = openQuest ? `quest:${openQuest.id}` : `chat:${s.residentId}`;
      const lastTurn = visibleChat[visibleChat.length - 1];
      const waiting = s.thinking || (s.voicing && lastTurn?.from === 'user');
      const revealKey = s.reveal ? `${s.reveal.turn}:${s.reveal.words}` : '';
      const shotKeys = Object.keys(s.turnShots).join(',');
      if (
        visibleChat.length !== lastChatLen ||
        chatScope !== lastChatScope ||
        waiting !== lastWaiting ||
        revealKey !== lastRevealKey ||
        shotKeys !== lastShotKeys
      ) {
        lastShotKeys = shotKeys;
        lastChatLen = visibleChat.length;
        lastChatScope = chatScope;
        lastWaiting = waiting;
        lastRevealKey = revealKey;
        // Her actions and her words look different, because they are: one is
        // the room, the other is her voice. Only the second is ever spoken.
        log.replaceChildren(
          ...visibleChat.flatMap((t, i) => {
            if (t.from !== 'resident') return [h('p', { class: 'bubble bubble-user' }, t.text)];
            const partial = s.reveal?.turn === i;
            const parts = partial ? segmentsUpTo(t.text, s.reveal!.words) : segments(t.text);
            const shotKey = s.turnShots[i];
            const shotUrl = shotKey ? s.sceneShots[shotKey] : undefined;
            const shot: HTMLElement[] = shotUrl
              ? [h('img', { class: 'scene-shot', src: shotUrl, alt: '', loading: 'lazy' })]
              : [];
            return shot.concat(parts.map((seg, k) => {
              const tail = partial && k === parts.length - 1 ? ' is-typing' : '';
              return seg.kind === 'beat'
                ? h('p', { class: `beat-line${tail}` }, seg.text)
                : h('p', { class: `bubble bubble-resident${tail}` }, seg.text);
            }));
          }),
          ...(waiting
            ? [
                h(
                  'p',
                  { class: 'bubble bubble-resident is-waiting', 'aria-label': `${r.name.split(' ')[0]} đang trả lời` },
                  h('span', { class: 'dot-1' }),
                  h('span', { class: 'dot-2' }),
                  h('span', { class: 'dot-3' })
                ),
              ]
            : [])
        );
        log.scrollTop = log.scrollHeight;
      }

      (unlockGate as HTMLElement).hidden = !s.unlockGateOpen;
      (saveGate as HTMLElement).hidden = !s.saveGateOpen;
      if (s.saveGateOpen && !lastGateOpen) {
        const candidates = extractMemories(s.chat, s.session.nickname);
        memChecks.clear();
        memList.replaceChildren(
          ...(candidates.length
            ? candidates.map((c) => {
                const box = h('input', { type: 'checkbox' }) as HTMLInputElement;
                // Preselection is an interface-layer mechanic, so it is gated by the
                // variant's mechanics rather than by its copy. Two sources of truth
                // is how variant B once shipped a preselect it declared it had.
                box.checked = mech.preselected;
                memChecks.set(c.text, box);
                return h('label', { class: 'memory-item' }, box, h('span', {}, c.text));
              })
            : [h('p', { class: 'hint faint' }, COPY.stage.saveNothing)])
        );
        skipArmed = false;
        skipBtn.textContent = gate.saveSkip;
        startGateCountdown();
        const canPay = s.credits >= COST.saveChapter && candidates.length > 0;
        gateCost.textContent = canPay
          ? `${COPY.stage.saveCost} Anh còn ${s.credits} credit.`
          : s.credits > 0
            ? COPY.stage.saveNothing
            : COPY.stage.noCredits;
        saveBtn.disabled = !canPay;
      }
      if (!s.saveGateOpen && lastGateOpen) stopGateCountdown();
      lastGateOpen = s.saveGateOpen;

      const level = Math.min(5, s.revealed);
      levelPips.replaceChildren(
        ...Array.from({ length: 5 }, (_, i) =>
          h('span', { class: `pip${i < level ? ' is-on' : ''}` })
        )
      );
      levelWhere.textContent = r.levels[level];
      levelNext.textContent = level >= 5 ? COPY.stage.levelMax : COPY.stage.levelNext;

      const completed = saved?.completedQuests ?? [];
      const quests = store.questsFor(r.id);
      const nextQuest = quests.find((quest) => !completed.includes(quest.id));
      storyQuestList.replaceChildren(
        ...quests.map((quest) => {
          const done = completed.includes(quest.id);
          const available = nextQuest?.id === quest.id;
          const active = s.activeQuestId === quest.id;
          const resumable = !!s.questCheckpoints[quest.id];
          const status = done
            ? COPY.stage.questDone
            : active
              ? COPY.stage.questActive
              : available
                ? resumable
                  ? 'Tiếp tục checkpoint'
                  : COPY.stage.questStart
                : COPY.stage.questLocked;
          // Count the endings the quest can actually land on, not the shape of
          // the graph. The old version counted terminal entries in
          // `node.choices`, which silently excluded freeform families — so the
          // two endings a player can author for themselves were exactly the ones
          // it did not count, and Rin's card advertised three of five.
          const endings = new Set(
            quest.nodes.flatMap((node) => [
              ...node.choices.filter((choice) => !choice.nextNodeId).map((choice) => choice.endingId),
              ...[...(node.freeform?.families ?? []), ...(node.freeform ? [node.freeform.fallback] : [])]
                .filter((family) => !family.nextNodeId)
                .map((family) => family.endingId),
            ])
          );
          endings.delete(undefined);
          return h(
            'article',
            { class: `quest-card${done ? ' is-done' : ''}${active ? ' is-active' : ''}` },
            h('span', { class: 'quest-kind' }, 'Cốt truyện chính'),
            h('h3', { class: 'quest-title' }, quest.title),
            h('p', { class: 'hint' }, quest.synopsis),
            h('p', { class: 'hint faint' }, `${quest.nodes.length} cảnh · ${endings.size} kết cục`),
            h(
              'p',
              { class: 'hint faint' },
              `${COPY.stage.questReward}: ${quest.canonRef.length} chương canon · +25 credit`
            ),
            h(
              'button',
              {
                class: 'btn btn-secondary xs',
                'data-testid': 'quest-start',
                'data-quest-id': quest.id,
                disabled: done || !available || active,
                onClick: () => actions.startQuest(quest.id),
              },
              status
            )
          );
        })
      );
      if (canonRoute === 'sao' && r.id !== 'rin' && quests.length === 0) {
        storyQuestList.replaceChildren(
          h(
            'article',
            { class: 'quest-card quest-unavailable' },
            h('span', { class: 'quest-kind' }, 'Cốt truyện đang viết'),
            h('h3', { class: 'quest-title' }, `Quest của ${r.name.split(' ')[0]} chưa mở`),
            h(
              'p',
              { class: 'hint' },
              'Tuyến canon này chưa có Episode 0 đã duyệt. Open Chat vẫn dùng đúng ký ức và giọng của em; hệ thống sẽ không lùi về quest canon cũ.'
            ),
            h(
              'button',
              {
                class: 'btn btn-secondary xs',
                onClick: () => store.set({ questHubOpen: false }),
              },
              'Quay lại Open Chat'
            )
          )
        );
      }
      onboardingQuestList.replaceChildren(
        ...ONBOARDING_QUESTS.map((quest) => {
          const done = s.onboardingCompleted.includes(quest.id);
          return h(
            'article',
            { class: `quest-card onboarding-quest${done ? ' is-done' : ''}` },
            h('div', { class: 'onboarding-quest-copy' },
              h('h3', { class: 'quest-title' }, quest.title),
              h('p', { class: 'hint faint' }, quest.description)
            ),
            h('strong', { class: done ? 'quest-earned' : 'quest-reward' }, done ? 'Đã nhận' : `+${quest.rewardCredits}`)
          );
        })
      );

      const voiceLeft = COPY.stage.voiceMessageFree
        .replace('{cost}', String(COST.speakForMe))
        .replace('{count}', String(s.credits));
      // The dock states what the bar will do and what it costs, live.
      voiceLeftText = `${voiceLeft}.`;
      applyDockMode();

      el.classList.toggle('is-speaking', s.speaking);
    },
  };
}

// ---------- ARRIVAL ----------

export function arrivalStep(actions: UIActions): StepView {
  const cta = h(
    'button',
    { class: 'btn btn-primary', onClick: () => actions.enterUniverse() },
    COPY.arrival.cta
  );
  const el = h(
    'section',
    { class: 'step step-arrival', 'aria-label': 'Vào vũ trụ' },
    h(
      'div',
      { class: 'arrival-copy' },
      h('h1', { class: 'headline' }, COPY.arrival.headline),
      h('p', { class: 'subline' }, COPY.arrival.subline),
      cta
    )
  );
  return {
    el,
    update(s) {
      cta.disabled = s.transitioning;
    },
  };
}

// ---------- STUDIO ----------

export function studioStep(actions: UIActions, state: AppState): StepView {
  // --- bottom-left: character card ---
  const card = h('div', { class: 'panel studio-card', 'aria-live': 'polite' });

  // --- giant index numeral (right, behind panels) ---
  const indexNum = h('div', { class: 'studio-num', 'aria-hidden': 'true' }, '01');

  // --- bottom-center: slider ---
  const thumbs: HTMLButtonElement[] = [];
  const sliderTrack = h('div', {
    role: 'radiogroup',
    'aria-label': 'Nhân vật',
    class: 'slider-track',
  });
  CHARACTERS.forEach((c) => {
    const faction = factionById(c.factionId);
    // Prebaked portrait (scripts/gen-thumbs.mjs); if missing, fall back to a
    // monogram and upgrade from the live model once it streams in.
    const img = h('img', {
      alt: '',
      src: `assets/thumbs/${c.id}.webp`,
      draggable: 'false',
    }) as HTMLImageElement;
    img.addEventListener(
      'error',
      () => {
        img.src = monogramThumb(c.name[0], faction.accentColor);
        void characterThumb(c.modelUrl, c.name[0], faction.accentColor).then((src) => {
          img.src = src;
        });
      },
      { once: true }
    );
    const b = h(
      'button',
      {
        role: 'radio',
        'aria-checked': 'false',
        'aria-label': `${c.name}, ${c.title}`,
        class: 'slider-thumb',
        style: `--accent:${cssColor(faction.accentColor)}`,
        onClick: () => actions.selectCharacter(c.id),
      },
      img,
      h('span', { class: 'thumb-name' }, c.name)
    ) as HTMLButtonElement;
    thumbs.push(b);
    sliderTrack.append(b);
  });
  sliderTrack.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') actions.stepCharacter(1);
    if (e.key === 'ArrowLeft') actions.stepCharacter(-1);
  });
  const slider = h(
    'div',
    { class: 'studio-slider' },
    h('button', { class: 'chrome-btn slider-arrow', 'aria-label': 'Nhân vật trước', onClick: () => actions.stepCharacter(-1) }, '‹'),
    sliderTrack,
    h('button', { class: 'chrome-btn slider-arrow', 'aria-label': 'Nhân vật tiếp theo', onClick: () => actions.stepCharacter(1) }, '›')
  );

  // --- right: generation panel ---
  const textArea = h('textarea', {
    class: 'describe-input',
    rows: '3',
    placeholder: COPY.studio.textPlaceholder,
    'aria-label': 'Mô tả bản thân',
  }) as HTMLTextAreaElement;
  textArea.value = state.gen.text;
  textArea.addEventListener('input', () => actions.setGenText(textArea.value));

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'visually-hidden',
    id: 'photo-input',
  }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) actions.setGenPhoto(f);
    fileInput.value = '';
  });
  const photoPreview = h('div', { class: 'photo-preview' });

  const textPane = h('div', { class: 'gen-pane' }, textArea);
  const photoPane = h(
    'div',
    { class: 'gen-pane', hidden: true },
    h('label', { class: 'btn btn-secondary', for: 'photo-input' }, COPY.studio.choosePhoto),
    fileInput,
    photoPreview,
    h('p', { class: 'hint faint' }, COPY.studio.photoHint)
  );

  const tabText = h('button', { class: 'tab is-active', role: 'tab', 'aria-selected': 'true' }, COPY.studio.textTab) as HTMLButtonElement;
  const tabPhoto = h('button', { class: 'tab', role: 'tab', 'aria-selected': 'false' }, COPY.studio.photoTab) as HTMLButtonElement;
  const setTab = (photo: boolean) => {
    tabText.classList.toggle('is-active', !photo);
    tabPhoto.classList.toggle('is-active', photo);
    tabText.setAttribute('aria-selected', String(!photo));
    tabPhoto.setAttribute('aria-selected', String(photo));
    (textPane as HTMLElement).hidden = photo;
    (photoPane as HTMLElement).hidden = !photo;
  };
  tabText.addEventListener('click', () => setTab(false));
  tabPhoto.addEventListener('click', () => setTab(true));

  const genStatus = h('p', { class: 'gen-status', role: 'status' });
  const genBtn = h(
    'button',
    { class: 'btn btn-primary gen-btn', onClick: () => actions.generate() },
    COPY.studio.generate
  ) as HTMLButtonElement;

  const panel = h(
    'aside',
    { class: 'panel studio-panel' },
    h('h2', { class: 'panel-title' }, COPY.studio.panelTitle),
    h('p', { class: 'hint' }, COPY.studio.panelLead),
    h('div', { class: 'tabs', role: 'tablist' }, tabText, tabPhoto),
    textPane,
    photoPane,
    genStatus,
    genBtn,
    h('p', { class: 'hint faint base-note' }, COPY.studio.baseNote)
  );

  const el = h(
    'section',
    { class: 'step step-studio', 'aria-label': 'Mate Studio' },
    indexNum,
    card,
    slider,
    panel
  );

  let processingTimer = 0;
  let processingStage = 0;

  return {
    el,
    update(s, prev) {
      const c = characterById(s.characterId);
      const f = factionById(c.factionId);
      const idx = characterIndex(s.characterId);

      indexNum.textContent = String(idx + 1).padStart(2, '0');
      el.style.setProperty('--accent', cssColor(f.accentColor));

      thumbs.forEach((b, i) => {
        const active = CHARACTERS[i].id === s.characterId;
        b.setAttribute('aria-checked', String(active));
        b.classList.toggle('is-active', active);
      });

      card.replaceChildren(
        h('span', { class: 'chip chip-accent' }, f.name),
        h('h2', { class: 'card-name' }, c.name),
        h('p', { class: 'card-title' }, c.title),
        h('p', { class: 'card-bio' }, c.bio),
        h('p', { class: 'card-belief' }, `“${f.belief}”`)
      );

      // Generation phases
      if (s.genPhase === 'processing' && prev.genPhase !== 'processing') {
        genBtn.disabled = true;
        processingStage = 0;
        genStatus.classList.add('is-processing');
        const tick = () => {
          genStatus.textContent = COPY.studio.processing[processingStage % COPY.studio.processing.length];
          processingStage++;
          processingTimer = window.setTimeout(tick, 800);
        };
        tick();
      } else if (s.genPhase !== 'processing' && prev.genPhase === 'processing') {
        window.clearTimeout(processingTimer);
        genStatus.classList.remove('is-processing');
        genStatus.textContent = '';
        genBtn.disabled = false;
      }
      if (s.genPhase === 'idle') genBtn.disabled = s.transitioning;

      // Photo preview
      if (s.gen.photoUrl) {
        if (!photoPreview.querySelector('img')) {
          photoPreview.replaceChildren(h('img', { alt: '', src: s.gen.photoUrl }));
        }
      } else {
        photoPreview.replaceChildren();
      }
    },
    destroy() {
      window.clearTimeout(processingTimer);
    },
  };
}

// ---------- REVEAL ----------

export function revealStep(actions: UIActions, state: AppState): StepView {
  const character = characterById(state.characterId);
  const faction = factionById(character.factionId);

  const nameInput = h('input', {
    type: 'text',
    class: 'name-input',
    placeholder: COPY.reveal.namePlaceholder,
    maxlength: '24',
    'aria-label': 'Tên Mate',
    value: state.mateName,
  }) as HTMLInputElement;
  nameInput.addEventListener('input', () => actions.setMateName(nameInput.value));

  const chips = h('div', { class: 'trait-list' });

  const el = h(
    'section',
    { class: 'step step-reveal', 'aria-label': 'Mate của anh' },
    h(
      'div',
      { class: 'panel side-cluster reveal-panel', style: `--accent:${cssColor(faction.accentColor)}` },
      h('p', { class: 'kicker' }, COPY.reveal.kicker),
      h('h2', { class: 'faction-name' }, `${character.name}`),
      h('p', { class: 'card-title' }, `${faction.name} · ${character.title}`),
      chips,
      nameInput,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn-ghost', onClick: () => actions.backToStudio() }, COPY.reveal.back),
        h('button', { class: 'btn btn-primary', onClick: () => actions.join() }, COPY.reveal.join)
      )
    )
  );

  return {
    el,
    update(s) {
      const parts: string[] = [];
      if (s.variantLabel) parts.push(`Phối màu ${s.variantLabel}`);
      if (s.gen.mode === 'photo' && s.gen.photoName) parts.push('Tạo từ ảnh của anh');
      else if (s.gen.text.trim()) parts.push('Tạo từ mô tả của anh');
      chips.replaceChildren(...parts.map((t) => h('span', { class: 'trait' }, t)));
    },
  };
}

// ---------- JOINED ----------

export function joinedStep(actions: UIActions, state: AppState): StepView {
  const name = state.mateName.trim();
  const el = h(
    'section',
    { class: 'step step-joined', 'aria-label': 'Chào mừng' },
    h(
      'div',
      { class: 'panel bottom-cluster joined-panel' },
      h('h2', { class: 'headline sm' }, name ? `${name} đã gia nhập.` : COPY.joined.headline),
      h('p', { class: 'subline sm' }, COPY.joined.subline),
      h('button', { class: 'btn btn-ghost', onClick: () => actions.restart() }, COPY.joined.restart)
    )
  );
  return { el };
}
