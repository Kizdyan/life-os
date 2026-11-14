"""Prepare a trusted local Lua edit and render that timeline with Resolve MCP."""
import asyncio
import json
import os
from pathlib import Path
import re
import subprocess
import time

from critic_agent import _bin, _capture, probe_video

LUT_NAMES = {"humble": "IWLTBAP Humble - Standard.cube", "aspen": "IWLTBAP Aspen - Standard.cube"}
FONTS = {"cinematic": ("Manrope", "Medium", 52), "editorial": ("Georgia", "Regular", 48),
         "commercial": ("Arial", "Bold", 58)}


def available_luts():
    folder = os.environ.get("PERSONA_STUDIO_LUT_DIR")
    return tuple(key for key, name in LUT_NAMES.items() if folder and (Path(folder) / name).is_file())


def _lua(value):
    if type(value) is bool:
        return "true" if value else "false"
    if isinstance(value, str):
        return '"' + "".join(
            '\\\\' if char == '\\' else '\\"' if char == '"' else f"\\{ord(char):03d}" if ord(char) < 32 else char
            for char in value) + '"'
    if isinstance(value, list):
        return "{" + ",".join(_lua(item) for item in value) + "}"
    if isinstance(value, dict):
        return "{" + ",".join(f"[{_lua(key)}]={_lua(item)}" for key, item in value.items()) + "}"
    if type(value) is int:
        return str(value)
    raise TypeError("Unsupported data in trusted local Resolve plan")


def caption_pops(first, last, text):
    words = text.split()
    steps = min(len(words), max(1, (last - first - 5) // 3 + 1), 8)
    if steps <= 1:
        return [{"first": first, "last": last, "text": text, "accent": ""}]
    # Show progressive text for at most the first half of a cue, then hold it.
    interval = min(3, max(2, (last - first) // (2 * steps)))
    rows = [{"first": first + i * interval, "last": first + (i + 1) * interval,
             "text": " ".join(words[:i + 1]), "accent": ""} for i in range(steps - 1)]
    accent = words[-1]
    # Keep unusually long tokens on the main caption line.
    return rows + [{"first": rows[-1]["last"], "last": last,
                    "text": " ".join(words[:-1]) if len(accent) <= 18 else text,
                    "accent": accent if len(accent) <= 18 else ""}]


def edit_decisions(timeline, captions, decision, staging, output, *, verified_audio=None):
    if (timeline.get("mode") != "strict" or timeline.get("missingBeats")
            or (timeline.get("width"), timeline.get("height"), timeline.get("fps")) != (1080, 1920, 30)):
        raise ValueError("Resolve needs the complete verified 1080×1920/30 timeline")
    clips, frames = [], 0
    for clip in timeline["clips"]:
        if clip.get("audioTreatment") and verified_audio is None:
            raise ValueError("Resolve automation does not yet preserve a reviewed speech/music boundary")
        path = Path(clip["path"]).resolve(strict=True)
        if not path.is_file() or not path.is_relative_to(staging):
            raise ValueError("Timeline media must be from this Worker upload")
        first = round(clip["startSec"] * 30)
        end = round((clip["startSec"] + clip["durationSec"]) * 30)
        if end <= first or first < 0:
            raise ValueError("Invalid timeline interval")
        clips.append({"path": path.as_posix(), "first": first, "last": end, "record": frames,
                      "audio": 0 if verified_audio is not None or clip.get("muteSourceAudio") else 1})
        frames += end - first
    if not 2 <= len(clips) <= 60 or frames > 27000:
        raise ValueError("Unsupported Resolve timeline size")
    rows = []
    for cue in captions:
        start, end = (round(cue[key] * 30 / 1000) for key in ("startMs", "endMs"))
        end = min(frames, end) if end == frames + 1 else end
        if not (0 <= start < end <= frames) or not isinstance(cue["text"], str) or not cue["text"].strip() or len(cue["text"]) > 600:
            raise ValueError("Caption is outside the verified edit")
        if rows and start < rows[-1]["last"]:
            raise ValueError("Captions overlap at the Resolve frame rate")
        rows.extend(caption_pops(start, end, cue["text"]))
    lut = ""
    if decision["lut"] != "none":
        lut = (Path(os.environ["PERSONA_STUDIO_LUT_DIR"]) / LUT_NAMES[decision["lut"]]).resolve(strict=True).as_posix()
    family, weight, size = FONTS[decision["subtitles"]]
    return {"title": "Persona Studio " + output.parent.name + " " + output.name, "shots": clips, "frames": frames,
            "captions": rows, "font": family, "weight": weight, "size": size, "lut": lut,
            "fade": 2 if decision["transition"] == "fade" else 0, "musicDirection": decision["music"],
            "publicationApproved": False, "distributionAllowed": False}


def prepare_audio(plan, direction, assets, output, *, verified_audio=None):
    beds = []
    if verified_audio is not None:
        target = output / "verified-program-audio.wav"
        _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-n", "-i", str(verified_audio), "-map", "0:a:0",
                  "-t", str(plan["frames"] / 30), "-vn", "-ar", "48000", "-ac", "2",
                  "-c:a", "pcm_s24le", str(target)], timeout=180)
        beds.append({"path": target.as_posix(), "record": 0, "frames": plan["frames"], "role": "program",
                     "fadeIn": 0, "fadeOut": 0})
    cut_frames = {shot["record"] for shot in plan["shots"][1:]}
    for kind, gain in (("music", -8), ("sfx", -12)):
        selected = direction.get(kind + "Asset", "none")
        if selected == "none":
            continue
        if selected not in assets or not selected.startswith(kind + "-"):
            raise ValueError(f"Unapproved {kind} asset")
        record = 0 if kind == "music" else direction.get("sfxFrame")
        if kind == "sfx" and (type(record) is not int or record not in cut_frames):
            raise ValueError("SFX must land on a verified cut")
        source = assets[selected]
        duration = plan["frames"] - record
        if kind == "sfx":
            original_frames = int(float(probe_video(source)["format"]["duration"]) * 30)
            duration = min(duration, original_frames, 45)
        if duration < 3:
            raise ValueError(f"{kind} is too short for the verified edit")
        target = output / (kind + "-resolve.wav")
        loop_input = ["-stream_loop", "-1"] if kind == "music" else []
        _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-n", *loop_input, "-i", str(source),
                  "-map", "0:a:0", "-t", str(duration / 30), "-vn",
                  "-af", f"loudnorm=I=-23:TP=-2:LRA=7,volume={gain}dB",
                  "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(target)], timeout=180)
        beds.append({"path": target.as_posix(), "record": record, "frames": duration, "asset": source.name, "role": kind,
                     "fadeIn": min(15 if kind == "music" else 2, duration // 4),
                     "fadeOut": min(45 if kind == "music" else 6, duration // 3), "gainDb": gain})
    return beds


async def _mcp_render(expected, output, frames):
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    import sys

    server = Path.home() / ".resolve-ai-bridge/bridge/server.py"
    if not server.is_file():
        raise RuntimeError("Resolve AI Bridge MCP is not installed")
    params = StdioServerParameters(command=sys.executable, args=["-B", str(server)],
                                  env={"RESOLVE_AI_BRIDGE_MODE": "lua"})
    async with asyncio.timeout(300), stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()

            async def call(tool, **args):
                response = await session.call_tool(tool, args)
                value = json.loads(response.content[0].text)
                if response.isError or not value.get("ok"):
                    raise RuntimeError(f"Resolve MCP {tool}: {value.get('error', 'failed')}")
                return value["result"]

            await call("resolve_status")
            project = await call("project_info")
            if project.get("name") != expected or project.get("timeline") != expected:
                raise RuntimeError("Resolve is not on the prepared Persona project and timeline")
            job = await call("render_current_timeline", output_dir=str(output), name="studio", start=True, user_approved=True)
            if not job.get("started"):
                raise RuntimeError("Resolve declined to start rendering")
            while True:
                queue = await call("render_status", job_id=job["job_id"])
                status = next((item for item in queue["jobs"] if item["job_id"] == job["job_id"]), {})
                state = str(status.get("status")).lower()
                if state in ("complete", "completed"):
                    break
                if state in ("failed", "cancelled", "canceled"):
                    raise RuntimeError(f"Resolve render {state}")
                await asyncio.sleep(1)
    video = output / "studio.mp4"
    meta = probe_video(video)
    stream = next(item for item in meta["streams"] if item["codec_type"] == "video")
    if (stream.get("codec_name") != "h264" or stream.get("width") != 1080 or stream.get("height") != 1920
            or stream.get("r_frame_rate") != "30/1" or int(stream.get("nb_frames", 0)) != frames
            or "DaVinci Resolve" not in meta["format"].get("tags", {}).get("encoder", "")
            or not any(item["codec_type"] == "audio" for item in meta["streams"])):
        raise RuntimeError("Resolve output failed format/duration verification")
    _capture([_bin("ffmpeg"), "-v", "error", "-xerror", "-nostdin", "-i", str(video),
              "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], timeout=180)
    peaks = subprocess.run([_bin("ffmpeg"), "-hide_banner", "-nostdin", "-i", str(video),
                            "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"],
                           capture_output=True, timeout=180, check=True).stderr.decode(errors="replace")
    peak = re.search(r"max_volume:\s*(-?[0-9.]+) dB", peaks)
    if not peak or float(peak[1]) >= -0.1:
        raise RuntimeError("Resolve audio mix has no measured peak headroom")
    (output / "audio-qa.json").write_text(json.dumps({"peakDbFS": float(peak[1]),
                                                    "fullDecode": True}), encoding="utf-8")
    return video


def render_attempt(timeline, captions, decision, staging, output, *, assets=None, verified_audio=None):
    import sys

    output.mkdir()
    plan = edit_decisions(timeline, captions, decision, staging, output, verified_audio=verified_audio)
    plan["audioBeds"] = prepare_audio(plan, decision, assets or {}, output, verified_audio=verified_audio)
    # A JSON edit decision list preserves parameters CMX3600 cannot represent.
    (output / "EDL.json").write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    ready = output / "resolve-ready.txt"
    ready.touch(exist_ok=False)
    script = output / "prepare.lua"
    code = Path(__file__).with_name("persona-studio-prepare.lua").read_text(encoding="utf-8")
    script.write_text("local job = " + _lua(plan) + "\nlocal ready = " + _lua(ready.as_posix()) + "\n" + code, encoding="utf-8")
    launcher = Path(os.environ["PERSONA_STUDIO_RESOLVE_LAUNCHER"]).resolve(strict=True)
    bridge = Path.home() / ".resolve-ai-bridge"
    if not (bridge / "bridge/server.py").is_file():
        raise RuntimeError("Resolve AI Bridge MCP is not installed")
    # The native Lua transport occupies Resolve's Lua console while it polls.
    # Stop it gracefully, prepare the trusted local plan, then restart for MCP.
    control = ("import sys,time; from pathlib import Path; "
               "sys.path.insert(0,str(Path.home()/'.resolve-ai-bridge')); "
               "from bridge import lua_transport\n"
               "if lua_transport.probe().get('connected'):\n"
               " lua_transport.request_stop()\n"
               " for _ in range(50):\n"
               "  if not lua_transport.probe().get('connected'): break\n"
               "  time.sleep(.2)\n"
               " else: raise SystemExit('Resolve Lua bridge is busy')\n")
    local_env = {key: value for key, value in os.environ.items() if not key.upper().endswith("_API_KEY")}
    subprocess.run([sys.executable, "-B", "-c", control], check=True, timeout=16, env=local_env)
    subprocess.run([sys.executable, "-B", str(launcher), "--prepare-studio", str(script)],
                   check=True, timeout=30, env=local_env)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        status = ready.read_text(encoding="utf-8", errors="replace").strip()
        if status == "ready":
            break
        if status.startswith("error:"):
            raise RuntimeError(status)
        time.sleep(0.3)
    else:
        raise TimeoutError("Resolve did not prepare the timeline")
    subprocess.run([sys.executable, "-B", str(launcher), "--start-mcp"], check=True, timeout=25, env=local_env)
    return asyncio.run(_mcp_render(plan["title"], output, plan["frames"]))
