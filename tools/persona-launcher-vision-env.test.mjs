import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {editPlanProvider} from './persona-quick-edit-plan.mjs';
import {detectVisionBatch} from './persona-smart-moments.mjs';

const workerPath=fileURLToPath(new URL('./persona-media-worker.mjs',import.meta.url));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function withWorker({dotenv,extraEnv={} },run){
 const home=await mkdtemp(join(tmpdir(),'persona-vision-env-'));
 if(dotenv!==null)await writeFile(join(home,'.env.local'),dotenv,'utf8');
 const env={...process.env,...extraEnv,PERSONA_QUICK_RENDER_ROOT:join(home,'renders'),
  PERSONA_MEDIA_OUTPUT_ROOT:join(home,'other')};
 delete env.OPENROUTER_API_KEY;
 delete env.OPENAI_API_KEY;
 const child=spawn(process.execPath,[workerPath,'--port','0'],{
  cwd:home,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';
 child.stdout.on('data',b=>{stdout+=b.toString('utf8')});
 child.stderr.on('data',b=>{stderr+=b.toString('utf8').slice(0,400)});
 try{
  let url;
  for(let attempt=0;attempt<150;attempt++){
   const match=stdout.match(/Persona AI Media Worker: (http:\/\/127\.0\.0\.1:\d+)/);
   if(match){url=match[1];break}
   if(child.exitCode!==null)throw Error('Worker exited before startup: '+stderr.slice(-400));
   await pause(100);
  }
  if(!url)throw Error('Worker did not start within 15 seconds: '+stderr.slice(-200));
  await run(url);
 }finally{
  if(child.exitCode===null){
   child.kill();
   for(let i=0;i<30&&child.exitCode===null;i++)await pause(100);
  }
  await rm(home,{recursive:true,force:true});
 }
}
test('Node 22 Worker reads ignored .env.local and enables only OpenRouter for real Smart Moments',{timeout:65000},async()=>{
 await withWorker({dotenv:'OPENROUTER_API_KEY=fixture-openrouter-token-never-valid\nPERSONA_AUTO_RENDER_MODEL=openai/gpt-4.1-mini\n'},async(base)=>{
  const h=await fetch(base+'/health'),health=await h.json();
  assert.equal(h.status,200);
  assert.equal(health.service,'persona-media-worker');
  assert.equal(health.quickRenderConfigured,true);
  assert.ok(typeof health.token==='string');
  assert.ok(!JSON.stringify(health).includes('fixture-openrouter-token'));
  const body={prompt:'Сделай красиво',files:[{kind:'video',name:'original.mp4',size:4096}],consent:true};
  const create=await fetch(base+'/quick-render',{method:'POST',
   headers:{'X-Persona-Worker-Token':health.token,'Content-Type':'application/json'},
   body:JSON.stringify(body)});
  const created=await create.json();
  assert.equal(create.status,201,JSON.stringify(created));
  assert.ok(created?.id);
 });
});
test('Without OpenRouter, the local job starts but Vision remains disabled (even with an OpenAI-only key)',{timeout:65000},async()=>{
 for(const dotenv of [null,'OPENAI_API_KEY=fixture-openai-only-not-valid\n']){
  await withWorker({dotenv},async(base)=>{
   const health=await(await fetch(base+'/health')).json();
   assert.equal(health.quickRenderConfigured,false);
   const request=await fetch(base+'/quick-render',{method:'POST',
    headers:{'X-Persona-Worker-Token':health.token,'Content-Type':'application/json'},
    body:JSON.stringify({prompt:'Сделай красиво',files:[{kind:'video',name:'original.mp4',size:4096}],consent:true})});
   assert.equal(request.status,201,'local offline draft intake must not require Vision');
   const created=await request.json();
   assert.ok(created.id);
   assert.equal(created.state,'uploading');
   const projects=await fetch(base+'/quick-render',{headers:{'X-Persona-Worker-Token':health.token}});
   assert.equal(projects.status,200);
   const listed=await projects.json();
   assert.equal(listed.jobs[0].id,created.id);
  });
 }
});
test('Vision provider stays OpenRouter, receives actual JPEGs and cannot fall back to OpenCV',async()=>{
 const provider=editPlanProvider({OPENROUTER_API_KEY:'fixture-only',OPENAI_API_KEY:'fixture-openai'});
 assert.equal(provider.provider,'openrouter');
 const frame={id:'f0_0',fileIndex:0,atSec:0,sourceSha256:'a'.repeat(64)};
 const photo=Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(420)]);
 let requested=0;
 const result=await detectVisionBatch({
  frames:[frame],jpegs:[photo],
  env:{OPENROUTER_API_KEY:'fixture-only'},
  fetchImpl:async(url,options)=>{
   requested++;
   assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
   const request=JSON.parse(options.body);
   assert.ok(request.messages[1].content.some(x=>x.type==='image_url'));
   return {ok:true,text:async()=>JSON.stringify({choices:[{message:{
    content:JSON.stringify({frames:[{id:frame.id,faceVisible:true,lookingAtCamera:true,sharpFace:true,
     emotion:'smile',transition:false,intensity:3,clarity:4,reason:'Visible smile'}]})}}]})};
  },
 });
 assert.equal(requested,1);
 assert.equal(result.provider,'openrouter');
 assert.equal(result.frames[0].emotion,'smile');
});
