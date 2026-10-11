import {spawn} from 'node:child_process';
import {readFile, realpath, stat} from 'node:fs/promises';
import {isAbsolute, join, relative, resolve} from 'node:path';

const MAX_DIAGNOSTIC_BYTES=64*1024;

export async function process(input){
 validateInput(input);
 const configured=globalThis.process.env.PERSONA_V11_WORKTREE;
 if(!configured||!isAbsolute(configured))throw Error('v11_local_adapter_not_configured');
 const worktree=resolve(configured);
 const entry=join(worktree,'scripts','persona-video.mjs');
 const execution=await runOriginalCli({entry,worktree,input});
 if(execution.cancelled)throw Error('v11_engine_cancelled');
 if(execution.timedOut)throw Error('v11_engine_timeout');
 if(execution.exitCode!==0)throw Error('v11_engine_exit_'+String(execution.exitCode));
 const reportPath=reportFromStdout(execution.stdout,input.outputDir);
 let report;
 try{report=JSON.parse(await readFile(reportPath,'utf8'));}
 catch{throw Error('v11_report_missing_or_invalid');}
 const instagram=Array.isArray(report?.platformOutputs)
  ?report.platformOutputs.find(output=>output?.presetId==='instagram-reels'):null;
 if(report?.status!=='COMPLETED'||typeof instagram?.path!=='string')
  throw Error('v11_instagram_output_missing');
 const instagramPath=await confinedFile(instagram.path,input.outputDir);
 return {success:true,instagramPath,stderrSummary:safeSummary(execution.stderr)};
}

function validateInput(input){
 if(!input||typeof input!=='object'||!isAbsolute(input.inputPath)||!isAbsolute(input.outputDir)||
  !Number.isInteger(input.attempt)||input.attempt<0||!input.signal||
  !Number.isFinite(input.timeoutMs)||input.timeoutMs<1||
  input.outputProfile?.platform!=='instagram'||input.outputProfile?.format!=='reels'||
  input.outputProfile?.container!=='mp4'||input.outputProfile?.videoCodec!=='h264'||
  input.outputProfile?.aspectRatio!=='9:16')throw Error('invalid_v11_invocation');
}

function runOriginalCli({entry,worktree,input}){
 return new Promise((resolveRun,reject)=>{
  let stdout='',stderr='',cancelled=false,timedOut=false,settled=false;
  const child=spawn(globalThis.process.execPath,[entry,input.inputPath,'--output',input.outputDir],{
   cwd:worktree,env:globalThis.process.env,shell:false,windowsHide:true,
   detached:globalThis.process.platform!=='win32',stdio:['ignore','pipe','pipe']
  });
  const append=(current,chunk)=>(current+chunk.toString('utf8')).slice(-MAX_DIAGNOSTIC_BYTES);
  child.stdout.on('data',chunk=>{stdout=append(stdout,chunk)});
  child.stderr.on('data',chunk=>{stderr=append(stderr,chunk)});
  const finish=value=>{if(settled)return;settled=true;cleanup();resolveRun(value)};
  const cleanup=()=>{clearTimeout(timer);input.signal.removeEventListener('abort',onAbort)};
  const stop=()=>terminateTree(child);
  const onAbort=()=>{cancelled=true;stop()};
  input.signal.addEventListener('abort',onAbort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;stop()},input.timeoutMs);
  if(input.signal.aborted)onAbort();
  child.once('error',error=>{if(settled)return;settled=true;cleanup();reject(error)});
  child.once('close',code=>finish({exitCode:code??1,stdout,stderr,cancelled,timedOut}));
 });
}

function terminateTree(child){
 if(!child.pid)return;
 if(globalThis.process.platform==='win32'){
  const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',windowsHide:true,shell:false});
  const fallback=()=>{if(child.exitCode===null)child.kill('SIGKILL')};
  killer.once('error',fallback);killer.once('close',fallback);
  const force=setTimeout(fallback,2000);force.unref();
 }else{
  try{globalThis.process.kill(-child.pid,'SIGTERM')}catch{child.kill('SIGTERM')}
  const force=setTimeout(()=>{try{globalThis.process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}},2000);
  force.unref();
 }
}

function reportFromStdout(stdout,outputDir){
 const candidates=stdout.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).reverse();
 const report=candidates.find(line=>line.toLowerCase().endsWith('report.json'));
 if(!report||!isAbsolute(report)||outside(report,outputDir))throw Error('v11_report_missing_or_invalid');
 return resolve(report);
}

async function confinedFile(file,outputDir){
 const resolved=resolve(file);
 if(!isAbsolute(file)||outside(resolved,outputDir))throw Error('v11_output_outside_attempt_directory');
 let actual,root,details;
 try{[actual,root,details]=await Promise.all([realpath(resolved),realpath(outputDir),stat(resolved)]);}
 catch{throw Error('v11_instagram_output_missing');}
 if(outside(actual,root)||!details.isFile()||details.size<1)throw Error('v11_instagram_output_missing');
 return actual;
}

function outside(file,root){
 const rel=relative(resolve(root),resolve(file));
 return rel===''?false:rel.startsWith('..')||isAbsolute(rel);
}

function safeSummary(stderr){
 return stderr.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).slice(-4)
  .join(' ').replace(/[A-Za-z]:\\[^\s]+|\/(?:[^\s/]+\/)+[^\s]+/g,'[path]').slice(0,400);
}
