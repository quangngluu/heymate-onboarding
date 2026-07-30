// Asking her for a scene of her own.
//
// The authored quests run out. Rather than let the ladder stop there, the
// server asks her for another in the same shape and this hands it back. A
// failure is silent: the visitor simply carries on talking, which is what they
// were doing anyway.

import type { SessionSetup } from '../state/store';
import { resolveDarkVariant } from '../config/dark-patterns';

export interface WrittenQuest {
  title: string;
  prompt: string;
  objective: string;
  options: string[];
}

export async function writeQuest(input: {
  residentId: string;
  session: SessionSetup;
  memories: string[];
  revealed: number;
  level: number;
  used: string[];
}): Promise<WrittenQuest | null> {
  try {
    const res = await fetch('/api/quest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, dark: resolveDarkVariant() }),
      signal: AbortSignal.timeout(28000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as WrittenQuest & { error?: string };
    if (data.error || !data.title || (data.options ?? []).length < 3) return null;
    return data;
  } catch {
    return null;
  }
}
