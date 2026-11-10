import {createHash} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractManualScenes,parseManualScript,validateManualSource} from './persona-manual-script.mjs';
import {createManualEditorialPlan} from './persona-semantic-autoselect.mjs';
import {buildSubtitleDraft} from './persona-subtitle-draft.mjs';
const text='Название: Бюджет на одного\n0–2 сек: Читаешь сообщение. (Текст: БЮДЖЕТ НА ОДНОГО)\n2–4 сек: Играешь мотив. (Текст: МОЯ МУЗЫКА)\nМузыка: pizzicato и фортепиано.';
const fake=async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({scenes:{1:{speech:'',musicAccent:''},2:{speech:'',musicAccent:'Играешь мотив.'}}})}})});
test('extracts timings and screen captions without inventing speech',()=>{const rows=extractManualScenes(text);assert.equal(rows.length,2);assert.equal(rows[0].durationSec,2);assert.equal(rows[0].caption,'БЮДЖЕТ НА ОДНОГО');});
test('Qwen parse retains authored source and no fake speech',async()=>{const r=await parseManualScript({text,projectId:'test',model:'local',fetchImpl:fake});assert.equal(r.brief.manualSource.sourceText,text);assert.equal(r.brief.script[0].line,'БЮДЖЕТ НА ОДНОГО');assert.equal(r.brief.manualSource.scenes[0].kind,'visual');assert.equal(r.brief.manualSource.scenes[1].musicAccent,'Играешь мотив.');assert.ok(validateManualSource(r.brief.manualSource,r.brief.script));});
test('rejects invented speech, omitted scene and unavailable Ollama',async()=>{for(const scenes of [[{order:1,speech:'выдуманная реплика',musicAccent:''},{order:2,speech:'',musicAccent:''}],[{order:1,speech:'',musicAccent:''}]])await assert.rejects(parseManualScript({text,projectId:'test',model:'local',fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({scenes})}})})}));await assert.rejects(parseManualScript({text,projectId:'test',model:'local',fetchImpl:async()=>{throw Error('offline')}}),/Ollama/);});
test('refuses absent timings, gaps and overlaps',()=>{for(const value of ['просто текст','0–2 сек: Первый кадр\n1–3 сек: Второй кадр','0–2 сек: Первый кадр\n3–4 сек: Второй кадр'])assert.throws(()=>extractManualScenes(value));});
test('multiline authored speech and actions are not silently dropped',()=>{
 const rows=extractManualScenes('0–2 сек: Поворачиваешься к камере.\nСвет: боковой.\nМузыка: фортепиано.\nРеплика: Я играю только свою музыку.\n2–4 сек: Уходишь.');
 assert.equal(rows[0].speech,'Я играю только свою музыку.');assert.match(rows[0].action,/Реплика:/);
});
test('visual scenes without titles can render without invented captions; spoken title remains authored',()=>{
 const brief={version:1,sourceFormat:'reel',script:[{order:1,line:'Действие',durationSec:2},{order:2,line:'Действие',durationSec:2}],shots:[{order:1},{order:2}],manualSource:{scenes:[{kind:'visual',caption:''},{kind:'visual',caption:''}]}};
 const timeline={version:1,clips:[{durationSec:2},{durationSec:2}]};assert.equal(buildSubtitleDraft(brief,timeline).review.cues.length,0);
 brief.manualSource.scenes[0]={kind:'spoken',caption:'АВТОРСКИЙ ЗАГОЛОВОК'};
 assert.equal(buildSubtitleDraft(brief,timeline).review.cues[0].text,'АВТОРСКИЙ ЗАГОЛОВОК');
});
test('visual takes follow explicit scene mapping with hashes and no fabricated transcript',async()=>{
 const {brief}=await parseManualScript({text,projectId:'test',model:'local',fetchImpl:fake});
 const sources=[1,2].map(n=>({id:'s0'+n+'_t01',sha256:String(n).repeat(64),durationSec:2.1,segments:[],technicalQuality:{blackIntervals:[]}}));
 const plan=createManualEditorialPlan(brief,sources);
 assert.equal(plan.choices.length,2);assert.equal(plan.choices[0].transcript,'');assert.equal(plan.choices[0].evidenceType,'author-visual-take');assert.equal(plan.choices[0].sourceSha256,sources[0].sha256);
 assert.throws(()=>createManualEditorialPlan(brief,[sources[0]]),/кадр 2/);
 assert.throws(()=>createManualEditorialPlan(brief,[{...sources[0],durationSec:600},sources[1]]),/длительност/);
});

test('all-spoken manual master keeps real ASR matching instead of file-label rejection',()=>{
 const sourceText='0–2 сек: Реплика: Я говорю первую реплику.\n2–4 сек: Реплика: Музыка меняет настроение.';
 const rows=extractManualScenes(sourceText);
 const brief={script:rows.map(r=>({order:r.order,line:r.speech,action:r.action,durationSec:r.durationSec})),shots:rows.map(r=>({order:r.order,durationSec:r.durationSec,action:r.action})),manualSource:{version:1,sourceText,sourceSha256:createHash('sha256').update(sourceText).digest('hex'),model:'test',scenes:rows.map(r=>({order:r.order,kind:'spoken',caption:'',spokenText:r.speech,musicAccent:''}))}};
 const sources=[{id:'master',durationSec:5,segments:[{text:rows[0].speech,startSec:.2,endSec:1.8,timing:'word'},{text:rows[1].speech,startSec:2.5,endSec:4,timing:'word'}],technicalQuality:{blackIntervals:[]}}];
 assert.equal(createManualEditorialPlan(brief,sources).choices.length,2);
 assert.throws(()=>createManualEditorialPlan(brief,[{...sources[0],segments:[]}]),/Manual review/);
});
