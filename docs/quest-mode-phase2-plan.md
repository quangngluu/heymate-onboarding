# Quest Mode Phase 2 — Execution Plan

**Status:** draft for Claude review

**Slice:** Rin / Frame 12 on `?canon=sao`

**Goal:** turn Prototype 1 into a playable acting-system vertical slice without
changing the production default or re-platforming away from Three.js.

Detailed schemas, validator rules, asset notes, camera geometry, latency design
and the full test matrix are retained in the
[technical appendix](./quest-mode-phase2-technical-appendix.md). This document is
the execution contract.

## 1. Context to hold

### Already shipped

- Quest choices are flexible lists and free-form actions resolve locally into an
  authored consequence.
- Open Chat transcripts, Quest transcripts, canon ledger and approved cross-mode
  memories are separate stores.
- Resident memory content is named `canonReveals`; playable chapters are
  `questEpisodes`.
- Rin Prototype 1 already has Episode 0 timing, the first Episode 1 branch,
  immediate visual mutations, checkpoints and the isolated `sao` route.
- Quest uses the existing Three.js stage. Do not introduce Live2D.

### Current gap

| Need | Current code | Phase 2 result |
|---|---|---|
| Character acting | No `AnimationMixer` pipeline | Clip registry + actor rig + beat driver |
| Beat contract | `QuestThresholdBeat` only | Additive `SceneBeat` DSL |
| Current/archived Rin | Static silhouette treatment | Two presentations using one rig and two timing profiles |
| Portrait grammar | Five landscape-derived quest cameras | Portrait presets + safe-area validation |
| Resilience | Visual/TTS fallbacks exist ad hoc | One validated fallback ladder |
| Automated checks | No test runner in `package.json` | Vitest contract tests + browser smoke |

### Locked constraints

- `DEFAULT_ROUTE` remains `hub`; Phase 2 is reachable only through
  `?canon=sao`.
- Existing Hub and Open Chat behavior must remain unchanged.
- Beat 0 is authored and local. Scene entry never waits for LLM, TTS or image
  generation.
- User action changes visual state and writes canon before adaptive dialogue is
  requested.
- AI may select validated enums and wording only. It may not emit coordinates,
  animation data or scene structure.
- Missing animation, facial rig, TTS or generated art must degrade without
  blocking the story.

## 2. Definition of done

Phase 2 is complete only when one mobile-first run proves all of the following:

1. Gallery → Rin → Quest transition works on `?canon=sao`; Kagura and Momo are
   hidden during Quest.
2. Episode 0 and the first five minutes of Episode 1 run through the new beat
   driver.
3. Rin and archived Rin share one rig but have visibly different timing; the
   measured head/hip timing delta is at least 80 ms.
4. The player can interrupt an allowed beat; protected beats reject interruption
   and continue deterministically.
5. One free-form action resolves locally, applies a visible mutation and writes
   the correctly typed canon entry within 800 ms, before any network response.
6. Faces, mutations, subtitles and objectives do not overlap at 360, 390 and
   430 px viewport widths.
7. Warm scene entry reaches its first authored audio/visual beat at p90 ≤ 1.2 s.
8. Removing one clip, facial morphs or TTS does not crash or stall the scene.
9. Quest receives no raw Open Chat transcript; returning to Open Chat receives
   only approved cross-mode memory.
10. Typecheck, unit/contract tests, production build and the scripted mobile
    smoke test all pass.

## 3. Execution order

Each work package must end green before the next begins. Keep commits split by
work package so Claude can review or revert them independently.

| WP | Outcome | Depends on | Review gate |
|---|---|---|---|
| 0 | Freeze contracts and add test harness | — | Existing runtime unchanged |
| 1 | Scene DSL and validator | 0 | Invalid scenes fail before execution |
| 2 | Portrait camera and staging | 1 | Safe at 360/390/430 px |
| 3 | Rig, clips and acting runtime | 1 | Motion/fallback tests pass |
| 4 | Beat driver and dual Rin | 2, 3 | Timing, interruption and latency pass |
| 5 | Frame 12 migration | 4 | Full vertical slice playable |
| 6 | Regression, hardening and flagged release | 5 | All definition-of-done checks pass |

### WP0 — Baseline and test harness

- Record a before-state screen capture and timing sample for `?canon=sao`.
- Add Vitest contract tests and a Puppeteer smoke script for 360 × 800,
  390 × 844 and 430 × 932.
- Turn V1–V15 from the appendix into named test cases before runtime work.

**Touch:** `package.json`, lockfile, `tests/quest/`,
`scripts/quest-phase2-smoke.mjs`.

**Gate:** `npm run typecheck && npm test && npm run build`; no production
behavior changes.

### WP1 — Scene contract and deterministic validation

- Add `SceneBeat`, `PlayerWindow`, `SceneOutcome`, semantic `StagingSlot`,
  `SafeAreaRequirement`, motion/expression tags and typed prop ids.
- Keep `QuestNode.choices`, `freeform` and existing Phase 1 quest data valid.
- Let nodes opt into `beats`, `playerWindows` and `outcomes`; do not migrate all
  quests.
- Implement validator modes:
  - `authoring`: throw on invalid authored content.
  - `runtime`: apply a logged, deterministic fallback.
- Block only missing required props and invalid canon entries. Other failures
  degrade according to the appendix.

**Touch:** new `src/config/scene-dsl.ts` and
`src/config/scene-validator.ts`; modify `src/config/quests.ts`; add
`tests/quest/scene-dsl.test.ts`.

**Gate:** existing quest config loads without edits; V1–V15 each have a pass
case and failure/fallback case; AI-shaped data cannot bypass validation.

### WP2 — Portrait camera and semantic staging

- Add `single-medium`, `single-close`, `object-pov`, `user-pov`,
  `tight-ots`, `two-shot-brief` and `mutation-focus`.
- Define world coordinates once per semantic staging slot; scene data never
  contains raw XYZ values.
- Project the active subject to viewport space and validate it against visible
  subtitle, objective and HUD rectangles.
- On widths below 360 px, replace two-shots with cuts to `single-medium`.
- Never hide the Quest exit affordance.

**Touch:** new `src/config/staging.ts`; modify `src/config/cameras.ts`,
`src/config/scene-validator.ts` and `src/ui/steps.ts`.

**Gate:** projection passes at all three target widths; `mutation-focus` is
readable and subtitle-free; `two-shot-brief` is ≤4 seconds and carries no
decision.

### WP3 — Asset gate and acting runtime

**Asset gate**

The placeholder described in the appendix (`Rig_model__mia_`) is not currently
in this repository. Before this WP:

1. identify its source and license;
2. commit a web-loadable `.glb`, not an orphan `.bin`;
3. document skeleton, animation and morph-target capabilities;
4. keep it development-only and label it clearly as not Rin.

Do not block WP0–WP2 on this asset. Do not start production facial/lip-sync work
with it: the inspected placeholder has no finger bones, morph targets or
visemes.

- Build `ClipRegistry`, `ActorRig` and `BeatDriver` on `AnimationMixer`.
- Load eight minimum clips: neutral/guarded idle, walk, stop-turn, step toward,
  step back, explain gesture and head tilt.
- Use 120–400 ms crossfades and one cancellation path for beat change and player
  interruption.
- Add bounded neck/head look-at after mixer updates.
- Provide no-op facial and lip-sync drivers until a capable Rin rig exists.
- Implement the fallback ladder:
  character clip → shared clip → idle/look-at → camera/VFX/subtitle → still.

**Touch:** new `src/three/acting.ts`; modify `src/three/waifu-stage.ts`; add the
development asset under `public/assets/quest/` and
`tests/quest/acting.test.ts`.

**Gate:** eight clips register with required bones; crossfade never reaches
total action weight zero; missing clips and zero-morph rigs degrade without
throwing.

### WP4 — Beat orchestration and the current/archive split

- Replace the threshold-only timer path with `BeatDriver` for opted-in nodes;
  retain the old path for unmigrated quests.
- Reuse `speechToken` cancellation semantics for speech and motion.
- Prepare beat N+1 at `durationMs - 1,200 ms`; if preparation misses, play the
  authored line.
- Instantiate current and archived Rin from the same rig and clips:
  - current Rin: hesitation, incomplete motion, micro-variation and user look-at;
  - archived Rin: fixed timing, complete motion and scripted gaze.
- Preserve `questTimers` cleanup and cancel all pending work on exit.

**Touch:** modify `src/main.ts` and `src/three/acting.ts`; touch
`src/state/store.ts` only if checkpoint shape must widen.

**Gate:** allowed interruption cancels the next beat and plays its authored
response; protected interruption preserves the clock; motion delta is ≥80 ms
with archived repeat variance 0; cold adaptive work cannot delay beat 0.

**Review stop:** pause here for Claude. At this point the architecture, timing
identity and failure behavior are testable before narrative migration.

### WP5 — Migrate only Rin / Frame 12

- Author six scenes: Archive Threshold, First Inspection, Enter or Refuse,
  Desynchronisation, Boundary Conflict and Frame 12 Decision.
- Use the existing four core voice lines for Episode 0.
- Add one free-form window with deterministic families and fallback.
- Apply mutation and canon locally before requesting adaptive wording/TTS.
- Use generated scene art only as an optional enhancement after the geometry
  mutation is visible.
- Keep all new content behind `?canon=sao`.

**Touch:** new `src/config/rin-frame12.ts`; modify `src/config/quests.ts`,
`src/main.ts` and `src/ui/steps.ts`.

**Gate:** uninterrupted, interrupted and free-form paths complete; re-entry
resumes without auto-selection; every decision writes typed canon and shows a
mutation.

### WP6 — Hardening and flagged release

- Run mobile smoke at 360, 390 and 430 px with touch input.
- Inject failures for clip, morph set, TTS, adaptive text and generated image.
- Probe Open Chat/Quest memory isolation in both directions.
- Capture p50/p90 scene-entry and input-to-mutation timing.
- Deploy a preview for Claude/K review. Do not promote and do not change
  `DEFAULT_ROUTE` in this phase.

**Final gate:**

```bash
npm run typecheck
npm test
npm run build
npm run test:quest-smoke
git diff --check
```

Release only when the implementation notes contain evidence for all ten
definition-of-done items.

## 4. Explicitly deferred

- Final Rin character model, production facial acting and lip sync.
- Any Live2D migration.
- Kagura or Momo Quest migration.
- New environment/image-generation pipeline.
- Production default-route switch.
- Broad rewrite of Hub or Open Chat.
- Final narrative expansion beyond the Frame 12 slice.

These are not silent omissions. Each needs its own asset, narrative or rollout
decision after this vertical slice proves the runtime.

## 5. Claude review request

Claude should return one of `APPROVE`, `APPROVE WITH CHANGES` or `BLOCK`, with
comments limited to:

1. Is the WP dependency order correct and independently revertible?
2. Is the DSL the smallest additive contract needed for this slice?
3. Are V1–V15 fallbacks deterministic and safe?
4. Is the placeholder asset gate sufficient for provenance and capability?
5. Can every definition-of-done item be demonstrated by a named test or probe?
6. Is any task accidentally changing production canon, the Hub default or
   Open Chat behavior?

Any requested change must name the WP, file and failed acceptance criterion.
Narrative copy review is out of scope for this pass.
