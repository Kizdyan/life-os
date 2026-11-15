import unittest
from io import BytesIO
from unittest.mock import patch

from studio_producer import make_hooks, make_shot_list, make_social_copy


class StudioProducerTest(unittest.TestCase):
    def test_hooks_send_only_the_source_text_and_keep_three_named_tones(self):
        generated = {"intrigue":"Не пропусти этот переход", "direct":"Вот где рождается тема", "question":"Слышишь новую тему?"}
        with patch("studio_producer.ask", return_value={"provider": "openrouter", "model": "free", "value": generated}) as ask:
            result = make_hooks("Вот в эту секунду родилась музыка")
        self.assertIn("родилась музыка", ask.call_args.args[0])
        self.assertEqual(ask.call_args.args[1], [])
        self.assertEqual(result["hooks"], generated)
        self.assertTrue(ask.call_args.kwargs["validate"](generated))
        self.assertFalse(ask.call_args.kwargs["validate"]({**generated,"question":"Вот где рождается тема?"}))

    def test_text_response_can_run_longer_than_a_vision_request(self):
        from studio_providers import ask
        body = b'{"choices":[{"finish_reason":"stop","message":{"content":"{}"}}]}'
        with patch("studio_providers.build_opener") as opener, \
                patch("studio_providers.monotonic", side_effect=[0, 27, 27]):
            opener.return_value.open.return_value = BytesIO(body)
            reply = ask("text", [], {"type": "object"}, env={"OPENROUTER_API_KEY": "test"}, prefer="openrouter")
        self.assertEqual(reply["value"], {})

    def test_shot_list_keeps_timing_and_writes_a_checklist(self):
        plan = {
            "title": "Надежда через тревогу", "hook": "Рука замирает над клавишей",
            "wardrobe": "Матовый тёмный свитер", "light": "Лампа слева на уровне глаз",
            "music": "От разрозненных нот к мотиву", "shots": [
                {"framing": "крупный" if i % 2 else "средний", "durationSec": 3,
                 "action": f"Действие {i}"} for i in range(1, 6)
            ],
        }
        with patch("studio_producer.ask", return_value={"provider": "openrouter", "model": "free", "value": plan}):
            result = make_shot_list("Надежда через тревогу")
        self.assertEqual(result["plan"]["shots"][-1]["endSec"], 15)
        self.assertIn("- [ ] 5.", result["markdown"])
        self.assertIn("Лампа слева", result["markdown"])
        camera, body = result["markdown"].split("# Надежда через тревогу", 1)
        self.assertTrue(camera.startswith("## НАСТРОЙКИ КАМЕРЫ (iPhone)\n"))
        for setting in ("4K, 60 fps", "HEVC", "HDR: ВЫКЛЮЧИТЬ", "Баланс белого: ЗАБЛОКИРОВАТЬ"):
            self.assertIn(setting, camera)
        export = body.split("## НАСТРОЙКИ ЭКСПОРТА (CapCut)\n", 1)[1]
        self.assertIn("Улучшение ИИ", export)
        self.assertIn("Автоматический HDR", export)
        self.assertTrue(export.rstrip().endswith("Экспорт: 4K, 60 fps"))

    def test_social_copy_sends_only_one_image_then_a_text_prompt(self):
        tags = [f"#тема{i}" for i in range(11)]
        value = {key: {"hook": f"Первая строка {key}", "body": "Крупный план и пауза.", "hashtags": tags}
                 for key in ("tiktok", "instagram", "vk")}
        answers = [{"value": {"scene": "Крупный план у светлой стены"}, "model": "vision", "cache": "hit"},
                   {"value": value, "model": "text"}]
        with patch("studio_producer.capture_frame", return_value=(5, b"jpeg")), \
                patch("studio_producer.ask", side_effect=answers) as ask:
            result = make_social_copy("video.mp4", "Одна эмоция")
        self.assertEqual(ask.call_args_list[0].args[1], [b"jpeg"])
        self.assertEqual(ask.call_args_list[1].args[1], [])
        self.assertIn("Крупный план у светлой стены", ask.call_args_list[1].args[0])
        self.assertEqual(len(result["platforms"]["instagram"]["hashtags"]), 11)
        self.assertEqual(result["platforms"]["instagram"]["caption"].count("#"), 5)
        self.assertFalse(result["publicationApproved"])
        self.assertFalse(result["trendVerified"])

    def test_failed_vision_does_not_run_text_model(self):
        from studio_providers import ProviderError
        with patch("studio_producer.capture_frame", return_value=(5, b"jpeg")), \
                patch("studio_producer.ask", side_effect=ProviderError("openrouter", 429, "http_error")) as ask:
            with self.assertRaises(ProviderError):
                make_social_copy("video.mp4", "Одна эмоция")
        self.assertEqual(ask.call_count, 1)
