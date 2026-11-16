import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from urllib.error import HTTPError
from unittest.mock import patch

from persona_internet_learner import canonical_reference, analyze_reference, sample_times
from persona_openrouter_retry import with_openrouter_retry, is_transient_openrouter
from studio_providers import ProviderError, _post


class InternetLearnerTest(unittest.TestCase):
    def test_normalizes_urls_and_rejects_unapproved_hosts_and_paths(self):
        self.assertEqual(canonical_reference("https://www.instagram.com/person/reel/DceB-cSxIhz/?igsh=private"),
                         ("Instagram", "https://www.instagram.com/reel/DceB-cSxIhz/"))
        self.assertEqual(canonical_reference("https://youtu.be/abcdefghijk?list=playlist"),
                         ("Youtube", "https://www.youtube.com/watch?v=abcdefghijk"))
        self.assertEqual(canonical_reference("https://www.tiktok.com/@person/video/12345"),
                         ("TikTok", "https://www.tiktok.com/@person/video/12345"))
        for url in ("http://www.instagram.com/p/id/", "https://instagram.com.evil.test/reel/id/",
                    "https://evil@instagram.com/reel/id/", "https://instagram.com:8443/reel/id/",
                    "https://youtube.com/playlist?list=private", "https://127.0.0.1/reel/id"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                canonical_reference(url)

    def test_sampling_covers_start_middle_end_without_seeking_past_eof(self):
        times = sample_times(10, [1.25, 2.75, 6.5, 8.5])
        self.assertEqual(len(times), 6)
        self.assertEqual(times, sorted(set(times)))
        self.assertTrue(0 < times[0] < 1.7 < 8.4 < times[-1] < 10)

    def test_openrouter_receives_six_ordered_images_and_rules_include_measured_cut_evidence(self):
        profile = {"subtitles": {"fontEstimate": "bold sans", "preset": "dynamic-interview", "color": "#FFFFFF",
                                  "sizePx1080": 104},
                   "colorGrade": {"temperature": "warm", "description": "warm skin and neutral shadows"},
                   "editing": {"description": "regular cuts"}}
        samples = [bytes([i]) for i in range(6)]
        reply = {"provider": "openrouter", "model": "free", "value": {
            "subtitles": profile["subtitles"], "colorGrade": profile["colorGrade"],
        }}
        def downloaded(_extractor, _url, directory):
            source = directory / "test.mp4"
            source.write_bytes(b"fixture")
            return source
        with patch("persona_internet_learner.download_reference", side_effect=downloaded) as download, \
                patch("persona_internet_learner.inspect_reference", return_value=(10, [2, 4, 6, 8])), \
                patch("persona_internet_learner.capture_reference_frame", side_effect=samples), \
                patch("persona_internet_learner.sleep") as sleep, \
                patch("persona_internet_learner.ask", side_effect=[
                    ProviderError("openrouter", 503, "http_error", retry_after=3), *([reply] * 6),
                ]) as ask:
            rules = analyze_reference("https://www.instagram.com/reel/DceB-cSxIhz/")
        directory = download.call_args.args[2]
        self.assertFalse(directory.exists())
        self.assertEqual([call.args[1] for call in ask.call_args_list], [[samples[0]], *[[s] for s in samples]])
        sleep.assert_called_once_with(3.0)
        self.assertTrue(ask.call_args.kwargs["validate"](reply["value"]))
        self.assertFalse(ask.call_args.kwargs["validate"]({**reply["value"], "subtitles": {
            **profile["subtitles"], "color": "#FFFFFF:unsafe",
        }}))
        self.assertEqual(rules["editing"]["medianShotSec"], 2)
        self.assertEqual(rules["editing"]["estimatedCuts"], [2, 4, 6, 8])
        self.assertEqual(rules["subtitles"], profile["subtitles"])
        self.assertEqual([item["timeSec"] for item in rules["frameObservations"]], rules["frameTimesSec"])

    def test_openrouter_http_error_keeps_retry_after(self):
        error = HTTPError("https://openrouter.ai/api/v1/chat/completions", 429, "", {"Retry-After": "7"}, None)
        with patch("studio_providers.build_opener") as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(ProviderError) as raised:
                _post("openrouter", error.url, {}, {})
        self.assertEqual(raised.exception.retry_after, 7)

    def test_second_import_of_same_bytes_skips_all_six_vision_requests(self):
        source_url = "https://www.instagram.com/reel/DceB-cSxIhz/"
        frames = [bytes([index]) for index in range(6)]
        profile = {"subtitles": {"fontEstimate": "bold sans", "preset": "dynamic-interview",
                                 "color": "#FFFFFF", "sizePx1080": 104},
                   "colorGrade": {"temperature": "warm", "description": "warm skin and neutral shadows"}}

        def download(_extractor, _url, directory):
            path = directory / "copy.mp4"
            path.write_bytes(b"identical content at a new path")
            return path

        with TemporaryDirectory() as directory, patch.dict(os.environ, {
            "PERSONA_STAGE_CACHE": "1",
            "PERSONA_STAGE_CACHE_DB": str(Path(directory) / "cache.sqlite3"),
            "PERSONA_STUDIO_OPENROUTER_MODEL": "test/vision:free",
            "OPENROUTER_API_KEY": "test-key",
        }), patch("persona_internet_learner.download_reference", side_effect=download), \
                patch("persona_internet_learner.inspect_reference", return_value=(10, [2, 4, 6, 8])), \
                patch("persona_internet_learner.capture_reference_frame", side_effect=frames * 2), \
                patch("studio_providers._openrouter", return_value=profile) as transport:
            first = analyze_reference(source_url)
            second = analyze_reference(source_url)
        self.assertEqual(transport.call_count, 6)
        self.assertEqual(first["subtitles"], second["subtitles"])
        self.assertEqual(first["editing"], second["editing"])

    def test_auth_billing_invalid_data_and_missing_key_are_terminal(self):
        for status, code in ((400, "http_error"), (401, "http_error"), (402, "http_error"),
                             (0, "missing_OPENROUTER_API_KEY"), (0, "invalid_response")):
            failure = ProviderError("openrouter", status, code)
            self.assertFalse(is_transient_openrouter(failure))
            with patch("persona_openrouter_retry.LOG.warning") as warning:
                with self.assertRaises(ProviderError):
                    with_openrouter_retry(lambda: self.fail_once(failure), sleep=self.fail)
            warning.assert_not_called()
        self.assertTrue(is_transient_openrouter(ProviderError("openrouter", 200, "response_timeout")))

    @staticmethod
    def fail_once(error):
        raise error
