// Two registers of intimacy, and the gate between them.
//
// The default layer is sharp but not illustrated: heat comes from distance
// closing, from being read correctly, from control changing hands. That ships to
// everyone and it is where each resident's `heat` block lives.
//
// The explicit layer unlocks the `heat.explicit` register. It requires BOTH
// things, deliberately:
//
//   1. an explicit opt-in flag  — `?mature=on`, remembered per browser
//   2. a confirmed adult        — a separate stored acknowledgement
//
// One switch would have been less code. Two exist because they answer different
// questions: the flag says "this build shows that content", the confirmation
// says "the person here may see it". A build flag alone cannot speak for the
// person holding the phone.
//
// Nothing here loosens the rules that are not about register: every resident is
// an adult and stated as one, no content involving minors under any framing, no
// assumed consent, and a clear refusal from the visitor always outranks the
// setting. See the SỰ GẦN GŨI block in chat/prompt.ts, which keeps those in
// force at both levels.

export type MaturityLevel = 'suggestive' | 'explicit';

export const DEFAULT_MATURITY: MaturityLevel = 'suggestive';

const FLAG_KEY = 'heymate.mature';
const AGE_KEY = 'heymate.age.confirmed';

/**
 * Whether the visitor has confirmed being an adult. Separate from the flag on
 * purpose; see the note above.
 */
export function ageConfirmed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AGE_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function confirmAge(yes: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (yes) window.localStorage.setItem(AGE_KEY, 'yes');
    else window.localStorage.removeItem(AGE_KEY);
  } catch {
    /* private mode: the gate simply stays shut */
  }
}

/** Whether this build was asked to offer the explicit layer at all. */
export function matureFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mature');
    if (fromUrl === 'on' || fromUrl === 'off') {
      window.localStorage.setItem(FLAG_KEY, fromUrl);
      return fromUrl === 'on';
    }
    return window.localStorage.getItem(FLAG_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * The register in force. Falls back to `suggestive` on every uncertainty —
 * a gate that fails open is not a gate.
 */
export function resolveMaturity(): MaturityLevel {
  return matureFlag() && ageConfirmed() ? 'explicit' : DEFAULT_MATURITY;
}

/** True when the flag is on but nobody has confirmed their age yet. */
export function needsAgeConfirmation(): boolean {
  return matureFlag() && !ageConfirmed();
}
