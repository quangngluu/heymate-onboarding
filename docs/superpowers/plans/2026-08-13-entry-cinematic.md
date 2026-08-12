# Entry Cinematic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the gallery→teaser→reveal entry into one continuous camera shot: an image+name card rendered as a lit 3D portal plane, a real `rig.flyTo` dolly into it (replacing the CSS inflate), an unskippable teaser gated by a single switch, and a reveal that lands on the character alone with the premium editions withheld until she has been spoken to.

**Architecture:** The three.js renderer already runs continuously with the camera parked at the `gallery` preset in an empty dark room; this plan gives that room a lit card-plane to look at and dollies the existing camera into it. All decision logic (which universes are visible, whether the teaser plays) lives in a pure config module and store flags — the only unit-tested surfaces. The card, portal and reveal composition are DOM/three visuals, verified in the browser preview.

**Tech Stack:** Vite 5.4, TypeScript 5.6, three.js 0.169, Vitest 3.2. DOM built via the local `h()` helper ([src/ui/dom.ts](../../../src/ui/dom.ts)); camera via `CameraRig` ([src/three/rig.ts](../../../src/three/rig.ts)); state via `Store` ([src/state/store.ts](../../../src/state/store.ts)).

## Global Constraints

- **Spec:** [docs/superpowers/specs/2026-08-13-entry-cinematic-design.md](../specs/2026-08-13-entry-cinematic-design.md). Scope is K's UI items 1, 2, 4 only. Items 3, 5–8 are explicitly out of scope (spec §9).
- **Staging discipline:** this branch carries a large body of unrelated uncommitted/untracked work. Stage ONLY the files each task names. Never `git add -A`, `git add .`, or `git commit -a`.
- **Nothing is deleted from `UNIVERSES`:** Afterburn City is hidden by a filter, not removed. The creator route stays intact.
- **Teaser is unskippable** (K's ruling). No skip button, no skip timer. The 7 s failsafe advances the shot; it never returns control to the visitor.
- **`TEASER_GATE` defaults to `'always'`** (video every visit, for testing). The `'first-visit'` branch is built but switched off.
- **`Store.state` is private** — read with `store.get()`, write with `store.set()`; persistence is via the private `persist()` called inside store methods.
- **Test env has no global `localStorage`** — store tests stub `MemoryStorage` via `vi.stubGlobal('localStorage', …)` (see [tests/state/canon-ledger-chat.test.ts](../../../tests/state/canon-ledger-chat.test.ts)). Test env has no `document` — pure config/store/three-projection logic is unit-tested; DOM steps are browser-verified.
- **Build + test gate:** `npm run build && npm test` must stay green after every task.
- **Vietnamese copy** stays Vietnamese; do not translate existing strings.

---

### Task 1: Entry config — visibility filter and teaser gate

Pure decision logic, no DOM, no three. This is the foundation Tasks 2, 5 and 6 consume. Covers spec §3 (gate) and §4 (filter).

**Files:**
- Create: `src/config/entry.ts`
- Test: `tests/config/entry.test.ts`

**Interfaces:**
- Consumes: `UniverseConfig`, `UNIVERSES` from [src/config/universes.ts](../../../src/config/universes.ts).
- Produces:
  - `TEASER_GATE: 'always' | 'first-visit'` (const, default `'always'`)
  - `ENTRY_GALLERY_ALLOW: readonly string[]` (allow-list of universe ids, `['waifu-universe']`)
  - `visibleUniverses(all?: UniverseConfig[]): UniverseConfig[]` — filters to allow-listed ids, preserving order; defaults to `UNIVERSES`.
  - `shouldPlayTeaser(entered: boolean, gate?: 'always' | 'first-visit'): boolean` — `gate === 'always' ? true : !entered`; `gate` defaults to `TEASER_GATE`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/config/entry.test.ts
import { describe, expect, it } from 'vitest';
import {
  ENTRY_GALLERY_ALLOW,
  TEASER_GATE,
  shouldPlayTeaser,
  visibleUniverses,
} from '../../src/config/entry';
import { UNIVERSES } from '../../src/config/universes';

describe('entry gallery visibility', () => {
  it('defaults the gate to always for testing', () => {
    expect(TEASER_GATE).toBe('always');
  });

  it('shows only allow-listed universes, hiding Afterburn', () => {
    const visible = visibleUniverses();
    expect(visible.map((u) => u.id)).toEqual(['waifu-universe']);
    expect(visible.map((u) => u.id)).not.toContain('afterburn-city');
  });

  it('preserves source order and only surfaces known ids', () => {
    const visible = visibleUniverses(UNIVERSES);
    for (const u of visible) expect(ENTRY_GALLERY_ALLOW).toContain(u.id);
  });

  it('plays the teaser every time under the always gate regardless of prior entry', () => {
    expect(shouldPlayTeaser(false, 'always')).toBe(true);
    expect(shouldPlayTeaser(true, 'always')).toBe(true);
  });

  it('under first-visit, plays only when the universe was not entered before', () => {
    expect(shouldPlayTeaser(false, 'first-visit')).toBe(true);
    expect(shouldPlayTeaser(true, 'first-visit')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/config/entry.test.ts`
Expected: FAIL — cannot resolve `../../src/config/entry`.

- [ ] **Step 3: Write the implementation**

```ts
// src/config/entry.ts
//
// Pure entry-cinematic policy: which universes appear in the gallery, and
// whether the teaser plays. Kept free of DOM/three so it is unit-tested; the
// card, portal and reveal that read these are verified in the browser.

import { UNIVERSES, type UniverseConfig } from './universes';

/**
 * Whether the opening teaser is a fixed ritual or a first-visit loader.
 *  - 'always':      play on every entry (current testing need).
 *  - 'first-visit': play only when there is something to load (assets uncached).
 * Both paths are wired; 'always' ships. See the design spec §3.
 */
export const TEASER_GATE: 'always' | 'first-visit' = 'always';

/**
 * Universes shown in the gallery. Afterburn City is withheld until it has its
 * own teaser; it is filtered here, never removed from UNIVERSES, so the creator
 * route stays intact.
 */
export const ENTRY_GALLERY_ALLOW: readonly string[] = ['waifu-universe'];

export function visibleUniverses(all: UniverseConfig[] = UNIVERSES): UniverseConfig[] {
  return all.filter((u) => ENTRY_GALLERY_ALLOW.includes(u.id));
}

export function shouldPlayTeaser(
  entered: boolean,
  gate: 'always' | 'first-visit' = TEASER_GATE
): boolean {
  return gate === 'always' ? true : !entered;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/config/entry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/entry.ts tests/config/entry.test.ts
git commit -m "feat(entry): add gallery visibility filter and teaser gate"
```

---

### Task 2: Store flags — first-visit persistence and edition gating

Two state fields for the entry cinematic. `waifuUniverseEntered` is persisted (the first-visit gate's memory). `editionsRevealed` is session-only (the rail is re-hidden on every fresh entry). Covers spec §3 (persisted flag) and §5 (rail-suppression state).

**Files:**
- Modify: `src/state/store.ts` — `AppState` interface (near :266), `initialState` (near :412), the hydrating `saved` type + assignment (:542–594), `persist()` payload (:631–649), `leaveUniverse()` (:1580), and add two methods.
- Test: `tests/state/entry-flags.test.ts`

**Interfaces:**
- Consumes: existing `Store`, `store.get()`, `store.set()`, `persist()`.
- Produces (new `Store` members):
  - `AppState.waifuUniverseEntered: boolean` (persisted; default `false`)
  - `AppState.editionsRevealed: boolean` (session; default `false`)
  - `markWaifuUniverseEntered(): void` — idempotent; sets the flag true and persists.
  - `revealEditions(): void` — sets `editionsRevealed` true (no persist; session-only).
  - `leaveUniverse()` additionally resets `editionsRevealed` to `false`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/state/entry-flags.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.values.set(k, v); }
  clear() { this.values.clear(); }
}
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

describe('entry-cinematic store flags', () => {
  it('defaults both flags false', () => {
    const store = new Store();
    expect(store.get().waifuUniverseEntered).toBe(false);
    expect(store.get().editionsRevealed).toBe(false);
  });

  it('persists waifuUniverseEntered across a reload', () => {
    new Store().markWaifuUniverseEntered();
    // A second store reads the same stubbed storage on construction.
    expect(new Store().get().waifuUniverseEntered).toBe(true);
  });

  it('does not persist editionsRevealed (session-only)', () => {
    const store = new Store();
    store.revealEditions();
    expect(store.get().editionsRevealed).toBe(true);
    expect(new Store().get().editionsRevealed).toBe(false);
  });

  it('re-hides editions when the universe is left', () => {
    const store = new Store();
    store.revealEditions();
    store.leaveUniverse();
    expect(store.get().editionsRevealed).toBe(false);
  });

  it('keeps waifuUniverseEntered true in memory across an in-session leave', () => {
    const store = new Store();
    store.markWaifuUniverseEntered();
    store.leaveUniverse();
    // The gate reads store.get(), not a fresh construction, so a same-session
    // leave must not reset the flag or the first-visit gate would replay.
    expect(store.get().waifuUniverseEntered).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/state/entry-flags.test.ts`
Expected: FAIL — `waifuUniverseEntered`/`markWaifuUniverseEntered` undefined.

- [ ] **Step 3: Add the two fields to `AppState`**

In the `// --- companion universe ---` block of `AppState` (after `kaguraFigurineVariantId`, near :268), add:

```ts
  /** True once the visitor has completed the Waifu-universe reveal at least once (persisted). */
  waifuUniverseEntered: boolean;
  /** True once the premium editions have been surfaced this session (not persisted). */
  editionsRevealed: boolean;
```

- [ ] **Step 4: Default them in `initialState`**

After `kaguraFigurineVariantId: DEFAULT_KAGURA_FIGURINE_VARIANT,` (near :414) add:

```ts
  waifuUniverseEntered: false,
  editionsRevealed: false,
```

- [ ] **Step 5: Hydrate and persist `waifuUniverseEntered`**

In the `saved` type literal (near :542–560) add:
```ts
          waifuUniverseEntered?: boolean;
```
In the `this.state = { ...this.state, … }` assignment (near :561–594) add:
```ts
          waifuUniverseEntered: saved.waifuUniverseEntered ?? false,
```
In the `persist()` payload object (near :631–649) add:
```ts
          waifuUniverseEntered: this.state.waifuUniverseEntered,
```
(`editionsRevealed` is deliberately absent from both — it is session-only.)

- [ ] **Step 6: Add the two methods and the leave reset**

Add these methods to the `Store` class (place them near `beginEncounter`, after :673):

```ts
  /** Remember that the Waifu universe has been entered once, for the first-visit gate. */
  markWaifuUniverseEntered(): void {
    if (this.state.waifuUniverseEntered) return;
    this.set({ waifuUniverseEntered: true });
    this.persist();
  }

  /** Surface the premium editions after the character has been met. Session-only. */
  revealEditions(): void {
    if (this.state.editionsRevealed) return;
    this.set({ editionsRevealed: true });
  }
```

`leaveUniverse()` (:1580) does `set({ ...initialState, <preserved keys> })`. Two required edits to its preserved-keys block (:1583–1601):

- **Leave `editionsRevealed` out** of the preserved keys, so the `initialState` default (`false`) flows through and the rail is re-hidden on a fresh entry. (It is session-only; nothing to add.)
- **Add `waifuUniverseEntered: this.state.waifuUniverseEntered`** to the preserved keys. Without this, `initialState` resets the in-memory flag to `false` on every leave, and under the `first-visit` gate a leave-then-re-enter within the same session would wrongly replay the teaser (the persisted copy is only re-read by `new Store()` on a page reload, but the gate reads `store.get()`). Preserving it keeps the in-memory flag consistent with the persisted one.

Confirm by reading :1583–1601 that after the edit `waifuUniverseEntered` is present in the preserved list and `editionsRevealed` is absent.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- tests/state/entry-flags.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Full suite + build**

Run: `npm run build && npm test`
Expected: green (adding optional persisted fields is backward-compatible with saved payloads).

- [ ] **Step 9: Commit**

```bash
git add src/state/store.ts tests/state/entry-flags.test.ts
git commit -m "feat(entry): add first-visit and edition-gating store flags"
```

---

### Task 3: Gallery portal — plane geometry and screen-rect projection

The three module that stands the card up as a lit plane in the room and reports where it lands on screen (so the accessible DOM button can sit on it). The projection math is pure and unit-tested here, de-risking the "button tracks a 3D plane" concern named in spec §6; the visual build is verified in Task 4's browser pass.

**Files:**
- Create: `src/three/gallery-portal.ts`
- Test: `tests/three/gallery-portal.test.ts`

**Interfaces:**
- Consumes: `three`, `CameraRig` and `CamPreset` from [src/three/rig.ts](../../../src/three/rig.ts) / [src/config/cameras.ts](../../../src/config/cameras.ts).
- Produces:
  - `planeScreenRect(camera: THREE.PerspectiveCamera, center: [number,number,number], size: [number,number], viewW: number, viewH: number): { x: number; y: number; w: number; h: number }` — pure; projects the plane's four corners and returns the CSS-pixel bounding rect (origin top-left).
  - `PORTAL_PLANE`: `{ center: [number,number,number]; size: [number,number] }` — where the single card plane stands in the room, framed by `CAMERA_PRESETS.gallery`.
  - `portalDollyPreset(): CamPreset` — the camera pose that ends with the plane filling the frame (feeds `rig.flyTo`).
  - `class GalleryPortal` — `constructor(scene: THREE.Scene)`; `build(textureUrl: string, accentHex: number): void` (loads the texture, falls back to a flat accent plane on error); `setVisible(v: boolean): void`; `rect(camera, viewW, viewH)` (delegates to `planeScreenRect` with `PORTAL_PLANE`); `dispose(): void`.

- [ ] **Step 1: Write the failing test** (pure projection, mirrors [tests/ui/stage-framing.test.ts](../../../tests/ui/stage-framing.test.ts))

```ts
// tests/three/gallery-portal.test.ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS } from '../../src/config/cameras';
import { PORTAL_PLANE, planeScreenRect } from '../../src/three/gallery-portal';

function galleryCamera(w: number, h: number): THREE.PerspectiveCamera {
  const p = CAMERA_PRESETS.gallery;
  const cam = new THREE.PerspectiveCamera(p.fov ?? 40, w / h, 0.1, 100);
  cam.position.set(...p.pos);
  cam.lookAt(...p.target);
  cam.updateMatrixWorld(true);
  return cam;
}

describe('gallery portal projection', () => {
  it('projects the plane to a rect inside the viewport', () => {
    const cam = galleryCamera(1280, 800);
    const r = planeScreenRect(cam, PORTAL_PLANE.center, PORTAL_PLANE.size, 1280, 800);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(1280);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(800);
  });

  it('keeps the rect horizontally centered for a centered plane', () => {
    const cam = galleryCamera(1280, 800);
    const r = planeScreenRect(cam, PORTAL_PLANE.center, PORTAL_PLANE.size, 1280, 800);
    const centerX = r.x + r.w / 2;
    expect(Math.abs(centerX - 640)).toBeLessThan(40);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/three/gallery-portal.test.ts`
Expected: FAIL — cannot resolve `../../src/three/gallery-portal`.

- [ ] **Step 3: Write the implementation**

```ts
// src/three/gallery-portal.ts
//
// The gallery card as a lit plane in the room the camera already occupies.
// planeScreenRect is pure so the accessible DOM overlay can be positioned and
// tested without a browser; GalleryPortal owns the mesh, texture and fallback.

import * as THREE from 'three';
import { CAMERA_PRESETS, type CamPreset } from '../config/cameras';

/** Where the single card plane stands, framed head-on by CAMERA_PRESETS.gallery. */
export const PORTAL_PLANE: { center: [number, number, number]; size: [number, number] } = {
  center: [0, 1.35, 0],
  size: [2.6, 3.4],
};

/** Camera pose whose frustum the plane fills — the dolly's destination. */
export function portalDollyPreset(): CamPreset {
  return { pos: [0, PORTAL_PLANE.center[1], 2.35], target: [0, PORTAL_PLANE.center[1], 0], fov: 46 };
}

/** Project the plane's four corners and return the CSS-pixel bounding rect (top-left origin). */
export function planeScreenRect(
  camera: THREE.PerspectiveCamera,
  center: [number, number, number],
  size: [number, number],
  viewW: number,
  viewH: number
): { x: number; y: number; w: number; h: number } {
  const [cx, cy, cz] = center;
  const [halfW, halfH] = [size[0] / 2, size[1] / 2];
  const corners: [number, number, number][] = [
    [cx - halfW, cy - halfH, cz],
    [cx + halfW, cy - halfH, cz],
    [cx - halfW, cy + halfH, cz],
    [cx + halfW, cy + halfH, cz],
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const c of corners) {
    v.set(...c).project(camera);
    const sx = (v.x * 0.5 + 0.5) * viewW;
    const sy = (-v.y * 0.5 + 0.5) * viewH;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export class GalleryPortal {
  private group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private texture: THREE.Texture | null = null;

  constructor(private scene: THREE.Scene) {
    this.group.visible = false;
    this.scene.add(this.group);
  }

  build(textureUrl: string, accentHex: number): void {
    const geo = new THREE.PlaneGeometry(PORTAL_PLANE.size[0], PORTAL_PLANE.size[1]);
    const mat = new THREE.MeshBasicMaterial({ color: accentHex, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(...PORTAL_PLANE.center);
    this.group.add(this.mesh);
    // Swap in the art when it arrives; a 404 leaves the flat accent plane.
    new THREE.TextureLoader().load(
      textureUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.texture = tex;
        mat.color.set(0xffffff);
        mat.map = tex;
        mat.needsUpdate = true;
      },
      undefined,
      () => { /* keep the accent fallback */ }
    );
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  rect(camera: THREE.PerspectiveCamera, viewW: number, viewH: number) {
    return planeScreenRect(camera, PORTAL_PLANE.center, PORTAL_PLANE.size, viewW, viewH);
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    (this.mesh?.material as THREE.Material | undefined)?.dispose();
    this.texture?.dispose();
    this.group.removeFromParent();
    this.mesh = null;
    this.texture = null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/three/gallery-portal.test.ts`
Expected: PASS (2 tests). If the centered-rect assertion is off, adjust `PORTAL_PLANE.center`/`portalDollyPreset` numbers — they are framing constants, not contracts, and the browser pass in Task 4 is the final arbiter.

- [ ] **Step 5: Build + full suite**

Run: `npm run build && npm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/three/gallery-portal.ts tests/three/gallery-portal.test.ts
git commit -m "feat(entry): add gallery portal plane and screen-rect projection"
```

---

### Task 4: Reduce the card and drive the dolly into the portal

Wire the portal into the app: reduce the gallery card to image + name, filter to the visible universes, mount the portal plane, and replace the CSS inflate with a `rig.flyTo` dolly. Browser-verified (DOM + three; not unit-testable in the Node env).

**Files:**
- Modify: `src/ui/steps.ts` — `galleryStep` (:363–452): use `visibleUniverses()`, strip the card to image + name, drop the `--enter-*` inflate logic; the `<button>` becomes the accessible overlay.
- Modify: `src/main.ts` — `App`: instantiate `GalleryPortal` (build it after the boot settle, near :266–275), show it during `step === 'gallery'`, hide it otherwise (extend the existing `store.subscribe` at :277); in `openUniverse` (:506) for the companion branch, run `this.rig.flyTo(portalDollyPreset(), reducedMotion ? 0 : 0.9)` before `store.goto('companion-teaser')` instead of relying on the CSS class.
- Modify: `src/styles.css` — remove the `.is-entering` inflate rules (:472–483) and the now-unused tile sub-elements; keep the card image + name styles.
- Modify: `src/ui/actions.ts` — none expected (`openUniverse` already exists).

**Interfaces:**
- Consumes: `visibleUniverses` (Task 1), `GalleryPortal` / `portalDollyPreset` (Task 3), `rig.flyTo` ([rig.ts:76](../../../src/three/rig.ts:76)).
- Produces: no new exported symbols; behavioural change only.

- [ ] **Step 1: Reduce the card in `galleryStep`**

Replace the tile body so each card carries only the poster and the universe name. Iterate `visibleUniverses()` instead of `UNIVERSES`. Remove the overline (mode/meta), tagline and action rows. Remove the click handler's `--enter-x/y/scale` block and the `gallery.classList.add('is-entering')` line; the click now calls `actions.openUniverse(u.id)` directly (the dolly is owned by `main.ts`). Keep the `<button>` element, its `data-testid`, `aria-label` (`${u.name}`), and `--accent`.

- [ ] **Step 2: Mount and toggle the portal in `main.ts`**

In the constructor, after the boot settle, create `this.galleryPortal = new GalleryPortal(this.engine.scene)` and `this.galleryPortal.build(<waifu poster url>, universeById('waifu-universe').accentColor)`. Use the Waifu universe's `galleryPreviews[0].url` (`assets/open-chat/kagura-opening-reflection.webp`) as the texture. In the existing `store.subscribe`, add `this.galleryPortal.setVisible(s.step === 'gallery')`.

- [ ] **Step 3: Drive the dolly in `openUniverse`**

In the companion branch of `openUniverse` (:512), before `store.goto('companion-teaser')`, add:

```ts
this.galleryPortal.setVisible(true);
await this.rig.flyTo(portalDollyPreset(), this.engine.reducedMotion ? 0 : 0.9);
```

Make `openUniverse` async (or wrap the tail in an IIFE as `finishCompanionTeaser` does at :1089). Guard against re-entry with the existing `store.get().transitioning` check already at the top of the method.

- [ ] **Step 4: Remove the CSS inflate**

Delete the `.step-gallery.is-entering …` and `.universe-tile.is-entering` blocks (:472–483) and any tile-body/overline/tagline/action rules that no longer have markup. Leave `.universe-grid`, `.universe-tile`, `.tile-poster` and the poster `img` rules.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: no type errors. Fix any (e.g. `openUniverse` return type, unused imports in `steps.ts`).

- [ ] **Step 6: Browser-verify the card + dolly**

```bash
npm run dev
```
Then, via the preview browser: `preview_start {name: "<dev server from .claude/launch.json>"}` (create the launch config if absent, port from `vite`). Load the gallery. Verify with `read_page` that the card shows only the poster and the universe name (no mode/tagline/CTA). `computer` click the card; `read_console_messages` for errors; `computer {action:"screenshot"}` mid-dolly and on teaser mount to confirm the camera pushes *into* the plane and the teaser inherits the framing (no pop). Confirm Afterburn is absent from the gallery.

- [ ] **Step 7: Commit**

```bash
git add src/ui/steps.ts src/main.ts src/styles.css
git commit -m "feat(entry): reduce the card and dolly the camera into the portal"
```

---

### Task 5: Unify the teaser, remove skip, apply the gate

One teaser owner, unskippable, gated by `shouldPlayTeaser`. Deletes the duplicated in-stage teaser and the skip affordance; re-points the failsafe to advance the shot. Browser-verified.

**Files:**
- Modify: `src/ui/steps.ts` — `companionTeaserStep` (:456–520): remove the skip button, its `hidden` toggle timer and handler; keep the play/ended/error wiring. Delete the duplicated teaser block inside `stageStep` (:597–631) and any now-dead references to it in `stageStep`'s markup/update.
- Modify: `src/main.ts` — `openUniverse` companion branch: consult `shouldPlayTeaser(store.get().waifuUniverseEntered)`. If false, skip `companion-teaser` and go straight into the reveal path (call the same code `finishCompanionTeaser` runs, or `store.goto('companion-teaser')` immediately followed by `finishCompanionTeaser()`); if true, mount the teaser as today. Re-point the 7 s failsafe at [main.ts:1117](../../../src/main.ts:1117) comment to reflect "advance the shot," not "let them skip."
- Modify: `src/styles.css` — remove `.teaser-skip` rules if present.

**Interfaces:**
- Consumes: `shouldPlayTeaser` (Task 1), `waifuUniverseEntered` (Task 2).
- Produces: behavioural change only.

- [ ] **Step 1: Remove the skip from `companionTeaserStep`**

Delete the `skip` button element, the `skipTimer` `setTimeout`/`clearTimeout`, and the `skip.addEventListener` handler. Keep `play`, `finish` (on `ended`/`error`), and `playVideo`. The video remains `muted`/`playsInline` and autoplays via `startTimer`.

- [ ] **Step 2: Delete the duplicate teaser in `stageStep`**

Remove the `teaserVideo`/`teaserPlay`/`teaserSkip`/`teaser`/`finalFrame` block at :597–636 that duplicates `companionTeaserStep`, and remove its node from `stageStep`'s returned tree. Leave the `premiumTeaser` (that is the edition slash-reveal, a different feature) and the reveal `thawFx`. Verify by search that no remaining code references the removed identifiers.

- [ ] **Step 3: Gate the teaser in `openUniverse`**

In the companion branch, wrap the teaser mount:

```ts
if (shouldPlayTeaser(store.get().waifuUniverseEntered)) {
  store.set({ companionMode: 'teaser', figurineDisplayMode: 'original' });
  this.setPlinthsVisible(false);
  store.goto('companion-teaser');
} else {
  // Cached return visit: no video to load, go straight to the reveal.
  store.set({ companionMode: 'teaser', figurineDisplayMode: 'original' });
  this.setPlinthsVisible(false);
  store.goto('companion-teaser');
  this.finishCompanionTeaser();
}
```

(Default `TEASER_GATE='always'` makes the first branch the live path; the else branch ships dormant per the spec.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no type errors; no unresolved identifiers from the deleted block.

- [ ] **Step 5: Browser-verify**

`npm run dev` + preview. Enter the universe; confirm the teaser plays with **no skip button** at any point, plays through, and hands to the reveal. Temporarily flip `TEASER_GATE` to `'first-visit'` in `src/config/entry.ts`, reload after a first completed entry, and confirm the video is bypassed; then restore `'always'`. `read_console_messages` for errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/steps.ts src/main.ts src/styles.css
git commit -m "feat(entry): unify the teaser, remove skip, gate on first visit"
```

---

### Task 6: Reveal lands on her alone; editions withheld

The character-first landing (spec §5) and item 4's UX pass. The reveal lands on the figurine and one quiet PRESS TO TALK; the premium rail stays hidden until `enterPlayground` or a no-engagement timeout. Uses `design-taste-frontend` for the motion/composition. Browser-verified.

**Files:**
- Modify: `src/main.ts` — `finishCompanionTeaser` (:1064): on completion call `store.markWaifuUniverseEntered()`. `enterPlayground` (:1120): call `store.revealEditions()`. Add a no-engagement timeout when the reveal settles into `showcase` (:1093) that calls `store.revealEditions()` after N ms (set N during the design-taste pass; start at 9000).
- Modify: `src/styles.css` — gate `.product-rail` / `.return-original` visibility on the new state. Today they show in `[data-companion-mode='showcase']`; add a requirement that editions are revealed. Introduce a `data-editions` attribute on the step root.
- Modify: `src/ui/steps.ts` — `stageStep`: set `el.dataset.editions = state.editionsRevealed ? 'shown' : 'hidden'` in the `update` path (alongside the existing `el.dataset.figurineDisplay`/`companionMode` writes near :1603).

**Interfaces:**
- Consumes: `markWaifuUniverseEntered`, `revealEditions`, `editionsRevealed` (Task 2).
- Produces: behavioural + CSS-state change only.

- [ ] **Step 1: Invoke design-taste-frontend**

Announce and load `superpowers:design-taste-frontend` (or the project's `/design-taste-frontend`). Apply it to the reveal landing: the figurine is the only element resolving into focus; PRESS TO TALK is quiet and secondary; the rail's later entrance is a deliberate reveal, not a pop. Capture the chosen timings (pull-out easing already exists in `finishCompanionTeaser`; set the no-engagement timeout N and the rail entrance transition here).

- [ ] **Step 2: Set the flags at the right beats**

In `finishCompanionTeaser`, inside the `pullOut` success path where it sets `companionMode: 'showcase'` (:1093), add `store.markWaifuUniverseEntered();` and start a timer: `window.setTimeout(() => { if (store.get().step === 'stage' && store.get().companionMode === 'showcase') store.revealEditions(); }, 9000);` (store the id to clear on teardown). In `enterPlayground` (:1123), add `store.revealEditions();` before/after the mode switch.

- [ ] **Step 3: Gate the rail in CSS + steps**

In `stageStep`'s update path (near :1603), add `el.dataset.editions = s.editionsRevealed ? 'shown' : 'hidden';`. In `styles.css`, change the product-rail reveal rule so `showcase` alone no longer shows it — require `[data-editions='shown']` (or `[data-figurine-display='premium'|'premium-preview']`, which is the edition-selected state and should still show it). The reveal landing (`showcase` + `editions=hidden`) shows only the figurine and PRESS TO TALK.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 5: Browser-verify the landing sequence**

`npm run dev` + preview. Enter → watch teaser → reveal. `computer {action:"screenshot"}` the instant the reveal settles: confirm **only** the figurine + PRESS TO TALK are visible, **no** edition rail. Click PRESS TO TALK (`data-testid="press-to-talk"`); screenshot again and confirm the rail now enters. Reload, enter again, and instead of clicking wait ~9 s; confirm the rail enters on the timeout. `read_console_messages` for errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/styles.css src/ui/steps.ts
git commit -m "feat(entry): land the reveal on the character, withhold editions until met"
```

---

## Self-Review

**Spec coverage:**
- §2 one-shot sequence → Tasks 3+4 (portal + dolly), 5 (teaser), 6 (reveal). ✓
- §3 teaser gate (`TEASER_GATE`, first-visit flag) → Task 1 (`shouldPlayTeaser`), Task 2 (`waifuUniverseEntered`), Task 5 (application). ✓
- §4 card reduction + Afterburn gated → Task 1 (`visibleUniverses`), Task 4 (card markup + filter). ✓
- §5 reveal landing + rail suppression → Task 2 (`editionsRevealed`), Task 6. ✓
- §6 error handling: portal 404 fallback → Task 3 (`build` error path); video/failsafe → Task 5; reducedMotion → Tasks 4/6 use `reducedMotion ? 0` durations; DOM-rect fallback → Task 3 pure `planeScreenRect` + Task 4 overlay, with the full-screen-click-layer fallback available if tracking is ugly. ✓
- §7 components: `gallery-portal.ts` (T3), `entry.ts` (T1), `galleryStep`/`finishCompanionTeaser`/`stageStep`/store/css edits (T2,4,5,6). ✓
- §8 verification: gate switch (T1), gallery filter (T1), rail suppression (T2) are the three unit-tested items; visuals browser-verified per task. ✓
- §9 non-goals: no teaser-content change, no variant restyle, no purchase — none of the tasks touch these. ✓

**Placeholder scan:** No TBD/TODO. The one deliberately-open number (rail timeout N) is given a concrete start value (9000 ms) and assigned to the design-taste pass in Task 6 — a decision point, not a placeholder. Camera framing constants in Task 3 are marked adjustable against the browser pass.

**Type consistency:** `waifuUniverseEntered`/`editionsRevealed`/`markWaifuUniverseEntered`/`revealEditions` used identically across Tasks 2, 5, 6. `visibleUniverses`/`shouldPlayTeaser`/`TEASER_GATE` identical across Tasks 1, 4, 5. `PORTAL_PLANE`/`planeScreenRect`/`portalDollyPreset`/`GalleryPortal` identical across Tasks 3, 4. ✓

**Note on the dormant first-visit branch:** Task 5's else-branch is unreachable under the shipped `TEASER_GATE='always'`. It is built now, per spec §3, and exercised only by the temporary flag flip in Task 5 Step 5. This is intended, not dead-code-by-accident.
