import math
import struct
import tempfile
import wave
import unittest
from pathlib import Path

from studio_music_matching import match_track


class BeatSyncTests(unittest.TestCase):
    def test_named_track_matching_is_token_based_and_fallback_explicit(self):
        with tempfile.TemporaryDirectory() as root:
            library = Path(root) / "music"
            library.mkdir()
            (library / "saddle.mp3").touch()
            sad = library / "sad_piano.mp3"
            sad.touch()
            self.assertEqual(match_track("sad", library), (sad.resolve(), "filename-match"))
            self.assertEqual(match_track("epic", library, fallback=sad), (sad.resolve(), "explicit-fallback"))
            with self.assertRaisesRegex(ValueError, "No local"):
                match_track("calm", library)

    def test_scipy_detects_recorded_attacks_and_silence(self):
        from studio_beat_sync import musical_peaks

        rate = 12000
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "pulses.wav"
            starts = [0.5, 1.5, 2.5]
            audio = [0] * (rate * 3)
            for start in starts:
                for i in range(rate//15):
                    audio[round(rate*start)+i] = round(18000 * math.sin(2*math.pi*660*i/rate)*math.exp(-6*i/(rate//15)))
            with wave.open(str(path), "wb") as stream:
                stream.setparams((1, 2, rate, 0, "NONE", "not compressed"))
                stream.writeframes(struct.pack(f"<{len(audio)}h", *audio))
            peaks = musical_peaks(path, duration=3)
            self.assertEqual(len(peaks), len(starts))
            self.assertTrue(all(abs(actual[0]-expected) < .035 for actual, expected in zip(peaks, starts)))
            with wave.open(str(path), "wb") as stream:
                stream.setparams((1, 2, rate, 0, "NONE", "not compressed"))
                stream.writeframes(bytes(len(audio)*2))
            self.assertEqual(musical_peaks(path, duration=3), [])

    def test_cut_and_title_snap_to_same_render_frame_as_music(self):
        from studio_beat_sync import snap_events
        plan = {"frames": 300, "shots": [{"first": 0, "last": 150, "record": 0},
                                         {"first": 90, "last": 240, "record": 150}],
                "captions": [{"first": 43, "last": 110, "text": "Тест"}]}
        events = snap_events(plan, [(1.5, .8), (5.1, .6)])
        self.assertEqual([s["record"] for s in plan["shots"]], [0, 153])
        self.assertEqual([s["last"]-s["first"] for s in plan["shots"]], [153, 147])
        self.assertEqual((plan["captions"][0]["first"], plan["captions"][0]["last"]), (45, 112))
        self.assertEqual({(e["kind"],e["frame"]) for e in events}, {("cut", 153), ("caption", 45)})
