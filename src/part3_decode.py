import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from video_signal import read_signal
from part3.bfsk import decode, PROTOCOL


def main():
    p=argparse.ArgumentParser(description="Decode one recorded BFSK packet, using center screen ROI by default.")
    p.add_argument("video"); p.add_argument("--symbol",type=float,default=.5)
    p.add_argument("--message",default="HELLO"); p.add_argument("--delta",type=float,required=True)
    p.add_argument("--distance",type=int,required=True); p.add_argument("--out",default="results/part3/offline")
    p.add_argument("--roi",type=float,nargs=4,default=[.35,.35,.3,.3],metavar=("X","Y","W","H"))
    p.add_argument("--search-seconds",type=float,default=15)
    args=p.parse_args()
    t,y,meta=read_signal(args.video,args.roi)
    result=decode(t,y,args.symbol,args.message,args.search_seconds)
    result.update(alpha_difference=args.delta,distance_cm=args.distance,video_metadata=meta)
    if meta["max_frame_gap_seconds"] > .1:
        result["warnings"].append("Large frame gaps detected; timing may affect decoding.")
    out=Path(args.out)/Path(args.video).stem; out.mkdir(parents=True,exist_ok=True)
    (out/"results.json").write_text(json.dumps(result,indent=2))
    np.savetxt(out/"brightness.csv",np.column_stack([t,y]),delimiter=",",header="time_seconds,mean_grayscale",comments="")
    fig,ax=plt.subplots(figsize=(12,4)); ax.plot(t,y,lw=.7)
    start=result["start_seconds"]
    ax.axvline(start,color="green",label="Preamble start")
    ax.axvline(start+len(PROTOCOL["preamble"])*args.symbol,color="orange",label="Payload start")
    ax.set(xlabel="Time (s)",ylabel="ROI grayscale",title=f'BFSK: BER={result["payload_ber"]:.3f}, received={result["decoded_message"]!r}')
    ax.legend(); fig.tight_layout(); fig.savefig(out/"signal.png",dpi=180); plt.close(fig)
    print(json.dumps(result,indent=2))


if __name__=="__main__":
    main()
