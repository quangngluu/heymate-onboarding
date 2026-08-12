import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  improvisedCanonFromState,
  relevantImprovisedCanon,
} from '../../src/chat/improvised-canon';
import { buildSeedPrompt } from '../../src/chat/seed-prompt';
import { Store } from '../../src/state/store';

// This repo's vitest environment has no global localStorage (Node's is
// experimental and off by default), so every store test stubs one in. See
// tests/state/canon-ledger-chat.test.ts for the same pattern.
class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

const session = { scenario: 'casual', face: 'companion', length: 'natural' } as const;

describe('improvised canon round trip', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("does not leak one resident's invented facts into another", () => {
    const store = new Store();
    store.recordImprovisedCanon('kagura', [
      { kind: 'habit', text: 'Em dậy trước bình minh để mài kiếm.' },
    ]);
    const forRin = relevantImprovisedCanon(store.get().canonLedger, 'rin', 'bình minh');
    expect(forRin).toEqual([]);
  });
});
