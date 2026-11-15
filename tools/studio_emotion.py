"""Apply one genre profile and choose only local, explicitly tagged music."""
from array import array
import json
import math
from pathlib import Path
import sys
import wave

from studio_music_matching import NoMoodTrack, match_track

MOOD_MATRIX = json.loads(Path(__file__).with_name("studio-emotion-matrix.json").read_text(encoding="utf-8"))
MUSIC_WARNING = "ВНИМАНИЕ: музыка не совпадает по жанру"


def emotion_direction(emotion, *, provider, music_asset):
    if emotion not in MOOD_MATRIX:
        raise ValueError(f"Unknown studio emotion: {emotion}")
    style = MOOD_MATRIX[emotion]
    return {"emotion": emotion, "style": style, "provider": provider, "lut": "humble",
            "transition": "cut", "subtitles": "cinematic", "music": style["music"],
            "musicAsset": music_asset,
            "reason": f"Genre {emotion}: {style['motion']}; music target {style['targetLufs']} LUFS."}


def sad_transition_mode(shots):
    # The overlap is safe only when both sides supply the same source frames at
    # the same timeline position. Distinct portrait takes never overlap.
    if len(shots) < 2:
        return "none"
    if all(a["path"] == b["path"] and a["last"] == b["first"]
           and a["last"]-a["first"] >= 18 and b["last"]-b["first"] >= 18
           for a, b in zip(shots, shots[1:])):
        return "aligned-cross-dissolve"
    return "dip-without-overlap"


def dynamic_pulses(plan, peaks, *, style=None):
    style = style or MOOD_MATRIX["dynamic"]
    minimum = round(style["minShotSec"]*30)
    target = round(style["targetShotSec"]*30)
    strengths = {}
    for time, prominence in peaks:
        frame = round(time*30)
        strengths[frame] = max(prominence, strengths.get(frame, 0))
    pulse_shots = []
    for shot in plan["shots"]:
        start = shot["record"]
        length = shot["last"]-shot["first"]
        end = start+length
        desired = max(1, min(round(length/target), length//minimum))
        boundaries = [start]
        for index in range(1, desired):
            anchor = start+round(length*index/desired)
            left = max(boundaries[-1]+minimum, anchor-15)
            right = min(end-minimum, anchor+15)
            candidates = [frame for frame in strengths if left <= frame <= right]
            if candidates:
                boundaries.append(max(candidates, key=lambda frame: (strengths[frame], -abs(frame-anchor), -frame)))
        boundaries.append(end)
        for a, b in zip(boundaries, boundaries[1:]):
            first = shot["first"] + a-start
            pulse_shots.append({**shot, "first": first, "last": first+b-a, "record": a})
    return pulse_shots


def write_placeholder(path, mood):
    # Compact, explicitly provisional local score; no external samples.
    bpm, notes = {"sad": (64, (196, 233.08, 293.66, 174.61)),
                  "epic": (96, (130.81, 155.56, 196, 116.54)),
                  "dynamic": (138, (146.83, 185, 220, 164.81)),
                  "calm": (60, (220, 261.63, 329.63, 196))}[mood]
    rate, length = 24000, 12
    output = array("h")
    for i in range(rate * length):
        t = i/rate
        clock = t*bpm/60
        beat = int(clock)
        u = (clock-beat)*60/bpm
        freq = notes[beat % len(notes)]
        attack = min(1, u/.012)
        piano = (math.sin(math.tau*freq*u)+.28*math.sin(math.tau*freq*2*u)) * attack * math.exp(-4*u)
        if mood == "epic":
            body = .24*math.sin(math.tau*freq/2*u)*math.exp(-4.4*u)*attack
            pulse = .15*math.sin(math.tau*(68*u-32*u*u))*math.exp(-18*u)*attack
            sample = .36*piano + body + pulse
        elif mood == "dynamic":
            body = .26*math.sin(math.tau*freq/2*u)*math.exp(-9*u)*attack
            kick = .29*math.sin(math.tau*(84*u-52*u*u))*math.exp(-20*u)*attack
            off = max(0., u-30/bpm)
            hat = .065*math.sin(math.tau*4090*off)*math.exp(-110*off)
            sample = .23*piano + body + kick + hat
        else:
            sample = (.32 if mood == "sad" else .27)*piano
        output.append(round(27000*sample))
    if sys.byteorder != "little":
        output.byteswap()
    with wave.open(str(path), "wb") as stream:
        stream.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        stream.writeframes(output.tobytes())


def choose_music(mood, library, output, *, fallback=None):
    try:
        track, method = match_track(mood, library, fallback=fallback)
        details = {"file": track.name, "selection": method}
        if method == "explicit-fallback":
            print(MUSIC_WARNING, file=sys.stderr, flush=True)
            details["warning"] = MUSIC_WARNING
        return track, details
    except NoMoodTrack:
        output.mkdir(parents=True, exist_ok=True)
        track = output / f"provisional-{mood}.wav"
        write_placeholder(track, mood)
        print(MUSIC_WARNING, file=sys.stderr, flush=True)
        return track, {"file": track.name, "selection": "generated-placeholder", "warning": MUSIC_WARNING}
