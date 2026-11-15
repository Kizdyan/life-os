import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from studio_music_matching import classify_mood
from studio_providers import ProviderError, ask

from studio_emotion import MOOD_MATRIX, dynamic_pulses, sad_transition_mode


class EmotionAgentTests(unittest.TestCase):
    def test_provider_failure_selects_dynamic_and_reports_warning(self):
        with patch("studio_music_matching.probe_video", return_value={"format": {"duration": "10"}}), \
                patch("studio_music_matching._capture", return_value=b"\xff\xd8frame"), \
                patch("studio_music_matching.ask", side_effect=ProviderError("openrouter", 429, "rate_limit")):
            report = classify_mood([Path("clip.mp4")])
        self.assertEqual(report["mood"], "dynamic")
        self.assertEqual(report["provider"], "local-fallback")
        self.assertIn("Dynamic Soft", report["visionWarning"])

    def test_vision_cache_reuses_success_and_keeps_inputs_separate(self):
        with TemporaryDirectory() as root, patch("studio_providers._openrouter") as send:
            env = {"OPENROUTER_API_KEY": "test", "PERSONA_VISION_CACHE_DIR": root}
            send.return_value = {"mood": "sad", "reason": "dim light"}
            schema = {"type": "object"}
            first = ask("mood", [b"first"], schema, env=env, prefer="openrouter")
            self.assertEqual(first["cache"], "miss")
            send.side_effect = ProviderError("openrouter", 0, "network_unavailable")
            cached = ask("mood", [b"first"], schema, env=env, prefer="openrouter")
            self.assertEqual(cached["value"], first["value"])
            self.assertEqual(cached["cache"], "hit")
            with self.assertRaises(ProviderError):
                ask("mood", [b"changed"], schema, env=env, prefer="openrouter")
            send.side_effect = None
            self.assertEqual(ask("mood", [b"changed"], schema, env=env, prefer="openrouter")["cache"], "miss")

    def test_portrait_crop_keeps_right_aligned_face_and_rejects_incompatible_positions(self):
        from studio_face_crop import plan_crop
        face = [(0.76, 0.29, 0.14, 0.33)]
        plan = plan_crop(1920, 1080, [face] * 10)
        self.assertEqual(plan["mode"], "face-crop")
        left, top, width, height = plan["rect"]
        self.assertGreater(left, (1920-width)//2)
        self.assertLessEqual(left, 1920*.76)
        self.assertGreaterEqual(left+width, 1920*.90)
        self.assertLess(top, 1080*.29)
        self.assertGreater(top+height, 1080*.62)
        self.assertEqual(plan_crop(1920, 1080, [face, [(0.1, 0.27, 0.14, 0.33)]] * 5)["mode"], "fit")
        self.assertEqual(plan_crop(1920, 1080, [[]] * 10)["mode"], "fit")
    def test_moods_bind_transition_color_and_music(self):
        self.assertEqual(set(MOOD_MATRIX), {"sad", "epic", "dynamic", "calm"})
        self.assertEqual([MOOD_MATRIX[x]["motion"] for x in ("sad", "epic", "dynamic", "calm")],
                         ["guarded-dissolve", "zoom-to-cut", "accent-zooms", "slow-push"])
        self.assertTrue(all("lutMix" not in style for style in MOOD_MATRIX.values()))
        self.assertLess(MOOD_MATRIX["sad"]["targetLufs"], MOOD_MATRIX["epic"]["targetLufs"])

    def test_sad_rejects_overlap_between_distinct_takes(self):
        a = {"path": "medium.mp4", "first": 75, "last": 225, "record": 0}
        b = {"path": "close.mp4", "first": 56, "last": 206, "record": 150}
        self.assertEqual(sad_transition_mode([a, b]), "dip-without-overlap")
        self.assertEqual(sad_transition_mode([a, {**b, "path": a["path"], "first": 225, "last": 375}]),
                         "aligned-cross-dissolve")

    def test_dynamic_holds_at_least_two_seconds_and_prefers_strong_beats(self):
        plan = {"shots": [{"path": "a", "first": 75, "last": 225, "record": 0},
                          {"path": "b", "first": 56, "last": 206, "record": 150}], "frames": 300}
        peaks = [(t*.5, .4) for t in range(1, 20)] + [(2.7, .95), (7.25, .9)]
        shots = dynamic_pulses(plan, peaks)
        self.assertEqual([s["record"] for s in shots], [0, 81, 150, 218])
        self.assertEqual([s["first"] for s in shots], [75, 156, 56, 124])
        self.assertEqual(sum(s["last"]-s["first"] for s in shots), 300)
        self.assertGreaterEqual(min(s["last"]-s["first"] for s in shots), 60)

    def test_expected_dip_does_not_hide_missing_color_elsewhere(self):
        from critic_agent import technical_checks
        plan = {"frames": 300, "shots": [{"record": 0}, {"record": 150}], "captions": [],
                "transitionApplied": "dip-without-overlap", "dipCenters": [150]}
        pics = {"unlocatedFaceFrames": [148, 149, 151, 165], "colorJumps": [], "overlaps": [],
                "faceMissingFrames": [149], "blackFrames": [150]}
        checks, _ = technical_checks(plan, actual_frames=300, fps=30, pictures=pics)
        self.assertEqual(checks["whiteBalance"]["intentionalDipUnmeasurableFrames"], [148, 149, 151])
        self.assertEqual(checks["whiteBalance"]["status"], "UNVERIFIED")
        self.assertEqual(checks["blackFrames"]["status"], "FAIL")
