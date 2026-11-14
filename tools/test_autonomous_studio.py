import unittest
import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import HTTPError

from autonomous_loop import run_loop
from critic_agent import evaluate_video, select_cloud_provider, verdict
from studio_providers import DEFAULT_OLLAMA_VISION, DEFAULT_OPENROUTER_VISION, ProviderError, _gemini, _post, ask


class StudioTests(unittest.TestCase):
    def test_static_candidate_against_moving_reference_scores_two(self):
        report = {"scores": {"color": 9, "titles": 9, "composition": 8, "editing": 9},
                  "observations": "Comparison.",
                  "scoreEvidence": {name: "Frame evidence." for name in ("color", "titles", "composition", "editing")},
                  "checklist": [], "subtitleMotion": {"candidate": "static", "reference": "animated"}}
        candidate = ([0.1, 0.2], [b"candidate1", b"candidate2"])
        reference = ([0.1, 0.2], [b"reference1", b"reference2"])
        with TemporaryDirectory() as directory:
            video = Path(directory) / "output.mp4"
            video.write_bytes(b"fixture")
            ref = Path(directory) / "motion.mp4"
            with patch("critic_agent.sample_frames", side_effect=[candidate, reference]), patch(
                "critic_agent.contact_sheet", side_effect=[b"candidate-sheet", b"reference-sheet"]
            ), patch(
                "critic_agent.ask", return_value={"provider": "openrouter", "value": report}
            ) as request:
                review = evaluate_video(video, prefer="openrouter", references={"subtitle_ref": (ref,)})
            self.assertEqual(request.call_args.args[1], [b"candidate-sheet", b"reference-sheet"])
            self.assertIn("subtitle_ref", request.call_args.args[0])
        self.assertEqual(review["scores"]["titles"], 2)
        self.assertEqual(review["status"], "REJECTED")
        self.assertIn("Сделать анимацию текста как в референсе", review["checklist"])

    def test_resolve_splits_caption_into_word_pops_without_changing_cue_boundaries(self):
        from studio_resolve import edit_decisions
        with TemporaryDirectory() as directory:
            folder = Path(directory).resolve()
            path = folder / "take.mp4"
            path.touch()
            timeline = {"mode": "strict", "fps": 30, "width": 1080, "height": 1920, "clips": [
                {"path": str(path), "startSec": 0, "durationSec": 1},
                {"path": str(path), "startSec": 0, "durationSec": 1},
            ]}
            plan = edit_decisions(timeline, [{"startMs": 100, "endMs": 900, "text": "Бюджет на одного"}],
                                  {"lut": "none", "subtitles": "cinematic", "transition": "cut", "music": "none"},
                                  folder, folder / "attempt")
        self.assertEqual([(row["first"], row["last"], row["text"], row["accent"]) for row in plan["captions"]],
                         [(3, 6, "Бюджет", ""), (6, 9, "Бюджет на", ""), (9, 27, "Бюджет на", "одного")])

    def test_reviewed_program_audio_replaces_camera_audio_in_resolve_plan(self):
        from studio_resolve import edit_decisions
        with TemporaryDirectory() as directory:
            folder = Path(directory).resolve()
            path = folder / "take.mp4"
            path.touch()
            timeline = {"mode": "strict", "fps": 30, "width": 1080, "height": 1920, "clips": [
                {"path": str(path), "startSec": 0, "durationSec": 1, "audioTreatment": {"role": "music"}},
                {"path": str(path), "startSec": 0, "durationSec": 1},
            ]}
            plan = edit_decisions(timeline, [],
                                  {"lut": "none", "subtitles": "cinematic", "transition": "cut", "music": "none"},
                                  folder, folder / "attempt", verified_audio=path)
        self.assertEqual([shot["audio"] for shot in plan["shots"]], [0, 0])
        self.assertEqual(plan["frames"], 60)

    def test_audio_references_are_separate_from_cleared_sound_assets(self):
        from studio_references import reference_library, sound_library
        with TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("audio_ref", "audio_ref/music", "audio_ref/sfx", "subtitle_ref"):
                (root / name).mkdir()
            for name in ("audio_ref/movie.mp4", "audio_ref/music/piano.wav", "audio_ref/sfx/hit.wav",
                         "subtitle_ref/title.mp4", "subtitle_ref/notes.txt"):
                (root / name).touch()
            refs = reference_library(root)
            assets = sound_library(root)
            self.assertEqual([path.name for path in refs["audio_ref"]], ["movie.mp4"])
            self.assertEqual([path.name for path in refs["subtitle_ref"]], ["title.mp4"])
            self.assertEqual(list(assets), ["music-1", "sfx-1"])
            self.assertEqual(assets["music-1"].name, "piano.wav")

    def test_audio_comparison_sends_actual_samples_and_rejects_mood_mismatch(self):
        report = {"scores": {"color": 8, "titles": 9, "composition": 8, "editing": 8},
                  "observations": "Visual evidence.",
                  "scoreEvidence": {name: "Frame evidence." for name in ("color", "titles", "composition", "editing")},
                  "checklist": []}
        with TemporaryDirectory() as directory:
            video = Path(directory) / "output.mp4"
            video.touch()
            ref = Path(directory) / "music.wav"
            with patch("critic_agent.sample_frames", return_value=([0.1], [b"frame"])), patch(
                "critic_agent.sample_audio", side_effect=[b"movie", b"reference"]
            ), patch("critic_agent.ask", return_value={"provider": "openrouter", "value": report}) as request, patch(
                "critic_agent.ask_audio", return_value={"score": 5, "moodMatch": False, "observation": "Different mood"}
            ) as audio_request:
                review = evaluate_video(video, prefer="openrouter", references={"audio_ref": (ref,)})
            self.assertEqual(audio_request.call_args.args[1], [b"movie", b"reference"])
            self.assertEqual(request.call_args.args[1], [b"frame"])
        self.assertEqual(review["status"], "REJECTED")
        self.assertEqual(review["audioReview"]["score"], 5)
        self.assertIn("Заменить музыку на более подходящую из эталона", review["checklist"])

    def test_critic_prefers_openrouter_when_its_key_is_available(self):
        env = {"OPENROUTER_API_KEY": "test", "GEMINI_API_KEY": "test"}
        self.assertEqual(select_cloud_provider(None, env), "openrouter")
        self.assertEqual(select_cloud_provider("gemini", env), "gemini")
        with self.assertRaisesRegex(RuntimeError, "OPENROUTER_API_KEY"):
            select_cloud_provider("openrouter", {"GEMINI_API_KEY": "test"})

    def test_openrouter_review_requires_four_observations_and_preserves_them(self):
        model_report = {"scores": {"color": 9, "titles": 9, "composition": 8, "editing": 7},
                        "observations": "Виден спорный переход.",
                        "checklist": ["01.2: проверить двоение при переходе."]}
        with TemporaryDirectory() as directory, patch("critic_agent.sample_frames", return_value=([1.2], [b"frame"])), patch(
            "critic_agent.ask"
        ) as ask_model:
            video = Path(directory) / "fixture.mp4"
            video.write_bytes(b"fixture")
            ask_model.side_effect = lambda *args, **kwargs: {"provider": "openrouter", "value": model_report}
            with self.assertRaisesRegex(ValueError, "justify all four"):
                evaluate_video(video, prefer="openrouter")
            model_report["scoreEvidence"] = {criterion: f"1.2: observation for {criterion}"
                                             for criterion in model_report["scores"]}
            review = evaluate_video(video, prefer="openrouter")
        self.assertEqual(review["status"], "REJECTED")
        self.assertEqual(review["scoreEvidence"], model_report["scoreEvidence"])
        self.assertEqual(review["checklist"], model_report["checklist"])
        self.assertFalse(review["publicationApproved"])

    def test_openrouter_uses_free_model_and_multimodal_chat_payload(self):
        response = BytesIO(b'{"model":"nvidia/nemotron-3.5-super-vl:free","choices":'
                           b'[{"finish_reason":"stop","message":{"content":"{}"}}]}')
        with patch("studio_providers.build_opener") as opener, patch("studio_providers._openai") as openai:
            send = opener.return_value.open
            send.return_value = response
            result = ask("prompt", [b"image"], {"type": "object"},
                         env={"OPENROUTER_API_KEY": "test-router", "OPENAI_API_KEY": "test-other"},
                         prefer="openrouter")
            openai.assert_not_called()
        self.assertEqual(result["provider"], "openrouter")
        self.assertEqual(result["model"], DEFAULT_OPENROUTER_VISION)
        request = send.call_args.args[0]
        self.assertEqual(request.full_url, "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-router")
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], DEFAULT_OPENROUTER_VISION)
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertEqual(payload["messages"][0]["content"][1],
                         {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,aW1hZ2U="}})
        self.assertEqual(payload["provider"]["max_price"], {"prompt": 0, "completion": 0, "image": 0, "request": 0})
        self.assertNotIn("models", payload)

    def test_openrouter_rejects_missing_key_paid_model_and_truncated_reply(self):
        args = ("prompt", [b"image"], {})
        with patch("studio_providers._post") as post:
            with self.assertRaisesRegex(RuntimeError, "OPENROUTER_API_KEY"):
                ask(*args, env={"GEMINI_API_KEY": "test"}, prefer="openrouter")
            with self.assertRaisesRegex(ValueError, ":free"):
                ask(*args, env={"OPENROUTER_API_KEY": "test", "PERSONA_STUDIO_OPENROUTER_MODEL": "google/paid"},
                    prefer="openrouter")
            post.assert_not_called()
            post.return_value = {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]}
            with self.assertRaisesRegex(ProviderError, "incomplete_or_refused"):
                ask(*args, env={"OPENROUTER_API_KEY": "test"}, prefer="openrouter")
    def test_local_vision_uses_direct_loopback_and_sends_images_without_credentials(self):
        response = BytesIO(b'{"done":true,"done_reason":"stop","response":"{}"}')
        with patch("studio_providers.build_opener") as opener, patch("studio_providers._openai") as openai, patch(
            "studio_providers._gemini"
        ) as gemini:
            open_request = opener.return_value.open
            open_request.return_value = response
            result = ask("prompt", [b"image"], {"type": "object"},
                         env={"OPENAI_API_KEY": "test", "GEMINI_API_KEY": "test"}, prefer="ollama")
            openai.assert_not_called()
            gemini.assert_not_called()
        self.assertEqual(result, {"provider": "ollama", "model": DEFAULT_OLLAMA_VISION, "value": {}})
        request = open_request.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:11434/api/generate")
        self.assertEqual(opener.call_args.args[0].proxies, {})
        self.assertEqual(dict(request.header_items()), {"Content-type": "application/json"})
        payload = json.loads(request.data)
        self.assertEqual(payload["images"], ["aW1hZ2U="])
        self.assertEqual(payload["format"], {"type": "object"})
        self.assertFalse(payload["stream"])

    def test_local_vision_rejects_truncated_generation(self):
        response = BytesIO(b'{"done":true,"done_reason":"length","response":"{}"}')
        with patch("studio_providers.build_opener") as opener:
            opener.return_value.open.return_value = response
            with self.assertRaisesRegex(ProviderError, "incomplete_generation"):
                ask("prompt", [b"image"], {}, env={}, prefer="ollama")

    def test_gemini_sends_only_the_api_key_header_for_authentication(self):
        response = BytesIO(b'{"candidates":[{"finishReason":"STOP","content":'
                           b'{"parts":[{"text":"{}"}]}}]}')
        with patch("studio_providers.build_opener") as opener:
            open_request = opener.return_value.open
            open_request.return_value = response
            self.assertEqual(_gemini("test-key", "gemini-3.5-flash-lite", "prompt", [], {}), {})
        request = open_request.call_args.args[0]
        self.assertEqual(request.host, "generativelanguage.googleapis.com")
        headers = {name.lower(): value for name, value in request.header_items()}
        self.assertEqual(headers["x-goog-api-key"], "test-key")
        self.assertNotIn("authorization", headers)
        self.assertNotIn("test-key", request.full_url)

    def test_gemini_auth_error_keeps_provider_reason_and_omits_message(self):
        response = BytesIO(b'{"error":{"code":401,"status":"UNAUTHENTICATED","message":"sensitive",'
                           b'"details":[{"reason":"ACCESS_TOKEN_TYPE_UNSUPPORTED"}]}}')
        error = HTTPError("https://example.test", 401, "Unauthorized", None, response)
        with patch("studio_providers.build_opener") as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaisesRegex(ProviderError, "ACCESS_TOKEN_TYPE_UNSUPPORTED") as raised:
                _post("gemini", "https://example.test", {}, {})
        self.assertNotIn("sensitive", str(raised.exception))

    def test_quota_falls_back_and_sticks_to_gemini(self):
        quota = ProviderError("openai", 429, "insufficient_quota")
        with patch("studio_providers._openai", side_effect=quota) as openai, patch(
            "studio_providers._gemini", return_value={"score": 8}
        ) as gemini:
            env = {"OPENAI_API_KEY": "test", "GEMINI_API_KEY": "test"}
            result = ask("prompt", [], {}, env=env)
            self.assertEqual(result["provider"], "gemini")
            self.assertEqual(result["fallback"], "insufficient_quota")
            ask("prompt", [], {}, env=env, prefer="gemini")
            self.assertEqual(openai.call_count, 1)
            self.assertEqual(gemini.call_count, 2)

    def test_auth_error_is_not_treated_as_quota(self):
        with patch("studio_providers._openai", side_effect=ProviderError("openai", 401, "invalid_api_key")), patch(
            "studio_providers._gemini"
        ) as gemini:
            with self.assertRaises(ProviderError):
                ask("prompt", [], {}, env={"OPENAI_API_KEY": "test", "GEMINI_API_KEY": "test"})
            gemini.assert_not_called()

    def test_critic_requires_all_four_scores_and_checklist_on_rejection(self):
        scores = {"color": 10, "titles": 9, "composition": 10, "editing": 7}
        self.assertEqual(verdict({"scores": scores, "checklist": ["Улучшить читаемость"]}), "REJECTED")
        with self.assertRaises(ValueError):
            verdict({"scores": scores, "checklist": []})
        with self.assertRaises(ValueError):
            verdict({"scores": dict(scores, titles=True), "checklist": ["text"]})
        with self.assertRaises(ValueError):
            verdict({"scores": {key: value for key, value in scores.items() if key != "editing"},
                     "checklist": []})

    def test_loop_stops_after_three_and_never_approves_publication(self):
        with patch("autonomous_loop.analyze_and_decide", return_value={"provider": "gemini"}) as director, patch(
            "autonomous_loop.evaluate_video", return_value={"status": "REJECTED", "checklist": ["fix"], "provider": "gemini"}
        ):
            result = run_loop(None, None, None, None, renderer=lambda direction, index: f"draft-{index}.mp4")
            self.assertEqual(director.call_count, 3)
            self.assertEqual(director.call_args.kwargs["feedback"], ["fix"])
            self.assertEqual(result["status"], "REJECTED")
            self.assertFalse(result["publicationApproved"])

    def test_loop_stops_at_first_passing_attempt(self):
        with patch("autonomous_loop.analyze_and_decide", return_value={"provider": "openai"}), patch(
            "autonomous_loop.evaluate_video", return_value={"status": "APPROVED", "checklist": [], "provider": "openai"}
        ) as critic:
            result = run_loop(None, None, None, None, renderer=lambda direction, index: f"draft-{index}.mp4")
            self.assertEqual(critic.call_count, 1)
            self.assertFalse(result["distributionAllowed"])


if __name__ == "__main__":
    unittest.main()
