# Demo Journey Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the heymate demo user-journey end-to-end (arrival → chat → attachment→buy bridge → figurine explore → *simulated* VN payment → owner confirmation → returning-owner greeting) with client-only mechanics, no backend, no real payment.

**Architecture:** Extend the existing hand-rolled `Store` (localStorage-persisted) with new session + persisted state; surface two presentation-critical beats (Kagura wanting her physical form; the returning-owner greeting) as **authored, deterministic** triggers rather than LLM-dependent turns; add a fully client-side simulated VN payment flow inside the existing checkout overlay; gate presenter-only controls behind `?demo=1`.

**Tech Stack:** Vanilla TypeScript, Three.js, Vite, vitest, Puppeteer (quest-smoke). DOM built with the `h()` helper (`src/ui/dom.ts`). State in `src/state/store.ts`.

## Global Constraints
- All overlays stay **full-screen, all content in-screen, NO scroll** — quest-smoke asserts `horizontalOverflowPx <= 1` across mobile viewports (360/390/430w). New screens must hold this.
- All new user-facing copy in **Vietnamese**, matching existing tone. dsh authors final copy; sample lines below are illustrative intent, not literal requirements.
- Respect `prefers-reduced-motion`: every timed transition collapses to instant.
- Must run on mid-range mobile (no heavy new WebGL).
- Kagura canon is LOCKED. The bridge/owner content must derive from existing canon — her `card.promise`: *"Trở thành người khiến em muốn có một cơ thể do chính em chọn."* The figurine IS that chosen body. Do not invent new lore.
- No real payment credentials or sensitive fields anywhere — simulated QR only.
- Persistence: only fields in the `persist()` allow-list (`store.ts:692-723`) survive reload; new persisted fields MUST be added there AND to the constructor restore (`store.ts:597-663`).
- Verification gates unchanged: `npm run typecheck`, `npm run check:release` (= build + vitest + verify:canon + test:quest-smoke).
- Commit frequently, one task per commit. Do NOT push or deploy (local-first; user verifies on localhost first).

---

### Task 1: Consts + state foundation

**Files:**
- Create: `src/config/demo-journey.ts`
- Modify: `src/state/store.ts` (AppState `:295-424`; initialState `:457-524`; OrderStatus `:82`; persist `:692-723`; constructor restore `:597-663`)
- Test: `tests/state/demo-journey-store.test.ts`

**Interfaces — Produces:**
```ts
// src/config/demo-journey.ts
export const EDITION_REVEAL_MS = 4500;      // was inline 12000 in main.ts:1476
export const BRIDGE_TRIGGER_TURNS = 3;      // user turns before the physical-form beat
export const PAYMENT_SIM_MS = 2400;         // simulated processing dwell
export type PaymentSimPhase = 'idle' | 'method' | 'qr' | 'processing' | 'success';
export type PaymentMethod = 'momo' | 'vnpay' | 'bank-qr';
```
New `AppState` fields:
```ts
// persisted:
figurineOwned: boolean;
ownedVariantId: KaguraFigurineVariantId | null;
bridgeBeatShown: boolean;
// session-only (NOT persisted):
paymentSim: PaymentSimPhase;
paymentMethod: PaymentMethod | null;
```
Change: `export type OrderStatus = 'pending-payment' | 'paid-demo';`

- [ ] **Step 1: Write failing test** — `tests/state/demo-journey-store.test.ts` (match pattern of `tests/state/context-visual-store.test.ts:1-30`: stub `localStorage` in `beforeEach`, `new Store()`):
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';
beforeEach(() => { const v = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem:(k:string)=>v.get(k)??null, setItem:(k:string,val:string)=>v.set(k,val) }); });
describe('demo-journey state', () => {
  it('defaults are demo-clean', () => {
    const s = new Store().get();
    expect(s.figurineOwned).toBe(false);
    expect(s.ownedVariantId).toBe(null);
    expect(s.bridgeBeatShown).toBe(false);
    expect(s.paymentSim).toBe('idle');
    expect(s.paymentMethod).toBe(null);
  });
  it('persists figurineOwned/ownedVariantId/bridgeBeatShown across reload, not paymentSim', () => {
    const a = new Store();
    a.set({ figurineOwned:true, ownedVariantId:'three-d', bridgeBeatShown:true, paymentSim:'success' });
    (a as unknown as { persist():void }).persist?.();
    const b = new Store().get();
    expect(b.figurineOwned).toBe(true);
    expect(b.ownedVariantId).toBe('three-d');
    expect(b.bridgeBeatShown).toBe(true);
    expect(b.paymentSim).toBe('idle'); // session-only resets
  });
});
```
- [ ] **Step 2: Run test, verify it fails** — `npx vitest run tests/state/demo-journey-store.test.ts` → FAIL (fields undefined).
- [ ] **Step 3: Implement** — add consts file; add the 5 AppState fields; seed them in `initialState` (`figurineOwned:false, ownedVariantId:null, bridgeBeatShown:false, paymentSim:'idle', paymentMethod:null`); widen `OrderStatus`; add `figurineOwned, ownedVariantId, bridgeBeatShown` to the `persist()` allow-list object AND restore them in the constructor loader (default to the initialState values when absent). Do NOT persist `paymentSim`/`paymentMethod`.
- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `feat(demo): add demo-journey state foundation + consts`

---

### Task 2: Front-funnel retiming

**Files:** Modify `src/main.ts:1470-1476` (auto-reveal timer in `completeCompanionHandoff`).

**Interfaces — Consumes:** `EDITION_REVEAL_MS` (Task 1).

- [ ] **Step 1:** Replace the raw `12000` literal in the `setTimeout` with `EDITION_REVEAL_MS` (import from `../config/demo-journey`). No other structural change — `enterPlayground()` (`main.ts:1480-1487`) already lets the user skip straight to chat via the `press-to-talk` button (`steps.ts:1012-1021`).
- [ ] **Step 2:** Manual/acceptance: from a fresh load, editions auto-reveal at ~4.5s, and pressing "PRESS TO TALK" before that still enters chat immediately and clears the timer.
- [ ] **Step 3: Commit** — `feat(demo): shorten edition auto-reveal to EDITION_REVEAL_MS`

---

### Task 3: Attachment→buy bridge beat

**Files:**
- Modify: `src/state/store.ts` (new `peekBridgeBeat`/`consumeBridgeBeat` near the open-chat-reward methods `:1128-1163`)
- Create: `src/chat/bridge-beat.ts` (authored beat content, Kagura-only)
- Modify: `src/main.ts` (`sendMessage` `:1635`, after user `pushTurn`) + `src/ui/steps.ts` (render the beat + CTA)
- Test: `tests/state/bridge-beat.test.ts`

**Interfaces — Produces:**
```ts
// src/chat/bridge-beat.ts
export interface BridgeBeat { id: string; residentId: 'kagura'; line: string; ctaLabel: string; }
export function bridgeBeatFor(residentId: string): BridgeBeat | null;
// src/state/store.ts
peekBridgeBeat(): BridgeBeat | null;   // returns beat when eligible, else null
consumeBridgeBeat(): void;             // sets bridgeBeatShown = true, persists
```
**Eligibility (peekBridgeBeat):** returns `bridgeBeatFor(residentId)` only when ALL hold — `residentId === 'kagura'`, `companionMode === 'playground'`, `!activeQuestId`, `!figurineOwned`, `!bridgeBeatShown`, and `turns >= BRIDGE_TRIGGER_TURNS`. Otherwise `null`. (`turns` is bumped per user turn inside `pushTurn`, `store.ts:982-998`.)

**Content (dsh authors final VN; intent + canon-anchored):** one Kagura line that voices wanting to exist in a body she chose (tie to `card.promise`), ending with a CTA to see her physical form. Illustrative: line ≈ *"…em muốn tồn tại thật. Một hình hài do chính em chọn. Anh xem thử được không?"*, `ctaLabel` ≈ *"Xem hình hài của em"*.

- [ ] **Step 1: Write failing test** (`tests/state/bridge-beat.test.ts`):
```ts
it('fires once for kagura after BRIDGE_TRIGGER_TURNS in playground, never after owning', () => {
  const s = new Store();
  s.set({ companionMode:'playground', turns: 3 }); // kagura is default resident
  expect(s.peekBridgeBeat()?.residentId).toBe('kagura');
  s.consumeBridgeBeat();
  expect(s.get().bridgeBeatShown).toBe(true);
  expect(s.peekBridgeBeat()).toBe(null);           // one-shot
});
it('does not fire before threshold, outside playground, or when owned', () => {
  const s = new Store();
  s.set({ companionMode:'playground', turns: 2 }); expect(s.peekBridgeBeat()).toBe(null);
  s.set({ companionMode:'showcase', turns: 5 });   expect(s.peekBridgeBeat()).toBe(null);
  s.set({ companionMode:'playground', turns: 5, figurineOwned:true }); expect(s.peekBridgeBeat()).toBe(null);
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — `bridge-beat.ts` (author the Kagura beat), the two Store methods (model on `peekOpenChatReward`/`consumeOpenChatReward` shape, `store.ts:1128-1163`), and wire into `sendMessage` (`main.ts:~1651`, right after the user `pushTurn`): after the assistant reply settles, call `store.peekBridgeBeat()`; if non-null, surface the beat (an in-dock authored line + a CTA button) and `store.consumeBridgeBeat()`. The CTA `onClick` calls `actions.openCollectible()` then `actions.viewCollectibleDetail()`. Render via `h()` in `steps.ts`, testid `'bridge-beat-cta'`. No horizontal overflow.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat(demo): authored attachment→buy bridge beat`

---

### Task 4: Figurine size reference in detail preview

**Files:** Modify `src/ui/steps.ts` (collectible detail face, near `:839-952`) + `src/styles.css`.

- [ ] **Step 1:** Add a size-reference cue to the detail/premium preview: a labelled scale marker reading the variant `sizeLabel` (e.g. "15 CM") positioned beside the 3D figure, testid `'figurine-size-ref'`. Keep it CSS-only (no new WebGL). Must not introduce horizontal scroll at 360w.
- [ ] **Step 2:** Acceptance: in collectible detail, the "15 CM" marker is visible against the figure; layout holds at 360/390/430w.
- [ ] **Step 3: Commit** — `feat(demo): size reference in figurine detail`

---

### Task 5: Simulated payment state machine (Store)

**Files:** Modify `src/state/store.ts` (payment methods; extend `placeOrder` path); Test `tests/state/payment-sim.test.ts`.

**Interfaces — Produces:**
```ts
beginPayment(): void;                       // idle -> method  (requires an order just placed / cart flow)
choosePaymentMethod(m: PaymentMethod): void;// method -> qr, sets paymentMethod
confirmPaymentSent(): void;                 // qr -> processing
completePaymentSim(): void;                 // processing -> success; marks latest order 'paid-demo'; sets figurineOwned + ownedVariantId
cancelPaymentSim(): void;                   // any -> idle, paymentMethod=null (no stuck state)
```
`completePaymentSim` sets the most-recent order's `status='paid-demo'`, `figurineOwned=true`, `ownedVariantId` = that order's (single) item variantId, and persists.

- [ ] **Step 1: Write failing test** (`tests/state/payment-sim.test.ts`):
```ts
it('runs method→qr→processing→success and marks order paid-demo + ownership', () => {
  const s = new Store();
  s.addFigurineToCart('kagura','three-d');
  const order = s.placeOrder({ name:'A', phone:'0900', email:'a@b.c', address:'HN' });
  expect(order?.status).toBe('pending-payment');
  s.beginPayment();            expect(s.get().paymentSim).toBe('method');
  s.choosePaymentMethod('momo'); expect(s.get().paymentSim).toBe('qr'); expect(s.get().paymentMethod).toBe('momo');
  s.confirmPaymentSent();      expect(s.get().paymentSim).toBe('processing');
  s.completePaymentSim();      expect(s.get().paymentSim).toBe('success');
  expect(s.get().figurineOwned).toBe(true);
  expect(s.get().ownedVariantId).toBe('three-d');
  expect(s.get().orders.at(-1)?.status).toBe('paid-demo');
});
it('cancel resets to idle with no stuck state', () => {
  const s = new Store(); s.set({ paymentSim:'qr', paymentMethod:'vnpay' });
  s.cancelPaymentSim(); expect(s.get().paymentSim).toBe('idle'); expect(s.get().paymentMethod).toBe(null);
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the five methods (session `set` for phase transitions; `completePaymentSim` also persists ownership + order status). `addFigurineToCart`/`placeOrder` already exist (`store.ts:740-762, 816-832`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat(demo): simulated payment state machine`

---

### Task 6: Payment UI screens

**Files:** Modify `src/ui/steps.ts` (checkout overlay, `:750-810`), `src/styles.css`, `src/main.ts` (processing→success timer).

**Interfaces — Consumes:** payment methods (Task 5), `PAYMENT_SIM_MS` (Task 1).

- [ ] **Step 1:** After checkout-form submit (which calls `placeOrder`), instead of jumping straight to confirmation, drive the payment faces off `s.paymentSim` inside the same full-screen checkout scrim:
  - `method`: three buttons — Momo / VNPay / Chuyển khoản QR (testids `'pay-momo'`,`'pay-vnpay'`,`'pay-bank-qr'`), each → `actions.choosePaymentMethod(...)`.
  - `qr`: a rendered placeholder QR block + *"Quét mã để thanh toán"* + amount via `formatVndPrice(order.subtotalVnd)` + button *"Tôi đã thanh toán"* (testid `'pay-confirm-sent'`) → `actions.confirmPaymentSent()`. **No real input fields.**
  - `processing`: spinner + *"Đang xác nhận thanh toán…"*.
  - Wire the CTA delegates in `main.ts` (App implements UIActions) and `src/ui/actions.ts` interface: `beginPayment`, `choosePaymentMethod`, `confirmPaymentSent`, `cancelPaymentSim`.
- [ ] **Step 2:** In `main.ts`, when `paymentSim` becomes `'processing'`, start `setTimeout(() => store.completePaymentSim(), PAYMENT_SIM_MS)` (instant when `prefers-reduced-motion`). Clear the timer if `cancelPaymentSim` fires.
- [ ] **Step 3:** Style all faces full-screen, centered, **no scroll** at 360/390/430w.
- [ ] **Step 4:** Acceptance + smoke: walk cart→checkout→method→qr→processing→success with no horizontal overflow.
- [ ] **Step 5: Commit** — `feat(demo): simulated VN payment screens`

---

### Task 7: Post-purchase confirmation + Kagura reaction

**Files:** Modify `src/ui/steps.ts` `renderCheckout` (`:999-1010`).

- [ ] **Step 1:** When `paymentSim==='success'` (or order status `paid-demo`), the confirmation shows: order id (`checkoutOrder.id`), item + `formatVndPrice`, a **PAID (DEMO)** status label instead of `PENDING PAYMENT`, and an in-character Kagura reaction to finally having a physical form (dsh authors final VN; intent: gratitude + "giờ em có một hình hài thật", canon-anchored). Full-screen, no scroll.
- [ ] **Step 2:** Acceptance: after success, confirmation renders the paid state + Kagura line; layout holds at 360w.
- [ ] **Step 3: Commit** — `feat(demo): paid confirmation + Kagura reaction`

---

### Task 8: Owner-only return greeting

**Files:** Modify `src/config/residents.ts` (add `ownerGreeting` to Kagura; optional field on `ResidentConfig`), `src/chat/engine.ts` (`openingLine` `:274-288`), `src/main.ts` (`greet` `:1031-1063`), and the canon-view path (`src/config/canon-view.ts`) so `ownerGreeting` flows through like other greetings. Test `tests/chat/owner-greeting.test.ts`.

**Interfaces — Produces:** `openingLine(view, memories, address, revealed, route, owned: boolean)` — when `owned && view.ownerGreeting`, returns the owner greeting (highest priority); else falls back to existing greeting/closeGreeting/returnGreeting logic.

- [ ] **Step 1: Write failing test** — assert `openingLine(view, memories, addr, revealed, route, true)` returns the owner greeting when present, and falls back when `owned=false` or `ownerGreeting` absent.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — add optional `ownerGreeting?: string` to `ResidentConfig`, author Kagura's line (canon: she now exists physically because he chose her body), thread it through `canonViewFor`, add the `owned` param to `openingLine`, and in `main.ts greet()` pass `store.get().figurineOwned`. Keep the duplicated rule in `src/chat/prompt.ts:78-82` consistent if it participates in greeting selection.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat(demo): owner-only return greeting`

---

### Task 9: Presenter replay control (`?demo=1`)

**Files:** Modify `src/state/store.ts` (`replayAsReturning`, `resetDemo`), `src/main.ts` (query-param gate + call greet after replay), `src/ui/steps.ts` (control cluster), `src/styles.css`. Test `tests/state/demo-controls.test.ts`.

**Interfaces — Produces:**
```ts
replayAsReturning(): void; // keep persisted (figurineOwned, ownedVariantId, transcripts, orders, credits...);
                           // reset session view to a returning entry: waifuUniverseEntered=true, step='stage',
                           // companionMode='showcase', figurineDisplayMode='original', chat=[], collectibleOpen=false,
                           // checkoutOpen=false, paymentSim='idle'
resetDemo(): void;         // reset ENTIRE store to a fresh visitor (initialState) and persist (clears ownership/bridge/orders)
```
- [ ] **Step 1: Write failing test** — `replayAsReturning` preserves `figurineOwned=true` + `ownedVariantId` while clearing `chat`; `resetDemo` returns `figurineOwned` to false and empties `orders`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the two Store methods. In `main.ts`, read `new URLSearchParams(location.search).get('demo') === '1'`; only then render the control cluster and, after `replayAsReturning()`, call `this.greet()` so the owner/return greeting fires. Cluster (testid `'demo-controls'`): buttons *"Xem lại như người quay lại"* (`'demo-replay-returning'`) and *"Reset demo"* (`'demo-reset'`). Cluster is NOT rendered without `?demo=1`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat(demo): presenter replay controls behind ?demo=1`

---

### Task 10: Verification pass

**Files:** possibly `scripts/quest-phase2-smoke.mjs` (extend to exercise new full-screen overlays).

- [ ] **Step 1:** `npm run typecheck` → clean.
- [ ] **Step 2:** `npm test` → all green (existing 283 + new tests).
- [ ] **Step 3:** Extend `scripts/quest-phase2-smoke.mjs` to drive the new happy path (open collectible → detail → add to cart → checkout → method → qr → processing → success → confirmation) and assert `horizontalOverflowPx <= 1` on the payment + confirmation screens across all three viewports. Keep existing assertions intact.
- [ ] **Step 4:** `npm run check:release` → green (build + test + verify:canon + quest-smoke).
- [ ] **Step 5:** Hand back to user for localhost verification of the full journey BEFORE any commit-to-main/deploy. Do not push or deploy.
- [ ] **Step 6: Commit** — `test(demo): extend quest-smoke to payment + confirmation`

---

## Self-review notes
- **Spec coverage:** Part1→T2; Part2→T3; Part3(size)→T4, (payment)→T5+T6; Part4(confirm)→T7,(owner greeting)→T8,(replay)→T9; state foundation→T1; verification→T10. All spec sections mapped.
- **Type consistency:** `PaymentSimPhase`/`PaymentMethod` defined in T1, consumed in T5/T6; `OrderStatus` widened in T1, used in T5/T7; `figurineOwned`/`ownedVariantId`/`bridgeBeatShown` defined T1, used T3/T5/T8/T9; `openingLine(...owned)` signature defined T8 and consumed only there.
- **Persistence:** T1 explicitly adds the 3 new persisted fields to BOTH `persist()` and constructor restore; `paymentSim`/`paymentMethod` deliberately session-only (verified by T1 reload test).
