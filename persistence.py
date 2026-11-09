"""Participant assignment and append-only research events (standard library only)."""
import json
import re
import sqlite3
import uuid
from pathlib import Path
import model


def migrate():
    with model.get_connection() as conn:
        if 'user_id' not in {r[1] for r in conn.execute('PRAGMA table_info(participants)')}:
            conn.execute('ALTER TABLE participants ADD COLUMN user_id INTEGER')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS unique_participant_user ON participants(user_id)')
        conn.execute('''CREATE TABLE IF NOT EXISTS research_events (
            event_id TEXT PRIMARY KEY, prolific_id TEXT NOT NULL REFERENCES participants(prolific_id),
            user_id INTEGER NOT NULL, phase TEXT NOT NULL, section TEXT NOT NULL,
            trial_index INTEGER, client_time TEXT, payload TEXT NOT NULL,
            stimuli TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        conn.execute('CREATE INDEX IF NOT EXISTS events_participant ON research_events(prolific_id,phase)')


def assign(prolific_id):
    if not isinstance(prolific_id,str) or not prolific_id.strip():
        raise ValueError('A non-empty prolificID is required')
    prolific_id=prolific_id.strip()
    with model.get_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')  # serialize allocation across tabs/processes
        conn.execute('INSERT OR IGNORE INTO participants(prolific_id) VALUES (?)',(prolific_id,))
        row=conn.execute('SELECT user_id FROM participants WHERE prolific_id=?',(prolific_id,)).fetchone()
        user=row['user_id']
        if user is None:
            used={r[0] for r in conn.execute('SELECT user_id FROM participants WHERE user_id IS NOT NULL')}
            # Preserve an existing assignment where it is unambiguous and still available.
            legacy={str(json.loads(r[0]).get('userID','')) for r in conn.execute('SELECT trial_order FROM phase_sessions WHERE prolific_id=?',(prolific_id,))}
            legacy={int(x) for x in legacy if x.isdecimal() and 1<=int(x)<=512}
            user=next(iter(legacy)) if len(legacy)==1 and not legacy.intersection(used) else next((i for i in range(1,513) if i not in used),None)
            if user is None: raise ValueError('All 512 USER IDs are assigned; generate more orders before recruiting more participants.')
            conn.execute('UPDATE participants SET user_id=? WHERE prolific_id=?',(user,prolific_id))
        conn.execute('UPDATE participants SET last_seen_at=CURRENT_TIMESTAMP WHERE prolific_id=?',(prolific_id,))
    return {'prolificID':prolific_id,'userID':str(user)}


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
        filename='pink_noise.wav' if payload['calibration_test']=='volume' else 'left.wav'
        result.append(describe_sound('/static/stimulis/calibration/'+filename))
    if not result:
        path=payload.get('audioPath') or payload.get('stimulus')
        if isinstance(path,str) and (path.startswith('/static/') or path.endswith('.wav')):
            result.append(describe_sound(path))
    return result


def save_event(data):
    participant=assign(data.get('prolificID'))
    if str(data.get('userID'))!=participant['userID']:raise ValueError('USER ID does not match database assignment')
    if data.get('phase') not in ('phase1','phase2','phase3'):raise ValueError('Invalid phase')
    uuid.UUID(data['event_id'])
    payload=data.get('payload')
    if not isinstance(payload,dict):raise ValueError('payload must be an object')
    step=payload.get('step','screen')
    section='attention' if step=='attention' else 'training' if payload.get('training') else 'calibration' if str(step).startswith('calibration') or payload.get('calibration_test') else 'test' if step in ('ratings','audibility','listen','listenA','listenB') else 'screen'
    with model.get_connection() as conn:
        conn.execute('INSERT OR IGNORE INTO research_events(event_id,prolific_id,user_id,phase,section,trial_index,client_time,payload,stimuli) VALUES (?,?,?,?,?,?,?,?,?)',
          (data['event_id'],participant['prolificID'],int(participant['userID']),data['phase'],section,payload.get('trialIndex'),data.get('client_time'),json.dumps(payload),json.dumps(stimuli(payload))))
    return {'ok':True}
