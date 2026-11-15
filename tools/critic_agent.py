"""Check a locally rendered video against its verified edit decisions."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from studio_providers import load_local_env


def _bin(name):
    folder = os.environ.get("PERSONA_MEDIA_FFMPEG_DIR")
    return str(Path(folder) / (name + (".exe" if os.name == "nt" else ""))) if folder else name


def _capture(args, timeout=20):
    result = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError(f"{Path(args[0]).name} failed ({result.returncode})")
    return result.stdout


def probe_video(path):
    return json.loads(_capture([_bin("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


def sample_audio(path, *, seconds=8):
    return _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-i", str(path),
                     "-map", "0:a:0", "-t", str(seconds), "-vn", "-ac", "1", "-ar", "16000",
                     "-c:a", "pcm_s16le", "-f", "wav", "pipe:1"])


def technical_checks(guide, *, actual_frames, fps, pictures):
    checks, instructions = {}, []
    planned = guide["frames"]
    if type(planned) is not int or not 1 <= planned <= 27000:
        raise ValueError("Нужна монтажная карта с плановым количеством кадров.")
    duration_ok = actual_frames == planned and fps in ("30/1", 30)
    checks["duration"] = {"status": "PASS" if duration_ok else "FAIL",
                          "expectedFrames": planned, "actualFrames": actual_frames, "fps": fps}
    if not duration_ok:
        instructions.append(f"Перерендерить 30 fps и {planned} кадров ({planned/30:.3f} с); сейчас {actual_frames} кадров.")
    missing = pictures["unlocatedFaceFrames"]
    dip_centers = {shot["record"] for shot in guide.get("shots", [])[1:]} & set(guide.get("dipCenters", []))
    intentional = ({center+delta for center in dip_centers for delta in (-2, -1, 0, 1)}
                   if guide.get("transitionApplied") == "dip-without-overlap" else set())
    # The deliberate near-solid center of a dip has no measurable skin.
    # The caption, black-frame and decode checks still inspect every frame.
    dip_unmeasurable = sorted(intentional.intersection(missing))
    missing = [frame for frame in missing if frame not in intentional]
    color = pictures["colorJumps"]
    overlaps = pictures["overlaps"]
    color_status = "FAIL" if color else "UNVERIFIED" if missing else "PASS"
    checks["whiteBalance"] = {"status": color_status, "jumps": color[:20],
                              "unverifiedFrames": len(missing), "intentionalDipUnmeasurableFrames": dip_unmeasurable,
                              "method": "adjacent face and near-neutral chroma"}
    if color:
        instructions.append("Проверить и выровнять баланс белого около " +
                            ", ".join(f"{jump['frame']/30:.2f} с" for jump in color[:5]) + ".")
    elif missing:
        instructions.append(f"Сверить баланс белого вручную на {len(missing)} кадрах: нет надёжного лица или нейтрали.")
    black = pictures.get("blackFrames")
    checks["blackFrames"] = {"status": "UNVERIFIED" if black is None else "FAIL" if black else "PASS",
                            "frames": (black or [])[:20]}
    if black:
        instructions.append("Проверить чёрные кадры на " +
                            ", ".join(f"{frame/30:.2f} с" for frame in black[:5]) + ".")
    # Title clearance is checked against every detected face and the regions
    # supplied by the approved edit. Other semantic objects require review.
    title_missing = [frame for frame in pictures.get("faceMissingFrames", missing)
                     if any(cue["first"] <= frame < cue["last"] for cue in guide["captions"])]
    checks["titleClearance"] = {"status": "FAIL" if overlaps else "UNVERIFIED" if title_missing else "PASS",
                                "overlaps": overlaps[:20], "unverifiedFrames": len(title_missing),
                                "scope": "Detected faces and declared protected regions"}
    if overlaps:
        worst = max(overlaps, key=lambda hit: hit["shiftDownPx"])
        area = {"mouth": "рот", "face": "лицо", "detail": "защищённую область"}[worst["area"]]
        instructions.append(f"Титр перекрывает {area} в {worst['frame']/30:.2f} с. Проверьте сдвиг вниз на "
                            f"{worst['shiftDownPx']} px в пределах безопасной зоны или перенесите в свободную область.")
    elif title_missing:
        instructions.append("Проверить положение титров вручную: лицо не найдено на всех кадрах с текстом.")
    return checks, instructions


def evaluate_video(rendered_video_path, *, guide=None):
    from studio_picture_qa import inspect_picture

    path = Path(rendered_video_path).resolve(strict=True)
    if guide is None:
        guide = json.loads(path.with_name("EDL.json").read_text(encoding="utf-8"))
    if (not isinstance(guide.get("shots"), list) or not guide["shots"]
            or not isinstance(guide.get("captions"), list) or type(guide.get("frames")) is not int
            or not 1 <= guide["frames"] <= 27000):
        raise ValueError("Нужна монтажная карта с длительностью, клипами и таймкодами титров.")
    flags = []
    try:
        probe = probe_video(path)
        stream = next(item for item in probe["streams"] if item["codec_type"] == "video")
        frames, fps = int(stream.get("nb_frames", 0)), stream.get("avg_frame_rate")
        _capture([_bin("ffmpeg"), "-nostdin", "-v", "error", "-xerror", "-i", str(path),
                  "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], timeout=180)
        decoded = True
    except (RuntimeError, ValueError, StopIteration, subprocess.SubprocessError):
        frames, fps, decoded = 0, None, False
        flags.append("Перерендерить MP4: полное декодирование видео и звука не прошло.")
    measurement_error = None
    try:
        if not decoded or frames != guide["frames"] or fps != "30/1":
            raise ValueError("Сначала устраните расхождение формата или длительности.")
        pictures = inspect_picture(path, guide)
    except (ImportError, KeyError, OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        measurement_error = str(error)
        pictures = {"colorJumps": [], "unlocatedFaceFrames": list(range(guide["frames"])), "overlaps": []}
    checks, checklist = technical_checks(guide, actual_frames=frames, fps=fps, pictures=pictures)
    checks["decode"] = {"status": "PASS" if decoded else "FAIL"}
    if measurement_error:
        flags.append("Проверить настройки локального анализа изображения: " + measurement_error)
    with path.open("rb") as media:
        digest = hashlib.file_digest(media, "sha256").hexdigest()
    return {"status": "APPROVED" if all(check["status"] == "PASS" for check in checks.values()) else "REJECTED",
            "checks": checks, "checklist": flags + checklist, "sha256": digest,
            "publicationApproved": False, "distributionAllowed": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--edl", type=Path, help="Verified Resolve edit decisions; default EDL.json beside video")
    args = parser.parse_args()
    load_local_env()
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        guide = json.loads(args.edl.read_text(encoding="utf-8-sig")) if args.edl else None
        result = evaluate_video(args.video, guide=guide)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if result["status"] == "APPROVED" else 2)
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
