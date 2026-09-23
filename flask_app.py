from flask import Flask, request, render_template, jsonify
from pathlib import Path
import model
app = Flask(__name__)
#CORS(app)

@app.get("/")
def home():
    prolificID=request.args['prolificID']
    return render_template('phase1.html', pID=prolificID)


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

    inserted = model.save_trial(data)

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