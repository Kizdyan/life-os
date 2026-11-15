"""Optional Kinocut trimming for a verified Persona EditPlan."""
from importlib.metadata import version
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


KINOCUT_VERSION = "2.0.1"


def stage_kinocut_clips(shots, directory, frames):
    venv = Path(__file__).resolve().parents[1] / ".venv-kinocut"
    python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file():
        raise RuntimeError("Kinocut 2.0.1 is missing from .venv-kinocut")
    env = {key: value for key, value in os.environ.items() if key not in {"PYTHONPATH", "PYTHONHOME"}}
    env["KINOCUT_VISION_MODE"] = "off"
    if ffmpeg_dir := env.get("PERSONA_MEDIA_FFMPEG_DIR"):
        env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")
    reply = subprocess.run(
        [str(python), "-E", "-B", str(Path(__file__).resolve()), "--stage"],
        input=json.dumps(shots), capture_output=True, cwd=directory, env=env,
        encoding="utf-8", errors="replace", timeout=min(600, 30 + frames / 10),
    )
    if reply.returncode:
        errors = reply.stderr.strip().splitlines()
        raise RuntimeError("Kinocut trim failed" + (f": {errors[-1][:420]}" if errors else ""))
    paths = [directory / f"clip-{index:02}.mp4" for index in range(len(shots))]
    if any(not path.is_file() or not path.stat().st_size for path in paths):
        raise RuntimeError("Kinocut did not write every trimmed clip")
    return [str(path) for path in paths]


def render_edit_plan(plan, output, render_ffmpeg):
    """Return renderer provenance and invoke the existing FFmpeg finishing pass."""
    if os.getenv("PERSONA_RENDER_BACKEND") != "kinocut":
        return {"renderer": "ffmpeg"}, render_ffmpeg(plan, output)
    reason = None
    if plan.get("transitionApplied") == "aligned-cross-dissolve":
        reason = "The approved dissolve needs the original source handles."
    elif plan.get("lut") and os.environ.get("PERSONA_STUDIO_FACE_MODEL"):
        reason = "The approved skin protection pass needs the original source frames."
    if reason is None:
        if output.exists():
            raise FileExistsError(output)
        # Kinocut protects agent configuration directories such as .codex.
        with TemporaryDirectory(prefix="persona-kinocut-", ignore_cleanup_errors=True) as directory:
            try:
                paths = stage_kinocut_clips(plan["shots"], Path(directory), plan["frames"])
                staged = {**plan, "shots": [
                    {**shot, "path": path, "first": 0, "last": shot["last"] - shot["first"],
                     "audioSource": {"path": shot["path"], "first": shot["first"]}}
                    for shot, path in zip(plan["shots"], paths, strict=True)
                ]}
                graph = render_ffmpeg(staged, output)
            except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
                reason = str(error) or type(error).__name__
                output.unlink(missing_ok=True)
            else:
                return {"renderer": "kinocut+ffmpeg", "requestedBackend": "kinocut"}, graph
    return {"renderer": "ffmpeg", "requestedBackend": "kinocut",
            "fallbackReason": reason}, render_ffmpeg(plan, output)


def _stage():
    if version("kinocut") != KINOCUT_VERSION:
        raise RuntimeError(f"Expected Kinocut {KINOCUT_VERSION}")
    from kinocut import Client
    from critic_agent import probe_video

    client = Client()
    for index, shot in enumerate(json.load(sys.stdin)):
        source = Path(shot["path"]).resolve(strict=True)
        total = shot["last"] - shot["first"]
        source_streams = probe_video(source)["streams"]
        picture = next(stream for stream in source_streams if stream["codec_type"] == "video")
        if (picture.get("avg_frame_rate") != "30/1" or picture.get("r_frame_rate") != "30/1"
                or picture.get("color_transfer") in {"smpte2084", "arib-std-b67"}
                or str(picture.get("color_primaries", "")).startswith("bt2020")
                or any(side.get("rotation") for side in picture.get("side_data_list", []))
                or picture.get("tags", {}).get("rotate")):
            raise RuntimeError("The Kinocut trim trial expects unrotated SDR footage at 30 fps")
        path = Path.cwd() / f"clip-{index:02}.mp4"
        client.trim(str(source), start=shot["first"] / 30, duration=total / 30, output=str(path), accurate=True)
        trimmed = probe_video(path)["streams"]
        video = next(stream for stream in trimmed if stream["codec_type"] == "video")
        if (video.get("avg_frame_rate") != "30/1" or int(video.get("nb_frames", 0)) != total
                or (video["width"], video["height"]) != (picture["width"], picture["height"])
                or (shot["audio"] and any(s["codec_type"] == "audio" for s in source_streams)
                    and not any(s["codec_type"] == "audio" for s in trimmed))):
            raise RuntimeError("Kinocut trim changed the planned frame count, geometry or audio streams")


if __name__ == "__main__":
    if sys.argv[1:] != ["--stage"]:
        sys.exit("Call render_edit_plan from Persona's verified studio renderer.")
    try:
        _stage()
    except Exception as error:
        sys.exit(str(error))
