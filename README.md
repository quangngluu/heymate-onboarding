# HEYMATE — Worldform Studio + Waifu Universe

A browser-based prototype with two experiences: companion conversations in the
Waifu Universe, and **Worldform Studio** in Afterburn City — a cost-gated path
from identity to front concept, consistent multiview, asynchronous 3D, and QC.

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

```text
choose Afterburn City
→ identity photo + desired self
→ bounded World Archetype recommendation
→ Custom Head + World Body + Signature Kit under MAS v1
→ FRONT generation + explicit approval
→ SIDE and BACK as separate assets + explicit approval
→ asynchronous multi-image-to-3D job
→ automatic QC
→ manual manufacturing review
```

The expensive stages are ordered gates: side/back cannot run before front
approval, and 3D cannot run before multiview approval. Each retry creates a
Build Revision. Provider failures do not consume the successful-front quota.

The product architecture is deliberately modular: **Face = who I am**, **World
Body = who I become**, and **Signature Asset = which universe I belong to**.
Every World Body carries a keyed Head Dock and the standard MAS v1 hardpoint
geometry. A Signature Kit contains exactly one silhouette-readable hero asset
and at most one secondary accent; removing it must leave a complete-looking
body. The 3 mm keyed asset peg is a prototype hypothesis, not a production
dimension, until factory tolerance and physical coupon tests validate it.

Worldform defaults to deterministic local adapters so the complete flow can be
tested without credentials or provider spend. Copy `.env.example` to
`.env.local`, set `VITE_WORLDFORM_PROVIDER=live`, and provide both `FAL_KEY` and
`MESHY_API_KEY` to exercise the production adapters.

## What is real vs. simulated

| Area | Status |
| --- | --- |
| Worldform state machine, approval gates, revision history, cache/quota policy | **Real, persisted locally.** |
| All 8 character models | **Real generated GLBs** (user-provided, optimized to ~4.5MB each: 1024 WebP + Meshopt) |
| Faction environments | **Real generated 360° panoramas** (user-provided), crossfaded per selected faction as skybox + image-based lighting |
| Character thumbnails | **Real** — each GLB is rendered once offscreen |
| Identity photo | **Real.** Resized before local persistence; sent to FAL only in explicitly enabled live mode. |
| Front / side / back generation | **Mock by default; live FAL adapter included.** One view is one asset. |
| Multi-image-to-3D | **Mock by default; live Meshy task submit/poll adapter included.** |
| MAS v1 configuration | **Real domain validation.** Checks Head Dock, standard hardpoint geometry, port/type/connector compatibility, one hero + at most one accent, and standalone body rules. |
| QC | **Automatic evidence, not approval.** Reads GLB geometry where reliable and validates modular configuration; connector fit remains unknown without physical/factory evidence. |
| Manufacturing approval / checkout | **Not implemented.** A review request can be recorded, but commercial export stays locked. |
| **Waifu Universe chat** | **Real.** DeepSeek runs behind a Vercel edge function (`api/chat.ts`); the API key is a server-side env var and never reaches the browser. The system prompt is built from each resident's locked canon plus the session settings (`src/chat/prompt.ts`). If the endpoint is missing or failing, the app silently falls back to the scripted engine, so `npm run dev` and any static host still answer. |
| Context-driven chat images | **Prototype.** A high-confidence scene gets one free generation attempt per resident thread; later images require an explicit 4-credit action. Slow jobs stay attached to their original card without taking over a newer backdrop, and credits settle only after presentation. Identity, quota, and the wallet still live in the browser, so this is UX protection—not enforceable billing or provider-cost control. |
| Reveal schedule | **App-owned.** The model is told which episode to work in; it is never left to invent canon. |
| Saved progress | **Real, local.** Spending a credit writes the selected memories to localStorage; the next visit opens on a callback instead of the greeting. Credits are a mock wallet. |
| Ambient audio + cues | Procedural WebAudio stand-in |

## Architecture

- `src/config/*` — universes, factions, characters (2 per faction), camera
  presets, plinth layout (derived from character count), copy. Content-only
  changes never touch the engine.
- `src/worldform/domain/*` — World Pack, World Archetype, World Body, Signature
  Kit, MAS v1, Manufacturing Profile, User Identity, Worldform Build, immutable
  Build Revision, PromptCompiler and approval state machine.
- `src/worldform/orchestrator.ts` — the deep Worldform module: ordering,
  persistence, retries, request hashes, provider usage, and QC ownership.
- `src/worldform/providers/*` — image and 3D provider seams with mock and HTTP
  adapters. Edge credentials live in `api/worldform-image.ts` and
  `api/worldform-3d.ts`.
- `src/worldform/qc/*` — GLB inspection and Manufacturing Profile assessment.
- `src/state/store.ts` — companion-universe state plus outer universe routing.
- `src/three/engine.ts` + `rig.ts` — single renderer/loop owner and all camera
  transitions (cancelable, skippable, reduced-motion aware).
- `src/three/champions.ts` — GLB loading/normalization/cache + the simulated
  variant treatment. `figurine.ts`/`adapter.ts` provide the procedural proxy
  fallback. `nameplate.ts` is the 3D name backdrop; `thumbs.ts` renders slider
  thumbnails.
- `src/ui/*` — semantic HTML overlay; slider mirrors 3D picking, keyboard
  arrows switch characters, WCAG-conscious contrast, `prefers-reduced-motion`
  respected throughout.

## Production limitations

Worldform persistence is currently browser-local. Before real orders, move
identity, builds, quota enforcement, idempotency, and usage settlement to
durable server-side storage; copy provider output to owned object storage rather
than retaining expiring URLs. Factory-specific wall/detail constraints are
still `null`, so no model is called print-ready and commercial export remains
disabled. The current mock GLBs are execution scaffolds; they do not prove the
Head Dock, concealed hardpoints, keyed orientation, 3 mm peg, or physical fit.
