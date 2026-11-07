import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {canonicalBrief,createShootSheet,packagePersonaFlow,preparePersonaFlow,validateDirector,validateIdeas,validateModelServers} from './persona-flow.mjs';
import {verifyLocalPersonaRender} from './persona-verify-render.mjs';

const ideas={ideas:[
 {title:'Актёр vs композитор: две концовки',angle:'Один и тот же диалог звучит то как мелодрама, то как триллер.',hook:'А что, если музыка соврала?'},
 {title:'Провал аудиопроб',angle:'Музыкальная проба превращает серьёзный монолог в неожиданный скетч.',hook:'Тишина оказалась смешнее.'},
 {title:'Станиславский слушает музыку',angle:'Герой репетирует драму, но музыкальные акценты меняют его эмоции.',hook:'Кто режиссёр этой сцены?'},
]};
const director={hook:'Странный звук меняет всю сцену',setup:{
 location:'Тихая комната с пианино у стены',camera:'Смартфон вертикально на штативе',
 lighting:'Мягкий боковой свет без пересветов',sound:'Близкий микрофон и комнатный тон',
 wardrobe:'Однотонная футболка и лёгкий пиджак',arrangement:'Две позиции для актёра и композитора',
},scenes:[
 {durationSec:4,line:'Я приготовил драму',action:'Герой разворачивает лист с текстом',
  framing:'close-up',camera:'Крупный план со штатива',lighting:'Мягкий боковой свет',
  performance:'Серьёзно и сосредоточенно',edit:'Переход на взгляд'},
 {durationSec:5,line:'А я включил музыку комедии',action:'Композитор касается клавиши',
  framing:'medium',camera:'Средний план с фортепиано',lighting:'Нейтральный мягкий свет',
  performance:'Спокойно и немного иронично',edit:'Пауза перед ответом'},
 {durationSec:4,line:'Это же трагедия!',action:'Актёр сдвигает лист в сторону',
  framing:'close-up',camera:'Крупный статичный план',lighting:'Оставить мягкий рисунок',
  performance:'Нарастающее недоумение',edit:'Склейка по жесту'},
 {durationSec:5,line:'Музыка знает лучше',action:'Композитор заканчивает короткую фразу',
  framing:'detail',camera:'Деталь рук на клавишах',lighting:'Руки не должны быть пересвечены',
  performance:'Сухой завершающий панчлайн',edit:'Обрезать после короткой паузы'},
],editingIntent:'Монтаж по музыкальным акцентам и реакции героя',
 colorIntent:'Натуральная кожа, нейтральные белые, сдержанное тепло'};
function mockFetch(url,options){
 assert.ok(url==='http://127.0.0.1:11434/api/chat'||url==='https://ollama.example.org/api/chat');
 const input=JSON.parse(options.body);
 assert.equal(input.stream,false);
 assert.equal(input.format,'json');
 assert.equal(input.messages[0].role,'system');
 assert.ok(input.messages[1].role==='user');
 const output=input.messages[0].content.includes('Ты предлагаешь')?ideas:director;
 return Promise.resolve({ok:true,json:async()=>({message:{content:JSON.stringify(output)}})});
}
test('real-model execution path creates three ideas, one 4-scene camera-ready brief, shot sheet and waiting state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-ideas-'));
 try{
  const out=join(root,'new-production');
  const libraryIndexPath=join(root,'library-index.json');
  await writeFile(libraryIndexPath,JSON.stringify({kind:'persona-local-library-v1',
   generatedAt:'2026-11-03T18:00:00Z',assets:[{
   id:'sha256:'+'a'.repeat(64),sourcePath:'C:/Persona/inbox/piano.mp4',
   sha256:'a'.repeat(64),kind:'video',availability:'local',
   metadata:{durationSec:8},annotation:{
    description:'Композитор играет на клавишах',tags:['клавиши','фортепиано'],segments:[]},
   frames:[],
  }]}));
  const result=await preparePersonaFlow({theme:'Смешной ролик: актёр и композитор спорят о жанре',
   outputDir:out,servers:[{id:'local',baseUrl:'http://127.0.0.1:11434',model:'qwen3:4b-instruct'}],
   libraryIndexPath,fetchImpl:mockFetch});
  assert.equal(result.status,'WAITING_FOR_FOOTAGE');
  assert.equal(result.scenes,4);
  assert.ok(result.libraryMatches.matchedShots>=1);
  assert.match(await readFile(join(out,'SHOOT-GAPS.md'),'utf8'),/Композитор/);
  assert.equal(JSON.parse(await readFile(join(out,'ASSET-MATCHES.json'),'utf8')).publicationApproved,false);
  assert.equal(result.provider.ideas.model,'qwen3:4b-instruct');
  const brief=JSON.parse(await readFile(join(out,'PRODUCTION-BRIEF.json'),'utf8'));
  assert.equal(brief.script.length,4);
  assert.equal(brief.shots.length,4);
  assert.deepEqual(brief.script.map(s=>s.order),[1,2,3,4]);
  assert.equal(brief.sourceFormat,'reel');
  assert.equal(brief.adaptations.reels.durationSec,18);
  assert.equal(brief.publicationApproved,undefined);
  assert.equal(JSON.parse(await readFile(join(out,'IDEAS.json'),'utf8')).ideas.length,3);
  assert.match(await readFile(join(out,'SHOOT.md'),'utf8'),/S04_take01\.mp4/);
  assert.equal(JSON.parse(await readFile(join(out,'FLOW.json'),'utf8')).renderedVideo,false);
  await assert.rejects(preparePersonaFlow({theme:'Смешной ролик: актёр и композитор спорят о жанре',
   outputDir:out,servers:[{id:'local',baseUrl:'http://127.0.0.1:11434',model:'qwen3:4b-instruct'}],
   fetchImpl:mockFetch}),/Output exists/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('several actual model servers fall back without inventing AI outputs or storing secrets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-model-pool-'));let calls=0;
 try{
  const out=join(root,'plan');
  const result=await preparePersonaFlow({theme:'Музыкальный монолог превращается в смешной диалог',
   outputDir:out,servers:[
    {id:'offline',baseUrl:'https://ollama.example.org',model:'model-a'},
    {id:'local',baseUrl:'http://127.0.0.1:11434',model:'model-b'}],
   fetchImpl:(url,options)=>{calls++;return url.startsWith('https:')?
    Promise.reject(Error('unreachable')):mockFetch(url,options)}});
  assert.ok(calls>=3);
  assert.equal(result.provider.director.id,'local');
  assert.equal(result.provider.ideas.id,'local');
  const saved=await readFile(join(out,'FLOW.json'),'utf8');
  assert.ok(!saved.includes('tokenEnv'));
  assert.throws(()=>validateModelServers([{id:'bad',baseUrl:'http://example.com',model:'x'}]),/HTTPS/);
  assert.throws(()=>validateModelServers([{id:'bad',baseUrl:'https://user:pass@example.com',model:'x'}]),/credentials/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('a nonexistent LLM cannot produce a fake idea or screenplay',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-offline-'));
 try{
  const out=join(root,'not-created');
  await assert.rejects(preparePersonaFlow({theme:'Написать необычный короткий ролик для актёра',
   outputDir:out,servers:[{id:'offline',baseUrl:'http://localhost:11434',model:'missing'}],
   fetchImpl:async()=>{throw Error('ECONNREFUSED')}}),/All real model servers failed/);
  await assert.rejects(stat(out),/ENOENT/);
  assert.throws(()=>validateIdeas({ideas:[ideas.ideas[0],ideas.ideas[0],ideas.ideas[2]]}),/duplicated/);
  assert.throws(()=>validateDirector({...director,scenes:[director.scenes[0]]}),/required fields/);
 }finally{await rm(root,{recursive:true,force:true})}
});
const ffmpegReady=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
test('delivery package copies a REAL synthetic MP4, validates ffprobe/FFmpeg QA SHA and refuses forged/missing files',{skip:!ffmpegReady},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-package-'));
 try{
  const source=join(root,'render');await mkdir(source);
  const mp4=join(source,'ai-edited-reel.mp4');
  const command=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
   '-f','lavfi','-i','testsrc2=size=1080x1920:rate=30:duration=1',
   '-f','lavfi','-i','sine=frequency=460:sample_rate=48000:duration=1',
   '-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p',
   '-c:a','aac','-shortest',mp4],{encoding:'utf8',timeout:30000});
  assert.equal(command.status,0,command.stderr);
  const sha=createHash('sha256').update(await readFile(mp4)).digest('hex');
  const size=(await stat(mp4)).size;
  // Actual FFprobe + FFmpeg black/silence QA against this synthetic file, not caller-supplied PASS flags.
  const qaPath=join(source,'ai-edited-qa.json');
  const qa=await verifyLocalPersonaRender({path:mp4,contentId:'synthetic-fixture',
   format:'reel',authorApproved:false,outputPath:qaPath});
  assert.equal(qa.evidence.sha256,sha);
  assert.deepEqual(qa.handoff.errors,['author approval required']);
  await writeFile(join(source,'RESULT.json'),JSON.stringify({
   status:'awaiting-author-review',distributionAllowed:false,
   aiFinishedVideo:mp4,aiFinishedQaPath:join(source,'ai-edited-qa.json'),
  }));
  const out=join(root,'deliverable');
  const packageResult=await packagePersonaFlow({resultPath:join(source,'RESULT.json'),outputDir:out,
   caption:'Рабочий тестовый ролик. Публикация не выполнялась.'});
  assert.equal(packageResult.status,'AWAITING_AUTHOR_REVIEW');
  assert.equal(packageResult.sha256,sha);
  assert.equal(createHash('sha256').update(await readFile(join(out,'persona-reel.mp4'))).digest('hex'),sha);
  const manifest=JSON.parse(await readFile(join(out,'DELIVERY.json'),'utf8'));
  assert.equal(manifest.platformUploadPerformed,false);
  assert.equal(manifest.publicationApproved,false);
  await assert.rejects(packagePersonaFlow({resultPath:join(source,'RESULT.json'),outputDir:out}),/Output exists/);
  const tampered={...qa,evidence:{...qa.evidence,sha256:'0'.repeat(64)}};
  await writeFile(join(source,'ai-edited-qa.json'),JSON.stringify(tampered));
  await assert.rejects(packagePersonaFlow({resultPath:join(source,'RESULT.json'),outputDir:join(root,'invalid')}),/differs from verified QA hash/);
 }finally{await rm(root,{recursive:true,force:true})}
});
