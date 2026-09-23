import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DBFILENAME = BASE_DIR / "db.sqlite"


def initialize_db(db_name=DBFILENAME):
    with sqlite3.connect(db_name) as conn:

        # -----------------------------------------------------
        # Participants
        # -----------------------------------------------------
        #
        # One row per participant.
        #
        conn.execute("""
            CREATE TABLE IF NOT EXISTS participants (
                prolific_id TEXT PRIMARY KEY,

                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # -----------------------------------------------------
        # Completed experiment units
        # -----------------------------------------------------
        #
        # One row = one completed calibration question or
        # one completed questionnaire for one stimulus/pair.
        #
        # payload contains the complete jsPsych data as JSON.
        #
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trial_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                prolific_id TEXT NOT NULL,

                phase TEXT NOT NULL,
                trial_key TEXT NOT NULL,

                trial_index INTEGER,

                section TEXT NOT NULL,

                sound_id TEXT,

                training INTEGER NOT NULL DEFAULT 0,

                payload TEXT NOT NULL,

                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (prolific_id)
                    REFERENCES participants(prolific_id),

                UNIQUE(prolific_id, phase, trial_key)
            )
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_trial_participant_phase
            ON trial_data(prolific_id, phase)
        """)

        # -----------------------------------------------------
        # Participant phase sessions
        # -----------------------------------------------------
        #
        # Stores the randomized stimulus order assigned once
        # to each participant for each phase.
        #
        conn.execute("""
            CREATE TABLE IF NOT EXISTS phase_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                prolific_id TEXT NOT NULL,
                phase TEXT NOT NULL,

                trial_order TEXT NOT NULL,

                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (prolific_id)
                    REFERENCES participants(prolific_id),

                UNIQUE(prolific_id, phase)
            )
        """)



        conn.commit()


if __name__ == "__main__":
    initialize_db()