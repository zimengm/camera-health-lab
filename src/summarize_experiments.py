"""Aggregate measured batch results; keep payload and framing metrics distinct."""
import csv
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter


def main():
    root=Path(__file__).resolve().parent.parent
    out=root/'results/part3/batch'
    records=[]
    for distance in [20,40,80,120]:
        source=out/f'{distance}cm/results.json'
        if source.exists():records.extend(json.loads(source.read_text())['records'])
    records.sort(key=lambda r:(r['distance_cm'],-r['symbol'],-r['delta']))
    with (out/'all_results.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=list(dict.fromkeys(k for row in records for k in row)))
        writer.writeheader();writer.writerows(records)
    measured=[r for r in records if r['payload_ber'] is not None]
    summary={'conditions_recorded':len(records),'conditions_measured':len(measured),
             'payload_bits_per_trial':40,'frame_bits_per_trial':64,
             'payload_errors':sum(round(r['payload_ber']*40) for r in measured),
             'frame_errors':sum(round(r['frame_ber']*64) for r in measured),
             'payload_bits':len(measured)*40,'frame_bits':len(measured)*64,
             'bit_perfect_payload_trials':sum(r['payload_ber']==0 for r in measured),
             'note':'One 40-bit payload per condition. Shared fixed-observer flicker observations are not four independent observations. Carrier frequencies remain 4/10 Hz across symbol rates; no precise visual-threshold claim.'}
    if measured:
        summary['aggregate_payload_ber']=summary['payload_errors']/summary['payload_bits']
        summary['aggregate_frame_ber']=summary['frame_errors']/summary['frame_bits']
    (out/'summary.json').write_text(json.dumps(summary,indent=2))
    colors={20:'#147D92',40:'#DC703C',80:'#7054A3',120:'#3B8548'}
    symbols=[.5,.4,.25]
    for metric,name,title,ylabel in [
        ('payload_ber','payload_ber.png','Message bit error rate','Payload BER'),
        ('frame_ber','frame_ber.png','Bit error rate including synchronization','Frame BER'),
        ('frame_correct_bit_rate_bps','correct_bit_rate.png','Correctly received frame bits per second','Correct bit rate (bit/s)'),
        ('payload_goodput_bps','payload_goodput.png','Message goodput including synchronization overhead','Payload goodput (bit/s)')]:
        fig,axes=plt.subplots(1,3,figsize=(12,3.8),sharey=True)
        for ax,symbol in zip(axes,symbols):
            for distance,color in colors.items():
                rows=sorted([r for r in measured if r['distance_cm']==distance and r['symbol']==symbol],key=lambda r:r['delta'])
                # Hollow markers and small different line styles make overlapping zero curves visible.
                if rows:ax.plot([r['delta'] for r in rows],[r[metric] for r in rows],marker={20:'o',40:'s',80:'^',120:'D'}[distance],mfc='none',color=color,ls={20:'-',40:'--',80:':',120:'-.'}[distance],lw=1.3,label=f'{distance} cm')
            ax.set(title=f'Raw modulation: {1/symbol:g} bit/s',xlabel='Alpha difference',xticks=[.1,.5],xlim=(.07,.53))
            ax.grid(alpha=.2)
            if 'ber' in metric:ax.yaxis.set_major_formatter(PercentFormatter(1));ax.set_ylim(-.001,.03)
            else:ax.set_ylim(0,max(r[metric] for r in measured)*1.08)
        axes[0].set_ylabel(ylabel);axes[-1].legend(fontsize=8)
        fig.suptitle(title,fontsize=12)
        fig.text(.5,.01,'Measured live phone trials; one packet per condition. Coincident curves overlap.',ha='center',fontsize=8,color='#555555')
        fig.tight_layout(rect=(0,.035,1,.94));fig.savefig(out/name,dpi=180);plt.close(fig)
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
