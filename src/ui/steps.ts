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
import { STYLE_OPTIONS, VOICE_OPTIONS, WAIFUS, waifuById } from '../config/waifus';

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
          ? `${u.waifus?.length ?? 0} residents · talk`
          : `${u.factions?.length ?? 0} factions · create`
      )
    );
  });

  const el = h(
    'section',
    { class: 'step step-gallery', 'aria-label': 'Choose a universe' },
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

export function stageStep(actions: UIActions, state: AppState): StepView {
  // The giant resident name lives in the 3D scene (see Nameplate) so the side
  // panels never cover it; this heading keeps it in the accessibility tree.
  const bigName = h('h1', { class: 'visually-hidden' });

  const info = h('aside', { class: 'panel stage-info' });

  const roster = h('div', { role: 'radiogroup', 'aria-label': 'Residents', class: 'roster' });
  const rosterBtns: HTMLButtonElement[] = [];
  WAIFUS.forEach((w) => {
    const b = h(
      'button',
      {
        role: 'radio',
        'aria-checked': 'false',
        class: 'roster-chip',
        style: `--accent:${cssColor(w.accentColor)}`,
        onClick: () => actions.selectWaifu(w.id),
      },
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      w.name
    ) as HTMLButtonElement;
    rosterBtns.push(b);
    roster.append(b);
  });

  // --- chat ---
  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const input = h('input', {
    type: 'text',
    class: 'chat-input',
    placeholder: COPY.stage.inputPlaceholder,
    'aria-label': 'Message',
    maxlength: '200',
  }) as HTMLInputElement;
  const send = () => {
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    actions.sendMessage(v);
  };
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') send();
  });
  const chatBox = h(
    'div',
    { class: 'panel chat-box', hidden: true },
    log,
    h(
      'div',
      { class: 'chat-row' },
      input,
      h('button', { class: 'btn btn-primary', onClick: send }, COPY.stage.send)
    )
  );
  const talkBtn = h(
    'button',
    { class: 'btn btn-primary talk-btn', onClick: () => actions.startChat() },
    COPY.stage.talk
  ) as HTMLButtonElement;

  // --- personalize panel (2 tabs) ---
  const promptInput = h('textarea', {
    class: 'describe-input',
    rows: '4',
    'aria-label': COPY.stage.promptLabel,
  }) as HTMLTextAreaElement;
  promptInput.addEventListener('change', () => actions.updatePersona({ prompt: promptInput.value }));

  const greetInput = h('input', {
    type: 'text',
    class: 'name-input',
    'aria-label': COPY.stage.greetingLabel,
    maxlength: '120',
  }) as HTMLInputElement;
  greetInput.addEventListener('change', () => actions.updatePersona({ greeting: greetInput.value }));

  const styleSeg = h('div', { role: 'radiogroup', 'aria-label': COPY.stage.styleLabel, class: 'segment' });
  const styleBtns: HTMLButtonElement[] = [];
  STYLE_OPTIONS.forEach((o) => {
    const b = h(
      'button',
      { role: 'radio', 'aria-checked': 'false', class: 'segment-btn', onClick: () => actions.updatePersona({ style: o.id }) },
      h('span', { class: 'segment-label' }, o.label)
    ) as HTMLButtonElement;
    styleBtns.push(b);
    styleSeg.append(b);
  });

  const voiceSeg = h('div', { role: 'radiogroup', 'aria-label': COPY.stage.voiceLabel, class: 'segment' });
  const voiceBtns: HTMLButtonElement[] = [];
  VOICE_OPTIONS.forEach((o) => {
    const b = h(
      'button',
      { role: 'radio', 'aria-checked': 'false', class: 'segment-btn', onClick: () => actions.updatePersona({ voiceId: o.id }) },
      h('span', { class: 'segment-label' }, o.label)
    ) as HTMLButtonElement;
    voiceBtns.push(b);
    voiceSeg.append(b);
  });

  const personaPane = h(
    'div',
    { class: 'gen-pane' },
    h('h3', { class: 'group-label' }, COPY.stage.promptLabel),
    promptInput,
    h('h3', { class: 'group-label' }, COPY.stage.greetingLabel),
    greetInput,
    h('button', { class: 'btn btn-ghost sm', onClick: () => actions.replayGreeting() }, 'Play greeting'),
    h('h3', { class: 'group-label' }, COPY.stage.styleLabel),
    styleSeg,
    h('h3', { class: 'group-label' }, COPY.stage.voiceLabel),
    voiceSeg,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn btn-ghost sm', onClick: () => actions.resetPersona() }, COPY.stage.reset)
    ),
    h('p', { class: 'hint faint' }, COPY.stage.saved)
  );

  const lookInput = h('textarea', {
    class: 'describe-input',
    rows: '3',
    placeholder: COPY.stage.lookPlaceholder,
    'aria-label': 'Look prompt',
  }) as HTMLTextAreaElement;
  const lookPane = h(
    'div',
    { class: 'gen-pane', hidden: true },
    h('p', { class: 'hint' }, COPY.stage.lookNote),
    lookInput,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn btn-ghost sm', onClick: () => actions.restoreLook() }, COPY.stage.lookRestore),
      h(
        'button',
        { class: 'btn btn-secondary sm', onClick: () => actions.regenerateLook(lookInput.value) },
        COPY.stage.lookGenerate
      )
    )
  );

  const tabPersona = h('button', { class: 'tab is-active', role: 'tab', 'aria-selected': 'true' }, COPY.stage.tabPersona) as HTMLButtonElement;
  const tabLook = h('button', { class: 'tab', role: 'tab', 'aria-selected': 'false' }, COPY.stage.tabLook) as HTMLButtonElement;
  const setTab = (look: boolean) => {
    tabPersona.classList.toggle('is-active', !look);
    tabLook.classList.toggle('is-active', look);
    tabPersona.setAttribute('aria-selected', String(!look));
    tabLook.setAttribute('aria-selected', String(look));
    (personaPane as HTMLElement).hidden = look;
    (lookPane as HTMLElement).hidden = !look;
  };
  tabPersona.addEventListener('click', () => setTab(false));
  tabLook.addEventListener('click', () => setTab(true));

  const sidePanel = h(
    'aside',
    { class: 'panel personalize-panel' },
    h('h2', { class: 'panel-title' }, COPY.stage.personalize),
    h('div', { class: 'tabs', role: 'tablist' }, tabPersona, tabLook),
    personaPane,
    lookPane
  );

  const el = h(
    'section',
    { class: 'step step-stage', 'aria-label': 'Resident stage' },
    bigName,
    h(
      'header',
      { class: 'stage-top' },
      h('button', { class: 'btn btn-ghost sm', onClick: () => actions.leaveUniverse() }, `‹ ${COPY.stage.leave}`)
    ),
    sidePanel,
    info,
    h('div', { class: 'stage-bottom' }, roster, talkBtn, chatBox)
  );

  let lastWaifu = '';
  let lastChatLen = -1;

  return {
    el,
    update(s) {
      const w = waifuById(s.waifuId);
      const persona = s.personas[s.waifuId] ?? w.defaults;
      el.style.setProperty('--accent', cssColor(w.accentColor));

      if (s.waifuId !== lastWaifu) {
        lastWaifu = s.waifuId;
        bigName.textContent = w.name;
        promptInput.value = persona.prompt;
        greetInput.value = persona.greeting;
        info.replaceChildren(
          h('span', { class: 'chip chip-accent' }, 'Resident'),
          h('h2', { class: 'card-name' }, w.name),
          h('p', { class: 'card-title' }, w.title),
          h('p', { class: 'card-bio' }, w.bio)
        );
      } else {
        // Keep fields in sync when reset is pressed, without stealing focus.
        if (document.activeElement !== promptInput) promptInput.value = persona.prompt;
        if (document.activeElement !== greetInput) greetInput.value = persona.greeting;
      }

      rosterBtns.forEach((b, i) => {
        const active = WAIFUS[i].id === s.waifuId;
        b.setAttribute('aria-checked', String(active));
        b.classList.toggle('is-active', active);
      });
      styleBtns.forEach((b, i) =>
        b.setAttribute('aria-checked', String(STYLE_OPTIONS[i].id === persona.style))
      );
      voiceBtns.forEach((b, i) =>
        b.setAttribute('aria-checked', String(VOICE_OPTIONS[i].id === persona.voiceId))
      );

      talkBtn.hidden = s.chatOpen;
      (chatBox as HTMLElement).hidden = !s.chatOpen;
      if (s.chat.length !== lastChatLen) {
        lastChatLen = s.chat.length;
        log.replaceChildren(
          ...s.chat.map((t) =>
            h('p', { class: `bubble bubble-${t.from}` }, t.text)
          )
        );
        log.scrollTop = log.scrollHeight;
      }
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
    { class: 'step step-arrival', 'aria-label': 'Enter the universe' },
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
    'aria-label': 'Characters',
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
    h('button', { class: 'chrome-btn slider-arrow', 'aria-label': 'Previous character', onClick: () => actions.stepCharacter(-1) }, '‹'),
    sliderTrack,
    h('button', { class: 'chrome-btn slider-arrow', 'aria-label': 'Next character', onClick: () => actions.stepCharacter(1) }, '›')
  );

  // --- right: generation panel ---
  const textArea = h('textarea', {
    class: 'describe-input',
    rows: '3',
    placeholder: COPY.studio.textPlaceholder,
    'aria-label': 'Describe yourself',
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
    'aria-label': 'Mate name',
    value: state.mateName,
  }) as HTMLInputElement;
  nameInput.addEventListener('input', () => actions.setMateName(nameInput.value));

  const chips = h('div', { class: 'trait-list' });

  const el = h(
    'section',
    { class: 'step step-reveal', 'aria-label': 'Your Mate' },
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
      if (s.variantLabel) parts.push(`${s.variantLabel} colorway`);
      if (s.gen.mode === 'photo' && s.gen.photoName) parts.push('From your photo');
      else if (s.gen.text.trim()) parts.push('From your description');
      chips.replaceChildren(...parts.map((t) => h('span', { class: 'trait' }, t)));
    },
  };
}

// ---------- JOINED ----------

export function joinedStep(actions: UIActions, state: AppState): StepView {
  const name = state.mateName.trim();
  const el = h(
    'section',
    { class: 'step step-joined', 'aria-label': 'Welcome' },
    h(
      'div',
      { class: 'panel bottom-cluster joined-panel' },
      h('h2', { class: 'headline sm' }, name ? `${name} has joined.` : COPY.joined.headline),
      h('p', { class: 'subline sm' }, COPY.joined.subline),
      h('button', { class: 'btn btn-ghost', onClick: () => actions.restart() }, COPY.joined.restart)
    )
  );
  return { el };
}
