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
    { class: 'chrome-btn mute-btn', 'aria-label': 'Toggle sound', 'aria-pressed': 'false' },
    '♪'
  ) as HTMLButtonElement;
  muteBtn.addEventListener('click', () => {
    const muted = actions.toggleMute();
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.classList.toggle('is-muted', muted);
  });
  const toast = h('div', { class: 'toast', role: 'alert', hidden: true });

  root.append(
    h('header', { class: 'chrome' }, h('span', { class: 'wordmark' }, 'HEYMATE'), muteBtn),
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

  function mount(state: AppState): void {
    view?.destroy?.();
    stepHost.replaceChildren();
    view = factories[state.step](state);
    view.el.classList.add('step-enter');
    stepHost.append(view.el);
    requestAnimationFrame(() => view?.el.classList.remove('step-enter'));
    view.update?.(state, state);
    currentStep = state.step;
  }

  store.subscribe((state, prev) => {
    if (state.step !== currentStep) {
      mount(state);
    } else {
      view?.update?.(state, prev);
    }
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
