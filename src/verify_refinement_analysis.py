"""Check supplemental-log scoring using explicit synthetic fixtures, never real measurements."""
import json
from pathlib import Path
import subprocess
import sys
import shutil

root=Path(__file__).resolve().parent.parent
node=shutil.which('node')
if not node:raise SystemExit('Install Node.js 18+ and make node available on PATH.')
plan=json.loads(subprocess.check_output([node,'-e',"console.log(JSON.stringify(require('./src/part3/refine_plan.js').makePlan(20,1)))"],cwd=root,text=True))
out=root/'results/software_checks/refinement_analysis';out.mkdir(parents=True,exist_ok=True)
tx={'type':'refinement_transmitter','profile':'rate-coupled','distance_cm':20,'repeat':1,'aborted':False,
    'protocol':{'preamble':'110100111010000101101100'},'trials':[]}
packets=[]
for i,trial in enumerate(plan):
    row={k:v for k,v in trial.items() if k!='bits'}
    row.update(complete=True,active_average_fps=60,active_max_frame_gap_seconds=1/60,flicker_observation=None)
    tx['trials'].append(row)
    if i==2:continue  # A fully captured but undelivered packet counts as erasures.
    bits=trial['bits'][24:].copy()
    if i==0:bits[0]^=1
    packets.append({'text':'wrong' if i==0 else trial['message'],'bits':bits,
                    'symbol_seconds':trial['symbol'],'preamble_start_seconds':trial['modulation_start']+2,
                    'preamble_matches':24})
rx={'profile':'rate-coupled','packets':packets,'samples':[[i/60,120] for i in range(int((plan[-1]['end']+5)*60))]}
sender=out/'transmitter.json';receiver=out/'receiver.json';sender.write_text(json.dumps(tx))
def run(data,expected_success=True):
    receiver.write_text(json.dumps(data))
    result=subprocess.run([sys.executable,str(root/'src/analyze_batch.py'),str(receiver),str(sender),'--out',str(out/'scored')],capture_output=True,text=True)
    if not expected_success:
        assert result.returncode!=0;return
    assert result.returncode==0,result.stderr
    return json.loads((out/'scored/20cm_r1/results.json').read_text())['records']
rows=run(rx)
assert abs(rows[0]['payload_ber']-.025)<1e-10
assert rows[2]['payload_ber']==1 and rows[2]['status']=='packet_not_delivered'
assert all(r['flicker_observation'] is None for r in rows),'Legacy human observations must never migrate to new carriers.'
low={**rx,'samples':rx['samples'][::2]}
rows=run(low)
assert all(r['status']=='receiver_undersampled' for r in rows if 1/r['symbol']>=6)
run({**rx,'capture_diagnostics':{'raf_fallback_samples':1}},expected_success=False)
run({**rx,'profile':'legacy'},expected_success=False)
(out/'verification.json').write_text(json.dumps({'source':'SYNTHETIC scoring fixtures only','one_bit_error_scored':True,
 'missing_packet_is_not_zero_ber':True,'legacy_observations_not_reused':True,'undersampling_flagged':True,
 'fallback_and_profile_mismatch_rejected':True},indent=2))
print('PASS: one-bit errors, missing packets, no reused visual observations, undersampling, fallback and profile mismatch.')
