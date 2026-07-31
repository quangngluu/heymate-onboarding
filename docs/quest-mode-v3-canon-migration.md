# Quest Mode v3 canon migration — implementation notes

Branch: `feat/quest-mode-prototype-1`

This change completes Part 1 (E1–E8) of the Quest Mode execution plan. It does
not switch the production default and does not deploy. `DEFAULT_ROUTE` remains
`hub`.

## Spec-to-code gap closure

| Previous gap | Runtime closure | Verification |
| --- | --- | --- |
| V3 reveal, truth, causal, heat and visual layers were absent | `V3AuthoredContent` supplies 33 reveals, 27 truths, 16 causal memories, three heat registers and three visual identities | `npm run verify:canon` resolves all required fields for all residents |
| Prompt and offline fallback could read Hub/v1 fields | `canonViewFor(residentId, route)` is the single user-visible accessor; prompt and scripted engine consume the resolved view | Every v3 reveal and 12 scripted turns per resident are probed for forbidden anchors |
| `revealNow` and Quest saves used only array indexes | V3 choices carry stable `unlockCanonRevealId`; Hub keeps legacy numeric indexes | Quest lookup, checkpoint resume and stable-id unlock are exercised through `Store` |
| Quest definitions had no route | Rin's prototype is `sao`; Kagari and Momo legacy quests are `hub` | Cross-route lookup is rejected; v3 Kagari/Momo show an unavailable state instead of Hub fallback |
| Scene generation used base resident imagery | Client sends the exact route; API resolves scene and subject briefs through the canon view | Handler-level probe captures the writer request and checks v3 anchors |
| Quest could receive raw Open Chat context | Edge API and Vite middleware split Open Chat history, Quest history and explicitly approved cross-mode summaries | Handler-level probe confirms private Open Chat memory is absent from Quest |
| Export verification dirtied tracked files | `verify:canon` and exporter `--check` are read-only | `npm run verify:canon` leaves dataset artifacts unchanged |
| Markdown export was Hub-only | `export-content.ts --route=sao` writes the complete v3 review | `docs/waifu-content-review.sao.md` is generated from the same route view |

## Frozen Hub baseline

The Hub dataset remains byte-identical to E0:

- `characters.hub.json`: `d17e8b4611490de940434b5b046ebb6e788c2ee5b8106df49280dde4b53b75c4`
- `characters.hub.jsonl`: `0d92ba4998168867b839f63f4bd79818958d946ec52085f1959b59f695e667c9`

The completed v3 dataset contains 156 instruction pairs:

- Rin: 53
- Kagari: 52
- Momo: 51
- Missing required content packages: 0

## Gates

```sh
npm run verify
git diff --check
```

`verify` runs the TypeScript/Vite production build, the route-view and handler
probes, then both Hub and v3 exporters in read-only mode.

Physical iPhone voice playback with the silent switch enabled remains a separate
device gate. Production deployment and changing `DEFAULT_ROUTE` are deliberately
outside this commit.
