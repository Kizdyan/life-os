import unittest

from beatsync_adapter import edl_to_edit_plan, plan_cinematic_calm


class BeatsyncAdapterTests(unittest.TestCase):
    def test_upstream_edl_is_rebased_to_the_first_beat_with_approved_soundtrack_offset(self):
        edl = {"audio_source": "score.wav", "audio_segment": {"start": 12},
               "timeline_duration": 10.5, "edits": [
                   {"timeline_start": .5, "timeline_end": 4.5, "clip_source": "take.mp4",
                    "clip_start": 20, "clip_end": 24, "clip_duration": 4},
                   {"timeline_start": 4.5, "timeline_end": 10.5, "clip_source": "take.mp4",
                    "clip_start": 26, "clip_end": 32, "clip_duration": 6},
               ]}
        plan = edl_to_edit_plan(edl, {"take.mp4": 60}, soundtrack="score.wav", soundtrack_duration=30)
        self.assertEqual([(s["first"], s["last"], s["record"], s["audio"]) for s in plan["shots"]],
                         [(600, 720, 0, 0), (780, 960, 120, 0)])
        self.assertEqual(plan["frames"], 300)
        self.assertEqual(plan["audioBeds"][0]["startSec"], 12.5)
        self.assertFalse(plan["distributionAllowed"])
        edl["edits"][1]["timeline_start"] = 5
        with self.assertRaisesRegex(ValueError, "gap"):
            edl_to_edit_plan(edl, {"take.mp4": 60}, soundtrack="score.wav", soundtrack_duration=30)

    def test_edl_cannot_access_an_unapproved_source(self):
        bad = {"timeline_duration": 10, "edits": [
            {"timeline_start": 0, "timeline_end": 10, "clip_source": "outside.mp4", "clip_start": 0,
             "clip_end": 10, "clip_duration": 10},
        ]}
        with self.assertRaisesRegex(ValueError, "approved source"):
            edl_to_edit_plan(bad, {"take.mp4": 60})

    def test_calm_produces_non_overlapping_phrase_candidates_and_respects_long_takes(self):
        openings = (20, 100, 180, 260, 340)
        beatmap = {"duration": 400, "tempo": 120, "beats": [i*.5 for i in range(1, 800)],
                   "energy_curve": [{"time": i*.1, "energy": .65 if any(
                       a <= i*.1 < a+32 for a in openings) else .02} for i in range(4000)]}
        locked = [(24, 47), (104, 127), (184, 207), (264, 287), (344, 367)]
        clips = plan_cinematic_calm(beatmap, 400, count=5, protected=locked)
        self.assertEqual(len(clips), 5)
        for i, clip in enumerate(clips):
            start, end = clip["startSec"], clip["endSec"]
            self.assertTrue(18 <= end-start <= 45)
            self.assertFalse(any(a < t < b for (a,b) in locked for t in (start,end)))
            if i:
                self.assertGreaterEqual(start, clips[i-1]["endSec"])
        with self.assertRaisesRegex(ValueError, "phrase"):
            plan_cinematic_calm({**beatmap, "beats": []}, 400, count=3)
