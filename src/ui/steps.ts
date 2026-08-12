// Step views. The studio is the centerpiece: character info card bottom-left,
// character slider bottom-center, generation panel right. The oversized
// character name lives in the 3D scene (nameplate), not in the DOM.

import { h } from './dom';
import type { UIActions } from './actions';
import type { AppState, ChatTurn, PersonaTraits, SessionSetup } from '../state/store';
import { COPY } from '../config/copy';
import { factionById } from '../config/factions';
import { CHARACTERS, characterById, characterIndex } from '../config/characters';
import { characterThumb, monogramThumb } from '../three/thumbs';
import { visibleUniverses } from '../config/entry';
import {
  LENGTHS,
  RESIDENTS,
  SCENARIOS,
} from '../config/residents';
import { canonViewFor, endingFor } from '../config/canon-view';
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
import {
  dialogueBlocksFromSegments,
  OPEN_CHAT_VISUALS,
  openingVisualFor,
} from '../chat/open-chat-visuals';
import {
  COST,
  availableCredits,
  chatConversationScope,
  questConversationScope,
  store,
} from '../state/store';
import { extractMemories } from '../chat/memory';
import { endingPresentation, terminalEndingIds } from '../quest/endings';
import {
  KAGURA_FIGURINE_VARIANTS,
  kaguraFigurineVariantById,
} from '../config/figurine-products';

export interface StepView {
  el: HTMLElement;
  update?(s: AppState, prev: AppState): void;
  destroy?(): void;
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function segment<T extends string>(
  label: string,
  options: readonly { id: T; label: string }[],
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

interface TraitSliderView {
  el: HTMLElement;
  input: HTMLInputElement;
  output: HTMLOutputElement;
  sync(value: number): void;
}

function traitSlider(
  label: string,
  stops: readonly string[],
  value: number,
  onChange: (value: number) => void,
  max = stops.length - 1,
  activeIndex: (value: number) => number = (next) => Math.round(next)
): TraitSliderView {
  const output = h('output', { class: 'session-length-value' }) as HTMLOutputElement;
  const input = h('input', {
    type: 'range',
    class: 'session-length-slider',
    min: '0',
    max: String(max),
    step: '1',
    'aria-label': label,
  }) as HTMLInputElement;
  const sync = (next: number) => {
    const bounded = Math.min(max, Math.max(0, next));
    const index = Math.min(stops.length - 1, Math.max(0, activeIndex(bounded)));
    input.value = String(bounded);
    input.setAttribute('aria-valuetext', stops[index]);
    output.textContent = stops[index];
  };
  input.addEventListener('input', () => {
    const next = Number(input.value);
    sync(next);
    onChange(next);
  });
  sync(value);
  return {
    el: h(
      'div',
      { class: 'session-length-field persona-trait-field' },
      h(
        'div',
        { class: 'session-length-head' },
        h('span', { class: 'session-setting-label' }, label),
        output
      ),
      input,
      h(
        'div',
        { class: 'session-length-marks', 'aria-hidden': 'true' },
        ...stops.map((stop) => h('span', {}, stop))
      )
    ),
    input,
    output,
    sync,
  };
}

export interface PersonaBuilderView {
  el: HTMLElement;
  personaInput: HTMLTextAreaElement;
  sync(session: SessionSetup): void;
}

const PROBLEM_IDS: readonly PersonaTraits['problem'][] = ['listen', 'solve', 'challenge'];
const ENERGY_IDS: readonly PersonaTraits['energy'][] = ['calm', 'balanced', 'energetic'];
const PROACTIVE_IDS: readonly PersonaTraits['proactive'][] = ['called', 'sometimes', 'often'];

export function createPersonaBuilder(
  session: SessionSetup,
  updateSession: (patch: Partial<SessionSetup>) => void
): PersonaBuilderView {
  let current = session;
  const updateTraits = (patch: Partial<PersonaTraits>) => {
    const personaTraits = { ...current.personaTraits, ...patch };
    current = { ...current, personaTraits };
    updateSession({ personaTraits });
  };

  const tone = traitSlider(
    COPY.persona.tone.label,
    COPY.persona.tone.stops,
    session.personaTraits.tone,
    (value) => updateTraits({ tone: value }),
    100,
    (value) => (value < 34 ? 0 : value <= 66 ? 1 : 2)
  );
  tone.input.dataset.testid = 'persona-tone';
  tone.input.dataset.personaControl = 'tone';

  const problem = traitSlider(
    COPY.persona.problem.label,
    COPY.persona.problem.stops,
    PROBLEM_IDS.indexOf(session.personaTraits.problem),
    (value) => updateTraits({ problem: PROBLEM_IDS[value] ?? PROBLEM_IDS[1] })
  );
  problem.input.dataset.testid = 'persona-problem';
  problem.input.dataset.personaControl = 'problem';

  const energy = traitSlider(
    COPY.persona.energy.label,
    COPY.persona.energy.stops,
    ENERGY_IDS.indexOf(session.personaTraits.energy),
    (value) => updateTraits({ energy: ENERGY_IDS[value] ?? ENERGY_IDS[1] })
  );
  energy.input.dataset.testid = 'persona-energy';
  energy.input.dataset.personaControl = 'energy';

  const humor = segment(
    COPY.persona.humor.label,
    COPY.persona.humor.options as readonly { id: PersonaTraits['humor']; label: string }[],
    (id) => updateTraits({ humor: id })
  );
  humor.el.dataset.testid = 'persona-humor';
  humor.el.dataset.personaControl = 'humor';

  const proactive = traitSlider(
    COPY.persona.proactive.label,
    COPY.persona.proactive.stops,
    PROACTIVE_IDS.indexOf(session.personaTraits.proactive),
    (value) => updateTraits({ proactive: PROACTIVE_IDS[value] ?? PROACTIVE_IDS[1] })
  );
  proactive.input.dataset.testid = 'persona-proactive';
  proactive.input.dataset.personaControl = 'proactive';

  const length = traitSlider(
    COPY.stage.length,
    LENGTHS.map((option) => option.label),
    Math.max(0, LENGTHS.findIndex((option) => option.id === session.length)),
    (value) => {
      const next = LENGTHS[value] ?? LENGTHS[1];
      current = { ...current, length: next.id };
      updateSession({ length: next.id });
    }
  );
  length.input.dataset.testid = 'session-length';
  length.input.dataset.personaControl = 'length';
  length.output.dataset.testid = 'session-length-label';

  let relationshipCustom: HTMLInputElement;
  let relationshipCustomWrap: HTMLElement;
  const relationship = segment(
    COPY.persona.relationship.label,
    COPY.persona.relationship.options as readonly {
      id: PersonaTraits['relationship'];
      label: string;
    }[],
    (id) => {
      updateTraits({ relationship: id });
      relationshipCustomWrap.hidden = id !== 'custom';
      if (id === 'custom') requestAnimationFrame(() => relationshipCustom.focus());
    }
  );
  relationship.el.dataset.testid = 'persona-relationship';
  relationship.el.dataset.personaControl = 'relationship';
  relationshipCustom = h('input', {
    type: 'text',
    class: 'name-input persona-relationship-custom',
    placeholder: COPY.persona.relationship.customPlaceholder,
    'aria-label': COPY.persona.relationship.customLabel,
    maxlength: '80',
  }) as HTMLInputElement;
  relationshipCustom.addEventListener('input', () =>
    updateTraits({ relationshipCustom: relationshipCustom.value })
  );
  relationshipCustomWrap = h(
    'div',
    { class: 'session-inline-custom persona-relationship-custom-wrap', hidden: true },
    relationshipCustom
  );

  const previewText = h('output', {
    class: 'persona-preview-text',
    'data-testid': 'persona-preview',
    'aria-live': 'polite',
  }) as HTMLOutputElement;
  const overrideNote = h(
    'span',
    { class: 'persona-override-note', hidden: true },
    COPY.persona.overrideNote
  );
  const preview = h(
    'div',
    { class: 'persona-preview' },
    h('span', { class: 'session-setting-label' }, COPY.persona.previewLabel),
    previewText,
    overrideNote
  );

  const personaInput = h('textarea', {
    class: 'persona-input',
    rows: '5',
    placeholder: COPY.persona.advancedPlaceholder,
    'aria-label': COPY.persona.advancedLabel,
    'data-testid': 'session-persona',
    maxlength: '600',
  }) as HTMLTextAreaElement;
  personaInput.addEventListener('input', () => {
    current = { ...current, persona: personaInput.value, personaOverride: true };
    updateSession({ persona: personaInput.value, personaOverride: true });
  });
  const restore = h(
    'button',
    {
      class: 'btn btn-ghost xs persona-restore',
      'data-testid': 'persona-restore',
      onClick: () => {
        current = { ...current, personaOverride: false };
        updateSession({ personaOverride: false });
      },
    },
    COPY.persona.restore
  ) as HTMLButtonElement;
  const advanced = h(
    'details',
    { class: 'persona-advanced' },
    h('summary', {}, h('span', {}, COPY.persona.advancedSummary)),
    h('div', { class: 'persona-advanced-body' }, personaInput, restore)
  );

  const el = h(
    'section',
    { class: 'personalize-panel persona-builder', 'data-testid': 'persona-builder' },
    h('h3', { class: 'group-label persona-builder-title' }, COPY.persona.title),
    h('p', { class: 'hint faint persona-builder-note' }, COPY.persona.note),
    tone.el,
    problem.el,
    energy.el,
    humor.el,
    proactive.el,
    length.el,
    relationship.el,
    relationshipCustomWrap,
    preview,
    advanced
  );

  const sync = (next: SessionSetup) => {
    current = next;
    tone.sync(next.personaTraits.tone);
    problem.sync(Math.max(0, PROBLEM_IDS.indexOf(next.personaTraits.problem)));
    energy.sync(Math.max(0, ENERGY_IDS.indexOf(next.personaTraits.energy)));
    proactive.sync(Math.max(0, PROACTIVE_IDS.indexOf(next.personaTraits.proactive)));
    length.sync(Math.max(0, LENGTHS.findIndex((option) => option.id === next.length)));
    humor.btns.forEach((button, index) => {
      button.setAttribute(
        'aria-checked',
        String(COPY.persona.humor.options[index].id === next.personaTraits.humor)
      );
    });
    relationship.btns.forEach((button, index) => {
      button.setAttribute(
        'aria-checked',
        String(
          COPY.persona.relationship.options[index].id === next.personaTraits.relationship
        )
      );
    });
    if (document.activeElement !== relationshipCustom) {
      relationshipCustom.value = next.personaTraits.relationshipCustom;
    }
    relationshipCustomWrap.hidden = next.personaTraits.relationship !== 'custom';
    if (document.activeElement !== personaInput) personaInput.value = next.persona;
    previewText.textContent = next.persona;
    preview.classList.toggle('is-override', next.personaOverride);
    overrideNote.hidden = !next.personaOverride;
    restore.disabled = !next.personaOverride;
  };
  sync(session);

  return { el, personaInput, sync };
}

// ---------- GALLERY (outer: pick a universe) ----------

export function galleryStep(actions: UIActions): StepView {
  const tiles = visibleUniverses().map((u) => {
    const preview = u.galleryPreviews?.[0] ?? (u.posterUrl ? { url: u.posterUrl, label: u.name } : null);
    const poster = h('div', {
      class: 'tile-poster is-single',
      style: `--accent:${cssColor(u.accentColor)}`,
      'aria-hidden': 'true',
    });
    if (preview) {
      const img = h('img', { alt: '', src: preview.url, draggable: 'false' }) as HTMLImageElement;
      img.addEventListener('error', () => img.remove(), { once: true });
      poster.append(h('span', { class: 'tile-preview tile-preview-1' }, img));
    }
    const tile = h(
      'button',
      {
        class: `universe-tile universe-tile-${u.kind}`,
        'data-testid': `universe-${u.id}`,
        style: `--accent:${cssColor(u.accentColor)}`,
        'aria-label': u.name,
      },
      poster,
      h('span', { class: 'tile-name' }, u.name)
    ) as HTMLButtonElement;
    tile.addEventListener('click', () => actions.openUniverse(u.id));
    return tile;
  });

  const el = h(
    'section',
    { class: 'step step-gallery', 'aria-label': 'Chọn một vũ trụ' },
    h(
      'div',
      { class: 'gallery-wrap' },
      h(
        'header',
        { class: 'gallery-intro' },
        h('p', { class: 'kicker' }, COPY.gallery.kicker),
        h('h1', { class: 'headline' }, COPY.gallery.headline),
        h('p', { class: 'subline' }, COPY.gallery.subline)
      ),
      h('div', { class: 'universe-grid' }, ...tiles)
    )
  );
  return { el };
}

// The cinematic gate is its own step. No companion GLB, backdrop, lights or
// sidebar are created until this video ends (or the visitor skips it).
export function companionTeaserStep(actions: UIActions): StepView {
  const video = h('video', {
    class: 'stage-teaser-video',
    src: 'assets/kagura-teaser-v2.mp4',
    poster: 'assets/open-chat/kagura-opening-reflection.webp',
    preload: 'auto',
    playsinline: 'true',
    'aria-label': 'Teaser điện ảnh của Kagura Akagane',
  }) as HTMLVideoElement;
  video.muted = true;
  video.playsInline = true;
  const play = h('button', { class: 'btn btn-primary teaser-play', hidden: true }, 'Phát teaser') as HTMLButtonElement;
  const skip = h(
    'button',
    { class: 'teaser-skip', hidden: true },
    'Bỏ qua teaser',
    h('span', { 'aria-hidden': 'true' }, ' →')
  ) as HTMLButtonElement;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    video.pause();
    actions.finishCompanionTeaser();
  };
  const playVideo = () => {
    void video.play().catch(() => {
      play.hidden = false;
    });
  };
  video.addEventListener('ended', finish);
  video.addEventListener('error', finish);
  play.addEventListener('click', playVideo);
  skip.addEventListener('click', finish);
  const startTimer = window.setTimeout(playVideo, 180);
  const skipTimer = window.setTimeout(() => {
    skip.hidden = false;
  }, 1800);
  const el = h(
    'section',
    { class: 'step step-companion-teaser', 'aria-label': 'Teaser mở vũ trụ Kagura' },
    h(
      'div',
      { class: 'stage-teaser', 'data-testid': 'kagura-teaser' },
      h('div', { class: 'stage-teaser-vignette', 'aria-hidden': 'true' }),
      video,
      h(
        'div',
        { class: 'stage-teaser-brand' },
        h('span', {}, 'KAGURA AKAGANE'),
        h('small', {}, 'THE RED EDGE AWAKENS')
      ),
      play,
      skip
    )
  );
  return {
    el,
    destroy() {
      window.clearTimeout(startTimer);
      window.clearTimeout(skipTimer);
      video.pause();
    },
  };
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
  const roster = h('div', { role: 'radiogroup', 'aria-label': 'Các nhân vật', class: 'roster character-screen' });
  const rosterBtns: HTMLButtonElement[] = [];
  const canonRoute = resolveCanonRoute();
  RESIDENTS.forEach((base) => {
    const r = canonViewFor(base.id, canonRoute);
    const portrait = openingVisualFor(base.id);
    const b = h(
      'button',
      {
        role: 'radio',
        'aria-checked': 'false',
        class: 'roster-chip',
        style: `--accent:${cssColor(r.accentColor)}`,
        onClick: () => actions.selectResident(r.id),
      },
      h(
        'span',
        { class: 'roster-portrait', 'aria-hidden': 'true' },
        h('img', { class: 'roster-world', src: portrait.src, alt: '', draggable: 'false' }),
        h('img', {
          class: 'roster-figure',
          src: `assets/residents/${r.id}.webp`,
          alt: '',
          draggable: 'false',
        }),
        h('span', { class: 'roster-glow' })
      ),
      h(
        'span',
        { class: 'roster-copy' },
        h('span', { class: 'roster-index', 'aria-hidden': 'true' }, String(rosterBtns.length + 1).padStart(2, '0')),
        h('span', { class: 'chip-full' }, r.name),
        h('span', { class: 'chip-short', 'aria-hidden': 'true' }, r.name.split(' ')[0]),
        h('small', {}, r.series.split(' - ')[0])
      )
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

  // --- cinematic hand-off: gallery camera push → teaser → thawed figurine ---
  const teaserVideo = h('video', {
    class: 'stage-teaser-video',
    src: 'assets/kagura-teaser-v2.mp4',
    poster: 'assets/open-chat/kagura-opening-reflection.webp',
    preload: 'auto',
    playsinline: 'true',
    'aria-label': 'Teaser điện ảnh của Kagura Akagane',
  }) as HTMLVideoElement;
  teaserVideo.muted = true;
  teaserVideo.playsInline = true;
  const teaserPlay = h(
    'button',
    { class: 'btn btn-primary teaser-play', hidden: true },
    'Phát teaser'
  ) as HTMLButtonElement;
  const teaserSkip = h(
    'button',
    { class: 'teaser-skip', hidden: true },
    'Bỏ qua teaser',
    h('span', { 'aria-hidden': 'true' }, ' →')
  ) as HTMLButtonElement;
  const teaser = h(
    'div',
    { class: 'stage-teaser', 'data-testid': 'kagura-teaser' },
    h('div', { class: 'stage-teaser-vignette', 'aria-hidden': 'true' }),
    teaserVideo,
    h(
      'div',
      { class: 'stage-teaser-brand' },
      h('span', {}, 'KAGURA AKAGANE'),
      h('small', {}, 'THE RED EDGE AWAKENS')
    ),
    teaserPlay,
    teaserSkip
  );
  const finalFrame = h('div', {
    class: 'teaser-final-frame',
    'aria-hidden': 'true',
    style: `background-image:url('assets/kagura-teaser-v2-final.webp')`,
  });
  const premiumTeaserImage = h('img', {
    class: 'premium-teaser-image',
    src: KAGURA_FIGURINE_VARIANTS[0].transitionImageUrl,
    alt: '',
    draggable: 'false',
  }) as HTMLImageElement;
  const premiumTeaserName = h('strong', { class: 'premium-teaser-name' });
  const premiumTeaser = h(
    'div',
    { class: 'premium-teaser', 'aria-hidden': 'true', 'data-testid': 'premium-teaser' },
    h('div', { class: 'premium-teaser-visual' }, premiumTeaserImage),
    h('div', { class: 'premium-teaser-slash slash-a', 'aria-hidden': 'true' }),
    h('div', { class: 'premium-teaser-slash slash-b', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'premium-teaser-copy' },
      h('span', {}, 'KAGURA · LIMITED DISPLAY'),
      premiumTeaserName,
      h('small', {}, 'RODIN PBR · 15 CM')
    )
  );

  const productName = h('h2', { class: 'showcase-name' });
  const productSeries = h('p', { class: 'showcase-series' });
  const productHook = h('p', { class: 'showcase-hook' });
  const productVariants = h('div', {
    class: 'product-variants',
    role: 'list',
    'aria-label': 'Ba visual edition',
  });
  const productRail = h(
    'aside',
    { class: 'product-rail', 'data-testid': 'figurine-product-rail' },
    h(
      'div',
      { class: 'showcase-heading' },
      h('p', { class: 'showcase-kicker' }, 'CHARACTER SELECT · COLLECTIBLE PROTOTYPE'),
      productName,
      productSeries,
      productHook
    ),
    h(
      'div',
      { class: 'product-rail-label' },
      h('span', {}, '3 PREMIUM EDITIONS'),
      h('span', {}, '15 CM')
    ),
    productVariants,
    h(
      'p',
      { class: 'product-estimate' },
      h('span', {}, 'Giá dự kiến'),
      h('strong', {}, '6.999.000 ₫')
    )
  );

  const pressToTalk = h(
    'button',
    {
      class: 'hero-talk-prompt',
      'data-testid': 'press-to-talk',
      onClick: () => actions.enterPlayground(),
    },
    h('span', { class: 'talk-pulse', 'aria-hidden': 'true' }),
    h('span', { class: 'talk-copy' }, h('strong', {}, 'PRESS TO TALK'), h('small', {}, 'Mở chat & voice playground'))
  ) as HTMLButtonElement;
  const returnOriginal = h(
    'button',
    {
      class: 'return-original',
      'data-testid': 'return-original',
      onClick: () => actions.returnToOriginalFigurine(),
    },
    h('span', { 'aria-hidden': 'true' }, '←'),
    h('span', {}, h('strong', {}, 'VỀ KAGURA ORIGINAL'), h('small', {}, 'Quay lại center base & playground'))
  ) as HTMLButtonElement;

  const thawFx = h(
    'div',
    { class: 'stage-thaw-fx', 'aria-hidden': 'true' },
    h('div', { class: 'thaw-door-light' })
  );

  const contextVisualCard = (turn: ChatTurn, state: AppState): HTMLElement | null => {
    const visual = turn.contextVisual;
    if (!turn.id || !visual) return null;
    const blocked = state.thinking || state.voicing || state.reveal !== null || !!state.activeQuestId;
    const label =
      visual.status === 'ready'
        ? 'CẢNH TỪ ĐOẠN VỪA RỒI'
        : visual.status === 'generating'
          ? 'ĐANG DỰNG CẢNH'
          : visual.status === 'failed'
            ? 'CẢNH ĐÃ BỎ QUA'
            : 'CẢNH ĐƯỢC ĐỀ XUẤT';
    const actionLabel =
      visual.status === 'ready'
          ? 'Xem lại ảnh'
          : visual.status === 'generating'
            ? 'Đang dựng…'
            : visual.status === 'failed'
              ? 'Không trừ credit'
          : visual.payment === 'free-auto'
            ? 'Thử lại miễn phí'
            : `Dựng cảnh này · ${visual.price} credit`;
    const activate = () => {
      if (visual.status === 'ready') actions.showOpenChatImage(turn.id!);
      else if (visual.status === 'offered') actions.requestOpenChatImage(turn.id!);
    };
    return h(
      'figure',
      {
        class: `open-chat-visual open-chat-visual-compact is-context is-${visual.status}`,
        'data-testid': 'open-chat-context-visual',
        'data-visual-status': visual.status,
        'data-visual-payment': visual.payment,
      },
      h(
        'figcaption',
        { class: 'open-chat-visual-caption' },
        h('span', { class: 'open-chat-visual-label' }, label),
        h('span', { class: 'open-chat-visual-caption-text' }, visual.caption)
      ),
      h(
        'div',
        { class: 'open-chat-visual-actions' },
        h(
          'button',
          {
            class: 'open-chat-visual-action',
            disabled: blocked || visual.status === 'generating' || visual.status === 'failed',
            onClick: activate,
          },
          actionLabel
        ),
        ...(visual.status === 'offered' && visual.payment === 'paid'
          ? [
              h(
                'button',
                {
                  class: 'open-chat-visual-action is-secondary',
                  disabled: blocked,
                  onClick: () => actions.dismissOpenChatImage(turn.id!),
                },
                'Bỏ qua'
              ),
            ]
          : [])
      )
    );
  };

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
  const questEndingLabel = h('h2', { class: 'quest-ending-label' });
  const questEndingWhat = h('p', { class: 'quest-ending-what' });
  const questEndingClosing = h('p', { class: 'quest-ending-closing' });
  const questEnding = h(
    'section',
    { class: 'quest-ending', 'data-testid': 'quest-ending', hidden: true, 'aria-live': 'polite' },
    h('p', { class: 'quest-ending-kicker' }, 'KẾT CỤC'),
    questEndingLabel,
    questEndingWhat,
    questEndingClosing,
    h(
      'button',
      { class: 'btn btn-primary quest-ending-exit', 'data-testid': 'quest-ending-exit', onClick: () => actions.leaveQuest() },
      'Về Open Chat'
    )
  );
  const questStrip = h(
    'div',
    { class: 'quest-strip', hidden: true },
    questHead,
    questObjective,
    questLine,
    questOptions,
    questFreeform,
    questEnding
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

  let teaserStartTimer = 0;
  let teaserSkipTimer = 0;
  let teaserFinishTimer = 0;
  let thawTimer = 0;
  let teaserFinishing = false;
  const clearTeaserTimers = () => {
    window.clearTimeout(teaserStartTimer);
    window.clearTimeout(teaserSkipTimer);
    window.clearTimeout(teaserFinishTimer);
  };
  const finishTeaser = () => {
    if (teaserFinishing) return;
    teaserFinishing = true;
    clearTeaserTimers();
    teaserVideo.pause();
    // The dedicated final-frame layer owns the mapping; fade the video without
    // waiting so there is no black flash between the two identical silhouettes.
    teaser.style.transition = 'none';
    teaser.classList.add('is-ending');
    actions.finishCompanionTeaser();
  };
  const playTeaser = () => {
    if (store.get().companionMode !== 'teaser') return;
    teaser.classList.add('is-playing');
    teaserPlay.hidden = true;
    void teaserVideo.play().catch(() => {
      teaser.classList.add('needs-play');
      teaserPlay.hidden = false;
    });
  };
  teaserVideo.addEventListener('ended', finishTeaser);
  teaserVideo.addEventListener('error', finishTeaser);
  teaserPlay.addEventListener('click', playTeaser);
  teaserSkip.addEventListener('click', finishTeaser);
  if (state.companionMode === 'teaser') {
    // Let the Three.js camera begin its push into the universe before the film
    // takes over. The overlap masks GLB streaming without adding a loading UI.
    teaserStartTimer = window.setTimeout(playTeaser, 780);
    teaserSkipTimer = window.setTimeout(() => {
      teaserSkip.hidden = false;
    }, 2000);
  }
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
    'Anh muốn nhập vai ai?',
    [
      { id: 'self', label: 'Là chính anh' },
      { id: 'character', label: 'Nhập vai một nhân vật…' },
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
  identityMode.select.dataset.testid = 'session-identity';
  const identityCustom = h(
    'div',
    { class: 'session-inline-custom', hidden: true },
    identityInput,
    h('p', { class: 'hint faint' }, COPY.stage.identityNote)
  );
  const scenarioSeg = segment('Bối cảnh gợi ý', SCENARIOS, (id) =>
    actions.updateSession({ scenario: id })
  );
  scenarioSeg.el.classList.add('session-scenario-chips');
  scenarioSeg.el.setAttribute('role', 'radiogroup');
  scenarioSeg.el.setAttribute('aria-label', 'Bối cảnh gợi ý');
  scenarioSeg.el.dataset.testid = 'session-scenario';
  const scenarioHeading = scenarioSeg.el.querySelector('.group-label');
  if (scenarioHeading) scenarioHeading.textContent = 'Bối cảnh gợi ý · không bắt buộc';
  scenarioSeg.btns.forEach((button, index) => {
    button.dataset.testid = `session-scenario-${SCENARIOS[index].id}`;
  });
  const personaBuilder = createPersonaBuilder(state.session, (patch) =>
    actions.updateSession(patch)
  );
  const sessionContext = h(
    'div',
    { class: 'session-context-field', 'data-testid': 'session-context' },
    personaBuilder.el,
    scenarioSeg.el
  );

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
      h('p', { class: 'session-impact-note' }, COPY.stage.sessionNote),
      h(
        'div',
        { class: 'session-primary' },
        identityMode.el,
        identityCustom,
        sessionContext
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
    {
      class: 'step step-stage',
      'aria-label': 'Gặp nhân vật',
      'data-companion-mode': state.companionMode,
      'data-figurine-display': state.figurineDisplayMode,
    },
    srOnlyName,
    teaser,
    finalFrame,
    premiumTeaser,
    thawFx,
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
    productRail,
    pressToTalk,
    returnOriginal,
    rail,
    dock,
    saveGate,
    unlockGate
  );
  if (state.companionMode === 'reveal') {
    el.classList.add('is-thawing');
    thawTimer = window.setTimeout(() => el.classList.remove('is-thawing'), 3900);
  }

  const keepLatestTurnVisible = () => {
    log.scrollTop = log.scrollHeight;
    requestAnimationFrame(() => {
      if (log.isConnected) log.scrollTop = log.scrollHeight;
    });
  };
  const onStageResize = () => keepLatestTurnVisible();
  window.addEventListener('resize', onStageResize);

  // The dock is the only thing whose height nobody controls: the quest strip
  // makes it two or three times taller. Publish that height so the rail above
  // can stay clear of it instead of guessing.
  const watchDock = new ResizeObserver(([entry]) => {
    // Border box, not content box: the dock's own padding and border are 26px
    // of the height the rail has to clear, and measuring the content box put
    // her last line exactly that far underneath it.
    const box = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
    el.style.setProperty('--dock-h', `${Math.round(box)}px`);
    keepLatestTurnVisible();
  });

  let lastResident = '';
  let lastRosterScrolledTo = '';
  let lastFantasyFor = '';
  let lastQuestId = '';
  let lastChatLen = -1;
  let lastChatScope = '';
  let lastWaiting = false;
  let lastRevealKey = '';
  let lastContextVisualKey = '';
  let lastGateOpen = false;
  watchDock.observe(dock);

  return {
    el,
    destroy() {
      watchDock.disconnect();
      window.removeEventListener('resize', onStageResize);
      clearTeaserTimers();
      window.clearTimeout(thawTimer);
      teaserVideo.pause();
      stopGateCountdown();
    },
    update(s, prev) {
      const r = canonViewFor(s.residentId, canonRoute);
      const saved = s.progress[s.residentId];
      el.style.setProperty('--accent', cssColor(r.accentColor));
      el.dataset.companionMode = s.companionMode;
      el.dataset.figurineDisplay = s.figurineDisplayMode;
      if (
        s.figurineDisplayMode === 'premium-preview' &&
        (prev.figurineDisplayMode !== 'premium-preview' ||
          prev.kaguraFigurineVariantId !== s.kaguraFigurineVariantId)
      ) {
        const variant = kaguraFigurineVariantById(s.kaguraFigurineVariantId);
        premiumTeaserImage.src = variant.transitionImageUrl;
        premiumTeaserName.textContent = variant.label;
        window.setTimeout(
          () => actions.finishKaguraFigurineTransition(variant.id),
          window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 820
        );
      }

      if (s.residentId !== lastResident) {
        lastResident = s.residentId;
        srOnlyName.textContent = r.name;
        productName.textContent = r.name;
        productSeries.textContent = r.series.split(' - ')[0];
        productHook.textContent = r.card.hook;
        if (r.id === 'kagura') {
          productVariants.replaceChildren(
            ...KAGURA_FIGURINE_VARIANTS.map((variant, index) => {
              const selected =
                (s.figurineDisplayMode === 'premium' || s.figurineDisplayMode === 'premium-preview') &&
                variant.id === s.kaguraFigurineVariantId;
              return h(
                'button',
                {
                  class: `product-variant${selected ? ' is-active' : ''}`,
                  role: 'listitem',
                  'data-variant-id': variant.id,
                  'aria-pressed': String(selected),
                  onClick: () => actions.selectKaguraFigurineVariant(variant.id),
                },
                h(
                  'span',
                  { class: 'product-variant-image' },
                  h('img', { src: variant.previewUrl, alt: `${r.name} — ${variant.styleLabel}`, loading: 'eager', draggable: 'false' }),
                  h('span', {}, String(index + 1).padStart(2, '0'))
                ),
                h(
                  'span',
                  { class: 'product-variant-copy' },
                  h('strong', {}, variant.label),
                  h('small', {}, `${variant.styleLabel} · ${variant.sizeLabel}`),
                  h('b', {}, variant.priceLabel)
                )
              );
            })
          );
        } else {
          const editions = OPEN_CHAT_VISUALS.filter((visual) => visual.residentId === r.id);
          productVariants.replaceChildren(
            ...editions.map((visual, index) =>
              h(
                'article',
                { class: `product-variant is-${visual.frame}`, role: 'listitem' },
                h(
                  'div',
                  { class: 'product-variant-image' },
                  h('img', { src: visual.src, alt: visual.alt, loading: 'eager', draggable: 'false' }),
                  h('span', {}, String(index + 1).padStart(2, '0'))
                ),
                h(
                  'div',
                  { class: 'product-variant-copy' },
                  h('strong', {}, visual.label),
                  h('small', {}, 'VISUAL EDITION · 15 CM'),
                  h('b', {}, '6.999.000 ₫')
                )
              )
            )
          );
        }
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
      if (document.activeElement !== identityInput) identityInput.value = s.session.identity;
      personaBuilder.sync(s.session);
      if (s.session.identity) identityCustomActive = true;
      if (s.sessionPanelOpen && !prev.sessionPanelOpen) {
        identityCustomActive = Boolean(s.session.identity);
      }
      identityMode.select.value = identityCustomActive ? 'character' : 'self';
      identityCustom.hidden = !identityCustomActive;
      scenarioSeg.btns.forEach((button, index) => {
        button.setAttribute('aria-checked', String(SCENARIOS[index].id === s.session.scenario));
      });
      // Scenario belongs to Open Chat. Quest owns its authored scene, so this
      // control disappears rather than pretending it can tune the story face.
      scenarioSeg.el.hidden = s.activeQuestId !== null;
      const scenarioLabel = SCENARIOS.find((option) => option.id === s.session.scenario)?.label ?? 'Thường ngày';
      const identityLabel = s.session.identity || 'Là chính anh';
      const sessionSummary = s.activeQuestId
        ? `${identityLabel} · Câu chuyện`
        : `${identityLabel} · Đồng hành · ${scenarioLabel}`;
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
      if (s.residentId === 'kagura') {
        for (const button of productVariants.querySelectorAll<HTMLButtonElement>('.product-variant')) {
          const active =
            (s.figurineDisplayMode === 'premium' || s.figurineDisplayMode === 'premium-preview') &&
            button.dataset.variantId === s.kaguraFigurineVariantId;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        }
      }
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
      questReturnBtn.hidden = s.questPhase === 'ending';
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
        const endingId = s.activeQuestEndingId;
        const resolved = endingId ? endingFor(openQuest.residentId, canonRoute, endingId) : null;
        const presentation = endingPresentation(resolved);
        questLine.textContent = 'Frame đã đổi trạng thái.';
        questEndingLabel.textContent =
          presentation.kind === 'ready' ? presentation.label : presentation.title;
        questEndingWhat.textContent =
          presentation.kind === 'ready' ? presentation.what : presentation.body;
        questEndingClosing.textContent =
          presentation.kind === 'ready' ? presentation.closingLine : '';
        questEndingClosing.hidden = presentation.kind !== 'ready';
        (questEnding as HTMLElement).hidden = false;
        (questObjective as HTMLElement).hidden = true;
        (questOptions as HTMLElement).hidden = true;
        (questFreeform as HTMLElement).hidden = true;
      } else {
        (questEnding as HTMLElement).hidden = true;
        (questOptions as HTMLElement).hidden = false;
      }
      if (!openQuest) {
        lastQuestId = '';
        (questEnding as HTMLElement).hidden = true;
        (questFreeform as HTMLElement).hidden = true;
      }

      // One balance, and the price of whatever the bar is about to do.
      const price = speakMode ? COST.speakForMe : COST.turn;
      const balance = availableCredits(s);
      turnsLeft.textContent =
        balance >= price ? `${balance} credit còn lại` : COPY.stage.outOfTurns;
      turnsLeft.classList.toggle('is-broke', balance < price);
      // Let a broke visitor attempt the action: Store will refuse it and the
      // shared credit sheet can explain the exact shortfall and open Wallet.
      const blocked = s.thinking || s.voicing;
      input.disabled = blocked;
      sendBtn.disabled = blocked;

      // Waiting belongs in the conversation, as a turn she has not started,
      // rather than as a status line under the buttons.
      const visibleChat = openQuest ? s.questChat : s.chat;
      const chatScope = openQuest
        ? questConversationScope(openQuest.id)
        : chatConversationScope(s.residentId);
      const lastTurn = visibleChat[visibleChat.length - 1];
      const waiting = s.thinking || (s.voicing && lastTurn?.from === 'user');
      const revealKey = s.reveal ? `${s.reveal.turn}:${s.reveal.words}` : '';
      const contextVisualKey = visibleChat
        .map((turn) => {
          const visual = turn.contextVisual;
          return visual ? `${turn.id}:${visual.jobId}:${visual.status}:${visual.src ?? ''}` : '';
        })
        .join('|');
      if (
        visibleChat.length !== lastChatLen ||
        chatScope !== lastChatScope ||
        waiting !== lastWaiting ||
        revealKey !== lastRevealKey ||
        contextVisualKey !== lastContextVisualKey
      ) {
        lastChatLen = visibleChat.length;
        lastChatScope = chatScope;
        lastWaiting = waiting;
        lastRevealKey = revealKey;
        lastContextVisualKey = contextVisualKey;
        // Her actions and her words look different, because they are: one is
        // the room, the other is her voice. Only the second is ever spoken.
        // Open Chat is a live exchange, not an archive: keep only the newest
        // turn above the composer. The full transcript remains in state for
        // memory/model context, while Quest retains its authored sequence.
        const chatEntries = openQuest
          ? visibleChat.map((turn, index) => ({ turn, index }))
          : visibleChat.length
            ? [{ turn: visibleChat[visibleChat.length - 1], index: visibleChat.length - 1 }]
            : [];
        log.replaceChildren(
          ...chatEntries.flatMap(({ turn: t, index: i }) => {
            if (t.from !== 'resident') return [h('p', { class: 'bubble bubble-user' }, t.text)];
            const partial = s.reveal?.turn === i;
            const parts = partial ? segmentsUpTo(t.text, s.reveal!.words) : segments(t.text);
            if (!openQuest) {
              const line = parts.map((part) => part.text).join(' ').trim();
              if (!line) return [];
              const tail = partial ? ' is-typing' : '';
              const contextCard = !partial ? contextVisualCard(t, s) : null;
              const bubble = h('p', { class: `bubble bubble-resident${tail}` }, line);
              return contextCard ? [bubble, contextCard] : [bubble];
            }
            const dialogue = dialogueBlocksFromSegments(
              parts,
              undefined,
              t.visualAfterSentence ?? 2,
              !partial
            );
            const lastTextIndex = dialogue.reduce(
              (last, block, index) => (block.kind === 'visual' ? last : index),
              -1
            );
            const rendered = dialogue.flatMap((seg, k) => {
              if (seg.kind === 'visual') return [];
              const tail = partial && k === lastTextIndex ? ' is-typing' : '';
              return seg.kind === 'beat'
                ? [h('p', { class: `beat-line${tail}` }, seg.text)]
                : [h('p', { class: `bubble bubble-resident${tail}` }, seg.text)];
            });
            const contextCard = !openQuest && !partial ? contextVisualCard(t, s) : null;
            return contextCard ? [...rendered, contextCard] : rendered;
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
        // Compact visual cards gain their final height after layout/font paint.
        // Re-anchor once more so the CTA never ends up clipped behind the dock.
        keepLatestTurnVisible();
      }

      (unlockGate as HTMLElement).hidden = !s.unlockGateOpen;
      (saveGate as HTMLElement).hidden = !s.saveGateOpen;
      if (s.saveGateOpen && !lastGateOpen) {
        const candidates = extractMemories(s.chat);
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
        const canPay = balance >= COST.saveChapter && candidates.length > 0;
        gateCost.textContent = canPay
          ? `${COPY.stage.saveCost} Anh còn ${balance} credit.`
          : balance > 0
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
          const endings = new Set(terminalEndingIds(quest));
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
      if (canonRoute === 'sao' && quests.length === 0) {
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
        .replace('{count}', String(balance));
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
