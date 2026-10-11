import asyncio, json, os, subprocess, sys, tempfile, time
from dataclasses import dataclass
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:4174/persona-processing-harness.html'
DESKTOP='https://desktop.example:8787'
TOKEN='x'*64
VIDEO_BYTES=b''
SCOPE={'projectId':'project','contentItemId':'content','ideaId':'idea','ideaVersion':7,'sessionId':'shoot'}

def asset(ch):
 return {'id':ch*32,**SCOPE,'filename':ch+'.mp4','mime':'video/mp4','bytes':1024,
  'kind':'take','role':'primary_take','roleConfidence':'high','storage':'device_local',
  'state':'INTAKE_LOCAL','createdAt':'2026-10-11T00:00:00.000Z'}

def job(a,status='review',attempt=1,token=None,input_ready=True,available=True):
 jid='job-'+a['id']; value={'id':jid,'status':status,'request':{'id':jid,'assetId':a['id'],
  'projectId':a['projectId'],'contentItemId':a['contentItemId'],'ideaId':a['ideaId'],
  'ideaVersion':a['ideaVersion'],'sessionId':a['sessionId']},'inputReady':input_ready,
  'attempt':attempt,'error':None,'outputAvailable':available}
 if token:value['outputUrl']=f'/v1/jobs/{jid}/output?token={token}'
 return value

@dataclass
class Pending:
 route: object
 request: object
 release: asyncio.Future
 done: asyncio.Future

class ControlledServer:
 def __init__(self):self.items=[];self.history=[];self.changed=asyncio.Event();self.output_status=200
 async def handler(self,route,request):
  self.history.append((request.method,request.url))
  if '/output?token=' in request.url:
   await route.fulfill(status=self.output_status,content_type='video/mp4',body=VIDEO_BYTES if self.output_status==200 else b'');return
  loop=asyncio.get_running_loop();done=loop.create_future();release=loop.create_future()
  item=Pending(route,request,release,done)
  self.items.append(item);self.changed.set()
  try:
   payload,status=await release
   await route.fulfill(status=status,content_type='application/json',body=json.dumps(payload))
  except asyncio.CancelledError:pass
  finally:
   if not done.done():done.set_result(None)
 async def take(self,method,path):
  deadline=time.monotonic()+5
  while True:
   for i,item in enumerate(self.items):
    if item.request.method==method and item.request.url.endswith(path):return self.items.pop(i)
   remain=deadline-time.monotonic()
   if remain<=0:raise AssertionError(f'missing request {method} {path}; pending={[x.request.url for x in self.items]}')
   self.changed.clear();await asyncio.wait_for(self.changed.wait(),remain)

async def release(item,payload,status=200):
 item.release.set_result((payload,status));await item.done

async def page_for(browser,assets):
 if isinstance(assets,dict):assets=[assets]
 page=await browser.new_page(viewport={'width':390,'height':844})
 await page.add_init_script(f"""
 localStorage.setItem('persona:processing:bridge:v1',JSON.stringify({{url:'{DESKTOP}',token:'{TOKEN}'}}));
 window.__intervals=[];window.setInterval=(fn)=>{{window.__intervals.push(fn);return window.__intervals.length;}};
 window.clearInterval=()=>{{}};
 """)
 server=ControlledServer();await page.route(DESKTOP+'/**',server.handler)
 await page.goto(URL)
 await page.evaluate('(x)=>window.__personaHarness.render(x.assets,x.scope)',{'assets':assets,'scope':SCOPE})
 return page,server

async def initial_review(page,server,a,token='0'*64):
 req=await server.take('GET','/v1/jobs/job-'+a['id']);await release(req,job(a,token=token))
 await page.locator('video').wait_for();return token

async def sync(page,server,a):
 await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
 req=await server.take('GET','/v1/jobs/job-'+a['id']);await release(req,job(a,token=None))
 return await server.take('POST','/v1/jobs/job-'+a['id']+'/output-access')

async def video_token(page):
 src=await page.locator('video').get_attribute('src')
 link=await page.locator('.personaProcessorOutput').get_attribute('href')
 assert link==src,'video and output link must expose the same scoped capability'
 return src.split('token=')[1] if src and 'token=' in src else None

async def settle(page):await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")

async def snapshot(page,a):
 raw=await page.evaluate("id=>localStorage.getItem('persona:processing:last-known:job-'+id)",a['id'])
 return json.loads(raw) if raw else None

async def status_text(page):return await page.locator('[role=status]').last.inner_text()

async def assert_tuple(page,a,status,attempt):
 saved=await snapshot(page,a);assert saved
 assert (saved['assetId'],saved['id'],saved['projectId'],saved['contentItemId'],saved['ideaId'],
  saved['ideaVersion'],saved['sessionId'],saved['attempt'],saved['status'])==(
  a['id'],'job-'+a['id'],a['projectId'],a['contentItemId'],a['ideaId'],
  a['ideaVersion'],a['sessionId'],attempt,status)

async def test_renewals(browser):
 a=asset('a')
 # R01: later successful renewal wins even when the older response arrives last.
 p,s=await page_for(browser,a);await initial_review(p,s,a)
 A=await sync(p,s,a);B=await sync(p,s,a);await release(B,job(a,token='b'*64));await p.locator('video').wait_for()
 await release(A,job(a,token='a'*64));assert await video_token(p)=='b'*64;await p.close();print('PASS R01')
 # R02: a later failure cannot discard the only successful renewal.
 p,s=await page_for(browser,a);await initial_review(p,s,a)
 A=await sync(p,s,a);B=await sync(p,s,a);await release(B,{'error':'network_timeout'},503);await release(A,job(a,token='a'*64))
 await settle(p);assert await video_token(p)=='a'*64;await p.close();print('PASS R02')
 # R03: an older failure cannot replace a newer success.
 p,s=await page_for(browser,a);await initial_review(p,s,a)
 A=await sync(p,s,a);B=await sync(p,s,a);await release(B,job(a,token='b'*64));await release(A,{'error':'network_timeout'},503)
 assert await video_token(p)=='b'*64;await p.close();print('PASS R03')
 # R04: an expired mounted URL is renewed by foreground reconciliation.
 p,s=await page_for(browser,a);await initial_review(p,s,a)
 A=await sync(p,s,a);await release(A,job(a,token='c'*64));assert await video_token(p)=='c'*64
 await p.close();print('PASS R04')
 # R05: a late renewal after unmount cannot mutate persisted state.
 p,s=await page_for(browser,a);await initial_review(p,s,a);before=await snapshot(p,a)
 A=await sync(p,s,a);await p.evaluate('window.__personaHarness.unmount()')
 await release(A,job(a,status='ready',token='d'*64));assert await snapshot(p,a)==before
 await p.close();print('PASS R05')
 # R06: reconnect renewal supersedes the pre-disconnect request.
 p,s=await page_for(browser,a);await initial_review(p,s,a)
 A=await sync(p,s,a);B=await sync(p,s,a);await release(B,job(a,token='e'*64));await release(A,job(a,token='a'*64))
 assert await video_token(p)=='e'*64;await p.close();print('PASS R06')

async def trigger_get(page,server,a):
 await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
 return await server.take('GET','/v1/jobs/job-'+a['id'])

async def test_status_races(browser):
 a=asset('a')
 p,s=await page_for(browser,a);first=await s.take('GET','/v1/jobs/job-'+a['id']);await release(first,job(a,'failed',1,available=False));await settle(p)
 old=await trigger_get(p,s,a);await p.get_by_role('button',name='Повторить обработку').click()
 retry=await s.take('POST','/v1/jobs/job-'+a['id']+'/retry');await release(retry,job(a,'queued',2,available=False))
 newer=await trigger_get(p,s,a);await release(newer,job(a,'processing',2,available=False));await release(old,job(a,'failed',1,available=False));await settle(p)
 assert 'Обрабатывается' in await status_text(p);assert await p.get_by_role('button',name='Повторить обработку').count()==0
 await assert_tuple(p,a,'processing',2);assert sum('/retry' in u for _,u in s.history)==1;await p.close();print('PASS S01')

 p,s=await page_for(browser,a);await initial_review(p,s,a);old=await trigger_get(p,s,a)
 await p.get_by_role('button',name='Подтвердить — готово').click();approve=await s.take('POST','/v1/jobs/job-'+a['id']+'/approve')
 await release(approve,job(a,'ready',1,'r'*64));await release(old,job(a,'review',1,'q'*64));await settle(p)
 assert 'Готово' in await status_text(p);assert await p.get_by_role('button',name='Подтвердить — готово').count()==0
 await assert_tuple(p,a,'ready',1);await p.close();print('PASS S02')

 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'queued',1,available=False));await settle(p)
 p1=await trigger_get(p,s,a);p2=await trigger_get(p,s,a);await release(p2,job(a,'processing',1,available=False));await release(p1,job(a,'queued',1,available=False));await settle(p)
 assert 'Обрабатывается' in await status_text(p);await assert_tuple(p,a,'processing',1);await p.close();print('PASS S03')

 for reverse in (False,True):
  p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'failed',1,available=False));await settle(p)
  old=await trigger_get(p,s,a);await p.get_by_role('button',name='Повторить обработку').click();retry=await s.take('POST','/v1/jobs/job-'+a['id']+'/retry')
  if reverse:await release(retry,job(a,'queued',2,available=False));await release(old,job(a,'failed',1,available=False))
  else:await release(old,job(a,'failed',1,available=False));await release(retry,job(a,'queued',2,available=False))
  await settle(p);await assert_tuple(p,a,'queued',2);assert sum('/retry' in u for _,u in s.history)==1;await p.close()
 print('PASS S04')

async def switch_assets(page,assets):
 await page.evaluate('(x)=>window.__personaHarness.render(x.assets,x.scope)',{'assets':assets,'scope':SCOPE})

async def test_asset_isolation(browser):
 a,b=asset('a'),asset('b')
 p,s=await page_for(browser,a);missing=await s.take('GET','/v1/jobs/job-'+a['id']);await release(missing,{'error':'job_not_found'},404);await settle(p)
 await p.get_by_role('button',name='Отправить на обработку').click();post=await s.take('POST','/v1/jobs')
 await switch_assets(p,[b]);bget=await s.take('GET','/v1/jobs/job-'+b['id']);await release(bget,job(b,'processing',0,available=False))
 await release(post,job(a,'queued',0,input_ready=False,available=False));await settle(p)
 leaked=[item for item in list(s.items) if '/job-'+a['id']+'/transfer' in item.request.url]
 for item in leaked:s.items.remove(item);await release(item,{'error':'obsolete_scope'},409)
 assert 'b.mp4' in await p.locator('.personaProcessorFile').inner_text();assert all('/job-'+a['id']+'/transfer' not in u for _,u in s.history)
 await assert_tuple(p,b,'processing',0);await p.close();print('PASS M01')

 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'processing',0,available=False));await settle(p);old=await trigger_get(p,s,a)
 await switch_assets(p,[b]);bget=await s.take('GET','/v1/jobs/job-'+b['id']);await release(bget,job(b,'processing',3,available=False));await release(old,job(a,'review',0,'a'*64));await settle(p)
 await assert_tuple(p,b,'processing',3);assert 'b.mp4' in await p.locator('.personaProcessorFile').inner_text();await p.close();print('PASS M02')

 p,s=await page_for(browser,a);await initial_review(p,s,a);renew=await sync(p,s,a)
 await switch_assets(p,[b]);bget=await s.take('GET','/v1/jobs/job-'+b['id']);await release(bget,job(b,'review',0,'b'*64));await release(renew,job(a,'review',0,'a'*64));await settle(p)
 assert await video_token(p)=='b'*64;await p.close();print('PASS M03')

 p,s=await page_for(browser,[a,b]);await initial_review(p,s,a);await p.locator('select').select_option(b['id'])
 assert await p.locator('video').count()==0;assert await p.get_by_role('button',name='Подтвердить — готово').count()==0
 bget=await s.take('GET','/v1/jobs/job-'+b['id']);await release(bget,job(b,'queued',0,input_ready=True,available=False));await assert_tuple(p,b,'queued',0)
 await p.close();print('PASS M04')

async def test_lifecycle(browser):
 a=asset('a')
 # L01: an old callback from an unmounted tree cannot replace remounted state.
 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'processing',1,available=False));await settle(p)
 old=await trigger_get(p,s,a);await p.evaluate('window.__personaHarness.unmount()');await p.evaluate('window.__personaHarness.remount()')
 fresh=await s.take('GET','/v1/jobs/job-'+a['id']);await release(fresh,job(a,'ready',1,'f'*64));await release(old,job(a,'processing',1,available=False));await settle(p)
 await assert_tuple(p,a,'ready',1);assert await video_token(p)=='f'*64;await p.close();print('PASS L01')
 # L02: remount restores the same request without registration/upload.
 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'processing',2,available=False));await settle(p)
 await p.evaluate('window.__personaHarness.unmount()');await p.evaluate('window.__personaHarness.remount()');fresh=await s.take('GET','/v1/jobs/job-'+a['id']);await release(fresh,job(a,'processing',2,available=False));await settle(p)
 await assert_tuple(p,a,'processing',2);assert not any(method=='POST' and url.endswith('/v1/jobs') for method,url in s.history);await p.close();print('PASS L02')
 # L03: queued incomplete offers resume; committed input is never resent automatically.
 for ready in (False,True):
  p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'queued',1,input_ready=ready,available=False));await settle(p)
  await p.evaluate('window.__personaHarness.unmount()');await p.evaluate('window.__personaHarness.remount()');fresh=await s.take('GET','/v1/jobs/job-'+a['id']);await release(fresh,job(a,'queued',1,input_ready=ready,available=False));await settle(p)
  count=await p.get_by_role('button',name='Продолжить передачу видео').count();assert count==(0 if ready else 1)
  assert not any('/chunks/' in url or url.endswith('/commit') for _,url in s.history);await assert_tuple(p,a,'queued',1);await p.close()
 print('PASS L03')
 # L04/L05: server state wins over cached historical state after remount.
 for label,start,final,token in [('L04','processing','review','4'*64),('L05','review','review','5'*64)]:
  p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,start,1,token if start=='review' else None,available=start=='review'));await settle(p)
  await p.evaluate('window.__personaHarness.unmount()');await p.evaluate('window.__personaHarness.remount()');fresh=await s.take('GET','/v1/jobs/job-'+a['id']);await release(fresh,job(a,final,1,token));await p.locator('video').wait_for()
  await assert_tuple(p,a,final,1);assert await video_token(p)==token;await p.close();print('PASS '+label)
 # L06: ready persists historically while only playback access is renewed.
 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'ready',1,'6'*64));await p.locator('video').wait_for()
 await p.evaluate('window.__personaHarness.unmount()');await p.evaluate('window.__personaHarness.remount()');fresh=await s.take('GET','/v1/jobs/job-'+a['id']);await release(fresh,job(a,'ready',1,token=None))
 renew=await s.take('POST','/v1/jobs/job-'+a['id']+'/output-access');await release(renew,job(a,'ready',1,'7'*64));await p.locator('video').wait_for()
 await assert_tuple(p,a,'ready',1);assert await video_token(p)=='7'*64;assert not any('/approve' in u or (m=='POST' and u.endswith('/v1/jobs')) for m,u in s.history);await p.close();print('PASS L06')
 # L07: foreground reconciliation ignores an older background response.
 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'processing',1,available=False));await settle(p)
 old=await trigger_get(p,s,a);await p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
 assert len(s.items)==0
 await p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'))")
 fresh=await s.take('GET','/v1/jobs/job-'+a['id']);await release(fresh,job(a,'review',1,'8'*64));await release(old,job(a,'processing',1,available=False));await settle(p)
 await assert_tuple(p,a,'review',1);assert await video_token(p)=='8'*64;assert not any(m=='POST' and u.endswith('/v1/jobs') for m,u in s.history);await p.close();print('PASS L07')

async def test_secondary_ui(browser):
 a=asset('a')
 # B01: two DOM clicks in one task create at most one registration.
 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,{'error':'job_not_found'},404);await settle(p)
 await p.evaluate("()=>{const b=document.querySelector('.personaProcessor button.primary');b.click();b.click();}")
 first=await s.take('POST','/v1/jobs');await asyncio.sleep(0)
 posts=[first]+[item for item in list(s.items) if item.request.method=='POST' and item.request.url.endswith('/v1/jobs')]
 for item in posts:
  if item in s.items:s.items.remove(item)
  await release(item,job(a,'queued',0,input_ready=True,available=False))
 for _ in posts:
  follow=await s.take('GET','/v1/jobs/job-'+a['id']);await release(follow,job(a,'queued',0,input_ready=True,available=False))
 assert len(posts)<=1;await p.close();print('PASS B01')
 # B02: playback failure hides the broken promise, validates server state and preserves ready history.
 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'ready',1,'2'*64));await p.locator('video').wait_for()
 s.output_status=404;await p.locator('video').evaluate('(video)=>video.load()')
 validate=await s.take('POST','/v1/jobs/job-'+a['id']+'/output-access');await release(validate,{'error':'validated_output_unavailable'},409);await settle(p)
 assert await p.locator('video').count()==0;assert 'Готово' in await status_text(p);assert await p.locator('[role=alert]').count()==1
 await p.close();print('PASS B02')
 # B03: an expired desktop bearer during renewal is explicit and never leaks capability details.
 p,s=await page_for(browser,a);initial=await s.take('GET','/v1/jobs/job-'+a['id']);await release(initial,job(a,'review',1,token=None))
 renew=await s.take('POST','/v1/jobs/job-'+a['id']+'/output-access');await release(renew,{'error':'worker_session_expired'},401);await settle(p)
 alerts=await p.locator('[role=alert]').all_inner_texts();assert any('Доступ к компьютеру истёк' in x for x in alerts)
 assert all('token' not in x.lower() and 'path' not in x.lower() for x in alerts);await p.close();print('PASS B03')

async def wait_server(proc):
 import urllib.request
 for _ in range(80):
  if proc.poll() is not None:raise RuntimeError('vite exited '+str(proc.returncode))
  try:
   with urllib.request.urlopen(URL,timeout=.2) as r:
    if r.status==200:return
  except Exception:await asyncio.sleep(.1)
 raise RuntimeError('vite startup timeout')

async def main():
 global VIDEO_BYTES
 with tempfile.TemporaryDirectory(prefix='persona-race-video-') as td:
  fixture=Path(td)/'fixture.mp4'
  ffmpeg=next((ROOT.parent.parent/'node_modules'/'.pnpm').glob('ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg.exe'))
  subprocess.run([str(ffmpeg),'-v','error','-y','-f','lavfi','-i','color=c=black:s=64x96:r=4','-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p',str(fixture)],check=True)
  VIDEO_BYTES=fixture.read_bytes()
 proc=subprocess.Popen([str(ROOT/'node_modules'/'.bin'/'vite.CMD'),'apps/web','--host','127.0.0.1','--port','4174','--strictPort'],
  cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  await wait_server(proc)
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path=r'C:\Users\Kostya\Documents\Codex\tools\browsers\chrome\win64-152.0.7977.82\chrome-win64\chrome.exe',headless=True)
   try:
    await test_renewals(browser)
    await test_status_races(browser)
    await test_asset_isolation(browser)
    await test_lifecycle(browser)
    await test_secondary_ui(browser)
   finally:await browser.close()
 finally:
  proc.terminate()
  try:proc.wait(5)
  except subprocess.TimeoutExpired:proc.kill()

if __name__=='__main__':asyncio.run(main())
