import {mkdir,open,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';

export const engineLeaseDir=outputDir=>join(resolve(outputDir,'..'),'.v11-engine-owner');

async function atomicJson(path,value){
 const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{
  await writeFile(temp,JSON.stringify(value),{flag:'wx',mode:0o600});
  const file=await open(temp,'r+');try{await file.sync();}finally{await file.close();}
  await rename(temp,path);
 }catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}
}

export async function createEngineIntent(outputDir,input){
 const dir=engineLeaseDir(outputDir),token=randomBytes(16).toString('hex');
 await mkdir(dir,{mode:0o700});
 const intent={token,state:'launching',adapterPid:process.pid,
  processingRequestId:input.processingRequestId,attempt:input.attempt,
  startedAt:new Date().toISOString()};
 try{await atomicJson(join(dir,'intent.json'),intent);}
 catch(error){await rm(dir,{recursive:true,force:true}).catch(()=>{});throw error;}
 return {dir,token,intent};
}

export async function publishEnginePid(lease,pid){
 if(!Number.isInteger(pid)||pid<1)throw Error('v11_engine_spawn_failed');
 await atomicJson(join(lease.dir,'running.json'),{token:lease.token,state:'running',pid,
  processingRequestId:lease.intent.processingRequestId,attempt:lease.intent.attempt,
  startedAt:lease.intent.startedAt});
}

export async function readEngineLease(outputDir,expectedId){
 const dir=engineLeaseDir(outputDir);let intent;
 try{intent=JSON.parse(await readFile(join(dir,'intent.json'),'utf8'));}
 catch(error){
  if(error.code==='ENOENT'){
   try{await stat(dir);}catch(inner){if(inner.code==='ENOENT')return null;throw Error('v11_engine_lease_invalid');}
   try{await readFile(join(dir,'running.json'));}
   catch(inner){if(inner.code==='ENOENT')return {state:'prelaunch',dir};}
  }
  throw Error('v11_engine_lease_invalid');
 }
 if(intent?.state!=='launching'||!artToken(intent?.token)||intent.processingRequestId!==expectedId||
   !Number.isInteger(intent?.attempt)||intent.attempt<0||!Number.isInteger(intent?.adapterPid)||
   intent.adapterPid<1||!Number.isFinite(Date.parse(intent?.startedAt)))throw Error('v11_engine_lease_invalid');
 let running;
 try{running=JSON.parse(await readFile(join(dir,'running.json'),'utf8'));}
 catch(error){if(error.code==='ENOENT')return {...intent,dir};throw Error('v11_engine_lease_invalid');}
 if(running?.state!=='running'||running.token!==intent.token||running.processingRequestId!==expectedId||
   running.attempt!==intent.attempt||!Number.isInteger(running.pid)||running.pid<1||
   running.startedAt!==intent.startedAt)throw Error('v11_engine_lease_invalid');
 return {...running,dir};
}

export async function removeEngineLease(lease){
 try{
  const intent=JSON.parse(await readFile(join(lease.dir,'intent.json'),'utf8'));
  if(intent.token===lease.token)await rm(lease.dir,{recursive:true,force:true});
 }catch{}
}

function artToken(value){return typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);}
