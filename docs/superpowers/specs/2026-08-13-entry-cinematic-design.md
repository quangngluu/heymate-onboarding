# Entry Cinematic — Design Spec

- **Date:** 2026-08-13
- **Repo:** heymate-onboarding
- **Branch:** feat/quest-mode-prototype-1
- **Scope:** Collapse the gallery → teaser → figurine-reveal entry into one continuous camera shot. Reduce the universe card to image + name, replace the CSS card-inflate with a real camera dolly into a 3D portal plane, keep the teaser unskippable, and land the reveal on the character alone — editions withheld until she has been spoken to.
- **Status:** Approved in brainstorming; pending user review of this spec.
- **Covers:** K's UI items 1 (card), 2 (camera-in), 4 (reveal UX). Items 3 (teaser glitch), 5–7 (variant showroom), 8 (purchase) are out of scope — separate sub-projects.
- **Related:** [figurine-products.ts](../../../src/config/figurine-products.ts) and the `62ad59c` "cinematic figurine showcase" commit, on which this builds.

## 1. Motivation

The entry is currently three disconnected pieces:

1. **Gallery** — DOM `<button>` tiles in a CSS grid. On click, `--enter-scale` inflates the chosen tile to fill the viewport over 520 ms, then routes ([steps.ts:420](../../../src/ui/steps.ts:420)). This is exactly the "scale the card to the camera" motion K rejected.
2. **Teaser** — mounted as its own `companion-teaser` step ([steps.ts:456](../../../src/ui/steps.ts:456)), with a second, duplicated copy of the same video/brand block rebuilt inside `stageStep` ([steps.ts:597](../../../src/ui/steps.ts:597)).
3. **Reveal** — `finishCompanionTeaser()` runs a cryo-pod thaw, a light flash, a rig impulse and a 1.25 s pull-out to the stage ([main.ts:1064](../../../src/main.ts:1064)), landing on `showcase` mode with the figurine, `PRESS TO TALK`, **and** the 3-edition product rail all visible at once.

The card motion is a fake, the teaser exists twice, and the reveal sells before the character has said a word — against K's own "Character first → Edition second" rule.

Two facts from the code shape the fix:

- The three.js renderer and animation loop run continuously from boot ([engine.ts:83](../../../src/three/engine.ts:83)); at gallery time the scene is simply an **empty dark room** with the camera parked at the `gallery` preset. There is a live camera to move — it just has nothing to look at yet.
- `CameraRig.flyTo(preset, duration)` already exists and returns a promise ([rig.ts:76](../../../src/three/rig.ts:76)). A real dolly is a reuse, not a new mechanism.

## 2. The one-shot sequence

The camera never cuts. One through-line, four beats:

```
GALLERY ROOM         PORTAL DOLLY          TEASER              CRYO REVEAL          STAGE
lit card plane   →   rig.flyTo into    →   video mounts   →    thaw + flash    →    her alone +
+ name label         the plane frame       in that frame       + pull-out           PRESS TO TALK
```

- **Gallery room** — the card is a lit textured plane standing in the room the camera already occupies. An accessible DOM `<button>` overlays it for pointer, keyboard and screen-reader access.
- **Portal dolly** — on activate, `rig.flyTo` dollies the camera at the plane until the plane fills the frame. Siblings (none, today — see §4) pass out of the frustum.
- **Teaser** — the video mounts in the framing the plane ended on, so there is no visible handoff. It plays through, **unskippable**.
- **Cryo reveal** — the existing thaw/flash/impulse/pull-out runs, unchanged in mechanism, retuned in composition (§5).
- **Stage** — lands on the figurine and one quiet `PRESS TO TALK`. Editions withheld (§5).

## 3. Watch = loading (the teaser gate)

K's framing: WATCH is not an action, it is a form of loading before first entry. The teaser is 9.6 MB; `kagura-original.glb` is 16.5 MB. Both must arrive before the reveal can land.

A single switch governs behaviour:

```ts
// src/config/entry.ts
export const TEASER_GATE: 'always' | 'first-visit' = 'always';
```

- **`'always'` (default, current testing need):** the teaser plays on every entry.
- **`'first-visit'`:** the teaser plays only when there is something to load. On a return visit — assets cached — the sequence is card → dolly → straight to the figurine, no video.

Both branches are built now; `'always'` ships. Retrofitting `'first-visit'` later would mean re-touching the same sequence, so the dormant branch and its persisted flag are written in this pass and switched off, not deferred.

**Persisted flag:** the store already persists `onboardingCompleted` and a per-resident `visits` counter ([store.ts:631](../../../src/state/store.ts:631), [store.ts:668](../../../src/state/store.ts:668)). The gate reads "has this visitor entered the Waifu universe before" from a new persisted boolean `waifuUniverseEntered` (added to the `persist()` payload), set when the reveal completes. `visits` is per-resident and increments on every encounter including resident switches, so it is the wrong signal for a once-ever universe gate; a dedicated flag avoids that ambiguity.

**Unskippable:** per K's earlier ruling ("video plays through, no skip"). Consequences:
- The skip button at [steps.ts:612](../../../src/ui/steps.ts:612) is removed.
- The 1.8 s skip-reveal timer is removed.
- The 7 s failsafe changes meaning — see §6.

## 4. Card reduction (item 1)

The card is reduced to **image + universe name only**. Removed from the tile: kicker, mode label, character/faction count, tagline, and the CTA arrow row ([steps.ts:401–418](../../../src/ui/steps.ts:401)). This is not only an aesthetic cut — an image-plus-label is precisely a textured plane plus a caption, which is what the portal plane in §2 needs. The reduction and the transition are the same decision.

**Afterburn City is gated out of the gallery.** `UNIVERSES` is not edited and the creator route is untouched; a visibility filter in `src/config/entry.ts` hides any universe not on an allow-list, leaving the Waifu universe as the sole card until Afterburn has its own teaser. Nothing is deleted.

**Consequence — one-card gallery.** With Afterburn hidden the gallery is a single card. The portal plane handles this well (a single lit plane in a dark room is a strong image). If a second card returns later, the portal module renders N planes; the dolly targets the activated one and the rest leave frame. The design does not assume exactly one card, only that at least one is present.

## 5. Reveal landing (item 4)

Reveal lands on **the figurine and one quiet `PRESS TO TALK`** — nothing else. This is item 4 and the piece K flagged for `design-taste-frontend`. The effect mechanism (thaw, flash, impulse, pull-out) already exists; the design work is subtraction and timing, executed against these constraints at implementation time:

- The premium-edition product rail is **suppressed** on the reveal landing. It unhides when the visitor enters the playground (`enterPlayground` — she has been talked to), or after a no-engagement timeout, whichever comes first. The rail becomes an entrance, not a shelf.
- The pull-out is retuned so the figurine is the only element resolving into focus; the current landing has three elements competing in the first second, the redesign has one.
- `design-taste-frontend` is invoked at implementation time to execute the reveal's motion and composition, rather than hand-specifying easings here.

This enforces "Character first → Edition second" literally: nothing is for sale until she is real to the visitor.

## 6. Error handling

Each failure has a defined, already-mostly-wired fallback:

| Failure | Fallback |
| --- | --- |
| Portal texture 404s | Flat accent-colour plane; the click/dolly path still works. |
| Video errors / never fires `ended` | 7 s failsafe cuts straight to the cryo reveal (existing timer at [main.ts:1117](../../../src/main.ts:1117), re-pointed from "let them skip" to "advance the shot"). |
| GLB slow to load | Video holds on its composed final frame until the model resolves (today's behaviour, kept). |
| `reducedMotion` | Skip the dolly (jump to teaser framing); skip the pull-out animation (already handled in `finishCompanionTeaser`). |

**The DOM-rect-tracking risk, named.** Keeping an accessible `<button>` glued to a projected 3D plane across resize is the one genuinely fiddly part. Primary approach: `gallery-portal.ts` exposes `projectedRect(cardId)`; the overlay is repositioned on resize. **Explicit fallback if that proves ugly:** a single full-screen invisible click layer during the gallery — the visitor can only pick the one visible card anyway, so a per-card hit-rect is a nicety, not a requirement. Implementation is not blocked on the precise version.

## 7. Components

**New**
- `src/three/gallery-portal.ts` — builds the lit card-plane(s) in the room; exposes `projectedRect(cardId)` for the accessible overlay and `dollyInto(cardId)` wrapping `rig.flyTo`. Texture-load failure falls back to a flat accent plane.
- `src/config/entry.ts` — `TEASER_GATE` and the gallery visibility allow-list/filter.

**Changed**
- `galleryStep` ([steps.ts:363](../../../src/ui/steps.ts:363)) — card reduced to image + name; the `<button>` becomes the accessible overlay tracking the plane rect; the `--enter-*` CSS inflate is removed.
- `finishCompanionTeaser` ([main.ts:1064](../../../src/main.ts:1064)) — reveal lands with the product rail suppressed; rail unhides on `enterPlayground` or timeout; sets `waifuUniverseEntered`.
- `stageStep` ([steps.ts:597](../../../src/ui/steps.ts:597)) — the duplicated in-stage teaser block is deleted; `companionTeaserStep` is the single teaser owner.
- `src/state/store.ts` — add `waifuUniverseEntered` to state and the `persist()` payload.
- `src/styles.css` — remove `.is-entering` inflate rules; card and rail-suppression styles.

**Untouched, deliberately:** `UNIVERSES` (Afterburn gated, not removed), the creator route, rapport/quest/bond systems, figurine variant config.

## 8. Verification

Most of this is visual and is verified in the browser preview (screenshots at each of the four beats, console/network checks). The unit-testable surface is small and worth pinning:

1. **Gate switch** — `TEASER_GATE` resolution: `'always'` plays every time; `'first-visit'` plays only when `waifuUniverseEntered` is false.
2. **Gallery filter** — the visibility filter yields only allow-listed universes (Afterburn absent).
3. **Rail suppression** — the reveal-landing state hides the rail; the `enterPlayground` transition shows it.

Existing suite must stay green: `npm run build && npm test`. Only 3 gallery/stage-related test files reference these paths; the rest bind to store/quest/visual behaviour.

## 9. Non-goals

- No change to the teaser video content or the reported glitch (item 3, deferred).
- No variant-card restyle, no 9 cm original product entry, no marketplace screen (items 5–7, sub-project B).
- No cart, checkout or order state (item 8, sub-project C).
- No de-duplication of unrelated stage code beyond the teaser block named in §7.
