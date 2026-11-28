/** Read-only runtime diagnostics. No inference, network calls, secrets, paths or filenames in receipts. */
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {FOLDERS} from './persona-yandex-library.mjs';
export const RUNTIME_PROTOCOL=1;
/** Capture at process/module startup, never recompute an old Worker's identity
 * from a subsequently changed HEAD. No paths or Git diagnostics leave this helper. */
export function readPersonaBuildIdentity({run=spawnSync}={}){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const call=args=>run('git',['-c','safe.directory='+root,'-C',root,...args],{encoding:'utf8',timeout:2000,maxBuffer:65536,windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
 try{
  const head=call(['rev-parse','HEAD']),revision=String(head.stdout??'').trim();
  if(head.status!==0||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))return {revision:null,dirty:null,verified:false};
  const status=call(['status','--porcelain','--untracked-files=no']);
  const dirty=status.status===0?Boolean(String(status.stdout??'').trim()):null;
  return {revision,dirty,verified:dirty===false};
 }catch{return {revision:null,dirty:null,verified:false}}
}
const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;
async function report(path,max=16*1024*1024){
 try{
  const s=await stat(path);if(!s.isFile()||s.size>max)return {status:'INVALID'};
  const data=JSON.parse(await readFile(path,'utf8'));
  if(!data||typeof data!=='object'||Array.isArray(data))return {status:'INVALID'};
  return {status:'PRESENT',data};
 }catch(e){return {status:e.code==='ENOENT'?'MISSING':'INVALID'}}
}
export async function inspectPersonaRuntime({cache,backgroundEnabled=false,now=Date.now()}={}){
 const result={version:RUNTIME_PROTOCOL,checkedAt:new Date(now).toISOString(),cache:cache?'CONFIGURED':'NOT_CONFIGURED',personal:{status:'UNKNOWN',total:null},references:{status:'UNKNOWN',total:null},photos:{status:'UNKNOWN',scored:null,selected:null},frameIndex:{status:'UNKNOWN',indexed:null},videoIndex:{status:'UNKNOWN',indexed:null},backgroundEnabled:Boolean(backgroundEnabled),publicationApproved:false};
 if(!cache)return result;
 const catalog=async folder=>{
  const r=await report(join(cache,'catalogs',folder,'persona-assets-v1.json'));
  if(r.status!=='PRESENT')return {status:r.status,total:null};
  return r.data.kind==='persona-local-library-v1'&&Array.isArray(r.data.assets)?{status:'INDEXED',total:r.data.assets.filter(a=>a.availability==='local').length}:{status:'INVALID',total:null};
 };
 const [personal,references,scores,final,progress,frames,videos]=await Promise.all([
  catalog(FOLDERS[0]),catalog(FOLDERS[1]),
  report(join(cache,'about-me','photo-scores.json')),report(join(cache,'START-RESULT.json'),65536),
  report(join(cache,'about-me','photo-progress.json'),65536),
  report(join(cache,'catalogs',FOLDERS[1],'reference-evidence-v1.json')),
  report(join(cache,'catalogs',FOLDERS[1],'reference-video-progress.json'),1024*1024)
 ]);
 result.personal=personal;result.references=references;
 const rows=scores.data?.rows;
 const validRows=Array.isArray(rows)&&rows.length<=5000?new Set(rows.filter(r=>r&&/^[a-f0-9]{64}$/i.test(r.sha256)&&['portrait','screen','stage','music','editorial'].every(k=>Number.isFinite(r.scores?.[k])&&r.scores[k]>=0&&r.scores[k]<=10)&&typeof r.reason==='string').map(r=>r.sha256)).size:null;
 const p=progress.data,f=final.data,heartbeat=Date.parse(p?.heartbeatAt??'');
 const running=p?.state==='running';
 result.photos={
  status:running?(Number.isFinite(heartbeat)&&now-heartbeat<=90000&&heartbeat<=now+5000?'RECENT_HEARTBEAT':'STALE_HEARTBEAT'):
    validRows===null?(scores.status==='PRESENT'?'UNSUPPORTED_CHECKPOINT':scores.status):
    validRows===0?'NO_SCORES':'SCORES_AVAILABLE',
  scored:validRows,selected:count(f?.shortlistCount),legacyReportedCount:count(f?.photoCount),
  legacyResult:['PASS','PARTIAL','NO_CANDIDATES'].includes(f?.photoStatus)?f.photoStatus:null
 };
 result.frameIndex={status:frames.status==='PRESENT'?(frames.data.version===1&&Array.isArray(frames.data.rows)?'INDEXED':'INVALID'):frames.status,indexed:Array.isArray(frames.data?.rows)?frames.data.rows.length:null};
 const v=videos.data;
 result.videoIndex={status:videos.status==='PRESENT'?(v.version==='reference-video-v1'?'REPORT_AVAILABLE':'INVALID'):videos.status,indexed:Number.isSafeInteger(v?.analyzed)&&Number.isSafeInteger(v?.reused)?count(v.analyzed+v.reused):null};
 return result;
}
