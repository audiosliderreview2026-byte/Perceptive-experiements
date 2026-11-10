# Spoken-digit attention checks

The five existing attention-check positions now play a synthetic English digit (0–9) and offer three randomized distinct choices. Text: “Please listen carefully” and “Select the number you heard”. Press Play sound; choices appear after playback ends. Errors allow another playback attempt. The server checks the chosen number, enforces the recording's duration, and retains the existing three-failure invalidation threshold.

Recordings were generated with the installed macOS Samantha voice, converted to mono 44.1 kHz / 16-bit PCM WAV, padded with short silence, and normalized to approximately −23 dBFS RMS. WAVs contain no number-bearing metadata. Filenames are random opaque identifiers. `scripts/generate_attention_audio.py` documents generation and refuses to overwrite working assets because their mapping may be in use.

## Important deployment step

`private_assets/attention/manifest.json` maps the recordings to their spoken digits. It is deliberately ignored by Git in both source and deployment repositories. **Upload this one file privately through PythonAnywhere Files**, to:

```
/home/bostetienne/Perceptive-experiements/private_assets/attention/manifest.json
```

The local file is in `deployment_bundle/private_assets/attention/manifest.json` (also in the source tree). Create the folder if needed; upload it before running the new app's migration. Do not put it in static/, serve it as a static mapping, or force-add it to Git. Only `/static/` should be mapped to the static directory in PythonAnywhere.

The ten opaque WAV files in the same folder **are** included in Git. On the Mac, from deployment_bundle:

```bash
git add study_control.py flask_app.py export_results.py static/js/common.js private_assets/attention/*.wav ATTENTION_AUDIO.md .gitignore RESULTS.md
git commit -m "Add server-scored spoken-digit attention checks"
git push origin codex/pilot-deployment
```

Then on PythonAnywhere (after the private mapping upload):

```bash
cd ~/Perceptive-experiements
git pull --ff-only origin codex/pilot-deployment
workon perceptual-exp
python -c "from flask_app import app; print('Spoken-digit checks ready')"
```

Reload the Web app and refresh experiment tabs. Existing completed checks are preserved; unfinished text checks are upgraded once, with obsolete pending permissions removed. No database reset is needed. Do not replace recordings or their mapping while sessions are active.

## Privacy and verification

Attention audio is served through unpredictable, session-specific `/api/attention/audio/<opaque-token>.wav` URLs with no-store caching. Before an answer, public responses contain only that URL and the three choices, never the digit-to-file mapping, the correct option, or its index. Unknown audio tokens return 404. Correct answers are stored in database completion records for analysis, not sent back to participants. The audio URL is necessarily accessible to the participant; speech recognition can still solve these checks, and filenames alone do not provide complete bot prevention.

`prolificID=attention1` through `attention5` now preview the real spoken-digit interface with a new random check. Preview requests create only temporary audio links (15 minutes); they do not create participants, responses, validity flags, or trial completions.

Completed data include `attention_kind=spoken_digit_v1`, `response` (choice index), `selected_number`, `expected_digit`, `expected_response`, `correct`, the opaque audio URL and private asset identifier. JSONL export includes the number fields under answers. Historical text checks retain their existing format.
