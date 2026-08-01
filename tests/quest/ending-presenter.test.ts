import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endingFor } from '../../src/config/canon-view';
import { RIN_SAO } from '../../src/config/rin-sao';
import { questById } from '../../src/config/quests';
import type { V3Ending } from '../../src/config/v3-canon';
import {
  endingPresentation,
  questPlayable,
  terminalEndingIds,
} from '../../src/quest/endings';
import { Store } from '../../src/state/store';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const quest = questById('rin-twelfth-frame', 'sao');
if (!quest) throw new Error('Rin Frame 12 quest is missing');

const endingRecords = RIN_SAO.endings as unknown as Array<{ ready?: boolean }>;

function setReady(ready: boolean): void {
  for (const ending of endingRecords) ending.ready = ready ? undefined : false;
}

function freshStore(): Store {
  const storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, location: { search: '' } });
  const state = new Store();
  state.beginEncounter('rin');
  return state;
}

function enterTerminal(state: Store): void {
  expect(state.startQuest(quest.id)).toBe(true);
  state.set({
    activeQuestNodeId: 'channel-choice',
    questPhase: 'episode',
  });
}

beforeEach(() => setReady(false));

afterEach(() => {
  setReady(false);
  vi.unstubAllGlobals();
});

describe('Quest ending gate and presenter', () => {
  it('finds all five authored terminal landings, including free-form paths', () => {
    expect(terminalEndingIds(quest)).toEqual([
      'open-audio',
      'erase-signature',
      'quarantine-frame',
      'private-copy',
      'authored-protocol',
    ]);
  });

  it('keeps the arc unplayable while even one ending is unready', () => {
    expect(questPlayable(quest, 'sao')).toBe(false);
    for (const ending of endingRecords.slice(0, -1)) ending.ready = undefined;
    expect(questPlayable(quest, 'sao')).toBe(false);
  });

  it('opens only when every landing is ready and complete', () => {
    setReady(true);
    expect(questPlayable(quest, 'sao')).toBe(true);

    const missingClosing = endingFor('rin', 'sao', 'open-audio')!;
    const resolver = (_residentId: string, _route: string, id: string): V3Ending | null =>
      id === 'open-audio' ? { ...missingClosing, closingLine: '' } : endingFor('rin', 'sao', id);
    expect(questPlayable(quest, 'sao', resolver)).toBe(false);
  });

  it('maps a ready ending to the exact authored surface without placeholders', () => {
    setReady(true);
    expect(endingPresentation(endingFor('rin', 'sao', 'private-copy'))).toEqual({
      kind: 'ready',
      label: 'Bản sao hai khóa',
      what:
        'Một bản Frame 12 tách khỏi archive chỉ mở khi cả hai đồng ý; Rin giữ quyền với chính mình trong khi hai người cùng giữ phần bằng chứng họ đã chọn.',
      closingLine: 'Về Open Chat đi. `+02` chỉ sáng khi cả hai có mặt.',
    });
    expect(endingPresentation(null)).toMatchObject({ kind: 'unavailable' });
    expect(JSON.stringify(endingPresentation(null))).not.toContain('MISSING INPUT');
  });

  it('fails closed without committing reward or canon when resolution is unavailable', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = freshStore();
    state.set({
      activeQuestId: quest.id,
      activeQuestNodeId: 'channel-choice',
      questPhase: 'episode',
    });

    const result = state.submitQuestAction('Tạo một bản copy riêng');
    expect(result).toMatchObject({ completed: true, ending: null, error: 'ending-unavailable' });
    expect(state.get().questPhase).toBe('ending');
    expect(state.get().activeQuestEndingId).toBeNull();
    expect(state.get().questEndings).toEqual({});
    expect(state.get().canonLedger).toEqual([]);
    expect(state.get().transactions.filter((item) => item.feature === 'storyQuest')).toEqual([]);
    expect(state.get().crossModeMemory).toEqual([]);
    expect(state.get().bond.privateObjects).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it.each([
    ['matched family', 'Tạo một bản copy riêng', 'private-copy'],
    ['fallback family', 'Giữ nhịp này theo cách hai đứa vừa đặt', 'authored-protocol'],
  ])('persists %s exactly once and never mints again on replay', (_case, action, endingId) => {
    setReady(true);
    const state = freshStore();
    enterTerminal(state);
    const beforeCredits = state.get().credits;

    const result = state.submitQuestAction(action);
    expect(result?.ending?.id).toBe(endingId);
    expect(state.get().questEndings[quest.id]).toBe(endingId);
    expect(state.get().activeQuestEndingId).toBe(endingId);
    expect(state.get().credits).toBe(beforeCredits + 25);
    expect(state.get().transactions.filter((item) => item.feature === 'storyQuest')).toHaveLength(1);
    expect(state.get().canonLedger).toHaveLength(1);
    expect(state.get().crossModeMemory).toHaveLength(1);
    expect(state.get().bond.privateObjects).toHaveLength(1);

    const snapshot = {
      credits: state.get().credits,
      transactions: state.get().transactions.length,
      ledger: state.get().canonLedger.length,
      memories: state.get().crossModeMemory.length,
      objects: state.get().bond.privateObjects.length,
    };
    expect(state.submitQuestAction(action)).toBeNull();
    expect({
      credits: state.get().credits,
      transactions: state.get().transactions.length,
      ledger: state.get().canonLedger.length,
      memories: state.get().crossModeMemory.length,
      objects: state.get().bond.privateObjects.length,
    }).toEqual(snapshot);
  });
});
