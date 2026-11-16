import json
import sys
from pathlib import Path
from unittest import TestCase, main

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lighting_planner import plan_lighting
from strategy_analyzer import signaling_rule, KNOWLEDGE_BASE

class ArsenalKnowledgeTests(TestCase):
    def test_ten_rules_and_reliable_provenance(self):
        knowledge = json.loads(KNOWLEDGE_BASE.read_text(encoding="utf-8"))
        self.assertEqual(knowledge["version"], 1)
        self.assertEqual(len(knowledge["rules"]), 10)
        self.assertEqual(len({rule["id"] for rule in knowledge["rules"]}), 10)
        self.assertEqual(next(x["referenceId"] for x in knowledge["rules"] if x["id"] == "KB-08"), 138)
        self.assertIsNone(next(x["referenceId"] for x in knowledge["rules"] if x["id"] == "KB-09"))
        self.assertIn("competence", signaling_rule())

    def test_dramatic_and_interview_are_scene_specific(self):
        dramatic = plan_lighting("Драматичная сцена: герой прощается в тени")
        self.assertEqual(dramatic["preset"], "dramatic")
        self.assertEqual(dramatic["rule"], "KB-05")
        self.assertIn("контровой", dramatic["back"])
        interview = plan_lighting("Интервью о роли")
        self.assertEqual(interview["preset"], "interview")
        self.assertEqual(interview["rule"], "KB-06")
        self.assertIn("45°", interview["key"])
        self.assertNotEqual(dramatic["key"], interview["key"])

if __name__ == "__main__":
    main()
