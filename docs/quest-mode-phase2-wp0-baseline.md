# Quest Mode Phase 2 — WP0 baseline

Captured on 2026-07-31 from runtime commit `1999943` at:

`/?canon=sao&questPrototype=rin`

WP0 adds only test and capture tooling. No file under `src/` changed while this
baseline was recorded.

## Mobile smoke sample

| Viewport | First local authored beat | Horizontal overflow | Roster hidden | Quest exit visible |
|---|---:|---:|---|---|
| 360 × 800 | 243 ms | 0 px | yes | yes |
| 390 × 844 | 272 ms | 0 px | yes | yes |
| 430 × 932 | 245 ms | 0 px | yes | yes |

These three measurements are a before-state sample, not the Phase 2 p90 latency
acceptance test. WP4 still needs the planned 20-run warm/cold measurement.

The smoke saw two expected `/api/tts` 502 responses per viewport because the
local environment has no `MINIMAX_API_KEY` or `TTS_PROVIDER`. It recorded no
other page or HTTP failures.

## Artifacts

- `output/playwright/wp0-baseline/quest-phase2-before-360x800.png`
- `output/playwright/wp0-baseline/quest-phase2-before-390x844.png`
- `output/playwright/wp0-baseline/quest-phase2-before-430x932.png`
- `output/playwright/wp0-baseline/quest-phase2-before.json`

The JSON is the machine-readable source for the table. Re-running
`npm run test:quest-smoke` is non-mutating by default; pass
`--capture-dir=<path>` only when a new evidence set is intended.
