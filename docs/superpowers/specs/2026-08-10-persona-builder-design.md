# Persona Builder — Design Spec

- **Date:** 2026-08-10
- **Repo:** heymate-onboarding
- **Scope:** Replace the single free-text `persona` field in the session sheet with a structured, session-scoped **Persona Builder** (sliders + single-choice) that compiles to a Vietnamese `anh/em` instruction, plus an Advanced full-override editor.
- **Status:** Approved in brainstorming; pending user review of this spec.

## 1. Motivation

Today the session sheet exposes one free-text `<textarea>` (`session.persona`, max 180 chars, [src/ui/steps.ts:562](../../../src/ui/steps.ts)) that compiles into a single prompt line ([src/chat/prompt.ts:773](../../../src/chat/prompt.ts)). We want a guided persona configuration — the way a user tunes *how the companion shows up for them* — while keeping a power-user escape hatch.

## 2. Goals / Non-goals

**Goals**
- 7 tunable dimensions, session-scoped, Vietnamese `anh/em` voice.
- Live preview of the compiled instruction.
- Advanced → Edit instructions: manual edit **fully overrides** the compiled text.
- Reuse the existing length slider (`session.length`) — no duplicate state.
- Backward-compatible migration of old free-text `persona`.

**Non-goals**
- No change to the `bond` / canon / rapport systems.
- No persistent cross-session profile persona (session scope only).
- No change to identity or scenario fields.
- The Relationship dimension is a **session relational frame** — it sets rhythm/posture but must not override canon or the bond `forbidden` list.

## 3. Dimensions

`session.length` (existing) is surfaced inside the panel as dimension 6; the other six are new and stored in `session.personaTraits`.

| # | Trait key | Control | VN label | Values (id → VN phrase used in compile) |
|---|-----------|---------|----------|------------------------------------------|
| 1 | `tone` | Slider (continuous 0–100) | Giọng em với anh | band `<34` "nói dịu dàng, mềm mỏng" · `34–66` "nói vừa phải, không quá mềm cũng không quá gắt" · `>66` "nói thẳng, ít vòng vo" |
| 2 | `problem` | Slider 3 nấc | Khi anh có chuyện | `listen` "khi anh có chuyện, em nghe anh nói trước đã, chưa vội khuyên" · `solve` "…em cùng anh gỡ, đưa hướng cụ thể" · `challenge` "…em dám thách lại anh, không dỗ cho qua" |
| 3 | `energy` | Slider 3 nấc | Năng lượng | `calm` "giữ năng lượng điềm tĩnh" · `balanced` "năng lượng cân bằng" · `energetic` "mang năng lượng sôi nổi" |
| 4 | `humor` | Single-choice | Hài hước | `dry` "đùa kiểu tỉnh khô" · `playful` "đùa vui, nhẹ nhàng" · `chaotic` "đùa kiểu lầy, hơi loạn một chút" · `minimal` "ít đùa, giữ chừng mực" |
| 5 | `proactive` | Slider 3 nấc | Mức chủ động | `called` "chỉ chủ động khi anh gọi" · `sometimes` "thỉnh thoảng chủ động khơi chuyện" · `often` "chủ động thường xuyên, không đợi anh gọi" |
| 6 | `length` *(existing `session.length`)* | Slider 3 nấc | Độ dài phản hồi | `short` · `natural` · `expressive` — unchanged; keeps its own `LENGTH_TEXT` prompt line |
| 7 | `relationship` | Single-choice + "Khác…" | Vai của em với anh | `friend` "một người bạn" · `companion` "người đồng hành" · `mentor` "người dẫn dắt" · `rival` "một đối thủ của anh" · `custom` → `relationshipCustom` |

**Defaults:** `tone:50`, `problem:'solve'`, `energy:'balanced'`, `humor:'playful'`, `proactive:'sometimes'`, `relationship:'companion'`, `relationshipCustom:''`. `length` default stays `'natural'`.

3-nấc sliders encode as index `0|1|2` mapped to the ordered id list.

## 4. State (`src/state/store.ts`)

Extend `SessionSetup`:

```ts
export interface PersonaTraits {
  tone: number;                 // 0..100
  problem: 'listen' | 'solve' | 'challenge';
  energy: 'calm' | 'balanced' | 'energetic';
  humor: 'dry' | 'playful' | 'chaotic' | 'minimal';
  proactive: 'called' | 'sometimes' | 'often';
  relationship: 'friend' | 'companion' | 'mentor' | 'rival' | 'custom';
  relationshipCustom: string;   // used only when relationship === 'custom'
}
// added to SessionSetup:
personaTraits: PersonaTraits;
personaOverride: boolean;   // true once the Advanced textarea is hand-edited
// persona: string           // KEPT — now holds the compiled instruction OR the manual override
```

**Single source of truth:** `session.persona` (string) is always what the prompt sends. When `personaOverride === false`, the store recompiles `persona` from `personaTraits` + `length` on every relevant change (`recompilePersona()`). When `personaOverride === true`, trait/length changes do **not** touch `persona`.

**Migration** (`fromSaved` / `defaultSession`):
- New session → `personaTraits = defaults`, `personaOverride = false`, `persona = compilePersona(defaults, 'natural')`.
- Loaded session with a non-empty legacy `persona` string but no `personaTraits` → keep the old string, set `personaOverride = true`, `personaTraits = defaults`. (No data loss; the old text becomes the manual override.)
- Loaded session with `personaTraits` present → use as saved.

## 5. Compile (`src/config/persona.ts`, new)

```ts
export function compilePersona(t: PersonaTraits, length: LengthId): string
```

Output = two Vietnamese sentences:

1. **Traits line:** `Lần này anh muốn em: {tone}; {problem}; {energy}; {humor}; {proactive}.`
2. **Relationship frame:** `Phiên này em ở bên anh trong vai {relationship} — khung này định nhịp cho lần gặp, không đổi canon hay ranh giới hai người.`

`relationshipCustom` is sanitized: trim, collapse whitespace, strip quotes, slice to 40 chars; if empty when `relationship==='custom'`, fall back to `'người đồng hành'`.

Length is **not** repeated inside the compiled string (it already has its own `- Độ dài: …` prompt line); the length slider lives in the panel for grouping only.

## 6. Prompt injection (`src/chat/prompt.ts`)

- Raise the `persona` cap at [prompt.ts:697](../../../src/chat/prompt.ts) from `180` to `600` (compiled text is longer).
- The existing block at lines 773–775 stays structurally the same — it already reads the `persona` string — now it carries the compiled/override instruction. No new prompt lines; `mode.ts` continues to pass `session.persona` unchanged.
- Line 772's guard ("không đổi canon, không đổi ranh giới") already frames the whole session block; the relationship-frame sentence reinforces it.

## 7. UI (`src/ui/steps.ts`, `src/config/copy.ts`, `src/styles.css`)

Replace the `sessionContext` persona block (steps.ts ~661–668) with a **persona panel** (reuse existing `.personalize-panel`):

- **Slider rows** for `tone` (continuous), `problem`, `energy`, `proactive` (3-nấc with tick labels) + the **existing** length slider moved/grouped in.
  - Add a small `traitSlider(label, stops[], value, onChange)` helper mirroring the existing `lengthSlider`/`lengthValue` pattern (steps.ts ~669–687), with an `<output>` showing the active stop label and `aria-valuetext`.
- **Single-choice** for `humor` and `relationship` via the existing `segment()` helper; `relationship` adds a "Khác…" option that reveals an inline `<input>` bound to `relationshipCustom` (same show/hide idiom as `identityCustom`).
- **Live preview**: a read-only element under the controls showing `session.persona`, updated on every change. When `personaOverride` is true, show it dimmed with a note "Đang dùng bản chỉnh tay".
- **Advanced disclosure**: `<details class="persona-advanced">` summary "Nâng cao → Chỉnh tay lời dặn" → the `<textarea>` (repurpose current `personaInput`, `maxlength` 600) bound to `session.persona`; on `input` set `personaOverride=true`. A "Khôi phục theo thanh trượt" button clears override, recompiles, and re-renders controls.
- Copy strings (labels, stop labels, notes, custom placeholder, advanced summary, restore button) go in `COPY.stage` / a new `COPY.persona` group.
- Rehydration (steps.ts ~1109 & ~1137): set slider/segment/textarea state from `s.session.personaTraits` + `s.session.persona`, guarding the focused element as the current code does for `personaInput`.

## 8. Files touched

`src/config/persona.ts` (new) · `src/config/copy.ts` · `src/state/store.ts` · `src/chat/prompt.ts` · `src/ui/steps.ts` · `src/styles.css` · tests.

## 9. Testing

- **Unit** (`compilePersona`): each trait id → expected VN fragment; custom relationship sanitize + empty fallback; full two-sentence assembly for a representative combo.
- **Migration**: legacy `persona` string → `personaOverride=true`, traits=defaults; new session → compiled non-empty; saved traits round-trip.
- **Override behavior**: editing textarea sets override and freezes recompile; "Khôi phục" clears it and recompiles from current sliders.
- **DOM/e2e** (existing `tests/`): panel renders all 7 controls; changing a slider updates the live preview; `data-testid` hooks preserved (`session-persona` on the advanced textarea).

## 10. Acceptance criteria

1. Session sheet shows 7 persona controls (5 sliders incl. length, 2 single-choice) in Vietnamese `anh/em` voice.
2. Live preview reflects the compiled instruction and updates on any change.
3. Advanced textarea edit fully overrides; sliders no longer alter the sent text until "Khôi phục theo thanh trượt".
4. Compiled persona reaches the model via `session.persona` with the 600-char cap; canon/boundary guard intact.
5. Old sessions with free-text persona load without data loss (as override).
6. `bond` / rapport / identity / scenario behavior unchanged.
7. Unit + migration + DOM tests pass; `npm run build` / typecheck clean.
