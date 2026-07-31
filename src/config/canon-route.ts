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
// The source-anime reboot is now the only public runtime. Hub/origin remain in
// the repository as offline baselines for exporters and verification, but the
// browser can no longer select them through a query string or sticky storage.

export type CanonRoute = 'origin' | 'hub' | 'sao';

export const DEFAULT_ROUTE: CanonRoute = 'sao';

const KEY = 'heymate.canonRoute';

/**
 * Resolve the public route.
 *
 * Before the v3 cutover this accepted `?canon=hub` and persisted the choice.
 * Test users would therefore stay on the retired canon even after changing the
 * default. The old datasets still have explicit route parameters in build-time
 * tools; the product runtime is intentionally one-way.
 */
export function resolveCanonRoute(): CanonRoute {
  if (typeof window === 'undefined') return DEFAULT_ROUTE;
  try {
    window.localStorage.setItem(KEY, DEFAULT_ROUTE);
  } catch {
    /* private mode: the in-memory default is enough */
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
