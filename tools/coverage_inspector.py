#!/usr/bin/env python3
"""Compare a Persona v1 Production Brief with explicitly bound source videos.

No face/emotion/scene semantics are invented. Visual correctness needs an
explicit, source-hash-bound human review. Spoken scenes need reviewed speech
text or an ASR JSON sidecar; ASR-only matches still require author review.
Python 3.11+, ffprobe. All input media are read-only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

VIDEO_EXT = {'.mp4', '.mov', '.mkv', '.m4v', '.webm'}
SHA256_RE = re.compile(r'^[a-f0-9]{64}$')


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    obj = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(obj, dict):
        raise ValueError(f'JSON object required: {path}')
    return obj


def source_in_input(root: Path, filename: str) -> Path:
    if not isinstance(filename, str) or not filename or Path(filename).name != filename:
        raise ValueError('File must be a simple basename inside input/')
    path = root / filename
    if path.suffix.lower() not in VIDEO_EXT or path.is_symlink():
        raise ValueError('Unsupported video or symlink')
    if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
        raise FileNotFoundError(filename)
    return path


def probe(path: Path, ffprobe: str = 'ffprobe') -> dict:
    proc = subprocess.run(
        [ffprobe, '-v', 'error', '-show_streams', '-show_format',
         '-of', 'json', str(path)], capture_output=True, text=True,
        timeout=30, check=False, encoding='utf-8', errors='replace',
    )
    if proc.returncode:
        raise ValueError('ffprobe failed: ' + proc.stderr[-300:])
    data = json.loads(proc.stdout)
    video = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), None)
    if video is None:
        raise ValueError('No video stream')
    duration = float(data.get('format', {}).get('duration', 0))
    if not 0.25 <= duration <= 900:
        raise ValueError('Duration outside 0.25–900 seconds')
    return {'durationSec': round(duration, 3),
            'width': int(video.get('width', 0)),
            'height': int(video.get('height', 0)),
            'hasAudio': any(s.get('codec_type') == 'audio' for s in data.get('streams', []))}


def words(s: str) -> list[str]:
    return re.findall(r'[^\W_]+', s.casefold(), re.UNICODE)


def speech_contains(expected: str, observed: str) -> bool:
    target, actual = words(expected), words(observed)
    if not target or len(actual) < len(target):
        return False
    return any(actual[i:i + len(target)] == target
               for i in range(len(actual) - len(target) + 1))


def transcript_text(path: Path, source_sha256: str) -> str:
    data = load_json(path)
    if data.get('sourceSha256') != source_sha256:
        raise ValueError('Whisper sidecar must reference exact source SHA-256')
    if isinstance(data.get('text'), str):
        return data['text']
    rows = data.get('transcription', data.get('segments'))
    if not isinstance(rows, list) or not all(isinstance(x, dict) and
                                             isinstance(x.get('text'), str) for x in rows):
        raise ValueError('Unsupported Whisper JSON (expected text/transcription/segments)')
    return ' '.join(row['text'] for row in rows)


def scenes_from_brief(brief: dict) -> list[dict]:
    if brief.get('version') != 1 or not isinstance(brief.get('shots'), list):
        raise ValueError('Expected Persona Production Brief v1 with shots[]')
    shots, script = brief['shots'], brief.get('script', [])
    if not shots or not isinstance(script, list):
        raise ValueError('Nonempty shots[] and script[] required')
    scripts = {s.get('order'): s for s in script if isinstance(s, dict)}
    orders = set()
    result = []
    for shot in shots:
        if not isinstance(shot, dict):
            raise ValueError('Invalid shot entry')
        order = shot.get('order')
        if type(order) is not int or order < 1 or order in orders:
            raise ValueError('Duplicate or invalid scene order')
        orders.add(order)
        beat = scripts.get(order)
        if beat is None:
            raise ValueError(f'Missing script for scene {order}')
        duration = shot.get('durationSec', beat.get('durationSec'))
        if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not 0.25 <= duration <= 900:
            raise ValueError('Invalid shot duration')
        manual_source = brief.get('manualSource') or {}
        if not isinstance(manual_source, dict):
            raise ValueError('Invalid manualSource')
        manual = next((s for s in manual_source.get('scenes', [])
                       if isinstance(s, dict) and s.get('order') == order), None)
        kind = manual.get('kind') if manual else shot.get('kind', beat.get('kind',
            'spoken' if str(beat.get('line', '')).strip() else 'visual'))
        if kind not in ('spoken', 'visual'):
            raise ValueError('Unknown shot kind')
        expected = manual.get('spokenText', '') if manual else beat.get('line', '')
        result.append({'order': order, 'durationSec': float(duration), 'kind': kind,
                       'expectedSpeech': expected if kind == 'spoken' else '',
                       'action': str(shot.get('action', beat.get('action', '')))})
    return sorted(result, key=lambda s: s['order'])


def inspect(brief_path: Path, input_dir: Path, bindings_path: Path,
            *, approval_sha256: str, ffprobe: str = 'ffprobe') -> dict:
    brief = load_json(brief_path)
    brief_hash = sha256_file(brief_path)
    if approval_sha256.lower() != brief_hash:
        raise ValueError('Approval SHA-256 does not match current brief; stop')
    if not input_dir.is_dir():
        raise ValueError('input/ is missing')
    bindings = load_json(bindings_path)
    if bindings.get('version') != 1 or not isinstance(bindings.get('bindings'), list):
        raise ValueError('Expected version=1 and bindings[]')
    mapping = {}
    for b in bindings['bindings']:
        if not isinstance(b, dict) or type(b.get('sceneOrder')) is not int:
            raise ValueError('Invalid binding')
        order = b['sceneOrder']
        if order in mapping:
            raise ValueError(f'Duplicate binding for scene {order}')
        mapping[order] = b
    rows = []
    for scene in scenes_from_brief(brief):
        order = scene['order']
        b = mapping.get(order)
        entry = {'sceneOrder': order, 'action': scene['action'], 'expectedSec': scene['durationSec'],
                 'status': 'MISSING', 'issues': [], 'source': None}
        if b is None:
            entry['issues'].append('no_explicit_binding')
            rows.append(entry)
            continue
        try:
            path = source_in_input(input_dir, b.get('file'))
            actual_hash = sha256_file(path)
            if (not isinstance(b.get('sha256'), str) or
                    not SHA256_RE.fullmatch(b['sha256']) or b['sha256'] != actual_hash):
                raise ValueError('Source SHA-256 missing or mismatched')
            meta = probe(path, ffprobe)
            entry['source'] = {'file': path.name, 'sha256': actual_hash, **meta}
            if meta['durationSec'] < scene['durationSec'] * 0.85:
                entry['issues'].append('insufficient_footage_duration')
            if scene['kind'] == 'spoken':
                if not meta['hasAudio']:
                    entry['issues'].append('no_audio_for_spoken_scene')
                observed = b.get('reviewedTranscript')
                verified = (isinstance(observed, str) and
                            isinstance(b.get('speechReviewedBy'), str) and
                            bool(b['speechReviewedBy'].strip()))
                if not verified and b.get('transcriptFile'):
                    # Sidecars must also be local regular files and hash-bound to the source.
                    name = b['transcriptFile']
                    if Path(name).name != name or not name.lower().endswith('.json'):
                        raise ValueError('Invalid transcript basename')
                    sidecar = input_dir / name
                    if not sidecar.is_file() or sidecar.is_symlink():
                        raise ValueError('Whisper JSON sidecar missing')
                    observed = transcript_text(sidecar, actual_hash)
                    entry['issues'].append('asr_not_author_reviewed')
                if not isinstance(observed, str) or not speech_contains(scene['expectedSpeech'], observed):
                    entry['issues'].append('expected_speech_not_confirmed')
                elif not verified:
                    entry['issues'].append('speech_requires_author_review')
            elif not (b.get('visualReviewedBy') and b.get('visualActionConfirmed') is True):
                entry['issues'].append('visual_action_not_author_confirmed')
            entry['status'] = ('DEFECT' if any(x in entry['issues'] for x in
                               ('insufficient_footage_duration', 'no_audio_for_spoken_scene',
                                'expected_speech_not_confirmed')) else
                               'REVIEW' if entry['issues'] else 'COVERED')
        except FileNotFoundError as exc:
            entry['status'] = 'MISSING'
            entry['issues'].append('missing_bound_file: ' + str(exc)[:200])
        except (ValueError, OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            entry['status'] = 'DEFECT'
            entry['issues'].append('invalid_source_or_evidence: ' + str(exc)[:200])
        rows.append(entry)
    stats = {name: sum(x['status'] == name for x in rows)
             for name in ('COVERED', 'REVIEW', 'MISSING', 'DEFECT')}
    return {'version': 1, 'briefSha256': brief_hash,
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'approval': 'sha256_attested_by_invoker', 'scenes': rows,
            'summary': stats, 'readyForUnattendedRender': stats['COVERED'] == len(rows)}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--brief', type=Path, required=True)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--bindings', type=Path, required=True)
    p.add_argument('--approval-sha256', required=True)
    p.add_argument('--ffprobe', default='ffprobe')
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    try:
        report = inspect(a.brief, a.input, a.bindings, approval_sha256=a.approval_sha256,
                         ffprobe=a.ffprobe)
        if a.output.exists():
            raise FileExistsError('Refusing to overwrite previous report')
        a.output.parent.mkdir(parents=True, exist_ok=True)
        a.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report['summary']))
        return 0 if report['readyForUnattendedRender'] else 2
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print('BLOCKED: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())