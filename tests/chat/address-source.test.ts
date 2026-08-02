import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBond, defaultRapport } from '../../src/config/bond';
import { buildSystemPrompt } from '../../src/chat/prompt';
import { Store } from '../../src/state/store';

class MemoryStorage {
  private values = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(seed)) this.values.set(key, value);
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('single source for the visitor address', () => {
  it('migrates a saved nickname into bond.address when loading old progress', () => {
    const storage = new MemoryStorage({
      'heymate.progress.sao.v1': JSON.stringify({
        progress: {
          rin: {
            memories: [],
            revealed: 0,
            nickname: '  Player   Zero  ',
            persona: '',
            identity: '',
            visits: 1,
            completedQuests: [],
          },
        },
      }),
    });
    vi.stubGlobal('localStorage', storage);

    const store = new Store();
    const saved = store.progressFor('rin');

    expect(saved.bond?.address).toBe('Player Zero');
    expect(saved.nickname).toBeUndefined();
    store.beginEncounter('rin');
    expect(store.get().bond.address).toBe('Player Zero');
  });

  it('emits exactly one address instruction in the model prompt', () => {
    const prompt = buildSystemPrompt(
      'rin',
      {
        persona: '',
        identity: '',
        scenario: 'casual',
        face: 'companion',
        length: 'natural',
      },
      [],
      0,
      undefined,
      undefined,
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      { ...defaultBond(), address: 'Player Zero' },
      defaultRapport()
    );

    expect(
      prompt.split('\n').filter((line) => /Tên đã lưu của anh|Em gọi anh là/.test(line))
    ).toEqual(['- Em gọi anh là "Player Zero". Dùng nó tự nhiên, không dùng mọi câu.']);
  });
});
