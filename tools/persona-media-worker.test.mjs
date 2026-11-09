import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
import {createHash} from 'node:crypto';

const brief={version:1,sourceFormat:'reel',script:[
 {order:1,line:'First line'},{order:2,line:'Second line'},
],shots:[{order:1},{order:2}]};
test('loopback worker rejects foreign origins and accepts only explicit local authenticated sessions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-worker-test-'));
 const worker=createPersonaMediaWorker({port:0,outputRoot:root,ffmpegDir:null,whisperCli:'missing.exe',whisperModel:'missing.bin',ollamaModel:'qwen3:4b-instruct'});
 const port=await worker.start(),base='http://127.0.0.1:'+port;
 try{
  const health=await fetch(base+'/health');assert.equal(health.status,200);const info=await health.json();assert.equal(info.service,'persona-media-worker');assert.equal(info.ok,false);assert.equal(info.components.ffmpeg,false);assert.equal(info.components.whisper,false);assert.match(info.token,/^[a-f0-9-]{36}$/);
  const foreign=await fetch(base+'/session',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json','X-Persona-Worker-Token':info.token},body:JSON.stringify({brief,variation:'cinematic',takeCount:2})});assert.equal(foreign.status,403);
  const noToken=await fetch(base+'/session',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json'},body:JSON.stringify({brief,variation:'cinematic',takeCount:2})});assert.equal(noToken.status,401);
  const created=await fetch(base+'/session',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-Persona-Worker-Token':info.token},body:JSON.stringify({brief,variation:'cinematic',takeCount:2,model:'qwen3:4b-instruct'})});assert.equal(created.status,201);const session=await created.json();assert.match(session.id,/^[a-f0-9-]{36}$/);assert.deepEqual((await readdir(root)).filter(name=>name.startsWith('ai-reel-')),[],'runner output stays absent until it creates it atomically');
  const traversal=await fetch(base+'/session/'+session.id+'/take/0',{method:'PUT',headers:{Origin:'http://127.0.0.1:5173','X-Persona-Worker-Token':info.token,'X-Persona-File-Name':'..\\outside.mp4','Content-Length':'1024'},body:Buffer.alloc(1024)});assert.equal(traversal.status,400);
  const bytes=Buffer.alloc(1024,7),headers={Origin:'http://127.0.0.1:5173','X-Persona-Worker-Token':info.token,'X-Persona-File-Name':'S01_take01.mp4','X-Persona-Original-Name':encodeURIComponent('Мой дубль.mp4')};
  const badName=await fetch(base+'/session/'+session.id+'/take/0',{method:'PUT',headers:{...headers,'X-Persona-Original-Name':encodeURIComponent('../private.mp4')},body:bytes});assert.equal(badName.status,400);
  const uploaded=await fetch(base+'/session/'+session.id+'/take/0',{method:'PUT',headers,body:bytes});assert.equal(uploaded.status,200);
  const duplicate=await fetch(base+'/session/'+session.id+'/take/1',{method:'PUT',headers,body:Buffer.alloc(1024,9)});assert.equal(duplicate.status,400);
  const staged=(await readdir(root)).find(name=>name.startsWith('.worker-staging-'));
  assert.deepEqual(await readFile(join(root,staged,'S01_take01.mp4')),bytes,'duplicate upload cannot delete previously staged bytes');
  const intake=JSON.parse(await readFile(join(root,staged,'source-0.json'),'utf8'));
  assert.equal(intake.originalName,'Мой дубль.mp4');assert.equal(intake.stagedName,'S01_take01.mp4');
  assert.equal(intake.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(intake.bytes,bytes.length);
 }finally{await new Promise(resolve=>worker.server.close(resolve));await rm(root,{recursive:true,force:true});}
});

