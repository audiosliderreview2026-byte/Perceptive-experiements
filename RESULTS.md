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
