// Step views. The studio is the centerpiece: character info card bottom-left,
// character slider bottom-center, generation panel right. The oversized
// character name lives in the 3D scene (nameplate), not in the DOM.

import { h } from './dom';
import type { UIActions } from './actions';
import type { AppState } from '../state/store';
import { COPY } from '../config/copy';
import { factionById } from '../config/factions';
import { CHARACTERS, characterById, characterIndex } from '../config/characters';
import { characterThumb, monogramThumb } from '../three/thumbs';
import { UNIVERSES } from '../config/universes';
import {
  LENGTHS,
  MOODS,
  RESIDENTS,
  SCENARIOS,
  STYLES,
  residentById,
} from '../config/residents';
import { questById, questsForResident } from '../config/quests';
import { segments, segmentsUpTo } from '../chat/dialogue';
import { FREE_TURNS, FREE_VOICE_MESSAGES } from '../state/store';
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
  // On a phone her card cannot stay open and leave room for her. Collapsed it
  // is a header; tapping anywhere outside a disclosure opens the rest.
  info.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('details')) return;
    info.classList.toggle('is-open');
  });

  // --- roster ---
  const roster = h('div', { role: 'radiogroup', 'aria-label': 'Các nhân vật', class: 'roster' });
  const rosterBtns: HTMLButtonElement[] = [];
  RESIDENTS.forEach((r) => {
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
      r.name
    ) as HTMLButtonElement;
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
    input.value = '';
    if (speakMode) {
      actions.speakCustomText(v);
      speakMode = false;
      applyDockMode();
    } else {
      actions.sendMessage(v);
    }
  };
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') send();
  });
  const sendBtn = h('button', { class: 'btn btn-primary', onClick: send }, COPY.stage.send) as HTMLButtonElement;
  const turnsLeft = h('span', { class: 'turns-left' });
  const dockHint = h('p', { class: 'dock-hint', hidden: true });
  const voiceBudget = h('p', { class: 'hint voice-budget' });

  const questChip = h('button', { class: 'dock-chip' }, COPY.stage.quest) as HTMLButtonElement;
  const speakChip = h('button', { class: 'dock-chip' }, COPY.stage.speakAs) as HTMLButtonElement;
  const setChip = h(
    'button',
    { class: 'dock-chip', onClick: () => actions.openSessionPanel() },
    COPY.stage.setSessionShort
  ) as HTMLButtonElement;

  // A tag inside the field, plus quote marks around it: the bar has to look
  // like a line she will say out loud, not a message you are sending her.
  const modeTag = h('span', { class: 'field-tag', hidden: true }, COPY.stage.speakAs) as HTMLElement;
  // While a scene is open the dock carries it: what she asked, and three
  // answers a visitor could honestly give. Typing is always still open.
  const questLine = h('p', { class: 'quest-line' });
  const questOptions = h('div', { class: 'quest-options' });
  const questStrip = h('div', { class: 'quest-strip', hidden: true }, questLine, questOptions);

  const dock = h(
    'div',
    { class: 'stage-dock' },
    questStrip,
    h('div', { class: 'dock-top' }, h('div', { class: 'dock-chips' }, questChip, speakChip, setChip), turnsLeft),
    dockHint,
    h('div', { class: 'dock-bar' }, modeTag, h('div', { class: 'field-wrap' }, input), sendBtn)
  );
  // Left is her dossier, right is her voice, bottom is what you do. The card
  // can step off the frame entirely when the visitor wants the stage clear.
  const cardToggle = h(
    'button',
    { class: 'btn btn-ghost sm', 'aria-pressed': 'true', onClick: () => {
      const hidden = info.classList.toggle('is-hidden');
      cardToggle.setAttribute('aria-pressed', String(!hidden));
    } },
    COPY.stage.cardToggle
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

  const scen = segment(COPY.stage.scenario, SCENARIOS, (id) => actions.updateSession({ scenario: id }));
  const mood = segment(COPY.stage.mood, MOODS, (id) => actions.updateSession({ mood: id }));
  const style = segment(COPY.stage.style, STYLES, (id) => actions.updateSession({ style: id }));
  const len = segment(COPY.stage.length, LENGTHS, (id) => actions.updateSession({ length: id }));
  const voiceSeg = h('div', { role: 'radiogroup', 'aria-label': COPY.stage.voice, class: 'segment' });
  const voiceBtns: HTMLButtonElement[] = [];

  const sessionCard = h(
    'aside',
    { class: 'panel session-sheet' },
    h(
      'div',
      { class: 'row sheet-head' },
      h('h2', { class: 'panel-title' }, COPY.stage.setSession),
      h('button', { class: 'chrome-btn', 'aria-label': 'Đóng thiết lập', onClick: () => actions.closeSessionPanel() }, '×')
    ),
    h(
      'div',
      { class: 'sheet-body' },
      h('p', { class: 'hint faint' }, COPY.stage.sessionNote),
      h('div', { class: 'custom-group' }, h('h3', { class: 'group-label' }, COPY.stage.nickname), nickInput),
      h(
        'div',
        { class: 'custom-group' },
        h('h3', { class: 'group-label' }, COPY.stage.persona),
        personaInput,
        h('p', { class: 'hint faint' }, COPY.stage.personaNote)
      ),
      scen.el,
      mood.el,
      style.el,
      len.el,
      h('div', { class: 'custom-group' }, h('h3', { class: 'group-label' }, COPY.stage.voice), voiceSeg),
      h(
        'div',
        { class: 'voice-upcoming' },
        h('h3', { class: 'group-label' }, COPY.stage.voiceMessagePricing),
        voiceBudget,
        h('p', { class: 'hint faint' }, COPY.stage.voiceMessagePricingNote),
        h('button', { class: 'btn btn-secondary xs', disabled: true }, COPY.stage.voiceMessageTopUp),
        h('h3', { class: 'group-label' }, COPY.stage.personalVoiceTitle),
        h('p', { class: 'hint faint' }, COPY.stage.personalVoiceLead),
        h('p', { class: 'hint faint' }, COPY.stage.personalVoiceNote)
      )
    ),
    h(
      'div',
      { class: 'sheet-foot' },
      h('button', { class: 'btn btn-ghost xs', onClick: () => actions.resetSession() }, COPY.stage.resetSession),
      h('button', { class: 'btn btn-primary', onClick: () => actions.closeSessionPanel() }, COPY.stage.applySession)
    )
  );
  const sessionSheet = h(
    'div',
    {
      class: 'modal-scrim',
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
  const memList = h('div', { class: 'memory-list' });
  const gateCost = h('p', { class: 'hint' });
  const saveBtn = h('button', { class: 'btn btn-primary' }, COPY.stage.saveCta) as HTMLButtonElement;
  const memChecks = new Map<string, HTMLInputElement>();
  saveBtn.addEventListener('click', () => {
    const keep = [...memChecks.entries()].filter(([, c]) => c.checked).map(([id]) => id);
    actions.saveChapter(keep);
  });
  const saveGate = h(
    'div',
    { class: 'save-gate', hidden: true, role: 'dialog', 'aria-label': COPY.stage.saveTitle },
    h(
      'div',
      { class: 'panel gate-card' },
      h('h2', { class: 'panel-title' }, COPY.stage.saveTitle),
      h('p', { class: 'hint' }, COPY.stage.saveBody),
      h('p', { class: 'group-label' }, COPY.stage.saveList),
      memList,
      gateCost,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn-ghost', onClick: () => actions.continueWithoutSaving() }, COPY.stage.saveSkip),
        saveBtn
      )
    )
  );

  // --- quests, folded into her card ---
  //
  // A quest is a reason to keep talking to *her*, so it belongs with her
  // story rather than in a panel of its own.
  const questList = h('div', { class: 'quest-list' });
  const questBlock = h(
    'details',
    { class: 'episode-block profile-more quest-block' },
    h('summary', {}, COPY.stage.questTitle),
    h('p', { class: 'hint faint' }, COPY.stage.questLead),
    questList
  ) as HTMLDetailsElement;
  questChip.addEventListener('click', () => {
    // On a phone her card is collapsed by default, so the chip has to open it
    // before there is anything to scroll to.
    info.classList.add('is-open');
    questBlock.open = !questBlock.open;
    if (questBlock.open) questBlock.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

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
    dock.classList.toggle('is-speak', speakMode);
    input.placeholder = speakMode ? COPY.stage.voiceMessagePlaceholder : COPY.stage.inputPlaceholder;
    sendBtn.textContent = speakMode ? COPY.stage.voiceMessageSend : COPY.stage.send;
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
      h('button', { class: 'btn btn-ghost sm', onClick: () => actions.leaveUniverse() }, `‹ ${COPY.stage.leave}`),
      cardToggle
    ),
    info,
    sessionSheet,
    roster,
    rail,
    dock,
    saveGate,
    unlockGate
  );

  let lastResident = '';
  let lastQuestId = '';
  let lastChatLen = -1;
  let lastWaiting = false;
  let lastRevealKey = '';
  let lastGateOpen = false;

  return {
    el,
    update(s) {
      const r = residentById(s.residentId);
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
          h('details', { class: 'episode-block profile-more' },
            h('summary', {}, 'Câu chuyện của em'),
            h('div', { class: 'episode-list' })
          ),
          questBlock
        );
        // Voice options are hers, not a shared library.
        voiceBtns.length = 0;
        voiceSeg.replaceChildren(
          ...r.voices.map((v) => {
            const b = h(
              'button',
              {
                role: 'radio',
                'aria-checked': 'false',
                class: 'segment-btn',
                onClick: () => actions.updateSession({ voice: v.slot }),
              },
              h('span', { class: 'segment-label' }, v.label)
            ) as HTMLButtonElement;
            voiceBtns.push(b);
            return b;
          })
        );
      }
      if (document.activeElement !== nickInput) nickInput.value = s.session.nickname;
      if (document.activeElement !== personaInput) personaInput.value = s.session.persona;

      // Unlocked episodes read as her story opening up, locked ones as the
      // reason to keep going.
      const epList = info.querySelector('.episode-list');
      if (epList) {
        epList.replaceChildren(
          ...r.episodes.map((ep, i) => {
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
      });
      scen.btns.forEach((b, i) => b.setAttribute('aria-checked', String(SCENARIOS[i].id === s.session.scenario)));
      mood.btns.forEach((b, i) => b.setAttribute('aria-checked', String(MOODS[i].id === s.session.mood)));
      style.btns.forEach((b, i) => b.setAttribute('aria-checked', String(STYLES[i].id === s.session.style)));
      len.btns.forEach((b, i) => b.setAttribute('aria-checked', String(LENGTHS[i].id === s.session.length)));
      voiceBtns.forEach((b, i) =>
        b.setAttribute('aria-checked', String(r.voices[i].slot === s.session.voice))
      );

      (sessionSheet as HTMLElement).hidden = !s.sessionPanelOpen;
      questChip.textContent = s.activeQuestId ? COPY.stage.questActive : COPY.stage.quest;
      questChip.classList.toggle('is-active', s.activeQuestId !== null);

      const openQuest = s.activeQuestId ? questById(s.activeQuestId) : undefined;
      (questStrip as HTMLElement).hidden = !openQuest;
      dock.classList.toggle('is-quest', !!openQuest);
      if (openQuest && openQuest.id !== lastQuestId) {
        lastQuestId = openQuest.id;
        questLine.textContent = openQuest.objective;
        questOptions.replaceChildren(
          ...openQuest.options.map((option) =>
            h('button', { class: 'quest-option', onClick: () => actions.sendMessage(option) }, option)
          )
        );
      }
      if (!openQuest) lastQuestId = '';

      const left = Math.max(0, FREE_TURNS - s.turns);
      turnsLeft.textContent = left > 0 ? `Còn ${left} lượt miễn phí` : COPY.stage.outOfTurns;
      // Free turns gate the conversation; the voice budget gates speak-for-me.
      const voiceSpent = s.voiceFreeUses >= FREE_VOICE_MESSAGES && s.voiceCredits <= 0;
      const blocked = s.thinking || s.voicing || (speakMode ? voiceSpent : left === 0);
      input.disabled = blocked;
      sendBtn.disabled = blocked;

      // Waiting belongs in the conversation, as a turn she has not started,
      // rather than as a status line under the buttons.
      const lastTurn = s.chat[s.chat.length - 1];
      const waiting = s.thinking || (s.voicing && lastTurn?.from === 'user');
      const revealKey = s.reveal ? `${s.reveal.turn}:${s.reveal.words}` : '';
      if (s.chat.length !== lastChatLen || waiting !== lastWaiting || revealKey !== lastRevealKey) {
        lastChatLen = s.chat.length;
        lastWaiting = waiting;
        lastRevealKey = revealKey;
        // Her actions and her words look different, because they are: one is
        // the room, the other is her voice. Only the second is ever spoken.
        log.replaceChildren(
          ...s.chat.map((t, i) => {
            if (t.from !== 'resident') return h('p', { class: 'bubble bubble-user' }, t.text);
            const partial = s.reveal?.turn === i;
            const parts = partial ? segmentsUpTo(t.text, s.reveal!.words) : segments(t.text);
            return h(
              'p',
              { class: `bubble bubble-resident${partial ? ' is-typing' : ''}` },
              ...parts.map((seg) =>
                seg.kind === 'beat'
                  ? h('span', { class: 'beat' }, seg.text)
                  : h('span', { class: 'said' }, seg.text)
              )
            );
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
                const box = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
                box.checked = true;
                memChecks.set(c.text, box);
                return h('label', { class: 'memory-item' }, box, h('span', {}, c.text));
              })
            : [h('p', { class: 'hint faint' }, COPY.stage.saveNothing)])
        );
        const canPay = s.credits > 0 && candidates.length > 0;
        gateCost.textContent = canPay
          ? `${COPY.stage.saveCost} Anh có ${s.credits} lượt.`
          : s.credits > 0
            ? COPY.stage.saveNothing
            : COPY.stage.noCredits;
        saveBtn.disabled = !canPay;
      }
      lastGateOpen = s.saveGateOpen;

      const completed = saved?.completedQuests ?? [];
      const quests = questsForResident(r.id);
      const nextQuest = quests.find((quest) => !completed.includes(quest.id));
      questList.replaceChildren(
        ...quests.map((quest) => {
          const done = completed.includes(quest.id);
          const available = nextQuest?.id === quest.id;
          const active = s.activeQuestId === quest.id;
          const status = done
            ? COPY.stage.questDone
            : active
              ? COPY.stage.questActive
              : available
                ? COPY.stage.questStart
                : COPY.stage.questLocked;
          const reward = r.episodes[quest.rewardEpisode]?.title ?? COPY.stage.questReward;
          return h(
            'article',
            { class: `quest-card${done ? ' is-done' : ''}${active ? ' is-active' : ''}` },
            h('h3', { class: 'quest-title' }, quest.title),
            h('p', { class: 'hint' }, quest.prompt),
            h('p', { class: 'hint faint' }, `${COPY.stage.questReward}: ${reward}`),
            h(
              'button',
              { class: 'btn btn-secondary xs', disabled: done || !available || active, onClick: () => actions.startQuest(quest.id) },
              status
            )
          );
        })
      );

      const voiceLeft = s.voiceFreeUses < FREE_VOICE_MESSAGES
        ? COPY.stage.voiceMessageFree.replace('{count}', String(FREE_VOICE_MESSAGES - s.voiceFreeUses))
        : COPY.stage.voiceMessageCredits.replace('{count}', String(s.voiceCredits));
      voiceBudget.textContent = voiceLeft;
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
