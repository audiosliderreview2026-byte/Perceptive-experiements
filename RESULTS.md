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

Prolific URL parameters `STUDY_ID` and `SESSION_ID` are saved in response/event payloads and exported as top-level JSONL fields. They are also recorded in a `participant_context` event immediately after registration. Missing parameters are null; existing historical records remain null. The analysis notebook exposes them as `answer.STUDY_ID` and `answer.SESSION_ID` in flattened completed responses. These parameters do not choose a phase or change participant assignment; the phase remains determined by the URL path. No schema migration is required.


## Phase-specific assignments and validity

The current allocator supersedes the earlier global USER ID policy. `phase_assignments` has one row per `(prolific_id, phase)`, with `user_id` and binary `valid` (default 1). Only valid rows must have unique `(phase, user_id)`. Existing started-phase IDs are migrated from sessions/results, retaining historical plans and answers. A global legacy participants.user_id is retained for compatibility but is no longer used to allocate or analyze new assignments. Do not renumber historical sessions.

Each new participant in a phase receives the lowest invalid slot that has not already been reassigned to a valid participant, otherwise the lowest unused ID (1–512). Allocation is serialized in SQLite. Returning participants keep their existing phase assignment, even when marked invalid; their responses never overwrite another participant's records. Invalidating a participant does not automatically reject a Prolific submission. Revalidating an old assignment fails if its slot has already been reused.

Before deploying this schema change, make a consistent SQLite backup with Python's sqlite3.Connection.backup, then deploy Python and JS together and reload the Web app. Migration runs automatically at application startup, in a transaction. Previously loaded tabs should reload to use phase-aware registration.

On PythonAnywhere, mark one participant's phase invalid with:

```bash
cd ~/Perceptive-experiements
workon perceptual-exp
python set_assignment_validity.py --prolific-id PARTICIPANT_ID --phase phase1 --invalid
```

Use `--valid` instead to restore validity if the slot is still available. The binary field can also be edited in SQLite; the unique valid-slot index prevents two valid occupants. Do not mark every row with the same user_id invalid: identify both participant and phase.

JSONL exports contain the current assignment validity as `valid`, while retaining all historical records. The inspection notebook joins assignments on participant AND phase. Invalid records remain available for analysis and may be filtered explicitly. After reuse, user_id alone is not a unique participant key; group on prolific_id and phase.

## Server progression and integrity controls (control_version 1)

The current API supersedes the earlier direct /api/save-trial behavior. Deploy `study_control.py`, `flask_app.py`, `persistence.py`, and `common.js` together. Back up SQLite first, import flask_app once to migrate, then reload the Web app. Refresh existing browser tabs. The migration preserves completed legacy units; it does not retrospectively certify their timing or invalidate prior participants.

Registration returns a random session permission, bound to participant and phase, plus the practice assets frozen for that session. `/api/trial/begin` issues an opaque permission for the next required completed unit only. Order is calibration, fixed practice, assigned main trials with their existing checks, then feedback. Re-registering or retrying cannot reset timestamps or obtain permissions for later trials in parallel. The server loads the assignment itself, rather than accepting a modified client trial order.

New saves require both permissions and a durable submission ID. The server validates assignment identity, audio paths/pair metadata, question ranges, audibility/skip consistency, and mandatory feedback fields. Completion and the authoritative research event commit together. Identical retries are idempotent; changing a completed answer is rejected. Raw screen events are marked `client_screen`, `server_verified=false`; only the accepted completion event is marked `completed_unit`, `server_verified=true`. Session permissions never appear in exported response payloads.

Minimum listening time uses server timestamps from issuance of the current unit's permission. Each sound contributes its actual duration, capped at five seconds; pairs require the sum (normally 10 seconds). Volume calibration requires the combined duration of all four examples. Client-reported RT does not determine eligibility. The normal browser flow still waits for playback; it also waits for the previous response to save before requesting the next permission. Slightly early saves receive HTTP 425 with a retry delay, and the browser waits and retries automatically.

`integrity_flags` records participant, phase, trial key, request ID, reason/details, severity, and server creation time. Defaults in study_control.py:

- **Automatic invalidation after 3 distinct serious protocol submissions:** missing/wrong trial permission, changing completed answers, wrong assigned sound or unit, invalid response structure, or submitting more than one second before the minimum time. Retries of the same submission count once. Failed requests are not recorded as completed answers.
- **Automatic invalidation after 3 failed existing attention checks.** The server computes correctness instead of trusting a client `correct` flag. No new audio checks are introduced.
- **Review only:** timing discrepancies of one second or less. Reconnects, repeated permission requests, concurrent-tab order mismatches, long breaks, and repetitive subjective ratings do not automatically invalidate a participant.
- Requests without a valid session permission are rejected without invalidating a claimed participant. A denied request without a durable submission ID asks for a reload rather than penalizing old tabs.

Automatic invalidation sets phase_assignments.valid=0 and records `invalid_reason` and `invalidated_at`. It retains results, allows the participant to finish, and makes the slot reusable under the existing allocator. It does not reject or withhold payment through Prolific. The existing set_assignment_validity.py command allows manual review/reversal when the slot is still free. Analysis notebooks display flags and reasons; plots exclude invalid assignments by default. JSONL exports include validity, reason, invalidation time and server_verified.

Older unsent browser jobs that predate permissions are preserved locally under `listening-study-unverified-outbox-v1`, rather than silently accepted as verified responses. The same archive retains permanently rejected jobs; normal network failures remain in the durable retry outbox. Unfinished trials can be replayed after reload. Inspect/archive recovery should be done before clearing browser storage.

**Limits:** these controls establish order, elapsed time and response validity, not human identity or actual listening. A bot can still wait the required time or use speech recognition for future audio checks. Registration still uses the supplied Prolific ID; the permission is not independent verification of a Prolific account. All audio files remain public static assets. Do not interpret these checks as proof that system audio was audible or headphones were worn.

## Spoken-digit checks

The new attention checks supersede the earlier text-only instruction checks. Read ATTENTION_AUDIO.md before deployment: the answer map is uploaded privately, while the opaque WAVs and code are deployed through Git. Five randomized spoken-digit checks use three number choices, server-side scoring and recording-duration timing. Existing validity rules remain. Completed historical checks are preserved, and unfinished text checks are migrated. Selected/expected digits and correctness are available in exports and the inspection notebook. Previews attention1–attention5 use ephemeral, unsaved checks.

## Systematic screen and interaction timing

New browser sessions record timing for every jsPsych screen: instructions, calibration attempts, listening screens, practice and main questionnaires, attention checks, feedback, breaks, loading and server-permission screens. Preview IDs remain unsaved. Existing jsPsych `rt` is retained, but custom forms now also have a common measurement independent of plugin RT.

- `screen_duration_ms`: monotonic client render-to-finish duration, measured before the response-saving callback; it includes audio playback and hidden-tab time.
- `timing_complete`: true for finished screens; false for partial checkpoints.
- `timing.screen_id`: unique per presentation/attempt, including repeated calibration or resumed screens.
- `timing.started_at` / `measured_at`: client wall-clock timestamps for orientation; relative timing uses performance.now.
- `timing.visible_duration_ms` and `hidden_duration_ms`: screen duration split by document visibility. Visible time does not establish attention.
- `timing.first_interaction_ms` / `last_interaction_ms`: first/last observed control interaction relative to screen appearance.
- `timing.questions[question_key]`: first/last interaction, first focus, first/last change, and event count. Generic sliders use questionnaire keys; phase 2 circles use Emotion_A/B. Audibility, feedback fields, calibration and attention controls are also identified.
- `timing.interactions`: chronological click, pointer-down/up, slider keyboard, focus and input/change timestamps. Button entries include their visible label. Free-text contents, key identities, clipboard data and mouse trajectories are not captured by this tracker. Submitted feedback text continues to be saved normally. The event array is capped at 2,000 entries per screen, with omitted_interactions recording truncation; question summaries continue updating.

Measurements are saved with completed answers and each screen's research event. Checkpoints are saved every 15 seconds, when the tab becomes hidden, and on pagehide, using the existing durable outbox. If the browser closes abruptly without pagehide, the last interval can be missing. Offline checkpoints are retained locally until transmitted. Returning to an interrupted question produces a new screen_id. No browser-storage data can be recovered after it has been cleared.

All times are in milliseconds. Several questions can appear simultaneously, so per-question interaction latencies are relative to the screen's appearance, not isolated question reading/decision times. Focus alone is not an answer, and slider changes can occur several times before submission. These measurements are client-reported descriptive data, distinct from the server's eligibility timer (`server_elapsed_seconds`). They do not change automatic invalidation rules.

The inspection notebook adds screen_timings, question_timings and click_timings dataframes. It selects the final/latest snapshot per screen_id to avoid counting raw-screen events, accepted completed-unit events and checkpoints as separate presentations. Partial records remain marked incomplete. Legacy records without the new metadata are skipped. JSONL exports retain the full timing object in payload, and include screen_duration_ms/timing_complete in answers. No database migration/reset is needed; deploy common.js and export_results.py, refresh the study page, then download a fresh snapshot for analysis.
