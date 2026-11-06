"""End-to-end synthetic-video checks; these are NOT experimental results."""
import json
from pathlib import Path
import cv2
import numpy as np
from video_signal import read_signal
from part1_heart_rate import analyze
from part3.bfsk import PROTOCOL, packet_bits, decode


def write_video(path, values, fps):
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*"MJPG"),fps,(160,120))
    if not writer.isOpened():
        raise RuntimeError("MJPG video encoder unavailable")
    for value in values:
        frame=np.full((120,160,3),np.clip(value,0,255),np.uint8)
        writer.write(frame)
    writer.release()


def main():
    out=Path("results/software_checks/synthetic"); out.mkdir(parents=True,exist_ok=True)
    rng=np.random.default_rng(42)
    fps=60; t=np.arange(40*fps)/fps
    brightness=120+3*np.sin(2*np.pi*1.2*t)+1.5*np.sin(2*np.pi*.15*t)+rng.normal(0,.15,len(t))
    write_video(out/"heart_72bpm.avi",brightness,fps)
    tv,y,meta=read_signal(out/"heart_72bpm.avi")
    hr,_=analyze(tv,y)
    assert abs(hr["fft_bpm"]-72)<2,hr
    assert abs(hr["peak_interval_bpm"]-72)<2,hr
    shifted,_=analyze(tv+100,y)
    assert abs(shifted["peak_interval_bpm"]-hr["peak_interval_bpm"])<1e-8
    assert shifted["peaks_detected"]==hr["peaks_detected"]
    checks=[]
    for fps,symbol in [(30,.5),(60,.5),(30,.4),(60,.25)]:
        bits=packet_bits("HELLO"); start=4.173
        t=np.arange(int((start+len(bits)*symbol+3)*fps))/fps
        y=np.full(len(t),160.)
        for i,bit in enumerate(bits):
            mask=(t>=start+i*symbol)&(t<start+(i+1)*symbol)
            f=PROTOCOL["f1_hz"] if bit else PROTOCOL["f0_hz"]
            y[mask]-=20-20*np.cos(2*np.pi*f*(t[mask]-start-i*symbol))
        y+=rng.normal(0,.5,len(t))+.5*np.sin(2*np.pi*.1*t)
        path=out/f"bfsk_{fps}fps_T{symbol}.avi";write_video(path,y,fps)
        tv,signal,meta=read_signal(path,[.35,.35,.3,.3])
        result=decode(tv,signal,symbol)
        assert result["payload_ber"]==0,result
        assert result["preamble_matches"]==24,result
        checks.append({"fps":fps,"symbol_seconds":symbol,"result":result})
    # Explicit truncation must count missing bits, rather than silently reducing denominator.
    cutoff=start+(len(bits)-8)*symbol
    truncated=decode(tv[tv<cutoff],signal[tv<cutoff],symbol)
    assert truncated["missing_payload_bits"]>=7,truncated
    assert truncated["payload_ber"]>=7/40,truncated
    report={"source":"SYNTHETIC ONLY — not measured human heart rate or a physical screen-camera link",
            "heart_rate":hr,"bfsk":checks,"truncation":truncated}
    (out/"verification.json").write_text(json.dumps(report,indent=2))
    print("PASS: known 72 bpm recovered; four synthetic-video BFSK cases have zero BER; truncated bits count as errors.")


if __name__=="__main__":
    main()
