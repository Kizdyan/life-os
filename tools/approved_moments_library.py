#!/usr/bin/env python3
"""Author-approved moment registry. Python 3.11+, sqlite3, ffprobe.
No copies or changes to input videos. A moment is not approved by an LLM.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def probe_duration(path: Path, exe: str = 'ffprobe') -> float:
    result = subprocess.run([exe, '-v', 'error', '-show_entries', 'format=duration',
                             '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
                            text=True, capture_output=True, timeout=30, check=False)
    if result.returncode:
        raise ValueError('ffprobe failed: ' + result.stderr[-200:])
    value = float(result.stdout.strip())
    if not math.isfinite(value) or value <= 0:
        raise ValueError('Invalid video duration')
    return value


class MomentsLibrary:
    def __init__(self, database: str | Path):
        self.database = Path(database).resolve()
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS moments (
                    id TEXT PRIMARY KEY,
                    source_sha256 TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    start_ms INTEGER NOT NULL CHECK(start_ms>=0),
                    end_ms INTEGER NOT NULL CHECK(end_ms>start_ms),
                    kind TEXT NOT NULL,
                    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
                    notes TEXT NOT NULL,
                    tags_json TEXT NOT NULL,
                    approved_by TEXT NOT NULL,
                    approved_at TEXT NOT NULL,
                    UNIQUE(source_sha256,start_ms,end_ms,kind)
                );
                CREATE INDEX IF NOT EXISTS moments_source ON moments(source_sha256,score DESC);
                CREATE TABLE IF NOT EXISTS moment_reviews (
                    id TEXT PRIMARY KEY,
                    moment_id TEXT NOT NULL REFERENCES moments(id),
                    score INTEGER NOT NULL,
                    reviewed_by TEXT NOT NULL,
                    reviewed_at TEXT NOT NULL,
                    notes TEXT NOT NULL
                );
            ''')

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(str(self.database), timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA busy_timeout=15000')
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def add(self, video: str | Path, start_sec: float, end_sec: float, *,
            kind: str, score: int, approved_by: str, confirmed: bool,
            tags: list[str] | None = None, notes: str = '',
            ffprobe: str = 'ffprobe') -> dict:
        original = Path(video)
        if original.is_symlink():
            raise ValueError('Symlink sources are not allowed')
        path = original.resolve(strict=True)
        if (not path.is_file() or
                path.suffix.lower() not in {'.mp4', '.mov', '.m4v', '.mkv', '.webm'}):
            raise ValueError('A regular video file is required')
        if (confirmed is not True or not isinstance(approved_by, str) or
                not approved_by.strip()):
            raise ValueError('Explicit human approval and reviewer required')
        if kind not in {'acting', 'music', 'reaction', 'broll'}:
            raise ValueError('Unsupported moment kind')
        if type(score) is not int or not 1 <= score <= 5:
            raise ValueError('Score must be integer 1..5')
        if not all(isinstance(x, (int, float)) and math.isfinite(x)
                   for x in (start_sec, end_sec)):
            raise ValueError('Finite timecodes required')
        start_ms = round(start_sec * 1000)
        end_ms = round(end_sec * 1000)
        duration = probe_duration(path, ffprobe)
        if start_ms < 0 or end_ms <= start_ms or end_sec > duration + .02:
            raise ValueError('Moment outside source duration')
        tags = tags or []
        if not isinstance(tags, list) or len(tags) > 12 or any(
            not isinstance(t, str) or len(t) > 40 for t in tags):
            raise ValueError('Invalid tags')
        if len(notes) > 2000 or len(approved_by) > 120:
            raise ValueError('Metadata too long')
        source_hash = sha256_file(path)
        entry_id = str(uuid.uuid4())
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            try:
                db.execute('''INSERT INTO moments
                    (id,source_sha256,source_path,start_ms,end_ms,kind,score,
                     notes,tags_json,approved_by,approved_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
                    (entry_id, source_hash, str(path), start_ms, end_ms, kind,
                     score, notes, json.dumps(tags, ensure_ascii=False), approved_by, timestamp()))
            except sqlite3.IntegrityError as exc:
                raise ValueError('This exact moment is already registered') from exc
        return {'id': entry_id, 'sourceSha256': source_hash,
                'startSec': start_ms / 1000, 'endSec': end_ms / 1000,
                'kind': kind, 'score': score}

    def review(self, moment_id: str, *, score: int, reviewed_by: str,
               notes: str = '') -> None:
        if (type(score) is not int or not 1 <= score <= 5 or
                not isinstance(reviewed_by, str) or not reviewed_by.strip() or
                len(reviewed_by) > 120 or not isinstance(notes, str) or len(notes) > 2000):
            raise ValueError('Valid score and human reviewer required')
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            before = db.execute('SELECT id FROM moments WHERE id=?', (moment_id,)).fetchone()
            if before is None:
                raise KeyError('Moment not found')
            db.execute('UPDATE moments SET score=?, approved_by=?, approved_at=?, notes=? WHERE id=?',
                       (score, reviewed_by, timestamp(), notes, moment_id))
            db.execute('INSERT INTO moment_reviews VALUES(?,?,?,?,?,?)',
                       (str(uuid.uuid4()), moment_id, score, reviewed_by, timestamp(), notes))

    def suggest(self, source_video: str | Path, *, kind: str | None = None,
                min_score: int = 4, limit: int = 10) -> list[dict]:
        path = Path(source_video).resolve(strict=True)
        if not 1 <= min_score <= 5 or not 1 <= limit <= 100:
            raise ValueError('Invalid query limits')
        source_hash = sha256_file(path)
        query = '''SELECT * FROM moments WHERE source_sha256=? AND score>=?'''
        params: list[object] = [source_hash, min_score]
        if kind:
            query += ' AND kind=?'
            params.append(kind)
        query += ' ORDER BY score DESC, approved_at DESC LIMIT ?'
        params.append(limit)
        with self._connect() as db:
            rows = db.execute(query, params).fetchall()
        return [{'id': x['id'], 'sourceSha256': source_hash,
                 'sourcePath': str(path), 'startSec': x['start_ms'] / 1000,
                 'endSec': x['end_ms'] / 1000, 'kind': x['kind'],
                 'score': x['score'], 'approvedBy': x['approved_by'],
                 'notes': x['notes'], 'tags': json.loads(x['tags_json']),
                 'status': 'AUTHOR_APPROVED_CANDIDATE'} for x in rows]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db', required=True, type=Path)
    sub = p.add_subparsers(dest='action', required=True)
    add = sub.add_parser('add')
    add.add_argument('--video', required=True, type=Path)
    add.add_argument('--start', required=True, type=float)
    add.add_argument('--end', required=True, type=float)
    add.add_argument('--kind', required=True, choices=['acting', 'music', 'reaction', 'broll'])
    add.add_argument('--score', required=True, type=int)
    add.add_argument('--reviewer', required=True)
    add.add_argument('--notes', default='')
    add.add_argument('--tag', action='append', default=[])
    add.add_argument('--confirmed', action='store_true')
    add.add_argument('--ffprobe', default='ffprobe')
    find = sub.add_parser('suggest')
    find.add_argument('--video', required=True, type=Path)
    find.add_argument('--kind', default=None)
    find.add_argument('--min-score', type=int, default=4)
    try:
        a = p.parse_args()
        library = MomentsLibrary(a.db)
        if a.action == 'add':
            result = library.add(a.video, a.start, a.end, kind=a.kind, score=a.score,
                                 approved_by=a.reviewer, confirmed=a.confirmed,
                                 tags=a.tag, notes=a.notes, ffprobe=a.ffprobe)
        else:
            result = library.suggest(a.video, kind=a.kind, min_score=a.min_score)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, sqlite3.Error, subprocess.TimeoutExpired) as exc:
        print('ERROR: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())