import json
import os
from pathlib import Path
import sys
from unittest import TestCase, main, mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import strategy_analyzer as analyzer

SAMPLE = {
    "title": "Последняя сцена",
    "sourceIdea": "Персонаж не знает, что это его последняя сцена.",
    "strategy": {key: "осмысленная профессиональная цель" for key in analyzer.KEYS},
    "scenes": [{"line": "Тишина.", "action": "Молчание у рояля", "durationSec": 3}],
}

class StrategyAnalyzerTests(TestCase):
    def test_seven_required_fields(self):
        self.assertEqual(analyzer.validate_input(SAMPLE), SAMPLE)
        with self.assertRaises(ValueError):
            analyzer.validate_input({**SAMPLE, "strategy": {**SAMPLE["strategy"], "delivery": ""}})

    def test_invalid_status_cannot_be_stored(self):
        with self.assertRaises(ValueError):
            analyzer.parse_result({"status": "UNVERIFIED", "recommendation": "Unknown"})
        self.assertEqual(analyzer.parse_result({"status": "WARNING", "recommendation": "Acting not demonstrated"})["status"], "WARNING")

    def test_no_api_key_never_invents_pass(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "", "OPENAI_API_KEY": ""}):
            with self.assertRaisesRegex(RuntimeError, "no strategy assessment"):
                analyzer.analyze(SAMPLE, "openai")

    def test_model_response_with_mocked_network_and_no_publication(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit):
                return json.dumps({"choices": [{"message": {"content": json.dumps({
                    "status": "WARNING", "recommendation": "Показать актёрскую реакцию в кадре."
                })}}]}).encode()
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "fake-test-only", "PERSONA_STRATEGY_MODEL": "test-model"}):
            with mock.patch.object(analyzer, "urlopen", return_value=Response()) as remote:
                result = analyzer.analyze(SAMPLE, "openai")
                self.assertTrue(remote.called)
                self.assertEqual(result["status"], "WARNING")
                self.assertFalse(result["publicationApproved"])
                self.assertFalse(result["editorialApproved"])
                self.assertEqual(len(result["sourceSha256"]), 64)

if __name__ == "__main__":
    main()
