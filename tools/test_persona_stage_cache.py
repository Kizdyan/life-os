import hashlib
from contextlib import closing
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from persona_stage_cache import StageCache, cached_ffprobe, cached_llm_vision, cached_whisper


class StageCacheTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.cache = StageCache(self.root / "stage.sqlite3")
        self.source = self.root / "source.wav"
        self.source.write_bytes(b"input audio")

    def test_whisper_hits_across_instances_and_invalidates_file_settings_and_version(self):
        producer = Mock(return_value={"transcription": []})
        run = lambda cache, version, language: cached_whisper(
            self.source, version, {"language": language}, producer, cache=cache).status
        self.assertEqual(run(self.cache, "whisper-v1", "ru"), "MISS")
        self.assertEqual(run(StageCache(self.cache.path), "whisper-v1", "ru"), "HIT")
        self.assertEqual(run(self.cache, "whisper-v1", "en"), "MISS")
        self.assertEqual(run(self.cache, "whisper-v2", "ru"), "MISS")
        self.source.write_bytes(b"new audio")
        self.assertEqual(run(self.cache, "whisper-v1", "ru"), "MISS")
        self.assertEqual(producer.call_count, 4)
        with closing(sqlite3.connect(self.cache.path)) as db:
            self.assertEqual(db.execute("PRAGMA journal_mode").fetchone()[0], "wal")

    def test_failure_is_not_saved_and_does_not_repeat_on_hit(self):
        analyze = Mock(side_effect=[TimeoutError(), {"mood": "calm"}])
        digest = hashlib.sha256(b"video").hexdigest()
        args = (digest, "model-v1", {"prompt": "mood"}, analyze)
        with self.assertRaises(TimeoutError):
            cached_llm_vision(*args, cache=self.cache)
        self.assertEqual(cached_llm_vision(*args, cache=self.cache).status, "MISS")
        self.assertEqual(cached_llm_vision(*args, cache=self.cache).status, "HIT")
        self.assertEqual(analyze.call_count, 2)

    def test_ffprobe_rebinds_filename_for_identical_bytes(self):
        second = self.root / "copy.wav"
        second.write_bytes(self.source.read_bytes())
        probe = Mock(return_value={"format": {"filename": str(self.source), "duration": "2"}})
        first = cached_ffprobe(self.source, version="ffprobe-test", producer=probe, cache=self.cache)
        latest = cached_ffprobe(second, version="ffprobe-test", producer=probe, cache=self.cache)
        self.assertEqual(first["format"]["filename"], str(self.source))
        self.assertEqual(latest["format"]["filename"], str(second))
        self.assertEqual(probe.call_count, 1)

    def test_unavailable_database_does_not_block_work(self):
        self.cache.path.write_bytes(b"not a SQLite database")
        analyze = Mock(return_value={"mood": "calm"})
        with self.assertLogs("persona_stage_cache", level="WARNING"):
            result = cached_llm_vision(hashlib.sha256(b"image").hexdigest(), "model-v1", {}, analyze,
                                       cache=self.cache)
        self.assertEqual(result.status, "MISS")
        self.assertEqual(result.value, {"mood": "calm"})
        analyze.assert_called_once()
