"""Keep testX's phase 1 data and assign USER ID 37 to new phase 1 participants."""
from contextlib import closing
from datetime import datetime, timezone
import sqlite3

import model
import persistence

PHASE_TABLES = (
    'trial_permissions', 'study_controls', 'integrity_flags', 'research_events',
    'trial_data', 'phase_sessions', 'phase_assignments',
)


def reset_phase1_comparison():
    persistence.migrate()
    with closing(model.get_connection()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        assignment = conn.execute(
            "SELECT user_id FROM phase_assignments WHERE phase='phase1' AND prolific_id='testX'"
        ).fetchone()
        has_results = conn.execute(
            "SELECT 1 FROM trial_data WHERE phase='phase1' AND prolific_id='testX' AND section='test' LIMIT 1"
        ).fetchone()
        if assignment is None or assignment['user_id'] != 37 or has_results is None:
            raise ValueError("Expected testX's phase 1 USER ID 37 and saved main trials in this database.")
        if conn.execute("SELECT 1 FROM phase_assignment_overrides WHERE phase='phase1'").fetchone():
            return None, {}

        backup_dir = model.DBFILENAME.parent / 'database_backups'
        backup_dir.mkdir(exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup_path = backup_dir / f'before_phase1_comparison_{timestamp}.sqlite'
        # The write reservation prevents a commit between the backup and cleanup.
        with closing(sqlite3.connect(model.DBFILENAME.resolve().as_uri() + '?mode=ro', uri=True)) as source:
            with closing(sqlite3.connect(backup_path)) as backup:
                source.backup(backup)

        deleted = {}
        for table in PHASE_TABLES:
            exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
            if exists:
                deleted[table] = conn.execute(
                    f"DELETE FROM {table} WHERE phase='phase1' AND prolific_id<>'testX'"
                ).rowcount
        conn.execute("INSERT INTO phase_assignment_overrides(phase,user_id) VALUES ('phase1',37)")
    return backup_path, deleted


if __name__ == '__main__':
    try:
        backup, counts = reset_phase1_comparison()
    except ValueError as error:
        raise SystemExit(str(error))
    if backup is None:
        print('Phase 1 comparison mode is already enabled. No records were removed.')
    else:
        print(f'Backup: {backup}')
        for table, count in counts.items():
            print(f'{table}: removed {count} phase 1 rows')
        print('Preserved testX. New phase 1 participants receive USER ID 37.')
