"""Run: python -m unittest discover -s . -p 'test_*.py' -v"""
from __future__ import annotations
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from coverage_inspector import inspect, sha256_file
from approved_moments_library import MomentsLibrary
from production_economics import ProductionEconomics
from creative_style_validator import check, read_json

ROOT = Path(__file__).parent


def make_clip(path: Path, seconds=2):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
                    '-i', 'color=c=gray:s=160x120:r=25', '-f', 'lavfi',
                    '-i', 'sine=frequency=330:sample_rate=16000',
                    '-t', str(seconds), '-c:v', 'mpeg4', '-c:a', 'aac', '-y', str(path)],
                   timeout=25, check=True, capture_output=True)


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg/FFprobe required')
class TestCoverage(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.input = self.root / 'input'
        self.input.mkdir()
        self.clip = self.input / 'scene01.mp4'
        make_clip(self.clip)
        self.digest = sha256_file(self.clip)
        self.brief = self.root / 'brief.json'
        self.brief.write_text(json.dumps({'version': 1,
            'shots': [{'order': 1, 'action': 'Actor speaks', 'durationSec': 1},
                      {'order': 2, 'action': 'Actor reacts', 'durationSec': 1}],
            'script': [{'order': 1, 'line': 'Привет, мир', 'durationSec': 1},
                       {'order': 2, 'line': '', 'durationSec': 1}]}), encoding='utf8')
        self.bindings = self.root / 'bindings.json'

    def tearDown(self): self.tmp.cleanup()

    def report(self, bindings):
        self.bindings.write_text(json.dumps({'version': 1, 'bindings': bindings}), encoding='utf8')
        return inspect(self.brief, self.input, self.bindings, approval_sha256=sha256_file(self.brief))

    def test_covered_and_missing(self):
        r = self.report([{'sceneOrder': 1, 'file': self.clip.name, 'sha256': self.digest,
                          'reviewedTranscript': 'Привет, мир', 'speechReviewedBy': 'Author'}])
        self.assertEqual(r['summary'], {'COVERED': 1, 'REVIEW': 0, 'MISSING': 1, 'DEFECT': 0})
        self.assertFalse(r['readyForUnattendedRender'])

    def test_video_visual_requires_author_review(self):
        r = self.report([{'sceneOrder': 2, 'file': self.clip.name, 'sha256': self.digest}])
        self.assertEqual(r['scenes'][1]['status'], 'REVIEW')
        r = self.report([{'sceneOrder': 2, 'file': self.clip.name, 'sha256': self.digest,
                          'visualReviewedBy': 'Author', 'visualActionConfirmed': True}])
        self.assertEqual(r['scenes'][1]['status'], 'COVERED')

    def test_hash_mismatch_and_approval_block(self):
        r = self.report([{'sceneOrder': 1, 'file': self.clip.name, 'sha256': '0' * 64}])
        self.assertEqual(r['scenes'][0]['status'], 'DEFECT')
        with self.assertRaises(ValueError):
            inspect(self.brief, self.input, self.bindings, approval_sha256='0' * 64)

    def test_asr_is_not_human_approval(self):
        sidecar = self.input / 'asr.json'
        sidecar.write_text(json.dumps({'sourceSha256': self.digest,
                                       'transcription': [{'text': 'Привет, мир'}]}), encoding='utf8')
        r = self.report([{'sceneOrder': 1, 'file': self.clip.name, 'sha256': self.digest,
                          'transcriptFile': sidecar.name}])
        self.assertEqual(r['scenes'][0]['status'], 'REVIEW')


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg/FFprobe required')
class TestMoments(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.video = self.root / 'a.mp4'; make_clip(self.video)
        self.lib = MomentsLibrary(self.root / 'approved.sqlite3')

    def tearDown(self): self.tmp.cleanup()

    def test_add_and_suggest_by_content_hash(self):
        row = self.lib.add(self.video, 0.1, 0.8, kind='acting', score=5,
                           approved_by='Author', confirmed=True, tags=['reaction'])
        renamed = self.root / 'renamed.mp4'
        shutil.copy2(self.video, renamed)
        found = self.lib.suggest(renamed)
        self.assertEqual(found[0]['id'], row['id'])
        self.assertEqual(found[0]['status'], 'AUTHOR_APPROVED_CANDIDATE')
        self.lib.review(row['id'], score=3, reviewed_by='Author', notes='Not as strong')
        self.assertEqual(self.lib.suggest(renamed), [])

    def test_no_unapproved_or_invalid_interval(self):
        with self.assertRaises(ValueError):
            self.lib.add(self.video, 0, 1, kind='acting', score=5,
                         approved_by='Author', confirmed=False)
        with self.assertRaises(ValueError):
            self.lib.add(self.video, 0, 99, kind='acting', score=5,
                         approved_by='Author', confirmed=True)


class TestEconomics(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.e = ProductionEconomics(Path(self.tmp.name) / 'economics.sqlite3')
    def tearDown(self): self.tmp.cleanup()

    def test_unknown_savings_not_assumed(self):
        self.e.create('job-a', 20)
        r = self.e.report('job-a')
        self.assertIsNone(r['minutesSaved'])
        self.assertFalse(r['savingsVerified'])

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
    def test_savings_only_with_real_approved_mp4(self):
        video = Path(self.tmp.name) / 'accepted.mp4'
        make_clip(video)
        self.e.create('job-c', 20)
        self.e.record_manual('job-c', 6, category='review')
        self.e.approve_output('job-c', video, reviewer='Author', confirmed=True)
        self.assertIsNone(self.e.report('job-c')['minutesSaved'])
        self.e.mark_manual_complete('job-c')
        self.assertEqual(self.e.report('job-c')['minutesSaved'], 14)
        self.e.record_manual('job-c', 1, category='correction')
        self.assertIsNone(self.e.report('job-c')['minutesSaved'])
        self.e.mark_manual_complete('job-c')
        self.assertEqual(self.e.report('job-c')['minutesSaved'], 13)

    def test_elapsed_and_recorded_manual_work(self):
        self.e.create('job-b', 20)
        token = self.e.start_stage('job-b', 'render')
        with self.assertRaises(ValueError): self.e.start_stage('job-b', 'render')
        self.e.finish_stage(token)
        self.e.record_manual('job-b', 6, category='correction')
        self.assertEqual(self.e.report('job-b')['manualCorrections'], 1)
        self.e.mark_manual_complete('job-b')
        self.assertIsNone(self.e.report('job-b')['minutesSaved'])  # No approved MP4


class TestStyle(unittest.TestCase):
    def setUp(self):
        self.contract = read_json(ROOT / 'creative_style_contract.json')
        self.plan = {'styleId': self.contract['styleId'], 'renderIntent': {
            'inventoryComplete': True, 'effects': ['film_grain'], 'transitions': ['cut'],
            'captions': {'style': 'cinematic', 'maxLines': 2, 'maxTextWidthRatio': .8,
                         'marginLeftRatio': .1, 'marginRightRatio': .1,
                         'marginTopRatio': .15, 'marginBottomRatio': .15},
            'color': {'preset': 'natural-clean', 'colorSpace': 'rec709-sdr', 'lutMix': .6},
            'publicationApproved': False}}

    def test_pass(self):
        self.assertEqual(check(self.plan, self.contract)['status'], 'PASS')

    def test_forbidden_effect_and_unsafe_captions(self):
        self.plan['renderIntent']['effects'].append('glitch')
        self.plan['renderIntent']['captions']['marginBottomRatio'] = .02
        result = check(self.plan, self.contract)
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertGreaterEqual(len(result['errors']), 2)

    def test_missing_inventory_is_blocked(self):
        self.plan['renderIntent']['inventoryComplete'] = False
        self.assertEqual(check(self.plan, self.contract)['status'], 'BLOCKED')
        del self.plan['renderIntent']
        self.assertEqual(check(self.plan, self.contract)['status'], 'BLOCKED')


if __name__ == '__main__':
    unittest.main()