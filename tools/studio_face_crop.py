"""Plan a steady 9:16 crop with room around the detected head."""
import argparse
import json
import math
from statistics import median

from critic_agent import _bin, _capture
from studio_picture_qa import face_detector


def plan_crop(width, height, samples):
    if width * 16 == height * 9:
        return {"mode": "native"}
    visible = [sample for sample in samples if sample]
    if not samples or len(visible) / len(samples) < .7:
        return {"mode": "fit", "reason": "face_not_reliably_detected"}
    # Keep all confidently detected heads visible, including when the subject moves.
    faces = [face for sample in visible for face in sample]
    left = max(0, math.floor(min((x-.16*w)*width for x, _, w, _ in faces)))
    top = max(0, math.floor(min((y-.35*h)*height for _, y, _, h in faces)))
    right = min(width, math.ceil(max((x+1.16*w)*width for x, _, w, _ in faces)))
    bottom = min(height, math.ceil(max((y+1.20*h)*height for _, y, _, h in faces)))
    units = min(width // 18, height // 32)
    crop_width, crop_height = units * 18, units * 32
    min_x, max_x = max(0, right-crop_width), min(left, width-crop_width)
    min_y, max_y = max(0, bottom-crop_height), min(top, height-crop_height)
    if units < 1 or min_x > max_x or min_y > max_y:
        return {"mode": "fit", "reason": "headroom_exceeds_crop"}
    x = round(median((x+w/2)*width for x, _, w, _ in faces) - crop_width/2)
    y = round(median((y+.43*h)*height for _, y, _, h in faces) - crop_height/2)
    return {"mode": "face-crop", "rect": [min(max_x, max(min_x, x)), min(max_y, max(min_y, y)),
                                         crop_width, crop_height],
            "detectedSamples": len(visible), "samples": len(samples)}


def scan(path, start, end, width, height):
    import numpy as np

    size, rate = 384, 5
    scaled_w = max(2, round(width * min(size/width, size/height) / 2)*2)
    scaled_h = max(2, round(height * min(size/width, size/height) / 2)*2)
    left, top = (size-scaled_w)//2, (size-scaled_h)//2
    detector = face_detector(size, size)
    raw = _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-xerror", "-ss", str(start),
                    "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm",
                    "-i", path, "-map", "0:v:0", "-an", "-t", str(end-start), "-threads", "1",
                    "-vf", f"fps={rate},scale={scaled_w}:{scaled_h},setsar=1,pad={size}:{size}:{left}:{top},format=bgr24",
                    "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1"], timeout=40)
    frame_size = size * size * 3
    if len(raw) % frame_size or len(raw)//frame_size < (end-start)*rate - 1:
        raise ValueError("Face crop could not sample the full clip")
    samples = []
    for offset in range(0, len(raw), frame_size):
        frame = np.frombuffer(raw, dtype=np.uint8, count=frame_size, offset=offset).reshape(size, size, 3)
        _, found = detector.detect(frame)
        samples.append([] if found is None else [(float((x-left)/scaled_w), float((y-top)/scaled_h),
                        float(w/scaled_w), float(h/scaled_h)) for x,y,w,h,*_ in found])
    return plan_crop(width, height, samples)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    parser.add_argument("start", type=float)
    parser.add_argument("end", type=float)
    parser.add_argument("width", type=int)
    parser.add_argument("height", type=int)
    args = parser.parse_args()
    print(json.dumps(scan(args.path, args.start, args.end, args.width, args.height)))
