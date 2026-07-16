# HEYMATE — Mate Studio (3D onboarding mockup)

A browser-based 3D prototype: enter **Afterburn City**, browse eight faction
characters in the Mate Studio, and regenerate your own Mate from the selected
base character using a description or a photo.

## Run

```bash
npm install
npm run dev        # http://localhost:5199
npm run typecheck
npm run build      # typecheck + production bundle
npm run preview    # serve the production build
```

QA harness: with the dev server running, `node scripts/qa-capture.mjs` drives
the full journey in headless system Chrome at 1440×900 and 390×844 and writes
step screenshots to `screenshots/`.

## Flow

`arrival → studio → reveal → joined`

**Mate Studio** (the centerpiece, art direction distilled from Mint's
neon-relic playground): oversized character name rendered in 3D behind the
figurine, character info card bottom-left, an eight-character slider
bottom-center (real rendered thumbnails; camera reframes per selection with
the same plinth framings), and the generation panel on the right
(Describe / Photo). There is no accessory-based customization: the product
mechanic is regeneration of the base 3D file from the user's input.

## What is real vs. simulated

| Area | Status |
| --- | --- |
| Journey, state machine, slider, camera choreography | **Real** (vanilla Three.js) |
| All 8 character models | **Real generated GLBs** (user-provided, optimized to ~4.5MB each: 1024 WebP + Meshopt) |
| Faction environments | **Real generated 360° panoramas** (user-provided), crossfaded per selected faction as skybox + image-based lighting |
| Character thumbnails | **Real** — each GLB is rendered once offscreen |
| Photo input | **Real, local-only** object URL; never uploaded |
| **Mate regeneration** | **Simulated, deterministic, local.** The real product re-generates the model from the base file plus the user prompt through a generation service. This mockup hashes the input (FNV-1a) and applies a faction-approved colorway tint to a clone of the base model (`applyVariantTint` in `src/three/champions.ts`). Same input, same result. No network calls. |
| Ambient audio + cues | Procedural WebAudio stand-in |

## Architecture

- `src/config/*` — universes, factions, characters (2 per faction), camera
  presets, plinth layout (derived from character count), copy. Content-only
  changes never touch the engine.
- `src/state/store.ts` — single state owner (step, selected character, gen
  input/phase, variant seed, name).
- `src/three/engine.ts` + `rig.ts` — single renderer/loop owner and all camera
  transitions (cancelable, skippable, reduced-motion aware).
- `src/three/champions.ts` — GLB loading/normalization/cache + the simulated
  variant treatment. `figurine.ts`/`adapter.ts` provide the procedural proxy
  fallback. `nameplate.ts` is the 3D name backdrop; `thumbs.ts` renders slider
  thumbnails.
- `src/ui/*` — semantic HTML overlay; slider mirrors 3D picking, keyboard
  arrows switch characters, WCAG-conscious contrast, `prefers-reduced-motion`
  respected throughout.

## Production next step

Wire `generate()` in `src/main.ts` to a real generation service: send the base
model reference plus the user prompt, poll, then load the returned GLB through
the existing `loadNormalized` path in place of `applyVariantTint`. The UI,
states and camera work stay as-is. Provide `champion-kira.glb` to complete the
roster.
