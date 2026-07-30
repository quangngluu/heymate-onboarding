// Which unreleased prototypes this browser is allowed to see.
//
// Quest Mode is internal-only for now. The build ships with it, because gating
// at deploy time would mean testing a different bundle from the one that goes
// live — but nothing about it is reachable without an explicit opt-in, so Open
// Chat stays exactly as it is for everyone else.
//
// Turn on with `?questPrototype=rin` (or `=all`). The choice sticks for the rest
// of the browser session so a tester can navigate without re-adding the query,
// and `?questPrototype=off` clears it.

const KEY = 'heymate.questPrototype';

/** Read the flag, letting the URL win so a link is enough to hand someone. */
function flag(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('questPrototype');
    if (fromUrl !== null) {
      const value = fromUrl.trim().toLowerCase();
      if (value === 'off' || value === '') {
        window.localStorage.removeItem(KEY);
        return '';
      }
      window.localStorage.setItem(KEY, value);
      return value;
    }
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    // Private mode: the prototype simply stays hidden.
    return '';
  }
}

/**
 * Whether Quest Mode may be entered for this resident.
 *
 * Per resident rather than one global switch, because only Rin has an authored
 * Episode 0 — offering the entry on Kagura or Momo would promise a threshold
 * that does not exist yet.
 */
export function questPrototypeEnabled(residentId: string): boolean {
  const value = flag();
  return value === 'all' || value === residentId;
}

/** True when any prototype is on, for the internal badge on screen. */
export function questPrototypeActive(): boolean {
  return flag() !== '';
}
