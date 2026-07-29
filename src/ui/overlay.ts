// Overlay owner: mounts one step view at a time, plus persistent chrome
// (wordmark, mute, skip-transition, error toast). Keeps the canvas dominant.

import { h } from './dom';
import type { UIActions } from './actions';
import type { AppState, Step, Store } from '../state/store';
import {
  arrivalStep,
  galleryStep,
  joinedStep,
  revealStep,
  stageStep,
  studioStep,
  type StepView,
} from './steps';
import { COPY } from '../config/copy';

export function mountUI(root: HTMLElement, store: Store, actions: UIActions): void {
  const stepHost = h('div', { class: 'step-host' });
  const skipBtn = h(
    'button',
    { class: 'btn btn-ghost skip-btn', hidden: true, onClick: () => actions.skipTransition() },
    COPY.arrival.skip
  ) as HTMLButtonElement;
  const muteBtn = h(
    'button',
    { class: 'chrome-btn mute-btn', 'aria-label': 'Bật hoặc tắt âm thanh', 'aria-pressed': 'false' },
    '♪'
  ) as HTMLButtonElement;
  muteBtn.addEventListener('click', () => {
    const muted = actions.toggleMute();
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.classList.toggle('is-muted', muted);
  });
  const toast = h('div', { class: 'toast', role: 'alert', hidden: true });
  // The balance is chrome, not conversation. It belongs with the wordmark and
  // the sound toggle, out of the way and always readable.
  const wallet = h('span', { class: 'chrome-credits', 'aria-label': 'Credit còn lại' });
  // A scene waiting is worth a dot; a scene running is worth saying so.
  const questBtn = h(
    'button',
    { class: 'chrome-btn quest-btn', 'aria-label': COPY.stage.questTitle, onClick: () => actions.openQuests() },
    '\u2726',
    h('span', { class: 'quest-dot', hidden: true, 'aria-hidden': 'true' })
  ) as HTMLButtonElement;

  root.append(
    h(
      'header',
      { class: 'chrome' },
      h('span', { class: 'wordmark' }, 'HEYMATE'),
      h('div', { class: 'chrome-right' }, wallet, questBtn, muteBtn)
    ),
    stepHost,
    skipBtn,
    toast
  );

  let currentStep: Step | null = null;
  let view: StepView | null = null;

  const factories: Record<Step, (s: AppState) => StepView> = {
    gallery: () => galleryStep(actions),
    stage: (s) => stageStep(actions, s),
    arrival: () => arrivalStep(actions),
    studio: (s) => studioStep(actions, s),
    reveal: (s) => revealStep(actions, s),
    joined: (s) => joinedStep(actions, s),
  };

  /** Chrome that follows the state rather than the step. */
  function paintChrome(state: AppState): void {
    wallet.textContent = `${state.credits} credit`;
    wallet.classList.toggle('is-low', state.credits < 20);
    wallet.hidden = state.step !== 'stage';
    questBtn.hidden = state.step !== 'stage';
    const waiting = !state.activeQuestId && !!store.nextQuest();
    questBtn.classList.toggle('is-active', !!state.activeQuestId);
    (questBtn.querySelector('.quest-dot') as HTMLElement).hidden = !waiting;
  }

  function mount(state: AppState): void {
    view?.destroy?.();
    stepHost.replaceChildren();
    view = factories[state.step](state);
    view.el.classList.add('step-enter');
    stepHost.append(view.el);
    requestAnimationFrame(() => view?.el.classList.remove('step-enter'));
    view.update?.(state, state);
    paintChrome(state);
    currentStep = state.step;
  }

  store.subscribe((state, prev) => {
    if (state.step !== currentStep) {
      mount(state);
    } else {
      view?.update?.(state, prev);
    }
    paintChrome(state);
    stepHost.classList.toggle('is-transitioning', state.transitioning);
    skipBtn.hidden = !state.transitioning;
    if (state.error) {
      toast.textContent = state.error;
      toast.hidden = false;
    } else {
      toast.hidden = true;
    }
  });

  mount(store.get());
}
