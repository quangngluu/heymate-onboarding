# Entry / exit alignment — lobby ↔ teaser ↔ live desk

**Date:** 2026-08-15 · **Status:** implemented

## Problem

The cinematic is a portrait video sitting over full-bleed HTML backgrounds, with
two seams that must line up so it feels like entering a world, not watching a
floating clip:

1. **Entry** — lobby (`office-entry-empty`, `cover`) → teaser seg1 opening
   (`office-to-eye`, `contain`, letterboxed). Sides must fade black without
   eating the picture.
2. **Exit** — final teaser frame → live desk (`desk-ambient-loop` + 3D figure).
   The old handoff cut straight to the wide showcase, so the figure/book/desk
   "jumped". Wanted: **match → dolly-out** (lights up, desk widens into the loop).

## Key finding

Measured at 1440×900: the **figure + base already match** between the video's
final frame and the live desk at its resting framing (base centre x≈712 in both;
figure top y≈150 in both). So a scale-based dolly-out would *break* the match
(it would pop the figure larger at the seam). The real difference is the office
**framing**: the video is a portrait letterbox crop; the live desk is the full
landscape. The reveal is therefore the **letterbox opening**, not a zoom.

## Mechanism (video = ground truth; 2D lock-step)

The desk plate (`#desk-loop`) and the transparent WebGL layer (`#stage`) share a
single dolly transform + lights ramp, driven per-frame from `main.ts`, so the
figure stays locked to the desk:

- CSS vars `--live-dolly-x/y`, `--live-dolly-s`, `--live-lights`, `--live-mask`
  (`styles.css`). Unset → identity, so nothing else on the desk is affected.
- `#live-mask` (`index.html`) draws black sides matching the teaser's; width is
  `(100vw − 57.142857vh)/2 × --live-mask`, retracting `1 → 0` on the dolly-out.
- Exit sequence (`App.beginCompanionReveal`, fired from `steps.ts` when the last
  clip starts dissolving): hold the matched frame ~700 ms, then ease
  `START → REST` over 1300 ms (easeOutCubic) — letterbox opens, whisper of
  pull-out, `brightness 0.85 → 1`. On finish → `completeCompanionHandoff`
  (step → stage/showcase, orbit, editions timer). `prefers-reduced-motion`
  snaps straight to REST.

### START values (`App.liveDollyStartVals`, tune here)

| | x | y | scale | lights | mask |
|---|---|---|---|---|---|
| desktop | 0 | −0.6vh | 1.04 | 0.85 | 1 (open letterbox) |
| mobile  | 0 | −1.2vh | 1.10 | 0.85 | 0 (clip is `cover`, no letterbox) |

REST = `{0, 0, 1, 1, 0}`. Timings: `holdMs 700`, `durationMs 1300` in
`beginCompanionReveal`. Dev handle: `window.__hm.setDolly(x,y,s,lights,mask)`.

### Entry

The old handoff revealed the live desk (empty base) for the ~360 ms pre-roll
before seg1 played — a visible glitch on click. Fix: `.stage-teaser-entry`, an
**opaque office plate** (same `office-entry-empty-landscape.webp` as the lobby,
`cover`) as the teaser's lowest layer. On click it matches the lobby frame (no
jump), covers the live desk for the whole teaser (no flash, between segments
too), pushes in gently (`teaser-entry-push`, scale 1 → 1.06), and dissolves with
the gate at hand-off to reveal the desk. Flow: **ENTER → sides fade in (mattes) →
slight zoom-in → seg1 plays**. Side mattes (`.stage-teaser::before/::after`)
feather only ~14 px onto the picture (was 42 px) so the black sides hide the
letterbox seam without eating the video.

## Known limitations (masked by the 720 ms dissolve)

- The teaser figure is a stylised baked render; the live figure is the GLB — the
  seam is a dissolve-in-place, not pixel-identical.
- Video plate ≠ desk-loop plate, so the **book** sits differently between them;
  we prioritise the hero (figure) match.
- Live figure/base renders ~8% larger than the baked video figure on desktop.

## Verification

`tsc --noEmit`, `vitest` (282 pass), `vite build` all green. Frames captured in
system Chrome (videos paint): video-final vs reveal start/mid/rest at desktop +
mobile, and a full ENTER→handoff run reaching `stage`/`showcase` at REST with no
console errors.
