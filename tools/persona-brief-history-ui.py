import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
brief_path = root / 'docs/persona-delivery/candidate-production-brief.json'
brief = json.loads(brief_path.read_text(encoding='utf-8'))
project = dict(id='ui-actor-composer', title=brief['sourceTitle'], contentType='reel', sourceIdea=brief['sourceAngle'],
               script=None, shootingPlan=None, editPlan=None, timeline=None, mediaAssets=[], cloudAssetRefs=[],
               processing=None, captions=None, socialCaptions=None, stage='strategy', qa=None, lastOpenStep='idea',
               createdAt='2026-10-31T10:00:00.000Z', updatedAt='2026-10-31T10:00:00.000Z', schemaVersion=1, revision=1)
collection = dict(schemaVersion=1, activeProjectId=project['id'], projects=[project])

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r'C:\Users\Kostya\Documents\Codex\tools\browsers\chrome\win64-152.0.7977.82\chrome-win64\chrome.exe')
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page.set_default_timeout(10000)
    page.goto('http://127.0.0.1:5178/')
    page.evaluate("value => localStorage.setItem('lifeos:persona:projects:v1', value)", json.dumps(collection, ensure_ascii=False))
    page.goto('http://127.0.0.1:5178/#persona/project/ui-actor-composer')
    page.wait_for_load_state('networkidle')
    page.get_by_label('Импортировать съёмочный бриф JSON').set_input_files(str(brief_path))
    page.get_by_text('Сценарий · версия 1').wait_for()
    page.get_by_text('Ещё не одобрен автором').wait_for()
    assert page.get_by_text('История сценария · 1 версий').count() == 1
    page.get_by_text('Сценарий · версия 1').scroll_into_view_if_needed()
    page.screenshot(path=str(root / 'docs/persona-delivery/browser-history-import.png'), full_page=True)
    page.screenshot(path=str(root / 'docs/persona-delivery/browser-history-import.jpg'), type='jpeg', quality=55)
    page.wait_for_timeout(650)
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_text('Сценарий · версия 1').wait_for()
    page.get_by_text('Ещё не одобрен автором').wait_for()
    assert page.get_by_text('История сценария · 1 версий').count() == 1
    saved = page.evaluate("JSON.parse(localStorage.getItem('lifeos:persona:projects:v1')).projects[0]")
    assert len(saved['scenarioWorkspace']['script']['revisions']) == 1
    assert [beat['line'] for beat in saved['scenarioWorkspace']['script']['currentRevision']['beats']] == [beat['line'] for beat in brief['script']]
    assert 'approval' not in saved['scenarioWorkspace']['script']
    page.get_by_text('Сценарий · версия 1').scroll_into_view_if_needed()
    page.screenshot(path=str(root / 'docs/persona-delivery/browser-history-reload.png'), full_page=True)
    page.screenshot(path=str(root / 'docs/persona-delivery/browser-history-reload.jpg'), type='jpeg', quality=55)
    print('UI PASS: seven exact scenes, one unapproved revision, persisted after reload')
    browser.close()
