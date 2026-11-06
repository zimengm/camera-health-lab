"""Compare a phone receiver export to its paired transmitter log; no cross-device clock assumption."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('receiver');p.add_argument('sender')
    p.add_argument('--out',default='results/part3/live')
    args=p.parse_args()
    rx=json.loads(Path(args.receiver).read_text());tx=json.loads(Path(args.sender).read_text())
    samples=np.asarray(rx.get('samples',[]),dtype=float)
    truth=np.unpackbits(np.frombuffer(tx['config']['message'].encode('ascii'),dtype=np.uint8))
    results=[]
    for packet in rx.get('packets',[]):
        bits=np.asarray(packet['bits'],dtype=int)
        if len(bits)>len(truth):
            raise ValueError('Received message length exceeds expected payload; inspect log pairing.')
        correct=int(np.sum(bits==truth[:len(bits)]));missing=len(truth)-len(bits)
        symbol=float(packet['symbol_seconds'])
        if symbol!=float(tx['config']['symbol']):
            raise ValueError('Sender and receiver symbol times differ.')
        airtime=(len(tx['protocol']['preamble'])+len(truth))*symbol
        preamble_size=len(tx['protocol']['preamble'])
        frame_correct=correct+int(packet['preamble_matches'])
        results.append({'received_text':packet['text'],'expected_text':tx['config']['message'],
                        'correct_payload_bits':correct,'transmitted_payload_bits':len(truth),
                        'missing_payload_bits':missing,'payload_ber':1-correct/len(truth),
                        'preamble_matches':packet['preamble_matches'],
                        'preamble_bits':len(tx['protocol']['preamble']),
                        'frame_correct_bits':frame_correct,
                        'frame_transmitted_bits':preamble_size+len(truth),
                        'frame_ber':1-frame_correct/(preamble_size+len(truth)),
                        'frame_correct_bit_rate_bps':frame_correct/airtime,
                        'payload_goodput_bps':correct/airtime,
                        'raw_bit_rate_bps':1/symbol,
                        'payload_only_correct_bps':correct/(len(truth)*symbol),
                        'packet_airtime_seconds':airtime,'confidence':packet.get('confidence')})
    gaps=np.diff(samples[:,0]) if len(samples)>1 else np.array([])
    meta={'receiver_file':args.receiver,'sender_file':args.sender,'source':rx.get('source'),
          'app_version':rx.get('app_version'),'sender_config':tx['config'],
          'samples':len(samples),'sample_span_seconds':float(samples[-1,0]-samples[0,0]) if len(gaps) else 0,
          'average_sample_rate_hz':float(1/np.mean(gaps)) if len(gaps) else None,
          'max_sample_gap_seconds':float(gaps.max()) if len(gaps) else None,
          'capture_diagnostics':rx.get('capture_diagnostics'),
          'packets':results,
          'limitations':['One logged condition/packet does not establish performance at other settings.',
                         'Sender and receiver wall clocks were not synchronized; no end-to-end latency claim.',
                         'Distance and alpha labels come from the transmitter settings, not independent measurement.']}
    receiver_path=Path(args.receiver)
    session=receiver_path.parent.name if receiver_path.stem=='receiver' else receiver_path.stem
    out=Path(args.out)/session;out.mkdir(parents=True,exist_ok=True)
    (out/'results.json').write_text(json.dumps(meta,indent=2))
    if len(samples)>1:
        fig,ax=plt.subplots(figsize=(12,4));ax.plot(samples[:,0],samples[:,1],lw=.65)
        for packet in rx.get('packets',[]):
            start=packet['preamble_start_seconds'];T=packet['symbol_seconds']
            ax.axvline(start,color='green',ls='--',label='Preamble start')
            ax.axvline(start+len(tx['protocol']['preamble'])*T,color='orange',ls='--',label='Payload start')
        title='Live phone capture: '+('; '.join(f"{r['received_text']} | payload BER={r['payload_ber']:.1%}" for r in results) or 'no decoded packet')
        ax.set(xlabel='Phone capture time (s)',ylabel='ROI mean grayscale',title=title)
        if results:ax.legend()
        fig.tight_layout();fig.savefig(out/'signal.png',dpi=180);plt.close(fig)
    print(json.dumps(meta,indent=2))


if __name__=='__main__':main()
