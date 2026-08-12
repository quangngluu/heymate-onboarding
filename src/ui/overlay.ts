// Overlay owner: mounts one step view at a time, plus persistent chrome
// (wordmark, mute, skip-transition, error toast). Keeps the canvas dominant.

import { h } from './dom';
import type { UIActions } from './actions';
import { availableCredits, type AppState, type Step, type Store } from '../state/store';
import {
  arrivalStep,
  galleryStep,
  joinedStep,
  revealStep,
  stageStep,
  type StepView,
} from './steps';
import { COPY } from '../config/copy';
import { COST, CREDIT_CATALOG, CREDIT_LABEL, type Spend } from '../config/economy';
import { resolveCanonRoute } from '../config/canon-route';
import { worldformStep } from '../worldform/ui/step';

/**
 * Which build and canon layer this page is actually running.
 *
 * A tab kept serving a superseded bundle for hours after a redeploy during QA,
 * and the resulting report described a bug that had already been fixed — the
 * asset URL 404ed while the loaded page kept working from memory. There was no
 * way to ask the page what it was. Now there is: `__HEYMATE__` in the console,
 * always, costing nothing.
 *
 * Since the v3 cutover made `resolveCanonRoute()` one-way, the route is no
 * longer ambiguous — the build is the part still worth stamping.
 */
function publishBuildStamp(): void {
  const stamp = {
    build: import.meta.env.VITE_BUILD_ID ?? 'dev',
    route: resolveCanonRoute(),
  };
  (window as unknown as { __HEYMATE__?: typeof stamp }).__HEYMATE__ = stamp;
}

/**
 * The same stamp, on screen, only behind `?debug`.
 *
 * Ordinary visitors never see it; a tester checking "am I on the build I just
 * deployed" does not have to open a console on a phone.
 */
function buildStampBadge(): HTMLElement[] {
  let debug = false;
  try {
    debug = new URLSearchParams(window.location.search).has('debug');
  } catch {
    return [];
  }
  if (!debug) return [];

  const { build, route } = (window as unknown as { __HEYMATE__: { build: string; route: string } })
    .__HEYMATE__;
  return [
    h(
      'span',
      { class: 'route-badge', role: 'status', title: 'Canon route · build' },
      `${route.toUpperCase()} · ${String(build).slice(0, 7)}`
    ),
  ];
}

export function mountUI(root: HTMLElement, store: Store, actions: UIActions): void {
  publishBuildStamp();
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
  const walletBalance = h('span');
  const walletDelta = h('span', { class: 'credit-delta', hidden: true });
  const wallet = h(
    'button',
    {
      class: 'chrome-credits',
      'aria-label': 'Mở ví credit',
      'aria-expanded': 'false',
      onClick: () => actions.openWallet(),
    },
    walletBalance,
    walletDelta
  ) as HTMLButtonElement;
  // A scene waiting is worth a dot; a scene running is worth saying so.
  const questBtn = h(
    'button',
    {
      class: 'chrome-btn quest-btn',
      'data-testid': 'quest-hub-open',
      'aria-label': COPY.stage.questTitle,
      onClick: () => actions.openQuests(),
    },
    '\u2726',
    h('span', { class: 'quest-dot', hidden: true, 'aria-hidden': 'true' })
  ) as HTMLButtonElement;

  const walletSheetBalance = h('strong', { class: 'wallet-balance' });
  const walletLedger = h('div', { class: 'wallet-ledger' });
  const redeemInput = h('input', {
    type: 'text',
    class: 'name-input',
    placeholder: COPY.stage.walletRedeem,
    'aria-label': COPY.stage.walletRedeem,
    maxlength: '16',
  }) as HTMLInputElement;
  const redeemNote = h('p', { class: 'hint faint wallet-redeem-note', role: 'status' });
  const redeem = () => {
    const result = actions.redeemCredits(redeemInput.value);
    const ok = result === 'ok';
    redeemNote.textContent = ok ? COPY.stage.walletRedeemOk : COPY.stage.walletRedeemBad;
    redeemNote.classList.toggle('is-good', ok);
    if (ok) redeemInput.value = '';
  };
  redeemInput.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') redeem();
  });
  const walletSheet = h(
    'div',
    {
      class: 'modal-scrim wallet-scrim',
      hidden: true,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': COPY.stage.walletTitle,
      onClick: (event: Event) => {
        if (event.target === event.currentTarget) actions.closeWallet();
      },
    },
    h(
      'aside',
      { class: 'panel wallet-sheet' },
      h(
        'div',
        { class: 'row sheet-head' },
        h('div', {}, h('p', { class: 'kicker' }, 'Số dư dùng chung'), h('h2', { class: 'panel-title' }, COPY.stage.walletTitle)),
        h('button', { class: 'chrome-btn', 'aria-label': 'Đóng ví', onClick: () => actions.closeWallet() }, '×')
      ),
      h('div', { class: 'wallet-total' }, walletSheetBalance, h('span', {}, 'credit')),
      h(
        'div',
        { class: 'wallet-catalog', 'aria-label': 'Bảng giá credit' },
        ...CREDIT_CATALOG.map((item) =>
          h(
            'div',
            { class: 'wallet-price-row' },
            h('span', {}, item.label),
            h('strong', {}, `${item.price} credit`)
          )
        )
      ),
      h('div', { class: 'wallet-redeem' },
        h('h3', { class: 'group-label' }, 'Nạp bằng mã'),
        h('div', { class: 'chat-row' }, redeemInput, h('button', { class: 'btn btn-secondary', onClick: redeem }, COPY.stage.walletRedeemCta)),
        redeemNote
      ),
      h('div', { class: 'wallet-history-head' }, h('h3', { class: 'group-label' }, 'Giao dịch gần đây')),
      walletLedger
    )
  );

  const brokeCopy = h('p', { class: 'hint' });
  const insufficientSheet = h(
    'div',
    {
      class: 'modal-scrim credit-error-scrim',
      hidden: true,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Không đủ credit',
      onClick: (event: Event) => {
        if (event.target === event.currentTarget) actions.dismissCreditError();
      },
    },
    h(
      'div',
      { class: 'panel credit-error-sheet' },
      h('p', { class: 'kicker' }, 'Cần thêm credit'),
      h('h2', { class: 'panel-title' }, 'Chưa đủ để tiếp tục'),
      brokeCopy,
      h(
        'div',
        { class: 'row credit-error-actions' },
        h('button', { class: 'btn btn-ghost', onClick: () => actions.dismissCreditError() }, 'Để sau'),
        h('button', {
          class: 'btn btn-primary',
          onClick: () => {
            actions.dismissCreditError();
            actions.openWallet();
          },
        }, 'Mở ví')
      )
    )
  );

  root.append(
    h(
      'header',
      { class: 'chrome' },
      h('div', { class: 'chrome-left' }, h('span', { class: 'wordmark' }, 'HEYMATE'), ...buildStampBadge()),
      h('div', { class: 'chrome-right' }, wallet, questBtn, muteBtn)
    ),
    stepHost,
    skipBtn,
    toast,
    walletSheet,
    insufficientSheet
  );

  let currentStep: Step | null = null;
  let view: StepView | null = null;
  let lastTransactionId = '';

  const factories: Record<Step, (s: AppState) => StepView> = {
    gallery: () => galleryStep(actions),
    stage: (s) => stageStep(actions, s),
    arrival: () => arrivalStep(actions),
    studio: (s) => worldformStep(actions, s),
    reveal: (s) => revealStep(actions, s),
    joined: (s) => joinedStep(actions, s),
  };

  /** Chrome that follows the state rather than the step. */
  function paintChrome(state: AppState): void {
    const balance = availableCredits(state);
    walletBalance.textContent = `${balance} credit`;
    wallet.classList.toggle('is-low', balance < 20);
    wallet.hidden = state.step !== 'stage' || !!state.activeQuestId;
    wallet.setAttribute('aria-expanded', String(state.walletOpen));
    questBtn.hidden = state.step !== 'stage' || !!state.activeQuestId;
    const waiting = !state.activeQuestId && !!store.nextQuest();
    questBtn.classList.toggle('is-active', !!state.activeQuestId);
    (questBtn.querySelector('.quest-dot') as HTMLElement).hidden = !waiting;
    (walletSheet as HTMLElement).hidden = !state.walletOpen;
    walletSheetBalance.textContent = String(balance);
    walletLedger.replaceChildren(
      ...(state.transactions.length
        ? [...state.transactions].reverse().slice(0, 8).map((transaction) =>
            h(
              'div',
              { class: 'wallet-ledger-row' },
              h('span', {}, CREDIT_LABEL[transaction.feature]),
              h(
                'strong',
                { class: transaction.kind === 'earn' ? 'is-earned' : 'is-spent' },
                `${transaction.kind === 'earn' ? '+' : '−'}${transaction.amount}`
              )
            )
          )
        : [h('p', { class: 'hint faint wallet-empty' }, 'Chưa có giao dịch nào.')])
    );
    const latest = state.transactions[state.transactions.length - 1];
    if (latest && latest.id !== lastTransactionId) {
      lastTransactionId = latest.id;
      walletDelta.textContent = `${latest.kind === 'earn' ? '+' : '−'}${latest.amount}`;
      walletDelta.classList.toggle('is-earned', latest.kind === 'earn');
      walletDelta.hidden = false;
      window.setTimeout(() => {
        walletDelta.hidden = true;
      }, 1600);
    }
    const broke = state.broke as Spend | null;
    (insufficientSheet as HTMLElement).hidden = !broke;
    if (broke) {
      brokeCopy.textContent = `${CREDIT_LABEL[broke]} cần ${COST[broke]} credit; anh đang có ${balance}.`;
    }
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
