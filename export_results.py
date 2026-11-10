"""Export one JSON object per completed screen for pandas.read_json(..., lines=True)."""
import argparse
import json
import sqlite3
from pathlib import Path


def export(database, output):
    question_keys=set()
    for path in (Path(__file__).parent/'static/js').glob('questions_phase*.json'):
        question_keys.update(item['key'] for item in json.loads(path.read_text()))
    question_keys.update(['audibilite_son','heard_sound','heard_sound_A','heard_sound_B',
                         'volume_changed','volume_change_reason','general_feedback','questionnaire_version',
                         'response','answer','correct','expected_response','rt','ratings_skipped','skip_reason'])
    with sqlite3.connect(database) as conn, open(output,'w') as stream:
        conn.row_factory=sqlite3.Row
        has_assignments=conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='phase_assignments'").fetchone()
        validity={(r[0],r[1]):bool(r[2]) for r in conn.execute('SELECT prolific_id,phase,valid FROM phase_assignments')} if has_assignments else {}
        for row in conn.execute('SELECT * FROM research_events ORDER BY created_at,event_id'):
            record=dict(row); record['payload']=json.loads(record['payload']);record['stimuli']=json.loads(record['stimuli'])
            record['valid']=validity.get((record['prolific_id'],record['phase']),True)
            record['STUDY_ID']=record['payload'].get('STUDY_ID')
            record['SESSION_ID']=record['payload'].get('SESSION_ID')
            record['answers']={key:record['payload'][key] for key in question_keys if key in record['payload']}
            stream.write(json.dumps(record,ensure_ascii=False)+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',default=str(Path(__file__).parent/'db.sqlite'))
    parser.add_argument('--output',default='research_results.jsonl')
    args=parser.parse_args();export(args.database,args.output)
