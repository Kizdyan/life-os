import json,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
# Opt-in REAL local Qwen + Whisper + FFmpeg browser E2E. No mocks or storage mutations.
# Run with 001.mp4...011.mp4 synthetic takes: first two say the exact test lines below.
import argparse
args=argparse.ArgumentParser()
args.add_argument('--takes',required=True)
args.add_argument('--artifacts',required=True)
args.add_argument('--chrome',required=True)
config=args.parse_args()
root=Path(config.artifacts).resolve();root.mkdir(parents=True,exist_ok=False)
takes=Path(config.takes).resolve()
text='Название: Одиннадцать кадров · техническая проверка\n0–3 сек: Взгляд в камеру. Реплика: Я говорю первую реплику.\n3–6 сек: За клавишами. Реплика: Музыка меняет настроение.\n6–7 сек: Визуальное действие 3. (Текст: КАДР 3)\n7–8 сек: Визуальное действие 4. (Текст: КАДР 4)\n8–9 сек: Визуальное действие 5. (Текст: КАДР 5)\n9–10 сек: Визуальное действие 6. (Текст: КАДР 6)\n10–11 сек: Визуальное действие 7. (Текст: КАДР 7)\n11–12 сек: Визуальное действие 8. (Текст: КАДР 8)\n12–13 сек: Визуальное действие 9. (Текст: КАДР 9)\n13–14 сек: Визуальное действие 10. (Текст: КАДР 10)\n14–15 сек: Визуальное действие 11. (Текст: КАДР 11)\nМузыка: собственный звук синтетического теста.'
with sync_playwright() as p:
 browser=p.chromium.launch_persistent_context(str(root/'browser'),headless=True,viewport={'width':1440,'height':1000},executable_path=config.chrome)
 page=browser.new_page();page.set_default_timeout(15000);errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 def watch(r):
  if r.url.endswith('/status') and ':47832/' in r.url:
   v=r.json()
   if v.get('state')=='failed':errors.append(str(v.get('error')))
   if (v.get('exports') or {}).get('state')=='failed':errors.append(str(v['exports'].get('error')))
 page.on('response',watch)
 try:
  page.goto('http://127.0.0.1:5173/#persona',wait_until='domcontentloaded')
  page.get_by_role('button',name='Создать Reels',exact=True).click()
  page.get_by_role('button',name='Вставить свой сценарий',exact=True).click()
  page.get_by_label('Текст своего сценария').fill(text)
  page.get_by_role('button',name='Разобрать сценарий без творческой критики',exact=True).click()
  page.get_by_label('Предпросмотр авторского пакета').or_(page.get_by_label('Авторский сценарий из ChatGPT').get_by_role('alert')).first.wait_for(timeout=600000)
  assert page.get_by_label('Предпросмотр авторского пакета').count(), page.locator('body').inner_text()
  page.screenshot(path=str(root/'01-parsed.png'))
  page.get_by_role('button',name='Подтвердить мой сценарий и перейти к съёмке',exact=True).click()
  page.get_by_label('Выбрать дубли для ИИ-монтажа').wait_for()
  if page.get_by_label('Выбрать дубли для ИИ-монтажа').is_disabled():raise RuntimeError(page.locator('body').inner_text()[-20000:])
  assert 'ЭКРАННЫЙ ТИТР' not in page.locator('.personaShootNowScene').inner_text()
  page.get_by_label('Выбрать дубли для ИИ-монтажа').set_input_files([str(takes/f'{i:03}.mp4') for i in range(1,12)])
  page.wait_for_function('!document.body.innerText.includes("Проверяем длительность выбранных файлов")')
  assert page.get_by_label('Сцена для 001.mp4').input_value()=='1'
  assert page.get_by_label('Сцена для 002.mp4').input_value()=='2'
  page.get_by_role('button',name='Смонтировать ИИ',exact=True).click()
  for _ in range(600):
   if errors:raise RuntimeError(errors)
   if page.get_by_text('MP4 и QA сохранены как локальный результат проекта.',exact=False).count():break
   if page.get_by_text('Worker остановлен',exact=False).count():raise RuntimeError(page.locator('body').inner_text()[-20000:])
   page.wait_for_timeout(1000)
  else:raise RuntimeError('MP4 timeout: '+page.locator('body').inner_text()[-18000:])
  video=page.locator('section[aria-label="ИИ-монтаж на этом компьютере"] video');video.evaluate('(v)=>v.play()');page.wait_for_timeout(1500)
  assert video.evaluate('(v)=>v.currentTime')>.3
  page.get_by_role('button',name='Сделать 4 версии для соцсетей',exact=True).click()
  page.get_by_role('link',name='Скачать youtube.mp4',exact=True).wait_for(timeout=600000)
  for platform in ['shorts','reels','vk','youtube']:
   link=page.get_by_role('link',name='Скачать '+platform+'.mp4',exact=True);res=page.request.get(link.get_attribute('href'));assert res.status==200;(root/(platform+'.mp4')).write_bytes(res.body())
  page.screenshot(path=str(root/'02-four-versions.png'))
  page.reload(wait_until='domcontentloaded');page.get_by_role('link',name='Скачать youtube.mp4',exact=True).wait_for()
  assert page.get_by_text('Последний локальный результат:',exact=False).count()==1
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(root/'03-mobile.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth')
  assert not errors,errors
  assert not any('/ideas' in u or '/direct' in u for u in requests),requests
  (root/'UI-PASS.json').write_text(json.dumps({'status':'PASS','errors':errors,'noCreativeRequests':True,'ui':page.locator('body').inner_text()},ensure_ascii=False,indent=2),encoding='utf-8')
  print('MANUAL_INPUT_FOUR_EXPORTS_UI_PASS')
 except Exception:
  page.screenshot(path=str(root/'failure.png'));print(page.locator('body').inner_text()[-20000:]);raise
 finally:browser.close()
