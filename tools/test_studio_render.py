import unittest
import hashlib
import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import HTTPError

from critic_agent import evaluate_video
from studio_providers import DEFAULT_OLLAMA_VISION, DEFAULT_OPENROUTER_VISION, ProviderError, _gemini, _post, ask


class StudioRenderTests(unittest.TestCase):
    def test_default_subtitle_profile_matches_the_approved_preview(self):
        from studio_ffmpeg import reference_caption_config
        with patch.dict("os.environ", clear=True):
            profile = reference_caption_config()
        self.assertEqual(profile["fontFamily"], "Cormorant Garamond")
        self.assertEqual(profile["fontStyle"], "Light")
        self.assertEqual(profile["color"], "#E8DBA8")
        self.assertEqual(profile["animation"]["fadeInMs"], 167)

    def test_reference_style_is_sent_to_director_and_rendered_as_full_width_cards(self):
        from director_agent import analyze_and_decide
        from studio_ffmpeg import edit_decisions
        refs = {"source": "subtitle_ref/fixture.mp4", "introText": "БЮДЖЕТ ТОЛЬКО НА", "accentText": "ОДНОГО",
                "accentAtMs": 950, "fadeFrames": 3, "baseHex": "F5F3EF", "accentHex": "CC1036",
                "baseSizePx": 64, "accentSizePx": 100, "centerPercent": 0.26,
                "observation": "White lead-in and red keyword. Hard cut."}
        with TemporaryDirectory() as directory:
            folder = Path(directory).resolve()
            video = folder / "take.mp4"
            video.touch()
            model = {"mood": "calm", "music": "ambient", "transition": "cut", "subtitles": "cinematic",
                     "lut": "none", "reason": "Uses reference."}
            with patch("director_agent.ask", return_value={"provider": "openrouter", "value": model}) as ask_model:
                decision = analyze_and_decide(video, "Test script", reference_style=refs)
                self.assertIn("White lead-in and red keyword", ask_model.call_args.args[0])
            timeline = {"mode": "strict", "fps": 30, "width": 1080, "height": 1920, "clips": [
                {"path": str(video), "startSec": 0, "durationSec": 1.5},
                {"path": str(video), "startSec": 0, "durationSec": 1.5},
            ]}
            cues = [{"startMs": 100, "endMs": 2800, "text": "БЮДЖЕТ ТОЛЬКО НА ОДНОГО"}]
            plan = edit_decisions(timeline, cues, decision, folder, folder / "result")
            self.assertEqual([(row["first"], row["last"], row["text"], row["color"]) for row in plan["captions"]],
                             [(3, 84, "БЮДЖЕТ ТОЛЬКО НА ОДНОГО", [232, 219, 168])])

    def test_reference_intro_keeps_full_readable_hold_after_slide(self):
        from director_agent import validate_reference_style
        from studio_ffmpeg import reference_cards
        style = validate_reference_style({
            "source": "fixture.mp4", "introText": "БЮДЖЕТ ТОЛЬКО НА", "accentText": "ОДНОГО",
            "accentAtMs": 1833, "fadeFrames": 0, "baseHex": "F5F3EF", "accentHex": "E0193A",
            "baseSizePx": 108, "accentSizePx": 150, "centerPercent": 0.26, "observation": "Reference.",
            "introSlideFrames": 8, "introReadHoldMs": 1500,
        })
        cue = {"first": 2, "last": 86, "text": "БЮДЖЕТ ТОЛЬКО НА ОДНОГО"}
        intro, accent = reference_cards(cue, style)
        self.assertEqual((intro["first"], intro["last"], intro["slideFrames"]), (2, 55, 8))
        self.assertEqual((accent["first"], accent["slideFrames"], accent["fade"]), (55, 0, 0))
        with self.assertRaisesRegex(ValueError, "readable"):
            reference_cards(cue, {**style, "accentAtMs": 1500})

    def test_resolve_keeps_full_caption_and_applies_soft_entrance_and_grade_mix(self):
        from studio_ffmpeg import edit_decisions
        with TemporaryDirectory() as directory:
            folder = Path(directory).resolve()
            path = folder / "take.mp4"
            path.touch()
            timeline = {"mode": "strict", "fps": 30, "width": 1080, "height": 1920, "clips": [
                {"path": str(path), "startSec": 0, "durationSec": 1},
                {"path": str(path), "startSec": 0, "durationSec": 1},
            ]}
            (folder / "IWLTBAP Humble - Standard.cube").touch()
            direction = {"lut": "humble", "subtitles": "cinematic", "transition": "cut", "music": "none"}
            with patch.dict("os.environ", {"PERSONA_STUDIO_LUT_DIR": str(folder), "PERSONA_STUDIO_LUT_MIX": "1.1"}):
                plan = edit_decisions(timeline, [{"startMs": 100, "endMs": 900, "text": "Бюджет на одного"}],
                                      direction, folder, folder / "attempt")
        self.assertEqual(plan["captions"][0]["text"], "БЮДЖЕТ НА ОДНОГО")
        self.assertEqual(plan["captions"][0]["fadeInFrames"], 5)
        self.assertEqual(plan["size"], 98)
        self.assertEqual(plan["lutMix"], .6)

    def test_resolve_reference_config_overrides_font_and_rejects_changed_font_bytes(self):
        from studio_ffmpeg import edit_decisions
        with TemporaryDirectory() as directory:
            folder = Path(directory).resolve()
            source = folder / "take.mp4"
            source.touch()
            font = folder / "caption.ttf"
            font.write_bytes(b"fixture font bytes")
            config = folder / "style.json"
            config.write_text(json.dumps({
                "version": 1, "referenceSha256": "0" * 64, "fontFamily": "Cormorant Garamond",
                "fontStyle": "Light", "fontFile": font.name,
                "fontSha256": hashlib.sha256(font.read_bytes()).hexdigest(),
                "fontSize1080": 98, "color": "#E8DBA8", "outlinePx": 0, "shadowPx": 0,
                "xRatio": .5, "yRatio": .695, "lineBreak": "approved", "case": "uppercase",
                "animation": {"unit": "cue", "fadeInMs": 167, "movement": "none"},
            }), encoding="utf-8")
            timeline = {"mode": "strict", "fps": 30, "width": 1080, "height": 1920,
                        "clips": [{"path": str(source), "startSec": 0, "durationSec": 2}] * 2}
            direction = {"lut": "none", "subtitles": "cinematic", "transition": "cut", "music": "none"}
            cues = [{"startMs": 200, "endMs": 2200, "text": "Бюджет только на\nодного"}]
            config_sha = hashlib.sha256(config.read_bytes()).hexdigest()
            with patch("studio_ffmpeg.SUBTITLE_STANDARD", config), patch("studio_ffmpeg.SUBTITLE_STANDARD_SHA256", config_sha):
                plan = edit_decisions(timeline, cues, direction, folder, folder / "attempt")
                self.assertEqual((plan["font"], plan["weight"], plan["size"]), ("Cormorant Garamond", "Light", 98))
                self.assertEqual(plan["captions"][0]["text"], "БЮДЖЕТ ТОЛЬКО НА\nОДНОГО")
                self.assertEqual(plan["captions"][0]["color"], [232, 219, 168])
                self.assertEqual(plan["captions"][0]["fadeInFrames"], 5)
                self.assertNotIn("risePx", plan["captions"][0])
                font.write_bytes(b"changed")
                with self.assertRaisesRegex(ValueError, "font SHA-256 mismatch"):
                    edit_decisions(timeline, cues, direction, folder, folder / "attempt")

    def test_reviewed_program_audio_replaces_camera_audio_in_resolve_plan(self):
        from studio_ffmpeg import edit_decisions
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

    def test_technical_gate_requires_evidence_and_reports_precise_caption_shift(self):
        from critic_agent import technical_checks
        guide = {"frames": 300, "shots": [{"record": 0}], "captions": [{"first": 0, "last": 300}]}
        pictures = {"colorJumps": [], "unlocatedFaceFrames": [],
                    "overlaps": [{"frame": 75, "area": "mouth", "shiftDownPx": 50}]}
        checks, instructions = technical_checks(guide, actual_frames=300, fps=30, pictures=pictures)
        self.assertEqual(checks["duration"]["status"], "PASS")
        self.assertEqual(checks["titleClearance"]["status"], "FAIL")
        self.assertIn("50", instructions[0])
        checks, instructions = technical_checks(guide, actual_frames=299, fps=30,
            pictures={"colorJumps": [], "unlocatedFaceFrames": [0, 1], "overlaps": []})
        self.assertEqual(checks["duration"]["status"], "FAIL")
        self.assertEqual(checks["titleClearance"]["status"], "UNVERIFIED")
        self.assertTrue(instructions)

    def test_caption_overlap_tracks_lateral_clearance_and_technical_gate_has_no_scores(self):
        from studio_picture_qa import caption_overlap
        from critic_agent import technical_checks
        self.assertFalse(caption_overlap((.5, .6, 1, .8), (0, .6, .5, .8)))
        self.assertTrue(caption_overlap((0, .6, 1, .8), (0, .7, .5, .9)))
        guide = {"frames": 300, "captions": [{"first": 15, "last": 90}]}
        pictures = {"colorJumps": [], "unlocatedFaceFrames": [], "overlaps": [], "blackFrames": []}
        checks, instructions = technical_checks(guide, actual_frames=300, fps="30/1", pictures=pictures)
        self.assertTrue(all(check["status"] == "PASS" for check in checks.values()))
        self.assertEqual(instructions, [])
        pictures["colorJumps"] = [{"frame": 150}]
        checks, instructions = technical_checks(guide, actual_frames=300, fps="30/1", pictures=pictures)
        self.assertEqual(checks["whiteBalance"]["status"], "FAIL")
        self.assertIn("5.00", instructions[0])
        pictures["blackFrames"] = [0]
        checks, instructions = technical_checks(guide, actual_frames=300, fps="30/1", pictures=pictures)
        self.assertEqual(checks["blackFrames"]["status"], "FAIL")
        self.assertTrue(any("0.00" in line for line in instructions))

if __name__ == "__main__":
    unittest.main()
