"""Analyze new physical logs separately from legacy 4/10 Hz measurements."""
import argparse
import csv
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receiver');parser.add_argument('sender')
    args=parser.parse_args();root=Path(__file__).resolve().parent.parent
    tx=json.loads(Path(args.sender).read_text())
    if tx.get('profile')!='rate-coupled':raise ValueError('Use analyze_batch.py for legacy logs.')
    out=root/'results/part3/refinement'
    subprocess.run([sys.executable,str(root/'src/analyze_batch.py'),args.receiver,args.sender,'--out',str(out)],check=True,stdout=subprocess.DEVNULL)
    records=[]
    for p in sorted(out.glob('*/results.json')):records.extend(json.loads(p.read_text())['records'])
    fields=list(dict.fromkeys(k for row in records for k in row))
    with (out/'all_results.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(records)
    groups=[]
    for distance in sorted({r['distance_cm'] for r in records}):
        for delta in [.1,.5]:
            for rate in [2,4,6,8]:
                rows=[r for r in records if r['distance_cm']==distance and r['delta']==delta and np.isclose(1/r['symbol'],rate)]
                measured=[r for r in rows if r['payload_ber'] is not None]
                errors=sum(round(r['payload_ber']*40) for r in measured)
                correct=len(measured)*40-errors;airtime=sum(64*r['symbol'] for r in measured)
                groups.append({'distance_cm':distance,'delta':delta,'raw_bit_rate_bps':rate,'trials':len(rows),
                               'measured_trials':len(measured),'payload_bits':len(measured)*40,'payload_errors':errors,
                               'payload_ber':errors/(40*len(measured)) if measured else None,
                               'payload_goodput_bps':correct/airtime if measured else None,
                               'observations':{name:sum(r['flicker_observation']==name for r in rows) for name in ['none','slight','clear','unobserved']},
                               'missing_observations':sum(not r['flicker_observation'] for r in rows)})
    summary={'profile':'rate-coupled','groups':groups,
             'scope':'Physical supplemental measurements only. Never combine with synthetic checks or fixed 4/10 Hz legacy conditions.',
             'interpretation':'Display observations at tested rates; do not infer an exact or universal perceptual threshold. Missing observations and insufficient timing are not zero error.'}
    (out/'summary.json').write_text(json.dumps(summary,indent=2))
    fig,axes=plt.subplots(2,2,figsize=(10,7),sharex=True)
    for col,delta in enumerate([.1,.5]):
        for distance in sorted({g['distance_cm'] for g in groups}):
            rows=[g for g in groups if g['delta']==delta and g['distance_cm']==distance and g['payload_ber'] is not None]
            if not rows:continue
            rates=[r['raw_bit_rate_bps'] for r in rows]
            axes[0,col].plot(rates,[r['payload_ber'] for r in rows],'o-',label=f'{distance} cm')
            axes[1,col].plot(rates,[r['payload_goodput_bps'] for r in rows],'o-',label=f'{distance} cm')
        axes[0,col].set_title(f'Rate-coupled BFSK, alpha difference {delta}')
        axes[1,col].set_xlabel('Raw bit rate (bit/s)')
        for row in range(2):
            axes[row,col].grid(alpha=.2);axes[row,col].set_xticks([2,4,6,8])
            if axes[row,col].lines:axes[row,col].legend()
    axes[0,0].set_ylabel('Payload bit error rate');axes[1,0].set_ylabel('Payload goodput (bit/s)')
    fig.tight_layout();fig.savefig(out/'supplemental_rates.png',dpi=180);plt.close(fig)
    print('Supplemental conditions:',len(records),'Measured:',sum(r['payload_ber'] is not None for r in records))


if __name__=='__main__':main()
