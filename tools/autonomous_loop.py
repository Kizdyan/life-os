"""Run Director → local Resolve → Critic, with a maximum of three attempts."""
import argparse
import json
from pathlib import Path
import sys

from critic_agent import evaluate_video
from director_agent import analyze_and_decide
from studio_providers import load_local_env
from studio_resolve import available_luts, edit_decisions, render_attempt
from studio_references import default_reference_root, reference_library, sound_library


def run_loop(video, script, edit, root, *, renderer=None, provider=None, references=None, assets=None, cut_frames=()):
    attempts, feedback, previous, prefer = [], [], None, provider
    for index in range(1, 4):
        direction = analyze_and_decide(video, script, feedback=feedback, previous=previous, prefer=prefer,
                                       available_luts=available_luts(), assets=assets, cut_frames=cut_frames,
                                       audio_references=(references or {}).get("audio_ref", ()))
        actionable = ("lut", "transition", "subtitles", "musicAsset", "sfxAsset", "sfxFrame")
        if previous and "reason" in direction and all(direction.get(key) == previous.get(key) for key in actionable):
            break
        if renderer:
            path = renderer(direction, index)
        else:
            timeline, captions, staging = edit
            path = render_attempt(timeline, captions, direction, staging, root / f"attempt-{index}", assets=assets, verified_audio=video)
        critique = evaluate_video(path, prefer=provider or direction["provider"], references=references)
        if direction.get("soundSelectionBlocked"):
            critique = {**critique, "status": "REJECTED",
                        "checklist": [*critique["checklist"], direction["soundSelectionBlocked"]]}
        attempts.append({"attempt": index, "video": str(path), "direction": direction, "critique": critique})
        if root is not None:
            (root / f"attempt-{index}.json").write_text(json.dumps(attempts[-1], ensure_ascii=False, indent=2), encoding="utf-8")
        if (critique["status"] == "APPROVED" or direction.get("soundSelectionBlocked")
                or (critique.get("audioReview") or {}).get("status") == "unavailable"):
            break
        feedback, previous, prefer = critique["checklist"], direction, critique["provider"]
    return {"status": attempts[-1]["critique"]["status"], "video": attempts[-1]["video"], "attempts": attempts,
            "publicationApproved": False, "distributionAllowed": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worker_session", type=Path)
    parser.add_argument("staging", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--send-frames", action="store_true", required=True)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    load_local_env()
    try:
        session, staging, output = (path.resolve(strict=True) for path in (args.worker_session, args.staging, args.output))
        identifier = session.name.removeprefix("ai-reel-")
        if (output.parent != session or staging.parent != session.parent or
                not session.name.startswith("ai-reel-") or staging.name != ".worker-staging-" + identifier):
            raise ValueError("Resolve can only process the current Worker session")
        result = json.loads((session / "RESULT.json").read_text(encoding="utf-8"))
        if result.get("status") != "awaiting-author-review" or result.get("distributionAllowed") is not False:
            raise ValueError("The local Worker has no verified draft")
        brief = json.loads((staging / "approved-production-brief.json").read_text(encoding="utf-8"))
        script = (brief.get("manualSource") or {}).get("sourceText") or "\n".join(beat["line"] for beat in brief["script"])
        timeline = json.loads((session / "timeline.json").read_text(encoding="utf-8"))
        captions = json.loads((session / "captions.review.json").read_text(encoding="utf-8"))["cues"]
        # Reject unsupported local timelines before spending provider quota.
        draft = (session / "draft-reel.mp4").resolve(strict=True)
        if draft.parent != session:
            raise ValueError("The verified draft is outside the Worker session")
        preflight = edit_decisions(timeline, captions, {"lut": "none", "subtitles": "commercial",
                       "transition": "cut", "music": "none"}, staging, output / "preflight", verified_audio=draft)
        reference_root = default_reference_root()
        references = reference_library(reference_root)
        assets = sound_library(reference_root)
        cut_frames = [shot["record"] for shot in preflight["shots"][1:]]
        report = run_loop(draft, script, (timeline, captions, staging), output,
                          provider="openrouter", references=references, assets=assets, cut_frames=cut_frames)
        report["missingReferences"] = [category for category, files in references.items() if not files]
        (output / "STUDIO.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False))
    except Exception as error:
        sys.exit(str(error))
