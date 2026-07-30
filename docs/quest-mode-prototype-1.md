# Quest Mode Prototype 1 — implementation notes

Source: `HMU_Quest_Mode_Product_Experience_Spec_v1.0`, 30 July 2026.

## Spec/code gap table

| Spec requirement | Previous code | Prototype 1 |
| --- | --- | --- |
| Suggested actions are not a closed list | `choices` was a fixed two-item tuple | Flexible choices plus an explicit free-form affordance; player-authored outcomes enter the canon ledger as `player-created` |
| Open Chat context is excluded from Quest by default | One persisted transcript was sent to `/api/chat` in both modes | Separate Open Chat and Quest transcripts, separate request fields, and a server-side mode gate that ignores Open Chat history in Quest |
| Episode 0–2 means playable chapters | `episodes` meant resident memory reveals | Resident content is now `canonReveals`; playable content is `questEpisodes` |
| Production fiction pressure cannot preselect consent | Variant B said no preselection but checked memories by default | Variant B `preselectMemories` is false |
| Quest must read as a mode switch | Quest choices were inserted above the chat composer | Quest hides roster, profile, wallet/credit and Open Chat composer; only story HUD, subtitles, sound and return remain |
| Generated art cannot block consequence | Branch illustration was the only large visual response | Authored Three.js archive geometry and mutations happen immediately; generated branch art remains an optional later layer |

## Rin slice

- Episode 0 runs for 55 seconds in the Motion Archive Corridor with four authored voice beats, follow/side/wide camera cuts, rain/server ambience, frame ticks and an audio dropout.
- “Gọi Rin” interrupts the current ordinary threshold line. The final protected reveal is not interruptible.
- Episode 1 begins at Frame 12 and covers the cold open, first inspection, entry/refusal, visible motion desync, boundary conflict and the irreversible channel decision.
- The first free-form window maps the visitor’s own action to a deterministic world mutation even when TTS, chat or image generation is unavailable.
- Frame outcomes open, erase, quarantine or author a new protocol. Each writes classified canon, a checkpoint and only an explicitly approved cross-mode relationship summary.

## Deliberate MVP limits

- The current GLBs are static sculpts. Prototype motion uses camera, pose-facing, light, particles and authored scene geometry; a full 12–18 skeletal motion set remains production work.
- Voice interruption is proven with the “Gọi Rin” control. Hold-to-speak microphone capture is still upcoming.
- Episode 1 is the authored first-five-minute content slice and remains player-paced; it is not forced to consume five wall-clock minutes.
