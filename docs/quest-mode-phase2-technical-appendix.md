# Quest Mode — Phase 2 Technical Appendix

**Scope:** Rin / Frame 12 vertical slice, route `sao`. Reviewable plan only — no
animation runtime written, no production deploy, `DEFAULT_ROUTE` unchanged at
`hub`, legacy Hub implementation untouched behind the explicit `hub` route.

**Measured baseline this plan is built on:**

| Fact | Value | Source |
|---|---|---|
| Animation pipeline | **does not exist** | 0 refs to `AnimationMixer` / `SkinnedMesh` / `clipAction` in `src/three` |
| Current resident sculpts | 0 skins, 0 joints, ~482k tris | GLB header parse |
| Placeholder rig | 22 joints, **no fingers**, **0 blendshapes**, 94k tris, 1 material | GLB header parse |
| Camera presets | 5, landscape-derived | `config/cameras.ts` |
| TTS first audio | 0.5–1 s warm, 2–3 s cold edge | production probe |
| Mobile speech column | 56 % width, ≈62 % of a 390 px screen | computed style |
| SAO prompt | 32 520 chars, 0 forbidden-canon lines | prompt probe |
| Canon ledger | 6 `CanonType` values, 2 in use | `state/store.ts` |

---

## 1. Scene DSL — smallest backward-compatible extension

The current quest structure already covers more of the spec than it appears to.
The extension is additive: no existing field changes meaning, no existing quest
data needs editing, and `QuestNode` remains loadable as-is.

### 1.1 Reuse as-is

| Spec requirement | Existing field | Notes |
|---|---|---|
| Scene id | `QuestNode.id` | |
| Scene prompt / cold open | `QuestNode.prompt` | |
| Player choices (not a closed list) | `QuestNode.choices: QuestChoice[]` | already a list, not a tuple |
| Free-form window | `QuestNode.freeform` | invite + families + fallback |
| Free-form families | `FreeformFamily` | cues, outcome, flag, imageKey, nextNodeId |
| Deterministic family routing | `resolveFreeform()` | runs before any model call |
| Camera preset | `QuestPresentation.camera` | 5 presets exist |
| Ambience layers | `QuestPresentation.ambience` | |
| Visible world mutation | `QuestPresentation.mutation` | 5 authored mutations |
| Visual state | `QuestPresentation.visualState` | 5 states |
| Objective | `QuestPresentation.objective` | now rendered |
| Beat timing | `QuestThresholdBeat.atMs` | clock-driven |
| Beat interruptibility (boolean) | `QuestThresholdBeat.interruptible` | boolean only — see 1.2 |
| Audio cue | `QuestThresholdBeat.cue` | |
| Outcome text | `QuestChoice.outcome` | |
| Branch flag | `QuestChoice.flag` | |
| Canon classification | `CanonLedgerEntry.canonType` | 6 values defined, 2 used |
| Player-authored marker | `QuestChoice.playerAuthored` | drives `player-created` |
| Checkpoint | `questCheckpoints` | per-quest resume |
| Persistence separation | `questTranscripts` / `chat` | server-gated |

### 1.2 New fields required

Beats become first-class rather than threshold-only. `SceneBeat` is a superset of
`QuestThresholdBeat`, so the existing threshold array widens without rewriting.

```ts
// NEW — beat-level acting, replacing QuestThresholdBeat (which becomes an alias)
export interface SceneBeat {
  id: string;                        // NEW — needed for lookahead + test targeting
  atMs: number;                      // reuse
  actor: 'rin' | 'rin-archived';     // NEW — two presentations, one skeleton
  target?: 'user' | 'rin' | 'rin-archived' | PropId;   // NEW — drives look-at
  line: string;                      // reuse
  motionTag: MotionTag;              // NEW — enum, validated against clip registry
  expression: ExpressionTag;         // NEW — enum
  emotionCarry?: 'hold' | 'decay-to' | 'reset';        // NEW
  emotionDecayTo?: ExpressionTag;    // NEW — required when carry = 'decay-to'
  lookAt?: 'user' | 'frame-12' | 'archived-self' | 'away' | PropId;  // NEW
  camera: QuestCamera;               // reuse
  staging?: StagingSlot;             // NEW — semantic, never XYZ
  cue?: AudioCue;                    // reuse (widen union)
  durationMs: number;                // NEW — explicit, was implied by next atMs
  interruptible: boolean;            // reuse
  protectedUntilMs?: number;         // NEW — partial protection
  interruptResponse?: string[];      // NEW — required when interruptible
  objective?: string;                // reuse (promote from presentation)
  subtitleBehavior?: 'normal' | 'suppress' | 'delay';  // NEW
  safeArea?: SafeAreaRequirement;    // NEW
  uiOcclusion?: ('hud' | 'subtitle' | 'nameplate' | 'objective')[];  // NEW — must hide
  requiredProps?: PropId[];          // NEW
}

// NEW — where a mutation must be readable, in screen space
export interface SafeAreaRequirement {
  /** What must stay unobstructed. */
  subject: 'face' | 'mutation' | 'both';
  /** Normalised viewport rect the subject must land inside. */
  rect: { x: number; y: number; w: number; h: number };
}

// NEW — semantic slots per environment zone. AI picks a slot, never coordinates.
export type StagingSlot =
  | 'corridor-lead' | 'corridor-mid' | 'corridor-trail'
  | 'frame-platform-front' | 'frame-platform-inside' | 'frame-platform-side'
  | 'control-edge' | 'beside-user' | 'between-user-and-frame';

// NEW — explicit player window, replacing "choices exist on this node"
export interface PlayerWindow {
  id: string;
  opensAtMs: number;
  kind: 'choice' | 'freeform' | 'both' | 'observe';
  /** Beat may continue playing under the window. */
  blocking: boolean;
}

// EXTENDED — outcome gains what the spec requires
export interface SceneOutcome {
  id: string;
  reactionBeats: SceneBeat[];        // NEW — reaction is authored, not improvised
  mutation: MutationTag[];           // reuse tag vocabulary, now a list
  relationshipEffect?: Partial<Rapport>;  // NEW — explicit, was implicit
  canonEntry: { type: CanonType; text: string };  // NEW — classification mandatory
  sessionCallback?: string;          // NEW — the approved cross-mode line
  nextNodeId?: string;               // reuse
}
```

`QuestNode` gains `beats: SceneBeat[]`, `playerWindows: PlayerWindow[]` and
`outcomes: SceneOutcome[]` as optional fields. A node with only `choices` keeps
working; a node with `beats` opts into the acting runtime. That is the whole
migration.

### 1.3 What deliberately stays out

- No `Scene.environment` yet — the slice has one loadable environment with three
  zones, so a zone enum on `staging` is sufficient and a second environment would
  be speculative.
- No `exits` array — `leaveQuest()` already handles the single exit contract.

---

## 2. Validator specification

One module, `config/validator.ts`, run on every beat and every outcome **before
execution**, whether authored or AI-selected. Two modes: `authoring` (build-time,
throws) and `runtime` (degrades per the fallback column).

| # | Rule | Failure behaviour | Fallback |
|---|---|---|---|
| V1 | `motionTag` exists in clip registry | log + degrade | shared clip for same emotion → idle + expression |
| V2 | Clip's required bones ⊆ rig's bones | log + degrade | nearest clip using available bones |
| V3 | `expression` exists in the loaded facial set | log + degrade | body motion + look-at only |
| V4 | Every `requiredProps` id is loaded in the scene | **block beat** | skip beat, advance; never mutate |
| V5 | `staging` slot is defined for the environment and legal for `actor` | log + degrade | previous slot, or `corridor-mid` |
| V6 | Camera preset frames `target` (dot-product + frustum test) | log + degrade | fall back to `single-medium` on the actor |
| V7 | `safeArea.rect` contains the projected subject bounds | log + degrade | switch to the preset whose rect passes; if none, delay beat one step |
| V8 | Subtitle rect ∩ `safeArea.rect` = ∅ | log + degrade | apply `subtitleBehavior: 'delay'` for this beat |
| V9 | `interruptible === true` ⇒ `interruptResponse.length ≥ 1` | **authoring error** | runtime: force `interruptible: false` |
| V10 | `protectedUntilMs ≤ durationMs` and `≥ 0` | **authoring error** | runtime: clamp to `durationMs` |
| V11 | `emotionCarry === 'decay-to'` ⇒ `emotionDecayTo` set and reachable from current expression | log + degrade | `hold` |
| V12 | Scene draw calls / tris / active mixers ≤ budget | log | drop archived-Rin material variant to shared material |
| V13 | Beat N+1 prepared before beat N ends | log + metric | play authored line without adaptive wording |
| V14 | Every outcome has `canonEntry.type` ∈ CanonType | **block outcome** | refuse to commit; keep previous state |
| V15 | Every decision point produces ≥1 `mutation` | **authoring error** | runtime: apply `lighting-shift` as minimum visible change |

**Hard rule:** V4, V14 block. Everything else degrades and logs. A validation
failure must never silently skip a consequence — V15's fallback exists so a
decision always changes something visible.

**AI boundary:** AI output is a set of enum choices (`motionTag`, `expression`,
`camera`, `staging`, family id) plus wording. It is validated through V1–V15
before reaching the runtime. AI never emits coordinates, clip data, or structure.

---

## 3. Animation runtime architecture

New module `src/three/acting.ts`. Minimum viable, no procedural animation.

```
GLB (rig + clips)
  → ClipRegistry            name → { clip, kind, tags, requiredBones }
  → ActorRig                per presentation: mixer, actions, current state
  → BeatDriver              plays a SceneBeat; owns crossfade + cancellation
  → hooks: LookAtDriver · FacialDriver · LipSyncDriver
```

**ClipRegistry.** Built at load from `gltf.animations` plus retargeted Mixamo
clips. Each entry records `kind: 'loop' | 'oneshot'`, emotion tags for V1
fallback, and the bone set for V2. Clips load once and are shared between both
presentations — same `AnimationClip`, two `AnimationMixer`s.

**ActorRig.** One per presentation. Holds the mixer, a map of `AnimationAction`,
and `timingProfile` (see §5). `play(tag, opts)` returns a handle.

**Crossfade.** `crossFadeTo(next, ms)` with default 250 ms, clamped 120–400 ms.
Loops use `LoopRepeat` and fade both ways; one-shots use `LoopOnce` +
`clampWhenFinished` and fade out on the `finished` event or on cancellation.

**Cancellation.** Beat transitions and user interrupts both cancel through one
path: `BeatDriver.cancel(reason)` stops scheduled callbacks, fades the current
action, and — for `reason: 'interrupt'` — plays the beat's `interruptResponse`
line rather than the next beat. This mirrors the existing `speechToken` pattern
in `main.ts`, which already solves "a late async result must not talk over a new
one"; the same token discipline extends to motion.

**Beat transitions.** `BeatDriver` is clock-driven like the current threshold
runner, so the existing `questTimers` array and its teardown are reused. The
driver adds a lookahead: at `beat.atMs + beat.durationMs − prepareLeadMs` it asks
the orchestrator to resolve beat N+1 (see §7).

**Fallback hierarchy** (V1–V3 in order):

```
character-specific clip
→ shared clip with matching emotion tag
→ idle + facial expression + look-at
→ camera reaction + subtitle + VFX          (no rig change at all)
→ authored still / generated image          (never blocking)
```

The last two rungs are already implemented — `setQuestVisual` mutations and
`sceneShots` — so a total animation failure still produces a visible scene.

**Hooks.** `LookAtDriver` rotates Neck/Head within limits after the mixer
updates, so a clip and a look target compose instead of fighting.
`FacialDriver` and `LipSyncDriver` are interfaces with no-op implementations
until a rig with blendshapes exists (§4).

---

## 4. Placeholder asset plan

`Rig_model__mia_.bin` is a Mixamo-standard GLB. **It is not Rin and is not a
production asset.** It exists to prove the architecture compiles and animates.

**Exact contents:** 22 joints — Hips, Spine, Spine1, Spine2, Neck, Head,
Shoulder/Arm/ForeArm/Hand ×2, UpLeg/Leg/Foot/ToeBase ×2. One material.
94 k tris. **No finger bones. No morph targets.**

### What it CAN validate

- ClipRegistry load, mixer creation, action mapping
- Crossfade, loop vs one-shot, `clampWhenFinished`
- Motion cancellation and interrupt routing
- Beat transitions, timing, lookahead scheduling
- **Timing/easing identity split** (§5) — the core hypothesis, and it needs only
  Hips/Spine/Neck/Head
- Look-at via Neck/Head
- V1, V2, V5, V6, V12 validator rules
- Portrait framing and safe-area projection (§6)

### What it CANNOT validate

| Blocked | Why |
|---|---|
| Facial expressions | 0 morph targets — the entire `FacialDriver` is untestable |
| Lip sync | no visemes |
| Hand and finger acting | no finger bones — "adjust headset", "hand hovering before touching archive" cannot be posed properly |
| Expression continuity / `emotionCarry` | needs V3 + facial |
| Material treatment split (§5) | 1 material, no separate archived variant |
| Silhouette identity | wrong character entirely |

This is the significant finding: the spec prioritises facial acting over body
motion, and the placeholder cannot test facial acting **at all**. The plan
therefore validates the body/timing half now and defers the half the spec cares
about most until a rig with blendshapes exists.

### Minimum clips to validate architecture — 8

`idle-neutral` (loop), `idle-guarded` (loop), `walk-forward` (loop),
`stop-turn` (oneshot), `step-toward` (oneshot), `step-back` (oneshot),
`gesture-explain` (oneshot), `head-tilt` (oneshot).

Acceptable temporary source: Mixamo free library, retargeted onto this
skeleton. `head-tilt` is the one to author by hand in two timing variants, since
it is the paired example the identity split rests on.

### Contract the final Rin asset must satisfy

1. Mixamo-compatible skeleton, superset of the 22 joints above, **including
   finger bones** (min. thumb + index + a combined 3-finger chain per hand).
2. Morph targets for the 12–14 expression states, ARKit-style or documented
   equivalent, plus visemes for basic lip sync.
3. Two material slots or a documented parameter for the archived-Rin variant.
4. ≤ 150 k tris; mobile-viable at two simultaneous instances.
5. Y-up, metres, T-pose or A-pose bind, origin at floor between feet.
6. Rin's visual DNA per v3 §1: black-blue shoulder-length hair with right-eye
   fringe, white-and-black mocap suit, glowing markers at shoulders/wrists/hips/
   knees, thin headset with a severed data ribbon on the left, bare feet.
7. Naming convention `rin_<part>` for meshes, `mixamorig:<Bone>` for joints,
   `exp_<name>` for morph targets.

---

## 5. Current Rin vs Archived Rin

Same skeleton, same clips, two `ActorRig`s with different `timingProfile`. The
difference is legibility, not asset count — which is exactly what makes it
testable with the placeholder.

| Channel | Current Rin | Archived Rin |
|---|---|---|
| Timing | `timeScale` 0.94–1.0, varied per clip | locked 1.0, identical every repeat |
| Easing | ease-in-out, overshoot allowed | linear-ish, no overshoot, polished |
| Hesitation | 80–220 ms hold inserted before the committing frame | none |
| Completion | may stop at 70–90 % and revise | always completes |
| Eye behaviour | look-at follows user, breaks contact, returns | fixed forward or scripted target only |
| Posture | micro-sway, weight shifts, 2 cm right-of-marker offset | dead centre, no sway |
| Expression range | full set | restricted to `neutral-attentive`, `soft-smile` |
| Material | normal | flatter, slight emissive rim, no shadow contact |

Implemented as `ArchivedProfile = { timeScale: 1, easing: 'linear', hesitationMs: 0, completion: 1, sway: 0, expressionAllow: [...] }` — a data
object, not a second animation set.

### Three paired examples from one base clip

**1. `head-tilt`** — her signature.
- *Current:* 120 ms pre-hold, tilt to 88 % of full angle, 40 ms settle back,
  eyes leave the user at the apex and return. Reads as thinking.
- *Archived:* immediate, full angle, no settle, eyes locked forward. Reads as
  playback. This is the beat where the user should first notice they are not the
  same person.

**2. `step-toward`** — the frame approach.
- *Current:* weight shift, 180 ms hesitation, step lands short, second smaller
  correction step.
- *Archived:* single clean step, exact distance, no correction. The archive knows
  where the mark is because it *is* the mark.

**3. `gesture-explain`** — talking about the archive.
- *Current:* gesture starts before the line, aborts at 75 % when she changes her
  mind, hand returns to a guarded position.
- *Archived:* full arc, symmetrical, ends in the same neutral every time.

---

## 6. Portrait-first camera and safe-area system

### 6.1 Presets

Replaces the 5 landscape-derived presets. Portrait is the design target; the
current `wide-mutation` made the character ~40 px tall on a 390 px screen, which
is the failure this fixes.

| Preset | Use | Portrait rule |
|---|---|---|
| `single-medium` | default speaking | head+torso, face in upper third |
| `single-close` | reaction, private truth | face fills 35–45 % of height |
| `object-pov` | inspecting frame/prop | object in the clear band, character out or edge |
| `user-pov` | she addresses the camera | |
| `tight-ots` | two presences without a two-shot | shoulder in frame, other actor at 60–75 % across |
| `two-shot-brief` | establishing only | **≤ 4 s, subtitles suppressed** |
| `mutation-focus` | replaces `wide-mutation` | mutation ≥ 20 % of height, inside the clear band |

### 6.2 Screen-space regions (390 × 844 reference, normalised)

```
face-safe        x 0.05–0.95   y 0.12–0.46     (below chrome, above subtitles)
mutation-safe    x 0.62–0.98   y 0.22–0.62     (right band — the only column
                                                the subtitle stack never covers)
subtitle stack   x 0.02–0.62   y 0.62–0.90     (measured: 56 % width)
objective line   x 0.02–0.98   y 0.90–0.95
```

The mutation-safe band is why `FRAME12_X = 0.92` works. That value was hand-tuned;
this makes it a rule the validator can check.

### 6.3 Rules

- **Subtitles:** default bottom-left stack. `suppress` during `two-shot-brief`
  and any beat whose `safeArea.subject` is `both`. `delay` when V8 fails.
- **HUD suppression:** `uiOcclusion` lists what must hide. Objective and
  nameplate always hide during `mutation-focus`. Exit affordance **never** hides.
- **Two-shot restriction:** ≤ 4 s, establishing only, never carries a decision
  point, never runs with subtitles visible.
- **Narrow layouts (< 360 px):** drop `two-shot-brief` and `tight-ots` entirely;
  substitute `single-medium` with a cut instead of a pan.

### 6.4 Validation method

At beat resolve, project the subject's world bounds through the camera to NDC,
convert to viewport rect, and assert containment in the declared `safeArea.rect`
minus any visible UI rect. This is the same projection used to diagnose Frame 12,
promoted from a one-off probe to `validator.assertVisible(beat, camera, subject)`.
Runs in tests headlessly at 360/390/430 × 844.

---

## 7. Latency plan

Targets: ≤ 1.2 s scene-entry-to-first-beat warm, ≤ 800 ms input-to-visible-mutation.

**First beat never waits on a model.** Beat 0 of every scene is fully authored —
line, motion, camera, cue — and starts on scene load. This is already how the
threshold runs; it becomes a rule rather than an accident.

**Lookahead.** At `beat.durationMs − 1200 ms`, the orchestrator resolves beat
N+1: adaptive wording, TTS prefetch, and validation all happen while beat N is
still playing. If resolution misses the deadline, beat N+1 plays its authored
line with no adaptive layer. Never a stall.

**TTS prefetch.** Reuses the existing streaming path (first PCM ~0.5 s warm) and
its `X-Emotion` round-trip, so carried emotion is preserved across beats. Prefetch
is fire-and-forget with the existing `chain` serialisation.

**Cold edge (2–3 s measured).** Two mitigations: a no-op warm ping on quest entry
so the function is hot by the first player window, and — because beat 0 is
authored — a cold start delays only the *adaptive* layer, never the opening.

**Mutation before dialogue.** Order is fixed and is the core of §9.3:

```
user input → local cue match → authored outcome → mutation applied + canon written
          → THEN adaptive reaction wording → THEN TTS
```

Already implemented and measured for free-form. Structural consequence is
synchronous local code; it cannot be delayed by an API.

**Failure isolation.** AI failure → authored line. TTS failure → text only (the
`renderSpeech` path already returns null and the caller stays text-only). Image
generation failure → geometry mutation already stands alone. None of the three
can block a canon write.

---

## 8. Frame 12 technical mapping

| Scene | Harness today | New runtime needed | Animation | Facial | Camera | Visible mutation | Free-form family | Persistence |
|---|---|---|---|---|---|---|---|---|
| **0 Archive Threshold** | beat clock, cue audio, camera fly, interrupt button | `protectedUntilMs`, `interruptResponse`, beat ids | walk-forward, stop-turn, head-tilt, hand-hover | attentive → suspicion | `single-medium` → `tight-ots` → `mutation-focus` | Frame 12 activates; other 11 dim | — | checkpoint `threshold_complete` |
| **1 First Inspection** | 3 choices, objective render | per-clue highlight target | inspect-object, look-at shifts | analytical focus | `object-pov` | selected clue gains depth / thread / early tilt | — | flag per clue; `branch` |
| **2 Enter or Refuse** | choices + freeform (2 families + fallback) | staging slots inside frame; archived rig instantiation | step-toward ×2 variants, dismiss | restrained irritation | `tight-ots` | archived overlay appears; desync visible | contradict-archive · address-current-rin · unknown | `player-created` when invented |
| **3 Desynchronisation** | visualState `archive-desync` | dual-mixer sync offset | paired head-tilt, both profiles | confusion → exposure | `two-shot-brief` (≤4 s) → `single-close` | split trail / broken sync line | — | `branch` |
| **4 Boundary Conflict** | 2 choices | rapport delta on outcome | guarded listen, step-back | suspicion, mask recovery | `single-close` | analysis beam narrows to trace only | define-protocol | `relationship` |
| **5 Frame 12 Decision** | 3 choices + freeform, 5 mutations exist | irreversibility lock | hand-to-control, dismiss | exposure → deliberate stillness | `mutation-focus` | open-channel / erase-signature / quarantine | author-new-protocol | `branch` or `player-created` + `sessionCallback` |

Dialogue deliberately not written — that is narrative content, and two of its
inputs are the blocked dependencies below.

---

## 9. Test matrix

| # | Test | Method | Pass |
|---|---|---|---|
| T1 | Clip loading | headless load, assert registry size + bone sets | 8/8 clips, 0 missing bones |
| T2 | Crossfade | sample weights across transition | no frame with total weight 0; ≤ 400 ms |
| T3 | Interruption | fire interrupt mid-beat | authored `interruptResponse` plays, next beat cancelled |
| T4 | Partial protection | interrupt before/after `protectedUntilMs` | rejected before, accepted after |
| T5 | Emotion carry | 4-beat sequence, one beat with no expression | holds previous, does not reset to neutral |
| T6 | Current/archive split | record Hips+Head curves for both profiles | timing delta ≥ 80 ms; archived variance = 0 |
| T7 | Free-form routing | 12 typed actions incl. 3 nonsense | ≥ 9 to correct family, nonsense → fallback, never generic |
| T8 | Immediate mutation | timestamp input → visible change | ≤ 800 ms, no network on path |
| T9 | Safe-area visibility | project subject at 360/390/430 px | inside declared rect at all three |
| T10 | Subtitle occlusion | intersect subtitle rect with safeArea | ∅, or `delay` applied |
| T11 | Warm latency | 20 runs, entry → first audio/visual | p90 ≤ 1.2 s |
| T12 | Cold latency | first run after idle | opening beat unaffected; adaptive may lag |
| T13 | Missing animation | remove a clip | falls to shared → idle+expression, no crash |
| T14 | Missing facial rig | rig with 0 morphs (**the placeholder**) | body + look-at only, no crash |
| T15 | Canon classification | run all 6 outcomes | every entry typed; authored=`branch`, invented=`player-created` |
| T16 | Checkpoint/resume | exit each scene, re-enter | resumes same node, no auto-selection |
| T17 | Open Chat / Quest isolation | quest turns then chat turn | 0 quest lines in `chat`; server ignores `history` in quest mode |

T14 is the one the placeholder is *for*: it proves the facial fallback works
before a facial rig exists.

---

## 10. File-level development sequence

Each step ends green — typecheck, build, and its own tests — and is a rollback
point. Nothing in steps 1–6 touches `DEFAULT_ROUTE` or production canon.

| # | Work | Files | Depends on | Test | Blocked by asset |
|---|---|---|---|---|---|
| 1 | Scene DSL types + validator skeleton | **new** `config/scene-dsl.ts`, `config/validator.ts`; **mod** `config/quests.ts` (optional fields) | — | typecheck; existing quest data still loads | no |
| 2 | Validator rules V1–V15 + unit tests | `config/validator.ts`; **new** `tests/validator.test.ts` | 1 | all 15 rules, both modes | no |
| 3 | Staging slots + portrait camera presets | **new** `config/staging.ts`; **mod** `config/cameras.ts` | 1 | T9 at three widths | no |
| 4 | Animation runtime | **new** `three/acting.ts`; **mod** `three/waifu-stage.ts` | 1,3 | T1, T2, T13 | placeholder only |
| 5 | Dual presentation + timing profiles | `three/acting.ts` | 4 | T6 | placeholder only |
| 6 | Beat driver + lookahead + interrupt/protection | **mod** `main.ts`, `state/store.ts` | 4 | T3, T4, T11, T12 | no |
| 7 | Safe-area validation wired to beats | `config/validator.ts`, `ui/steps.ts` | 3,6 | T9, T10 | no |
| 8 | Emotion carry at expression layer | `three/acting.ts`, `config/scene-dsl.ts` | 4 | T5 | **partially** — needs morphs for full test |
| 9 | Frame 12 scene graph, no final dialogue | **new** `config/rin-frame12.ts` | 1–7 | T7, T8, T15, T16 | no |
| 10 | Facial + lip-sync drivers | **new** `three/facial.ts` | 4 | T14 now; full test later | **yes — final rig** |
| 11 | Production-quality acting pass | assets + `acting.ts` tuning | 10 | acceptance §14 | **yes — final rig** |

**Rollback points:** after 2 (types only, no behaviour), after 4 (runtime exists
but no scene uses it), after 7 (camera/safe-area shippable independently), after
9 (playable slice, placeholder visuals).

**Recommended stop for review:** after step 6. At that point timing identity,
interruption and latency — three of the five hypotheses — are measurable with the
placeholder, and no final asset has been commissioned.

---

## Blocked narrative-content dependencies

Not authored in this phase, per instruction. The `sao` route currently suppresses
the v1 versions rather than adapting them, which is correct.

| id | What | Blocks |
|---|---|---|
| `rin-v3-tradeable-truths` | cheap / costly / expensive truth sets in SAO canon | reciprocal-disclosure depth in Open Chat; Scene 4 trade beat |
| `rin-v3-causal-memory-bank` | fact → private meaning → false belief → reflex → trigger → voiced line | per-turn retrieval; her reactions currently run on psyche + reactions only |

Neither blocks any technical step 1–11.
