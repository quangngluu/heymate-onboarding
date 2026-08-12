import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/state/store';
import { createPersonaBuilder } from '../../src/ui/steps';

type Listener = (event: { target: FakeElement; currentTarget: FakeElement }) => void;

class FakeElement {
  readonly children: Array<FakeElement | string> = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();
  readonly classList = {
    add: (...names: string[]) => {
      for (const name of names) this.classes.add(name);
      this.syncClassAttribute();
    },
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const enabled = force ?? !this.classes.has(name);
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
      this.syncClassAttribute();
      return enabled;
    },
  };
  value = '';
  textContent = '';
  hidden = false;
  disabled = false;
  private classes = new Set<string>();

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tagName: string
  ) {}

  append(...children: Array<FakeElement | string>): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'class') {
      this.classes = new Set(value.split(/\s+/).filter(Boolean));
    }
    if (name === 'hidden') this.hidden = true;
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ target: this, currentTarget: this });
    }
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  private syncClassAttribute(): void {
    this.attributes.set('class', [...this.classes].join(' '));
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;

  createElement(tag: string): FakeElement {
    return new FakeElement(this, tag);
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return [
    root,
    ...root.children.flatMap((child) =>
      typeof child === 'string' ? [] : descendants(child)
    ),
  ];
}

function byTestId(root: FakeElement, testId: string): FakeElement {
  const match = descendants(root).find((element) => element.dataset.testid === testId);
  if (!match) throw new Error(`Missing data-testid=${testId}`);
  return match;
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('document', new FakeDocument());
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback();
    return 1;
  });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Persona Builder DOM', () => {
  it('renders seven controls, preserves the textarea hook, and updates preview from a slider', () => {
    const store = new Store();
    let view: ReturnType<typeof createPersonaBuilder>;
    view = createPersonaBuilder(store.get().session, (patch) => {
      store.updateSession(patch);
      view.sync(store.get().session);
    });
    const root = view.el as unknown as FakeElement;
    const controls = descendants(root).filter(
      (element) => element.dataset.personaControl !== undefined
    );

    expect(controls.map((element) => element.dataset.personaControl)).toEqual([
      'tone',
      'problem',
      'energy',
      'humor',
      'proactive',
      'length',
      'relationship',
    ]);
    expect(byTestId(root, 'session-persona').getAttribute('maxlength')).toBe('600');

    const tone = byTestId(root, 'persona-tone');
    tone.value = '100';
    tone.emit('input');

    expect(byTestId(root, 'persona-preview').textContent).toContain(
      'nói thẳng, ít vòng vo'
    );
  });

  it('freezes slider recompilation after textarea input and restores current traits', () => {
    const store = new Store();
    let view: ReturnType<typeof createPersonaBuilder>;
    view = createPersonaBuilder(store.get().session, (patch) => {
      store.updateSession(patch);
      view.sync(store.get().session);
    });
    const root = view.el as unknown as FakeElement;
    const textarea = byTestId(root, 'session-persona');
    textarea.value = 'Bản chỉnh tay trong DOM.';
    textarea.emit('input');

    const tone = byTestId(root, 'persona-tone');
    tone.value = '100';
    tone.emit('input');
    expect(store.get().session.persona).toBe('Bản chỉnh tay trong DOM.');
    expect(store.get().session.personaOverride).toBe(true);

    byTestId(root, 'persona-restore').emit('click');

    expect(store.get().session.personaOverride).toBe(false);
    expect(store.get().session.persona).toContain('nói thẳng, ít vòng vo');
    expect(byTestId(root, 'persona-preview').textContent).toBe(
      store.get().session.persona
    );
  });
});
