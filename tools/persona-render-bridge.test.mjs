import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local Persona bridge rejects invalid requests and accepts valid timeline sessions',async()=>{
 const port=48000+Math.floor(Math.random()*1000);
 const child=spawn(process.execPath,[resolve('tools/persona-render-bridge.mjs')],{env:{...process.env,PERSONA_RENDER_PORT:String(port)},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;
  for(let i=0;i<40;i++){try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}await delay(100)}
  assert.ok(ready,'Local bridge did not start');
  const {token}=await (await fetch(base+'/health')).json();
  const forbidden=await fetch(base+'/health',{headers:{Host:'untrusted.example'}});
  assert.equal(forbidden.status,403);
  const origin=await fetch(base+'/health',{headers:{Origin:'https://untrusted.example'}});
  assert.equal(origin.status,403);
  const unauthorized=await fetch(base+'/session',{method:'POST',body:'{}'});
  assert.equal(unauthorized.status,401);
  const invalid=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Token':token},body:JSON.stringify({version:1,clips:[]})});
  assert.equal(invalid.status,400);
  const valid=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Token':token},body:JSON.stringify({version:1,width:1080,height:1920,fps:30,clips:[{startSec:0,durationSec:1},{startSec:0,durationSec:1}]})});
  assert.equal(valid.status,200);
  const data=await valid.json();
  assert.match(data.id,/^[0-9a-f-]{36}$/);
  const premature=await fetch(base+'/session/'+data.id+'/render',{method:'POST',headers:{'X-Persona-Token':token}});
  assert.equal(premature.status,400);
 }finally{child.kill();await delay(100)}
});

test('end-to-end local bridge renders and downloads a real MP4',{timeout:180000},async()=>{
 assert.ok(['ffmpeg','ffprobe'].every(c=>spawnSync(c,['-version'],{stdio:'ignore'}).status===0),'FFmpeg and FFprobe are required for this integration test');
 const port=49000+Math.floor(Math.random()*1000);
 const child=spawn(process.execPath,[resolve('tools/persona-render-bridge.mjs')],{env:{...process.env,PERSONA_RENDER_PORT:String(port)},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;
  for(let i=0;i<50;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await delay(100)}
  assert.ok(ready,'Bridge did not start');
  const {token}=await (await fetch(base+'/health')).json();
  const created=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Token':token},body:JSON.stringify({version:1,width:1080,height:1920,fps:25,clips:[{startSec:0,durationSec:0.6},{startSec:0,durationSec:0.6}]})});
  assert.equal(created.status,200);
  const {id}=await created.json();
  const generated=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x240:rate=25','-t','1','-c:v','mpeg4','-movflags','+frag_keyframe+empty_moov','-f','mp4','pipe:1'],{maxBuffer:8*1024*1024,timeout:30000});
  assert.equal(generated.status,0,generated.stderr?.toString());
  for(let i=0;i<2;i++){
   const upload=await fetch(base+'/session/'+id+'/clip/'+i,{method:'PUT',headers:{'X-Persona-Token':token},body:generated.stdout});
   assert.equal(upload.status,200,await upload.text());
  }
  const rendered=await fetch(base+'/session/'+id+'/render',{method:'POST',headers:{'X-Persona-Token':token}});
  assert.equal(rendered.status,200,await rendered.text());
  const download=await fetch(base+'/session/'+id+'/download',{headers:{'X-Persona-Token':token}});
  assert.equal(download.status,200);
  assert.match(download.headers.get('content-type')||'',/video\/mp4/);
  const bytes=new Uint8Array(await download.arrayBuffer());
  assert.ok(bytes.length>1000);
  assert.equal(String.fromCharCode(...bytes.slice(4,8)),'ftyp');
  const dir=await mkdtemp(join(tmpdir(),'persona-bridge-test-'));
  try{
   const output=join(dir,'render.mp4');
   await writeFile(output,bytes);
   const checked=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',output],{encoding:'utf8'});
   assert.equal(checked.status,0,checked.stderr);
   const media=JSON.parse(checked.stdout);
   assert.ok(media.streams.some(v=>v.codec_type==='video'&&v.width===1080&&v.height===1920));
   assert.ok(media.streams.some(v=>v.codec_type==='audio'));
   assert.ok(Math.abs(Number(media.format.duration)-1.2)<0.25,'Rendered duration must match two 0.6-second clips');
  }finally{await rm(dir,{recursive:true,force:true})}
  const removed=await fetch(base+'/session/'+id,{method:'DELETE',headers:{'X-Persona-Token':token}});
  assert.equal(removed.status,200);
  const gone=await fetch(base+'/session/'+id+'/download',{headers:{'X-Persona-Token':token}});
  assert.equal(gone.status,404);
 }finally{child.kill();await delay(100)}
});
