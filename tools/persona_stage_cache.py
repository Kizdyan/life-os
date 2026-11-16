"""Content-addressed local stage cache. Python and the Node worker share this WAL database."""
from contextlib import closing
from dataclasses import dataclass
from functools import lru_cache
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import time

DEFAULT_PROBE_ARGS = ("-v", "error", "-show_streams", "-show_format", "-of", "json")
ENTRY_LIMIT = 128 * 1024 * 1024
TOTAL_LIMIT = 512 * 1024 * 1024
ROW_LIMIT = 2048
LOCAL_TTL_SECONDS = 30 * 86400
VISION_TTL_SECONDS = 7 * 86400
LOG = logging.getLogger(__name__)
SCHEMA = Path(__file__).with_name("persona-stage-cache-schema.sql")
PRUNE = """
DELETE FROM stage_cache WHERE key IN (
  SELECT key FROM (
    SELECT key, row_number() OVER newest AS ordinal,
      sum(bytes) OVER newest AS total
    FROM stage_cache WINDOW newest AS (ORDER BY stored_at DESC, rowid DESC)
  ) WHERE ordinal > ? OR total > ?
)
"""


def cache_path(env=None):
    env = os.environ if env is None else env
    if env.get("PERSONA_STAGE_CACHE") == "0":
        return None
    if env.get("PERSONA_STAGE_CACHE_DB"):
        return Path(env["PERSONA_STAGE_CACHE_DB"]).expanduser().resolve()
    if os.name == "nt" and env.get("LOCALAPPDATA"):
        return Path(env["LOCALAPPDATA"]) / "LifeOS" / "Persona" / "cache" / "stage.sqlite3"
    return Path(env.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "persona" / "stage.sqlite3"


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def log_stage(status, operation):
    if os.environ.get("PERSONA_STAGE_CACHE_LOG") == "1":
        print(f"stage_cache {status} {operation}", file=sys.stderr)


def signature(path):
    info = Path(path).stat()
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


@lru_cache(maxsize=128)
def _file_sha(path, before):
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if signature(path) != before:
        raise RuntimeError("Media or tool changed while fingerprinting")
    return digest


def file_sha256(path):
    file = Path(path).resolve(strict=True)
    return _file_sha(file, signature(file))


def tool_version(binary):
    path = shutil.which(os.fspath(binary))
    if path is None:
        raise FileNotFoundError(binary)
    return "sha256:" + file_sha256(path)


def stage_key(operation, source_sha, version, params):
    if not isinstance(source_sha, str) or not re.fullmatch("[0-9a-f]{64}", source_sha):
        raise ValueError("Stage cache requires a verified SHA-256 content digest")
    return hashlib.sha256(canonical([1, operation, source_sha, version, params]).encode()).hexdigest()


@dataclass(frozen=True)
class StageResult:
    value: object
    status: str


class StageCache:
    def __init__(self, path):
        self.path = Path(path) if path is not None else None

    def _connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=.25)
        try:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA synchronous=NORMAL")
            db.execute("PRAGMA journal_size_limit=8388608")
            db.executescript(SCHEMA.read_text(encoding="utf-8"))
        except BaseException:
            db.close()
            raise
        return db

    def _read(self, key, valid):
        with closing(self._connect()) as db:
            row = db.execute("SELECT encoding,payload FROM stage_cache WHERE key=? AND expires_at>? AND bytes<=?",
                             (key, time.time_ns() // 1_000_000, ENTRY_LIMIT)).fetchone()
        if row is not None:
            encoding, payload = row
            value = payload if encoding == "bytes" else json.loads(payload)
            if valid(value):
                return StageResult(value, "HIT")
        return None

    def _write(self, key, operation, value, ttl):
        if value is None:
            return
        encoding = "bytes" if isinstance(value, bytes) else "json"
        payload = value if encoding == "bytes" else canonical(value).encode()
        if len(payload) > ENTRY_LIMIT:
            return
        # Large artifacts need headroom for the rendered copy and SQLite's WAL.
        reserve = (64 if len(payload) >= 1024 * 1024 else 16) * 1024 * 1024
        if shutil.disk_usage(self.path.parent).free < reserve + 3 * len(payload):
            log_stage("WRITE_SKIPPED_LOW_DISK", operation)
            return
        now = time.time_ns() // 1_000_000
        with closing(self._connect()) as db, db:
            db.execute("DELETE FROM stage_cache WHERE expires_at<=?", (now,))
            db.execute("INSERT OR REPLACE INTO stage_cache VALUES (?,?,?,?,?,?,?)",
                       (key, operation, encoding, payload, len(payload), now, now+ttl*1000))
            db.execute(PRUNE, (ROW_LIMIT, TOTAL_LIMIT))

    def run(self, operation, source_sha, version, params, producer, *, valid=lambda _: True,
            ttl=LOCAL_TTL_SECONDS):
        if self.path is None:
            return StageResult(producer(), "BYPASS")
        key = stage_key(operation, source_sha, version, params)
        try:
            hit = self._read(key, valid)
        except (OSError, sqlite3.Error, ValueError, TypeError):
            LOG.warning("Stage cache unavailable for %s", operation)
            hit = None
        if hit is not None:
            log_stage("HIT", operation)
            return hit
        value = producer()
        if not valid(value):
            raise ValueError(f"Invalid result for {operation}")
        try:
            self._write(key, operation, value, ttl)
        except (OSError, sqlite3.Error, ValueError, TypeError):
            LOG.warning("Stage cache write unavailable for %s", operation)
        log_stage("MISS", operation)
        return StageResult(value, "MISS")


def cached_file_stage(path, operation, version, params, producer, *, cache=None, valid=lambda _: True):
    cache = cache if cache is not None else StageCache(cache_path())
    if cache.path is None:
        return StageResult(producer(), "BYPASS")
    before = signature(path)

    def checked():
        value = producer()
        if signature(path) != before:
            raise RuntimeError("Media changed during the cached stage")
        return value

    result = cache.run(operation, file_sha256(path), version, params, checked, valid=valid)
    if signature(path) != before:
        raise RuntimeError("Media changed during the cached stage")
    return result


def cached_ffprobe(path, *, args=DEFAULT_PROBE_ARGS, binary="ffprobe", timeout=20,
                   version=None, producer=None, cache=None):
    cache = cache if cache is not None else StageCache(cache_path())
    def compute():
        raw = producer() if producer else json.loads(subprocess.run(
            [binary, *args, os.fspath(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            check=True, timeout=timeout).stdout)
        if isinstance(raw.get("format"), dict) and "filename" in raw["format"]:
            return {**raw, "format": {**raw["format"], "filename": ""}}
        return raw

    result = cached_file_stage(path, "ffprobe", version or (tool_version(binary) if cache.path else ""),
                               {"args": list(args)}, compute, cache=cache,
                               valid=lambda x: isinstance(x, dict) and ("format" in x or "streams" in x))
    raw = result.value
    if isinstance(raw.get("format"), dict) and "filename" in raw["format"]:
        return {**raw, "format": {**raw["format"], "filename": os.fspath(path)}}
    return raw


def cached_whisper(audio, version, params, producer, *, cache=None):
    return cached_file_stage(audio, "whisper_transcribe", version, params, producer, cache=cache,
                             valid=lambda x: isinstance(x, dict) and isinstance(x.get("transcription"), list))


def cached_llm_vision(source_sha, version, params, producer, *, cache=None, valid=lambda x: isinstance(x, dict)):
    cache = cache if cache is not None else StageCache(cache_path())
    return cache.run("openrouter_vision", source_sha, version, params, producer,
                     valid=valid, ttl=VISION_TTL_SECONDS)


def cached_mp4(path, inputs_sha, version, params, render, *, cache):
    """Check the stored MP4 bytes and materialize a fresh file on a hit."""
    def compute():
        render()
        if path.stat().st_size > ENTRY_LIMIT - 64:
            return None
        video = path.read_bytes()
        return hashlib.sha256(video).hexdigest().encode("ascii") + video

    def valid(value):
        return value is None or (isinstance(value, bytes) and len(value) > 64
                                 and value[:64] == hashlib.sha256(memoryview(value)[64:]).hexdigest().encode("ascii"))

    result = cache.run("ffmpeg_studio_render", inputs_sha, version, params, compute, valid=valid)
    if result.status == "HIT":
        with path.open("xb") as stream:
            stream.write(memoryview(result.value)[64:])
    return result.status
