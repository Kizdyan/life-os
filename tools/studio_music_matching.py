"""Classify the mood of sampled video frames and select a local music file."""
import argparse
import json
import re
from pathlib import Path

from critic_agent import _bin, _capture, probe_video
from studio_providers import ProviderError, ask, load_local_env
from studio_references import AUDIO, default_reference_root, media_files

MOODS = ("sad", "epic", "dynamic", "calm")
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["mood", "reason"],
          "properties": {"mood": {"type": "string", "enum": list(MOODS)},
                         "reason": {"type": "string"}}}


def classify_mood(videos, *, interval=None):
    frames = []
    sample_times = []
    for video in videos:
        duration = float(probe_video(video)["format"]["duration"])
        start, end = interval if interval is not None else (0, duration)
        if not 0 <= start < end <= duration + .05:
            raise ValueError("Invalid clip interval for music matching")
        for part in (.25, .65):
            timestamp = round(start+(end-start)*part, 3)
            frame = _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-ss", str(timestamp),
                              "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-i", str(video),
                              "-an", "-frames:v", "1", "-vf", "scale=640:640:force_original_aspect_ratio=decrease",
                              "-c:v", "mjpeg", "-threads", "1", "-f", "image2pipe", "pipe:1"])
            if not frame.startswith(b"\xff\xd8"):
                raise ValueError("Could not extract a Vision frame")
            frames.append(frame)
            sample_times.append({"file": Path(video).name, "timestampSec": timestamp})
    prompt = ("Выбери визуальное настроение сцены для подбора музыки: sad (грусть), epic (масштаб или напряжённая "
              "героика), dynamic (живое действие, юмор, энергия) или calm (спокойное наблюдение). Опирайся только на мимику, "
              "действие, свет и композицию приложенных кадров. Сначала идут кадры первого файла, затем второго, "
              "если он есть. Верни mood и короткое обоснование reason на русском.")
    def valid_mood(data):
        return (isinstance(data, dict) and set(data) == {"mood", "reason"} and data["mood"] in MOODS
                and isinstance(data["reason"], str) and 1 <= len(data["reason"].strip()) <= 1000)

    try:
        response = ask(prompt, frames, SCHEMA, prefer="openrouter", validate=valid_mood)
    except (ProviderError, ValueError) as error:
        return offline_mood(error.code if isinstance(error, ProviderError) else "invalid_configuration", sample_times)
    return {"provider": response["provider"], "model": response["model"], **response["value"],
            "visionCache": response.get("cache"), "sampleTimes": sample_times}


def offline_mood(reason, sample_times=()):
    return {"mood": "dynamic", "provider": "local-fallback", "reason": reason, "sampleTimes": list(sample_times),
            "visionWarning": "Анализ OpenRouter недоступен. Применён локальный профиль Dynamic Soft."}


class NoMoodTrack(ValueError):
    pass


def match_track(mood, music_root, *, fallback=None):
    if mood not in MOODS:
        raise ValueError("Unknown music mood")
    files = media_files(Path(music_root).parent, Path(music_root).name, AUDIO, 250)
    for track in files:
        if mood in re.findall(r"[a-z0-9]+", track.stem.casefold()):
            return track, "filename-match"
    if fallback:
        track = Path(fallback).resolve(strict=True)
        if track.is_file() and track.suffix.lower() in AUDIO:
            return track, "explicit-fallback"
    raise NoMoodTrack(f"No local music filename matches mood {mood!r}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("videos", type=Path, nargs="+")
    parser.add_argument("--music-dir", type=Path)
    parser.add_argument("--fallback", type=Path)
    parser.add_argument("--placeholder-dir", type=Path)
    parser.add_argument("--interval", nargs=2, type=float, metavar=("START", "END"))
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    if len(args.videos) > 2:
        parser.error("Provide one or two clips")
    load_local_env()
    result = offline_mood("analysis_timeout") if args.offline else classify_mood(args.videos, interval=args.interval)
    library = args.music_dir or default_reference_root() / "audio_ref/music"
    if args.placeholder_dir:
        from studio_emotion import choose_music
        track, details = choose_music(result["mood"], library, args.placeholder_dir, fallback=args.fallback)
    else:
        track, selection = match_track(result["mood"], library, fallback=args.fallback)
        details = {"file": track.name, "selection": selection}
    print(json.dumps({**result, **details, "track": str(track)}, ensure_ascii=True))
