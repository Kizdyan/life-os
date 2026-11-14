import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

test('idea selection endpoint rejects a foreign project and a legacy unaudited proposal before model work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-worker-idea-audit-'));
 const id='11111111-1111-4111-8111-111111111111',dir=join(root,'ideas-'+id);await mkdir(dir);
 await writeFile(join(dir,'PROJECT.json'),JSON.stringify({projectId:'owner'}));
 await writeFile(join(dir,'IDEAS.json'),JSON.stringify({version:1,ideas:[]}));
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'unavailable-no-call-needed'});
 const port=await worker.start(),base='http://127.0.0.1:'+port;
 try{
  const {token}=await(await fetch(base+'/health')).json();
  const post=projectId=>fetch(base+'/ideas/'+id+'/select',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token},body:JSON.stringify({projectId,ideaId:'idea-1'})});
  const foreign=await post('other');assert.equal(foreign.status,400);assert.match((await foreign.json()).error,/another project/);
  const legacy=await post('owner');assert.equal(legacy.status,400);assert.match((await legacy.json()).error,/no Generator-Critic audit/);
  assert.deepEqual(await readdir(root),['ideas-'+id]);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true})}
});

const brief={version:1,sourceFormat:'reel',script:[
 {order:1,line:'First line'},{order:2,line:'Second line'},
],shots:[{order:1},{order:2}]};
test('autonomous finishing requires the local token, explicit cloud consent and a completed draft',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-studio-'));
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'not-used',
  apiEnv:{OPENROUTER_API_KEY:'test-only',PERSONA_STUDIO_PYTHON:'test-only',PERSONA_STUDIO_RESOLVE_LAUNCHER:'test-only'}});
 const base='http://127.0.0.1:'+await worker.start();
 const post=(path,body,token=worker.token,origin='http://127.0.0.1:5173')=>fetch(base+path,{method:'POST',
  headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token,Origin:origin},body:JSON.stringify(body)});
 try{
  const health=await(await fetch(base+'/health')).json();
  assert.deepEqual(health.autonomousStudio,{configured:true,providers:['OpenRouter']});
  const created=await post('/session',{brief,variation:'cinematic',takeCount:2});
  const path='/session/'+(await created.json()).id+'/studio';
  assert.equal((await post(path,{consent:true},'invalid')).status,401);
  assert.equal((await post(path,{consent:true},worker.token,'https://other.example')).status,403);
  const withoutConsent=await post(path,{consent:false});
  assert.equal(withoutConsent.status,400);assert.match((await withoutConsent.json()).error,/Подтвердите отправку/);
  const withoutDraft=await post(path,{consent:true});
  assert.equal(withoutDraft.status,400);assert.match((await withoutDraft.json()).error,/готовый локальный монтаж/);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true});}
});
test('real FFprobe rejects a ten-minute video assigned to a five-second shot before rendering',{skip:spawnSync('ffmpeg',['-version']).status!==0},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-long-short-take-')),source=join(root,'long.mp4');
 const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=160x284:r=1','-t','600','-c:v','libx264',source],{timeout:30000});assert.equal(generated.status,0,generated.stderr?.toString());
 const bytes=await readFile(source),originalSha=createHash('sha256').update(bytes).digest('hex');
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'not-used-for-intake'}),port=await worker.start(),base='http://127.0.0.1:'+port;
 try{
  const created=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':worker.token},body:JSON.stringify({brief:{...brief,script:brief.script.map(b=>({...b,durationSec:5}))},variation:'cinematic',takeCount:2,directionMode:'manual',visualPreset:'Commercial'})});assert.equal(created.status,201);const job=await created.json();
  const upload=await fetch(base+'/session/'+job.id+'/take/0',{method:'PUT',headers:{'X-Persona-Worker-Token':worker.token,'X-Persona-File-Name':'S01_take01.mp4'},body:bytes});assert.equal(upload.status,400);assert.match((await upload.json()).error,/600.*15 с/);
  const status=await(await fetch(base+'/session/'+job.id+'/status',{headers:{'X-Persona-Worker-Token':worker.token}})).json();assert.equal(status.uploaded,0);assert.equal(status.state,'uploading');
  assert.equal((await fetch(base+'/session/'+job.id,{method:'DELETE',headers:{'X-Persona-Worker-Token':worker.token}})).status,200);
  assert.deepEqual(await readdir(root),['long.mp4']);assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),originalSha);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true})}
});
test('idea endpoints reject unsupported formats, path injection and another project before any inference',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-idea-worker-')),id='11111111-1111-4111-8111-111111111111';
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'missing-model'}),port=await worker.start();
 try{
  const post=(path,body,token=worker.token)=>fetch('http://127.0.0.1:'+port+path,{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token},body:JSON.stringify(body)});
  assert.equal((await post('/ideas',{projectId:'project',contentFormat:'invented',theme:'No inference expected'})).status,400);
  assert.equal((await post('/ideas',{projectId:'../outside',contentFormat:'comedy'})).status,400);
  assert.equal((await post('/ideas',{projectId:'project'},'invalid-token')).status,401);
  const proposal=join(root,'ideas-'+id);await mkdir(proposal);await writeFile(join(proposal,'PROJECT.json'),JSON.stringify({projectId:'owner'}));
  const foreign=await post('/ideas/'+id+'/select',{projectId:'other',ideaId:'idea-1'});assert.equal(foreign.status,400);assert.match((await foreign.json()).error,/another project/);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true})}
});

test('manual parsing remains authenticated and abandoned intake removes only owned staging',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-manual-intake-'));const untouched=join(root,'previous-result.txt');await writeFile(untouched,'keep');
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'missing-model'}),port=await worker.start(),base='http://127.0.0.1:'+port;
 try{
  const post=(path,body,token=worker.token,origin='http://127.0.0.1:5173')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token,Origin:origin},body:JSON.stringify(body)});
  assert.equal((await post('/manual-script',{},'wrong')).status,401);
  const unicode=await post('/manual-script',{projectId:'test',text:'я'.repeat(19000)});assert.match((await unicode.json()).error,/Нужны 2/,'Unicode input stays within the advertised character limit');
  assert.equal((await post('/manual-script',{},worker.token,'https://other.example')).status,403);
  const session=await(await post('/session',{brief,variation:'cinematic',takeCount:2})).json();
  const dir=join(root,'.worker-staging-'+session.id);await writeFile(join(dir,'partial.mp4'),'worker-owned copy');
  assert.equal((await fetch(base+'/session/'+session.id,{method:'DELETE',headers:{'X-Persona-Worker-Token':'wrong'}})).status,401);
  const discarded=await fetch(base+'/session/'+session.id,{method:'DELETE',headers:{'X-Persona-Worker-Token':worker.token}});assert.equal(discarded.status,200);
  assert.deepEqual(await readdir(root),['previous-result.txt']);assert.equal(await readFile(untouched,'utf8'),'keep');
  assert.equal((await fetch(base+'/session/'+session.id+'/status',{headers:{'X-Persona-Worker-Token':worker.token}})).status,404);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true})}
});

test('concurrent identical director requests share real inference; a different brief stays isolated',async()=>{
 let calls=0,release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 const worker=createPersonaMediaWorker({port:0,ollamaModel:'test-qwen',directorSelector:async()=>{calls++;started();await gate;return {selected_preset:'Dynamic',model:'test-qwen',createdAt:new Date().toISOString()}}});
 const port=await worker.start(),base='http://127.0.0.1:'+port;
 try{
  const post=b=>fetch(base+'/direct',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':worker.token},body:JSON.stringify({brief:b})});
  const first=post(brief);await entered;const second=post(brief);
  const changed=structuredClone(brief);changed.script[0].line='Other script';
  assert.equal((await post(changed)).status,400);release();
  const responses=await Promise.all([first,second]);for(const response of responses)assert.equal(response.status,200);
  assert.equal(calls,1);const receipts=await Promise.all(responses.map(r=>r.json()));assert.notEqual(receipts[0].id,receipts[1].id);
 }finally{release();await new Promise(r=>worker.server.close(r))}
});
test('director receipt is required for auto mode and cannot be reused for a changed brief',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-director-test-'));
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'test-qwen',directorSelector:async()=>({selected_preset:'Cinematic',model:'test-qwen',createdAt:new Date().toISOString()})});
 const port=await worker.start(),base='http://127.0.0.1:'+port;
 try{
  const info=await (await fetch(base+'/health')).json();
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':info.token},body:JSON.stringify(body)});
  const routed=await post('/direct',{brief});assert.equal(routed.status,200);const decision=await routed.json();
  const common={brief,variation:'cinematic',takeCount:2,directionMode:'auto'};
  assert.equal((await post('/session',common)).status,400);
  const changed=structuredClone(brief);changed.script[0].line='Changed line';
  assert.equal((await post('/session',{...common,brief:changed,directorDecisionId:decision.id})).status,400);
  const good=await post('/session',{...common,directorDecisionId:decision.id});assert.equal(good.status,201);
  const staged=(await readdir(root)).find(name=>name.startsWith('.worker-staging-'));
  assert.equal(JSON.parse(await readFile(join(root,staged,'AI-DIRECTOR.json'),'utf8')).selected_preset,'Cinematic');
  assert.equal((await post('/session',{...common,directionMode:'manual',visualPreset:'invented'})).status,400);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true})}
});
test('loopback worker rejects foreign origins and accepts only explicit local authenticated sessions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-worker-test-'));
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ffmpegDir:null,whisperCli:'missing.exe',whisperModel:'missing.bin',ollamaModel:'qwen3:4b-instruct'});
 const port=await worker.start(),base='http://127.0.0.1:'+port;
 try{
  const health=await fetch(base+'/health');assert.equal(health.status,200);const info=await health.json();assert.equal(info.service,'persona-media-worker');assert.equal(info.ok,false);assert.equal(info.components.ffmpeg,false);assert.equal(info.components.whisper,false);assert.match(info.token,/^[a-f0-9-]{36}$/);
  const foreign=await fetch(base+'/session',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json','X-Persona-Worker-Token':info.token},body:JSON.stringify({brief,variation:'cinematic',takeCount:2})});assert.equal(foreign.status,403);
  const noToken=await fetch(base+'/session',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json'},body:JSON.stringify({brief,variation:'cinematic',takeCount:2})});assert.equal(noToken.status,401);
  const stalePlan=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':info.token},body:JSON.stringify({brief:{...brief,preEditPlanNeedsReview:true},variation:'cinematic',takeCount:2})});assert.equal(stalePlan.status,400,'Direct JSON must not bypass pending production-plan review');
  const created=await fetch(base+'/session',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-Persona-Worker-Token':info.token},body:JSON.stringify({brief,variation:'cinematic',takeCount:2,model:'qwen3:4b-instruct'})});assert.equal(created.status,201);const session=await created.json();assert.match(session.id,/^[a-f0-9-]{36}$/);assert.deepEqual((await readdir(root)).filter(name=>name.startsWith('ai-reel-')),[],'runner output stays absent until it creates it atomically');
  const traversal=await fetch(base+'/session/'+session.id+'/take/0',{method:'PUT',headers:{Origin:'http://127.0.0.1:5173','X-Persona-Worker-Token':info.token,'X-Persona-File-Name':'..\\outside.mp4','Content-Length':'1024'},body:Buffer.alloc(1024)});assert.equal(traversal.status,400);
  const bytes=Buffer.alloc(1024,7),headers={Origin:'http://127.0.0.1:5173','X-Persona-Worker-Token':info.token,'X-Persona-File-Name':'S01_take01.mp4','X-Persona-Original-Name':encodeURIComponent('Мой дубль.mp4')};
  const badName=await fetch(base+'/session/'+session.id+'/take/0',{method:'PUT',headers:{...headers,'X-Persona-Original-Name':encodeURIComponent('../private.mp4')},body:bytes});assert.equal(badName.status,400);
  const corrupt=await fetch(base+'/session/'+session.id+'/take/0',{method:'PUT',headers,body:bytes});assert.equal(corrupt.status,400,'arbitrary bytes are not evidence of a video');
  if(spawnSync('ffmpeg',['-version']).status!==0)return;
  const sample=join(root,'sample.mp4');assert.equal(spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x284:r=30','-t','1','-c:v','libx264',sample]).status,0);const videoBytes=await readFile(sample);
  const uploaded=await fetch(base+'/session/'+session.id+'/take/0',{method:'PUT',headers,body:videoBytes});assert.equal(uploaded.status,200,JSON.stringify(await uploaded.json()));
  const duplicate=await fetch(base+'/session/'+session.id+'/take/1',{method:'PUT',headers,body:Buffer.alloc(1024,9)});assert.equal(duplicate.status,400);
  const staged=(await readdir(root)).find(name=>name.startsWith('.worker-staging-'));
  assert.deepEqual(await readFile(join(root,staged,'S01_take01.mp4')),videoBytes,'duplicate upload cannot delete previously staged bytes');
  const intake=JSON.parse(await readFile(join(root,staged,'source-0.json'),'utf8'));
  assert.equal(intake.originalName,'Мой дубль.mp4');assert.equal(intake.stagedName,'S01_take01.mp4');
  assert.equal(intake.sha256,createHash('sha256').update(videoBytes).digest('hex'));assert.equal(intake.bytes,videoBytes.length);
 }finally{await new Promise(resolve=>worker.server.close(resolve));await rm(root,{recursive:true,force:true});}
});

