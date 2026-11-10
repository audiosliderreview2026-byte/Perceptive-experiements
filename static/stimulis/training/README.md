# Fixed training examples

`manifest.json` defines four examples for phase 1 and three for phases 2 and 3 in presentation order. Everyone receives the same files and A/B order. These are independent copies of five-second experimental excerpts. `sources.json` records their source paths.

Replace the WAVs in phase1/, phase2/ or phase3/ to change examples without changing code. Keep each WAV five seconds long. Phase 1 examples 1 and 2 copy phase 2 reference 1 and edit 2; example 3 is digital silence. Phase 3 pairs are plugin, isolated YouTube, reconstructed YouTube, respectively. Training playback always uses soundA then soundB. Keep reference/transformed roles consistent if editing the manifest. The original/edited aliases are legacy presentation slots.

Changes to phase2 audio do not automatically update the independent phase1 copies. Copy the desired sound across if both should change. Use a fresh test Prolific ID after changing training assets, because completed training trials are resumed by index. No trial-order notebook regeneration is required. Training examples currently reuse experimental source recordings; they are marked training and excluded from experimental ratings.

Phase 1 example 4 (`phase1/04_sound.wav`) is the second main-study sound saved for KT (user 19), phase 1, trialIndex 1: `test_yt_originals/clip_07_6m10s__first_0-5s.wav`. It is an unedited original, with no alpha value. Retrieved from results_snapshot.sqlite.

Volume calibration uses pink noise and two fixed edits: `../calibration/extreme_positive.wav` (alpha +41.685126) and `../calibration/extreme_negative.wav` (alpha −32.460260). Their source paths are recorded in `../calibration/sources.json`. The right-ear check in `../calibration/right.wav` swaps the channels of left.wav.

Question wording and slider endpoints are configured in `static/js/questions_phase2.json` and `questions_phase3.json`. For phase 2, the first entry defines the shared A/B question and endpoints (the second entry retains the Emotion_B answer key). Both practice instructions and the actual form use these labels. Keep answer keys unchanged when revising wording.

Phase 1 presentation order now swaps the former examples 2 and 4: `01_sound.wav`, `04_sound.wav`, `03_silence.wav`, `02_sound.wav`. Filenames stay fixed; manifest trialIndex/trialKey specify presentation order. Existing server-controlled sessions retain their frozen practice order; use a fresh Prolific ID to test this change. Calibration sound 2 remains `02_sound.wav`.

The current second phase 1 practice item is `phase1/02_clip10_edit08_second.wav`: the exact second (5–10 s) excerpt of `test_yt_edits/clip_10_10m03s_residual__edit_08__alpha_p6p237120__second_5-10s.wav`, alpha +6.237120, isolated YouTube edit. This supersedes the previous second item.
