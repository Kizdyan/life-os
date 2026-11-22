"""Real isolated LOCAL_RUNTIME browser proof; no remote success mocks or author approval."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173')
parser.add_argument('--output', required=True)
parser.add_argument('--chrome', default='C:/Users/Kostya/Documents/Codex/tools/browsers/chrome/win64-152.0.7977.82/chrome-win64/chrome.exe')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
content_id = 'carousel-fridge-hum-v3'
date = '2026-11-26'
base = args.url.rstrip('/')
evidence = {'contentId': content_id, 'provenance': 'LOCAL_RUNTIME', 'status': 'RUNNING',
            'paidRequests': 0, 'cloudVerified': False, 'diveMConnected': False,
            'authorApprovalsChanged': False, 'publicationPerformed': False,
            'externalRequestsBlocked': [], 'pageErrors': []}

def snapshot(page):
    return page.evaluate('''async ({id,date}) => {
      const model=await import('/src/personaEditorialModel.ts');
      const api=await import('/src/api.ts');
      return {post:model.loadEditorialStore(localStorage).posts.find(p=>p.id===id),
        tasks:await api.today(date),backendMode:api.backendMode,
        localRuntime:JSON.parse(localStorage.getItem('life-os:local-runtime:v1')||'null')};
    }''', {'id': content_id, 'date': date})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=args.chrome)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    def guard(route):
        parsed = urlparse(route.request.url)
        if parsed.scheme in ('http', 'https') and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
            evidence['externalRequestsBlocked'].append(parsed.hostname)
            if parsed.hostname in ('api.openai.com', 'api.perplexity.ai', 'openrouter.ai'):
                evidence['paidRequests'] += 1
            route.abort()
        else:
            route.continue_()
    context.route('**/*', guard)
    page = context.new_page()
    page.on('pageerror', lambda error: evidence['pageErrors'].append(str(error)))
    try:
        page.goto(base + '/?local=1#persona', wait_until='networkidle')
        page.get_by_test_id('open-carousel-fridge-hum-v3').click(timeout=15000)
        bridge = page.get_by_test_id('persona-lifeos-bridge')
        expect(bridge).to_contain_text(content_id)
        expect(bridge).to_contain_text('Локальное расписание на этом устройстве.')
        original = snapshot(page)
        assert original['backendMode'] == 'local'
        assert original['post']['id'] == content_id
        approvals = original['post']['approvals']
        assert not approvals['content'] and not approvals['design']
        bridge.get_by_label('Дата просмотра').fill(date)
        bridge.get_by_label('Время', exact=True).fill('18:00')
        bridge.get_by_role('button', name='Добавить просмотр в Life OS', exact=True).click()
        expect(bridge).to_contain_text('Авторский просмотр сохранён и проверен в расписании.')
        expect(bridge.get_by_test_id('persona-lifeos-review-task')).to_have_count(1)
        first = snapshot(page)
        matching = [task for task in first['tasks'] if task['kind'] == 'persona-review:' + content_id]
        assert len(matching) == 1
        task_id = matching[0]['id']
        assert matching[0]['status'] == 'planned'
        assert matching[0]['planned_start'][11:16] == '18:00'
        assert first['post'] == original['post']
        # Repeating with a different time does not move the user's saved task.
        bridge.get_by_label('Время', exact=True).fill('19:00')
        bridge.get_by_role('button', name='Добавить просмотр в Life OS', exact=True).click()
        expect(bridge).to_contain_text('Просмотр уже есть в расписании.')
        again = snapshot(page)
        assert again['tasks'] == first['tasks']
        # A different date clears the previous verified report immediately.
        bridge.get_by_label('Дата просмотра').fill('2026-11-27')
        expect(bridge.get_by_test_id('persona-lifeos-review-task')).to_have_count(0)
        expect(bridge).not_to_contain_text('Эрика прочитала материал')
        bridge.get_by_role('button', name='Эрика: проверить статус материала', exact=True).click()
        expect(bridge).to_contain_text('На выбранную дату задач просмотра этого материала нет.')
        bridge.get_by_label('Дата просмотра').fill(date)
        bridge.get_by_role('button', name='Эрика: проверить статус материала', exact=True).click()
        expect(bridge.get_by_test_id('persona-lifeos-review-task')).to_have_count(1)
        assert snapshot(page)['tasks'] == first['tasks']
        # Reopen actual V3 after reload; only read the existing review task.
        page.reload(wait_until='networkidle')
        page.get_by_test_id('open-carousel-fridge-hum-v3').click(timeout=15000)
        bridge = page.get_by_test_id('persona-lifeos-bridge')
        bridge.get_by_label('Дата просмотра').fill(date)
        bridge.get_by_role('button', name='Эрика: проверить статус материала', exact=True).click()
        expect(bridge.get_by_test_id('persona-lifeos-review-task')).to_have_count(1)
        expect(bridge).to_contain_text('Текст: ожидает авторского просмотра.')
        expect(bridge).to_contain_text('Оформление: ожидает авторского просмотра.')
        expect(bridge).to_contain_text('DiveM не подключён.')
        final = snapshot(page)
        assert final['tasks'] == first['tasks']
        assert final['post'] == original['post']
        assert not evidence['pageErrors'], evidence['pageErrors']
        assert evidence['paidRequests'] == 0
        # Capture the complete component for narrow-screen visual review.
        bridge.screenshot(path=str(out / 'lifeos-erika-v3-review-mobile.png'))
        evidence.update({'status': 'PASS', 'taskId': task_id, 'task': matching[0],
                         'contentRevision': final['post']['revision'],
                         'reloadReadback': True, 'deduplication': True,
                         'differentDateClearsStatus': True, 'readOnlyErikaPreservesState': True,
                         'savedTimePreservedOnReplay': True, 'actualLocalRuntime': final['localRuntime'],
                         'authorApprovalsBefore': approvals,
                         'authorApprovalsAfter': final['post']['approvals']})
    except Exception as error:
        evidence.update({'status': 'FAIL', 'error': str(error)})
        page.screenshot(path=str(out / 'lifeos-erika-failure.png'), full_page=True)
        raise
    finally:
        (out / 'lifeos-erika-v3-proof.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
