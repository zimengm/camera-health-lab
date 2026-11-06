"""Analyze one six-trial batch. Align device clocks using correctly decoded unique IDs."""
import argparse
import csv
import json
from pathlib import Path
import numpy as np


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('receiver');p.add_argument('sender');p.add_argument('--out',default='results/part3/batch')
    p.add_argument('--observations',default=str(Path(__file__).resolve().parent.parent/'data/part3/visual_observations.json'))
    args=p.parse_args()
    rx=json.loads(Path(args.receiver).read_text());tx=json.loads(Path(args.sender).read_text())
    trials=tx['trials'];packets=rx.get('packets',[]);samples=np.asarray(rx.get('samples',[]))
    shared=json.loads(Path(args.observations).read_text()) if Path(args.observations).exists() else None
    anchors=[]
    for packet in packets:
        matches=[c for c in trials if c['message']==packet['text'] and c['symbol']==packet['symbol_seconds']]
        if len(matches)==1:anchors.append(packet['preamble_start_seconds']-matches[0]['modulation_start'])
    offset=float(np.median(anchors)) if anchors else None
    if anchors and max(abs(np.asarray(anchors)-offset))>1:
        raise ValueError('Inconsistent packet anchors. Check that these logs belong to the same session.')
    records=[]
    used=set()
    for trial in trials:
        row={k:trial[k] for k in ('id','distance_cm','delta','symbol','message','flicker_observation')}
        row['flicker_observation_source']='this_session' if row['flicker_observation'] else None
        if not row['flicker_observation'] and shared:
            match=[o for o in shared['observations'] if o['delta']==trial['delta'] and o['symbol_seconds']==trial['symbol']]
            if len(match)==1:
                row['flicker_observation']=match[0]['observation']
                row['flicker_observation_source']=shared['source']+' (shared fixed observer conditions)'
        row.update(sender_complete=trial.get('complete',False),status='unmeasured',payload_ber=None,frame_ber=None,payload_goodput_bps=None,frame_correct_bit_rate_bps=None)
        if tx.get('aborted') or not trial.get('complete'):
            row['status']='sender_incomplete';records.append(row);continue
        if offset is None or len(samples)<2:
            row['status']='no_alignment_anchor';records.append(row);continue
        start=trial['modulation_start']+offset
        duration=(len(tx['protocol']['preamble'])+len(trial['message'])*8)*trial['symbol']
        covered=samples[0,0]<=start+.2 and samples[-1,0]>=start+duration-.2
        section=samples[(samples[:,0]>=start)&(samples[:,0]<=start+duration)]
        if not covered or len(section)<5 or (np.diff(section[:,0])>.2).any():
            row['status']='capture_incomplete';records.append(row);continue
        candidates=[(i,packet) for i,packet in enumerate(packets) if i not in used and packet['symbol_seconds']==trial['symbol'] and abs(packet['preamble_start_seconds']-start)<max(.5,trial['symbol'])]
        received=min(candidates,key=lambda pair:abs(pair[1]['preamble_start_seconds']-start)) if candidates else None
        truth=np.unpackbits(np.frombuffer(trial['message'].encode('ascii'),dtype=np.uint8))
        if received:
            i,packet=received;used.add(i);bits=np.asarray(packet['bits'])
            if len(bits)!=len(truth):raise ValueError('Payload lengths differ')
            correct=int((bits==truth).sum());pre_correct=int(packet['preamble_matches'])
            row.update(status='decoded',received_text=packet['text'])
        else:
            # Full acquisition coverage established by another packet's timing anchor.
            # No packet delivered: count undelivered payload bits as erasures/errors.
            correct=pre_correct=0;row['status']='packet_not_delivered'
        pre=len(tx['protocol']['preamble']);total=pre+len(truth)
        row.update(payload_ber=1-correct/len(truth),frame_ber=1-(correct+pre_correct)/total,
                   payload_goodput_bps=correct/duration,frame_correct_bit_rate_bps=(correct+pre_correct)/duration)
        records.append(row)
    sender_path=Path(args.sender)
    session=sender_path.parent.name if sender_path.stem=='transmitter' else sender_path.stem
    out=Path(args.out)/session;out.mkdir(parents=True,exist_ok=True)
    result={'receiver':args.receiver,'sender':args.sender,'clock_offset_seconds':offset,'alignment_anchors':len(anchors),
            'records':records,'note':'Null metrics are unmeasured, never substitute zero BER. No delivered packet with full capture coverage counts as all bits erased. Preamble-inclusive and payload-only metrics are separate.'}
    (out/'results.json').write_text(json.dumps(result,indent=2))
    columns=list(dict.fromkeys(k for row in records for k in row))
    with (out/'results.csv').open('w') as file:
        writer=csv.DictWriter(file,fieldnames=columns);writer.writeheader();writer.writerows(records)
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
