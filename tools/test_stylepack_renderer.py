import copy
import unittest
from unittest.mock import patch

from apply_stylepack import apply_to_edit_plan
from stylepack_renderer import load_catalog


class StylePackTests(unittest.TestCase):
    def setUp(self):
        self.plan = {"frames": 120, "shots": [
            {"path": "a.mp4", "first": 30, "last": 90, "record": 0, "audio": 1},
            {"path": "b.mp4", "first": 30, "last": 90, "record": 60, "audio": 1},
        ], "captions": [{"first": 10, "last": 40, "text": "ТРИ СЛОВА ЗДЕСЬ"}],
            "audioBeds": [], "lut": "", "lutMix": 0, "fade": 0}

    def test_catalog_contains_category_counts_and_flag_off_is_identity(self):
        catalog = load_catalog()
        self.assertEqual({group: len(items) for group, items in catalog["categories"].items()},
                         {"graphics": 8, "motion": 10, "color": 8, "audio": 4})
        with patch.dict("os.environ", {"PERSONA_STYLEPACK_V2_30": "0"}):
            self.assertIs(apply_to_edit_plan(self.plan, [{"id": "nonsense"}]), self.plan)

    def test_opt_in_validates_frames_and_secondary_sources_without_mutating_input(self):
        before = copy.deepcopy(self.plan)
        with patch.dict("os.environ", {"PERSONA_STYLEPACK_V2_30": "1"}):
            edited = apply_to_edit_plan(self.plan, [{"id": "split_screen", "first": 10, "last": 28, "sourceShot": 1}])
            self.assertEqual(edited["stylepack"]["effects"][0]["sourceShot"], 1)
            with self.assertRaisesRegex(ValueError, "sourceShot"):
                apply_to_edit_plan(self.plan, [{"id": "split_screen", "sourceShot": 7}])
            with self.assertRaisesRegex(ValueError, "frame"):
                apply_to_edit_plan(self.plan, [{"id": "film_grain", "first": 40, "last": 121}])
            with self.assertRaisesRegex(ValueError, "plain text"):
                apply_to_edit_plan(self.plan, [{"id": "animated_card", "text": r"{\pos(1,2)}"}])
        self.assertEqual(self.plan, before)

    def test_caption_replacement_rejects_partial_boundary_and_sidechain_requires_music(self):
        with patch.dict("os.environ", {"PERSONA_STYLEPACK_V2_30": "1"}):
            with self.assertRaisesRegex(ValueError, "caption"):
                apply_to_edit_plan(self.plan, [{"id": "typewriter", "first": 20, "last": 50}])
            with self.assertRaisesRegex(ValueError, "music"):
                apply_to_edit_plan(self.plan, [{"id": "sidechain_compression"}])
