"""Participant assignment and append-only research events (standard library only)."""
import json
import re
import sqlite3
import uuid
from pathlib import Path
import model


def legacy_user_id(document):
    """Old plans may be arrays or omit assignment metadata entirely."""
    if not isinstance(document, dict): return None
    value = document.get('userID')
    if isinstance(value, bool) or value is None: return None
    text = str(value)
    return int(text) if text.isdecimal() and 1 <= int(text) <= 512 else None


def migrate():
    with model.get_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if 'user_id' not in {r[1] for r in conn.execute('PRAGMA table_info(participants)')}:
            conn.execute('ALTER TABLE participants ADD COLUMN user_id INTEGER')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS unique_participant_user ON participants(user_id)')
        conn.execute('''CREATE TABLE IF NOT EXISTS research_events (
            event_id TEXT PRIMARY KEY, prolific_id TEXT NOT NULL REFERENCES participants(prolific_id),
            user_id INTEGER NOT NULL, phase TEXT NOT NULL, section TEXT NOT NULL,
            trial_index INTEGER, client_time TEXT, payload TEXT NOT NULL,
            stimuli TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        conn.execute('CREATE INDEX IF NOT EXISTS events_participant ON research_events(prolific_id,phase)')

        new_assignments = not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='phase_assignments'").fetchone()
        conn.execute('''CREATE TABLE IF NOT EXISTS phase_assignments (
            prolific_id TEXT NOT NULL REFERENCES participants(prolific_id),
            phase TEXT NOT NULL CHECK(phase IN ('phase1','phase2','phase3')),
            user_id INTEGER NOT NULL CHECK(user_id BETWEEN 1 AND 512),
            valid INTEGER NOT NULL DEFAULT 1 CHECK(valid IN (0,1)),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(prolific_id,phase))''')
        if 'shared_slot' not in {r[1] for r in conn.execute('PRAGMA table_info(phase_assignments)')}:
            conn.execute('ALTER TABLE phase_assignments ADD COLUMN shared_slot INTEGER NOT NULL DEFAULT 0 CHECK(shared_slot IN (0,1))')
            conn.execute('DROP INDEX IF EXISTS valid_phase_slot')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS valid_phase_slot ON phase_assignments(phase,user_id) WHERE valid=1 AND shared_slot=0')
        conn.execute('''CREATE TABLE IF NOT EXISTS phase_assignment_overrides (
            phase TEXT PRIMARY KEY CHECK(phase IN ('phase1','phase2','phase3')),
            user_id INTEGER NOT NULL CHECK(user_id BETWEEN 1 AND 512))''')
        if new_assignments:
            # Preserve only phases actually started; unused phases start allocating at 1.
            assignments = {}
            for row in conn.execute('SELECT prolific_id,phase,trial_order FROM phase_sessions'):
                user = legacy_user_id(json.loads(row[2]))
                if user is not None: assignments[(row[0], row[1])] = user
            for table in ('trial_data', 'research_events'):
                fallback = 'user_id' if table == 'research_events' else 'NULL'
                for row in conn.execute(f'SELECT prolific_id,phase,payload,{fallback} FROM {table}'):
                    key = (row[0], row[1]); value = legacy_user_id(json.loads(row[2]))
                    if value is None: value = row[3]
                    if value is not None:
                        value = int(value)
                        if key in assignments and assignments[key] != value:
                            raise ValueError(f'Conflicting historical USER IDs for {key}; review before migration')
                        assignments[key] = value
            for row in conn.execute('SELECT s.prolific_id,s.phase,p.user_id FROM phase_sessions s JOIN participants p ON p.prolific_id=s.prolific_id WHERE p.user_id IS NOT NULL'):
                assignments.setdefault((row[0], row[1]), row[2])
            for (pid, phase), user in assignments.items():
                conn.execute('INSERT INTO phase_assignments(prolific_id,phase,user_id) VALUES (?,?,?)', (pid,phase,user))


def assign(prolific_id, phase='phase1'):
    if not isinstance(prolific_id,str) or not prolific_id.strip():
        raise ValueError('A non-empty prolificID is required')
    if phase not in ('phase1','phase2','phase3'):
        raise ValueError('A valid phase is required')
    prolific_id=prolific_id.strip()
    with model.get_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        conn.execute('INSERT OR IGNORE INTO participants(prolific_id) VALUES (?)',(prolific_id,))
        row=conn.execute('SELECT user_id,valid FROM phase_assignments WHERE prolific_id=? AND phase=?',(prolific_id,phase)).fetchone()
        if row:
            user, valid = row['user_id'], row['valid']
        elif override := conn.execute('SELECT user_id FROM phase_assignment_overrides WHERE phase=?',(phase,)).fetchone():
            user, valid = override['user_id'], 1
            conn.execute('INSERT INTO phase_assignments(prolific_id,phase,user_id,shared_slot) VALUES (?,?,?,1)',
                         (prolific_id,phase,user))
        else:
            used={r[0] for r in conn.execute('SELECT user_id FROM phase_assignments WHERE phase=? AND valid=1',(phase,))}
            invalid={r[0] for r in conn.execute('SELECT user_id FROM phase_assignments WHERE phase=? AND valid=0',(phase,))}
            legacy=conn.execute('SELECT trial_order FROM phase_sessions WHERE prolific_id=? AND phase=?',(prolific_id,phase)).fetchone()
            if legacy:
                user=legacy_user_id(json.loads(legacy[0]))
                if user is None:
                    raise ValueError('This legacy session has no recoverable USER ID. Use a new test Prolific ID; its historical results have been retained.')
                if user in used: raise ValueError('Historical phase assignment is occupied; review before resuming')
            else:
                user=next(iter(sorted(invalid-used)),None)
                if user is None: user=next((i for i in range(1,513) if i not in used),None)
            if user is None: raise ValueError('All 512 USER IDs for this phase are assigned')
            valid=1
            conn.execute('INSERT INTO phase_assignments(prolific_id,phase,user_id,valid) VALUES (?,?,?,1)',(prolific_id,phase,user))
        conn.execute('UPDATE participants SET last_seen_at=CURRENT_TIMESTAMP WHERE prolific_id=?',(prolific_id,))
    return {'prolificID':prolific_id,'phase':phase,'userID':str(user),'valid':bool(valid)}


def set_validity(prolific_id, phase, valid):
    if phase not in ('phase1','phase2','phase3'): raise ValueError('Invalid phase')
    with model.get_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT user_id FROM phase_assignments WHERE prolific_id=? AND phase=?',(prolific_id,phase)).fetchone()
        if row is None: raise ValueError('No assignment found for this participant and phase')
        try:
            columns={r[1] for r in conn.execute('PRAGMA table_info(phase_assignments)')}
            if 'invalid_reason' in columns:
                conn.execute('UPDATE phase_assignments SET valid=?,invalid_reason=?,invalidated_at=CASE WHEN ? THEN NULL ELSE CURRENT_TIMESTAMP END WHERE prolific_id=? AND phase=?',
                             (int(bool(valid)),None if valid else 'manual',int(bool(valid)),prolific_id,phase))
            else:
                conn.execute('UPDATE phase_assignments SET valid=? WHERE prolific_id=? AND phase=?',(int(bool(valid)),prolific_id,phase))
        except sqlite3.IntegrityError as exc:
            raise ValueError('This USER ID has already been reassigned in this phase; cannot mark both assignments valid') from exc
    return {'prolificID':prolific_id,'phase':phase,'userID':str(row[0]),'valid':bool(valid)}


def describe_sound(path, role=None):
    if not isinstance(path,str): return None
    played_path=path
    source_map=Path(__file__).parent/'static/stimulis/training/sources.json'
    if '/training/' in path and source_map.exists():
        path=json.loads(source_map.read_text()).get(path,path)
    alpha=re.search(r'__alpha_([mp])(\d+)[pd](\d+)',path,re.I)
    value=(-1 if alpha[1].lower()=='m' else 1)*float(alpha[2]+'.'+alpha[3]) if alpha else None
    category=('youtube_background' if 'yt_edit+residual' in path or 'test_yt_originals/' in path else
              'youtube_isolated' if 'test_yt_' in path else 'turchet' if 'Turchet_baseline' in path else
              'plugin_shared' if 'turchet_centers' in path else 'plugin' if 'plugin' in path else 'training' if '/training/' in path else 'calibration')
    return {'audio_path':played_path,'source_audio_path':path,'role':role,'category':category,'alpha':value,
            'edited':bool(alpha or '__H2H_' in path),
            'h2h_ms':float(re.search(r'__H2H_([\d.]+)ms',path)[1]) if '__H2H_' in path else None,
            'pk_db':float(re.search(r'__PK_([\d.]+)dB',path)[1]) if '__PK_' in path else None}


def stimuli(payload):
    result=[]
    for key,role in [('soundA','A'),('soundB','B')]:
        clip=payload.get(key)
        if isinstance(clip,dict) and clip.get('audioPath'):
            result.append({**describe_sound(clip['audioPath'],role),'stim_type':clip.get('stimType'),
                           'source_id':clip.get('sourceId'),'reference_role':payload.get(f'sound_{role}_role'),
                           'played_in_this_event':payload.get('stimulus')==clip['audioPath'] if payload.get('step') in ('listenA','listenB') else None})
    if not result and payload.get('calibration_test') in ('volume','stereo'):
        paths = payload.get('audio_paths') or [payload.get('audioPath') or ('/static/stimulis/calibration/pink_noise.wav' if payload['calibration_test']=='volume' else '/static/stimulis/calibration/left.wav')]
        result.extend(describe_sound(path) for path in paths)
    if not result:
        path=payload.get('audioPath') or payload.get('stimulus')
        if isinstance(path,str) and (path.startswith('/static/') or path.endswith('.wav')):
            result.append(describe_sound(path))
    return result


def save_event(data):
    participant=assign(data.get('prolificID'), data.get('phase'))
    if str(data.get('userID'))!=participant['userID']:raise ValueError('USER ID does not match database assignment')
    if data.get('phase') not in ('phase1','phase2','phase3'):raise ValueError('Invalid phase')
    uuid.UUID(data['event_id'])
    payload=data.get('payload')
    if not isinstance(payload,dict):raise ValueError('payload must be an object')
    step=payload.get('step','screen')
    section='feedback' if step=='feedback' else 'attention' if step=='attention' else 'training' if payload.get('training') else 'calibration' if str(step).startswith('calibration') or payload.get('calibration_test') else 'test' if step in ('ratings','audibility','listen','listenA','listenB') else 'screen'
    with model.get_connection() as conn:
        conn.execute('INSERT OR IGNORE INTO research_events(event_id,prolific_id,user_id,phase,section,trial_index,client_time,payload,stimuli) VALUES (?,?,?,?,?,?,?,?,?)',
          (data['event_id'],participant['prolificID'],int(participant['userID']),data['phase'],section,payload.get('trialIndex'),data.get('client_time'),json.dumps(payload),json.dumps(stimuli(payload))))
    return {'ok':True}
