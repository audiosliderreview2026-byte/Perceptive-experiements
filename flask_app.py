from flask import Flask, request, render_template, jsonify, url_for, send_file
from pathlib import Path
import model
import json
import gzip
import secrets
import hashlib
import mmap
import re
import uuid
from functools import lru_cache
from init_db import initialize_db
import persistence
import study_control
initialize_db()
persistence.migrate()
study_control.migrate()
app = Flask(__name__)
#CORS(app)

@app.context_processor
def study_assets():
    def study_asset(filename):
        path = Path(app.static_folder) / filename
        version = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        return url_for('static', filename=filename, v=version)
    return {'study_asset': study_asset}

@app.after_request
def fresh_study_pages(response):
    # PythonAnywhere serves static assets directly; their URLs carry content hashes.
    if response.mimetype == 'text/html' or request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.errorhandler(study_control.ControlError)
def control_error(error):
    return jsonify(ok=False, error=str(error), code=error.code,
                   retry_after_seconds=error.retry_after), error.status

@app.before_request
def protect_study_endpoints():
    if request.path not in ('/api/save-trial','/api/trial/begin','/api/session','/api/progress','/api/event'):
        return
    data=(request.get_json(silent=True) or {}) if request.method=='POST' else request.args
    if not hasattr(data,'get'):
        raise study_control.ControlError('Invalid request body.','invalid_request',400)
    if not isinstance(data.get('prolificID'),str) or data.get('phase') not in ('phase1','phase2','phase3'):
        raise study_control.ControlError('Participant and phase are required.','invalid_request',400)
    with model.get_connection() as conn:
        token = request.headers.get('X-Study-Token') or data.get('session_token')
        control = study_control.authenticate(conn, data.get('prolificID'), data.get('phase'), token)
        if study_control.is_turchet_retest(control, token) and request.path not in ('/api/trial/begin', '/api/save-trial'):
            raise study_control.ControlError('Use the Turchet retest entry point.', 'invalid_request', 403)

@app.post('/api/attention/preview')
def attention_preview():
    return jsonify(study_control.preview_attention())

@app.get('/api/attention/audio/<token>.wav')
def attention_audio(token):
    response=send_file(study_control.find_attention_audio(token),mimetype='audio/wav',
                       download_name='audio.wav',conditional=False,etag=False)
    response.headers['Cache-Control']='no-store'
    response.headers.pop('Last-Modified',None)
    return response

@app.post('/api/trial/begin')
def begin_trial():
    return jsonify(study_control.begin(request.get_json() or {}))

@app.get("/")
def home():
    return phase1()


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

    return jsonify(study_control.submit(data))


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

    participant = persistence.assign(prolific_id, phase)
    expected_plan = load_assigned_plan(phase, participant['userID'])
    _, _, expected_plan['test'] = study_control.fixed_stimuli(prolific_id, phase)
    if trial_order != expected_plan:
        return jsonify(error='Plan does not match database USER ID'), 409
    session = model.create_phase_session(
        prolific_id,
        phase,
        expected_plan
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
    response=jsonify(load_assigned_plan(phase,user_id))
    response.headers['Cache-Control']='no-store'
    return response


def load_assigned_plan(phase,user_id):
    user_id = str(int(user_id))
    packed = Path(app.root_path) / "trial_orders_output" / phase / f"{user_id}.json.gz"
    if packed.is_file():
        with gzip.open(packed, 'rt', encoding='utf-8') as stream:
            plan = json.load(stream)
        if plan.get('userID') != user_id or plan.get('phase') != phase:
            raise ValueError('Trial-order metadata mismatch')
        return plan
    filename = Path(app.root_path) / "trial_orders_output" / f"{phase}_trial_orders.json"
    if not filename.is_file():
        raise ValueError('Trial orders missing. Run subjective_trial_orders.ipynb first.')
    stat = filename.stat()
    index = _trial_order_index(str(filename), stat.st_mtime_ns, stat.st_size)
    if user_id not in index:
        raise ValueError('USER ID not found in the version-3 trial-order export')
    start, end = index[user_id]
    with filename.open("rb") as stream:
        stream.seek(start)
        text = stream.read(end - start).decode("utf-8")
    plan, _ = json.JSONDecoder().raw_decode(text)
    if plan.get("userID") != user_id or plan.get("phase") != phase:
        raise ValueError('Trial-order metadata mismatch')
    return plan


@app.post('/api/turchet-retest')
def turchet_retest():
    key_file = Path(app.root_path) / '.turchet-retest-key'
    data = request.get_json(silent=True)
    supplied = data.get('access_key') if isinstance(data, dict) else None
    if not key_file.is_file() or not isinstance(supplied, str) or not supplied or not secrets.compare_digest(
        supplied.encode(), key_file.read_bytes().strip()
    ):
        return jsonify(error='A valid Turchet retest access key is required.'), 403
    try:
        return jsonify(study_control.register_turchet_retest(load_assigned_plan('phase2', '1')))
    except ValueError as exc:
        return jsonify(error=str(exc)), 409


@app.post('/api/participant')
def register_participant():
    try:
        data=request.get_json() or {}
        participant=persistence.assign(data.get('prolificID'),data.get('phase'))
        plan=load_assigned_plan(participant['phase'],participant['userID'])
        session = model.get_phase_session(participant['prolificID'], participant['phase'])
        participant['session_token'] = study_control.register(
            participant['prolificID'], participant['phase'], session['trial_order'] if session else plan,
            saved_plan=session is not None)
        participant['calibration_audio'], participant['training'], plan['test'] = study_control.fixed_stimuli(
            participant['prolificID'], participant['phase'])
        participant['trial_order'] = plan
        participant['control_version']=1
        return jsonify(participant)
    except ValueError as exc:
        return jsonify(error=str(exc)),409


@app.post('/api/event')
def save_research_event():
    try:
        data=request.get_json() or {}
        if isinstance(data.get('payload'),dict):
            data['payload']={**data['payload'],'record_kind':'client_screen','server_verified':False}
        return jsonify(persistence.save_event(data))
    except (ValueError,KeyError,TypeError) as exc:
        return jsonify(error=str(exc)),400
