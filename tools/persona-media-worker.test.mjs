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
test('retired studio route is closed even with a valid local token',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-studio-'));
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'not-used',
  apiEnv:{OPENROUTER_API_KEY:'test-only',PERSONA_STUDIO_PYTHON:'test-only'}});
 const base='http://127.0.0.1:'+await worker.start();
 const post=(path,body,token=worker.token,origin='http://127.0.0.1:5173')=>fetch(base+path,{method:'POST',
  headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token,Origin:origin},body:JSON.stringify(body)});
 try{
  const health=await(await fetch(base+'/health')).json();
  assert.equal(health.autonomousStudio,undefined);
  const created=await post('/session',{brief,variation:'cinematic',takeCount:2});
  const path='/session/'+(await created.json()).id+'/studio';
  assert.equal((await post(path,{consent:true},'invalid')).status,401);
  assert.equal((await post(path,{consent:true},worker.token,'https://other.example')).status,403);
  assert.equal((await post(path,{consent:true})).status,404);
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

test('music installation reopens verified MP4 and saves an explicit immutable source moment',{skip:spawnSync('ffmpeg',['-version']).status!==0},async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-music-restart-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const lut=join(root,'neutral.cube'),source=join(root,'source.mp4');
 await writeFile(lut,'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n');
 const fixture=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=108x192:r=30',
  '-t','8.5','-c:v','libx264',source],{timeout:30000});
 assert.equal(fixture.status,0,fixture.stderr?.toString());
 let worker,base;
 async function reopen(){
  if(worker)await new Promise(resolve=>worker.server.close(resolve));
  worker=createPersonaMediaWorker({port:0,outputRoot:root,musicLut:lut});
  base='http://127.0.0.1:'+await worker.start();
 }
 function request(path,method='GET',body,extra={}){
  return fetch(base+path,{method,body,headers:{'X-Persona-Worker-Token':worker.token,...extra}});
 }
 const post=(path,body)=>request(path,'POST',JSON.stringify(body),{'Content-Type':'application/json'});
 try{
  await reopen();
  const uploaded=await request('/music-studio?format=Format_OneEmotion&extension=.mp4','PUT',await readFile(source));
  assert.equal(uploaded.status,201,await uploaded.clone().text());
  const id=(await uploaded.json()).id,path='/music-studio/'+id;
  await reopen();
  const status=await(await request(path+'/status')).json();
  assert.equal(status.status,'ANALYZING');
  const response=await post(path+'/render',{candidateId:status.analysis.candidates[0].id,approved:true,autoMusic:false});
  assert.equal(response.status,201,await response.clone().text());
  const report=await response.json();
  await reopen();
  const restored=await(await request(path+'/status')).json();
  assert.equal(restored.status,'AWAITING_APPROVAL');
  assert.equal(restored.report.video.sha256,report.video.sha256);
  assert.equal(restored.publicationApproved,false);
  assert.equal((await post(path+'/moments',{approved:false,videoSha256:report.video.sha256})).status,400);
  assert.equal((await post(path+'/moments',{approved:true,videoSha256:'0'.repeat(64)})).status,400);
  const approve=()=>post(path+'/moments',{approved:true,videoSha256:report.video.sha256});
  const first=await approve();
  assert.equal(first.status,201,await first.clone().text());
  const moment=await first.json();
  assert.equal(moment.source.sha256,status.sourceSha256);
  assert.equal(moment.distributionAllowed,false);
  assert.deepEqual(await(await approve()).json(),moment);
  assert.deepEqual(await readdir(join(root,'approved-moments')),[moment.id+'.json']);
 }finally{if(worker)await new Promise(resolve=>worker.server.close(resolve));}
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
  assert.deepEqual(await readFile(join(root,staged,'input','S01_take01.mp4')),videoBytes,'duplicate upload cannot delete previously staged bytes');
  const intake=JSON.parse(await readFile(join(root,staged,'input','source-0.json'),'utf8'));
  assert.equal(intake.originalName,'Мой дубль.mp4');assert.equal(intake.stagedName,'S01_take01.mp4');
  assert.equal(intake.sha256,createHash('sha256').update(videoBytes).digest('hex'));assert.equal(intake.bytes,videoBytes.length);
  const restarted=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'not-used'});
  const restartedBase='http://127.0.0.1:'+await restarted.start();
  try{
   const get=()=>fetch(restartedBase+'/session/'+session.id+'/status',{headers:{'X-Persona-Worker-Token':restarted.token}});
   const recovered=await get();
   assert.equal(recovered.status,200);
   assert.equal((await recovered.json()).uploaded,1);
   const approved=join(root,staged,'approved-production-brief.json');
   await writeFile(approved,JSON.stringify({...brief,shots:[]}));
   const tampered=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'not-used'});
   const tamperedPort=await tampered.start();
   try{
    const response=await fetch('http://127.0.0.1:'+tamperedPort+'/session/'+session.id+'/status',
     {headers:{'X-Persona-Worker-Token':tampered.token}});
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/Approved production brief changed/);
   }finally{await new Promise(done=>tampered.server.close(done));}
  }finally{await new Promise(done=>restarted.server.close(done));}
 }finally{await new Promise(resolve=>worker.server.close(resolve));await rm(root,{recursive:true,force:true});}
});


test('combined server serves the frontend and a same-origin worker without exposing bare API routes', async t=>{
 const worker=createPersonaMediaWorker({port:0,ollamaModel:'not-used',
  frontend:(req,res)=>{res.writeHead(req.url==='/'?200:404);res.end('frontend');}});
 const port=await worker.start(),base='http://127.0.0.1:'+port;
 t.after(()=>worker.server.close());
 assert.equal(await (await fetch(base)).text(),'frontend');
 assert.equal((await fetch(base+'/health')).status,404);
 const api=base+'/persona-worker/health';
 const response=await fetch(api,{headers:{Origin:base}});
 assert.equal(response.status,200);
 assert.equal((await response.json()).service,'persona-media-worker');
 assert.equal((await fetch(api,{headers:{Origin:'https://unrelated.test'}})).status,403);
 assert.equal((await fetch(api,{headers:{Origin:'http://localhost:'+port}})).status,403);
});
test('preproduction protects the local route, writes an independent project and reads it back',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-producer-'));
 let calls=0;
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'not-used',producer:async(mode,input)=>{
  calls++;
  assert.equal(mode,'shot-list');
  return {markdown:'# '+input.idea+'\n',plan:{title:input.idea}};
 }});
 const base='http://127.0.0.1:'+await worker.start();
 t.after(async()=>{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true});});
 const auth={'X-Persona-Worker-Token':worker.token};
 const route=base+'/preproduction';
 const request=(body,headers=auth)=>fetch(route,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const payload={idea:'Надежда через тревогу',consent:true};
 assert.equal((await request(payload,{})).status,401);
 assert.equal((await request({...payload,consent:false})).status,400);
 assert.equal((await request({...payload,idea:''})).status,400);
 const saved=await request(payload);
 assert.equal(saved.status,201);
 const result=await saved.json();
 assert.equal(await readFile(join(root,'shooting-'+result.id,'shot_list.md'),'utf8'),result.markdown);
 const read=await fetch(route+'/'+result.id,{headers:auth});
 assert.equal(read.status,200);
 assert.deepEqual(await read.json(),result);
 assert.equal(calls,1);
 assert.equal((await fetch(base+'/music-studio/'+result.id+'/social-copy',{method:'POST',headers:auth})).status,404);
});

test('reference analysis persists complete rules and keeps the previous rules when the next analysis fails',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-reference-'));
 const url='https://www.instagram.com/reel/DceB-cSxIhz/';
 const rules={version:1,provider:'openrouter',sourceUrl:url,
  subtitles:{preset:'dynamic-interview',color:'#FFFFFF',sizePx1080:95},
  colorGrade:{temperature:'warm'},editing:{medianShotSec:2}};
 let calls=0;
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ollamaModel:'not-used',learnReference:async input=>{
  assert.equal(input.url,url);
  if(++calls===2)throw Error('Frame 6 did not complete');
  return rules;
 }});
 const route='http://127.0.0.1:'+await worker.start()+'/music-studio/reference';
 t.after(async()=>{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true});});
 const headers={'Content-Type':'application/json','X-Persona-Worker-Token':worker.token};
 const post=consent=>fetch(route,{method:'POST',headers,body:JSON.stringify({url,consent})});
 assert.equal((await post(false)).status,400);
 assert.equal((await post(true)).status,201);
 assert.equal((await post(true)).status,400);
 assert.deepEqual(await (await fetch(route,{headers})).json(),{rules});
 assert.deepEqual(await readdir(root),['learned_rules.json']);
});
