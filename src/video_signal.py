"""Extract grayscale frame averages. OpenCV applies supported video orientation metadata."""
from pathlib import Path
import cv2
import numpy as np


def read_signal(path, roi=None):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not np.isfinite(fps) or fps <= 0:
        raise ValueError("Missing frame rate; export the original video at constant frame rate.")
    values, timestamps, saturation = [], [], []
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            if roi is not None:
                x, y, rw, rh = roi
                if not (0 <= x < x+rw <= 1 and 0 <= y < y+rh <= 1):
                    raise ValueError("ROI must be normalized x,y,width,height within [0,1].")
                frame = frame[int(y*h):int((y+rh)*h), int(x*w):int((x+rw)*w)]
                if not frame.size:
                    raise ValueError("Empty ROI")
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            values.append(float(gray.mean()))
            saturation.append(float(np.mean((gray <= 2) | (gray >= 253))))
            timestamps.append(cap.get(cv2.CAP_PROP_POS_MSEC)/1000)
    finally:
        cap.release()
    if len(values) < 30:
        raise ValueError("Fewer than 30 decoded frames")
    t = np.array(timestamps)
    source = "presentation timestamps"
    if np.any(np.diff(t) <= 0) or not np.all(np.isfinite(t)):
        t = np.arange(len(values))/fps
        source = "nominal FPS fallback; variable-frame-rate timing is unverified"
    t -= t[0]
    fs = (len(t)-1)/t[-1]
    grid = np.arange(int(round(t[-1]*fs))+1)/fs
    return grid, np.interp(grid, t, values), {
        "video": str(Path(path).resolve()), "frames": len(values),
        "nominal_fps": float(fps), "analysis_fps": float(fs),
        "duration_seconds": float(t[-1]), "timing_source": source,
        "max_frame_gap_seconds": float(np.max(np.diff(t))),
        "mean_clipped_pixel_fraction": float(np.mean(saturation)), "roi": roi,
    }
