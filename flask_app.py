from flask import Flask, request, render_template, jsonify
from pathlib import Path
import model
import json
import gzip
import mmap
import re
import uuid
from functools import lru_cache
from init_db import initialize_db
import persistence
initialize_db()
persistence.migrate()
app = Flask(__name__)
#CORS(app)

@app.get("/")
def home():
    prolificID=request.args['prolificID']
    return render_template('phase1.html', prolificID=prolificID)


@app.post('/send_answer')
def get_answer():
    user_data = request.form
    print(user_data)
    model.save(user_data)
    return "", 204




@app.route("/phase1")
def phase1():
    prolific_id = request.args.get("prolificID")
    return render_template(
        "phase1.html",
        prolificID=prolific_id
    )


@app.route("/phase2")
def phase2():
    prolific_id = request.args.get("prolificID")
    return render_template(
        "phase2.html",
        prolificID=prolific_id
    )


@app.route("/phase3")
def phase3():
    prolific_id = request.args.get("prolificID")
    return render_template(
        "phase3.html",
        prolificID=prolific_id
    )


@app.route("/training-experiment")
def training_experiment():
    prolific_id = request.args.get("prolificID")
    return render_template(
        "exp-sons-apprentissage.html",
        prolificID=prolific_id
    )

@app.post("/api/save-trial")
def save_trial():

    data = request.get_json()

    if not data:
        return jsonify({
            "ok": False,
            "error": "Missing JSON body"
        }), 400

    required = [
        "prolificID",
        "phase",
        "trial_key",
        "section",
        "payload",
    ]

    missing = [
        field for field in required
        if field not in data
    ]

    if missing:
        return jsonify({
            "ok": False,
            "error": "Missing required fields",
            "missing": missing,
        }), 400

    try:
        participant = persistence.assign(data['prolificID'])
        if str(data.get('payload', {}).get('userID')) != participant['userID']:
            return jsonify(error='USER ID does not match database assignment'), 409
    except ValueError as exc:
        return jsonify(error=str(exc)), 409
    inserted = model.save_trial(data)
    # Final question values are explicit here, independent of jsPsych hook ordering.
    persistence.save_event({
        'event_id': str(uuid.uuid5(uuid.NAMESPACE_URL,
                         f"{data['prolificID']}:{data['phase']}:{data['trial_key']}:completed")),
        'prolificID': data['prolificID'], 'userID': participant['userID'],
        'phase': data['phase'],
        'payload': {**data['payload'], 'record_kind': 'completed_unit',
                    'trial_key': data['trial_key'], 'section': data['section'],
                    'training': bool(data.get('training'))},
    })

    return jsonify({
        "ok": True,
        "inserted": inserted,
    })

@app.get("/api/progress")
def get_progress():

    prolific_id = request.args.get("prolificID")
    phase = request.args.get("phase")

    if not prolific_id or not phase:
        return jsonify({
            "ok": False,
            "error": "prolificID and phase are required"
        }), 400

    completed = model.get_completed_trials(
        prolific_id,
        phase
    )

    return jsonify({
        "ok": True,
        "completed": completed,
    })

@app.get("/api/session")
def get_session():

    prolific_id = request.args.get("prolificID")
    phase = request.args.get("phase")

    if not prolific_id or not phase:
        return jsonify({
            "ok": False,
            "error": "prolificID and phase are required"
        }), 400

    session = model.get_phase_session(
        prolific_id,
        phase
    )

    completed = model.get_completed_trials(
        prolific_id,
        phase
    )

    return jsonify({
        "ok": True,
        "session": session,
        "completed": completed,
    })

@app.post("/api/session")
def create_session():

    data = request.get_json()

    if not data:
        return jsonify({
            "ok": False,
            "error": "Missing JSON body"
        }), 400

    prolific_id = data.get("prolificID")
    phase = data.get("phase")
    trial_order = data.get("trial_order")

    if not prolific_id or not phase or trial_order is None:
        return jsonify({
            "ok": False,
            "error": "prolificID, phase and trial_order are required"
        }), 400

    participant = persistence.assign(prolific_id)
    if str(trial_order.get('userID')) != participant['userID']:
        return jsonify(error='Plan does not match database USER ID'), 409
    session = model.create_phase_session(
        prolific_id,
        phase,
        trial_order
    )

    return jsonify({
        "ok": True,
        "session": session,
    })


# ==========================================================
# STIMULUS MANIFEST
# ==========================================================

@app.get("/api/stimuli")
def get_stimuli():

    stimuli_root = (
        Path(app.root_path)
        / "static"
        / "stimulis"
    )

    categories = [
        "baseline",
        "train",
        "test",
        "originals",
    ]

    stimuli = {}

    for category in categories:

        folder = stimuli_root / category

        if not folder.exists():
            stimuli[category] = []
            continue

        files = sorted(
            [
                path
                for path in folder.iterdir()
                if (
                    path.is_file()
                    and path.suffix.lower() == ".wav"
                )
            ],
            key=lambda path: path.name.lower()
        )

        stimuli[category] = [
            {
                "soundId": path.stem,
                "soundType": category,
                "audioPath": (
                    f"/static/stimulis/"
                    f"{category}/"
                    f"{path.name}"
                ),
            }
            for path in files
        ]

    return jsonify(stimuli)

# Index the version-3 notebook exports without decoding an entire 200+ MB file.
# Each participant entry starts with {version: 3, userID: "...", ...}.
_ORDER_ENTRY = re.compile(
    rb'"([1-9][0-9]*)"\s*:\s*\{\s*"version"\s*:\s*3\s*,\s*"userID"\s*:\s*"\1"\s*,'
)


@lru_cache(maxsize=3)
def _trial_order_index(filename, modified_ns, size):
    with open(filename, "rb") as stream:
        with mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as mapped:
            entries = list(_ORDER_ENTRY.finditer(mapped))
            return {
                match.group(1).decode(): (
                    mapped.find(b"{", match.start(), match.end()),
                    entries[i + 1].start() if i + 1 < len(entries) else size,
                )
                for i, match in enumerate(entries)
            }


@app.get("/api/trial-order")
def assigned_trial_order():
    phase = request.args.get("phase", "")
    user_id = request.args.get("userID", "")
    if phase not in {"phase1", "phase2", "phase3"}:
        return jsonify(error="phase must be phase1, phase2 or phase3"), 400
    if not user_id.isdecimal() or not 1 <= int(user_id) <= 512:
        return jsonify(error="userID must be an integer from 1 to 512"), 400
    user_id = str(int(user_id))
    packed = Path(app.root_path) / "trial_orders_output" / phase / f"{user_id}.json.gz"
    if packed.is_file():
        with gzip.open(packed, 'rt', encoding='utf-8') as stream:
            plan = json.load(stream)
        if plan.get('userID') != user_id or plan.get('phase') != phase:
            return jsonify(error='Trial-order metadata mismatch'), 500
        response = jsonify(plan)
        response.headers['Cache-Control'] = 'no-store'
        return response
    filename = Path(app.root_path) / "trial_orders_output" / f"{phase}_trial_orders.json"
    if not filename.is_file():
        return jsonify(error="Trial orders missing. Run subjective_trial_orders.ipynb first."), 404
    stat = filename.stat()
    index = _trial_order_index(str(filename), stat.st_mtime_ns, stat.st_size)
    if user_id not in index:
        return jsonify(error="USER ID not found in the version-3 trial-order export"), 404
    start, end = index[user_id]
    with filename.open("rb") as stream:
        stream.seek(start)
        text = stream.read(end - start).decode("utf-8")
    plan, _ = json.JSONDecoder().raw_decode(text)
    if plan.get("userID") != user_id or plan.get("phase") != phase:
        return jsonify(error="Trial-order metadata mismatch"), 500
    response = jsonify(plan)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post('/api/participant')
def register_participant():
    try:
        return jsonify(persistence.assign((request.get_json() or {}).get('prolificID')))
    except ValueError as exc:
        return jsonify(error=str(exc)),409


@app.post('/api/event')
def save_research_event():
    try:
        return jsonify(persistence.save_event(request.get_json() or {}))
    except (ValueError,KeyError,TypeError) as exc:
        return jsonify(error=str(exc)),400
