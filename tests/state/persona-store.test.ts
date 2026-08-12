import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePersona, defaultPersonaTraits } from '../../src/config/persona';
import { Store } from '../../src/state/store';

const STORAGE_KEY = 'heymate.progress.sao.v1';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function savedProgress(persona: string, extra: Record<string, unknown> = {}) {
  return {
    memories: [],
    revealed: 0,
    persona,
    identity: '',
    visits: 1,
    completedQuests: [],
    ...extra,
  };
}

describe('persona session migration', () => {
  it('starts a new session with defaults and a compiled non-empty persona', () => {
    const session = new Store().get().session;

    expect(session.personaTraits).toEqual(defaultPersonaTraits());
    expect(session.personaOverride).toBe(false);
    expect(session.persona).toBe(compilePersona(defaultPersonaTraits(), 'natural'));
  });

  it('preserves a legacy free-text persona as a manual override', () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ progress: { rin: savedProgress('Xin cứ nói thật với anh.') } })
    );
    const store = new Store();
    store.beginEncounter('rin');

    expect(store.get().session).toMatchObject({
      persona: 'Xin cứ nói thật với anh.',
      personaOverride: true,
      personaTraits: defaultPersonaTraits(),
    });
  });

  it('round-trips saved traits without converting compiled text to an override', () => {
    const first = new Store();
    first.beginEncounter('rin');
    first.updateSession({
      personaTraits: {
        ...first.get().session.personaTraits,
        humor: 'dry',
        relationship: 'mentor',
      },
    });
    expect(first.saveChapter([])).toBe(true);

    const restored = new Store();
    restored.beginEncounter('rin');

    expect(restored.get().session.personaTraits).toMatchObject({
      humor: 'dry',
      relationship: 'mentor',
    });
    expect(restored.get().session.personaOverride).toBe(false);
    expect(restored.get().session.persona).toBe(
      compilePersona(restored.get().session.personaTraits, 'natural')
    );
  });
});

describe('persona override behavior', () => {
  it('rejects a direct persona write while compiled mode is active', () => {
    const store = new Store();
    const compiled = store.get().session.persona;

    store.updateSession({ persona: 'Không được đi vòng qua compiler.' });

    expect(store.get().session.personaOverride).toBe(false);
    expect(store.get().session.persona).toBe(compiled);
  });

  it('freezes compiled text while overridden and restores from the current traits', () => {
    const store = new Store();
    store.updateSession({
      persona: 'Bản chỉnh tay của anh.',
      personaOverride: true,
    });
    store.updateSession({
      personaTraits: {
        ...store.get().session.personaTraits,
        tone: 100,
        problem: 'listen',
      },
      length: 'short',
    });

    expect(store.get().session.persona).toBe('Bản chỉnh tay của anh.');
    store.updateSession({ personaOverride: false });

    expect(store.get().session.personaOverride).toBe(false);
    expect(store.get().session.persona).toContain('nói thẳng, ít vòng vo');
    expect(store.get().session.persona).toContain('em nghe anh nói trước đã');
  });
});
