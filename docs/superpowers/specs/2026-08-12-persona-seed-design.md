# Persona Seed + Improvised Canon Ledger — Design Spec

- **Date:** 2026-08-12
- **Repo:** heymate-onboarding
- **Scope:** Replace the exhaustive authored canon in the system prompt with a small invariant **seed**, and let the model improvise the rest — recording what it invents into a per-user **canon ledger** that is retrieved back on later turns.
- **Status:** Approved in brainstorming; pending user review of this spec.
- **Related:** [2026-08-10-persona-builder-design.md](2026-08-10-persona-builder-design.md) built the user-control layer this spec widens.

## 1. Motivation

The current system prompt is measured, not estimated:

| Resident | Chars | Approx. tokens |
| --- | --- | --- |
| Kagura | 33,419 | ~10,400 |
| Rin | 33,813 | ~10,600 |
| Momo | 32,992 | ~10,300 |

That is sent on **every turn**. It is assembled by [`buildSystemPrompt()`](../../../src/chat/prompt.ts) (16 parameters, 6 sections) from roughly 6,600 lines of authored configuration.

The architecture is deliberately anti-improvisation. `prompt.ts` opens with *"Canon không bao giờ bị người dùng chỉnh sửa"*, and block 7 of the emitted prompt states *"Bốn danh sách trên là toàn bộ thế giới em biết"* — a closed world that forbids the model from inventing.

We want the inverse: a small authored seed, free model improvisation, and most persona control in the user's hands.

## 2. The cut line

**Principle: keep exactly what the figurine embodies.**

Kagura is going to be sold as a physical art object. If the model invents her from scratch, there is no single "her" to put on a shelf and the premium-edition proposition collapses. So the seed is not "the canon, but shorter" — it is *the subset a sculpt expresses*: silhouette, voice, boundaries, and the handful of facts that may never be contradicted.

If a detail is neither visible on the shelf nor something she would say in her first line, it does not belong in the seed. It belongs in the ledger, and only exists if a user draws it out.

## 3. Goals / Non-goals

**Goals**
- Per-resident seed under 3,000 characters (from ~33,400).
- Model may invent freely outside the invariant core.
- Invented facts persist per user and are retrieved on later turns.
- Widen `session.persona` authority over the outer ring.
- Ship Kagura first, behind a flag, alongside the old path.

**Non-goals**
- No change to Quest Mode content ([`quests.ts`](../../../src/config/quests.ts) stays authored).
- No deletion of existing canon files — they are demoted, not removed.
- No new model call, no new network round-trip.
- No change to the rapport/bond numeric system.

## 4. The seed

Six entries per resident, ~1,830 characters total.

| Entry | Source | Budget |
| --- | --- | --- |
| Who she is — one sentence | condensed from the `EM LÀ AI` block | ~120c |
| Silhouette | existing `keyVisual` in [`residents.ts`](../../../src/config/residents.ts), used verbatim | ~380c |
| Voice | existing block 21, already compact | ~380c |
| Boundaries | existing block 20, already compact | ~300c |
| 3–5 invariants | newly authored, distilled from old canon | ~250c |
| Reflex | existing block 1, halved | ~400c |

**Removed from the prompt — 10,285 characters:** place lists (2,891c), proper-noun law (1,304c), event history (1,522c), four-layer person-reading (2,662c), current-whereabouts (699c), old-canon exclusions (359c), pre-authored small talk (457c), answerable-world list (391c). Route machinery and the condensed rule/format blocks account for the rest.

The prompt lands at **~2,500 characters — a ~92% reduction** — against a tested ceiling of 3,000 (§8.1).

### 4.1 What is lost, stated plainly

The proper-noun law is what currently stops the model inventing. Removing it means the model *will* invent — that is the intent. The replacement is not another rule but the ledger: the first time she invents a village, it is recorded; from the next turn on that village is true **for this user**. Consistency stops being authored and starts being accumulated.

**Accepted consequence:** two users get two different Kaguras at the periphery. The core — silhouette, voice, boundaries, invariants — is identical for everyone. That core is exactly what gets cast in resin.

## 5. Ledger and write-back

### 5.1 The channel already exists

Every turn the model already emits a machine-readable trailer, stripped by [`splitModelState()`](../../../src/chat/model-response.ts) before the user sees the reply:

```text
<<state {"trust":0.00,…,"visualIntent":null}>>
```

It already carries structured, optional, nested data (`visualIntent` holds `sceneBrief` / `caption` / `confidence`). Write-back therefore needs **no new mechanism** — only a new field on an existing line. No extra call, no extra cost.

### 5.2 Type change

[`CanonLedgerEntry`](../../../src/state/store.ts) currently requires `questId` and `nodeId`, so it cannot hold anything born in free chat. Widen it rather than introducing a parallel type — conceptually it is already "what is now true for this user", and origin does not change that:

```ts
questId?: string;          // was required
nodeId?: string;           // was required
source: 'quest' | 'chat';  // new, required
```

### 5.3 Write-back contract

A new `canon` field on the `<<state>>` line, following the discipline `visualIntent` already models:

```text
"canon": null                             // most turns
"canon": [{"kind":"place","text":"…"}]    // when a new specific fact was asserted
```

- Hard cap **2 entries per turn**.
- `kind` extends the existing `CrossModeMemory` taxonomy with `place | person | object | event | habit`.
- Same redaction rules as `visualIntent`: no real names, addresses, contacts, URLs, or the visitor's secrets.

### 5.4 Retrieval budget — architectural invariant

If the whole ledger were reloaded, after ~200 turns we would rebuild the 33,000-character problem we just removed.

**The ledger is never loaded in full.** It is retrieved against the user's current message using the existing [`relevantCanonFacts()`](../../../src/config/canon-view.ts) shape, under a hard ceiling of **800 characters / 12 entries**, ranked by recency plus reference count. Entries that are never invoked sink; they are never deleted.

This ceiling is an architectural invariant, not a tuning knob. It is asserted by test (§8.2).

## 6. Two rings of control

```text
┌─ INVARIANT CORE ─────────── user cannot edit ─┐
│   silhouette · voice · boundaries · invariants│
│                                               │
│     ┌─ OUTER RING ── user + model co-author ─┐│
│     │   Persona Builder · ledger · pacing    ││
│     └────────────────────────────────────────┘│
└───────────────────────────────────────────────┘
```

The core is what gets cast, so it is the only non-negotiable part. Everything else opens up.

`PromptSession.persona` is currently documented as *"cannot alter identity or backstory"*. That restriction is relaxed **for the outer ring only**; it is restated verbatim for the core.

## 7. Migration

Nothing is deleted. The ~6,600 lines are **demoted** into `src/config/canon-archive/`, no longer imported by `prompt.ts`, retained because they are the raw material for authoring seeds and because [`quests.ts`](../../../src/config/quests.ts) (1,064 lines) remains live Quest Mode content and stays where it is.

Rollout order:

1. Author the Kagura seed only.
2. Run it behind a flag, in parallel with the old path.
3. Compare real conversation quality.
4. Only then extract Rin and Momo.

All three are never converted at once.

**Blast radius:** only 3 test files reference `buildSystemPrompt` — [`persona-prompt.test.ts`](../../../tests/chat/persona-prompt.test.ts), [`address-source.test.ts`](../../../tests/chat/address-source.test.ts), [`identity-roleplay.test.ts`](../../../tests/chat/identity-roleplay.test.ts) — 6 call sites total. The remaining suite binds to store, quest and visual behaviour, not prompt text.

## 8. Verification

Four assertions, one per place this design can rot:

1. **Seed size** — each resident's seed prompt is under 3,000 characters. Guards against re-bloat.
2. **Retrieval ceiling** — ledger contribution stays within 800 chars / 12 entries at any ledger size, including a synthetic 500-entry ledger.
3. **Core presence** — all six core entries appear in every prompt regardless of persona settings or override.
4. **Round trip** — model emits `canon` → entry is stored → entry appears in the next turn's prompt when the message references it.

Existing suite must stay green: `npm run build && npm test`.

## 9. Open risk

Kagura is currently anchored to a rights-holder's world — the prompt states she belongs to *"INUYASHA — AKAGANE"* and [`kagari-inuyasha.ts`](../../../src/config/kagari-inuyasha.ts) binds her to it. Selling premium figurines of such a character is a real legal exposure, and [`CONTEXT.md`](../../../CONTEXT.md) already carries the invariant that a World Archetype *"is not a licensed canon character"* along with the `commercialUse: false` flag.

Cutting canon down to a seed is the natural moment to cut that anchor. This spec does not decide it; it flags it as a decision that should be made before the commerce workstream ships.
