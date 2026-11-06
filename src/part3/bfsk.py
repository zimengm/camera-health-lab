"""Shared offline BFSK decoder. Missing trailing bits count as bit errors."""
import json
from pathlib import Path
import numpy as np

PROTOCOL = json.loads(Path(__file__).with_name("protocol.json").read_text())


def message_bits(message):
    return np.unpackbits(np.frombuffer(message.encode("ascii"), dtype=np.uint8))


def packet_bits(message):
    return np.r_[list(map(int, PROTOCOL["preamble"])), message_bits(message)]


def classify(t, y, start, symbol, count):
    bits, confidence = [], []
    for i in range(count):
        lo, hi = start+i*symbol, start+(i+1)*symbol
        if lo < t[0] or hi > t[-1]+np.median(np.diff(t))*1.1:
            bits.append(-1); confidence.append(0); continue
        mask = (t >= lo) & (t < hi)
        tx, yy = t[mask]-lo, y[mask]
        if len(tx) < 5:
            bits.append(-1); confidence.append(0); continue
        # Compare sinusoid regressions with identical linear baseline terms.
        baseline = np.column_stack([np.ones(len(tx)), tx])
        residuals = []
        for frequency in (PROTOCOL["f0_hz"], PROTOCOL["f1_hz"]):
            X = np.column_stack([baseline, np.sin(2*np.pi*frequency*tx), np.cos(2*np.pi*frequency*tx)])
            residuals.append(np.sum((yy-X@np.linalg.lstsq(X,yy,rcond=None)[0])**2))
        bits.append(int(residuals[1] < residuals[0]))
        confidence.append(abs(residuals[0]-residuals[1])/(sum(residuals)+1e-12))
    return np.array(bits), np.array(confidence)


def decode(t, y, symbol=.5, message="HELLO", search_seconds=15):
    fs = 1/np.median(np.diff(t))
    if fs <= 2*PROTOCOL["f1_hz"]:
        raise ValueError("Sampling rate too low for 10 Hz carrier; record 30 or 60 fps.")
    if symbol*fs < 6:
        raise ValueError("Too few frames per symbol.")
    preamble = np.array(list(map(int,PROTOCOL["preamble"])))
    last_start = min(search_seconds,t[-1]-len(preamble)*symbol)
    if last_start < 0:
        raise ValueError("Video too short to contain the preamble.")
    best = None
    # Preamble only determines alignment: payload truth is never used to synchronize.
    for start in np.arange(0,last_start+1/fs,1/fs):
        bits, confidence = classify(t,y,start,symbol,len(preamble))
        score = (int(np.sum(bits==preamble)), float(np.sum(np.where(bits==preamble,confidence,-confidence))))
        if best is None or score > best[0]:
            best = (score,start)
    _, start = best
    truth = message_bits(message)
    received, confidence = classify(t,y,start+len(preamble)*symbol,symbol,len(truth))
    correct = int(np.sum(received==truth))
    missing = int(np.sum(received<0))
    decoded = "".join(chr(int("".join(map(str,chunk)),2)) if np.all(chunk>=0) else "?"
                      for chunk in received.reshape(-1,8))
    packet_duration = (len(preamble)+len(truth))*symbol
    matched = best[0][0]
    warnings = []
    if matched < len(preamble)-2:
        warnings.append("Preamble not reliable: alignment and decoded payload may be invalid.")
    if missing:
        warnings.append("Recording is truncated; missing bits counted as errors.")
    if confidence.mean() < .1:
        warnings.append("Weak frequency separation; inspect signal and exposure.")
    return {"decoded_message":decoded,"expected_message":message,"start_seconds":float(start),
            "preamble_matches":matched,"preamble_bits":len(preamble),
            "payload_bits":len(truth),"correct_payload_bits":correct,"missing_payload_bits":missing,
            "payload_ber":1-correct/len(truth),"symbol_seconds":symbol,
            "raw_bit_rate_bps":1/symbol,
            "payload_goodput_bps":correct/packet_duration,
            "payload_only_correct_bps":correct/(len(truth)*symbol),
            "packet_duration_seconds":packet_duration,
            "goodput_definition":"correct payload bits / (preamble + payload transmission time); lead/tail excluded",
            "received_bits":received.tolist(),"mean_confidence":float(confidence.mean()),"warnings":warnings}
