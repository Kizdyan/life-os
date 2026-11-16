import json
from pathlib import Path
import subprocess
import sys
from unittest import TestCase, main

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lighting_planner import CONTRACT, plan_lighting, render_text

class LightingPlannerTests(TestCase):
    def test_piano_and_quiet_luxury_three_point_setup(self):
        plan = plan_lighting("Актёр за пианино")
        self.assertEqual(plan["preset"], "piano")
        self.assertEqual(plan["style"], "Quiet Luxury")
        self.assertIn("45°", plan["key"])
        self.assertIn("отражатель", plan["fill"])
        self.assertIn("позади", plan["back"])
        self.assertIn("клавиш", plan["background"])
        self.assertIn("Рисующий (Key)", render_text(plan))
        self.assertIn("Заполняющий (Fill)", render_text(plan))
        self.assertIn("Контровой (Back)", render_text(plan))
        self.assertEqual(plan["source"], "rules-v1")

    def test_real_reel01_scene_uses_piano_profile(self):
        source = json.loads((CONTRACT.parent / "persona-architect-ten-reels.json").read_text(encoding="utf-8"))
        reel = source[0]
        self.assertEqual(reel["id"], "reel-01")
        result = plan_lighting(reel["mainShots"].split(".")[0])
        self.assertEqual(result["preset"], "piano")
        self.assertIn("лицо, и руки", result["key"])

    def test_generic_is_not_fake_measurement(self):
        plan = plan_lighting("Человек открывает дверь")
        self.assertEqual(plan["preset"], "general")
        self.assertIn("не анализ реального видео", plan["evidence"])
        self.assertNotIn("камера измерила", render_text(plan))

    def test_cli_json_and_text(self):
        path = Path(__file__).resolve().parent / "lighting_planner.py"
        result = subprocess.run([sys.executable, str(path), "--scene", "Актёр за пианино", "--json"], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), plan_lighting("Актёр за пианино"))
        result = subprocess.run([sys.executable, str(path), "--scene", "Актёр за пианино"], capture_output=True, text=True, check=True)
        self.assertIn("Контровой (Back)", result.stdout)

    def test_rejects_unusable_input(self):
        with self.assertRaises(ValueError):
            plan_lighting("    ")
        with self.assertRaises(ValueError):
            plan_lighting("a" * 5001)

if __name__ == "__main__":
    main()
