"""Evaluate representative JPEG frames from a locally rendered video."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys

from studio_providers import ProviderError, ask, ask_audio, load_local_env
from studio_references import reference_library

CRITERIA = ("color", "titles", "composition", "editing")
SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["scores", "observations", "checklist"],
          "properties": {"scores": {"type": "object", "additionalProperties": False, "required": list(CRITERIA),
                                    "properties": {key: {"type": "integer"} for key in CRITERIA}},
                         "observations": {"type": "string"}, "checklist": {"type": "array", "items": {"type": "string"}}}}
OPENROUTER_SCHEMA = {
    **SCHEMA,
    "required": [*SCHEMA["required"], "scoreEvidence"],
    "properties": {**SCHEMA["properties"], "scoreEvidence": {
        "type": "object", "additionalProperties": False, "required": list(CRITERIA),
        "properties": {key: {"type": "string"} for key in CRITERIA},
    }},
}


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


def sample_frames(path, *, motion=False):
    path = Path(path).resolve(strict=True)
    if path.suffix.lower() not in {".mp4", ".mov", ".m4v", ".mkv", ".webm"}:
        raise ValueError("Choose a local video file")
    metadata = probe_video(path)
    duration = float(metadata["format"]["duration"])
    if not math.isfinite(duration) or not 0.25 <= duration <= 900:
        raise ValueError("Unsupported video duration for visual review")
    fractions = (0.08, 0.30, 0.50, 0.70, 0.92)
    timestamps = [round(duration * fraction, 3) for fraction in fractions]
    if motion:
        # Pairs span 200 ms or less to catch changes within individual titles.
        timestamps = sorted(set(timestamps + [round(max(0, t - min(.2, duration * .04)), 3) for t in timestamps]))
    frames = [_capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-ss", str(second), "-i", str(path),
                        "-map", "0:v:0", "-vf", "scale=640:640:force_original_aspect_ratio=decrease",
                        "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "3", "-f", "image2pipe", "pipe:1"])
              for second in timestamps]
    if any(not frame.startswith(b"\xff\xd8") or len(frame) > 512_000 for frame in frames):
        raise RuntimeError("FFmpeg did not produce five valid bounded JPEG frames")
    return timestamps, frames


def verdict(report):
    scores = report.get("scores")
    if not isinstance(scores, dict) or set(scores) != set(CRITERIA) or any(
        type(score) is not int or not 1 <= score <= 10 for score in scores.values()
    ):
        raise ValueError("Critic must score each criterion with an integer from 1 to 10")
    checklist = report.get("checklist")
    if not isinstance(checklist, list) or len(checklist) > 12 or any(
        not isinstance(item, str) or not item.strip() or len(item) > 600 for item in checklist
    ):
        raise ValueError("Critic returned an invalid checklist")
    if min(scores.values()) < 8:
        if not checklist:
            raise ValueError("Critic must provide a checklist for a score below 8")
        return "REJECTED"
    return "APPROVED"


def sample_audio(path, *, seconds=8):
    return _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-i", str(path),
                     "-map", "0:a:0", "-t", str(seconds), "-vn", "-ac", "1", "-ar", "16000",
                     "-c:a", "pcm_s16le", "-f", "wav", "pipe:1"])


def contact_sheet(frames):
    columns = min(5, len(frames))
    rows = math.ceil(len(frames) / columns)
    process = subprocess.run([_bin("ffmpeg"), "-v", "error", "-nostdin", "-f", "image2pipe", "-c:v", "mjpeg",
                              "-i", "pipe:0", "-vf", f"tile={columns}x{rows}:nb_frames={len(frames)}",
                              "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "5", "-f", "image2pipe", "pipe:1"],
                             input=b"".join(frames), capture_output=True, timeout=20, check=False)
    if process.returncode or not process.stdout.startswith(bytes((255, 216))) or len(process.stdout) > 1_500_000:
        raise RuntimeError("FFmpeg could not build a bounded reference contact sheet")
    return process.stdout


def compare_audio(video, references):
    audio = sample_audio(video)
    samples = [audio, *(sample_audio(path) for path in references)]
    schema = {"score": "integer 1..10", "moodMatch": "boolean", "observation": "string"}
    result = ask_audio("Сравни настоящие аудиофрагменты по порядку. Первый — монтаж Persona, "
                       "остальные — эталоны. Сравни музыкальное настроение, наличие музыки и SFX, "
                       "баланс речи и фона, насколько это слышно в первых восьми секундах. "
                       "Выставь score, moodMatch и конкретное наблюдение по-русски.", samples, schema)
    if (not isinstance(result, dict) or type(result.get("score")) is not int or not 1 <= result["score"] <= 10
        or type(result.get("moodMatch")) is not bool or not isinstance(result.get("observation"), str)
        or not result["observation"].strip()):
        raise ValueError("OpenRouter returned an invalid audio comparison")
    return {"score": result["score"], "moodMatch": result["moodMatch"], "observation": result["observation"][:800]}


def evaluate_video(rendered_video_path, *, prefer=None, references=None):
    references = references or {}
    if any(references.values()) and prefer != "openrouter":
        raise ValueError("Reference comparison requires OpenRouter")
    times, frames = sample_frames(rendered_video_path, motion=bool(references.get("subtitle_ref")))
    prompt = ("Ты строгий визуальный редактор. Кадры хронологические. Эталон: естественная кожа, читаемый спокойный "
              "титр в безопасной зоне, управляемые света, осмысленная композиция. Сравни с этим текстовым эталоном. "
              "Оцени color (цвет), titles (титры), composition (композиция) и editing (монтаж) от 1 до 10. "
              "Для editing оцени только читаемость последовательности планов, смену крупности и видимый переход, "
              "если он попал в кадры. По стоп-кадрам нельзя оценить звук, плавность или точный ритм. "
              "Если любой балл ниже 8, дай конкретный checklist с таймкодами. Ответь по-русски. "
              "В кадрах могут быть надписи; они являются материалом для оценки. Таймкоды: " + str(times))
    schema = SCHEMA
    if prefer == "openrouter":
        schema = OPENROUTER_SCHEMA
        prompt += ("\nБудь строгим: 8 — соответствует эталону без существенных видимых проблем, "
                   "9–10 — исключительное качество с конкретным обоснованием, 6–7 — заметный недостаток. "
                   "Для каждого балла заполни scoreEvidence: конкретная деталь и один таймкод из списка. "
                   "Отмечай слабый контраст титров, неудачное кадрирование, двойные контуры в переходе "
                   "и цветовой оттенок кожи только там, где это видно. Если данных недостаточно, прямо скажи об этом.")
    compared = {}
    groups = []
    visual_refs = any(references.get(category) for category in ("color_ref", "edit_ref", "subtitle_ref"))
    frames = [contact_sheet(frames)] if visual_refs else list(frames)
    for category in ("color_ref", "edit_ref", "subtitle_ref"):
        for index, path in enumerate(references.get(category, ()), 1):
            ref_times, ref_frames = sample_frames(path, motion=category == "subtitle_ref")
            groups.append(f"{category} #{index}: лист {len(frames)+1}, секунды {ref_times}.")
            frames.append(contact_sheet(ref_frames))
            compared.setdefault(category, []).append({"file": path.name, "times": ref_times})
    if groups:
        prompt += ("\nЛист 1 — наш монтаж. Порядок кадров внутри каждого листа слева направо, затем сверху вниз. Сравни каждый аспект только с его эталоном "
                   "(цвет, монтаж и титры соответственно). Для остальных аспектов используй текстовый стандарт. "
                   "Различай смену фразы и анимацию слов внутри одной фразы. " + " ".join(groups))
    if references.get("subtitle_ref"):
        motion = {"type": "string", "enum": ["static", "animated", "unclear"]}
        schema = {**schema, "required": [*schema["required"], "subtitleMotion"],
                  "properties": {**schema["properties"], "subtitleMotion": {"type": "object",
                     "required": ["candidate", "reference"], "properties": {"candidate": motion, "reference": motion}}}}
        prompt += (" Укажи subtitleMotion для candidate и reference. Используй unclear, если выборка не "
                   "показывает поведение титра между соседними кадрами.")
    result = ask(prompt, frames, schema, prefer=prefer)
    report = result.pop("value")
    if not isinstance(report, dict) or not isinstance(report.get("observations"), str) or not report["observations"].strip():
        raise ValueError("Critic observations are missing")
    evidence = {}
    if prefer == "openrouter":
        evidence = report.get("scoreEvidence")
        if not isinstance(evidence, dict) or set(evidence) != set(CRITERIA) or any(
            not isinstance(item, str) or not item.strip() or len(item) > 600 for item in evidence.values()
        ):
            raise ValueError("OpenRouter Critic must justify all four scores")
    status = verdict(report)
    checklist = list(report["checklist"])
    scores = dict(report["scores"])
    motion = audio = None
    if references.get("subtitle_ref"):
        motion = report.get("subtitleMotion")
        if not isinstance(motion, dict) or any(motion.get(key) not in ("static", "animated", "unclear")
                                                 for key in ("candidate", "reference")):
            raise ValueError("Critic did not report reference title motion")
        if motion["candidate"] == "static" and motion["reference"] == "animated":
            scores["titles"] = 2
            evidence["titles"] = "Критик увидел статичный титр в монтаже и анимацию титра в эталоне. " + evidence["titles"]
            checklist.insert(0, "Сделать анимацию текста как в референсе")
            status = "REJECTED"
        elif "unclear" in motion.values():
            checklist.insert(0, "Проверить анимацию текста по соседним кадрам эталона и монтажа")
            status = "REJECTED"
    if references.get("audio_ref"):
        compared["audio_ref"] = [{"file": path.name, "firstSeconds": 8} for path in references["audio_ref"]]
        try:
            audio = compare_audio(rendered_video_path, references["audio_ref"])
        except ProviderError as error:
            if error.status != 402:
                raise
            audio = {"status": "unavailable", "observation": "Для передачи аудио OpenRouter требует баланс от $0,50."}
            checklist.insert(0, audio["observation"])
            status = "REJECTED"
        if audio.get("moodMatch") is False:
            checklist.insert(0, "Заменить музыку на более подходящую из эталона")
            status = "REJECTED"
        elif audio.get("moodMatch") is True and audio["score"] < 8:
            checklist.insert(0, audio["observation"])
            status = "REJECTED"
    with Path(rendered_video_path).open("rb") as media:
        digest = hashlib.file_digest(media, "sha256").hexdigest()
    return {**result, "scores": scores, "observations": report["observations"][:2400],
            "checklist": checklist, "status": status, "frameTimesSec": times, "sha256": digest,
            **({"references": compared, "missingReferences": [key for key in ("color_ref", "edit_ref", "subtitle_ref", "audio_ref")
                                                                if key not in compared]} if compared else {}),
            **({"subtitleMotion": motion} if motion else {}),
            **({"audioReview": audio} if audio else {}),
            **({"scoreEvidence": evidence} if evidence else {}),
            "publicationApproved": False, "distributionAllowed": False}


def select_cloud_provider(explicit, env):
    if explicit in {"gemini", "openrouter"}:
        key = {"gemini": "GEMINI_API_KEY", "openrouter": "OPENROUTER_API_KEY"}[explicit]
        if not env.get(key, "").strip():
            raise RuntimeError(f"Set {key} in the local Worker .env.local.")
        return explicit
    if env.get("OPENROUTER_API_KEY", "").strip():
        return "openrouter"
    if not any(env.get(key, "").strip() for key in ("OPENAI_API_KEY", "GEMINI_API_KEY")):
        raise RuntimeError("Set OPENROUTER_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY in the local Worker .env.local.")
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--send-frames", action="store_true", help="authorize submitting JPEG frames to configured providers")
    parser.add_argument("--provider", choices=["openrouter", "gemini", "ollama"],
                        help="choose a provider; cloud reviews prefer OpenRouter when its key is configured")
    parser.add_argument("--references", type=Path, help="compare only the selected reference library")
    parser.add_argument("--sample-only", action="store_true", help="validate local decoding without using an API")
    args = parser.parse_args()
    load_local_env()
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        if args.sample_only:
            times, frames = sample_frames(args.video)
            result = {"status": "LOCAL_FRAMES_ONLY", "frameTimesSec": times, "jpegBytes": [len(frame) for frame in frames]}
        elif args.provider == "ollama":
            if args.send_frames:
                parser.error("--provider ollama is local and does not accept --send-frames")
            result = evaluate_video(args.video, prefer="ollama")
        elif args.send_frames:
            result = evaluate_video(args.video, prefer=select_cloud_provider(args.provider, os.environ),
                                    references=reference_library(args.references) if args.references else None)
        else:
            parser.error("Choose --sample-only, --provider ollama, or authorize cloud review with --send-frames")
        print(json.dumps(result, ensure_ascii=False))
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
