import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {ProductionJob} from './persona_orchestrator.mjs';
import {stageFileSha} from './persona-stage-cache.mjs';
import {createHash} from 'node:crypto';
import {validateDraftQa} from './persona-first-reel-runner.mjs';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const attemptFolder=/^render-[a-f0-9-]{36}$/;
const masterName=/^master\.(mp4|mov|mkv|webm|m4v)$/;

export async function writeJobJson(path,value){
 await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 return stageFileSha(path);
}

async function realDirectory(path){
 if(!(await lstat(path)).isDirectory())throw Error('Production directory is not a real directory');
}

export async function checkedFile(path,sha){
 if(!(await lstat(path)).isFile()||await stageFileSha(path)!==sha)
  throw Error('Production artifact changed: '+path);
 return path;
}

async function readJobJson(path){
 if(!(await lstat(path)).isFile())throw Error('Expected a regular production file');
 return JSON.parse(await readFile(path,'utf8'));
}

async function verifiedRequest(production,folder,directory){
 const state=await production.read();
 const attempt=[state.attempt,state.lastVerifiedAttempt].find(item=>item?.folder===folder);
 if(!attempt)throw Error('Render request is not registered');
 const path=await checkedFile(join(directory,'REQUEST.json'),attempt.requestSha256);
 return readJobJson(path);
}

export async function createMusicJob(root,id,inputName,formatId){
 if(!uuid.test(id)||!masterName.test(inputName))throw Error('Invalid music job input');
 const output=join(root,'music-'+id);
 const production=await ProductionJob.create(output,{id,workflow:'music-studio',context:{inputName,formatId}});
 await production.markReady();
 return {id,output,input:join(output,'input',inputName),production};
}

export async function verifyMusicResult(job,folder,resultSha256){
 if(!attemptFolder.test(folder))throw Error('Invalid render directory');
 const directory=join(job.output,'output',folder),result=join(directory,'RESULT.json');
 await realDirectory(join(job.output,'output'));
 await realDirectory(directory);
 const request=await verifiedRequest(job.production,folder,directory);
 await checkedFile(result,resultSha256);
 const report=await readJobJson(result);
 const video=join(directory,'music-reel.mp4'),qaPath=join(directory,'VIDEO-QUALITY.json');
 if(report?.status!=='awaiting-author-review'||report.publicationApproved!==false||report.distributionAllowed!==false||
    report.source?.sha256!==job.sourceSha256||report.video?.path!==video||report.qaPath!==qaPath||
    JSON.stringify(report.selection)!==JSON.stringify(request.candidate)||
    report.audio?.mode!==request.mode||report.captionStyle!==request.captionStyle)
  throw Error('Music render does not belong to this production job');
 const qa=await readJobJson(qaPath);
 if(qa.video?.sha256!==report.video.sha256||qa.video?.path!==video||
    qa.findings?.find(item=>item.id==='decode_integrity')?.measurement?.value!=='pass')
  throw Error('Music render QA does not verify its MP4');
 await checkedFile(video,report.video.sha256);
 return report;
}

export async function restoreMusicJob(root,id){
 if(!uuid.test(id))return null;
 const output=join(root,'music-'+id),production=new ProductionJob(output);
 const data=await (async()=>{
  await realDirectory(output);
  await realDirectory(join(output,'input'));
  return readJobJson(production.path);
 })().catch(error=>{if(error?.code==='ENOENT')return null;throw error;});
 if(!data)return null;
 const state=await production.read();
 if(state.id!==id||state.workflow!=='music-studio'||!masterName.test(state.context?.inputName)||
    !['ANALYZING','EDITING','AWAITING_APPROVAL'].includes(state.status)||state.assets.length!==1)return null;
 const asset=state.assets[0];
 if(asset.name!==state.context.inputName)throw Error('Music master is not registered');
 const input=join(output,'input',asset.name);
 await checkedFile(input,asset.sha256);
 const packet=await readJobJson(join(output,'ANALYSIS.json'));
 if(await stageFileSha(join(output,'ANALYSIS.json'))!==asset.analysisSha256||
    packet.sourceSha256!==asset.sha256||packet.analysis?.format?.id!==state.context.formatId)
  throw Error('Music analysis changed after intake');
 const job={id,output,input,production,...packet,state:state.status};
 if(state.lastVerifiedAttempt)job.report=await verifyMusicResult(job,state.lastVerifiedAttempt.folder,state.lastVerifiedAttempt.resultSha256);
 return job;
}

export async function createReelJob(root,id,brief,options){
 const directory=join(root,'.worker-staging-'+id);
 const briefSha256=createHash('sha256').update(JSON.stringify(brief)).digest('hex');
 const production=await ProductionJob.create(directory,{id,workflow:'scripted-reel',context:{briefSha256,options}});
 const briefPath=join(directory,'approved-production-brief.json');
 await writeJobJson(briefPath,brief);
 await production.markReady();
 return hydrateReel(production,brief,briefPath,options);
}

function hydrateReel(production,brief,briefPath,options){
 return {...options,id:options.id,production,brief,briefPath,input:join(production.directory,'input'),
  output:null,uploaded:new Set(),receipts:new Map(),total:0,files:new Set(),uploading:new Set(),state:'uploading',stage:'intake'};
}

export function inspectCoverage(brief,receipts,{masterAsset=false}={}){
 const scenes=brief.script.map(beat=>({order:beat.order,declared:0}));
 let unmapped=0;
 for(const receipt of receipts){
  const order=receipt.binding?.sceneOrder??Number(/^S(\d{2})_take/i.exec(receipt.stagedName)?.[1]);
  const scene=!masterAsset&&scenes.find(row=>row.order===order);
  if(scene)scene.declared++;
  else unmapped++;
 }
 return {scenes,unmapped,requiresReview:masterAsset||unmapped>0,
  missing:masterAsset||unmapped>0?null:scenes.filter(scene=>scene.declared===0).map(scene=>scene.order)};
}

export async function verifyReelInputs(session,safeFile){
 const takes=[];
 await realDirectory(session.input);
 for(let index=0;index<session.expected;index++){
  const receipt=await readJobJson(join(session.input,'source-'+index+'.json')).catch(error=>{
   if(error.code==='ENOENT')return null;
   throw error;
  });
  if(!receipt)continue;
  if(!safeFile(receipt.stagedName)||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1024||
     !Number.isFinite(receipt.durationSec))throw Error('Invalid recorded input receipt');
  const path=await checkedFile(join(session.input,receipt.stagedName),receipt.sha256);
  if((await lstat(path)).size!==receipt.bytes)throw Error('Recorded input length changed');
  takes.push({...receipt,index,name:receipt.stagedName});
 }
 return takes;
}

export async function verifyReelResult(session,folder,resultSha256){
 if(!attemptFolder.test(folder))throw Error('Invalid reel directory');
 const output=join(session.production.directory,'output',folder,'reel');
 for(const path of [join(session.production.directory,'output'),join(output,'..'),output])await realDirectory(path);
 const request=await verifiedRequest(session.production,folder,join(output,'..'));
 const resultPath=await checkedFile(join(output,'RESULT.json'),resultSha256);
 const result=await readJobJson(resultPath),video=join(output,'ai-edited-reel.mp4'),qa=join(output,'ai-edited-qa.json');
 const state=await session.production.read();
 if(result.status!=='awaiting-author-review'||result.publicationApproved!==false||result.distributionAllowed!==false||
    result.briefFingerprintSha256!==state.context.briefSha256||request.briefSha256!==state.context.briefSha256||
    result.aiFinishedVideo!==video||result.aiFinishedQaPath!==qa)
  throw Error('Reel result does not match the approved brief');
 const evidence=await readJobJson(qa);
 validateDraftQa(evidence,video);
 await checkedFile(video,evidence.evidence.sha256);
 return {output,result,videoSha256:evidence.evidence.sha256};
}

export async function restoreReelJob(root,id,safeFile){
 if(!uuid.test(id))return null;
 const directory=join(root,'.worker-staging-'+id),production=new ProductionJob(directory);
 try{await realDirectory(directory);await lstat(production.path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 const data=await production.read(),options=data.context?.options;
 if(data.id!==id||data.workflow!=='scripted-reel'||options?.id!==id||!Number.isInteger(options.expected)||
    options.expected<1||options.expected>12)return null;
 const briefPath=join(directory,'approved-production-brief.json'),brief=await readJobJson(briefPath);
 if(createHash('sha256').update(JSON.stringify(brief)).digest('hex')!==data.context.briefSha256)
  throw Error('Approved production brief changed');
 const session=hydrateReel(production,brief,briefPath,options);
 const takes=await verifyReelInputs(session,safeFile);
 if(data.assets.length&&JSON.stringify(takes)!==JSON.stringify(data.assets))throw Error('Registered take receipts changed');
 for(const take of takes){session.uploaded.add(take.index);session.receipts.set(take.index,take);session.total+=take.bytes;}
 if(data.lastVerifiedAttempt){
  return {...session,...await verifyReelResult(session,data.lastVerifiedAttempt.folder,data.lastVerifiedAttempt.resultSha256),
   state:'completed',stage:'awaiting_author_review'};
 }
 if(['ANALYZING','EDITING'].includes(data.status)){
  session.state='interrupted';
  session.error='Сохранённые дубли можно использовать для новой попытки.';
 }
 return session;
}

export async function approveMusicMoment(job,root,{approved,videoSha256}){
 if(approved!==true)throw Error('Фрагмент требует отдельного подтверждения автора.');
 const state=await job.production.read(),attempt=state.lastVerifiedAttempt;
 if(!attempt)throw Error('Сначала соберите проверенный MP4.');
 const report=await verifyMusicResult(job,attempt.folder,attempt.resultSha256);
 if(videoSha256!==report.video.sha256)throw Error('Подтвердите актуальную версию MP4.');
 await checkedFile(job.input,job.sourceSha256);
 const {startSec,endSec}=report.selection??{};
 if(!Number.isFinite(startSec)||!Number.isFinite(endSec)||startSec<0||endSec<=startSec||
    endSec>job.media.duration+.001)throw Error('Invalid approved moment boundaries');
 const identity=[job.sourceSha256,startSec,endSec];
 const id=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
 const library=join(root,'approved-moments');
 await mkdir(library,{recursive:true});
 await realDirectory(library);
 const path=join(library,id+'.json');
 const receipt={version:1,id,jobId:job.id,source:{name:basename(job.input),sha256:job.sourceSha256},
  startSec,endSec,verifiedVideoSha256:report.video.sha256,approvedAt:new Date().toISOString(),
  approvedForReuse:true,publicationApproved:false,distributionAllowed:false};
 try{await writeJobJson(path,receipt);return receipt;}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  const current=await readJobJson(path);
  if(current.id!==id||current.source?.sha256!==identity[0]||current.startSec!==startSec||
     current.endSec!==endSec||current.approvedForReuse!==true||current.publicationApproved!==false||
     current.distributionAllowed!==false)throw Error('Existing moment record conflicts with verified source');
  return current;
 }
}
