#!/usr/bin/env python3
"""Record measurable Persona production economics; never invent savings.

Time saved is calculated only when a baseline per approved MP4 was supplied
and the operator explicitly marks human-time logging complete.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import subprocess
import sys
import time
import uuid
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


class ProductionEconomics:
    def __init__(self, database: str | Path):
        self.path = Path(database).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    created_ms INTEGER NOT NULL,
                    baseline_min_per_mp4 REAL,
                    human_logging_complete INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS stages (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL REFERENCES jobs(id),
                    name TEXT NOT NULL,
                    start_ms INTEGER NOT NULL,
                    end_ms INTEGER,
                    status TEXT NOT NULL DEFAULT 'RUNNING'
                );
                CREATE INDEX IF NOT EXISTS stages_job ON stages(job_id);
                CREATE TABLE IF NOT EXISTS manual_work (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL REFERENCES jobs(id),
                    minutes REAL NOT NULL CHECK(minutes>=0),
                    category TEXT NOT NULL,
                    comment TEXT NOT NULL,
                    recorded_ms INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS outputs (
                    job_id TEXT NOT NULL REFERENCES jobs(id),
                    sha256 TEXT NOT NULL,
                    path TEXT NOT NULL,
                    approved_by TEXT NOT NULL,
                    approved_ms INTEGER NOT NULL,
                    PRIMARY KEY (job_id, sha256)
                );
            ''')

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA busy_timeout=15000')
        return db

    def create(self, job_id: str, baseline_minutes: float | None = None) -> None:
        if not job_id or len(job_id) > 120:
            raise ValueError('Invalid job ID')
        if baseline_minutes is not None and (not math.isfinite(baseline_minutes) or baseline_minutes <= 0):
            raise ValueError('Baseline must be positive minutes per accepted MP4')
        with self._connect() as db:
            db.execute('INSERT INTO jobs(id,created_ms,baseline_min_per_mp4) VALUES(?,?,?)',
                       (job_id, round(time.time() * 1000), baseline_minutes))

    def start_stage(self, job_id: str, stage: str) -> str:
        if not stage or len(stage) > 80:
            raise ValueError('Invalid stage')
        stage_id = str(uuid.uuid4())
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM stages WHERE job_id=? AND end_ms IS NULL',
                          (job_id,)).fetchone():
                raise ValueError('Another stage is running; finish or fail it first')
            db.execute('INSERT INTO stages(id,job_id,name,start_ms) VALUES(?,?,?,?)',
                       (stage_id, job_id, stage, round(time.time() * 1000)))
        return stage_id

    def finish_stage(self, stage_id: str, success: bool = True) -> None:
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT start_ms,end_ms FROM stages WHERE id=?', (stage_id,)).fetchone()
            if row is None or row['end_ms'] is not None:
                raise ValueError('Unknown or already completed stage')
            db.execute('UPDATE stages SET end_ms=?, status=? WHERE id=?',
                       (max(round(time.time() * 1000), row['start_ms']),
                        'PASS' if success else 'FAIL', stage_id))

    def record_manual(self, job_id: str, minutes: float, *, category: str, comment: str = '') -> None:
        if not math.isfinite(minutes) or not 0 <= minutes <= 1440:
            raise ValueError('Manual time outside 0..1440 min')
        if category not in {'selection', 'review', 'correction', 'setup', 'publishing', 'other'}:
            raise ValueError('Invalid manual category')
        if len(comment) > 500:
            raise ValueError('Comment too long')
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('INSERT INTO manual_work VALUES(?,?,?,?,?,?)',
                       (str(uuid.uuid4()), job_id, minutes, category, comment,
                        round(time.time() * 1000)))
            # Any late manual work invalidates a previous completeness attestation.
            db.execute('UPDATE jobs SET human_logging_complete=0 WHERE id=?', (job_id,))

    def approve_output(self, job_id: str, video: str | Path, *, reviewer: str,
                       confirmed: bool, ffprobe: str = 'ffprobe') -> str:
        if (confirmed is not True or not isinstance(reviewer, str) or
                not reviewer.strip()):
            raise ValueError('Human approval required')
        original = Path(video)
        if original.is_symlink():
            raise ValueError('Symlink outputs are not allowed')
        path = original.resolve(strict=True)
        if path.suffix.lower() != '.mp4' or not path.is_file() or path.stat().st_size < 1024:
            raise ValueError('A real MP4 file is required')
        probe = subprocess.run([ffprobe, '-v', 'error', '-show_entries',
                                'stream=codec_type:format=duration', '-of', 'json', str(path)],
                               capture_output=True, text=True, timeout=30, check=False)
        if probe.returncode:
            raise ValueError('ffprobe cannot read approved output')
        info = json.loads(probe.stdout)
        if not any(s.get('codec_type') == 'video' for s in info.get('streams', [])):
            raise ValueError('Approved MP4 has no video stream')
        duration = float(info.get('format', {}).get('duration', 0))
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError('Invalid output duration')
        digest = sha256_file(path)
        with self._connect() as db:
            db.execute('INSERT INTO outputs VALUES(?,?,?,?,?)',
                       (job_id, digest, str(path), reviewer, round(time.time() * 1000)))
        return digest

    def mark_manual_complete(self, job_id: str) -> None:
        with self._connect() as db:
            if db.execute('UPDATE jobs SET human_logging_complete=1 WHERE id=?',
                          (job_id,)).rowcount != 1:
                raise KeyError(job_id)

    def report(self, job_id: str) -> dict:
        with self._connect() as db:
            job = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
            if job is None:
                raise KeyError(job_id)
            stages = [dict(row) for row in db.execute('SELECT name,start_ms,end_ms,status FROM stages WHERE job_id=?', (job_id,))]
            manual = db.execute('SELECT COALESCE(SUM(minutes),0) FROM manual_work WHERE job_id=?',
                                (job_id,)).fetchone()[0]
            edited = db.execute('SELECT COUNT(*) FROM manual_work WHERE job_id=? AND category=?',
                                (job_id, 'correction')).fetchone()[0]
            accepted = db.execute('SELECT COUNT(*) FROM outputs WHERE job_id=?', (job_id,)).fetchone()[0]
        elapsed = round((time.time() * 1000 - job['created_ms']) / 60000, 2)
        render_minutes = round(sum(((s['end_ms'] - s['start_ms']) / 60000)
                                   for s in stages if s['end_ms'] is not None and
                                   s['name'] in {'render', 'EDITING'}), 2)
        comparable = job['baseline_min_per_mp4'] is not None and bool(job['human_logging_complete']) and accepted > 0
        saved = round(job['baseline_min_per_mp4'] * accepted - manual, 2) if comparable else None
        return {'jobId': job_id, 'acceptedMp4': accepted,
                'manualCorrections': edited, 'activeHumanMinutes': round(manual, 2),
                'renderMinutes': render_minutes, 'wallClockMinutes': elapsed,
                'baselineMinutesPerAcceptedMp4': job['baseline_min_per_mp4'],
                'manualLoggingComplete': bool(job['human_logging_complete']),
                'minutesSaved': saved, 'savingsVerified': comparable,
                'savingsNote': ('Measured against user-supplied manual baseline; negative means Persona took longer.'
                                if comparable else 'UNVERIFIED: provide a baseline, approved outputs and complete manual-time logging.'),
                'stages': stages}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db', type=Path, required=True)
    sub = p.add_subparsers(dest='command', required=True)
    s = sub.add_parser('create')
    s.add_argument('job_id'); s.add_argument('--baseline-min', type=float)
    s = sub.add_parser('start'); s.add_argument('job_id'); s.add_argument('stage')
    s = sub.add_parser('finish'); s.add_argument('stage_id'); s.add_argument('--failed', action='store_true')
    s = sub.add_parser('manual'); s.add_argument('job_id'); s.add_argument('--minutes', type=float, required=True)
    s.add_argument('--category', required=True); s.add_argument('--comment', default='')
    s = sub.add_parser('approve'); s.add_argument('job_id'); s.add_argument('--video', type=Path, required=True)
    s.add_argument('--reviewer', required=True); s.add_argument('--confirmed', action='store_true')
    s.add_argument('--ffprobe', default='ffprobe')
    s = sub.add_parser('manual-complete'); s.add_argument('job_id')
    s = sub.add_parser('report'); s.add_argument('job_id')
    args = p.parse_args()
    try:
        e = ProductionEconomics(args.db)
        if args.command == 'create':
            e.create(args.job_id, args.baseline_min); result = {'created': args.job_id}
        elif args.command == 'start': result = {'stageId': e.start_stage(args.job_id, args.stage)}
        elif args.command == 'finish': e.finish_stage(args.stage_id, not args.failed); result = {'finished': args.stage_id}
        elif args.command == 'manual':
            e.record_manual(args.job_id, args.minutes, category=args.category, comment=args.comment); result = {'recorded': True}
        elif args.command == 'approve':
            result = {'approvedSha256': e.approve_output(args.job_id, args.video,
                                                      reviewer=args.reviewer, confirmed=args.confirmed, ffprobe=args.ffprobe)}
        elif args.command == 'manual-complete':
            e.mark_manual_complete(args.job_id); result = {'complete': True}
        else: result = e.report(args.job_id)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, sqlite3.Error, subprocess.TimeoutExpired) as exc:
        print('ERROR: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())