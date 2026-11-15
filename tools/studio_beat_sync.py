"""Measure musical attacks and place visual edits on the 30 fps timeline."""
from bisect import bisect_left
import math


def musical_peaks(path, *, duration, min_spacing=.18):
    import numpy as np
    from scipy.signal import find_peaks, stft

    from critic_agent import _bin, _capture

    rate = 12000
    raw = _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-i", str(path),
                    "-map", "0:a:0", "-t", str(duration), "-ac", "1", "-ar", str(rate),
                    "-f", "f32le", "pipe:1"], timeout=45)
    samples = np.frombuffer(raw, dtype="<f4")
    window, hop = 384, 60
    if samples.size < window:
        return []
    frequencies, times, spectrum = stft(samples, fs=rate, nperseg=window, noverlap=window-hop)
    bands = np.log1p(180 * np.abs(spectrum[(frequencies >= 45) & (frequencies <= 4800)]))
    flux = np.mean(np.maximum(np.diff(bands, prepend=bands[:, :1]), 0), axis=0)
    median = float(np.median(flux))
    prominence = max(float(np.quantile(flux, .90))*.22, median*2.0, 1e-5)
    peaks, stats = find_peaks(flux, distance=max(1, round(min_spacing*rate/hop)), prominence=prominence)
    return [(round(float(times[i]), 5), round(float(strength), 8))
            for i, strength in zip(peaks, stats["prominences"])
            if .08 <= times[i] < duration-.08]


def snap_events(plan, peaks, *, max_shift=.8, fps=30):
    if not peaks:
        raise ValueError("No reliable musical accents were detected")
    total = plan["frames"]
    max_frames = round(max_shift*fps)
    results = []
    boundaries = []
    quantized = sorted((round(seconds*fps), seconds, strength) for seconds, strength in peaks
                       if math.isfinite(seconds) and math.isfinite(strength))
    frames = [p[0] for p in quantized]

    def nearest(kind, original, lo, hi):
        left = bisect_left(frames, max(lo, original-max_frames))
        right = bisect_left(frames, min(hi, original+max_frames)+1)
        if left == right:
            raise ValueError(f"No eligible musical accent for {kind} at {original/fps:.3f}s")
        frame, seconds, prominence = min(quantized[left:right], key=lambda p: (abs(p[0]-original), -p[2]))
        results.append({"kind": kind, "originalFrame": original, "frame": frame, "accentSec": seconds,
                        "timeSec": round(frame/fps, 6), "prominence": prominence,
                        "quantizationMs": round((frame/fps-seconds)*1000, 3)})
        return frame

    cuts = [s["record"] for s in plan["shots"]]
    last = 0
    for i, record in enumerate(cuts[1:], 1):
        limit = (cuts[i+1]-max_frames-1) if i+1 < len(cuts) else total-fps//2
        last = nearest("cut", record, last+fps//2, limit)
        boundaries.append(last)
    starts = [0, *boundaries]
    ends = [*boundaries, total]
    for shot, start, end in zip(plan["shots"], starts, ends):
        shot["record"], shot["last"] = start, shot["first"]+(end-start)
    last = 0
    for i, cue in enumerate(plan["captions"]):
        original = cue["first"]
        duration = cue["last"]-original
        next_start = (plan["captions"][i+1]["first"]-max_frames) if i+1 < len(plan["captions"]) else total
        first = nearest("caption", original, last, min(total, next_start)-duration)
        cue["first"], cue["last"] = first, first+duration
        last = cue["last"]
    return results
