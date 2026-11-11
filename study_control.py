"""Server-authoritative order, timing and reviewable integrity decisions.

These controls establish elapsed time and protocol compliance, not actual hearing.
"""
import hashlib
import json
import math
import secrets
import time
import wave
from pathlib import Path

import model
import persistence

ROOT = Path(__file__).resolve().parent
CALIBRATION_AUDIO = [
    '/static/stimulis/calibration/pink_noise.wav',
    '/static/stimulis/training/phase1/02_sound.wav',
    '/static/stimulis/calibration/extreme_negative.wav',
    '/static/stimulis/calibration/quiet_alpha_minus8.wav',
]
PROTOCOL_STRIKES = 3
ATTENTION_FAILURES = 3


class ControlError(ValueError):
    def __init__(self, message, code='protocol_error', status=409, retry_after=None):
        super().__init__(message)
        self.code, self.status, self.retry_after = code, status, retry_after


def migrate():
    with model.get_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        conn.execute('''CREATE TABLE IF NOT EXISTS study_controls (
            prolific_id TEXT NOT NULL, phase TEXT NOT NULL, token TEXT NOT NULL,
            units TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(prolific_id,phase))''')
        conn.execute('''CREATE TABLE IF NOT EXISTS trial_permissions (
            prolific_id TEXT NOT NULL, phase TEXT NOT NULL, trial_key TEXT NOT NULL,
            ticket TEXT NOT NULL, issued_at REAL NOT NULL, accepted_at REAL,
            request_hash TEXT, PRIMARY KEY(prolific_id,phase,trial_key))''')
        conn.execute('''CREATE TABLE IF NOT EXISTS integrity_flags (
            id INTEGER PRIMARY KEY, prolific_id TEXT NOT NULL, phase TEXT NOT NULL,
            code TEXT NOT NULL, trial_key TEXT NOT NULL, request_id TEXT NOT NULL,
            detail TEXT NOT NULL, severity TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(prolific_id,phase,code,request_id))''')
        permission_columns={r[1] for r in conn.execute('PRAGMA table_info(trial_permissions)')}
        if 'audio_token' not in permission_columns:
            conn.execute('ALTER TABLE trial_permissions ADD COLUMN audio_token TEXT')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS permission_audio_token ON trial_permissions(audio_token)')
        conn.execute('''CREATE TABLE IF NOT EXISTS attention_previews (
            token TEXT PRIMARY KEY, audio_file TEXT NOT NULL, expires_at REAL NOT NULL)''')
        # Upgrade only unfinished old text checks, preserving all completed records.
        for row in conn.execute('SELECT prolific_id,phase,units FROM study_controls').fetchall():
            units=json.loads(row['units']);changed=False
            completed={r[0] for r in conn.execute('SELECT trial_key FROM trial_data WHERE prolific_id=? AND phase=?',(row['prolific_id'],row['phase']))}
            for i,unit in enumerate(units):
                if unit['section']=='attention' and unit.get('attention_kind')!='spoken_digit_v1' and unit['key'] not in completed:
                    units[i]=audio_attention_unit(unit['check']);changed=True
                    conn.execute('DELETE FROM trial_permissions WHERE prolific_id=? AND phase=? AND trial_key=?',(row['prolific_id'],row['phase'],unit['key']))
            if changed:conn.execute('UPDATE study_controls SET units=? WHERE prolific_id=? AND phase=?',(json.dumps(units),row['prolific_id'],row['phase']))
        columns={r[1] for r in conn.execute('PRAGMA table_info(phase_assignments)')}
        for name in ('invalid_reason','invalidated_at'):
            if name not in columns: conn.execute(f'ALTER TABLE phase_assignments ADD COLUMN {name} TEXT')


def attention_schedule(phase, user, count):
    seed=2166136261
    for char in f'{phase}:{user}:attention-v1': seed=((seed ^ ord(char))*16777619)&0xffffffff
    def random():
        nonlocal seed
        seed=(1664525*seed+1013904223)&0xffffffff
        return seed/4294967296
    checks=[]
    for i in range(5):
        low=max(1,i*count//5); high=(i+1)*count//5-1
        checks.append({'id':i,'after':low+int(random()*(high-low+1)),'expected':int(random()*3)})
    return checks


def duration(path):
    filename=ROOT / path.lstrip('/')
    if not filename.is_file():
        raise ValueError(f'Missing audio file on server: {path}. Upload this WAV and reload the app.')
    with wave.open(str(filename), 'rb') as audio:
        return min(5.0, audio.getnframes()/audio.getframerate())


def private_audio_file(filename):
    import re
    if not isinstance(filename,str) or not re.fullmatch(r'[0-9a-f]{32}\.wav',filename):
        raise ValueError('Invalid private attention asset')
    path=ROOT/'private_assets/attention'/filename
    if not path.is_file():raise ValueError('Missing private spoken-digit WAV. Upload private_assets/attention and reload.')
    return path


def audio_attention_unit(check):
    path=ROOT/'private_assets/attention/manifest.json'
    if not path.is_file():raise ValueError('Spoken-digit recordings are missing. Upload private_assets/attention and reload.')
    clips=json.loads(path.read_text())['clips']
    if sorted(clip['digit'] for clip in clips)!=list(range(10)):raise ValueError('Spoken-digit manifest must contain digits 0–9 exactly once')
    clip=secrets.choice(clips);digit=clip['digit']
    choices=secrets.SystemRandom().sample([n for n in range(10) if n!=digit],2)+[digit]
    secrets.SystemRandom().shuffle(choices)
    with wave.open(str(private_audio_file(clip['file'])),'rb') as wav:
        minimum=wav.getnframes()/wav.getframerate()
    return {'key':f"attention|{check['id']}",'section':'attention','minimum':minimum,
            'attention_kind':'spoken_digit_v1','audio_file':clip['file'],'choices':choices,
            'check':{'id':check['id'],'after':check['after'],'expected_digit':digit}}


def public_audio_check(unit,token):
    return {'kind':'spoken_digit_v1','audio_url':f'/api/attention/audio/{token}.wav','choices':unit['choices']}


def preview_attention():
    unit=audio_attention_unit({'id':0,'after':0});token=secrets.token_urlsafe(32)
    with model.get_connection() as conn:
        conn.execute('DELETE FROM attention_previews WHERE expires_at < ?',(time.time(),))
        conn.execute('INSERT INTO attention_previews(token,audio_file,expires_at) VALUES (?,?,?)',(token,unit['audio_file'],time.time()+900))
    return public_audio_check(unit,token)


def find_attention_audio(token):
    with model.get_connection() as conn:
        row=conn.execute('SELECT c.units,p.trial_key FROM trial_permissions p JOIN study_controls c ON c.prolific_id=p.prolific_id AND c.phase=p.phase WHERE p.audio_token=?',(token,)).fetchone()
        if row:
            unit=next(u for u in json.loads(row['units']) if u['key']==row['trial_key'])
            return private_audio_file(unit['audio_file'])
        preview=conn.execute('SELECT audio_file FROM attention_previews WHERE token=? AND expires_at>=?',(token,time.time())).fetchone()
        if preview:return private_audio_file(preview['audio_file'])
    raise ControlError('Audio link unavailable. Reload the study page.','audio_unavailable',404)


def make_units(plan):
    phase=plan['phase']
    manifest=json.loads((ROOT/'static/stimulis/training/manifest.json').read_text())
    questions=json.loads((ROOT/f'static/js/questions_{phase}.json').read_text())
    units=[{'key':'calibration|volume','section':'calibration','minimum':sum(duration(p) for p in CALIBRATION_AUDIO),'audio_paths':CALIBRATION_AUDIO},
           {'key':'calibration|stereo','section':'calibration','minimum':duration('/static/stimulis/calibration/left.wav')}]
    def rating(trial,section):
        paths=[trial['audioPath']] if phase=='phase1' else [trial['soundA']['audioPath'],trial['soundB']['audioPath']]
        units.append({'key':f"{section}|{trial['trialIndex']}|ratings",'section':section,
                      'index':trial['trialIndex'],'minimum':sum(duration(p) for p in paths),
                      'stimulus':trial,'questions':questions})
    for trial in manifest[phase]: rating(trial,'training')
    checks=attention_schedule(phase,plan['userID'],len(plan['test'])); emitted=set()
    for trial in plan['test']:
        for check in checks:
            if check['after'] <= trial['trialIndex'] and check['id'] not in emitted:
                units.append(audio_attention_unit(check)); emitted.add(check['id'])
        rating(trial,'test')
    for check in checks:
        if check['id'] not in emitted: units.append(audio_attention_unit(check))
    units.append({'key':'feedback|final','section':'feedback','minimum':0})
    return units


def register(pid, phase, plan):
    # Snapshot order and practice assets once; registering again cannot reset timers.
    with model.get_connection() as conn:
        row=conn.execute('SELECT token FROM study_controls WHERE prolific_id=? AND phase=?',(pid,phase)).fetchone()
    if not row:
        units=make_units(plan)
        with model.get_connection() as conn:
            conn.execute('INSERT OR IGNORE INTO study_controls(prolific_id,phase,token,units) VALUES (?,?,?,?)',
                         (pid,phase,secrets.token_urlsafe(32),json.dumps(units)))
            row=conn.execute('SELECT token FROM study_controls WHERE prolific_id=? AND phase=?',(pid,phase)).fetchone()
    return row['token']


def fixed_training(pid, phase):
    with model.get_connection() as conn:
        row=conn.execute('SELECT units FROM study_controls WHERE prolific_id=? AND phase=?',(pid,phase)).fetchone()
    return [unit['stimulus'] for unit in json.loads(row['units']) if unit['section']=='training']


def authenticate(conn, pid, phase, token):
    row=conn.execute('SELECT * FROM study_controls WHERE prolific_id=? AND phase=?',(pid,phase)).fetchone()
    if not row or not isinstance(token,str) or not secrets.compare_digest(row['token'], token):
        # Unauthenticated requests must never be able to invalidate another participant.
        raise ControlError('Reload the study page to obtain its session permission.', 'session_required', 403)
    return row


def next_unit(conn,pid,phase,units):
    completed={r[0] for r in conn.execute('SELECT trial_key FROM trial_data WHERE prolific_id=? AND phase=?',(pid,phase))}
    return next((unit for unit in units if unit['key'] not in completed),None)


def flag(conn,pid,phase,code,key,request_id,detail,severity='protocol'):
    inserted=conn.execute('INSERT OR IGNORE INTO integrity_flags(prolific_id,phase,code,trial_key,request_id,detail,severity) VALUES (?,?,?,?,?,?,?)',
                 (pid,phase,code,key,str(request_id),json.dumps(detail),severity)).rowcount
    if not inserted: return
    count=conn.execute('SELECT COUNT(DISTINCT request_id) FROM integrity_flags WHERE prolific_id=? AND phase=? AND severity=?',(pid,phase,severity)).fetchone()[0]
    threshold=ATTENTION_FAILURES if severity=='attention' else PROTOCOL_STRIKES
    if severity in ('protocol','attention') and count>=threshold:
        reason=f"automatic:{severity}: {count} distinct violations; latest={code}"
        conn.execute('UPDATE phase_assignments SET valid=0,invalid_reason=?,invalidated_at=COALESCE(invalidated_at,CURRENT_TIMESTAMP) WHERE prolific_id=? AND phase=? AND valid=1',(reason,pid,phase))


def begin(data):
    pid,phase,key=data.get('prolificID'),data.get('phase'),data.get('trial_key')
    result=None
    with model.get_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        control=authenticate(conn,pid,phase,data.get('session_token'))
        unit=next_unit(conn,pid,phase,json.loads(control['units']))
        if not unit or key!=unit['key']:
            # A refresh or second tab can request a completed unit; do not auto-invalidate it.
            raise ControlError('The trial order has changed. Reload the page to resume.', 'order_mismatch')
        row=conn.execute('SELECT * FROM trial_permissions WHERE prolific_id=? AND phase=? AND trial_key=?',(pid,phase,key)).fetchone()
        if not row:
            conn.execute('INSERT INTO trial_permissions(prolific_id,phase,trial_key,ticket,issued_at,audio_token) VALUES (?,?,?,?,?,?)',
                         (pid,phase,key,secrets.token_urlsafe(32),time.time(),secrets.token_urlsafe(32) if unit['section']=='attention' else None))
            row=conn.execute('SELECT * FROM trial_permissions WHERE prolific_id=? AND phase=? AND trial_key=?',(pid,phase,key)).fetchone()
        result={'ok':True,'trial_key':key,'ticket':row['ticket'],'minimum_seconds':unit['minimum']}
        if unit['section']=='attention':result['attention']=public_audio_check(unit,row['audio_token'])
    return result


def number(value):
    return not isinstance(value,bool) and isinstance(value,(int,float)) and math.isfinite(value) and 0<=value<=100


def validate_payload(data,unit,phase):
    p=data.get('payload')
    if not isinstance(p,dict): raise ControlError('Invalid response payload.','invalid_response',422)
    if data.get('section')!=unit['section'] or data.get('trial_index')!=unit.get('index') or bool(data.get('training'))!=(unit['section']=='training'):
        raise ControlError('Response does not match the assigned trial.','assignment_mismatch',422)
    expected=unit.get('stimulus',{})
    for key in ('audioPath','soundId','alpha','soundA','soundB','reference','transformed','original','edited','segment','source_id','sound_A_role','sound_B_role'):
        if key in expected and p.get(key)!=expected[key]:
            raise ControlError('Sound metadata does not match the assigned trial.','stimulus_mismatch',422)
    section=unit['section']
    if section in ('training','test'):
        keys=[q['key'] for q in unit['questions'] if q['key']!='audibilite_son']
        if phase == 'phase3' and (p.get('questionnaire_version') == '2026-11-11' or 'shoe_type' not in keys):
            # Existing sessions can have the previous four questions frozen in their units.
            if p.get('questionnaire_version') != '2026-11-11':
                raise ControlError('Refresh the study page for the current phase 3 questions.', 'invalid_response', 422)
            footsteps = [p.get(f'audibilite_son_{role}') for role in 'AB']
            binary = p.get('footstep_response_format') == 'binary'
            choices = (1, 2) if binary else (0, 1, 2)
            if any(type(answer) is not int or answer not in choices for answer in footsteps):
                raise ControlError('Both footstep answers are required.', 'invalid_response', 422)
            # The combined negative choice does not specify whether any sound was audible.
            heard = [None if binary and answer == 1 else answer != 0 for answer in footsteps]
            if any(p.get(f'heard_sound_{role}') is not value for role, value in zip('AB', heard)):
                raise ControlError('Inconsistent audibility answer.', 'invalid_response', 422)
            skip = any(answer != 2 for answer in footsteps)
            backgrounds = [p.get(f'heard_background_{role}') for role in 'AB']
            if p.get('ratings_skipped') is not skip:
                raise ControlError('Inconsistent skipped rating.', 'invalid_response', 422)
            if any(answer is not None if skip else type(answer) is not bool for answer in backgrounds):
                raise ControlError('Background answers must match the footstep responses.', 'invalid_response', 422)
            for key in ('ground_type', 'walker_identity', 'environment'):
                required = not skip and (key != 'environment' or all(backgrounds))
                value = p.get(key)
                if (required and not number(value)) or (not required and value is not None):
                    raise ControlError('Ratings must match the footstep and background responses.', 'invalid_response', 422)
            return {**p, **expected, 'training': section == 'training'}
        if phase=='phase1':
            if type(p.get('audibilite_son')) is not int or p['audibilite_son'] not in (0,1,2):raise ControlError('Invalid audibility answer.','invalid_response',422)
            skip=p['audibilite_son']==0
            if p.get('heard_sound') is not (not skip):raise ControlError('Inconsistent audibility answer.','invalid_response',422)
        else:
            if any(type(p.get('heard_sound_'+r)) is not bool for r in ('A','B')):raise ControlError('Both audibility answers are required.','invalid_response',422)
            skip=not(p['heard_sound_A'] and p['heard_sound_B'])
        if p.get('ratings_skipped') is not skip:raise ControlError('Inconsistent skipped rating.','invalid_response',422)
        if any((p.get(key) is not None if skip else not number(p.get(key))) for key in keys):
            raise ControlError('Ratings must be null for inaudible sounds or numeric from 0 to 100.','invalid_response',422)
        return {**p,**expected,'training':section=='training'}
    if section=='calibration':
        volume=unit['key']=='calibration|volume'
        if volume and (p.get('answer')!='comfortable' or p.get('acceptable_volume') is not True):raise ControlError('Volume calibration is incomplete.','invalid_response',422)
        if not volume and (p.get('answer') not in ('left','right') or p.get('correct') is not True):raise ControlError('Headphone calibration is incomplete.','invalid_response',422)
    if section=='attention':
        if type(p.get('response')) is not int or p['response'] not in (0,1,2):raise ControlError('Invalid check response.','invalid_response',422)
        if unit.get('attention_kind')=='spoken_digit_v1':
            selected=unit['choices'][p['response']]
            if type(p.get('selected_number')) is not int or p['selected_number']!=selected:raise ControlError('Invalid number selection.','invalid_response',422)
            expected=unit['check']['expected_digit']
            p={**p,'attention_kind':'spoken_digit_v1','selected_number':selected,'expected_digit':expected,
               'choices':unit['choices'],'correct':selected==expected,'expected_response':unit['choices'].index(expected)}
        else:
            p={**p,'correct':p['response']==unit['check']['expected'],'expected_response':unit['check']['expected']}
    if section=='feedback':
        if type(p.get('volume_changed')) is not bool:raise ControlError('Volume answer is required.','invalid_response',422)
        if p['volume_changed'] and (not isinstance(p.get('volume_change_reason'),str) or not p['volume_change_reason'].strip()):raise ControlError('Please explain the volume change.','invalid_response',422)
        if not isinstance(p.get('general_feedback',''),str) or len(p.get('general_feedback',''))>10000 or len(p.get('volume_change_reason') or '')>4000:raise ControlError('Invalid feedback.','invalid_response',422)
    return dict(p)


def submit(data):
    pid,phase,key=data.get('prolificID'),data.get('phase'),data.get('trial_key')
    request_id=data.get('submission_id')
    # A durable request ID makes network retries count once, including quality flags.
    if not isinstance(request_id,str) or not 1<=len(request_id)<=100:raise ControlError('Reload the page before submitting.','reload_required',409)
    if not isinstance(key,str) or len(key)>160:raise ControlError('Invalid trial key.','invalid_request',400)
    failure=None;result=None
    with model.get_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        control=authenticate(conn,pid,phase,data.get('session_token'))
        units=json.loads(control['units']);unit=next((u for u in units if u['key']==key),None)
        assignment=conn.execute('SELECT user_id FROM phase_assignments WHERE prolific_id=? AND phase=?',(pid,phase)).fetchone()
        # Early/missing ticket checks are evaluated before trusting any client-supplied values.
        grant=conn.execute('SELECT * FROM trial_permissions WHERE prolific_id=? AND phase=? AND trial_key=?',(pid,phase,key)).fetchone()
        completed=conn.execute('SELECT 1 FROM trial_data WHERE prolific_id=? AND phase=? AND trial_key=?',(pid,phase,key)).fetchone()
        ticket=data.get('trial_ticket')
        digest=hashlib.sha256(json.dumps({k:v for k,v in data.items() if k not in ('session_token','submission_id')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
        if grant and isinstance(ticket,str) and secrets.compare_digest(grant['ticket'],ticket) and completed and grant['request_hash']==digest:
            return {'ok':True,'inserted':False,'server_verified':True}
        try:
            if not isinstance(data.get('payload'),dict):raise ControlError('Invalid response payload.','invalid_response',422)
            if not unit or not assignment or str(data.get('payload',{}).get('userID'))!=str(assignment[0]):raise ControlError('Response assignment mismatch.','assignment_mismatch',422)
            if not grant or not isinstance(ticket,str) or not secrets.compare_digest(grant['ticket'],ticket):raise ControlError('No valid permission for this trial.','missing_permission',403)
            if completed:raise ControlError('A completed response cannot be changed.','completed_response_changed',409)
            current=next_unit(conn,pid,phase,units)
            if not current or current['key']!=key:raise ControlError('Complete the preceding trial first.','out_of_order',409)
            remaining=unit['minimum']-(time.time()-grant['issued_at'])
            if remaining>0:
                raise ControlError('Please finish listening before submitting.','too_early',425,remaining)
            payload=validate_payload(data,unit,phase)
            if unit.get('attention_kind')=='spoken_digit_v1':
                payload['audioPath']=f"/api/attention/audio/{grant['audio_token']}.wav"
                payload['attention_asset_file']=unit['audio_file']
            payload.update(userID=str(assignment[0]),server_verified=True,control_version=1,
                           server_elapsed_seconds=time.time()-grant['issued_at'])
            conn.execute('INSERT INTO trial_data(prolific_id,phase,trial_key,trial_index,section,sound_id,training,payload) VALUES (?,?,?,?,?,?,?,?)',
                         (pid,phase,key,unit.get('index'),unit['section'],payload.get('soundId'),int(unit['section']=='training'),json.dumps(payload)))
            conn.execute('UPDATE trial_permissions SET accepted_at=?,request_hash=? WHERE prolific_id=? AND phase=? AND trial_key=?',(time.time(),digest,pid,phase,key))
            # Authoritative completion and ratings are committed in the same transaction.
            event={**payload,'record_kind':'completed_unit','trial_key':key,'section':unit['section']}
            conn.execute('INSERT INTO research_events(event_id,prolific_id,user_id,phase,section,trial_index,payload,stimuli) VALUES (?,?,?,?,?,?,?,?)',
                         (secrets.token_hex(16),pid,assignment[0],phase,unit['section'],unit.get('index'),json.dumps(event),json.dumps(persistence.stimuli(payload))))
            if unit['section']=='attention' and not payload['correct']:flag(conn,pid,phase,'attention_failed',key,key,{'response':payload['response']},'attention')
            result={'ok':True,'inserted':True,'server_verified':True}
        except ControlError as exc:
            failure=exc
            # Small timing discrepancies are retriable and cannot invalidate a person.
            severity='review' if exc.code=='too_early' and (exc.retry_after or 0)<=1 else 'protocol'
            flag(conn,pid,phase,exc.code,str(key),request_id,{'message':str(exc),'remaining_seconds':exc.retry_after},severity)
    if failure:raise failure
    return result
