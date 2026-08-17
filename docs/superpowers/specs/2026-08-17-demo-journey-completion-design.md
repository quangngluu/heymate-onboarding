# Demo Journey Completion — Design Spec

**Date:** 2026-08-17
**Repo:** heymate-onboarding (standalone)
**Goal:** Make the full user journey feel complete end-to-end **as a pitch/vision demo** — client-only, no backend, no real payment. Every beat flows into the next with no dead-ends, ending in a *simulated* completed figurine sale.

Source audit: `my-inbox/heymates/audit-result-20260817.md`.

## Non-goals (explicitly deferred)
- Real backend / server-side order persistence / real payment gateway (deferred by user).
- i18n / multi-language (VN-only stays correct for the audience).
- Touching the legacy creator/Mate-Studio flow (left as-is, out of demo path).
- Real email sending, push notifications, accounts.

## Constraints (inherited, must hold)
- Overlays stay **full-screen, all content in-screen, no scroll** (standing user constraint).
- Must run on mid-range mobile; respect `prefers-reduced-motion` + WCAG (existing bar).
- All new copy in **Vietnamese**, matching existing tone.
- No real payment credentials collected anywhere (simulated QR only — nothing sensitive entered).
- Verification gates unchanged: `npm run typecheck`, `npm run check:release` (build + vitest + verify:canon + quest-smoke).

---

## Approach
Complete the existing free-roam companion flow **in place**; every addition is a real, shippable feature. The two presentation-critical beats — Kagura wanting her physical form, and the return-visit greeting — get **authored deterministic triggers** (not left to the LLM) so they fire reliably in a live pitch.

---

## Part 1 — Front funnel → first chat
**Problem:** 12s auto-reveal (`main.ts` handoff timer) delays the "PRESS TO TALK" hook; curious visitors can bounce before feeling companion value.

**Change:**
- Reduce the auto-reveal delay to a short beat (`EDITION_REVEAL_MS`, ~4–5s) **and** add an explicit skip/advance affordance so the user can reach chat immediately.
- No structural flow change. Teaser skip for returnees already works — keep.

**Files:** `src/main.ts` (reveal timer), possibly `src/ui/steps.ts` (skip affordance copy).

---

## Part 2 — Attachment→buy bridge (the money move)
**Insight:** Kagura's authored canon already carries the hook — her `card.promise` is *"Trở thành người khiến em muốn có một cơ thể do chính em chọn."* The figurine **is** that chosen body. Surface the latent canon; don't invent new lore.

**Change:** A one-time **authored bridge beat** delivered through the existing reward-deck / turn-cadence mechanism (`src/state/store.ts` authored reward deck), NOT via the LLM:
- Trigger: fires once when `playgroundMessageCount >= BRIDGE_TRIGGER_TURNS` (const, default 3) AND `!figurineOwned` AND not already shown. Persisted flag `bridgeBeatShown`.
- Content: an authored Kagura line about wanting to exist physically / have a chosen body, plus a CTA (*"Xem hình hài của em"*) that opens the collectible detail (`viewCollectibleDetail` / `openCollectible`).
- The existing 12s auto-reveal becomes secondary; this beat is the primary, earned entry into the shop.

**Files:** `src/state/store.ts` (trigger + flag + beat payload), `src/config/residents.ts` or a new authored-beat const (the VN line, tied to Kagura), `src/ui/steps.ts` (beat rendering + CTA wiring), `src/main.ts` (increment `playgroundMessageCount`).

---

## Part 3 — Figurine explore + simulated buy
**3a. Size reference (audit dim 6):** add a physical size cue in the premium/detail preview (e.g. a 15 CM scale marker or hand/coin silhouette overlay) so the 3D figure reads as a real object. `src/ui/steps.ts` (detail card) + `src/styles.css`.

**3b. Simulated VN payment flow** — new sub-states inside the checkout overlay, after `placeOrder`:
- State machine `paymentSim: 'idle' | 'method' | 'qr' | 'processing' | 'success'` in `Store`.
- `method`: picker — **Momo / VNPay / bank-transfer QR** (VN-authentic). User taps one → `qr`.
- `qr`: a rendered fake QR + *"Quét mã để thanh toán"* + amount (`formatVndPrice`) + a "Tôi đã thanh toán" / auto-advance.
- `processing`: *"Đang xác nhận thanh toán…"* spinner, ~2–3s (`PAYMENT_SIM_MS` const; instant under `prefers-reduced-motion`).
- `success`: transitions to Part 4 confirmation.
- Entirely client-side; **no real input fields**. Full-screen, no scroll.

**Order model:** add a paid terminal state so the demo isn't stuck at `pending-payment`. `OrderStatus = 'pending-payment' | 'paid-demo'`; simulated success sets `paid-demo`. (Honest: the value name marks it as demo.)

**Files:** `src/state/store.ts` (paymentSim state + methods + OrderStatus), `src/ui/steps.ts` (payment screens), `src/styles.css`, `src/config/economy.ts` or a consts file (timings).

---

## Part 4 — Post-purchase + return
**4a. Success/confirmation:** keep the real order id (`HM-<base36>`); on success show an in-character Kagura reaction to finally having a physical form, plus order summary. Full-screen, no scroll.

**4b. Owner state:** persisted `figurineOwned: boolean` (+ `ownedVariantId?`) in `AppState`, set on simulated success.

**4c. Owner-only return greeting:** extend the greeting selection (`main.ts:~1039-1061`, `residents.ts` greeting states) so that when `figurineOwned` on return, Kagura uses an **owner greeting** (new authored VN line for Kagura) instead of the generic `returnGreeting`. Falls back to `returnGreeting` when not owner.

**4d. Presenter replay control:** gated behind `?demo=1` query param — a small, unobtrusive control cluster (not shown to real users) with:
- **"Xem lại như người quay lại"** — re-enters the experience as a returning visitor (keeps `figurineOwned` + memories, forces the return/owner greeting path).
- **"Reset demo"** — clears demo state for a fresh run.
- Implementation: `Store` methods `replayAsReturning()` / `resetDemo()`; control rendered only when the query param is present.

**Files:** `src/state/store.ts` (owner flags, replay/reset methods), `src/main.ts` (greeting selection, query-param gate), `src/config/residents.ts` (owner greeting line), `src/ui/steps.ts` (demo control cluster), `src/styles.css`.

---

## New/changed state (Store, all persisted unless noted)
```ts
playgroundMessageCount: number   // increments per user turn in playground
bridgeBeatShown: boolean         // one-time attachment→buy beat
paymentSim: 'idle'|'method'|'qr'|'processing'|'success'  // session-only
figurineOwned: boolean
ownedVariantId?: string
// OrderStatus gains 'paid-demo'
```
Consts: `EDITION_REVEAL_MS`, `BRIDGE_TRIGGER_TURNS`, `PAYMENT_SIM_MS`.

## Data flow (happy path)
gallery → teaser → stage/showcase → **fast reveal + chat** → (≥3 turns) **bridge beat** → collectible grid → **detail (size ref)** → cart → checkout form → **method → qr → processing → success (paid-demo, figurineOwned=true)** → **confirmation (Kagura reacts)** → [presenter replay] → **owner return greeting**.

## Error / edge handling
- Payment sim has no failure path in the happy demo, but `paymentSim` resets to `idle` if the overlay is closed mid-flow (no stuck state).
- Bridge beat guarded by `bridgeBeatShown` + `!figurineOwned` so it never repeats or fires post-purchase.
- Owner greeting falls back to `returnGreeting` → `greeting` if flags/memory absent.
- `replayAsReturning` must not wipe `figurineOwned`/memories; `resetDemo` explicitly does.
- All timed transitions collapse to instant under `prefers-reduced-motion`.

## Testing / verification
- `npm run typecheck` clean.
- `npm run check:release` (build + vitest 283+ + verify:canon + quest-smoke) green; quest-smoke still asserts `horizontalOverflowPx <= 1` (no-scroll invariant) across viewports — extend/verify it covers the new payment + confirmation screens.
- Add unit coverage for the new Store transitions (bridge trigger gating, paymentSim machine, owner flag + greeting selection, replay/reset).
- Manual: user verifies the full journey on localhost before commit (local-first rule).

## Rollout
Local-first. No commit/push/deploy until the user approves on localhost. Deploy remains manual (`npm run deploy:prod`), separate step.
