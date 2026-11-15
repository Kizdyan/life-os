"""Render a locally verified Persona timeline with FFmpeg and libass."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import shutil
import sys
from statistics import median
from tempfile import TemporaryDirectory

from critic_agent import _bin, _capture, probe_video
from apply_stylepack import apply_to_edit_plan, prepare_beat_sync
from kinocut_render_adapter import render_edit_plan
from studio_references import configured_media_root
from stylepack_renderer import active_pack, audio_layers, enabled as stylepack_enabled, picture_layers, write_graphics

LUT_NAMES = {"humble": "IWLTBAP Humble - Standard.cube", "aspen": "IWLTBAP Aspen - Standard.cube"}
SUBTITLE_STANDARD = Path(__file__).with_name("subtitle-standard-v1") / "subtitle_render_config.json"
SUBTITLE_STANDARD_SHA256 = "1b8bba7b221b4ee58cc12fd1f3137fa07c5873ed0139af30fec41f3861aa6eb6"


def available_luts():
    folder = lut_directory()
    return tuple(key for key, name in LUT_NAMES.items() if (folder / name).is_file())


def lut_directory():
    return Path(os.environ["PERSONA_STUDIO_LUT_DIR"]) if os.environ.get("PERSONA_STUDIO_LUT_DIR") else configured_media_root() / "luts"


def reference_cards(caption, style):
    first, last = caption["first"], caption["last"]
    split = (style["accentAtMs"] * 30 + 500) // 1000
    if " ".join(caption["text"].split()) != " ".join((style["introText"] + " " + style["accentText"]).split()):
        raise ValueError("Reference titles must preserve the approved caption text")
    if not first < split < last:
        raise ValueError("Reference accent is outside its caption")
    slide_frames = style.get("introSlideFrames", 0)
    read_hold = (style.get("introReadHoldMs", 0) * 30 + 999) // 1000
    if split - first < slide_frames + read_hold:
        raise ValueError("Reference intro does not have enough readable hold after the slide")
    cards = []
    for start, end, label, color, size, is_accent in [
        (first, split, "introText", "baseHex", "baseSizePx", False),
        (split, last, "accentText", "accentHex", "accentSizePx", True),
    ]:
        rgb = [int(style[color][offset:offset+2], 16) for offset in (0, 2, 4)]
        cards.append({"first": start, "last": end, "text": style[label], "accent": "", "color": rgb,
                      "px": style[size], "center": style["centerPercent"], "emphasis": is_accent,
                      "fade": min(style["fadeFrames"], (end - start) // 3),
                      "slideFrames": 0 if is_accent else slide_frames})
    return cards


def reference_caption_config():
    path = SUBTITLE_STANDARD.resolve(strict=True)
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SUBTITLE_STANDARD_SHA256:
        raise ValueError("Approved subtitle standard SHA-256 mismatch")
    style = json.loads(raw.decode("utf-8-sig"))
    animation = style.get("animation", {})
    if (style.get("version") != 1
            or not re.fullmatch(r"[A-Fa-f0-9]{64}", style.get("referenceSha256", ""))
            or not re.fullmatch(r"[#][A-Fa-f0-9]{6}", style.get("color", ""))
            or not all(isinstance(style.get(key), str) and re.fullmatch(r"[\w -]{1,80}", style[key])
                       for key in ("fontFamily", "fontStyle"))
            or type(style.get("fontSize1080")) is not int or not 20 <= style["fontSize1080"] <= 180
            or any(type(style.get(key)) not in (int, float) or not .05 <= style[key] <= .95 for key in ("xRatio", "yRatio"))
            or style.get("outlinePx") != 0 or style.get("shadowPx") != 0
            or style.get("lineBreak") != "approved" or style.get("case") != "uppercase"
            or animation.get("unit") != "cue" or animation.get("movement") != "none"
            or type(animation.get("fadeInMs")) is not int or not 0 <= animation["fadeInMs"] <= 1000):
        raise ValueError("Invalid reference subtitle config")
    font = (path.parent / style["fontFile"]).resolve(strict=True)
    if not font.is_relative_to(path.parent) or font.suffix.lower() != ".ttf":
        raise ValueError("Reference font must be a local TTF beside its config")
    with font.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest().lower() != style.get("fontSha256", "").lower():
            raise ValueError("Reference font SHA-256 mismatch")
    return style


def edit_decisions(timeline, captions, decision, staging, output, *, verified_audio=None):
    if (timeline.get("mode") != "strict" or timeline.get("missingBeats")
            or (timeline.get("width"), timeline.get("height"), timeline.get("fps")) != (1080, 1920, 30)):
        raise ValueError("FFmpeg needs the complete verified 1080×1920/30 timeline")
    clips, frames = [], 0
    for clip in timeline["clips"]:
        if clip.get("audioTreatment") and verified_audio is None:
            raise ValueError("A verified program mix is required to preserve a reviewed speech/music boundary")
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
    if not 1 <= len(clips) <= 60 or frames > 27000:
        raise ValueError("Unsupported Resolve timeline size")
    rows = []
    reference_config = reference_caption_config()
    for cue in captions:
        start, end = (round(cue[key] * 30 / 1000) for key in ("startMs", "endMs"))
        end = min(frames, end) if end == frames + 1 else end
        if not (0 <= start < end <= frames) or not isinstance(cue["text"], str) or not cue["text"].strip() or len(cue["text"]) > 600:
            raise ValueError("Caption is outside the verified edit")
        if rows and start < rows[-1]["last"]:
            raise ValueError("Captions overlap at the output frame rate")
        fade = round(reference_config["animation"]["fadeInMs"] * 30 / 1000)
        rgb = [int(reference_config["color"][offset:offset + 2], 16) for offset in (1, 3, 5)]
        rows.append({"first": start, "last": end, "text": cue["text"].strip().upper(),
                     "referenceDriven": True, "fadeInFrames": min(fade, end - start - 1),
                     "x": reference_config["xRatio"], "center": 1-reference_config["yRatio"], "color": rgb})
    lut, mix = "", 0.0
    if decision["lut"] != "none":
        mix = .60
    if mix:
        lut = (lut_directory() / LUT_NAMES[decision["lut"]]).resolve(strict=True).as_posix()
    family, weight, size = (reference_config[key] for key in ("fontFamily", "fontStyle", "fontSize1080"))
    return {"title": "Persona Studio " + output.parent.name + " " + output.name, "shots": clips, "frames": frames,
            "captions": rows, "subtitleStandardSha256": SUBTITLE_STANDARD_SHA256, "font": family, "weight": weight, "size": size, "lut": lut, "lutMix": mix,
            "fade": 2 if decision["transition"] == "fade" else 0, "musicDirection": decision["music"],
            "publicationApproved": False, "distributionAllowed": False}


def prepare_audio(plan, direction, assets, output, *, verified_audio=None):
    beds = []
    style = direction.get("style", {})
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
        target = output / (kind + "-bed.wav")
        fade_in = min(15 if kind == "music" else 2, duration // 4)
        fade_out = min(45 if kind == "music" else 6, duration // 3)
        music_only = kind == "music" and verified_audio is None and not any(shot["audio"] for shot in plan["shots"])
        filters = f"loudnorm=I=-23:TP=-2:LRA=7,volume={gain}dB"
        target_lufs = style.get("targetLufs", -14)
        if music_only:
            filters = (f"atrim=duration={duration/30},asetpts=PTS-STARTPTS,"
                       f"afade=t=in:d={fade_in/30},"
                       f"afade=t=out:st={(duration-fade_out)/30}:d={fade_out/30},"
                       f"loudnorm=I={target_lufs}:TP=-1.5:LRA=7")
        plan_audio = {"targetLufs": target_lufs, "fadeBaked": [fade_in, fade_out]} if music_only else {"gainDb": gain}
        loop_input = ["-stream_loop", "-1"] if kind == "music" else []
        _capture([_bin("ffmpeg"), "-v", "error", "-nostdin", "-n", *loop_input, "-i", str(source),
                  "-map", "0:a:0", "-t", str(duration / 30), "-vn",
                  "-af", filters,
                  "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(target)], timeout=180)
        if music_only and style:
            measured = measure_loudness(target, output)
            correction = min(target_lufs-measured["loudness"], -1.5-measured["peak"])
            if math.isfinite(correction) and abs(correction) > .5:
                plan_audio["measuredCorrectionDb"] = round(correction, 3)
        beds.append({"path": target.as_posix(), "record": record, "frames": duration, "asset": source.name, "role": kind,
                     "fadeIn": 0 if music_only else fade_in, "fadeOut": 0 if music_only else fade_out, **plan_audio})
    return beds


def run_ffmpeg(args, *, cwd):
    result = subprocess.run([_bin("ffmpeg"), "-nostdin", "-n", *args], cwd=cwd,
                            capture_output=True, timeout=600, encoding="utf-8", errors="replace")
    if result.returncode:
        raise RuntimeError(f"FFmpeg exited with code {result.returncode}: {result.stderr[-1500:]}")
    return result.stderr


def build_ass(captions, output, working):
    # Reuse the exact FFmpeg ASS writer used by the approved still and Worker.
    js = """
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {basename,join} from 'node:path';
const {buildSubtitleAss,loadApprovedSubtitleReference}=await import(process.argv[1]);
const {style,fontPath}=await loadApprovedSubtitleReference();
const cues=JSON.parse(readFileSync(0,'utf8'));
const captions=buildSubtitleAss({cues,width:1080,height:1920,reference:style});
writeFileSync(process.argv[2],captions.ass,{flag:'wx'});
copyFileSync(fontPath,join(process.argv[3],basename(fontPath)));
console.log(basename(fontPath,'.ttf'));
"""
    fonts = working / "fonts"
    fonts.mkdir()
    module = Path(__file__).with_name("persona-subtitle-burn.mjs").resolve().as_uri()
    node = os.environ.get("PERSONA_STUDIO_NODE", "node")
    result = subprocess.run([node, "--input-type=module", "-e", js, module, str(output), str(fonts)],
                            input=json.dumps(captions, ensure_ascii=False).encode(),
                            capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError("Could not build the approved ASS: " + result.stderr.decode(errors="replace")[-900:])
    shutil.copyfile(output, working / "captions.ass")
    return result.stdout.decode("utf-8").strip()


def add_title_bounds(cues, working):
    # Static-position ASS permits measuring one frame per cue at maximum visibility.
    width, height = 270, 480
    for cue in cues:
        sample = min(cue["last"]-1, cue["first"]+max(1, cue["fadeInFrames"], cue.get("zoomFrames", 0)))
        stamp = (sample + .5) / 30
        graph = (f"setpts=PTS+{stamp:.8f}/TB,ass=filename=captions.ass:fontsdir=fonts,"
                 f"scale={width}:{height},format=gray")
        result = subprocess.run([_bin("ffmpeg"), "-nostdin", "-hide_banner", "-loglevel", "error",
                                 "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=120",
                                 "-vf", graph, "-frames:v", "1", "-threads", "1",
                                 "-f", "rawvideo", "pipe:1"], cwd=working, capture_output=True, timeout=30)
        if result.returncode or len(result.stdout) != width*height:
            raise RuntimeError("Could not measure the approved ASS title bounds")
        ink = [i for i, value in enumerate(result.stdout) if value > 20]
        if not ink:
            raise ValueError("ASS cue produces no visible glyphs")
        xs, ys = [i % width for i in ink], [i // width for i in ink]
        cue["bounds"] = [max(0, min(xs)-2)/width, max(0, min(ys)-2)/height,
                         min(width, max(xs)+3)/width, min(height, max(ys)+3)/height]
        if cue.get("motion") == "fly-in":
            cue["bounds"][3] = min(1, cue["bounds"][3]+.045)


def zoom_cut_parameters(outgoing, incoming, frames):
    ramp = 15
    if frames < ramp:
        raise ValueError("Zoom-to-Cut needs at least 15 frames in the outgoing shot")
    # Fit both dimensions without stretching the image.
    scale = math.sqrt((incoming[2]*incoming[3])/(outgoing[2]*outgoing[3]))
    if not math.isfinite(scale) or not 1 <= scale <= 2:
        raise ValueError("The incoming face requires a zoom scale outside 1–2x")
    limit = 1-1/scale
    left = max(0., min(limit, outgoing[8]-incoming[8]/scale))
    top = max(0., min(limit, outgoing[9]-incoming[9]/scale))
    return {"firstFrame": frames-ramp, "lastFrame": frames-1,
            "scale": scale, "left": left, "top": top}


def zoom_progress(zoom, frame):
    t = max(0., min(1., (frame-zoom["firstFrame"])/(zoom["lastFrame"]-zoom["firstFrame"])))
    amount = t*t*(3-2*t)
    return 1-amount if zoom.get("reverse") else amount


def plan_zoom_cuts(shots):
    from studio_picture_qa import frame_faces

    def face_sample(shot, start):
        boxes = [faces[0] for _, faces in frame_faces(shot["path"], start, 3, include_eyes=True) if len(faces) == 1]
        if len(boxes) != 3:
            raise ValueError("Zoom-to-Cut needs one reliable face on both sides of the cut")
        return tuple(median(column) for column in zip(*boxes))

    zooms = []
    for i, (outgoing, incoming) in enumerate(zip(shots, shots[1:])):
        old = face_sample(outgoing, outgoing["last"]-3)
        new = face_sample(incoming, incoming["first"])
        zoom = zoom_cut_parameters(old, new, outgoing["last"]-outgoing["first"])
        # Re-measure the cropped end at its final size. Landmark estimates can
        # shift when the same face is first detected at smaller source scale.
        scale = zoom["scale"]
        for _ in range(2):
            viewport = (scale, zoom["left"], zoom["top"])
            _, fitted = next(frame_faces(outgoing["path"], outgoing["last"]-1, 1,
                                         include_eyes=True, zoom_viewport=viewport))
            if len(fitted) != 1:
                raise ValueError("Unable to verify the face at the end of the push-in")
            limit = 1-1/scale
            zoom["left"] = max(0., min(limit, zoom["left"]+(fitted[0][8]-new[8])/scale))
            zoom["top"] = max(0., min(limit, zoom["top"]+(fitted[0][9]-new[9])/scale))
        zooms.append({**zoom, "shotIndex": i, "cutFrame": incoming["record"],
                      "sourceFaceSize": old[2:4], "targetFaceSize": new[2:4],
                      "sourceEyes": old[8:], "targetEyes": new[8:]})
    return zooms


def zoom_cut_filter(zooms):
    expressions = []
    for zoom in zooms:
        t = f'clip((on-{zoom["firstFrame"]})/{zoom["lastFrame"]-zoom["firstFrame"]},0,1)'
        progress = f'({t}*{t}*(3-2*{t}))'
        if zoom.get("reverse"):
            progress = f'(1-{progress})'
        expressions.append((zoom, progress))

    def terms(name, origin=0):
        return "+".join(f'{zoom[name]-origin:.10f}*{progress}' for zoom, progress in expressions)

    return (f"zoompan=z='1+{terms('scale', 1)}':x='iw*({terms('left')})':"
            f"y='ih*({terms('top')})':d=1:s=1080x1920:fps=30")


def shot_zooms(plan):
    result = {}
    for zoom in plan.get("zoomToCuts", []):
        result.setdefault(zoom["shotIndex"], []).append(zoom)
    return result


def write_skin_matte(plan, path):
    import cv2
    import numpy as np
    from studio_picture_qa import protection_masks

    zooms = shot_zooms(plan)
    frames_written = 0
    with path.open("xb") as matte:
        for i, shot in enumerate(plan["shots"]):
            ramps = zooms.get(i, ())
            for frame, (x, y, width, height) in enumerate(protection_masks(shot)):
                y = 1-y
                if ramps:
                    portions = [(zoom, zoom_progress(zoom, frame)) for zoom in ramps]
                    scale = 1+sum((zoom["scale"]-1)*amount for zoom, amount in portions)
                    left = sum(zoom["left"]*amount for zoom, amount in portions)
                    top = sum(zoom["top"]*amount for zoom, amount in portions)
                    x, y = (x-left)*scale, (y-top)*scale
                    width, height = width*scale, height*scale
                pixels = np.zeros((480, 270), dtype=np.uint8)
                cv2.ellipse(pixels, (round(x*270), round(y*480)),
                            (round(width*135), round(height*240)), 0, 0, 360, 209, -1)
                matte.write(cv2.GaussianBlur(pixels, (0, 0), 6).tobytes())
                frames_written += 1
    if frames_written != plan["frames"]:
        raise RuntimeError("Skin matte did not match the finished timeline")


def ffmpeg_graph(plan, working, *, captions, stylepack_graphics=False):
    inputs, filters, shots, program = [], [], [], []
    original_audio_inputs = []
    shot_count = len(plan["shots"])
    has_program_mix = any(bed["role"] == "program" for bed in plan["audioBeds"])
    keep_clip_audio = not has_program_mix and any(shot["audio"] for shot in plan["shots"])
    zooms = shot_zooms(plan)
    dissolve = plan.get("transitionApplied") == "aligned-cross-dissolve"
    dip = plan.get("transitionApplied") == "dip-without-overlap"
    graph_shots = plan["shots"]
    if dissolve:
        graph_shots = [{**shot, "first": shot["first"]-(9 if i else 0),
                        "last": shot["last"]+(9 if i+1 < shot_count else 0)}
                       for i, shot in enumerate(graph_shots)]
    for i, shot in enumerate(graph_shots):
        frames = shot["last"] - shot["first"]
        duration = frames / 30
        inputs.extend(["-ss", f'{shot["first"]/30:.9f}', "-i", shot["path"]])
        graph = (f"[{i}:v]fps=30,trim=end_frame={frames},setpts=PTS-STARTPTS,"
                 "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                 "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv444p")
        if i in zooms:
            graph += "," + zoom_cut_filter(zooms[i]) + ",setsar=1,format=yuv444p"
        if dissolve:
            graph += ",settb=1/30,setpts=N"
        if dip and frames >= 18:
            if i:
                graph += ",fade=t=in:n=11:color=0x35363D"
            if i+1 < shot_count:
                graph += f",fade=t=out:s={frames-12}:n=11:color=0x35363D"
        if plan["fade"] and frames > 2*plan["fade"]:
            if i:
                graph += f",fade=t=in:n={plan['fade']}:color=0x202020"
            if i+1 < shot_count:
                graph += f",fade=t=out:s={frames-plan['fade']}:n={plan['fade']}:color=0x202020"
        shots.append(f"[shot{i}]")
        filters.append(graph + shots[-1])
        if keep_clip_audio:
            source = shot.get("audioSource")
            audio_path = source["path"] if source else shot["path"]
            if shot["audio"] and any(s["codec_type"] == "audio" for s in probe_video(audio_path)["streams"]):
                index = i
                if source:
                    index = shot_count + len(original_audio_inputs)
                    original_audio_inputs.append(["-ss", f'{source["first"]/30:.9f}', "-i", audio_path])
                audio = f"[{index}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,apad"
            else:
                audio = "anullsrc=r=48000:cl=stereo"
            program.append(f"[program{i}]")
            filters.append(f"{audio},atrim=duration={duration:.9f},asetpts=PTS-STARTPTS{program[-1]}")
    if dissolve:
        left = shots[0]
        for i, shot in enumerate(graph_shots[1:], 1):
            label = "[picture]" if i == shot_count-1 else f"[dissolve{i}]"
            filters.append(f"{left}{shots[i]}xfade=transition=fade:duration=0.6:offset={(shot['record']-9)/30:.9f}{label}")
            left = label
    else:
        filters.append("".join(shots) + f"concat=n={shot_count}:v=1:a=0[picture]")
    picture = "[picture]"
    pack = active_pack(plan)
    before = None
    if pack and any(effect["id"] == "before_after" for effect in pack["effects"]):
        filters.append(f"{picture}split=2[spUngraded][spGradeInput]")
        before, picture = "[spUngraded]", "[spGradeInput]"
    for audio_input in original_audio_inputs:
        inputs.extend(audio_input)
    input_index = shot_count + len(original_audio_inputs)
    if plan["lut"]:
        shutil.copyfile(plan["lut"], working / "grade.cube")
        style = plan.get("genreStyle", {})
        grade = f",eq=contrast={style['contrast']}:saturation={style['saturation']}" if style else ""
        filters.extend([
            picture+"split=2[ungraded][gradeSource]",
            f"[gradeSource]lut3d=file=grade.cube:interp=tetrahedral,format=yuv444p{grade}[graded]",
            f"[graded][ungraded]blend=all_mode=normal:all_opacity={plan['lutMix']:.3f}[mixed]",
        ])
        if os.environ.get("PERSONA_STUDIO_FACE_MODEL"):
            write_skin_matte(plan, working / "skin.gray")
            inputs.extend(["-f", "rawvideo", "-pixel_format", "gray", "-video_size", "270x480",
                           "-framerate", "30", "-i", "skin.gray"])
            # Split the original before blending and use identical mask values for all color planes.
            filters[-3] = picture+"split=3[ungraded][gradeSource][skinOriginal]"
            filters.extend([
                f"[{input_index}:v]scale=1080:1920,split=3[m1][m2][m3]",
                "[m1][m2][m3]mergeplanes=mapping=0x001020:format=yuv444p[matte]",
                "[mixed][skinOriginal][matte]maskedmerge[protected]",
            ])
            picture = "[protected]"
            input_index += 1
            plan["skinToneProtection"] = True
        else:
            picture = "[mixed]"
    if pack:
        picture, input_index = picture_layers(plan, inputs, filters, picture, before, input_index)
    picture_filter = "ass=filename=captions.ass:fontsdir=fonts," if captions else ""
    if stylepack_graphics:
        picture_filter += "ass=filename=stylepack.ass:fontsdir=stylepack_fonts,"
    filters.append(picture + picture_filter + "format=yuv420p[video]")

    audio_tracks = []
    if program:
        filters.append("".join(program) + f"concat=n={shot_count}:v=0:a=1[program]")
        audio_tracks.append(("program", "[program]"))
    for i, bed in enumerate(plan["audioBeds"]):
        if bed.get("startSec"):
            inputs.extend(["-ss", f"{bed['startSec']:.9f}"])
        inputs.extend(["-i", bed["path"]])
        effects = [f"[{input_index}:a:0]aformat=sample_rates=48000:channel_layouts=stereo"]
        if bed["fadeIn"]:
            effects.append(f"afade=t=in:d={bed['fadeIn']/30:.9f}")
        if bed["fadeOut"]:
            effects.append(f"afade=t=out:st={(bed['frames']-bed['fadeOut'])/30:.9f}:d={bed['fadeOut']/30:.9f}")
        if "measuredCorrectionDb" in bed:
            effects.append(f"volume={bed['measuredCorrectionDb']}dB")
        if bed["record"]:
            effects.append(f"adelay={bed['record']*1600}S:all=1")
        label = f"[bed{i}]"
        audio_tracks.append((bed["role"], label))
        filters.append(",".join(effects) + label)
        input_index += 1
    if pack:
        audio_tracks = audio_layers(plan, inputs, filters, audio_tracks, input_index)
    audio_tracks = [label for _, label in audio_tracks]
    duration = plan["frames"] / 30
    if len(audio_tracks) > 1:
        audio = "".join(audio_tracks) + f"amix=inputs={len(audio_tracks)}:normalize=0,alimiter=limit=0.85:level=0,"
    elif audio_tracks:
        audio = audio_tracks[0]
    else:
        audio = "anullsrc=r=48000:cl=stereo,"
    filters.append(audio + f"apad,atrim=duration={duration:.9f}[audio]")
    return inputs, ";".join(filters)


def measure_loudness(path, output, *, full_decode=False):
    maps = ["-map", "0:v:0"] if full_decode else []
    analysis = run_ffmpeg(["-hide_banner", "-xerror", "-i", str(path), *maps, "-map", "0:a:0",
                           "-af", "loudnorm=print_format=json", "-f", "null", "-"], cwd=output)
    metrics = re.search(r'\{\s*"input_i"\s*:.*?\}', analysis, re.S)
    if not metrics:
        raise RuntimeError("FFmpeg did not measure the rendered audio")
    values = json.loads(metrics[0])
    return {"peak": float(values["input_tp"]), "loudness": float(values["input_i"])}


def verify_render(path, frames, *, target_lufs, output):
    meta = probe_video(path)
    video = next(s for s in meta["streams"] if s["codec_type"] == "video")
    audio = next((s for s in meta["streams"] if s["codec_type"] == "audio"), {})
    if (video.get("codec_name") != "h264" or video.get("width") != 1080 or video.get("height") != 1920
            or video.get("avg_frame_rate") != "30/1" or int(video.get("nb_frames", 0)) != frames
            or audio.get("codec_name") != "aac"):
        raise RuntimeError("FFprobe rejected the rendered picture, duration or audio")
    measured = measure_loudness(path, output, full_decode=True)
    peak, loudness = measured["peak"], measured["loudness"]
    audio_qa = {"truePeakDbTP": peak if peak != float("-inf") else None,
                "integratedLufs": loudness if loudness != float("-inf") else None,
                "targetLufs": target_lufs, "fullDecode": True}
    (output / "audio-qa.json").write_text(json.dumps(audio_qa, allow_nan=False), encoding="utf-8")
    if peak >= -0.1 or (target_lufs is not None and not target_lufs-1 <= loudness <= target_lufs+1):
        raise RuntimeError(f"FFmpeg audio mix failed loudness QA: {loudness} LUFS, {peak} dBTP")


def dynamic_zooms(shots, scale):
    zooms = []
    for i, (left, right) in enumerate(zip(shots, shots[1:])):
        if left["path"] != right["path"] or left["last"] != right["first"]:
            if left["last"]-left["first"] >= 15:
                zoom = plan_zoom_cuts([left, right])[0]
                zooms.append({**zoom, "shotIndex": i})
            continue
        if min(left["last"]-left["first"], right["last"]-right["first"]) < 15:
            continue
        # Within one continuous take, arrive and depart at the same scale and
        # center. The accent changes camera motion, without a punch-cut.
        length = left["last"]-left["first"]
        origin = (1-1/scale)/2
        ramp = {"scale": scale, "left": origin, "top": origin}
        zooms.extend([{**ramp, "shotIndex": i, "firstFrame": length-10, "lastFrame": length-1},
                      {**ramp, "shotIndex": i+1, "firstFrame": 0, "lastFrame": 9, "reverse": True}])
    return zooms


def apply_genre(plan, decision, *, verified_audio):
    from studio_emotion import dynamic_pulses, sad_transition_mode

    style = decision["style"]
    motion = style["motion"]
    plan.update(emotion=decision["emotion"], genreStyle=style, transitionApplied=motion, fade=0)
    if motion == "guarded-dissolve":
        plan["transitionApplied"] = sad_transition_mode(plan["shots"])
        if verified_audio is not None and plan["transitionApplied"] == "aligned-cross-dissolve":
            # The overlap could change separately verified source audio offsets.
            plan["transitionApplied"] = "dip-without-overlap"
        if plan["transitionApplied"] == "dip-without-overlap":
            plan["dipCenters"] = [b["record"] for a, b in zip(plan["shots"], plan["shots"][1:])
                                  if min(a["last"]-a["first"], b["last"]-b["first"]) >= 18]
    if motion in ("zoom-to-cut", "accent-zooms"):
        from studio_beat_sync import musical_peaks, snap_events

        music = next((bed for bed in plan["audioBeds"] if bed["role"] == "music"), None)
        # A dance kick and its intervening hi-hat count as one primary beat.
        spacing = .32 if motion == "accent-zooms" else .18
        peaks = musical_peaks(music["path"], duration=plan["frames"]/30, min_spacing=spacing) if music else []
        music_only = verified_audio is None and not any(s["audio"] for s in plan["shots"])
        if peaks and music_only:
            events = snap_events(plan, peaks, max_shift=.9)
            for shot in plan["shots"]:
                source = probe_video(shot["path"])
                if shot["last"] > round(float(source["format"]["duration"])*30):
                    raise ValueError("The beat-aligned cut exceeds available source handles")
        else:
            events = []
        plan["beatSync"] = {"peaksSec": [p[0] for p in peaks], "events": events,
                            "verifiedProgramTimingPreserved": not music_only}
        if motion == "zoom-to-cut":
            plan["zoomToCuts"] = plan_zoom_cuts(plan["shots"])
        elif motion == "accent-zooms":
            if peaks:
                plan["shots"] = dynamic_pulses(plan, peaks, style=style)
            plan["zoomToCuts"] = dynamic_zooms(plan["shots"], style["accentZoom"])
    if motion == "slow-push":
        scale = 1.035
        plan["zoomToCuts"] = [
            {"shotIndex": i, "scale": scale, "left": (1-1/scale)/2, "top": (1-1/scale)/2,
             "firstFrame": 0, "lastFrame": shot["last"]-shot["first"]-1}
            for i, shot in enumerate(plan["shots"]) if shot["last"]-shot["first"] > 1
        ]
    for cue in plan["captions"]:
        cue["fadeInFrames"] = round(style["titleMs"]*.03) if style["titleMotion"] == "fade" else 0
        cue["zoomFrames"] = round(style["titleMs"]*.03)
        cue["motion"] = style["titleMotion"]


def render_attempt(timeline, captions, decision, staging, output, *, assets=None, verified_audio=None, name="studio.mp4"):
    output = output.resolve()
    output.mkdir()
    if name not in {"studio.mp4", "PERSONA_READY_FOR_SHOOT.mp4", "PERSONA_DYNAMIC_SOFT.mp4"}:
        raise ValueError("Unsupported output name")
    plan = edit_decisions(timeline, captions, decision, staging.resolve(), output, verified_audio=verified_audio)
    plan["audioBeds"] = prepare_audio(plan, decision, assets or {}, output, verified_audio=verified_audio)
    if decision.get("beatSync"):
        if (verified_audio is not None or any(shot["audio"] for shot in plan["shots"])
                or len(plan["audioBeds"]) != 1 or plan["audioBeds"][0]["role"] != "music"):
            raise ValueError("Beat Sync requires a music-only visual edit; it cannot move speech")
        from studio_beat_sync import musical_peaks, snap_events

        music = plan["audioBeds"][0]["path"]
        peaks = musical_peaks(music, duration=plan["frames"]/30)
        events = snap_events(plan, peaks)
        for shot in plan["shots"]:
            duration = float(probe_video(shot["path"])["format"]["duration"])
            if shot["last"] > round(duration*30):
                raise ValueError("Beat Sync requires more source handles at an edit")
        plan["beatSync"] = {"peaksSec": [p[0] for p in peaks], "events": events}
        for cue in plan["captions"]:
            cue["fadeInFrames"] = 0
            cue["zoomFrames"] = 6
        plan["fade"] = 0
    if decision.get("matchOnAction"):
        if not decision.get("beatSync") or len(plan["shots"]) < 2:
            raise ValueError("Match on Action requires at least two synchronized visual shots")
        from studio_match_action import match_on_action
        plan["matchOnAction"] = match_on_action(plan)
    if decision.get("zoomToCut"):
        if not decision.get("beatSync") or len(plan["shots"]) < 2:
            raise ValueError("Zoom-to-Cut requires at least two music-aligned shots")
        plan["zoomToCuts"] = plan_zoom_cuts(plan["shots"])
    if "style" in decision:
        apply_genre(plan, decision, verified_audio=verified_audio)
    if "stylepack" in decision:
        plan = apply_to_edit_plan(plan, decision["stylepack"])
    if active_pack(plan):
        prepare_beat_sync(plan)
    plan["skinToneProtection"] = False
    approved_cues = []
    for i, cue in enumerate(plan["captions"]):
        row = {"startMs": round(cue["first"]*1000/30), "endMs": round(cue["last"]*1000/30), "text": cue["text"]}
        motion = cue.get("motion")
        if motion == "fade":
            row["fadeMs"] = decision["style"]["titleMs"]
        elif motion == "fly-in":
            row["motion"] = motion
        if motion == "zoom" or decision.get("beatSync"):
            row["kinetic"] = True
            if "keywords" in captions[i]:
                row["keywords"] = captions[i]["keywords"]
        approved_cues.append(row)
    return render_prepared_plan(plan, output, approved_cues=approved_cues, name=name,
                                save_graph=decision.get("beatSync") or "style" in decision)


def render_prepared_plan(plan, output, *, approved_cues=None, name="studio.mp4", save_graph=False):
    if approved_cues is None:
        if active_pack(plan):
            prepare_beat_sync(plan)
        approved_cues = [{"startMs": round(cue["first"]*1000/30), "endMs": round(cue["last"]*1000/30),
                          "text": cue["text"]} for cue in plan["captions"]]
    plan.setdefault("skinToneProtection", False)
    pack = active_pack(plan)
    target_lufs = next((bed["targetLufs"] for bed in plan["audioBeds"] if "targetLufs" in bed), None)
    with TemporaryDirectory(prefix=".ffmpeg-", dir=output) as temp:
        working = Path(temp)
        remaining, used_fonts = write_graphics(plan, working, approved_cues) if pack else (range(len(approved_cues)), set())
        baseline_cues = [approved_cues[i] for i in remaining]
        font = build_ass(baseline_cues, output / "captions.ass", working) if baseline_cues else None
        if font:
            used_fonts.add(font)
            add_title_bounds([plan["captions"][i] for i in remaining], working)
        has_style_titles = (working / "stylepack.ass").is_file()
        if has_style_titles:
            with (output / "stylepack.ass").open("xb") as stream:
                stream.write((working / "stylepack.ass").read_bytes())
        intermediate = working / "verified.mp4"

        def render_ffmpeg(edit_plan, destination):
            inputs, graph = ffmpeg_graph(edit_plan, working, captions=bool(baseline_cues),
                                         stylepack_graphics=has_style_titles)
            log = run_ffmpeg(["-hide_banner", "-xerror", "-filter_complex_threads", "2",
                              *inputs, "-filter_complex", graph, "-map", "[video]", "-map", "[audio]",
                              "-t", f'{edit_plan["frames"]/30:.9f}', "-c:v", "libx264", "-preset", "fast",
                              "-crf", "17", "-threads", "4", "-c:a", "aac", "-b:a", "192k",
                              "-movflags", "+faststart", str(destination)], cwd=working)
            if used_fonts:
                selections = [line.split("->")[-1] for line in log.splitlines() if "fontselect:" in line]
                if (not all(any(font in line for line in selections) for font in used_fonts)
                        or not all(any(font in line for font in used_fonts) for line in selections)):
                    raise RuntimeError("libass did not confirm the expected subtitle fonts")
            verify_render(destination, edit_plan["frames"], target_lufs=target_lufs, output=output)
            return graph

        renderer, graph = render_edit_plan(plan, intermediate, render_ffmpeg)
        plan.update(renderer)
        if save_graph or pack:
            (output / "ffmpeg-filter.txt").write_text(graph + "\n", encoding="utf-8")
        (output / "EDL.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        final = output / name
        # The private staging directory has a restrictive ACL on Windows.
        with intermediate.open("rb") as source, final.open("xb") as target:
            shutil.copyfileobj(source, target)
        return final


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--lut", type=Path, required=True, help="Humble .cube file")
    parser.add_argument("--music", type=Path, help="An explicitly selected track")
    parser.add_argument("--emotion", choices=("auto", "sad", "epic", "dynamic", "calm"),
                        help="Use Vision or run an explicitly selected genre comparison")
    parser.add_argument("--music-dir", type=Path, help="Local named mood tracks")
    parser.add_argument("--music-fallback", type=Path, help="Approved track if no filename matches")
    parser.add_argument("--beat-sync", action="store_true")
    parser.add_argument("--zoom-to-cut", action="store_true",
                        help="Match face scale with a half-second push-in before each synchronized cut")
    parser.add_argument("--match-on-action", action="store_true",
                        help="Send selected still frames to OpenRouter Vision to evaluate cut continuity")
    parser.add_argument("--second-video", type=Path)
    parser.add_argument("--second-start", type=float, default=1/30)
    parser.add_argument("--cut-sec", type=float, default=5)
    parser.add_argument("--title-at", type=float)
    parser.add_argument("--keyword", action="append")
    parser.add_argument("--stylepack", type=Path, help="JSON selection of StylePack effects (opt-in)")
    parser.add_argument("--output-dir", type=Path, required=True, help="A new directory")
    parser.add_argument("--output-name", default="PERSONA_READY_FOR_SHOOT.mp4",
                        choices=("PERSONA_READY_FOR_SHOOT.mp4", "PERSONA_DYNAMIC_SOFT.mp4"))
    parser.add_argument("--start", type=float, default=1/30)
    parser.add_argument("--seconds", type=float, default=10)
    parser.add_argument("--title", default="Бюджет только на\nодного")
    args = parser.parse_args()
    source = args.video.resolve(strict=True)
    second = args.second_video.resolve(strict=True) if args.second_video else None
    sources = [source, second] if second is not None else [source]
    mood_report = None
    if args.match_on_action:
        from studio_providers import load_local_env
        load_local_env()
    if args.emotion:
        from studio_emotion import choose_music
        from studio_music_matching import classify_mood
        from studio_providers import load_local_env
        from studio_references import default_reference_root

        load_local_env()
        mood_report = (classify_mood(sources) if args.emotion == "auto"
                       else {"mood": args.emotion, "provider": "explicit-comparison"})
        library = args.music_dir or default_reference_root() / "audio_ref/music"
        if args.music:
            music = args.music.resolve(strict=True)
            mood_report["music"] = {"file": music.name, "selection": "explicit-track"}
        else:
            music, info = choose_music(mood_report["mood"], library,
                                       args.output_dir.resolve().with_name(args.output_dir.name+"-sound"))
            mood_report["music"] = info
    elif args.music:
        music = args.music.resolve(strict=True)
    elif args.beat_sync:
        from studio_music_matching import classify_mood, match_track
        from studio_providers import load_local_env
        from studio_references import default_reference_root

        load_local_env()
        mood_report = classify_mood(sources)
        library = args.music_dir or default_reference_root() / "audio_ref/music"
        music, selection = match_track(mood_report["mood"], library, fallback=args.music_fallback)
        mood_report.update(track=music.name, selection=selection)
    else:
        parser.error("--music is required without Beat Sync")
    lut = args.lut.resolve(strict=True)
    if lut.name != LUT_NAMES["humble"]:
        parser.error("Expected the known Humble LUT filename")
    os.environ["PERSONA_STUDIO_LUT_DIR"] = str(lut.parent)
    if second and (second.parent != source.parent or not 0 < args.cut_sec < args.seconds):
        parser.error("Both clips must be in the same staging directory with a valid cut time")
    clips = [{"path": str(source), "startSec": args.start,
              "durationSec": args.cut_sec if second else args.seconds, "muteSourceAudio": True}]
    if second:
        clips.append({"path": str(second), "startSec": args.second_start,
                      "durationSec": args.seconds-args.cut_sec, "muteSourceAudio": True})
    timeline = {"mode": "strict", "width": 1080, "height": 1920, "fps": 30, "clips": clips}
    title_sec = args.title_at if args.title_at is not None else 1.5 if args.beat_sync else .5
    start = round(title_sec*1000)
    title_end = min(start + 2400, round(args.seconds*1000))
    captions = [{"startMs": start, "endMs": title_end, "text": args.title}]
    if args.keyword:
        captions[0]["keywords"] = args.keyword
    decision = {"lut": "humble", "transition": "cut", "music": "ambient", "musicAsset": "music-pilot",
                "beatSync": args.beat_sync, "matchOnAction": args.match_on_action,
                "zoomToCut": args.zoom_to_cut}
    if args.emotion:
        from director_agent import direct_emotion
        decision = direct_emotion(mood_report, music_asset="music-pilot", lut_options=available_luts())
    if args.stylepack and stylepack_enabled():
        decision["stylepack"] = json.loads(args.stylepack.read_text(encoding="utf-8"))
    video = render_attempt(timeline, captions, decision, source.parent, args.output_dir,
                           assets={"music-pilot": music}, name=args.output_name)
    if mood_report:
        (video.parent / ("EMOTION.json" if args.emotion else "MUSIC-MATCH.json")).write_text(json.dumps(mood_report, ensure_ascii=False, indent=2),
                                                       encoding="utf-8")
    print(video)



if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
