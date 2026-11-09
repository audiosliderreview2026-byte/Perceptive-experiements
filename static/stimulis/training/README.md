# Fixed training examples

`manifest.json` defines the three examples in each phase in presentation order. Everyone receives the same files and A/B order. These are independent copies of five-second experimental excerpts. `sources.json` records their source paths.

Replace the WAVs in phase1/, phase2/ or phase3/ to change examples without changing code. Keep each WAV five seconds long. Phase 1 examples 1 and 2 copy phase 2 reference 1 and edit 2; example 3 is digital silence. Phase 3 pairs are plugin, isolated YouTube, reconstructed YouTube, respectively. Training playback always uses soundA then soundB. Keep reference/transformed roles consistent if editing the manifest. The original/edited aliases are legacy presentation slots.

Changes to phase2 audio do not automatically update the independent phase1 copies. Copy the desired sound across if both should change. Use a fresh test Prolific ID after changing training assets, because completed training trials are resumed by index. No trial-order notebook regeneration is required. Training examples currently reuse experimental source recordings; they are marked training and excluded from experimental ratings.
