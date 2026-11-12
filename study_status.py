"""Preview study assignments and saved main trials from the Bash console."""
import argparse
from contextlib import closing
import sqlite3

import model
from persistence import next_available_user_id

PHASES = ('phase1', 'phase2', 'phase3')


def update_assignments(resume_phase1, release_phase2_id1, phase23_comparison=None):
    with closing(model.get_connection()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        if resume_phase1:
            conn.execute("DELETE FROM phase_assignment_overrides WHERE phase='phase1' AND user_id=37")
        if phase23_comparison is True:
            conn.executemany(
                'INSERT INTO phase_assignment_overrides(phase, user_id) VALUES (?, 1) '
                'ON CONFLICT(phase) DO UPDATE SET user_id=excluded.user_id',
                [('phase2',), ('phase3',)],
            )
        elif phase23_comparison is False:
            conn.execute("DELETE FROM phase_assignment_overrides WHERE phase IN ('phase2','phase3') AND user_id=1")
        if release_phase2_id1:
            result = conn.execute("""
                UPDATE phase_assignments
                SET valid=0, invalid_reason='manual', invalidated_at=CURRENT_TIMESTAMP
                WHERE phase='phase2' AND user_id=1 AND valid=1
            """)
            print(f'Phase 2 slot 1: marked {result.rowcount} existing assignments invalid.')


def print_status(limit):
    uri = model.DBFILENAME.resolve().as_uri() + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('BEGIN')
        count = conn.execute('SELECT COUNT(*) FROM participants').fetchone()[0]
        print(f'Participants: {count}')
        for phase in PHASES:
            slot = next_available_user_id(conn, phase)
            assigned = conn.execute('SELECT COUNT(*) FROM phase_assignments WHERE phase=?', (phase,)).fetchone()[0]
            print(f'{phase}: {assigned} assignments, next USER ID {slot if slot is not None else "unavailable"}')
        users = conn.execute("""
            SELECT prolific_id, created_at FROM participants
            ORDER BY created_at DESC, rowid DESC LIMIT ?
        """, (limit,)).fetchall()
        assignments = {(row['prolific_id'], row['phase']): row for row in conn.execute(
            'SELECT prolific_id, phase, user_id, valid FROM phase_assignments'
        )}
        completed = {(row['prolific_id'], row['phase']): row['trials'] for row in conn.execute("""
            SELECT prolific_id, phase, COUNT(*) AS trials FROM trial_data
            WHERE section='test' AND training=0 GROUP BY prolific_id, phase
        """)}
        print('\nProlific ID\tCreated (UTC)\tPhase 1 ID / trials\tPhase 2 ID / trials\tPhase 3 ID / trials')
        for user in users:
            pid = user['prolific_id']
            cells = [pid, user['created_at']]
            for phase in PHASES:
                assignment = assignments.get((pid, phase))
                label = str(assignment['user_id']) if assignment else '—'
                if assignment and not assignment['valid']:
                    label += ' (invalid)'
                cells.append(f'{label} / {completed.get((pid, phase), 0)}')
            print('\t'.join(cells))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int, default=30, help='Number of newest participants to list')
    parser.add_argument('--resume-phase1', action='store_true', help='Remove the shared phase 1 USER ID 37 override')
    parser.add_argument('--release-phase2-id1', action='store_true',
                        help='Mark the current phase 2 slot 1 assignment invalid while retaining responses')
    phase23 = parser.add_mutually_exclusive_group()
    phase23.add_argument('--compare-phase2-phase3', dest='phase23_comparison', action='store_true',
                         help='Assign shared USER ID 1 to new phase 2 and phase 3 participants')
    phase23.add_argument('--resume-phase2-phase3', dest='phase23_comparison', action='store_false',
                         help='Remove the shared USER ID 1 override from phases 2 and 3')
    parser.set_defaults(phase23_comparison=None)
    args = parser.parse_args()
    if args.limit < 0:
        parser.error('--limit must be nonnegative')
    if args.resume_phase1 or args.release_phase2_id1 or args.phase23_comparison is not None:
        update_assignments(args.resume_phase1, args.release_phase2_id1, args.phase23_comparison)
    print_status(args.limit)
