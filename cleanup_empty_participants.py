"""Remove older participants with zero saved main trials across all phases."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

PARTICIPANT_TABLES = (
    'trial_permissions', 'study_controls', 'integrity_flags', 'research_events',
    'trial_data', 'phase_sessions', 'phase_assignments', 'participants',
)


def cleanup(database, keep_latest=5):
    database = Path(database).expanduser().resolve(strict=True)
    if keep_latest < 0:
        raise ValueError('The number of recent participants to keep must be nonnegative.')
    uri = database.as_uri()
    with closing(sqlite3.connect(uri + '?mode=rw', uri=True, timeout=30)) as conn, conn:
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('BEGIN IMMEDIATE')
        conn.execute('CREATE TEMP TABLE cleanup_ids (prolific_id TEXT PRIMARY KEY)')
        conn.execute("""
            INSERT INTO cleanup_ids
            SELECT p.prolific_id
            FROM participants AS p
            WHERE p.prolific_id NOT IN (
                SELECT prolific_id FROM participants
                ORDER BY created_at DESC, rowid DESC
                LIMIT ?
            )
            AND NOT EXISTS (
                SELECT 1 FROM trial_data AS t
                WHERE t.prolific_id = p.prolific_id
                  AND t.section = 'test' AND t.training = 0
                  AND t.phase IN ('phase1', 'phase2', 'phase3')
            )
        """, (keep_latest,))
        count = conn.execute('SELECT COUNT(*) FROM cleanup_ids').fetchone()[0]
        if not count:
            return 0, None
        folder = database.parent / 'database_backups'
        folder.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup_path = folder / f'{database.stem}_before_empty_participant_cleanup_{stamp}.sqlite'
        # Keep the write reservation while backing up the exact pre-cleanup state.
        with closing(sqlite3.connect(uri + '?mode=ro', uri=True)) as source:
            with closing(sqlite3.connect(backup_path)) as backup:
                source.backup(backup)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for table in PARTICIPANT_TABLES:
            if table in tables:
                conn.execute(f'DELETE FROM {table} WHERE prolific_id IN (SELECT prolific_id FROM cleanup_ids)')
    return count, backup_path


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=Path(__file__).resolve().parent / 'db.sqlite')
    parser.add_argument('--keep-latest', type=int, default=5)
    args = parser.parse_args()
    count, backup = cleanup(args.database, args.keep_latest)
    print(f'Removed {count} participants with zero main trials.')
    if backup:
        print(f'Backup saved at {backup}')
