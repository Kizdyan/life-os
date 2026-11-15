import assert from 'node:assert/strict';
import {test} from 'node:test';
import {draftHookLines, renderHookVariants} from './persona-hook-variants.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const drafts={intrigue:'Ещё секунда — и всё меняется',direct:'Здесь рождается мелодия',question:'Слышишь, как рождается тема?'};
test('hook variants reject ASS tags, duplicates and a missing question',()=>{
 assert.equal(draftHookLines(drafts).length,3);
 assert.throws(()=>draftHookLines({...drafts,direct:'{\\pos(0,0)}Музыка'}));
 assert.throws(()=>draftHookLines({...drafts,question:'Здесь рождается мелодия?'}));
 assert.throws(()=>draftHookLines({...drafts,question:'Здесь совсем другая тема'}));
 assert.throws(()=>draftHookLines({...drafts,intrigue:'Сколько чувств в этом взгляде?'}));
});

test('portrait ASS leaves frame zero and untitled pixels exact even with an instant kinetic hook',{
 skip:spawnSync('ffmpeg',['-version']).status!==0
},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-hooks-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const video=join(dir,'source.mp4');
 const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=270x480:rate=12',
  '-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video]);
 assert.equal(generated.status,0,generated.stderr?.toString());
 const sha=createHash('sha256').update(await readFile(video)).digest('hex');
 const result=await renderHookVariants({video,sourceSha256:sha,drafts,kinetic:true,output:join(dir,'output')});
 const firstFrame=path=>{
  const read=spawnSync('ffmpeg',['-v','error','-i',path,'-map','0:v:0','-frames:v','1','-c:v','rawvideo',
   '-threads','1','-f','streamhash','-hash','sha256','pipe:1'],{encoding:'utf8'});
  assert.equal(read.status,0,read.stderr);
  return read.stdout;
 };
 const sourceFrame=firstFrame(video);
 for(const item of result.variants)assert.equal(firstFrame(join(dir,'output',item.file)),sourceFrame);
 assert.equal(result.framing.mode,'native');
 assert.equal(result.variants.length,3);
 assert.equal(new Set(result.variants.map(v=>v.sha256)).size,3);
 assert.ok(result.variants.every(v=>v.audioIdentical&&v.tailIdentical));
 assert.equal(createHash('sha256').update(await readFile(video)).digest('hex'),sha);
 assert.equal(result.publicationApproved,false);
});

test('hook download requires the job token and stays bound to the issued source hash',{
 skip:spawnSync('ffmpeg',['-version']).status!==0
},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-hook-worker-'));
 const worker=createPersonaMediaWorker({port:0,outputRoot:dir,ollamaModel:'not-used',
  producer:async(task,payload)=>{
   assert.equal(task,'hook-variants');assert.equal(payload.hook,'Тема рождается здесь');
   return {hooks:drafts,provider:'test',model:'fixture'};
  }});
 const base='http://127.0.0.1:'+await worker.start()+'/hook-tests';
 t.after(async()=>{await new Promise(r=>worker.server.close(r));await rm(dir,{recursive:true,force:true});});
 const video=join(dir,'in.mp4');
 const fixture=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=270x480:rate=12',
  '-t','2','-c:v','libx264','-pix_fmt','yuv420p',video]);
 assert.equal(fixture.status,0,fixture.stderr?.toString());
 const auth={'X-Persona-Worker-Token':worker.token};
 const upload=await fetch(base,{method:'PUT',headers:auth,body:await readFile(video)});
 assert.equal(upload.status,201);
 const intake=await upload.json();
 const payload={hook:'Тема рождается здесь',consent:true,videoSha256:intake.sourceSha256,hookStartSec:1};
 const post=body=>fetch(base+'/'+intake.id+'/render',{method:'POST',
  headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post({...payload,videoSha256:'other'})).status,400);
 assert.equal((await post({...payload,consent:false})).status,400);
 assert.equal((await post({...payload,hookStartSec:-1})).status,400);
 const rendered=await post(payload);
 assert.equal(rendered.status,201,await rendered.clone().text());
 const report=await rendered.json(),href=base+'/'+report.id+'/variant/1';
 assert.equal(report.hookStartSec,1);
 assert.ok(report.variants.every(variant=>variant.firstFrameIdentical));
 assert.equal((await fetch(href)).status,401);
 const download=await fetch(href+'?token='+worker.token);
 assert.equal(download.status,200);
 assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),report.variants[0].sha256);
 assert.equal((await post(payload)).status,200);
});
