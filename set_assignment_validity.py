"""Set validity for one participant's phase, retaining all historical responses."""
import argparse
import json
import persistence

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prolific-id',required=True)
    parser.add_argument('--phase',required=True,choices=['phase1','phase2','phase3'])
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--invalid',action='store_true')
    group.add_argument('--valid',action='store_true')
    args=parser.parse_args()
    persistence.migrate()
    print(json.dumps(persistence.set_validity(args.prolific_id,args.phase,args.valid)))
