# Research data

Start the Flask app normally; additive schema migration runs at startup. A pre-migration snapshot is in `database_backups/`. Existing participant, trial and session rows are preserved. Existing browser sessions that shared a USER ID may need a fresh test Prolific ID; they are never silently reassigned to a different experimental order.

Launch a phase with `?prolificID=YOUR_ID` (or `PROLIFIC_PID`). The server allocates a unique USER ID, reuses it on return across all phases, and overwrites any userID URL hint with the authoritative assignment. There are 512 available orders; exhaustion returns an explicit error rather than reusing an ID. Registration reserves the ID even if the participant does not finish.

`participants.user_id` is uniquely indexed. `phase_sessions` stores the assigned experimental plan. `trial_data` stores completed question units for resume/progress. `research_events` stores append-only individual screen records, including every calibration attempt, playback screens, audibility questions, training, attention checks and ratings. Raw jsPsych payloads retain response, response time, stimuli and available answers. Explicit `record_kind=completed_unit` events store final questionnaire values independently of jsPsych callback ordering; use these when analyzing final answers, rather than counting raw screen events as additional observations. Skipped slider answers are null. Catch-trial correctness is recorded, with no automatic rejection.

`research_events.stimuli` contains played paths, source paths (including training provenance), presentation slots, semantic reference/transformed roles, categories, edit flags, alpha and Turchet H2H/PK where available. Listen events indicate which pair member was played. Historical records from before this change are preserved but cannot recover calibration attempts or details that were never recorded.

Saving uses a localStorage outbox and idempotent server writes. Failed requests remain in that browser and retry on reconnect, reload, or the final save screen. Keep the page open when the save warning appears. Completion is shown only after queued saves succeed. Clearing browser storage, changing browsers, or a device failure can lose unsent responses; acknowledged records remain in SQLite. Concurrent allocation is serialized in SQLite.

Export:

```sh
python export_results.py --output research_results.jsonl
```

Each line contains participant/USER ID, phase, section, timestamps, structured answers, sound metadata and the original payload. With pandas installed:

```python
import pandas as pd
records = pd.read_json('research_results.jsonl', lines=True)
final = records[records.payload.map(lambda p: p.get('record_kind') == 'completed_unit')]
answers = pd.json_normalize(final.answers)
```

Training WAVs and manifest are in `static/stimulis/training/`. Experimental plans remain in `trial_orders_output/`. Database backups and exported datasets contain participant identifiers; they are research data, not application assets.

## Questionnaire revision (2026-11-10)

Phase 1 now presents audibility, artefacts (`integrite`) and realism (`plausibilite`) together, in that order. Both sliders require movement for audible trials. Inaudible trials retain their audibility answer and save null slider values. The answer keys and 0–100 direction are unchanged; `questionnaire_version`, `question_order`, and `audibility_labels` identify the revised presentation. Phase 1 has four fixed practice examples; other phases retain three.

At the end of each phase, `feedback|final` is saved in `trial_data` under section `feedback`, and in `research_events` with step/section `feedback`. Fields: `volume_changed` (boolean), `volume_change_reason` (required nonblank text for yes, null for no), and `general_feedback` (optional text). The same durable retry queue protects feedback; completed feedback is skipped on resume. These fields are included in JSONL `answers` and the analysis notebook's flattened `answer.*` columns. No database migration is needed.

Volume calibration records all three sample paths. Headphone checks record the actual left/right stimulus and correct answer; the first ear is randomized, and failed attempts alternate ears without announcing the next side.

Phases 2 and 3 use combined audibility/rating forms. Both A/B audibility answers are required; either inaudible answer hides ratings and saves nulls. Audible pairs require both emotion circles (phase 2) or all four sliders (phase 3) to move. Their practice explanations and endpoints follow the questionnaire JSONs. Calibration examples 2/3 are fixed edits with |alpha| > 30; see calibration/sources.json for provenance.
