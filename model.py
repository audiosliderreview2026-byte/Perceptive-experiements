import json
import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DBFILENAME = BASE_DIR / "db.sqlite"


def get_connection():
    conn = sqlite3.connect(DBFILENAME, timeout=30)
    conn.row_factory = sqlite3.Row

    # Important for relational integrity.
    conn.execute("PRAGMA foreign_keys = ON")

    return conn


# ==========================================================
# PARTICIPANTS
# ==========================================================

def ensure_participant(prolific_id):
    """
    Create participant if necessary and update last_seen_at.
    """

    with get_connection() as conn:

        conn.execute("""
            INSERT OR IGNORE INTO participants (prolific_id)
            VALUES (?)
        """, (prolific_id,))

        conn.execute("""
            UPDATE participants
            SET last_seen_at = CURRENT_TIMESTAMP
            WHERE prolific_id = ?
        """, (prolific_id,))

        conn.commit()


# ==========================================================
# SAVE TRIAL
# ==========================================================

def save_trial(data):
    """
    Save one completed experimental unit.

    UNIQUE(prolific_id, phase, trial_key) prevents duplicates.

    INSERT OR IGNORE makes repeated network submissions safe.
    """

    prolific_id = str(data["prolificID"])
    phase = str(data["phase"])
    trial_key = str(data["trial_key"])

    ensure_participant(prolific_id)

    payload = json.dumps(
        data.get("payload", {}),
        ensure_ascii=False
    )

    with get_connection() as conn:

        cursor = conn.execute("""
            INSERT OR IGNORE INTO trial_data (
                prolific_id,
                phase,
                trial_key,
                trial_index,
                section,
                sound_id,
                training,
                payload
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            prolific_id,
            phase,
            trial_key,
            data.get("trial_index"),
            data["section"],
            data.get("sound_id"),
            1 if data.get("training", False) else 0,
            payload,
        ))

        conn.commit()

        return cursor.rowcount > 0


# ==========================================================
# GET COMPLETED TRIALS
# ==========================================================

def get_completed_trials(prolific_id, phase):
    """
    Return all trial keys already completed by this participant
    for this phase.
    """

    ensure_participant(prolific_id)

    with get_connection() as conn:

        rows = conn.execute("""
            SELECT
                trial_key,
                trial_index,
                section,
                sound_id,
                training,
                created_at
            FROM trial_data
            WHERE prolific_id = ?
              AND phase = ?
            ORDER BY id
        """, (
            str(prolific_id),
            str(phase),
        )).fetchall()

        return [dict(row) for row in rows]


# ==========================================================
# GET ALL DATA FOR ONE PARTICIPANT
# ==========================================================

def get_participant_data(prolific_id):

    with get_connection() as conn:

        rows = conn.execute("""
            SELECT *
            FROM trial_data
            WHERE prolific_id = ?
            ORDER BY id
        """, (str(prolific_id),)).fetchall()

        results = []

        for row in rows:
            item = dict(row)
            item["payload"] = json.loads(item["payload"])
            results.append(item)

        return results



# ==========================================================
# PHASE SESSION / RANDOMIZED ORDER
# ==========================================================

def get_phase_session(prolific_id, phase):
    """
    Return the saved randomized order for this participant
    and phase, or None if no session exists yet.
    """

    ensure_participant(prolific_id)

    with get_connection() as conn:

        row = conn.execute("""
            SELECT *
            FROM phase_sessions
            WHERE prolific_id = ?
              AND phase = ?
        """, (
            str(prolific_id),
            str(phase),
        )).fetchone()

        if row is None:
            return None

        result = dict(row)
        result["trial_order"] = json.loads(result["trial_order"])

        return result


def create_phase_session(prolific_id, phase, trial_order):
    """
    Save the randomized order assigned to a participant.

    INSERT OR IGNORE makes this safe if two requests happen
    almost simultaneously.
    """

    ensure_participant(prolific_id)

    order_json = json.dumps(
        trial_order,
        ensure_ascii=False
    )

    with get_connection() as conn:

        conn.execute("""
            INSERT OR IGNORE INTO phase_sessions (
                prolific_id,
                phase,
                trial_order
            )
            VALUES (?, ?, ?)
        """, (
            str(prolific_id),
            str(phase),
            order_json,
        ))

        conn.commit()

    # Always return the authoritative DB version.
    return get_phase_session(prolific_id, phase)