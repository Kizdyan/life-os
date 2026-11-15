from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from kinocut_render_adapter import render_edit_plan


class KinocutRenderAdapterTests(unittest.TestCase):
    def setUp(self):
        self.plan = {
            "shots": [{"path": "source.mp4", "first": 15, "last": 45, "record": 0, "audio": 1}],
            "frames": 30, "lut": "look.cube", "lutMix": 0.6, "captions": [{"text": "TEST"}],
        }

    def test_ffmpeg_default_never_starts_kinocut(self):
        with TemporaryDirectory() as temp, patch.dict("os.environ", {}, clear=True), \
                patch("kinocut_render_adapter.stage_kinocut_clips") as trim:
            path = Path(temp) / "verified.mp4"
            render = Mock(return_value="ffmpeg graph")
            result, graph = render_edit_plan(self.plan, path, render)
            trim.assert_not_called()
            render.assert_called_once_with(self.plan, path)
        self.assertEqual(result, {"renderer": "ffmpeg"})
        self.assertEqual(graph, "ffmpeg graph")

    def test_kinocut_rebases_trimmed_clip_and_keeps_grade_and_captions(self):
        with TemporaryDirectory() as temp, patch.dict("os.environ", {"PERSONA_RENDER_BACKEND": "kinocut"}), \
                patch("kinocut_render_adapter.stage_kinocut_clips", return_value=["trimmed.mp4"]):
            path = Path(temp) / "verified.mp4"
            render = Mock(return_value="ffmpeg graph")
            render_edit_plan(self.plan, path, render)
            plan, target = render.call_args.args
            self.assertEqual(plan["shots"][0], {"path": "trimmed.mp4", "first": 0, "last": 30,
                                                "record": 0, "audio": 1,
                                                "audioSource": {"path": "source.mp4", "first": 15}})
            self.assertEqual((plan["lut"], plan["lutMix"], plan["captions"]),
                             ("look.cube", 0.6, self.plan["captions"]))
            self.assertEqual(target, path)
            self.assertEqual(self.plan["shots"][0]["first"], 15)

    def test_failed_experimental_render_restores_original_plan(self):
        with TemporaryDirectory() as temp, patch.dict("os.environ", {"PERSONA_RENDER_BACKEND": "kinocut"}), \
                patch("kinocut_render_adapter.stage_kinocut_clips", return_value=["trimmed.mp4"]):
            path = Path(temp) / "verified.mp4"
            def render(plan, output):
                if plan is not self.plan:
                    output.write_bytes(b"invalid intermediate")
                    raise RuntimeError("render QA failed")
                self.assertFalse(output.exists())
                return "original graph"
            result, graph = render_edit_plan(self.plan, path, render)
        self.assertEqual(result["renderer"], "ffmpeg")
        self.assertIn("render QA failed", result["fallbackReason"])
        self.assertEqual(graph, "original graph")

    def test_transitions_that_require_source_handles_are_routed_to_ffmpeg(self):
        self.plan["transitionApplied"] = "aligned-cross-dissolve"
        with TemporaryDirectory() as temp, patch.dict("os.environ", {"PERSONA_RENDER_BACKEND": "kinocut"}), \
                patch("kinocut_render_adapter.stage_kinocut_clips") as trim:
            result, _ = render_edit_plan(self.plan, Path(temp) / "verified.mp4", Mock())
            trim.assert_not_called()
        self.assertEqual(result["renderer"], "ffmpeg")
        self.assertIn("handles", result["fallbackReason"])
