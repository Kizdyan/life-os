"""Browser regression for frozen production-package approval; synthetic metadata only."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--browser',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--url',default='http://127.0.0.1:5173/#persona')
args=parser.parse_args()
out=Path(args.output).resolve();out.mkdir(exist_ok=False)
repo=Path(__file__).resolve().parent.parent
brief=json.loads((repo/'docs/persona-first-reel-production-brief-2026-10-29.json').read_text(encoding='utf-8'))
brief.update(ideaId='synthetic-package-approval',sourceTitle='Synthetic package approval regression',sourceAngle='Technical preservation check only')
beats=[('Мы встретились у закрытой двери.','Остановиться у порога и прислушаться.',4),('Но никто не открыл.','Трижды постучать и отступить.',6),('Я, оказывается, стоял не там.','Повернуться к зрителю и замереть.',4)]
brief['script']=[dict(order=i+1,line=b[0],action=b[1],durationSec=b[2]) for i,b in enumerate(beats)]
brief['shots']=brief['shots'][:3]
for i,shot in enumerate(brief['shots']):shot.update(order=i+1,durationSec=beats[i][2],action=beats[i][1],angle='FIXTURE_CAMERA_'+str(i),lighting='FIXTURE_KEY_LIGHT')
brief['shots'][0]['action']+='\nАктёрская задача режиссёра: скрыть тревогу от партнёра.'
brief['hook']['firstSeconds']=beats[0][0]
for adaptation in brief['adaptations'].values():adaptation['durationSec']=14
package={'visualStyle':{'lighting':'Мягкий свет слева','colors':'Нейтральная кожа и синий фон'},'musicalLeitmotif':{'instruments':'Фортепиано и струнные','climax':'Аккорд на раскрытии'},'editingRhythm':{'cuts':'По смене цели героя','pauses':'Перед неожиданным ответом'}}
brief['productionPackage']=package
brief['postProduction']['color']='FIXTURE_COLOR_INTENT'
brief['preEditPlan']={'version':1,'kind':'persona-pre-edit-plan-v1','status':'intent_only','origin':'ai_director','sourceRevisionId':None,'researchEvidence':{'level':'hypothesis_only','sourceUrls':[],'note':'Synthetic fixture, no research claimed'},'productionPackage':package,'scenes':[dict(order=i+1,line=b[0],durationSec=b[2],editIntent='FIXTURE_EDIT_INTENT',audioIntent='FIXTURE_MUSIC_INTENT',subtitleIntent='Follow actual speech',visualIntent=dict(framing='medium',angle='FIXTURE_ANGLE',cameraMovement='Static fixture',lighting='FIXTURE_LIGHT',performance='FIXTURE_ACTING_TASK'),mediaStatus='awaiting_author_footage') for i,b in enumerate(beats)],'publicationApproved':False}
with sync_playwright() as p:
    browser=p.chromium.launch_persistent_context(str(out/'browser'),headless=True,executable_path=args.browser,viewport={'width':390,'height':844})
    page=browser.new_page();page.set_default_timeout(12000);errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    try:
        page.goto(args.url,wait_until='domcontentloaded')
        page.get_by_role('button',name='Создать Reels',exact=True).click()
        page.wait_for_function("(()=>{const p=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1'));return p.activeProjectId&&location.hash==='#persona/project/'+p.activeProjectId})()")
        page.get_by_label('Импортировать съёмочный бриф JSON').set_input_files({'name':'synthetic-package.json','mimeType':'application/json','buffer':json.dumps(brief,ensure_ascii=False).encode()})
        def approve():
            page.get_by_label('Автор сценария',exact=True).fill('Synthetic test')
            page.get_by_label('Комментарий автора',exact=True).fill('Technical fixture only; not author artwork approval')
            page.get_by_role('button',name='Утвердить сценарий',exact=True).click()
            page.locator('section[aria-label="Сценарий и референсы"]').get_by_role('button',name='Создать съёмочный бриф',exact=True).click()
            page.get_by_label('Имя редактора',exact=True).wait_for()
        def saved():
            # Read-only evidence: all mutations above occur through the interface.
            return page.evaluate("(()=>{const c=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1'));return c.projects.find(p=>p.id===c.activeProjectId)})()")
        approve()
        stored=saved()['shootingPlan']['materials']['productionBrief']
        assert stored['productionPackage']==package
        assert stored['preEditPlan']['productionPackage']==package
        assert stored['preEditPlan']['scenes']==brief['preEditPlan']['scenes']
        assert stored['shots']==brief['shots']
        assert stored['postProduction']==brief['postProduction']
        page.reload(wait_until='domcontentloaded')
        page.get_by_label('Имя редактора',exact=True).wait_for()
        assert saved()['shootingPlan']['materials']['productionBrief']==stored
        page.screenshot(path=str(out/'unchanged-package-reloaded.png'),full_page=True)
        page.locator('.personaMvpSteps button').nth(1).click()
        page.get_by_label('Действие сценария 1',exact=True).fill('Резко открыть дверь и выйти.')
        page.get_by_label('Причина новой редакции',exact=True).fill('Изменено действие первой сцены для теста')
        page.get_by_role('button',name='Сохранить новую версию',exact=True).click()
        approve()
        project=saved();pipeline=project['shootingPlan']
        assert pipeline['materials']['productionBrief']['preEditPlanNeedsReview'] is True
        assert pipeline['materials']['productionBrief']['preEditPlan']['scenes']==brief['preEditPlan']['scenes']
        assert pipeline['materials']['qa']['status']=='needs_revision'
        assert len(project['scenarioWorkspace']['script']['revisions'])==2
        page.get_by_label('Имя редактора',exact=True).fill('Synthetic test')
        page.get_by_label('Комментарий редактора',exact=True).fill('Attempt cannot override stale plan')
        fact=page.get_by_role('checkbox',name='Факты в свободных репликах сверены с автором или источником.')
        if fact.count():fact.check()
        assert page.get_by_role('button',name='Одобрить для съёмки',exact=True).is_disabled()
        page.screenshot(path=str(out/'edited-action-blocked.png'),full_page=True)
        first_id=project['id']
        page.locator('.personaProjectHead').get_by_role('button',name='Persona',exact=True).click()
        page.get_by_role('button',name='Создать Reels',exact=True).click()
        page.wait_for_function("(()=>{const c=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1'));return c.activeProjectId&&location.hash==='#persona/project/'+c.activeProjectId})()")
        assert saved()['id']!=first_id
        page.get_by_role('button',name='← Мои проекты',exact=True).click()
        page.locator('.projectRows article').filter(has_text=brief['sourceTitle']).get_by_role('button',name='Открыть',exact=True).click()
        page.wait_for_function('(id)=>location.hash==="#persona/project/"+id',arg=first_id)
        assert saved()['id']==first_id
        assert saved()['shootingPlan']['materials']['productionBrief']['productionPackage']==package
        page.locator('.personaProjectHead').get_by_role('button',name='Persona',exact=True).click()
        page.get_by_role('button',name='Открыть съёмку: актёр + композитор · 7 кадров',exact=True).click()
        page.wait_for_function("(()=>{const c=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1'));return c.activeProjectId&&location.hash==='#persona/project/'+c.activeProjectId})()")
        assert not errors,errors
        (out/'RESULT.json').write_text(json.dumps({'status':'PACKAGE_APPROVAL_UI_PASS','url':page.url,'preservedPackage':True,'preservedDirection':True,'reload':True,'actionEditNeedsReview':True,'versions':2,'sourceType':'synthetic-metadata-only','consolePageErrors':errors,'publicationApproved':False},indent=2),encoding='utf-8')
    finally:browser.close()
