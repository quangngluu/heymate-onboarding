// Which canon layer a session runs on.
//
// Three have existed in this product, and they are mutually exclusive rather
// than cumulative:
//
//   origin  — v1. Three independent original IPs, no shared space.
//   hub     — v2. The Interlude Hub, a neutral location all three could reach.
//   sao     — v3. Full reboot: each waifu lives inside her own source anime.
//             Rin is in Sword Art Online / Alicization.
//
// v3 §11 of the implementation spec forbids Hub canon on the Rin route, and the
// product decision is that all three routes are independent — so the Hub is not
// the default canon for *anyone*. It stays in the tree as a selectable legacy
// experiment, outside the default runtime path.
//
// `DEFAULT_ROUTE` is deliberately still `hub` for one more step: the live demo
// serves it, and the agreed rollout is ingest → flag → probe → switch alias →
// only then drop Hub from the default path. Flipping this constant is that last
// step, and it is one line on purpose.

export type CanonRoute = 'origin' | 'hub' | 'sao';

/**
 * Temporary. Production currently serves the Hub demo; this becomes 'sao' (or
 * per-resident) at rollout step 5, once the v3 route passes regression.
 */
export const DEFAULT_ROUTE: CanonRoute = 'hub';

const KEY = 'heymate.canonRoute';

function isRoute(v: string | null): v is CanonRoute {
  return v === 'origin' || v === 'hub' || v === 'sao';
}

/**
 * Resolve the route. URL wins so a tester can be handed a link; the choice then
 * sticks for the session. `?canon=off` clears it back to the default.
 */
export function resolveCanonRoute(): CanonRoute {
  if (typeof window === 'undefined') return DEFAULT_ROUTE;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('canon');
    if (fromUrl !== null) {
      const v = fromUrl.trim().toLowerCase();
      if (isRoute(v)) {
        window.localStorage.setItem(KEY, v);
        return v;
      }
      window.localStorage.removeItem(KEY);
      return DEFAULT_ROUTE;
    }
    const stored = window.localStorage.getItem(KEY);
    if (isRoute(stored)) return stored;
  } catch {
    /* private mode: default */
  }
  return DEFAULT_ROUTE;
}

/**
 * Whether Interlude Hub canon may be used at all.
 *
 * One place to ask, so removing the Hub later is a flag change rather than a
 * hunt through the prompt.
 */
export function hubCanonAllowed(route: CanonRoute): boolean {
  return route === 'hub';
}
