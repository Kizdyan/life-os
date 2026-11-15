"""Attach StylePack selections to a verified Persona EditPlan, optionally inside a ProductionJob."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys

from stylepack_renderer import active_pack, enabled, load_catalog, plain_text, registry

CARD_TEXT = {"editorial_quote", "animated_card", "growing_stamp", "cinematic_title"}
LAYOUTS = {"split_screen", "picture_in_picture"}
KEYWORDS = {"red_keywords", "dynamic_captions"}


def require_audio(plan, *, beat_sync):
    beds = plan["audioBeds"]
    music = sum(bed["role"] == "music" for bed in beds)
    has_camera = any(shot["audio"] for shot in plan["shots"])
    has_program = any(bed["role"] in {"program", "speech"} for bed in beds)
    if beat_sync and (music != 1 or has_camera or has_program):
        raise ValueError("Beat Sync requires one music bed and a music-only EditPlan")
    if not beat_sync and (music != 1 or not (has_camera or has_program)):
        raise ValueError("Sidechain Compression requires separate speech and music tracks")


def normalize(plan, selections, catalog):
    if not isinstance(selections, list) or not 1 <= len(selections) <= 60:
        raise ValueError("StylePack needs a list of 1–60 effects")
    total = plan.get("frames")
    if type(total) is not int or not 1 <= total <= 27000 or not plan.get("shots"):
        raise ValueError("StylePack needs a verified 30 fps EditPlan")
    effects, replaced, unique = [], set(), set()
    rules = registry(catalog)
    for request in selections:
        if not isinstance(request, dict) or not isinstance(request.get("id"), str) or request["id"] not in rules:
            raise ValueError("Unknown StylePack effect")
        key = request["id"]
        rule = rules[key]
        extra = ({"text"} if key in CARD_TEXT else {"sourceShot"} if key in LAYOUTS else
                 {"keywords"} if key in KEYWORDS else {"variant"} if key == "look" else
                 {"from", "to"} if key == "number_counter" else set())
        if request.keys() - ({"id", "first", "last"} | extra):
            raise ValueError(f"Unexpected option for {key}")
        first, last = request.get("first", 0), request.get("last", total)
        if any(type(n) is not int for n in (first, last)) or not 0 <= first < last <= total:
            raise ValueError(f"Invalid frame interval for {key}")
        if last-first > rule.get("maxFrames", total):
            raise ValueError(f"{key} exceeds its frame limit of {rule['maxFrames']}")
        effect = {**request, "first": first, "last": last}
        if "scale" in rule:
            effect["scale"] = rule["scale"]
        if "asset" in rule:
            effect["asset"] = rule["asset"]
        if key == "look":
            if request.get("variant") not in rule["variants"]:
                raise ValueError("Choose a named color look variant")
        if key in CARD_TEXT:
            effect["text"] = plain_text(request.get("text"))
        if key in KEYWORDS and "keywords" in request:
            words = request["keywords"]
            if (not isinstance(words, list) or not 1 <= len(words) <= 12
                    or any(not isinstance(word, str) or not word.replace("-", "").isalnum() for word in words)):
                raise ValueError("Caption keywords must contain one–twelve plain words or numbers")
        if key == "number_counter":
            if any(type(request.get(bound)) is not int or abs(request[bound]) > 1_000_000 for bound in ("from", "to")):
                raise ValueError("Number counter needs integer endpoints")
        if key in LAYOUTS:
            index = request.get("sourceShot")
            if type(index) is not int or not 0 <= index < len(plan["shots"]):
                raise ValueError(f"{key} needs an approved sourceShot index")
            shot = plan["shots"][index]
            if shot["last"]-shot["first"] < last-first:
                raise ValueError(f"The sourceShot for {key} is shorter than its effect")
        if rule.get("mode") == "replace":
            intersects = [i for i, cue in enumerate(plan["captions"])
                          if cue["first"] < last and cue["last"] > first]
            if not intersects or any(i in replaced or plan["captions"][i]["first"] < first
                                     or plan["captions"][i]["last"] > last for i in intersects):
                raise ValueError("A caption effect must cover complete approved captions only once")
            replaced.update(intersects)
        if key in {"beat_sync", "sidechain_compression", "before_after"}:
            if key in unique:
                raise ValueError(f"Select {key} only once per EditPlan")
            unique.add(key)
            if key != "before_after":
                if (first, last) != (0, total):
                    raise ValueError(f"{key} applies to the entire EditPlan")
                require_audio(plan, beat_sync=key == "beat_sync")
        effects.append(effect)
    if "before_after" in unique and not plan["lut"] and not any(
            rules[effect["id"]]["group"] == "color" for effect in effects):
        raise ValueError("Before / after needs a selected color effect or the original LUT")
    if "beat_sync" in unique and not plan.get("beatSync") and any(
            (e["first"], e["last"]) != (0, total) for e in effects if rules[e["id"]].get("mode") == "replace"):
        raise ValueError("Apply graphic replacements to the full caption track when syncing beats")
    return effects


def apply_to_edit_plan(plan, selections):
    if not enabled():
        return plan
    catalog = load_catalog()
    effects = normalize(plan, selections, catalog)
    return {**deepcopy(plan), "stylepack": {"version": catalog["version"], "effects": effects}}


def prepare_beat_sync(plan):
    pack = active_pack(plan)
    if not pack or plan.get("beatSync") or not any(e["id"] == "beat_sync" for e in pack["effects"]):
        return
    from critic_agent import probe_video
    from studio_beat_sync import musical_peaks, snap_events

    require_audio(plan, beat_sync=True)
    track = next(bed["path"] for bed in plan["audioBeds"] if bed["role"] == "music")
    try:
        peaks = musical_peaks(track, duration=plan["frames"]/30)
    except ImportError as error:
        raise RuntimeError("StylePack Beat Sync requires NumPy and SciPy") from error
    events = snap_events(plan, peaks)
    for shot in plan["shots"]:
        duration = float(probe_video(shot["path"])["format"]["duration"])
        if shot["last"] > round(duration*30):
            raise ValueError("StylePack Beat Sync needs more approved source footage at a cut")
    for effect in pack["effects"]:
        if effect["id"] in LAYOUTS:
            shot = plan["shots"][effect["sourceShot"]]
            if shot["last"]-shot["first"] < effect["last"]-effect["first"]:
                raise ValueError("The layout source became too short after Beat Sync")
    plan["beatSync"] = {"peaksSec": [p[0] for p in peaks], "events": events}
    plan["fade"] = 0


def bind_job(plan, folder, target, render_dir):
    folder = folder.resolve(strict=True)
    job = json.loads((folder / "job.json").read_text(encoding="utf-8"))
    if job.get("version") != 1 or job.get("status") != "EDITING":
        raise ValueError("ProductionJob must be at EDITING")
    output_dir = (folder / "output").resolve(strict=True)
    if any(not path.resolve().is_relative_to(output_dir) for path in (target, render_dir) if path):
        raise ValueError("StylePack deliverables must be within ProductionJob/output")
    input_dir = (folder / "input").resolve(strict=True)
    if any(not Path(shot["path"]).resolve(strict=True).is_relative_to(input_dir) for shot in plan["shots"]):
        raise ValueError("EditPlan sources must be within ProductionJob/input")
    plan["stylepack"]["productionJob"] = {"id": job["id"], "revision": job["revision"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("selection", type=Path)
    parser.add_argument("--output", type=Path, required=True, help="A new EditPlan JSON file")
    parser.add_argument("--job-dir", type=Path)
    parser.add_argument("--render-dir", type=Path, help="A new output directory for the verified MP4")
    args = parser.parse_args()
    if not enabled():
        print("StylePack is disabled (PERSONA_STYLEPACK_V2_30=1 enables it).")
        return
    plan = apply_to_edit_plan(json.loads(args.plan.read_text(encoding="utf-8")),
                              json.loads(args.selection.read_text(encoding="utf-8")))
    if args.job_dir:
        bind_job(plan, args.job_dir, args.output, args.render_dir)
    with args.output.open("x", encoding="utf-8") as file:
        json.dump(plan, file, ensure_ascii=False, indent=2)
        file.write("\n")
    if args.render_dir:
        from studio_ffmpeg import render_prepared_plan
        destination = args.render_dir.resolve()
        destination.mkdir()
        print(render_prepared_plan(plan, destination))
    else:
        print(args.output)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError) as error:
        sys.exit(str(error))
