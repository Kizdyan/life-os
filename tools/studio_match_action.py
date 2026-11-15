"""Keep a music-aligned edit point and select a compatible incoming pose."""
import math
from pathlib import Path

from critic_agent import _bin, _capture, probe_video
from studio_providers import ProviderError, ask

SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["outgoing", "oldEntry", "seamless", "status", "bestId", "reason"],
          "properties": {"outgoing": {"type": "string"}, "oldEntry": {"type": "string"},
                         "seamless": {"type": "boolean"},
                         "status": {"type": "string", "enum": ["match", "no_match", "uncertain"]},
                         "bestId": {"type": ["integer", "null"]}, "reason": {"type": "string"}}}


def choose_incoming(outgoing, incoming, candidates, verdict, ssim_score):
    status = verdict.get("status")
    if status == "no_match":
        raise ValueError("Vision found no compatible incoming phase on this beat")
    if status == "match":
        first = verdict.get("bestId")
        if type(first) is not int or first not in candidates:
            raise ValueError("Vision selected an unavailable incoming frame")
        method = "openrouter-vision"
    else:
        ranked = [(ssim_score(frame), frame) for frame in candidates if frame != incoming["first"]]
        ranked = [(score, frame) for score, frame in ranked if score is not None and math.isfinite(score)]
        if not ranked:
            raise ValueError("No comparable face patches for the SSIM fallback")
        score, first = max(ranked, key=lambda item: (item[0], -abs(item[1]-incoming["first"])))
        if score < .25:
            raise ValueError("No comparable pose above the minimum SSIM threshold")
        method = "face-ssim"
    length = incoming["last"]-incoming["first"]
    if incoming["record"] <= outgoing["record"] or length <= 0:
        raise ValueError("Invalid cut before Match on Action")
    incoming["first"], incoming["last"] = first, first+length
    return first, method


def frame_strip(path, frames):
    import cv2
    import numpy as np

    start, stop = min(frames), max(frames)
    width, height = 270, 480
    body = _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-ss", f"{start/30:.7f}", "-i", str(path),
                     "-an", "-vf", f"fps=30,scale={width}:{height}:force_original_aspect_ratio=decrease,"
                     f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=bgr24",
                     "-frames:v", str(stop-start+1), "-threads", "1", "-f", "rawvideo", "pipe:1"])
    if len(body) != (stop-start+1)*width*height*3:
        raise ValueError("Could not decode all Match on Action comparison frames")
    frames_bgr = np.frombuffer(body, np.uint8).reshape(-1, height, width, 3)
    strip = np.concatenate([frames_bgr[frame-start] for frame in frames], axis=1)
    ok, encoded = cv2.imencode(".jpg", strip, [cv2.IMWRITE_JPEG_QUALITY, 84])
    if not ok:
        raise ValueError("Could not encode comparison frames")
    return encoded.tobytes()


def candidate_sheets(path, candidates, total):
    import cv2
    import numpy as np

    sheets = []
    for start in range(0, len(candidates), 3):
        rows = []
        for frame in candidates[start:start+3]:
            strip = frame_strip(path, [frame, min(total-1, frame+5), min(total-1, frame+12)])
            rows.append(cv2.imdecode(np.frombuffer(strip, np.uint8), cv2.IMREAD_COLOR))
        ok, jpeg = cv2.imencode(".jpg", np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 82])
        if not ok:
            raise ValueError("Could not encode candidate sheet")
        sheets.append(jpeg.tobytes())
    return sheets


def face_ssim(outgoing, incoming):
    import cv2
    import numpy as np
    from studio_picture_qa import frame_faces

    def patch(image, faces):
        if len(faces) != 1:
            return None
        x, y, w, h, *_ = faces[0]
        roi = image[max(0, round((y+.16*h)*480)):min(480, round((y+.62*h)*480)),
                    max(0, round((x+.12*w)*270)):min(270, round((x+.88*w)*270))]
        if not roi.size:
            return None
        gray = cv2.resize(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY), (96, 64)).astype(np.float32)/255
        return gray

    def ssim(a, b):
        if a is None or b is None:
            return None
        def blur(image):
            return cv2.GaussianBlur(image, (11, 11), 1.5)
        ma, mb = blur(a), blur(b)
        v1, v2 = blur(a*a)-ma*ma, blur(b*b)-mb*mb
        cov = blur(a*b)-ma*mb
        value = ((2*ma*mb+.01**2)*(2*cov+.03**2))/((ma*ma+mb*mb+.01**2)*(v1+v2+.03**2))
        return float(np.mean(value[5:-5,5:-5]))

    old = [patch(image, faces) for image, faces in frame_faces(outgoing["path"], outgoing["last"]-4, 4)]

    def score(first):
        new = [patch(image, faces) for image, faces in frame_faces(incoming["path"], first, 4)]
        values = [ssim(old[-1], new[0]), ssim(old[-1], new[3]), ssim(old[-3], new[0])]
        return (.6*values[0]+.28*values[1]+.12*values[2]) if all(v is not None for v in values) else None

    return score


def match_on_action(plan, *, ask_vision=ask):
    edits = []
    for outgoing, incoming in zip(plan["shots"], plan["shots"][1:]):
        duration = incoming["last"]-incoming["first"]
        source = probe_video(incoming["path"])
        stream = next(s for s in source["streams"] if s["codec_type"] == "video")
        total = round(float(stream.get("duration") or source["format"]["duration"])*30)
        old = incoming["first"]
        left, right = max(0, old-45), min(total-duration, old+45)
        candidates = sorted(set(range(left, right+1, 7)) | {old}) if left <= old <= right else []
        if len(candidates) < 2:
            raise ValueError("Match on Action needs spare frames in the incoming clip")
        end = outgoing["last"]-1
        frames = [frame_strip(outgoing["path"], [end]),
                  frame_strip(incoming["path"], [old]),
                  frame_strip(outgoing["path"], [max(outgoing["first"], end-10), max(outgoing["first"], end-5), end])]
        shortlist = candidates[::2]
        if old not in shortlist:
            shortlist.append(old)
        shortlist.sort()
        frames += candidate_sheets(incoming["path"], shortlist, total)
        prompt = (
            "Ты профессиональный монтажёр. Опиши положение тела, направление взгляда и фазу движения "
            "на этих двух кадрах. Подходят ли они для бесшовной склейки? Фото 1: последний кадр среднего "
            "плана. Фото 2: старый первый кадр крупного плана. Третий файл — три последовательных кадра "
            "до склейки слева направо. В остальных изображениях каждый РЯД — один вариант входа: "
            "первый кадр слева, затем через 5 и 12 кадров. Читай ряды сверху вниз и изображения по порядку. ID рядов: "
            f"{shortlist}. Выбери вход с совпадением направления взгляда, наклона головы и фазы: "
            "при поднятом взгляде годится поднятый и затем удерживаемый взгляд, при подъёме — его "
            "естественное продолжение. Смена масштаба ожидаема. Не выбирай вариант, если после входа "
            "глаза сразу моргают, уходят вниз или движение обращается. Из нескольких подходящих предпочти "
            "вариант, где сохраняется мимика и взгляд подтверждается двумя последующими кадрами. "
            "Старый вход допустим только если последовательность действительно совместима. В JSON "
            "outgoing и oldEntry опиши конкретно, seamless относится к старому стыку, bestId — точный ID "
            "нового входа либо null, reason по-русски с конкретными наблюдениями. Если фазу нельзя "
            "надёжно увидеть, status=uncertain. Если видишь, что нет подходящих, status=no_match.")
        def valid_match(verdict):
            return (isinstance(verdict, dict) and set(verdict) == set(SCHEMA["required"])
                    and verdict["status"] in ("match", "no_match", "uncertain")
                    and all(isinstance(verdict[k], str) and verdict[k].strip() for k in ("outgoing","oldEntry","reason"))
                    and type(verdict["seamless"]) is bool
                    and (verdict["status"] != "match" or type(verdict["bestId"]) is int and verdict["bestId"] in shortlist))

        try:
            answer = ask_vision(prompt, frames, SCHEMA, prefer="openrouter", validate=valid_match)
            verdict = answer["value"]
            provider = {"provider": answer["provider"], "model": answer["model"]}
        except (ProviderError, ValueError):
            verdict = {"status": "uncertain", "reason": "OpenRouter Vision недоступен. Проверен локальный SSIM."}
            provider = {"provider": "unavailable"}
        scorer = face_ssim(outgoing, incoming) if verdict["status"] == "uncertain" else None
        first, method = choose_incoming(outgoing, incoming, shortlist if scorer is None else candidates, verdict, scorer)
        edits.append({**provider, **verdict, "method": method, "outputFrame": incoming["record"],
                      "outgoingFrame": end, "oldIncomingFrame": old, "incomingFrame": first,
                      "candidates": candidates, "visionShortlist": shortlist, "candidateContextFrames": [0, 5, 12]})
    return edits
