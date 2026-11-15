
import os
from pathlib import Path
import subprocess


def face_detector(width, height):
    import cv2

    cv2.setNumThreads(2)
    model = Path(os.environ["PERSONA_STUDIO_FACE_MODEL"]).resolve(strict=True)
    return cv2.FaceDetectorYN.create(str(model), "", (width, height), .72, .3, 100)


def frame_faces(path, first, frames, *, include_eyes=False, zoom_viewport=None):
    """Decode each output frame locally and return YuNet landmarks in normalized coordinates."""
    import numpy as np

    from critic_agent import _bin

    width, height = 270, 480
    detector = face_detector(width, height)
    portrait = "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,"
    if zoom_viewport is not None:
        z, left, top = zoom_viewport
        picture = (portrait + "format=yuv444p,"
                   f"zoompan=z={z:.10f}:x=iw*{left:.10f}:y=ih*{top:.10f}:d=1:s=1080x1920:fps=30,")
    else:
        picture = ""
    args = [_bin("ffmpeg"), "-v", "error", "-nostdin", "-xerror", "-ss", str(first / 30), "-i", str(path),
            "-map", "0:v:0", "-an", "-vf", f"fps=30,{picture}scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=bgr24",
            "-frames:v", str(frames), "-pix_fmt", "bgr24", "-threads", "1", "-f", "rawvideo", "pipe:1"]
    with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as child:
        try:
            for _ in range(frames):
                raw = child.stdout.read(width * height * 3)
                if len(raw) != width * height * 3:
                    raise ValueError("Local face QA could not decode every planned video frame")
                image = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
                _, faces = detector.detect(image)
                rows = [] if faces is None else sorted(faces, key=lambda face: float(face[-1]), reverse=True)
                yield image, [(float(x / width), float(y / height), float(w / width), float(h / height),
                               float(min(a, c) / width), float(min(b, d) / height),
                               float(max(a, c) / width), float(max(b, d) / height))
                              + ((float((rx+lx)/(2*width)), float((ry+ly)/(2*height))) if include_eyes else ())
                              for x, y, w, h, rx, ry, lx, ly, _, _, a, b, c, d, _ in rows]
            if child.wait(timeout=10):
                raise ValueError("FFmpeg reported a frame decode error")
        finally:
            if child.poll() is None:
                child.kill()


def protection_masks(clip):
    # Resolve comp coordinates use a bottom-origin Y. Retain a safety margin
    # around the detected face and follow it for the full source interval.
    masks = []
    for _, faces in frame_faces(clip["path"], clip["first"], clip["last"] - clip["first"]):
        if len(faces) != 1:
            raise ValueError("Skin Tone Protection requires one confirmed face on every frame; use no LUT or review the source")
        x, y, w, h, *_ = faces[0]
        masks.append([round(x+w/2, 5), round(1-y-h/2, 5), round(w*1.36, 5), round(h*1.38, 5)])
    return masks


def caption_overlap(title, target):
    return (max(title[0], target[0]) < min(title[2], target[2])
            and max(title[1], target[1]) < min(title[3], target[3]))


def inspect_picture(path, guide):
    import cv2
    import numpy as np

    cuts = {shot["record"] for shot in guide["shots"]}
    overlaps, jumps, missing, no_face, black = [], [], [], [], []
    previous = None
    active = sorted(guide["captions"], key=lambda cue: cue["first"])
    for frame, (image, faces) in enumerate(frame_faces(path, 0, guide["frames"])):
        while active and active[0]["last"] <= frame:
            active.pop(0)
        cue = active[0] if active and active[0]["first"] <= frame else None
        luma = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        if np.mean(luma <= 12) >= .94:
            black.append(frame)
        if cue:
            # Use the full line width and enclose both Text+ layers and lift.
            center = cue.get("center", .25)
            upper, lower = (center, center)
            if cue.get("slideFrames") and frame-cue["first"] < cue["slideFrames"]:
                lower -= .048
            lines = cue["text"].count("\n") + 1 if cue.get("referenceDriven") else 1
            size = cue.get("px", guide.get("size", 58)) * lines
            title = cue.get("bounds") or (0, 1-upper-size/1920-.025, 1, 1-lower+size/1920+.025)
            for x,y,w,h,mx,my,mx2,my2 in faces:
                if not caption_overlap(title, (x, y, x+w, y+h)):
                    continue
                mouth = (my-.02 < title[3] and my2+.02 > title[1] and mx2 > title[0] and mx < title[2])
                overlaps.append({"frame": frame, "area": "mouth" if mouth else "face",
                                 "shiftDownPx": int(max(1, np.ceil((y+h-title[1]) * 1920 + 12)))})
                break
            for region in guide.get("protectedRegions", []):
                if region["first"] <= frame < region["last"] and caption_overlap(title, region["box"]):
                    overlaps.append({"frame": frame, "area": "detail",
                                     "shiftDownPx": int(np.ceil((region["box"][3]-title[1]) * 1920 + 12))})
                    break
        if not faces:
            no_face.append(frame)
            missing.append(frame)
            previous = None
            continue
        x,y,w,h,*_ = faces[0]
        patch = image[max(0,int((y+h*.20)*480)):int((y+h*.68)*480),
                      max(0,int((x+w*.25)*270)):int((x+w*.75)*270)]
        if patch.size == 0:
            missing.append(frame)
            previous = None
            continue
        ycc = cv2.cvtColor(patch, cv2.COLOR_BGR2YCrCb).reshape(-1,3)
        skin = (ycc[:,1]>=134)&(ycc[:,1]<=180)&(ycc[:,2]>=75)&(ycc[:,2]<=142)
        tone = np.median(ycc[skin,1:], axis=0) if skin.sum()>=24 else None
        scene = image[::3, ::3]
        scene_ycc = cv2.cvtColor(scene,cv2.COLOR_BGR2YCrCb).reshape(-1,3)
        # Allow mild scene warmth in the neutral reference, using the same
        # band on every frame so a change of sampling regime cannot hide a jump.
        scene_chroma = np.abs(scene_ycc[:,1:].astype(int)-128)
        neutral_scene = (scene_chroma.max(axis=1) <= 16) & (scene_ycc[:,0] > 65) & (scene_ycc[:,0] < 220)
        balance=np.median(scene_ycc[neutral_scene,1:],axis=0) if neutral_scene.sum()>=200 else None
        if tone is None or balance is None:
            missing.append(frame)
        if tone is not None and balance is not None and previous is not None:
            chroma_delta = float(np.linalg.norm(tone-previous[0]))
            balance_delta = float(np.linalg.norm(balance-previous[1]))
            if chroma_delta > 13 or balance_delta > 8:
                jumps.append({"frame":frame, "atCut":frame in cuts, "skinChromaDelta":round(chroma_delta,2),
                              "neutralChromaDelta":round(balance_delta,2)})
        previous = (tone,balance) if tone is not None and balance is not None else None
    return {"colorJumps":jumps, "unlocatedFaceFrames":missing, "faceMissingFrames":no_face, "overlaps":overlaps, "blackFrames":black}
