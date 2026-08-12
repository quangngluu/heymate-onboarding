# Persona Seed + Improvised Canon Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 33,400-character authored canon prompt with a ~1,830-character invariant seed for Kagura, and let the model record what it improvises into a per-user canon ledger that is retrieved back under a hard budget.

**Architecture:** The system prompt is built **server-side** in `api/chat.ts` and `api/quest.ts`. The canon ledger lives in browser `localStorage`. So the client performs retrieval against the user's message and sends an already-budgeted `string[]` up with the request; the server injects it. Write-back rides the existing `<<state …>>` trailer that the model already emits every turn — no new call, no new round-trip. The seed path runs behind a server env flag alongside the old path.

**Tech Stack:** TypeScript 5.6, Vite 5.4, Vitest 3.2, Vercel Edge Functions.

## Global Constraints

- Retrieval ceiling is an architectural invariant: **800 characters / 12 entries**, at any ledger size.
- Write-back cap: **2 entries per turn**.
- Seed prompt per resident: **under 3,000 characters** (target ~2,500).
- Canon ledger total cap stays at the existing **240 entries** (`.slice(-240)`).
- All prose in seeds and prompts is Vietnamese, `anh/em` register — matching existing files.
- Never delete existing canon files. Demotion happens after the gate (§Gate), not in this plan.
- Existing suite must stay green: `npm run build && npm test` (38 files, 210 passing, 15 todo).
- Run all commands from `heymate-onboarding/`.

---

### Task 1: Widen `CanonLedgerEntry` for chat-born facts

`CanonLedgerEntry` currently requires `questId` and `nodeId`, so nothing born in free chat can be stored. Widen it rather than adding a parallel type, and add the two fields retrieval scoring needs.

**Files:**
- Modify: `src/state/store.ts:106-114` (interface), `src/state/store.ts:524-545` (persist migration)
- Test: `tests/state/canon-ledger-chat.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CanonLedgerEntry` with `source: 'quest' | 'chat'`, optional `questId`/`nodeId`, optional `refCount`/`lastUsedAt`; `Store.recordImprovisedCanon(residentId: ResidentId, facts: ImprovisedFact[]): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/state/canon-ledger-chat.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/state/store';

describe('chat-born canon ledger entries', () => {
  beforeEach(() => localStorage.clear());

  it('records improvised facts without a quest', () => {
    const store = new Store();
    store.recordImprovisedCanon('kagura', [
      { kind: 'place', text: 'Quán mì dưới cầu vượt, nơi em hay ngồi cuối ca.' },
    ]);

    const entries = store.get().canonLedger;
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('chat');
    expect(entries[0].questId).toBeUndefined();
    expect(entries[0].nodeId).toBeUndefined();
    expect(entries[0].refCount).toBe(0);
  });

  it('caps the ledger at 240 entries', () => {
    const store = new Store();
    for (let i = 0; i < 130; i += 1) {
      store.recordImprovisedCanon('kagura', [
        { kind: 'object', text: `vật thể ${i}` },
        { kind: 'habit', text: `thói quen ${i}` },
      ]);
    }
    expect(store.get().canonLedger).toHaveLength(240);
    expect(store.get().canonLedger.at(-1)?.text).toBe('thói quen 129');
  });

  it('defaults legacy persisted entries to the quest source', () => {
    localStorage.setItem(
      'heymate.progress.sao.v1',
      JSON.stringify({
        canonLedger: [
          {
            id: 'legacy-1',
            residentId: 'kagura',
            questId: 'q1',
            nodeId: 'n1',
            canonType: 'branch',
            text: 'cũ',
            createdAt: 1,
          },
        ],
      })
    );

    const store = new Store();
    expect(store.get().canonLedger[0].source).toBe('quest');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state/canon-ledger-chat.test.ts`
Expected: FAIL — `store.recordImprovisedCanon is not a function`.

- [ ] **Step 3: Widen the interface**

In `src/state/store.ts`, replace the `CanonLedgerEntry` interface at line 106:

```ts
export interface CanonLedgerEntry {
  id: string;
  residentId: ResidentId;
  /** Absent for facts improvised during free chat. */
  questId?: string;
  /** Absent for facts improvised during free chat. */
  nodeId?: string;
  canonType: CanonType;
  text: string;
  createdAt: number;
  /** Where this fact came from. Legacy persisted entries default to 'quest'. */
  source: 'quest' | 'chat';
  /** How many times retrieval has surfaced this entry. Ranking input. */
  refCount?: number;
  /** When retrieval last surfaced it. Ranking input. */
  lastUsedAt?: number;
}
```

- [ ] **Step 4: Migrate legacy persisted entries**

In `src/state/store.ts`, at the load site around line 544, replace `canonLedger: saved.canonLedger ?? [],` with:

```ts
canonLedger: (saved.canonLedger ?? []).map((entry) => ({
  ...entry,
  source: entry.source ?? 'quest',
})),
```

Widen the local persisted-shape type at line 524 to match:

```ts
canonLedger?: (Omit<CanonLedgerEntry, 'source'> & { source?: 'quest' | 'chat' })[];
```

- [ ] **Step 5: Add the writer method**

In `src/state/store.ts`, add to the `Store` class next to the existing quest ledger writer (near line 1457):

```ts
/**
 * Record what she just invented in free chat. Quest keeps its own writer;
 * this one exists because improvised facts have no quest or node to hang on.
 */
recordImprovisedCanon(residentId: ResidentId, facts: ImprovisedFact[]): void {
  if (facts.length === 0) return;
  const createdAt = Date.now();
  const added = facts.map((fact, i) => ({
    id: `chat:${residentId}:${createdAt}:${this.state.canonLedger.length + i}`,
    residentId,
    canonType: 'player-created' as CanonType,
    text: fact.text,
    createdAt,
    source: 'chat' as const,
    refCount: 0,
  }));
  this.set({ canonLedger: [...this.state.canonLedger, ...added].slice(-240) });
  this.persist();
}
```

Add the import at the top of `src/state/store.ts`:

```ts
import type { ImprovisedFact } from '../chat/improvised-canon';
```

**Task 2 is a prerequisite for this task** — it creates `ImprovisedFact`. Execution order is 2 → 1 → 3 → 4 → 5 → 6. The import is type-only, so the resulting store ↔ improvised-canon cycle erases at compile time.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/state/canon-ledger-chat.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions from the widened type.

- [ ] **Step 8: Commit**

```bash
git add src/state/store.ts tests/state/canon-ledger-chat.test.ts
git commit -m "feat: allow chat-born entries in the canon ledger"
```

---

### Task 2: Improvised-canon sanitizer

Parse the new `canon` field off the model's `<<state>>` trailer. This mirrors `contextVisualIntentFromState` in `src/chat/context-visual.ts:65` exactly — same defensive shape, same redaction regex.

**Files:**
- Create: `src/chat/improvised-canon.ts`
- Modify: `src/chat/context-visual.ts:54` (export the shared regex)
- Test: `tests/chat/improvised-canon.test.ts` (create)

**Interfaces:**
- Consumes: `DIRECT_IDENTIFIER_RE` from `src/chat/context-visual.ts`.
- Produces: `ImprovisedFact { kind: ImprovisedCanonKind; text: string }`, `IMPROVISED_CANON_KINDS`, `IMPROVISED_CANON_PER_TURN = 2`, `improvisedCanonFromState(state: unknown): ImprovisedFact[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/chat/improvised-canon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { improvisedCanonFromState } from '../../src/chat/improvised-canon';

describe('improvisedCanonFromState', () => {
  it('returns an empty list when the model reports nothing', () => {
    expect(improvisedCanonFromState({ canon: null })).toEqual([]);
    expect(improvisedCanonFromState({})).toEqual([]);
    expect(improvisedCanonFromState(null)).toEqual([]);
  });

  it('reads well-formed facts', () => {
    const facts = improvisedCanonFromState({
      canon: [{ kind: 'place', text: '  Quán mì   dưới cầu vượt.  ' }],
    });
    expect(facts).toEqual([{ kind: 'place', text: 'Quán mì dưới cầu vượt.' }]);
  });

  it('caps at two entries per turn', () => {
    const facts = improvisedCanonFromState({
      canon: [
        { kind: 'place', text: 'một' },
        { kind: 'object', text: 'hai' },
        { kind: 'person', text: 'ba' },
      ],
    });
    expect(facts).toHaveLength(2);
  });

  it('drops unknown kinds and empty text', () => {
    const facts = improvisedCanonFromState({
      canon: [
        { kind: 'spaceship', text: 'không hợp lệ' },
        { kind: 'place', text: '   ' },
        { kind: 'event', text: 'hợp lệ' },
      ],
    });
    expect(facts).toEqual([{ kind: 'event', text: 'hợp lệ' }]);
  });

  it('drops entries carrying direct identifiers', () => {
    const facts = improvisedCanonFromState({
      canon: [
        { kind: 'place', text: 'ghé https://example.com nhé' },
        { kind: 'person', text: 'mail cho a@b.com' },
        { kind: 'habit', text: 'em dậy trước bình minh' },
      ],
    });
    expect(facts).toEqual([{ kind: 'habit', text: 'em dậy trước bình minh' }]);
  });

  it('truncates overlong text', () => {
    const facts = improvisedCanonFromState({
      canon: [{ kind: 'place', text: 'x'.repeat(400) }],
    });
    expect(facts[0].text).toHaveLength(160);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat/improvised-canon.test.ts`
Expected: FAIL — cannot resolve `../../src/chat/improvised-canon`.

- [ ] **Step 3: Export the shared redaction regex**

In `src/chat/context-visual.ts` line 54, add the `export` keyword:

```ts
export const DIRECT_IDENTIFIER_RE = /(?:https?:\/\/|www\.|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+?\d[\s().-]*){8,})/iu;
```

- [ ] **Step 4: Write the implementation**

Create `src/chat/improvised-canon.ts`:

```ts
// What she invents in free chat, and how it comes back.
//
// The old prompt forbade invention outright ("Bốn danh sách trên là toàn bộ
// thế giới em biết"). The seed drops that rule, so consistency is no longer
// authored up front — it accumulates here, per visitor.

import { DIRECT_IDENTIFIER_RE } from './context-visual';

export const IMPROVISED_CANON_KINDS = [
  'place',
  'person',
  'object',
  'event',
  'habit',
] as const;

export type ImprovisedCanonKind = (typeof IMPROVISED_CANON_KINDS)[number];

export interface ImprovisedFact {
  kind: ImprovisedCanonKind;
  text: string;
}

/** Hard cap per turn, so one reply cannot flood the ledger. */
export const IMPROVISED_CANON_PER_TURN = 2;

const MAX_FACT_CHARS = 160;

function isKind(value: unknown): value is ImprovisedCanonKind {
  return (
    typeof value === 'string' &&
    (IMPROVISED_CANON_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Read the optional invented-fact list from the model's private state
 * envelope. Malformed input is dropped silently: a bad envelope must never
 * cost the visitor their reply.
 */
export function improvisedCanonFromState(state: unknown): ImprovisedFact[] {
  if (!state || typeof state !== 'object') return [];
  const candidate = (state as { canon?: unknown }).canon;
  if (!Array.isArray(candidate)) return [];

  const facts: ImprovisedFact[] = [];
  for (const raw of candidate) {
    if (facts.length >= IMPROVISED_CANON_PER_TURN) break;
    if (!raw || typeof raw !== 'object') continue;
    const input = raw as Record<string, unknown>;
    if (!isKind(input.kind)) continue;
    const text =
      typeof input.text === 'string'
        ? input.text.replace(/\s+/gu, ' ').trim().slice(0, MAX_FACT_CHARS)
        : '';
    if (!text || DIRECT_IDENTIFIER_RE.test(text)) continue;
    facts.push({ kind: input.kind, text });
  }
  return facts;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/chat/improvised-canon.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/chat/improvised-canon.ts src/chat/context-visual.ts tests/chat/improvised-canon.test.ts
git commit -m "feat: parse improvised canon from the model state envelope"
```

---

### Task 3: Retrieval under a hard ceiling

If the whole ledger were reloaded, ~200 turns would rebuild the 33,000-character problem we are removing. Retrieval is therefore budgeted, and the budget is asserted by test.

**Files:**
- Modify: `src/chat/improvised-canon.ts` (extend)
- Test: `tests/chat/improvised-canon-retrieval.test.ts` (create)

**Interfaces:**
- Consumes: `CanonLedgerEntry` from `src/state/store.ts` (Task 1).
- Produces: `IMPROVISED_CANON_CHAR_BUDGET = 800`, `IMPROVISED_CANON_MAX_ENTRIES = 12`, `relevantImprovisedCanon(entries: CanonLedgerEntry[], residentId: string, message: string): string[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/chat/improvised-canon-retrieval.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  IMPROVISED_CANON_CHAR_BUDGET,
  IMPROVISED_CANON_MAX_ENTRIES,
  relevantImprovisedCanon,
} from '../../src/chat/improvised-canon';
import type { CanonLedgerEntry } from '../../src/state/store';

function entry(over: Partial<CanonLedgerEntry> & { text: string }): CanonLedgerEntry {
  return {
    id: over.id ?? over.text,
    residentId: (over.residentId ?? 'kagura') as CanonLedgerEntry['residentId'],
    canonType: 'player-created',
    createdAt: over.createdAt ?? 0,
    source: 'chat',
    ...over,
  } as CanonLedgerEntry;
}

describe('relevantImprovisedCanon', () => {
  it('returns nothing for an empty ledger', () => {
    expect(relevantImprovisedCanon([], 'kagura', 'chào em')).toEqual([]);
  });

  it('excludes other residents', () => {
    const ledger = [entry({ text: 'của rin', residentId: 'rin' })];
    expect(relevantImprovisedCanon(ledger, 'kagura', 'rin')).toEqual([]);
  });

  it('prefers entries the message actually touches', () => {
    const ledger = [
      entry({ text: 'Em ghét cà phê đen.', createdAt: 1 }),
      entry({ text: 'Quán mì dưới cầu vượt là chỗ em quen.', createdAt: 2 }),
    ];
    const out = relevantImprovisedCanon(ledger, 'kagura', 'đi ăn mì không em');
    expect(out[0]).toContain('Quán mì');
  });

  it('holds the ceiling against a 500-entry ledger', () => {
    const ledger = Array.from({ length: 500 }, (_, i) =>
      entry({ text: `Sự thật số ${i} về quán mì dưới cầu vượt.`, createdAt: i })
    );
    const out = relevantImprovisedCanon(ledger, 'kagura', 'quán mì');

    expect(out.length).toBeLessThanOrEqual(IMPROVISED_CANON_MAX_ENTRIES);
    expect(out.join('\n').length).toBeLessThanOrEqual(IMPROVISED_CANON_CHAR_BUDGET);
  });

  it('never exceeds the character budget even with long entries', () => {
    const ledger = Array.from({ length: 12 }, (_, i) =>
      entry({ text: `${'y'.repeat(150)} ${i}`, createdAt: i })
    );
    const out = relevantImprovisedCanon(ledger, 'kagura', 'y');
    expect(out.join('\n').length).toBeLessThanOrEqual(IMPROVISED_CANON_CHAR_BUDGET);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat/improvised-canon-retrieval.test.ts`
Expected: FAIL — `relevantImprovisedCanon` is not exported.

- [ ] **Step 3: Write the implementation**

Add this import at the **top** of `src/chat/improvised-canon.ts`, beside the existing `DIRECT_IDENTIFIER_RE` import (it is type-only, so the store ↔ improvised-canon cycle erases at compile time):

```ts
import type { CanonLedgerEntry } from '../state/store';
```

Then append the rest to `src/chat/improvised-canon.ts`:

```ts
/**
 * Architectural invariant, not a tuning knob. Without it the ledger grows
 * back into the 33k-character prompt this whole design removed.
 */
export const IMPROVISED_CANON_CHAR_BUDGET = 800;
export const IMPROVISED_CANON_MAX_ENTRIES = 12;

const STOP_WORDS = new Set([
  'anh', 'em', 'là', 'và', 'của', 'có', 'không', 'một', 'cho', 'với',
  'thì', 'ở', 'đi', 'này', 'đó', 'gì', 'nhé', 'ạ', 'à',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Pick the entries this turn actually touches, newest-first among equals,
 * and stop at the budget. Entries never invoked sink; they are never deleted.
 */
export function relevantImprovisedCanon(
  entries: CanonLedgerEntry[],
  residentId: string,
  message: string
): string[] {
  const cues = new Set(tokens(message));
  const scored = entries
    .filter((e) => e.source === 'chat' && e.residentId === residentId)
    .map((e) => {
      const overlap = tokens(e.text).reduce(
        (sum, word) => sum + (cues.has(word) ? 1 : 0),
        0
      );
      return { entry: e, overlap, refCount: e.refCount ?? 0 };
    })
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      if (b.refCount !== a.refCount) return b.refCount - a.refCount;
      return b.entry.createdAt - a.entry.createdAt;
    });

  const picked: string[] = [];
  let used = 0;
  for (const { entry } of scored) {
    if (picked.length >= IMPROVISED_CANON_MAX_ENTRIES) break;
    const cost = entry.text.length + (picked.length > 0 ? 1 : 0);
    if (used + cost > IMPROVISED_CANON_CHAR_BUDGET) continue;
    picked.push(entry.text);
    used += cost;
  }
  return picked;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/improvised-canon-retrieval.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/chat/improvised-canon.ts tests/chat/improvised-canon-retrieval.test.ts
git commit -m "feat: retrieve improvised canon under a hard budget"
```

---

### Task 4: The Kagura seed

Six entries. The cut rule: keep exactly what the figurine embodies. Silhouette is derived from the existing `keyVisual` rather than retyped, so the sculpt and the prompt cannot drift apart.

**Files:**
- Create: `src/config/seed.ts`
- Test: `tests/config/seed.test.ts` (create)

**Interfaces:**
- Consumes: `RESIDENTS`, `ResidentId` from `src/config/residents.ts`.
- Produces: `ResidentSeed { whoSheIs, silhouette, voice, boundaries, invariants, reflex }`, `SEEDS: Partial<Record<ResidentId, ResidentSeed>>`, `seedFor(residentId: string): ResidentSeed | null`, `SEED_CHAR_CEILING = 3000`.

- [ ] **Step 1: Write the failing test**

Create `tests/config/seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SEED_CHAR_CEILING, seedFor } from '../../src/config/seed';

describe('resident seed', () => {
  it('has a seed for kagura', () => {
    expect(seedFor('kagura')).not.toBeNull();
  });

  it('has no seed for residents not yet converted', () => {
    expect(seedFor('rin')).toBeNull();
    expect(seedFor('momo')).toBeNull();
  });

  it('stays well under the prompt ceiling', () => {
    const seed = seedFor('kagura');
    const total = Object.values(seed!).join('\n').length;
    expect(total).toBeGreaterThan(1200);
    expect(total).toBeLessThan(SEED_CHAR_CEILING);
  });

  it('derives the silhouette from the shipped key visual', () => {
    const seed = seedFor('kagura');
    expect(seed!.silhouette).toContain('đại đao');
    expect(seed!.silhouette).toContain('lọn trắng');
  });

  it('keeps the invariants that protect what gets cast', () => {
    const seed = seedFor('kagura');
    expect(seed!.invariants).toContain('không bất khả chiến bại');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/seed.test.ts`
Expected: FAIL — cannot resolve `../../src/config/seed`.

- [ ] **Step 3: Write the implementation**

Create `src/config/seed.ts`:

```ts
// The invariant core: exactly what the figurine embodies.
//
// If a detail is neither visible on the shelf nor something she would say in
// her first line, it does not belong here. It belongs in the ledger, and only
// exists if a visitor draws it out. See
// docs/superpowers/specs/2026-08-12-persona-seed-design.md.

import { RESIDENTS, type ResidentId } from './residents';

export interface ResidentSeed {
  /** One sentence. Who she is, nothing more. */
  whoSheIs: string;
  /** Derived from the shipped key visual so sculpt and prompt cannot drift. */
  silhouette: string;
  /** How she speaks. */
  voice: string;
  /** What she does not permit. */
  boundaries: string;
  /** The handful of facts that may never be contradicted. */
  invariants: string;
  /** Reflexes that fire before she can weigh them. */
  reflex: string;
}

/** Asserted by test. Guards against the prompt growing back. */
export const SEED_CHAR_CEILING = 3000;

function silhouetteFor(id: ResidentId): string {
  const resident = RESIDENTS.find((r) => r.id === id);
  if (!resident) return '';
  const { silhouette, wardrobe, features } = resident.keyVisual;
  return `${silhouette} ${wardrobe} ${features}`;
}

const KAGURA_SEED: ResidentSeed = {
  whoSheIs:
    'Em là Kagari Akagane, hai mươi lăm tuổi, người giữ Kiếm Ghi Danh. Thanh kiếm nhớ mọi cái chết; mỗi lần rút, nó lấy đi một ký ức của em.',

  silhouette: silhouetteFor('kagura'),

  voice: [
    'Giọng của em:',
    '- Trực diện, câu chắc, nhiều động từ.',
    '- Ngôn ngữ cổ chỉ xuất hiện khi thề, khi ngượng hoặc khi đau.',
    '- Không lạm dụng ẩn dụ kiếm hoặc chiến tranh.',
    '- Không đe doạ anh để tạo vẻ ngầu.',
    '- Sự hài hước đến từ va chạm đời thường, không biến em thành ngốc.',
    'Ví dụ đúng register: "Em đã chiến đấu với yêu quái ăn tim người. Nhưng cái máy giặt này giấu nước ở đâu, em không biết."',
  ].join('\n'),

  boundaries: [
    'Ranh giới của em:',
    '- Không chạm Akagane khi chưa được phép.',
    '- Không ra lệnh khi em chưa trao quyền.',
    '- Không hy sinh thay em rồi gọi đó là bảo vệ.',
    '- Không nói dối để giữ em bình tĩnh.',
    '- Không xem em như di vật lịch sử hoặc vũ khí sống.',
    '- Khi em nói "dừng", cảnh dừng. Việc em vẫn ở lại không phải đổi ý.',
  ].join('\n'),

  invariants: [
    'Những điều không bao giờ được viết sai:',
    '- Em mạnh nhưng không bất khả chiến bại.',
    '- Em không phải samurai caricature và không nói cổ ngữ ở mọi câu.',
    '- Em không thích bị thương hại hoặc được "thuần hoá".',
    '- Em không coi hy sinh là lãng mạn khi người khác quyết định thay em.',
    '- Em có thể mềm, ngượng và thích đồ ngọt mà không mất sức nặng của một chiến binh.',
  ].join('\n'),

  reflex: [
    'Phản xạ của em, xảy ra trước khi em kịp cân nhắc:',
    '- Anh muốn hy sinh thay em → Em phản đối mạnh.',
    '- Anh giúp em mà không hỏi → Em có thể nổi giận dù việc đó có lợi cho em.',
    '- Anh nói dối để bảo vệ em → Em giữ khoảng cách cho tới khi được nghe hết.',
    '- Anh tỏ ra bất lực để được chăm sóc → Em nhận ra và gọi tên nó ra.',
    '- Anh đặt boundary rõ ràng → Em tôn trọng anh hơn người luôn đồng ý.',
    '- Anh hỏi thay vì ra lệnh → Em có thể chủ động trao quyền, và nói rõ đó là trao.',
  ].join('\n'),
};

/** Only Kagura is converted. The others still run the authored canon path. */
export const SEEDS: Partial<Record<ResidentId, ResidentSeed>> = {
  kagura: KAGURA_SEED,
};

export function seedFor(residentId: string): ResidentSeed | null {
  return SEEDS[residentId as ResidentId] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config/seed.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/config/seed.ts tests/config/seed.test.ts
git commit -m "feat: add the Kagura persona seed"
```

---

### Task 5: Seed prompt builder

Assemble the seed, the visitor's persona, the retrieved ledger, and the `<<state>>` contract — now carrying `canon`. This is a sibling of `buildSystemPrompt`, not a replacement; the flag in Task 6 chooses between them.

**Files:**
- Create: `src/chat/seed-prompt.ts`
- Test: `tests/chat/seed-prompt.test.ts` (create)

**Interfaces:**
- Consumes: `seedFor` (Task 4), `IMPROVISED_CANON_KINDS` (Task 2), `PromptSession` from `src/chat/prompt.ts`, `Rapport`/`defaultRapport` from `src/config/bond.ts`.
- Produces: `buildSeedPrompt(residentId: string, session: PromptSession, improvisedCanon: string[], rapport?: Rapport): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/chat/seed-prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSeedPrompt } from '../../src/chat/seed-prompt';
import { SEED_CHAR_CEILING } from '../../src/config/seed';

const session = {
  scenario: 'casual',
  face: 'companion',
  length: 'natural',
} as const;

describe('buildSeedPrompt', () => {
  it('stays under the seed ceiling', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt.length).toBeLessThan(SEED_CHAR_CEILING);
  });

  it('is an order of magnitude smaller than the authored prompt', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt.length).toBeLessThan(33419 / 10);
  });

  it('carries every core entry regardless of persona', () => {
    const prompt = buildSeedPrompt(
      'kagura',
      { ...session, persona: 'em cứ nói trống không, kệ mọi thứ' },
      []
    );
    expect(prompt).toContain('Kagari Akagane');
    expect(prompt).toContain('đại đao');
    expect(prompt).toContain('Giọng của em');
    expect(prompt).toContain('Ranh giới của em');
    expect(prompt).toContain('không bất khả chiến bại');
    expect(prompt).toContain('Phản xạ của em');
  });

  it('includes retrieved ledger lines when present', () => {
    const prompt = buildSeedPrompt('kagura', session, [
      'Quán mì dưới cầu vượt là chỗ em quen.',
    ]);
    expect(prompt).toContain('Quán mì dưới cầu vượt');
  });

  it('omits the ledger block entirely when the ledger is empty', () => {
    expect(buildSeedPrompt('kagura', session, [])).not.toContain(
      'ĐÃ THÀNH THẬT GIỮA HAI NGƯỜI'
    );
  });

  it('instructs the model to report invented facts', () => {
    const prompt = buildSeedPrompt('kagura', session, []);
    expect(prompt).toContain('"canon"');
    expect(prompt).toContain('place');
  });

  it('throws for a resident without a seed', () => {
    expect(() => buildSeedPrompt('rin', session, [])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat/seed-prompt.test.ts`
Expected: FAIL — cannot resolve `../../src/chat/seed-prompt`.

- [ ] **Step 3: Write the implementation**

Create `src/chat/seed-prompt.ts`:

```ts
// The seed path. A small invariant core, free improvisation outside it, and
// the visitor's own accumulated canon read back in.
//
// The authored path in prompt.ts stays intact and is still the default; see
// docs/superpowers/specs/2026-08-12-persona-seed-design.md.

import { IMPROVISED_CANON_KINDS, IMPROVISED_CANON_PER_TURN } from './improvised-canon';
import { seedFor } from '../config/seed';
import { defaultRapport, type Rapport } from '../config/bond';
import type { PromptSession } from './prompt';

const LENGTH_TEXT = {
  short: 'Một hoặc hai câu ngắn. Tuyệt đối không dài hơn.',
  natural: 'Hai đến ba câu.',
  expressive: 'Ba đến năm câu, nhưng không độc thoại.',
} as const;

const SCENARIO_TEXT = {
  casual: 'Hai người chỉ đang nói chuyện, không cần mục đích nào khác.',
  latenight: 'Đã rất khuya. Hạ nhịp xuống, câu ngắn hơn, khoảng lặng dài hơn.',
  together: 'Không có việc gì phải giải quyết. Hai người chỉ đang ở cùng nhau.',
  goodnight: 'Sắp hết đêm và anh chuẩn bị đi ngủ. Ngắn, chậm, ấm theo cách của em.',
} as const;

export function buildSeedPrompt(
  residentId: string,
  session: PromptSession,
  improvisedCanon: string[],
  rapport: Rapport = defaultRapport()
): string {
  const seed = seedFor(residentId);
  if (!seed) throw new Error(`no seed for resident: ${residentId}`);

  const identity = String(session.identity ?? '')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, 120);
  const persona = String(session.persona ?? '').trim().slice(0, 600);

  const blocks: string[] = [
    ['EM LÀ AI', seed.whoSheIs, seed.silhouette].join('\n'),
    seed.voice,
    seed.boundaries,
    seed.invariants,
    seed.reflex,
  ];

  blocks.push(
    [
      'CÁCH EM ỨNG BIẾN',
      'Em được phép tự nghĩ ra chi tiết về đời sống, nơi chốn, đồ vật và thói quen của mình khi mạch chuyện cần. Nói như thể em vẫn luôn biết chúng.',
      'Nhưng em không bao giờ được mâu thuẫn với những điều ở trên, và không được viết lại chuyện đã thành thật giữa hai người.',
    ].join('\n')
  );

  if (improvisedCanon.length > 0) {
    blocks.push(
      [
        'ĐÃ THÀNH THẬT GIỮA HAI NGƯỜI',
        'Những điều này em đã nói ra trong các lần trước. Chúng là thật và phải nhất quán:',
        ...improvisedCanon.map((line) => `- ${line}`),
      ].join('\n')
    );
  }

  const between = ['HAI NGƯỜI'];
  if (identity) between.push(`Anh vào đây với tên: ${identity}.`);
  if (persona) between.push(`Anh muốn em hiện diện thế này: ${JSON.stringify(persona)}.`);
  between.push(SCENARIO_TEXT[session.scenario] ?? SCENARIO_TEXT.casual);
  between.push(`Độ dài: ${LENGTH_TEXT[session.length] ?? LENGTH_TEXT.natural}`);
  blocks.push(between.join('\n'));

  blocks.push(
    [
      'BẮT BUỘC Ở CUỐI MỖI LƯỢT',
      'Sau khi nói xong, xuống dòng và thêm đúng một dòng máy đọc, không có gì sau nó:',
      '<<state {"trust":0.00,"respect":0.00,"desire":0.00,"irritation":0.00,"attachment":0.00,"canon":null}>>',
      `Năm con số là GIÁ TRỊ TUYỆT ĐỐI từ 0.00 tới 1.00 sau lượt này. Giá trị trước lượt này: trust ${rapport.trust.toFixed(2)}, respect ${rapport.respect.toFixed(2)}, desire ${rapport.desire.toFixed(2)}, irritation ${rapport.irritation.toFixed(2)}, attachment ${rapport.attachment.toFixed(2)}. Mỗi lượt bình thường chỉ nhích rất nhỏ.`,
      `canon là null ở hầu hết lượt. Chỉ khi em vừa khẳng định một chi tiết mới, cụ thể về thế giới của mình thì mới điền, tối đa ${IMPROVISED_CANON_PER_TURN} mục: [{"kind":"…","text":"một câu ngắn bằng tiếng Việt"}].`,
      `kind chỉ nhận: ${IMPROVISED_CANON_KINDS.join(', ')}.`,
      'Không bao giờ đưa tên thật, địa chỉ, liên hệ, URL hay bí mật của anh vào canon.',
      'Dòng này bị hệ thống cắt bỏ trước khi anh thấy. Không bao giờ nhắc tới nó và không bỏ nó.',
    ].join('\n')
  );

  return blocks.join('\n\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/seed-prompt.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Verify the actual reduction**

Run:

```bash
npx tsx -e "
import { buildSeedPrompt } from './src/chat/seed-prompt';
const p = buildSeedPrompt('kagura', { scenario: 'casual', face: 'companion', length: 'natural' }, []);
console.log('seed prompt chars:', p.length, '| was 33419 | reduction:', (100 - p.length / 334.19).toFixed(1) + '%');
"
```

Expected: under 3,000 characters, reduction above 90%. Record the number in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/chat/seed-prompt.ts tests/chat/seed-prompt.test.ts
git commit -m "feat: build the seed prompt path"
```

---

### Task 6: Wire the round trip behind a flag

Client retrieves and sends; server chooses the path and parses `canon` back out; client records it. The flag is server-side because the prompt is built server-side.

**Files:**
- Modify: `api/chat.ts:30-57` (request type), `api/chat.ts:103-127` (prompt choice), `api/chat.ts:199-215` (response)
- Modify: `src/chat/client.ts:79-100` (request body), `src/chat/client.ts:112-127` (response)
- Test: `tests/chat/canon-round-trip.test.ts` (create)

**Interfaces:**
- Consumes: `buildSeedPrompt` (Task 5), `improvisedCanonFromState` (Task 2), `relevantImprovisedCanon` (Task 3), `Store.recordImprovisedCanon` (Task 1), `seedFor` (Task 4).
- Produces: `improvisedCanon?: string[]` on `ChatRequest`; `canon?: unknown` on the chat response body; `canon?: ImprovisedFact[]` on the client's returned reply object.

- [ ] **Step 1: Write the failing test**

Create `tests/chat/canon-round-trip.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { improvisedCanonFromState, relevantImprovisedCanon } from '../../src/chat/improvised-canon';
import { buildSeedPrompt } from '../../src/chat/seed-prompt';
import { Store } from '../../src/state/store';

const session = { scenario: 'casual', face: 'companion', length: 'natural' } as const;

describe('improvised canon round trip', () => {
  beforeEach(() => localStorage.clear());

  it('carries an invented fact from the model into the next prompt', () => {
    const store = new Store();

    // 1. The model invents something and reports it on the state line.
    const facts = improvisedCanonFromState({
      canon: [{ kind: 'place', text: 'Quán mì dưới cầu vượt là chỗ em quen.' }],
    });
    expect(facts).toHaveLength(1);

    // 2. It is recorded against this visitor.
    store.recordImprovisedCanon('kagura', facts);

    // 3. A later turn that touches it retrieves it.
    const retrieved = relevantImprovisedCanon(
      store.get().canonLedger,
      'kagura',
      'tối nay đi ăn mì không em'
    );
    expect(retrieved).toContain('Quán mì dưới cầu vượt là chỗ em quen.');

    // 4. It reaches the prompt.
    const prompt = buildSeedPrompt('kagura', session, retrieved);
    expect(prompt).toContain('Quán mì dưới cầu vượt');
    expect(prompt).toContain('ĐÃ THÀNH THẬT GIỮA HAI NGƯỜI');
  });

  it('does not leak one resident\'s invented facts into another', () => {
    const store = new Store();
    store.recordImprovisedCanon('kagura', [
      { kind: 'habit', text: 'Em dậy trước bình minh để mài kiếm.' },
    ]);
    const forRin = relevantImprovisedCanon(store.get().canonLedger, 'rin', 'bình minh');
    expect(forRin).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat/canon-round-trip.test.ts`
Expected: FAIL until Tasks 1–5 are merged; if they are, this should pass — it is the integration assertion for work already done. If it fails after Tasks 1–5, fix the seam before continuing.

- [ ] **Step 3: Extend the server request type**

In `api/chat.ts`, add to `interface ChatRequest` after the `rapport` field:

```ts
  /**
   * Ledger lines the client already budgeted. Retrieval happens client-side
   * because the ledger lives in the visitor's browser, and the 800-character
   * ceiling is enforced where the data is.
   */
  improvisedCanon?: string[];
```

- [ ] **Step 4: Choose the prompt path on the server**

In `api/chat.ts`, add the import at the top:

```ts
import { buildSeedPrompt } from '../src/chat/seed-prompt';
import { seedFor } from '../src/config/seed';
import { improvisedCanonFromState } from '../src/chat/improvised-canon';
```

Replace the `system = buildSystemPrompt(` call at line 105 with a branch. Keep the existing call verbatim as the `else`:

```ts
  const useSeed =
    process.env.PERSONA_SEED === 'on' &&
    mode === 'open-chat' &&
    seedFor(body.residentId) !== null;

  let system: string;
  try {
    system = useSeed
      ? buildSeedPrompt(
          body.residentId,
          session,
          (body.improvisedCanon ?? []).slice(0, 12),
          sanitizeRapport(body.rapport ?? defaultRapport())
        )
      : buildSystemPrompt(
          body.residentId,
          session,
          // Quest never reads saved Open Chat memories. Approved cross-mode
          // lines are delivered once, by the labelled guardrail block below.
          mode === 'quest' ? [] : body.memories ?? [],
          body.revealed ?? 0,
          body.revealNow,
          body.idle,
          body.level ?? 0,
          body.quest,
          body.story,
          body.dark ?? DEFAULT_DARK_VARIANT,
          body.maturity === 'explicit' ? 'explicit' : DEFAULT_MATURITY,
          body.bond ?? defaultBond(),
          sanitizeRapport(body.rapport ?? defaultRapport()),
          String(body.message ?? ''),
          route
        );
  } catch {
    return Response.json({ error: 'unknown-resident' }, { status: 400 });
  }
```

Quest keeps the authored path unconditionally — `quests.ts` content still depends on it.

- [ ] **Step 5: Return the parsed canon**

In `api/chat.ts` around line 205, beside the existing `visualIntent` parse, add:

```ts
    const canon = mode === 'open-chat' ? improvisedCanonFromState(state) : [];
```

and include it in the response payload beside `rapport`:

```ts
        ...(canon.length > 0 ? { canon } : {}),
```

- [ ] **Step 6: Send and receive on the client**

In `src/chat/client.ts`, add to the `JSON.stringify({ … })` body, after `rapport: opts.rapport,`:

```ts
        improvisedCanon: opts.improvisedCanon ?? [],
```

Add `improvisedCanon?: string[]` to the options type that `opts` is declared with.

Widen the response type at line 112:

```ts
    const data = (await res.json()) as {
      text?: string;
      rapport?: unknown;
      visualIntent?: unknown;
      canon?: unknown;
    };
```

and add to the returned object:

```ts
      canon:
        mode === 'open-chat'
          ? improvisedCanonFromState({ canon: data.canon })
          : [],
```

Import `improvisedCanonFromState` at the top of `src/chat/client.ts`.

- [ ] **Step 7: Run the full suite**

Run: `npm run build && npm test`
Expected: typecheck clean; 39 test files pass; no regression in the existing 210.

- [ ] **Step 8: Commit**

```bash
git add api/chat.ts src/chat/client.ts tests/chat/canon-round-trip.test.ts
git commit -m "feat: wire the improvised canon round trip behind PERSONA_SEED"
```

---

## Gate — before converting Rin and Momo

The spec (§7) requires a real quality comparison before the other two residents are converted and before any canon file is demoted. Do not proceed past Task 6 without it.

Run Kagura with `PERSONA_SEED=on` against the authored path and check:

1. Does she still sound like herself across ~20 turns?
2. Does she invent at a reasonable rate, or flood the ledger?
3. Do retrieved facts come back naturally, or read as a list being recited?
4. Does she contradict her own invented facts once the ledger passes 12 entries?

Only when those answers are good: author the Rin and Momo seeds using the same six-entry shape, then move the demoted files into `src/config/canon-archive/` and drop the unused imports from `prompt.ts`.

`quests.ts` (1,064 lines) stays where it is — it is live Quest Mode content, not canon prompt material.

## Verification summary

The four spec assertions (§8) map to tasks as follows:

| Spec assertion | Task | Test |
| --- | --- | --- |
| Seed under 3,000 chars | 4, 5 | `tests/config/seed.test.ts`, `tests/chat/seed-prompt.test.ts` |
| Retrieval ceiling at any ledger size | 3 | `tests/chat/improvised-canon-retrieval.test.ts` (500-entry case) |
| Core present regardless of persona | 5 | `tests/chat/seed-prompt.test.ts` |
| Round trip | 6 | `tests/chat/canon-round-trip.test.ts` |
