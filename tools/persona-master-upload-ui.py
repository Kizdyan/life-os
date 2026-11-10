"""Real local Chrome regression: master picker validates and recovers.

Requires Python Playwright, an explicit synthetic MP4, local Persona/Worker.
No localStorage edits, model mocks, personal-file search or render approval.
"""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5173/#persona')
parser.add_argument('--browser', required=True)
parser.add_argument('--source', required=True, help='Explicit synthetic test MP4')
parser.add_argument('--output', required=True, help='New evidence directory')
args = parser.parse_args()
source = Path(args.source).resolve()
out = Path(args.output).resolve()
out.mkdir(exist_ok=False)
original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
repo = Path(__file__).resolve().parent.parent
brief = json.loads((repo/'docs/persona-first-reel-production-brief-2026-10-29.json').read_text(encoding='utf-8'))
brief.update(ideaId='synthetic-upload-regression', sourceTitle='Synthetic upload regression', sourceAngle='Technical test only')
brief['script'] = brief['script'][:2]
brief['shots'] = brief['shots'][:2]
brief.pop('preEditPlan', None)
for index, line in enumerate(['Я говорю первую реплику.', 'Музыка меняет настроение.']):
    brief['script'][index].update(line=line, durationSec=2.5)
    brief['shots'][index]['durationSec'] = 2.5
brief['hook']['firstSeconds'] = brief['script'][0]['line']
for adaptation in brief['adaptations'].values():
    adaptation['durationSec'] = 5
with sync_playwright() as p:
    browser = p.chromium.launch_persistent_context(str(out/'browser'), headless=True, executable_path=args.browser, viewport={'width':390,'height':844})
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(args.url, wait_until='domcontentloaded')
        page.get_by_role('button', name='Создать Reels', exact=True).click()
        page.get_by_label('Импортировать съёмочный бриф JSON').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(brief, ensure_ascii=False).encode()})
        page.get_by_label('Имя редактора').fill('Synthetic test')
        page.get_by_label('Комментарий редактора').fill('Technical fixture approval only')
        fact = page.get_by_role('checkbox', name='Факты в свободных репликах сверены с автором или источником.')
        if fact.count(): fact.check()
        page.get_by_role('button', name='Одобрить для съёмки', exact=True).click()
        page.locator('.personaMvpSteps button').nth(3).click()
        page.get_by_role('checkbox', name='Авто-режиссура (ИИ)', exact=True).uncheck()
        page.get_by_role('checkbox', name='Один длинный мастер-ассет', exact=True).check()
        picker = page.get_by_label('Выбрать дубли для ИИ-монтажа')
        launch = page.get_by_role('button', name='Смонтировать ИИ', exact=True)
        assert launch.is_disabled()
        picker.set_input_files({'name':'invalid.txt','mimeType':'text/plain','buffer':b'x'*2048})
        assert launch.is_disabled()
        page.get_by_text('Неподдерживаемый формат или имя файла:', exact=False).wait_for()
        page.screenshot(path=str(out/'invalid-master.png'), full_page=True)
        picker.set_input_files(str(source))
        page.wait_for_function('!Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Смонтировать ИИ").disabled')
        assert page.get_by_text('Неподдерживаемый формат или имя файла:', exact=False).count() == 0
        assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth')
        page.screenshot(path=str(out/'valid-master.png'), full_page=True)
        assert not errors, errors
        assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
        (out/'RESULT.json').write_text(json.dumps({'status':'MASTER_PICKER_REGRESSION_PASS','sourceSha256':original_hash,'invalidBlocked':True,'validEnablesLaunch':True,'sourceUnchanged':True,'consoleErrors':errors,'renderStarted':False}, indent=2), encoding='utf-8')
    finally:
        browser.close()
