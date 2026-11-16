"""Translate beat-synced-edit EDLs and plan local Cinematic Calm batches."""
import argparse
from bisect import bisect_left, bisect_right
import hashlib
import json
import math
import os
from pathlib import Path
from statistics import median
import subprocess
import sys
from tempfile import TemporaryDirectory

from critic_agent import _bin, probe_video
from persona_stage_cache import StageCache, cache_path, cached_file_stage, tool_version

UPSTREAM_COMMIT = "48c09c92ee69c2d89b7e44b146bbd7b9c26fff08"
VENV = Path(__file__).resolve().parents[1] / ".venv-beats"
FPS, MAX_SECS = 30, 900
MIN_REEL, MAX_REEL = 18, 45
DEFAULT_STYLE = [{"id": "film_grain"}]


def number(value, label):
    if type(value) not in (float, int) or not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid {label}")
    return value


def frames(value, label):
    return round(number(value, label) * FPS)


def allowed_path(value, approved):
    if not isinstance(value, str) or not value or "://" in value:
        raise ValueError("EDL needs an approved source path")
    path = Path(value).resolve()
    if path not in approved:
        raise ValueError("EDL references a file outside the approved sources")
    return path


def edl_to_edit_plan(edl, approved_sources, *, soundtrack=None, soundtrack_duration=None):
    """Map upstream seconds to our contiguous 30 fps layout, including the audio offset."""
    edits = edl.get("edits")
    if not isinstance(edits, list) or not 1 <= len(edits) <= 60:
        raise ValueError("EDL requires 1–60 edits")
    approved = {Path(path).resolve(): frames(duration, "source duration")
                for path, duration in approved_sources.items()}
    silence_camera = soundtrack is not None
    if edl.get("audio_source"):
        approved_audio = ({Path(soundtrack).resolve()} if silence_camera else approved)
        allowed_path(edl["audio_source"], approved_audio)
    origin = frames(edits[0].get("timeline_start"), "first timeline timestamp")
    cursor, shots = 0, []
    for edit in edits:
        source = allowed_path(edit.get("clip_source") or edl.get("video_source"), approved)
        record = frames(edit.get("timeline_start"), "timeline_start") - origin
        end = frames(edit.get("timeline_end"), "timeline_end") - origin
        first = frames(edit.get("clip_start"), "clip_start")
        source_end = frames(edit.get("clip_end"), "clip_end")
        length = end - cursor
        if abs(record - cursor) > 1:
            raise ValueError("EDL has a gap or overlapping clips; confirm those edits before converting")
        if (length <= 0 or abs((source_end - first) - length) > 1
                or abs(frames(edit.get("clip_duration"), "clip_duration") - length) > 1
                or first + length > approved[source]):
            raise ValueError("EDL clip exceeds its verified duration or cannot fill its timeline span")
        shots.append({"path": source.as_posix(), "first": first, "last": first + length,
                      "record": cursor, "audio": 0 if silence_camera else 1})
        cursor = end
    if cursor > MAX_SECS * FPS or abs(frames(edl.get("timeline_duration"), "EDL duration") - origin - cursor) > 1:
        raise ValueError("EDL duration does not match its edits")
    audio = []
    if silence_camera:
        segment = edl.get("audio_segment") or {}
        start = number(segment.get("start", 0), "audio offset") + origin/FPS
        if start + cursor/FPS > number(soundtrack_duration, "soundtrack duration") + 1/FPS:
            raise ValueError("Approved soundtrack does not cover the whole EDL")
        audio.append({"path": Path(soundtrack).resolve().as_posix(), "startSec": start,
                      "record": 0, "frames": cursor, "role": "music", "fadeIn": 0, "fadeOut": 0})
    return {"title": "Persona Cinematic Calm", "shots": shots, "frames": cursor, "captions": [],
            "audioBeds": audio, "lut": "", "lutMix": 0, "fade": 0,
            "skinToneProtection": False, "publicationApproved": False, "distributionAllowed": False}


def validated_protection(protected, duration):
    if not isinstance(protected, (list, tuple)) or len(protected) > 100:
        raise ValueError("Protected takes must be a list of [startSec, endSec] pairs")
    ranges = []
    for pair in protected:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValueError("Protected takes must be [startSec, endSec] pairs")
        start, end = (number(t, "protected timestamp") for t in pair)
        if not 0 <= start < end <= duration:
            raise ValueError("A protected take is outside the source")
        ranges.append((start, end))
    return ranges


def plan_cinematic_calm(beatmap, duration, *, count=4, protected=()):
    """Use beat groups within energy sections, and preserve the source order and holds."""
    if type(count) is not int or not 3 <= count <= 5 or not count*MIN_REEL <= duration <= MAX_SECS:
        raise ValueError("Batch needs 3–5 reels and enough footage for each 18-second minimum")
    locked = validated_protection(protected, duration)
    beats = sorted({number(t, "beat") for t in beatmap.get("beats", []) if 0 < t < duration})
    points = sorted((number(p["time"], "energy timestamp"), number(p["energy"], "energy"))
                    for p in beatmap.get("energy_curve", []))
    if len(beats) < 16 or len(points) < 20 or not 0.25 <= median(
            b-a for a,b in zip(beats, beats[1:])) <= 1.2:
        raise ValueError("Insufficient consistent beat and energy evidence for a musical phrase")
    times, energy = zip(*points)
    cumulative = [0.0]
    for value in energy:
        cumulative.append(cumulative[-1] + value)

    def mean(start, end):
        left, right = bisect_left(times, start), bisect_left(times, end)
        return (cumulative[right]-cumulative[left]) / max(1, right-left)

    # One-second bins suppress short percussive fluctuations. A quiet break resets
    # the eight-beat phrase grid and lets each sustained section start afresh.
    seconds = list(range(math.ceil(duration)))
    bins = [mean(t, min(t+1, duration)) for t in seconds]
    loud = max(bins)
    threshold = max(.035, loud*.15)
    if loud < .09:
        raise ValueError("No adequately sustained energy for a musical phrase")
    sections = []
    for second, value in enumerate(bins):
        if value < threshold:
            continue
        if sections and second <= sections[-1][1] + 1:
            sections[-1] = (sections[-1][0], second+1)
        else:
            sections.append((second, second+1))
    candidates = {}
    for opening, closing in sections:
        closing = min(closing, duration)
        section_beats = beats[bisect_left(beats, opening):bisect_right(beats, closing)]
        if len(section_beats) < 8 or closing - opening < MIN_REEL:
            continue
        anchors = [(section_beats[0], "onset-after-energy-break")]
        anchors += [(t, "eight-beat-phrase-grid") for t in section_beats[8::8]]
        if closing-section_beats[-1] <= 1:
            anchors.append((closing, "energy-falloff"))
        else:
            anchors.append((section_beats[-1], "last-confirmed-beat"))
        for i, (start, start_kind) in enumerate(anchors):
            for end, end_kind in anchors[i+1:]:
                start_sec, end_sec = round(start*FPS)/FPS, round(end*FPS)/FPS
                length = end_sec - start_sec
                if length > MAX_REEL:
                    break
                if length < MIN_REEL or any(a < t < b for a,b in locked for t in (start_sec,end_sec)):
                    continue
                level = mean(start_sec, end_sec)
                if level <= threshold * 1.6:
                    continue
                boundary_score = (start_kind == "onset-after-energy-break") + (end_kind == "energy-falloff")
                score = boundary_score * .34 + level - .002 * abs(31-length)
                candidates[(start_sec, end_sec)] = (score, {"startSec": start_sec, "endSec": end_sec,
                    "meanEnergy": round(level, 4), "startEvidence": start_kind, "endEvidence": end_kind})

    def available(window, selected):
        return all(window["endSec"] <= item["startSec"] or window["startSec"] >= item["endSec"]
                   for item in selected)

    ordered = sorted(candidates.values(), key=lambda pair: (-pair[0], pair[1]["startSec"]))
    selected = []
    # Spread the shortlist through the recording, then fill empty bins using
    # the remaining non-overlapping whole phrases.
    for index in range(count):
        start, end = duration*index/count, duration*(index+1)/count
        match = next((item for _, item in ordered if start <= (item["startSec"]+item["endSec"])/2 < end
                      and available(item, selected)), None)
        if match:
            selected.append(match)
    for _, item in ordered:
        if len(selected) == count:
            break
        if available(item, selected):
            selected.append(item)
    if len(selected) != count:
        raise ValueError("Insufficient distinct musical phrase excerpts respecting the protected takes")
    return sorted(selected, key=lambda item: item["startSec"])


def run_command(args, *, timeout):
    run = subprocess.run([str(arg) for arg in args], capture_output=True, text=True,
                         encoding="utf-8", errors="replace", timeout=timeout)
    if run.returncode:
        raise RuntimeError(run.stderr.strip()[-1600:] or f"{Path(args[0]).name} failed ({run.returncode})")
    return run.stdout


def save_json(path, value, *, sort_keys=False):
    with path.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(value, output, indent=2, ensure_ascii=False, allow_nan=False, sort_keys=sort_keys)
        output.write("\n")


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def analyze_upstream(source, output):
    checkout = VENV / "upstream"
    py = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not (checkout / "beat_map.py").is_file() or not py.is_file():
        raise RuntimeError(f"Install pinned upstream {UPSTREAM_COMMIT} under .venv-beats/upstream")
    git = ["git", "-c", f"safe.directory={checkout.as_posix()}", "-C", checkout]
    if run_command([*git, "rev-parse", "HEAD"], timeout=10).strip() != UPSTREAM_COMMIT:
        raise RuntimeError(f"Unexpected beat-synced-edit checkout; use {UPSTREAM_COMMIT}")
    if run_command([*git, "diff", "HEAD", "--", "beat_map.py"], timeout=10).strip():
        raise RuntimeError("The pinned beat-synced-edit analyzer has local edits")

    def compute():
        with TemporaryDirectory(prefix="persona-beats-", dir=output.parent) as folder:
            audio = Path(folder) / "source.wav"
            run_command([_bin("ffmpeg"), "-nostdin", "-v", "error", "-n",
                         "-protocol_whitelist", "file", "-i", source, "-map", "0:a:0", "-vn",
                         "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", audio], timeout=90)
            internal = Path(folder) / "beatmap.json"
            run_command([py, "-E", "-B", "-X", "utf8", checkout / "beat_map.py", audio, "-o", internal], timeout=480)
            beatmap = json.loads(internal.read_text(encoding="utf-8"))
            beatmap.pop("file", None)
            return beatmap

    cache = StageCache(cache_path())
    site_packages = VENV.glob("Lib/site-packages/*.dist-info" if os.name == "nt" else "lib/python*/site-packages/*.dist-info")
    result = cached_file_stage(source, "batch_beat_map", UPSTREAM_COMMIT,
                               {"python": tool_version(py) if cache.path else None,
                                "ffmpeg": tool_version(_bin("ffmpeg")) if cache.path else None,
                                "packages": sorted(path.name for path in site_packages),
                                "audioChannel": "0:a:0", "sampleRate": 22050, "recipe": 1},
                               compute, cache=cache,
                               valid=lambda value: isinstance(value, dict) and isinstance(value.get("beats"), list))
    beatmap = {**result.value, "file": source.as_posix()}
    save_json(output, beatmap, sort_keys=True)
    return beatmap


def make_batch_plan(source, directory, *, count, protected):
    source = source.resolve(strict=True)
    media = probe_video(source)
    picture = next((s for s in media.get("streams", []) if s["codec_type"] == "video"), {})
    duration = float(media["format"]["duration"])
    has_audio = any(s["codec_type"] == "audio" for s in media.get("streams", []))
    if not picture or not has_audio or not math.isfinite(duration) or not count*MIN_REEL <= duration <= MAX_SECS:
        raise ValueError("Batch needs a video with music and sufficient duration, up to 15 minutes")
    if picture.get("color_transfer") in {"smpte2084", "arib-std-b67"} or str(
            picture.get("color_primaries", "")).startswith("bt2020"):
        raise ValueError("Batch requires SDR footage")
    digest = sha256(source)
    beatmap = analyze_upstream(source, directory / "BEAT-MAP.json")
    regions = plan_cinematic_calm(beatmap, duration, count=count, protected=protected)
    if sha256(source) != digest:
        raise RuntimeError("Batch source changed during analysis")
    manifest = {"version": 1, "mode": "cinematic-calm", "upstreamCommit": UPSTREAM_COMMIT,
                "source": {"path": source.as_posix(), "sha256": digest, "durationSec": duration},
                "tempo": beatmap["tempo"], "beatCount": len(beatmap["beats"]),
                "method": "energy-sections-plus-eight-beat-phrase-estimate",
                "protectedRanges": protected, "regions": regions}
    save_json(directory / "BATCH-PLAN.json", manifest)


def render_batch(source, directory, *, effects=None):
    from apply_stylepack import apply_to_edit_plan
    from studio_ffmpeg import render_prepared_plan

    manifest = json.loads((directory / "BATCH-PLAN.json").read_text(encoding="utf-8"))
    source = source.resolve(strict=True)
    recorded = manifest["source"]
    digest = sha256(source)
    if recorded["path"] != source.as_posix() or recorded["sha256"] != digest:
        raise RuntimeError("Batch source changed after analysis")
    renders = []
    for index, region in enumerate(manifest["regions"], 1):
        reel = directory / f"reel-{index:02}"
        reel.mkdir()
        start, end = region["startSec"], region["endSec"]
        edl = {"video_source": source.as_posix(), "audio_source": source.as_posix(),
               "timeline_duration": end-start, "edits": [
                   {"timeline_start": 0, "timeline_end": end-start, "clip_source": source.as_posix(),
                    "clip_start": start, "clip_end": end, "clip_duration": end-start},
               ]}
        save_json(reel / "SOURCE-EDL.json", edl)
        plan = edl_to_edit_plan(edl, {source: recorded["durationSec"]})
        selection = DEFAULT_STYLE if effects is None else effects
        if any(item.get("id") == "beat_sync" for item in selection):
            raise ValueError("Cinematic Calm has already locked phrase timing")
        if selection:
            plan = apply_to_edit_plan(plan, selection)
        output = render_prepared_plan(plan, reel)
        renders.append({"index": index, "path": output.relative_to(directory).as_posix(),
                        "sha256": sha256(output), "frames": plan["frames"],
                        "sourceStartSec": start, "sourceEndSec": end, "cutsInside": 0,
                        "stylePack": bool(plan.get("stylepack"))})
    if sha256(source) != digest:
        raise RuntimeError("Batch source changed during rendering")
    save_json(directory / "BATCH-RESULT.json", {"version": 1, "mode": "cinematic-calm",
              "sourceSha256": digest, "reels": renders, "publicationApproved": False,
              "distributionAllowed": False})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    for action in ("plan-batch", "render-batch"):
        command = actions.add_parser(action)
        command.add_argument("source", type=Path)
        command.add_argument("directory", type=Path)
        if action == "plan-batch":
            command.add_argument("--count", type=int, choices=(3,4,5), default=4)
            command.add_argument("--protected", type=Path)
        else:
            command.add_argument("--stylepack", type=Path)
    convert = actions.add_parser("convert-edl")
    convert.add_argument("edl", type=Path)
    convert.add_argument("--source", type=Path, action="append", required=True)
    convert.add_argument("--soundtrack", type=Path)
    convert.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "plan-batch":
        ranges = json.loads(args.protected.read_text(encoding="utf-8-sig")) if args.protected else []
        make_batch_plan(args.source, args.directory, count=args.count, protected=ranges)
    elif args.action == "render-batch":
        from stylepack_renderer import enabled
        effects = json.loads(args.stylepack.read_text(encoding="utf-8-sig")) if args.stylepack and enabled() else None
        render_batch(args.source, args.directory, effects=effects)
    else:
        sources = {file.resolve(strict=True): float(probe_video(file)["format"]["duration"]) for file in args.source}
        soundtrack_duration = float(probe_video(args.soundtrack)["format"]["duration"]) if args.soundtrack else None
        plan = edl_to_edit_plan(json.loads(args.edl.read_text(encoding="utf-8-sig")), sources,
                                soundtrack=args.soundtrack, soundtrack_duration=soundtrack_duration)
        save_json(args.output, plan)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, KeyError, TypeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
