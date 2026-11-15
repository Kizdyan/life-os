"""Render the opt-in StylePack on Persona's verified 30 fps EditPlan."""
import json
import os
from pathlib import Path
import re
import shutil
import unicodedata

ROOT = Path(__file__).resolve().parent
FLAG = "PERSONA_STYLEPACK_V2_30"
SFX_DIRECTORY = ROOT.parent / "assets" / "sfx"
FONT_FILES = {
    "Mont": ROOT / "subtitle-dynamic-interview-v1" / "Montserrat-ExtraBold.ttf",
    "Corm": ROOT / "subtitle-standard-v1" / "fonts" / "CormorantGaramond-Light.ttf",
}
LOOKS = {
    "scanned": "eq=contrast=1.11:saturation=.76:brightness=-.022",
    "brownie": "colorbalance=rs=.045:bs=-.055:rm=.035:bm=-.035",
    "quiet-luxury-soft": "eq=contrast=.94:saturation=.89:brightness=.019",
    "quiet-luxury-neutral": "eq=contrast=1.04:saturation=.94",
}
COLOR = {
    "film_grain": ("noise=alls=13:allf=t+u",),
    "vignette": ("vignette=PI/5",),
    "light_leak": (
        "drawbox=x=0:y=0:w=310:h=ih:color=0xFF8319@0.08:t=fill",
        "drawbox=x=0:y=0:w=170:h=ih:color=0xFFB851@0.12:t=fill",
        "drawbox=x=0:y=0:w=80:h=ih:color=0xFFE0A4@0.17:t=fill",
    ),
    "fog": ("gblur=sigma=1.8", "eq=contrast=.80:saturation=.78:brightness=.085"),
    "golden_hour": ("colorbalance=rs=.035:rh=.075:gh=.022:bh=-.06", "eq=saturation=1.08"),
    "fj400_film": ("colorbalance=gs=.023:rm=.021:bh=-.018",
                   "curves=all='0/0.035 .25/.23 .72/.75 1/.97'", "noise=alls=7:allf=t+u"),
    "selective_red": (
        "geq=lum='lum(X,Y)':"
        "cb='if(gt(cr(X,Y),max(146,cb(X,Y)+14)),cb(X,Y),128)':"
        "cr='if(gt(cr(X,Y),max(146,cb(X,Y)+14)),cr(X,Y),128)'",
    ),
}


def enabled():
    return os.environ.get(FLAG) == "1"


def load_catalog():
    return json.loads((ROOT / "StylePack.json").read_text(encoding="utf-8"))


def registry(catalog):
    return {item["id"]: {**item, "group": group}
            for group, entries in catalog["categories"].items() for item in entries}


def plain_text(value):
    if (not isinstance(value, str) or not value.strip() or len(value) > 240
            or re.search(r"[\\{}\x00-\x09\x0b-\x1f\x7f]", value)):
        raise ValueError("StylePack graphics require plain text (up to 240 characters)")
    return value.strip()


def active_pack(plan):
    """Do not read the catalog or modify the graph for an inactive flag."""
    return plan.get("stylepack") if enabled() else None


def wash(filters, picture, name, chain, window):
    """Gate a filter chain that does not support an FFmpeg timeline expression."""
    filters.extend([f"{picture}split=2[{name}a][{name}b]",
                    f"[{name}b]{chain},setsar=1,format=yuv444p[{name}fx]",
                    f"[{name}a][{name}fx]overlay=eof_action=pass:repeatlast=0:format=yuv444:"
                    f"enable='{window}'[{name}]"])
    return f"[{name}]"


def picture_layers(plan, inputs, filters, picture, before, input_index):
    pack = active_pack(plan)
    if not pack:
        return picture, input_index
    effects = pack["effects"]
    for i, effect in enumerate(effects):
        key, first, last = (effect[field] for field in ("id", "first", "last"))
        name = f"spc{i}"
        gate = f"between(n,{first},{last-1})"
        if key == "look":
            chain = (LOOKS[effect["variant"]],)
        elif key in COLOR:
            chain = COLOR[key]
        else:
            continue
        filters.append(picture + ",".join(f"{op}:enable='{gate}'" for op in chain) + f"[{name}]")
        picture = f"[{name}]"
    for i, effect in enumerate(effects):
        key, first, last = (effect[field] for field in ("id", "first", "last"))
        name = f"spv{i}"
        if key == "before_after":
            filters.append(f"{before}crop=w=540:h=1920:x=0:y=0[{name}before]")
            filters.append(f"{picture}[{name}before]overlay=x=0:y=0:format=yuv444:"
                           f"enable='gte(n,{first})*lt(n,{last})'[{name}]")
            picture = f"[{name}]"
        elif key in {"punch_zoom", "slow_push_in", "micro_shake_glitch", "whip_pan", "freeze_frame"}:
            frames = last - first
            window = f"gte(t,{first/30:.9f})*lt(t,{last/30:.9f})"
            if key in {"punch_zoom", "slow_push_in"}:
                attack = max(1, min(5, frames//3)) if key == "punch_zoom" else max(1, frames*4//5)
                release = max(1, min(8, frames-attack))
                ramp = f"max(0,min(1,min((on-{first})/{attack},({last-1}-on)/{release})))"
                zoom = f"1+{effect['scale']-1:.5f}*{ramp}"
                chain = (f"zoompan=z='{zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':"
                         "d=1:s=1080x1920:fps=30")
            elif key == "micro_shake_glitch":
                chain = ("scale=1116:1984,crop=1080:1920:'18+11*sin(t*89)':'32+12*cos(t*137)',"
                         "chromashift=cbh=7:crh=-7")
            elif key == "whip_pan":
                offset = f"max(0,min(1,(t-{first/30:.9f})/({frames/30:.9f})))"
                chain = f"scale=1216:2160,crop=1080:1920:'4+128*{offset}':120,gblur=sigma=22:sigmaV=1"
            else:
                chain = (f"trim=start_frame={first}:end_frame={first+1},setpts=PTS-STARTPTS,"
                         f"tpad=stop_mode=clone:stop={frames-1},setpts=PTS+{first}/(30*TB)")
            picture = wash(filters, picture, name, chain, window)
        elif key == "flash_cut":
            filters.append(f"{picture}eq=brightness=.26:contrast=.94:"
                           f"enable='between(n,{first},{last-1})'[{name}]")
            picture = f"[{name}]"
        elif key in {"split_screen", "picture_in_picture"}:
            split = key == "split_screen"
            w, h = (540, 960) if split else (342, 608)
            shot = plan["shots"][effect["sourceShot"]]
            inputs.extend(["-ss", f"{shot['first']/30:.9f}", "-i", shot["path"]])
            filters.append(f"[{input_index}:v]fps=30,trim=end_frame={last-first},"
                           f"scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                           f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv444p,"
                           f"setpts=PTS-STARTPTS+{first}/(30*TB)[{name}alt]")
            input_index += 1
            gate = f"gte(n,{first})*lt(n,{last})"
            if split:
                filters.extend([
                    f"{picture}split=2[{name}base][{name}left]",
                    f"[{name}base]drawbox=x=0:y=0:w=iw:h=ih:color=0x13151B:t=fill:enable='{gate}'[{name}matte]",
                    f"[{name}left]scale=540:960[{name}small]",
                    f"[{name}matte][{name}small]overlay=x=0:y=480:format=yuv444:enable='{gate}'[{name}first]",
                ])
                picture = f"[{name}first]"
            x, y = (540, 480) if split else (690, 1216)
            filters.append(f"{picture}[{name}alt]overlay=x={x}:y={y}:eof_action=pass:repeatlast=0:"
                           f"format=yuv444:enable='{gate}'[{name}]")
            picture = f"[{name}]"
    return picture, input_index


def audio_layers(plan, inputs, filters, tracks, input_index):
    pack = active_pack(plan)
    if not pack:
        return tracks
    effects = pack["effects"]
    labels = tracks.copy()
    if any(e["id"] == "sidechain_compression" for e in effects):
        program = [label for role, label in labels if role in {"speech", "program"}]
        music = [label for role, label in labels if role == "music"]
        if len(program) != 1 or len(music) != 1:
            raise ValueError("Sidechain requires separate speech and music tracks")
        filters.extend([
            f"{program[0]}asplit=2[spvoice][spkey]",
            f"{music[0]}[spkey]sidechaincompress=threshold=.032:ratio=8:attack=14:release=275[spduck]",
        ])
        labels = [(role, "[spvoice]" if label == program[0] else "[spduck]" if label == music[0] else label)
                  for role, label in labels]
    for i, effect in enumerate(effects):
        if "asset" not in effect:
            continue
        labels.append(("sfx", f"[spsound{i}]"))
        source = SFX_DIRECTORY / effect["asset"]
        if not source.is_file():
            raise FileNotFoundError(source)
        inputs.extend(["-i", str(source)])
        filters.append(f"[{input_index}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,"
                       f"atrim=duration={(effect['last']-effect['first'])/30:.9f},"
                       f"volume=-11dB,adelay={effect['first']*1600}S:all=1[spsound{i}]")
        input_index += 1
    return labels


def subtitle_time(frame):
    hundredths = (frame * 100) // 30
    seconds, cs = divmod(hundredths, 100)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02}:{seconds:02}.{cs:02}"


def ass_text(value):
    return plain_text(value).replace("\n", "\\N")


def caption_events(effect, first, last, text):
    key = effect["id"]
    body = ass_text(text) if key != "number_counter" else ""
    if key == "dynamic_captions":
        words = body.replace(r"\N", " ").upper().split()
        groups = [words[i:i+2] for i in range(0, len(words), 2)]
        if len(groups) > last-first:
            raise ValueError("Dynamic caption has fewer frames than word groups")
        keywords = {w.upper() for w in effect.get("keywords", [])} or {words[-1].strip(".,!?;:—«»")}
        def stylize(word):
            if word.strip(".,!?;:—«»") in keywords or any(char.isdecimal() for char in word):
                return r"{\c&H2012E3&\fs120}"+word+r"{\c&HFFFFFF&\fs95}"
            return word
        return [(first+(last-first)*i//len(groups), first+(last-first)*(i+1)//len(groups), "Mont",
                 r"{\pos(540,1229)\fs95\fscx90\fscy90\t(0,120,\fscx100\fscy100)}"
                 + " ".join(map(stylize, words))) for i, words in enumerate(groups)]
    if key == "typewriter":
        characters = []
        for char in text:
            if unicodedata.combining(char) and characters:
                characters[-1] += char
            else:
                characters.append(char)
        duration = min(last-first, len(characters))
        return [(first+i, last if i == duration-1 else first+i+1, "Mont",
                 r"{\pos(540,1229)}" + "".join(characters[:length]).replace("\n", r"\N")
                 + r"{\alpha&HFF&}" + "".join(characters[length:]).replace("\n", r"\N"))
                for i in range(duration) for length in [(i+1)*len(characters)//duration]]
    if key == "red_keywords":
        tokens = list(re.finditer(r"[^\W_]+(?:-[^\W_]+)*", text, re.UNICODE))
        if not tokens:
            raise ValueError("Red keyword captions require at least one word or digit")
        words = {word.casefold() for word in effect.get("keywords", [])} or {tokens[-1][0].casefold()}
        marked = re.sub(r"[^\W_]+(?:-[^\W_]+)*", lambda token:
                        r"{\c&H2012E3&}"+token[0]+r"{\c&HFFFFFF&}"
                        if token[0].casefold() in words else token[0], text)
        return [(first, last, "Mont", r"{\pos(540,1229)}" + marked.replace("\n", r"\N"))]
    if key == "editorial_quote":
        return [(first, last, "Corm", r"{\pos(540,1080)\i1\fad(145,100)}«"+body+"»")]
    if key == "animated_card":
        return [(first, last, "Card", r"{\move(540,1300,540,1190,0,270)\fad(120,90)}"+body)]
    if key == "growing_stamp":
        return [(first, last, "Mont",
                 r"{\pos(540,980)\frz-8\c&H3029BB&\fscx65\fscy65\t(0,185,\fscx115\fscy115)\t(185,320,\fscx100\fscy100)}"+body)]
    if key == "number_counter":
        origin, target = effect["from"], effect["to"]
        steps = min(last-first, 30, max(1, abs(target-origin)+1))
        return [(first+(last-first)*i//steps, first+(last-first)*(i+1)//steps, "Mont",
                 r"{\pos(540,960)\fs120\c&H2012E3&}"+str(
                     round(origin+(target-origin)*i/(steps-1)) if steps > 1 else target))
                for i in range(steps)]
    if key == "cinematic_title":
        return [(first, last, "Corm", r"{\pos(540,1320)\fsp6\fad(250,210)}"+body)]
    raise ValueError(f"Unknown StylePack graphic: {key}")


def write_graphics(plan, working, approved_cues):
    pack = active_pack(plan)
    remaining = list(range(len(approved_cues)))
    if not pack:
        return remaining, set()
    graphics = registry(load_catalog())
    events = []
    for effect in pack["effects"]:
        rule = graphics[effect["id"]]
        if rule["group"] != "graphics":
            continue
        if rule.get("mode") == "replace":
            for index, cue in enumerate(plan["captions"]):
                if effect["first"] <= cue["first"] and cue["last"] <= effect["last"]:
                    events += caption_events(effect, cue["first"], cue["last"], approved_cues[index]["text"])
                    remaining.remove(index)
        else:
            events += caption_events(effect, effect["first"], effect["last"], effect.get("text", ""))
    if not events:
        return remaining, set()
    fonts = working / "stylepack_fonts"
    fonts.mkdir()
    used_fonts = {"Mont" if name == "Card" else name for _, _, name, _ in events}
    for name in used_fonts:
        source = FONT_FILES[name]
        shutil.copyfile(source, fonts / source.name)
    style_fields = ("Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
                    "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
                    "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")
    lines = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920",
             "WrapStyle: 0", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]", "Format: "+style_fields,
             "Style: Mont,Montserrat ExtraBold,82,&H00FFFFFF,&H00000000,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,3,5,82,82,0,1",
             "Style: Corm,Cormorant Garamond Light,94,&H00A8DBE8,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,82,82,0,1",
             "Style: Card,Montserrat ExtraBold,75,&H00FFFFFF,&H00000000,&H28111328,&H00000000,0,0,0,0,100,100,0,0,3,19,0,5,90,90,0,1",
             "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    lines.extend(f"Dialogue: 0,{subtitle_time(first)},{subtitle_time(last)},{name},,0,0,0,,{body}"
                 for first, last, name, body in events)
    (working / "stylepack.ass").write_text("\n".join(lines)+"\n", encoding="utf-8")
    return remaining, {FONT_FILES[name].stem for name in used_fonts}
