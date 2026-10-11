import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const adapterUrl=pathToFileURL(resolve('scripts/persona-v11-original-engine-adapter.mjs')).href;

async function fixture(mode){
 const root=await mkdtemp(join(tmpdir(),'persona-v11-adapter-'));
 await mkdir(join(root,'scripts'),{recursive:true});
 await writeFile(join(root,'scripts','persona-video.mjs'),`
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const input=resolve(process.argv[2]);
const output=resolve(process.argv[process.argv.indexOf('--output')+1]);
await writeFile(join(output,'invocation.json'),JSON.stringify({input,output}));
if(process.env.TEST_V11_MODE==='fail')process.exit(7);
if(process.env.TEST_V11_MODE==='slow')await new Promise(resolve=>setTimeout(resolve,60000));
const run=join(output,'run-original');await mkdir(run,{recursive:true});
if(process.env.TEST_V11_MODE!=='missing')await writeFile(join(run,'instagram-reels.mp4'),Buffer.alloc(2048,1));
const report=join(run,'report.json');
await writeFile(report,JSON.stringify({status:'COMPLETED',platformOutputs:[{presetId:'instagram-reels',path:join(run,'instagram-reels.mp4')}]}));
console.log(report);
`);
 const source=join(root,'source.mp4');await writeFile(source,Buffer.alloc(2048,2));
 const output=join(root,'output');await mkdir(output);
 return {root,source,output,mode};
}

function invocation(f,signal=new AbortController().signal){
 return {inputPath:f.source,outputDir:f.output,request:{id:'request'},
  processingRequestId:'job-'+'a'.repeat(32),mediaAssetId:'a'.repeat(32),projectId:'project',
  contentItemId:'content',ideaId:'idea',ideaVersion:3,sessionId:'shoot',attempt:1,
  outputProfile:{platform:'instagram',format:'reels',container:'mp4',videoCodec:'h264',aspectRatio:'9:16'},
  signal,timeoutMs:3000};
}

test('adapter invokes the original CLI and returns its Instagram output',async()=>{
 const f=await fixture('success');
 try{
  process.env.PERSONA_V11_WORKTREE=f.root;process.env.TEST_V11_MODE='success';
  const {process:run}=await import(adapterUrl+'?success='+Date.now());
  const result=await run(invocation(f));
  assert.equal(result.success,true);
  assert.equal(result.instagramPath,join(f.output,'run-original','instagram-reels.mp4'));
  const recorded=JSON.parse(await readFile(join(f.output,'invocation.json'),'utf8'));
  assert.deepEqual(recorded,{input:f.source,output:f.output});
 }finally{delete process.env.PERSONA_V11_WORKTREE;delete process.env.TEST_V11_MODE;await rm(f.root,{recursive:true,force:true});}
});

test('adapter rejects non-zero exit and a missing reported output',async()=>{
 for(const mode of ['fail','missing']){
  const f=await fixture(mode);
  try{
   process.env.PERSONA_V11_WORKTREE=f.root;process.env.TEST_V11_MODE=mode;
   const {process:run}=await import(adapterUrl+'?'+mode+'='+Date.now());
   await assert.rejects(run(invocation(f)),new RegExp(mode==='fail'?'v11_engine_exit_7':'v11_instagram_output_missing'));
  }finally{delete process.env.PERSONA_V11_WORKTREE;delete process.env.TEST_V11_MODE;await rm(f.root,{recursive:true,force:true});}
 }
});

test('adapter aborts and reaps the original CLI before rejecting',async()=>{
 const f=await fixture('slow');const controller=new AbortController();
 try{
  process.env.PERSONA_V11_WORKTREE=f.root;process.env.TEST_V11_MODE='slow';
  const {process:run}=await import(adapterUrl+'?abort='+Date.now());
  const pending=run(invocation(f,controller.signal));
  setTimeout(()=>controller.abort(),100);
  await assert.rejects(pending,/v11_engine_cancelled/);
 }finally{delete process.env.PERSONA_V11_WORKTREE;delete process.env.TEST_V11_MODE;await rm(f.root,{recursive:true,force:true});}
});

test('adapter fails closed when the frozen worktree is not configured',async()=>{
 const f=await fixture('success');
 try{
  delete process.env.PERSONA_V11_WORKTREE;
  const {process:run}=await import(adapterUrl+'?unconfigured='+Date.now());
  await assert.rejects(run(invocation(f)),/v11_local_adapter_not_configured/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
