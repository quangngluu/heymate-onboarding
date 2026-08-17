// Step views. The studio is the centerpiece: character info card bottom-left,
// character slider bottom-center, generation panel right. The oversized
// character name lives in the 3D scene (nameplate), not in the DOM.

import { h } from './dom';
import type { UIActions } from './actions';
import type {
  AppState,
  ChatTurn,
  FigurineOrder,
  PersonaTraits,
  SessionSetup,
  ShippingInfo,
} from '../state/store';
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
  endEviCall,
  isEviCallConfigured,
  startEviCall,
  subscribeEviCall,
  type EviCallState,
} from '../chat/evi-call';
import {
  KAGURA_FIGURINE_VARIANTS,
  kaguraFigurineVariantById,
  formatVndPrice,
} from '../config/figurine-products';
import { bridgeBeatFor } from '../chat/bridge-beat';

/** Clean, IP-free short labels for the roster (source-work names removed). */
const RESIDENT_SHORT_LABEL: Record<string, string> = {
  rin: 'RIN',
  kagura: 'AKAGANE',
  momo: 'MOMO',
};
function residentShortLabel(id: string, name: string): string {
  return RESIDENT_SHORT_LABEL[id] ?? name.split(' ')[0].toUpperCase();
}
/** Series is "<source work> — <codename>"; surface only the IP-free codename. */
function seriesCodename(series: string): string {
  const parts = series.split(/\s*[—–-]\s*/);
  return (parts.length > 1 ? parts.slice(1).join(' — ') : series).trim();
}

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
  const universe = visibleUniverses()[0];
  const enter = h(
    'button',
    {
      class: 'btn btn-primary universe-enter-button',
      'data-testid': `universe-${universe.id}`,
      style: `--accent:${cssColor(universe.accentColor)}`,
      'aria-label': `Enter ${universe.name}`,
    },
    'ENTER UNIVERSE'
  ) as HTMLButtonElement;
  enter.addEventListener('click', () => actions.openUniverse(universe.id));

  const el = h(
    'section',
    { class: 'step step-gallery', 'aria-label': 'Enter Universe' },
    h('div', { class: 'universe-entry' }, enter)
  );
  return { el };
}

// The cinematic gate owns the UI while the live 3D desk renders underneath.
// The last clip dissolves into that actual scene before the stage UI mounts.
export function companionTeaserStep(actions: UIActions): StepView {
  const segments = [
    {
      id: 'official-teaser',
      src: '/assets/teaser/kagura-universe-official.mp4',
      poster: '/assets/stage/office-entry-empty-landscape.webp',
    },
  ] as const;
  const videos = segments.map((segment, index) => {
    const video = h('video', {
      class: `stage-teaser-video${index === 0 ? ' is-entry-segment' : ''}`,
      src: segment.src,
      poster: segment.poster,
      preload: 'auto',
      playsinline: 'true',
      'data-teaser-segment': segment.id,
      'aria-hidden': String(index !== 0),
    }) as HTMLVideoElement;
    // This step is mounted synchronously from ENTER UNIVERSE, so the first
    // play attempt still owns the click's media permission. The persistent
    // sound toggle remains the source of truth if the visitor muted earlier.
    video.muted = actions.isMuted();
    video.playsInline = true;
    return video;
  });
  const play = h('button', { class: 'btn btn-primary teaser-play', hidden: true }, 'Phát teaser') as HTMLButtonElement;
  // Skip fades in after the picture has settled; a tap cuts straight to the live
  // desk at rest (no dolly, since `beginCompanionReveal` is never called).
  const skip = h(
    'button',
    { type: 'button', class: 'teaser-skip', 'aria-label': 'Bỏ qua teaser', hidden: true },
    'Bỏ qua ',
    h('span', { 'aria-hidden': 'true' }, '›')
  ) as HTMLButtonElement;
  let skipRevealTimer = 0;
  const lastIndex = videos.length - 1;
  const handoffDurationMs = 720;
  // The page has settled flat by this beat. Starting earlier crossfades two
  // different poses and exposes the live figure before the final composition.
  const handoffLeadSeconds = 0.62;
  let finished = false;
  let activeIndex = -1;
  let handoffStarted = false;
  let handoffStartedAt = 0;
  let handoffTimer = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const video of videos) video.pause();
    actions.finishCompanionTeaser();
  };
  const playVideo = () => {
    if (activeIndex < 0) return;
    void videos[activeIndex].play().catch(() => {
      play.hidden = false;
    });
  };
  const activate = (index: number) => {
    if (finished) return;
    activeIndex = index;
    teaser.classList.add('is-playing');
    videos.forEach((video, videoIndex) => {
      const active = videoIndex === index;
      video.classList.toggle('is-active', active);
      video.setAttribute('aria-hidden', String(!active));
      if (!active) video.pause();
    });
    const next = videos[index];
    next.currentTime = 0;
    play.hidden = true;
    playVideo();
  };
  const advance = (index: number) => {
    if (finished || index !== activeIndex) return;
    if (index + 1 < videos.length) {
      activate(index + 1);
      return;
    }
    if (handoffStarted) {
      const elapsed = performance.now() - handoffStartedAt;
      // Keep the transparent gate mounted until the dissolve is certainly
      // complete. Slow `timeupdate` cadence must never cause a last-frame jump.
      handoffTimer = window.setTimeout(finish, Math.max(80, handoffDurationMs - elapsed + 40));
    } else if (startHandoff()) {
      handoffTimer = window.setTimeout(finish, handoffDurationMs + 40);
    } else {
      finish();
    }
  };
  const startHandoff = () => {
    if (handoffStarted || activeIndex !== lastIndex) return handoffStarted;
    if (document.documentElement.dataset.deskHeroReady !== 'true') return false;
    handoffStarted = true;
    handoffStartedAt = performance.now();
    play.hidden = true;
    teaser.classList.add('is-handing-off');
    // Reveal the matched live desk, then open the mask + bring the lights up.
    actions.beginCompanionReveal();
    return true;
  };
  videos.forEach((video, index) => {
    video.addEventListener('ended', () => advance(index));
    video.addEventListener('error', () => advance(index));
    if (index === lastIndex) {
      video.addEventListener('timeupdate', () => {
        if (video.duration - video.currentTime <= handoffLeadSeconds) startHandoff();
      });
    }
  });
  play.addEventListener('click', playVideo);
  skip.addEventListener('click', () => finish());
  // Reveal skip once the picture has settled. Reduced-motion shows it at once.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    skip.hidden = false;
  } else {
    skipRevealTimer = window.setTimeout(() => {
      skip.hidden = false;
    }, 1200);
  }
  const teaser = h(
    'div',
    { class: 'stage-teaser', 'data-testid': 'kagura-teaser' },
    // Opaque office plate: matches the lobby frame on click, covers the live
    // desk through the whole teaser (no pre-roll flash), pushes in as the sides
    // fade, and dissolves with the gate at hand-off to reveal the desk.
    h('div', { class: 'stage-teaser-entry', 'aria-hidden': 'true' }),
    h('div', { class: 'stage-teaser-vignette', 'aria-hidden': 'true' }),
    ...videos,
    h(
      'div',
      { class: 'stage-teaser-brand' },
      h('span', {}, 'KAGURA AKAGANE'),
      h('small', {}, 'THE RED EDGE AWAKENS')
    ),
    play,
    skip
  );
  const el = h(
    'section',
    { class: 'step step-companion-teaser', 'aria-label': 'Teaser mở vũ trụ Kagura' },
    teaser
  );
  // Start inside the ENTER gesture. The picture itself still fades in over the
  // matching office plate, but delaying play would forfeit unmuted autoplay on
  // Safari and turn the cinematic into a second-click interaction.
  activate(0);
  return {
    el,
    destroy() {
      window.clearTimeout(handoffTimer);
      window.clearTimeout(skipRevealTimer);
      for (const video of videos) video.pause();
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

  // Backstory as free on-screen text (name as title + a one-line hook), not
  // boxed inside the card. Populated on resident change.
  const stageIdentityName = h('p', { class: 'stage-identity-name' });
  const stageIdentitySeries = h('p', { class: 'card-series' });
  const stageIdentityStory = h('p', { class: 'stage-identity-story' });
  const stageIdentity = h(
    'div',
    { class: 'stage-identity', 'data-testid': 'stage-identity' },
    stageIdentityName,
    stageIdentitySeries,
    stageIdentityStory
  );

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
        h('span', { class: 'chip-full' }, residentShortLabel(r.id, r.name)),
        h('span', { class: 'chip-short', 'aria-hidden': 'true' }, residentShortLabel(r.id, r.name))
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
    'aria-label': 'Các edition figurine',
  });
  const productRailLabelPrimary = h('span');
  const productRailLabelSecondary = h('span');
  const productEstimateLabel = h('span');
  const productEstimateValue = h('strong');
  const cartItemCount = h('span');
  const cartTotal = h('strong', { class: 'cart-total-value' });
  const cartItems = h('div', { class: 'cart-items' });
  let checkoutOrder: FigurineOrder | null = null;
  let waitlistResidentId = state.residentId;
  const waitlistEmail = h('input', {
    id: 'figurine-waitlist-email',
    name: 'email',
    type: 'email',
    autocomplete: 'email',
    spellcheck: 'false',
    placeholder: 'anh@example.com…',
    'aria-label': 'Email nhận thông báo',
    required: true,
  }) as HTMLInputElement;
  const waitlistNote = h('p', { class: 'waitlist-note', 'aria-live': 'polite' });
  const waitlistForm = h(
    'form',
    {
      class: 'waitlist-form',
      'data-testid': 'figurine-waitlist-form',
      onSubmit: (event: Event) => {
        event.preventDefault();
        if (!waitlistEmail.reportValidity()) return;
        actions.joinFigurineWaitlist(waitlistResidentId, waitlistEmail.value);
        waitlistEmail.value = '';
        waitlistNote.textContent = 'Đã lưu email trên thiết bị này. Em sẽ báo khi có đợt mở bán.';
      },
    },
    h('label', { for: 'figurine-waitlist-email' }, 'Nhận tin khi mở bán'),
    h('div', { class: 'waitlist-form-row' }, waitlistEmail, h('button', { type: 'submit', class: 'btn btn-secondary xs' }, 'Tham gia')),
    waitlistNote
  );
  const checkoutError = h('p', { class: 'checkout-error', role: 'alert', 'aria-live': 'polite' });
  const checkoutName = h('input', {
    id: 'checkout-name',
    name: 'name',
    type: 'text',
    autocomplete: 'name',
    placeholder: 'Tên người nhận…',
    required: true,
  }) as HTMLInputElement;
  const checkoutPhone = h('input', {
    id: 'checkout-phone',
    name: 'phone',
    type: 'tel',
    inputmode: 'tel',
    autocomplete: 'tel',
    placeholder: '090…',
    required: true,
  }) as HTMLInputElement;
  const checkoutEmail = h('input', {
    id: 'checkout-email',
    name: 'email',
    type: 'email',
    autocomplete: 'email',
    spellcheck: 'false',
    placeholder: 'anh@example.com…',
    required: true,
  }) as HTMLInputElement;
  const checkoutAddress = h('input', {
    id: 'checkout-address',
    name: 'address',
    type: 'text',
    autocomplete: 'street-address',
    placeholder: 'Số nhà, đường, thành phố…',
    required: true,
  }) as HTMLInputElement;
  const checkoutNote = h('textarea', {
    id: 'checkout-note',
    name: 'note',
    rows: '2',
    placeholder: 'Ghi chú giao hàng (không bắt buộc)…',
    autocomplete: 'off',
  }) as HTMLTextAreaElement;
  const checkoutForm = h(
    'form',
    {
      class: 'checkout-form',
      onSubmit: (event: Event) => {
        event.preventDefault();
        if (!checkoutName.reportValidity() || !checkoutPhone.reportValidity() || !checkoutEmail.reportValidity() || !checkoutAddress.reportValidity()) return;
        const shipping: ShippingInfo = {
          name: checkoutName.value.trim(),
          phone: checkoutPhone.value.trim(),
          email: checkoutEmail.value.trim(),
          address: checkoutAddress.value.trim(),
          note: checkoutNote.value.trim() || undefined,
        };
        const order = actions.placeOrder(shipping);
        if (!order) {
          checkoutError.textContent = 'Giỏ hàng đã trống. Quay lại editions để chọn sản phẩm.';
          return;
        }
        checkoutOrder = order;
        checkoutError.textContent = '';
        actions.beginPayment();
        renderCheckout(store.get());
      },
    },
    h('div', { class: 'checkout-fields' },
      h('label', { for: 'checkout-name' }, 'Tên người nhận', checkoutName),
      h('label', { for: 'checkout-phone' }, 'Số điện thoại', checkoutPhone),
      h('label', { for: 'checkout-email' }, 'Email', checkoutEmail),
      h('label', { for: 'checkout-address' }, 'Địa chỉ giao hàng', checkoutAddress),
      h('label', { for: 'checkout-note' }, 'Ghi chú', checkoutNote)
    ),
    h('p', { class: 'checkout-payment-note' }, 'Bước tiếp theo là chọn một cổng thanh toán mô phỏng. Không thu thập thông tin thẻ hay tài khoản.'),
    checkoutError,
    h('button', { type: 'submit', class: 'btn btn-primary checkout-submit', 'data-testid': 'figurine-place-order' }, 'Đặt hàng')
  );
  const checkoutLead = h('p', { class: 'checkout-lead' });
  const checkoutSummary = h('div', { class: 'checkout-confirmation-summary' });
  const checkoutConfirmation = h(
    'section',
    { class: 'checkout-confirmation', hidden: true, 'aria-live': 'polite' },
    h('p', { class: 'checkout-kicker' }, 'ORDER RECORDED'),
    h('h3', {}, 'Đã ghi nhận đơn của anh'),
    checkoutSummary,
    h('p', { class: 'checkout-payment-note' }, 'Đơn đang chờ xác nhận thanh toán. Thông tin chỉ được lưu trên thiết bị này trong bản prototype.'),
    h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => closeCheckoutView() }, 'Tiếp tục xem editions')
  );

  const checkoutPayOptions = h(
    'div',
    { class: 'checkout-pay-options' },
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary checkout-pay-btn',
        'data-testid': 'pay-momo',
        onClick: () => actions.choosePaymentMethod('momo'),
      },
      h('strong', {}, 'Momo'),
      h('small', {}, 'Ví điện tử')
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary checkout-pay-btn',
        'data-testid': 'pay-vnpay',
        onClick: () => actions.choosePaymentMethod('vnpay'),
      },
      h('strong', {}, 'VNPay'),
      h('small', {}, 'Cổng thanh toán')
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary checkout-pay-btn',
        'data-testid': 'pay-bank-qr',
        onClick: () => actions.choosePaymentMethod('bank-qr'),
      },
      h('strong', {}, 'Chuyển khoản QR'),
      h('small', {}, 'Quét mã ngân hàng')
    )
  );
  const checkoutMethod = h(
    'section',
    { class: 'checkout-payment checkout-method', hidden: true, 'data-testid': 'checkout-payment-method' },
    h('p', { class: 'checkout-payment-title' }, 'Chọn cổng thanh toán'),
    checkoutPayOptions,
    h('p', { class: 'checkout-payment-note' }, 'Tất cả đều là mô phỏng. Không phát sinh giao dịch thật.')
  );

  const checkoutQrCode = h(
    'div',
    { class: 'checkout-qr-code', 'aria-hidden': 'true' },
    h('span', { class: 'checkout-qr-glyph' }, 'QR')
  );
  const checkoutQrAmount = h('strong', { class: 'checkout-qr-amount' });
  const checkoutQr = h(
    'section',
    { class: 'checkout-payment checkout-qr', hidden: true, 'data-testid': 'checkout-payment-qr' },
    h('p', { class: 'checkout-payment-title' }, 'Quét mã để thanh toán'),
    checkoutQrCode,
    checkoutQrAmount,
    h('p', { class: 'checkout-payment-note' }, 'Mã QR chỉ là hình minh họa. Không quét bằng ứng dụng ngân hàng thật.'),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary checkout-pay-confirm',
        'data-testid': 'pay-confirm-sent',
        onClick: () => actions.confirmPaymentSent(),
      },
      'Tôi đã thanh toán'
    )
  );

  const checkoutProcessing = h(
    'section',
    { class: 'checkout-payment checkout-processing', hidden: true, 'data-testid': 'checkout-payment-processing' },
    h('span', { class: 'checkout-spinner', 'aria-hidden': 'true' }),
    h('p', { class: 'checkout-payment-title' }, 'Đang xác nhận thanh toán…')
  );

  const checkoutCard = h(
    'aside',
    { class: 'panel checkout-card' },
    h('div', { class: 'row sheet-head' }, h('div', {}, h('p', { class: 'kicker' }, 'KAGURA EDITIONS'), h('h2', { class: 'panel-title' }, 'Checkout')), h('button', { type: 'button', class: 'chrome-btn', 'aria-label': 'Đóng checkout', onClick: () => closeCheckoutView() }, '×')),
    checkoutLead,
    checkoutForm,
    checkoutMethod,
    checkoutQr,
    checkoutProcessing,
    checkoutConfirmation
  );
  const checkoutScrim = h(
    'div',
    {
      class: 'modal-scrim checkout-scrim',
      hidden: true,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Checkout Kagura editions',
      onClick: (event: Event) => {
        if (event.target === event.currentTarget) closeCheckoutView();
      },
    },
    checkoutCard
  );
  const checkoutButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary cart-checkout',
      'data-testid': 'figurine-checkout',
      onClick: () => {
        checkoutOrder = null;
        checkoutError.textContent = '';
        actions.openCheckout();
      },
    },
    'Tiến tới checkout'
  ) as HTMLButtonElement;
  const cartPanel = h(
    'section',
    { class: 'cart-panel', 'data-testid': 'figurine-cart', 'aria-label': 'Giỏ hàng' },
    h('div', { class: 'cart-heading' }, h('span', {}, 'GIỎ HÀNG'), cartItemCount),
    cartItems,
    h('div', { class: 'cart-total' }, h('span', {}, 'Tạm tính'), cartTotal),
    checkoutButton
  );
  // ---- Collectible page: catalog grid → focused 3D detail ----
  // The collectible is its own full-screen page (opened from the stage). It has
  // two faces switched by `data-view`:
  //   grid   → the editions catalog (still cards that light up on hover)
  //   detail → the grid folds away so the real 3D figure (loaded on click) and
  //            the order card own the screen; the backdrop turns transparent so
  //            the live turntable behind stays visible + draggable.
  const collectibleGrid = h(
    'div',
    { class: 'collectible-grid' },
    h(
      'div',
      { class: 'collectible-head' },
      h('p', { class: 'showcase-kicker' }, 'BỘ SƯU TẬP · FIGURINE'),
      productName,
      productSeries,
      productHook
    ),
    h(
      'div',
      { class: 'collectible-rail-label' },
      productRailLabelPrimary,
      productRailLabelSecondary
    ),
    productVariants
  );

  const detailName = h('h2', { class: 'collectible-detail-name' });
  const detailStyle = h('p', { class: 'collectible-detail-style' });
  const detailDesc = h('p', { class: 'collectible-detail-desc' });
  const detailPrice = h('strong', { class: 'collectible-detail-price' });
  const detailSize = h('span', { class: 'collectible-detail-size' });
  const detailAddBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary collectible-detail-add',
      'data-testid': 'figurine-add-to-cart',
      onClick: () => {
        const s = store.get();
        actions.addFigurineToCart(s.residentId, s.kaguraFigurineVariantId);
      },
    },
    'Thêm vào giỏ'
  ) as HTMLButtonElement;
  const detailBackBtn = h(
    'button',
    {
      type: 'button',
      class: 'chrome-btn collectible-detail-back',
      'aria-label': 'Quay lại bộ sưu tập',
      onClick: () => actions.backToCollectibleGrid(),
    },
    h('span', { 'aria-hidden': 'true' }, '←'),
    h('span', {}, 'Bộ sưu tập')
  );
  const collectibleDetail = h(
    'aside',
    { class: 'collectible-detail', 'data-testid': 'figurine-product-rail' },
    detailBackBtn,
    h(
      'div',
      { class: 'collectible-detail-body' },
      h('p', { class: 'collectible-detail-kicker' }, 'FULL FIGURINE · 15 CM'),
      detailName,
      detailStyle,
      detailDesc,
      h('div', { class: 'collectible-detail-price-row' }, detailPrice, detailSize),
      detailAddBtn,
      cartPanel
    )
  );

  const sizeRefLabel = h('span', { class: 'figurine-size-ref-label' }, '15 CM');
  const sizeRef = h(
    'div',
    {
      class: 'figurine-size-ref',
      'data-testid': 'figurine-size-ref',
      'aria-hidden': 'true',
    },
    h('span', { class: 'figurine-size-ref-rule' }),
    sizeRefLabel
  );

  const collectibleOverlay = h(
    'div',
    {
      class: 'collectible-overlay',
      hidden: true,
      'data-view': 'grid',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Bộ sưu tập figurine',
      onClick: (event: Event) => {
        // Only the dimmed grid backdrop closes; in detail view the backdrop is
        // transparent + pass-through, so clicks there belong to the turntable.
        if (event.target === event.currentTarget && store.get().collectibleView === 'grid') {
          actions.closeCollectible();
        }
      },
    },
    h(
      'button',
      {
        type: 'button',
        class: 'chrome-btn collectible-close',
        'aria-label': 'Đóng bộ sưu tập',
        onClick: () => actions.closeCollectible(),
      },
      '×'
    ),
    collectibleGrid,
    collectibleDetail,
    sizeRef
  );
  const openCollectibleBtn = h(
    'button',
    {
      type: 'button',
      class: 'collectible-open',
      'data-testid': 'open-collectible',
      onClick: () => actions.openCollectible(),
    },
    h('span', { class: 'collectible-open-title' }, 'BỘ SƯU TẬP'),
    h('span', { class: 'collectible-open-sub' }, 'Figurine editions')
  ) as HTMLButtonElement;

  function closeCheckoutView(): void {
    checkoutOrder = null;
    checkoutError.textContent = '';
    actions.cancelPaymentSim();
    actions.closeCheckout();
  }

  function renderCart(s: AppState): void {
    const units = s.cart.reduce((total, item) => total + item.qty, 0);
    const subtotal = s.cart.reduce((total, item) => total + item.priceVnd * item.qty, 0);
    cartItemCount.textContent = `${units} ${units === 1 ? 'món' : 'món'}`;
    cartTotal.textContent = formatVndPrice(subtotal);
    checkoutButton.disabled = units === 0;
    cartItems.replaceChildren(
      ...(s.cart.length
        ? s.cart.map((item, index) =>
            h(
              'article',
              { class: 'cart-line' },
              h(
                'div',
                { class: 'cart-line-copy' },
                h('strong', {}, item.label),
                h('small', {}, `${item.styleLabel} · ${formatVndPrice(item.priceVnd)}`)
              ),
              h(
                'div',
                { class: 'cart-line-actions' },
                h('button', { type: 'button', class: 'cart-qty-btn', 'aria-label': `Giảm số lượng ${item.label}`, onClick: () => actions.updateCartQty(index, item.qty - 1) }, '−'),
                h('output', { class: 'cart-qty', 'aria-label': 'Số lượng' }, String(item.qty)),
                h('button', { type: 'button', class: 'cart-qty-btn', 'aria-label': `Tăng số lượng ${item.label}`, onClick: () => actions.updateCartQty(index, item.qty + 1) }, '+'),
                h('button', { type: 'button', class: 'cart-remove', 'aria-label': `Xóa ${item.label}`, onClick: () => actions.removeFromCart(index) }, 'Xóa')
              )
            )
          )
        : [h('p', { class: 'cart-empty' }, 'Chưa có edition nào. Chọn một card để thêm vào giỏ.')])
    );
  }

  function renderWaitlist(s: AppState): void {
    const registered = s.figurineWaitlist[waitlistResidentId]?.length ?? 0;
    waitlistNote.textContent = registered
      ? 'Email đã nằm trong danh sách chờ trên thiết bị này.'
      : 'Prototype chỉ lưu danh sách chờ trên thiết bị này.';
  }

  function renderCheckout(s: AppState): void {
    checkoutScrim.hidden = !s.checkoutOpen;
    const order = checkoutOrder
      ? (s.orders.find((o) => o.id === checkoutOrder!.id) ?? checkoutOrder)
      : null;
    const hasOrder = order !== null;
    const face = hasOrder ? s.paymentSim : 'idle';
    checkoutLead.textContent = !hasOrder
      ? 'Để lại thông tin nhận hàng; sau đó chọn một cổng thanh toán mô phỏng.'
      : face === 'method'
        ? 'Chọn một cổng thanh toán để tiếp tục đơn hàng.'
        : face === 'qr'
          ? 'Quét mã bên dưới bằng ứng dụng ngân hàng (mô phỏng).'
          : face === 'processing'
            ? 'Hệ thống đang kiểm tra giao dịch của anh.'
            : 'Cảm ơn anh. Đơn hàng đã hoàn tất trong bản demo.';
    checkoutForm.hidden = hasOrder;
    checkoutMethod.hidden = face !== 'method';
    checkoutQr.hidden = face !== 'qr';
    checkoutProcessing.hidden = face !== 'processing';
    checkoutConfirmation.hidden = face !== 'success';
    if (hasOrder) {
      checkoutQrAmount.textContent = formatVndPrice(order!.subtotalVnd);
      checkoutSummary.replaceChildren(
        h('p', {}, `Mã đơn: ${order!.id}`),
        h('p', {}, `${order!.items.length} edition · ${formatVndPrice(order!.subtotalVnd)}`),
        h('p', { class: 'checkout-order-status' }, order!.status === 'paid-demo' ? 'PAID (DEMO)' : 'PENDING PAYMENT')
      );
    }
  }

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
  const eviConfigured = isEviCallConfigured();
  const eviCallChip = h(
    'button',
    {
      class: 'dock-chip evi-call-start',
      hidden: true,
      'aria-label': 'Start an English voice call with Rin',
      onClick: () => void startEviCall(),
    },
    h('span', { class: 'evi-call-glyph', 'aria-hidden': 'true' }, '●'),
    'Call Rin'
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
  const mobileEviBtn = h(
    'button',
    {
      class: 'mobile-tool-item mobile-evi-call',
      hidden: true,
      'aria-label': 'Start an English voice call with Rin',
      onClick: () => {
        setMobileToolsOpen(false);
        void startEviCall();
      },
    },
    h('span', { class: 'mobile-tool-symbol evi-call-glyph', 'aria-hidden': 'true' }, '●'),
    'Call Rin'
  ) as HTMLButtonElement;
  const mobileToolsMenu = h(
    'div',
    { class: 'mobile-tools-menu', hidden: true },
    mobileQuestBtn,
    mobileSpeakBtn,
    mobileMicBtn,
    mobileEviBtn
  );
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

  // EVI is an English-only call lane. It is deliberately separate from the
  // Vietnamese composer and its Spoon/MiniMax voice controls.
  const eviPhase = h('strong', { class: 'evi-call-phase' });
  const eviActivity = h('span', { class: 'evi-call-activity' });
  const eviCountdown = h('time', { class: 'evi-call-countdown' });
  const eviWarning = h('p', { class: 'evi-call-warning', hidden: true }, '10 seconds left — this call will end automatically.');
  const eviCaption = h('p', { class: 'evi-call-caption' });
  const eviEnd = h(
    'button',
    { class: 'btn btn-ghost xs evi-call-end', onClick: () => endEviCall() },
    'End call'
  ) as HTMLButtonElement;
  const eviCallPanel = h(
    'section',
    { class: 'evi-call-panel', hidden: true, 'aria-live': 'polite', 'aria-label': 'Rin voice call' },
    h(
      'div',
      { class: 'evi-call-head' },
      h('span', { class: 'evi-live-dot', 'aria-hidden': 'true' }),
      h('div', { class: 'evi-call-copy' }, eviPhase, eviActivity),
      eviCountdown,
      eviEnd
    ),
    eviWarning,
    eviCaption
  );

  const bridgeBeatLine = h('p', { class: 'bridge-beat-line' });
  const bridgeBeatCta = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary bridge-beat-cta',
      'data-testid': 'bridge-beat-cta',
    },
    ''
  ) as HTMLButtonElement;
  const bridgeBeatCard = h(
    'aside',
    {
      class: 'bridge-beat-card',
      hidden: true,
      'data-testid': 'bridge-beat-card',
      'aria-live': 'polite',
    },
    bridgeBeatLine,
    bridgeBeatCta
  );
  bridgeBeatCta.addEventListener('click', () => {
    bridgeBeatCard.hidden = true;
    actions.openCollectible();
    actions.viewCollectibleDetail();
  });

  const dock = h(
    'div',
    { class: 'stage-dock' },
    eviCallPanel,
    questStrip,
    bridgeBeatCard,
    h(
      'div',
      { class: 'dock-top' },
      h('div', { class: 'dock-chips' }, speakChip, micChip, eviCallChip, setChip),
      turnsLeft
    ),
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

  // Left is her voice, bottom is what you do. Her name/series/hook live in the
  // on-screen headline (`stageIdentity`); the old dossier card is gone.
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
      class: 'modal-scrim session-scrim session-drawer',
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

  const el = h(
    'section',
    {
      class: 'step step-stage',
      'aria-label': 'Gặp nhân vật',
      'data-companion-mode': state.companionMode,
      'data-figurine-display': state.figurineDisplayMode,
      'data-editions': state.editionsRevealed ? 'shown' : 'hidden',
    },
    srOnlyName,
    premiumTeaser,
    h(
      'header',
      { class: 'stage-top' },
      leaveUniverseBtn
    ),
    stageIdentity,
    sessionSheet,
    questHub,
    roster,
    openCollectibleBtn,
    collectibleOverlay,
    checkoutScrim,
    pressToTalk,
    returnOriginal,
    rail,
    dock,
    saveGate
  );
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
  let selectedResident = state.residentId;
  let questIsOpen = state.activeQuestId !== null;
  let latestEviState: EviCallState;
  watchDock.observe(dock);

  const renderEviCall = (call: EviCallState) => {
    latestEviState = call;
    const availableHere = eviConfigured && selectedResident === 'rin' && !questIsOpen;
    const ongoing = call.phase === 'connecting' || call.phase === 'live';
    eviCallChip.hidden = !availableHere || ongoing;
    mobileEviBtn.hidden = !availableHere || ongoing;
    eviCallChip.disabled = ongoing;
    mobileEviBtn.disabled = ongoing;
    eviCallPanel.hidden = !availableHere || call.phase === 'idle';
    dock.classList.toggle('is-evi-call', availableHere && ongoing);

    const labels: Record<EviCallState['phase'], string> = {
      idle: 'READY',
      connecting: 'CONNECTING',
      live: 'LIVE · RIN',
      ended: 'CALL ENDED',
      error: 'CALL ERROR',
    };
    eviPhase.textContent = labels[call.phase];
    eviActivity.textContent = call.activity;
    eviCountdown.textContent = `00:${String(call.secondsRemaining).padStart(2, '0')}`;
    eviCountdown.hidden = !ongoing;
    eviWarning.hidden = !ongoing || !call.warning;
    eviEnd.hidden = !ongoing;
    eviCallPanel.classList.toggle('is-live', call.phase === 'live');
    eviCallPanel.classList.toggle('is-warning', call.warning);
    eviCallPanel.classList.toggle('is-error', call.phase === 'error');
    eviCaption.textContent = call.assistantText
      ? `Rin: ${call.assistantText}`
      : call.userText
        ? `You: ${call.userText}`
        : 'English-only EVI demo · microphone audio is sent only during this call.';
  };
  const unsubscribeEviCall = subscribeEviCall(renderEviCall);

  return {
    el,
    destroy() {
      unsubscribeEviCall();
      if (latestEviState.phase === 'connecting' || latestEviState.phase === 'live') endEviCall();
      watchDock.disconnect();
      window.removeEventListener('resize', onStageResize);
      stopGateCountdown();
    },
    update(s, prev) {
      selectedResident = s.residentId;
      questIsOpen = s.activeQuestId !== null;
      if (
        (latestEviState.phase === 'connecting' || latestEviState.phase === 'live') &&
        (selectedResident !== 'rin' || questIsOpen)
      ) {
        endEviCall();
      } else {
        renderEviCall(latestEviState);
      }
      const r = canonViewFor(s.residentId, canonRoute);
      const saved = s.progress[s.residentId];
      el.style.setProperty('--accent', cssColor(r.accentColor));
      el.dataset.companionMode = s.companionMode;
      el.dataset.figurineDisplay = s.figurineDisplayMode;
      el.dataset.editions = s.editionsRevealed ? 'shown' : 'hidden';
      el.dataset.collectible = s.collectibleOpen ? 'open' : 'closed';
      collectibleOverlay.hidden = !s.collectibleOpen;
      // Non-kagura residents have no 3D editions, so their page never leaves the
      // catalog (waitlist) grid.
      collectibleOverlay.dataset.view =
        s.collectibleView === 'detail' && s.residentId === 'kagura' ? 'detail' : 'grid';
      if (s.residentId === 'kagura') {
        const dv = kaguraFigurineVariantById(s.kaguraFigurineVariantId);
        detailName.textContent = dv.label;
        detailStyle.textContent = `${dv.styleLabel} · KAGURA`;
        detailDesc.textContent = dv.description;
        detailPrice.textContent = dv.priceLabel;
        detailSize.textContent = dv.sizeLabel;
        sizeRefLabel.textContent = dv.sizeLabel;
      }
      // The card that was clicked gets hidden with the grid, so move focus onto
      // the view that is now on screen rather than stranding it on a dead node.
      if (s.collectibleOpen && s.residentId === 'kagura') {
        if (s.collectibleView === 'detail' && prev.collectibleView !== 'detail') {
          requestAnimationFrame(() => detailBackBtn.focus({ preventScroll: true }));
        } else if (s.collectibleView === 'grid' && prev.collectibleView === 'detail') {
          requestAnimationFrame(() => {
            productVariants
              .querySelector<HTMLButtonElement>(
                `.collectible-card-btn[data-variant-id="${s.kaguraFigurineVariantId}"]`
              )
              ?.focus({ preventScroll: true });
          });
        }
      }
      renderCart(s);
      renderCheckout(s);
      if (
        s.bridgeBeatShown &&
        !prev.bridgeBeatShown &&
        !s.figurineOwned &&
        s.residentId === 'kagura'
      ) {
        const beat = bridgeBeatFor(s.residentId);
        if (beat) {
          bridgeBeatLine.textContent = beat.line;
          bridgeBeatCta.textContent = beat.ctaLabel;
          bridgeBeatCard.hidden = false;
        }
      }
      if (
        !bridgeBeatCard.hidden &&
        (s.figurineOwned || s.activeQuestId || s.companionMode !== 'playground' || s.residentId !== 'kagura')
      ) {
        bridgeBeatCard.hidden = true;
      }
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
        productSeries.textContent = seriesCodename(r.series);
        productHook.textContent = r.card.hook;
        waitlistResidentId = r.id;
        waitlistEmail.value = '';
        if (r.id === 'kagura') {
          productRailLabelPrimary.textContent = '3 PREMIUM EDITIONS';
          productRailLabelSecondary.textContent = '15 CM';
          productEstimateLabel.textContent = 'Giá mỗi edition';
          productEstimateValue.textContent = '6.999.000 ₫';
          productVariants.replaceChildren(
            ...KAGURA_FIGURINE_VARIANTS.map((variant, index) => {
              const selected =
                (s.figurineDisplayMode === 'premium' || s.figurineDisplayMode === 'premium-preview') &&
                variant.id === s.kaguraFigurineVariantId;
              // One click loads the real 3D edition onto the desk AND opens the
              // focused detail view; hover only lights the card up (CSS).
              return h(
                'article',
                {
                  class: `collectible-card${selected ? ' is-active' : ''}`,
                  role: 'listitem',
                  'data-variant-id': variant.id,
                },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'collectible-card-btn',
                    'data-variant-id': variant.id,
                    'data-testid': `figurine-view-${variant.id}`,
                    'aria-pressed': String(selected),
                    'aria-label': `Xem full figurine: ${variant.label}`,
                    onClick: () => {
                      actions.selectKaguraFigurineVariant(variant.id);
                      actions.viewCollectibleDetail();
                    },
                  },
                  h(
                    'span',
                    { class: 'collectible-card-image' },
                    h('img', { src: variant.previewUrl, alt: `${r.name}, ${variant.styleLabel}`, loading: index === 0 ? 'eager' : 'lazy', draggable: 'false' }),
                    h('span', { class: 'collectible-card-index' }, String(index + 1).padStart(2, '0'))
                  ),
                  h(
                    'span',
                    { class: 'collectible-card-copy' },
                    h('strong', {}, variant.label),
                    h('small', {}, variant.styleLabel),
                    h('b', {}, variant.priceLabel)
                  ),
                  h('span', { class: 'collectible-card-cue' }, 'Xem full 3D →')
                )
              );
            })
          );
        } else {
          const opening = openingVisualFor(r.id);
          productRailLabelPrimary.textContent = 'FIGURINE IN DEVELOPMENT';
          productRailLabelSecondary.textContent = 'WAITLIST ONLY';
          productEstimateLabel.textContent = 'Trạng thái';
          productEstimateValue.textContent = 'Đang lên kế hoạch';
          productVariants.replaceChildren(
            h(
              'article',
              { class: `product-variant product-variant-unavailable is-${opening.frame}`, role: 'listitem' },
              h(
                'div',
                { class: 'product-variant-select is-static' },
                h(
                  'span',
                  { class: 'product-variant-image' },
                  h('img', { src: opening.src, alt: opening.alt, loading: 'eager', draggable: 'false' }),
                  h('span', {}, '—')
                ),
                h(
                  'span',
                  { class: 'product-variant-copy' },
                  h('strong', {}, `${r.name} EDITION`),
                  h('small', {}, 'CHƯA MỞ BÁN'),
                  h('b', {}, 'ĐĂNG KÝ TRƯỚC')
                )
              ),
              waitlistForm
            )
          );
        }
        renderWaitlist(s);
        // Her name, series and one-line hook live on-screen as a headline
        // (`stageIdentity`); the old dossier card has been removed entirely.
        stageIdentityName.textContent = r.name;
        stageIdentitySeries.textContent = seriesCodename(r.series);
        stageIdentityStory.textContent = r.card.hook;
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
        for (const button of productVariants.querySelectorAll<HTMLButtonElement>('.collectible-card-btn')) {
          const active =
            (s.figurineDisplayMode === 'premium' || s.figurineDisplayMode === 'premium-preview') &&
            button.dataset.variantId === s.kaguraFigurineVariantId;
          button.closest('.collectible-card')?.classList.toggle('is-active', active);
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
