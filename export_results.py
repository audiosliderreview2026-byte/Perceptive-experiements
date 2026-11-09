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
                         'response','answer','correct','expected_response','rt','ratings_skipped','skip_reason'])
    with sqlite3.connect(database) as conn, open(output,'w') as stream:
        conn.row_factory=sqlite3.Row
        for row in conn.execute('SELECT * FROM research_events ORDER BY created_at,event_id'):
            record=dict(row); record['payload']=json.loads(record['payload']);record['stimuli']=json.loads(record['stimuli'])
            record['answers']={key:record['payload'][key] for key in question_keys if key in record['payload']}
            stream.write(json.dumps(record,ensure_ascii=False)+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',default=str(Path(__file__).parent/'db.sqlite'))
    parser.add_argument('--output',default='research_results.jsonl')
    args=parser.parse_args();export(args.database,args.output)
