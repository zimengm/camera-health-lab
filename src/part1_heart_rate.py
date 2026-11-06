"""Usage: python part1_heart_rate.py data/part1/finger.mov"""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy import signal
from video_signal import read_signal


def analyze(t, brightness, trim=2.0):
    t, brightness = np.asarray(t, dtype=float), np.asarray(brightness, dtype=float)
    if (t.ndim != 1 or brightness.shape != t.shape or len(t) < 2
            or not np.all(np.isfinite(t)) or not np.all(np.isfinite(brightness))
            or np.any(np.diff(t) <= 0) or not np.isfinite(trim) or trim < 0):
        raise ValueError("Use finite, equally sized signals, increasing timestamps and nonnegative trim.")
    fs = 1/np.median(np.diff(t))
    if fs <= 2*(100/60):
        raise ValueError("Sampling rate is too low for the required heart-rate search band.")
    keep = (t >= t[0]+trim) & (t <= t[-1]-trim)
    t, raw = t[keep], brightness[keep]
    if len(t) < fs*10:
        raise ValueError("Need at least 10 seconds after trimming (prefer 30–40 seconds recorded).")
    ac = raw-raw.mean()
    filtered = signal.sosfiltfilt(signal.butter(3, .5, btype="highpass", fs=fs, output="sos"), ac)
    n = len(filtered)
    frequency = np.fft.rfftfreq(n, 1/fs)
    window = np.hanning(n)
    amplitude = 2*np.abs(np.fft.rfft(filtered*window))/window.sum()
    band = (frequency >= 1) & (frequency <= 100/60)
    index = np.flatnonzero(band)[np.argmax(amplitude[band])]
    hz = frequency[index]
    # 65% of the FFT-estimated period avoids rejecting slightly early true beats.
    min_distance = max(1, int(np.floor(.65*fs/hz)))
    smooth = signal.sosfiltfilt(signal.butter(3, min(5, fs*.4), fs=fs, output="sos"), filtered)
    peaks, _ = signal.find_peaks(smooth, distance=min_distance, prominence=.35*np.std(smooth))
    intervals = np.diff(t[peaks])
    bpm = float(60/np.mean(intervals)) if len(intervals) else None
    warnings = []
    if np.std(filtered) < .05:
        warnings.append("Very weak signal; check exposure, finger coverage and pressure.")
    if index in (np.flatnonzero(band)[0], np.flatnonzero(band)[-1]):
        warnings.append("FFT maximum is near the imposed 60–100 bpm boundary; this may be an artifact or out-of-band heart rate.")
    if len(intervals) and np.std(intervals)/np.mean(intervals) > .2:
        warnings.append("Irregular detected intervals; inspect artifacts and peaks manually.")
    if bpm and abs(bpm-60*hz) > 10:
        warnings.append("FFT and peak estimates differ by more than 10 bpm; do not accept without inspection.")
    results = {"fft_hz": float(hz), "fft_bpm": float(hz*60), "peak_interval_bpm": bpm,
               "peaks_detected": len(peaks), "fft_bin_width_hz": float(fs/n),
               "expected_period_samples": float(fs/hz), "min_peak_distance_samples": min_distance,
               "trim_each_end_seconds": trim, "warnings": warnings}
    return results, (t, raw, smooth, peaks, frequency, amplitude)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("video")
    p.add_argument("--out", default="results/part1")
    p.add_argument("--trim", type=float, default=2)
    args = p.parse_args()
    t, brightness, meta = read_signal(args.video)
    results, arrays = analyze(t, brightness, args.trim)
    if meta["mean_clipped_pixel_fraction"] > .3:
        results["warnings"].append("Over 30% of grayscale pixels are clipped; recapture may be needed.")
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    results["video_metadata"] = meta
    (out/"results.json").write_text(json.dumps(results, indent=2))
    np.savetxt(out/"brightness.csv", np.column_stack([t, brightness]), delimiter=",", header="time_seconds,mean_grayscale", comments="")
    t, raw, waveform, peaks, f, amp = arrays
    fig, ax = plt.subplots(figsize=(10,4))
    ax.plot(f, amp); ax.axvspan(1,100/60,alpha=.15,color="green",label="Assignment search band")
    ax.axvline(results["fft_hz"], color="red",ls="--",label=f'{results["fft_hz"]:.3f} Hz ({results["fft_bpm"]:.1f} bpm)')
    ax.set(xlim=(0,5), xlabel="Frequency (Hz)", ylabel="Amplitude (gray levels)", title="Heart rate: windowed FFT")
    ax.legend(); fig.tight_layout(); fig.savefig(out/"fft.png",dpi=180); plt.close(fig)
    fig, axes = plt.subplots(2,1,figsize=(12,6),sharex=True)
    axes[0].plot(t,raw); axes[0].set(ylabel="Mean grayscale", title="Recorded brightness")
    axes[1].plot(t,waveform); axes[1].plot(t[peaks],waveform[peaks],"rx")
    label = f'{results["peak_interval_bpm"]:.1f} bpm' if results["peak_interval_bpm"] else "insufficient peaks"
    axes[1].set(xlabel="Time (s)",ylabel="Filtered amplitude",title=f"Detected heartbeats: {label}")
    fig.tight_layout(); fig.savefig(out/"heartbeats.png",dpi=180); plt.close(fig)
    print(json.dumps(results,indent=2))


if __name__ == "__main__":
    main()
