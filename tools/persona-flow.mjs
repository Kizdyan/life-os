#!/usr/bin/env node
/**
 * Real Persona execution flow. No demo templates, fake providers, uploads or auto-publication.
 *
 * prepare  => two actual LLM calls => IDEAS.json + canonical PRODUCTION-BRIEF.json + SHOOT.md
 * render   => existing Whisper + Ollama + FFmpeg renderer => real MP4 + technical QA
 * package  => validated, copied real MP4 + publication draft, NOT a social post
 *
 * A camera cannot record footage by itself; the state WAITING_FOR_FOOTAGE is intentional.
 */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,copyFile,mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFirstReel,validateDraftQa} from './persona-first-reel-runner.mjs';
import {matchBriefToLibrary,shootGapMarkdown} from './persona-library-shot-match.mjs';
import {readCommercialIdeaDetails} from './persona-commercial-prompt.mjs';

const fail=message=>{throw Error('Persona flow: '+message)};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const txt=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const allowedStyles=new Set(['cinematic','humor','intimate','unexpected']);
async function sha256(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex')}
async function absent(path){await access(path).then(()=>fail('Output exists: '+path),error=>{if(error?.code!=='ENOENT')throw error})}
function trustedServer(value){
 if(!object(value)||!txt(value.id,1,64)||!txt(value.model,1,120)||
  !txt(value.baseUrl,8,300))fail('Invalid model provider config');
 let url;try{url=new URL(value.baseUrl)}catch{fail('Invalid model server URL')}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!=='')
  fail('Model servers must be origins, not URLs with credentials or paths');
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))
  fail('Non-local model servers must use HTTPS');
 if(value.tokenEnv!==undefined&&!/^[A-Z][A-Z0-9_]{1,79}$/.test(value.tokenEnv))
  fail('Invalid secret environment variable name');
 return {id:value.id,model:value.model,origin:url.origin,tokenEnv:value.tokenEnv};
}
/** Several explicit Ollama-compatible servers; ordered fallback, never a silent template. */
export function validateModelServers(input){
 if(!Array.isArray(input)||!input.length||input.length>8)fail('Provide 1-8 configured model servers');
 const servers=input.map(trustedServer);
 if(new Set(servers.map(s=>s.id)).size!==servers.length)fail('Provider IDs must be unique');
 return servers;
}
export function validateIdeas(input,{count}={}){
 if(count!==undefined&&![1,3].includes(count))fail('Invalid requested idea count');
 const ideas=input?.ideas;
 if(!Array.isArray(ideas)||(count!==undefined?ideas.length!==count:ideas.length<3||ideas.length>5))fail('Model did not return the required number of real ideas');
 const seen=new Set();
 return ideas.map((idea,index)=>{
  if(!object(idea)||!txt(idea.title,4,140)||!txt(idea.angle,8,650)||
   !txt(idea.hook,4,180))fail('Incomplete model idea '+(index+1));
  const key=idea.title.toLowerCase().trim().replace(/\s+/g,' ');
  if(seen.has(key))fail('Model duplicated an idea');
  seen.add(key);
  return {id:'idea-'+(index+1),title:idea.title.trim(),angle:idea.angle.trim(),hook:idea.hook.trim(),format:'reel',...(idea.skills!==undefined?readCommercialIdeaDetails(idea):{})};
 });
}
export function validateDirector(input){
 if(!object(input)||!object(input.setup)||!Array.isArray(input.scenes)||
  input.scenes.length<4||input.scenes.length>8||
  !txt(input.hook,4,180)||!txt(input.editingIntent,5,600)||!txt(input.colorIntent,5,600))
  fail('Model director response missing required fields');
 for(const key of ['location','camera','lighting','sound','wardrobe','arrangement'])
  if(!txt(input.setup[key],5,500))fail('Model failed to provide real shooting setup: '+key);
 let duration=0;const seen=new Set();
 for(const [i,scene] of input.scenes.entries()){
  if(!object(scene)||!Number.isInteger(scene.durationSec)||scene.durationSec<2||scene.durationSec>12||
   !txt(scene.line,2,180)||!txt(scene.action,6,320)||
   !['close-up','medium','detail'].includes(scene.framing)||
   !txt(scene.camera,5,450)||!txt(scene.lighting,5,450)||
   !txt(scene.performance,5,450)||!txt(scene.edit,5,450))
   fail('Model failed to produce concrete shot '+(i+1));
  const normalized=scene.line.trim().toLowerCase().replace(/\s+/g,' ');
  if(seen.has(normalized))fail('Model repeated the same line');seen.add(normalized);
  duration+=scene.durationSec;
 }
 if(duration<15||duration>70)fail('Generated reel duration outside 15–70 sec');
 return input;
}
export async function modelJSON({servers,system,payload,fetchImpl,contextTokens,timeoutMs=120000,maxOutputTokens=3600,thinking}){
 if(contextTokens!==undefined&&(!Number.isInteger(contextTokens)||contextTokens<1024||contextTokens>32768))fail('Invalid local context size');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>600000||!Number.isInteger(maxOutputTokens)||maxOutputTokens<80||maxOutputTokens>6000)fail('Invalid model resource budget');
 const errors=[];
 for(const server of validateModelServers(servers)){
  const token=server.tokenEnv?process.env[server.tokenEnv]:null;
  if(server.tokenEnv&&!token){errors.push(server.id+': required credential missing');continue}
  try{
   const response=await fetchImpl(server.origin+'/api/chat',{
    method:'POST',headers:{'Content-Type':'application/json',
     ...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify({model:server.model,stream:false,format:'json',...(thinking===undefined?{}:{think:thinking}),
     messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}],
     options:{temperature:.75,num_predict:maxOutputTokens,...(contextTokens?{num_ctx:contextTokens}:{})}}),
    signal:AbortSignal.timeout(timeoutMs),
   });
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   const decoded=JSON.parse(data?.message?.content);
   if(!object(decoded))throw Error('Non-object JSON output');
   return {data:decoded,provider:{id:server.id,model:server.model}};
  }catch(error){errors.push(server.id+': '+String(error?.message??error).slice(0,180))}
 }
 fail('All real model servers failed: '+errors.join('; '));
}
export function canonicalBrief(idea,director){
 const d=validateDirector(director);
 if(!object(idea)||!txt(idea.id,1,120)||!txt(idea.title,4,140)||
  !txt(idea.angle,8,650))fail('Cannot bind screenplay to unknown idea');
 const duration=d.scenes.reduce((sum,s)=>sum+s.durationSec,0);
 const platform=instruction=>({aspectRatio:'9:16',durationSec:duration,instruction});
 return {
  version:1,ideaId:idea.id,sourceAngle:idea.angle,sourceTitle:idea.title,sourceFormat:'reel',
  ...(idea.skills?{commercialIntent:readCommercialIdeaDetails(idea)}:{}),
  hook:{firstSeconds:d.hook,visual:d.scenes[0].action,delivery:d.scenes[0].performance},
  script:d.scenes.map((s,i)=>({order:i+1,durationSec:s.durationSec,line:s.line.trim(),action:s.action.trim()})),
  shots:d.scenes.map((s,i)=>({order:i+1,durationSec:s.durationSec,framing:s.framing,
   angle:s.camera,cameraMovement:'Статичный штатив или указанное автором движение по смыслу.',
   lighting:s.lighting,action:s.action})),
  capture:{props:['Смартфон','Штатив'],wardrobe:d.setup.wardrobe,location:d.setup.location,
   lighting:d.setup.lighting,audio:{recording:d.setup.sound,
    processing:'Сохранить натуральность голоса, проверить разборчивость и звук вручную.'}},
  postProduction:{transitions:d.editingIntent,subtitles:{
   instruction:'Сверить с реальными словами, две строки и безопасные поля Reels.',
   maxCharactersPerLine:42},color:d.colorIntent},
  adaptations:{reels:platform('Вертикальный Reels, смысловой хук в начале.'),
   shorts:platform('Вертикальные Shorts с проверкой безопасных полей.'),
   vkClips:platform('Вертикальные VK Клипы с проверкой титров.')},
  factReferences:[],
 };
}
export function createShootSheet(idea,director){
 const d=validateDirector(director),lines=[
  '# '+idea.title,'','Рабочий сценарий от настоящей модели. Автор ещё не утвердил его.',
  '','Место: '+d.setup.location,'Камера: '+d.setup.camera,'Свет: '+d.setup.lighting,
  'Звук: '+d.setup.sound,'Одежда: '+d.setup.wardrobe,
  'Расстановка: '+d.setup.arrangement,'','## Снимай по порядку',
 ];
 for(const [i,s] of d.scenes.entries()){
  lines.push('','### '+(i+1)+' — '+String(s.durationSec)+' сек. — S'+String(i+1).padStart(2,'0')+'_take01.mp4',
   'Реплика: '+s.line,'Действие: '+s.action,'Крупность: '+s.framing,
   'Камера: '+s.camera,'Свет: '+s.lighting,'Игра: '+s.performance,'Монтаж: '+s.edit);
 }
 lines.push('','Запиши комнатный тон, сохрани исходные MOV/MP4 без изменений.',
  'После съёмки выбери настоящие видеофайлы. Дальше Whisper + Ollama + FFmpeg.');
 return lines.join('\n')+'\n';
}
export async function preparePersonaFlow({
 theme,outputDir,servers,style='cinematic',libraryIndexPath,fetchImpl=fetch,
 ideasFromProposal=null,selectedIdeaId=null,ideasProvider=null,sourceProposalSha256=null,
}={}){
 if(!txt(theme,8,700)||!allowedStyles.has(style))fail('Theme (8–700 chars) and valid style are required');
 if(!txt(outputDir,1,1000))fail('Provide a NEW output directory');
 const dir=resolve(outputDir);await absent(dir);
 const first=ideasFromProposal!==null?
  {data:{ideas:ideasFromProposal},provider:ideasProvider}:
  await modelJSON({servers,fetchImpl,system:
  'Ты предлагаешь актёру и композитору три разных оригинальных коротких видео. Никаких шаблонных советов, выдуманных личных фактов и повторяющихся хуков. Отвечай ТОЛЬКО JSON формата {"ideas":[{"title":"...","angle":"...","hook":"..."},...]}.',
  payload:{theme,style,requirements:'one actor; one room; phone + tripod; possible piano; shootable 20–50 sec; character and humor'},
 });
 const ideas=validateIdeas(first.data,ideasFromProposal?.length===1?{count:1}:{});
 if(ideasFromProposal!==null&&(!ideasProvider||typeof ideasProvider.id!=='string'||
  typeof ideasProvider.model!=='string'||!/^[a-f0-9]{64}$/i.test(sourceProposalSha256??'')))
  fail('Invalid saved proposal provenance');
 const idea=ideasFromProposal!==null?ideas.find(x=>x.id===selectedIdeaId):ideas[0];
 if(!idea)fail('Selected idea ID absent from saved candidate list');
 const second=await modelJSON({servers,fetchImpl,system:
  'Ты ИИ-режиссёр, который должен дать конкретные реплики, действия, свет, ракурсы и монтаж для оригинального Reels. Никакого кода, шаблонов и фиктивных биографических фактов. JSON: {"hook":"...","setup":{"location":"...","camera":"...","lighting":"...","sound":"...","wardrobe":"...","arrangement":"..."},"scenes":[{"durationSec":4,"line":"...","action":"...","framing":"close-up","camera":"...","lighting":"...","performance":"...","edit":"..."}],"editingIntent":"...","colorIntent":"..."}. Дай 4–8 сцен суммарно 15–70 секунд. Крупность только close-up, medium, detail.',
  payload:{idea,theme,style,requirements:'Shootable alone on a phone tripod, no generated face edits; varied organic edit rhythm'},
 });
 const director=validateDirector(second.data);
 const brief=canonicalBrief(idea,director);
 const now=new Date().toISOString();
 const meta={version:1,kind:'persona-flow-v1',status:'WAITING_FOR_FOOTAGE',
  generatedAt:now,theme,style,selectedIdeaId:idea.id,
  ideaSelectionMode:ideasFromProposal!==null?'explicit_saved_candidate':'legacy_automatic_first',
  ...(ideasFromProposal!==null?{sourceProposalSha256}:{}),
  providers:{ideas:first.provider,director:second.provider},
  publicationApproved:false,renderedVideo:false};
 const matches=libraryIndexPath?matchBriefToLibrary({brief,
  catalog:JSON.parse(await readFile(resolve(libraryIndexPath),'utf8'))}):null;
 await mkdir(dir,{recursive:false});
 await Promise.all([
  writeFile(join(dir,'IDEAS.json'),JSON.stringify({version:1,ideas,
   selectedIdeaId:idea.id,selectionMode:meta.ideaSelectionMode},null,2)+'\n',{flag:'wx'}),
  writeFile(join(dir,'PRODUCTION-BRIEF.json'),JSON.stringify(brief,null,2)+'\n',{flag:'wx'}),
  writeFile(join(dir,'SHOOT.md'),createShootSheet(idea,director),{flag:'wx'}),
  writeFile(join(dir,'FLOW.json'),JSON.stringify(meta,null,2)+'\n',{flag:'wx'}),
   ...(matches?[
    writeFile(join(dir,'ASSET-MATCHES.json'),JSON.stringify(matches,null,2)+'\n',{flag:'wx'}),
    writeFile(join(dir,'SHOOT-GAPS.md'),shootGapMarkdown(matches),{flag:'wx'}),
   ]:[]),
 ]);
 return {dir,brief:join(dir,'PRODUCTION-BRIEF.json'),shoot:join(dir,'SHOOT.md'),
  status:meta.status,scenes:brief.script.length,provider:meta.providers,
  selectedIdeaId:idea.id,ideaSelectionMode:meta.ideaSelectionMode,
   libraryMatches:matches?{totalShots:matches.totalShots,matchedShots:matches.matchedShots,
    report:join(dir,'SHOOT-GAPS.md')}:null};
}
export async function renderPersonaFlow({
 planDir,takes,outputDir,whisperCli,whisperModel,ollamaModel,variation='cinematic',ffmpegDir,
}={}){
 if(!allowedStyles.has(variation))fail('Invalid creative variation');
 const root=resolve(planDir),meta=JSON.parse(await readFile(join(root,'FLOW.json'),'utf8'));
 if(meta.kind!=='persona-flow-v1'||meta.status!=='WAITING_FOR_FOOTAGE')
  fail('Plan is not ready for a real shoot intake');
 const brief=resolve(root,'PRODUCTION-BRIEF.json');
 const result=await runFirstReel({sources:takes,brief,outputDir,whisperCli,whisperModel,
  aiEditorModel:ollamaModel,aiVariation:variation,ffmpegDir,mode:'strict'});
 if(result.status!=='awaiting-author-review'||!result.aiFinishedVideo)
  fail('No verified AI-produced MP4; review Recovery instead');
 return {...result,status:'AWAITING_AUTHOR_REVIEW'};
}
export async function packagePersonaFlow({resultPath,outputDir,caption=''}={}){
 if(!txt(resultPath,1,1000)||!txt(outputDir,1,1000))fail('Result and NEW output dir required');
 const resultFile=resolve(resultPath),result=JSON.parse(await readFile(resultFile,'utf8'));
 if(result?.status!=='awaiting-author-review'||result?.distributionAllowed!==false||
  !txt(result.aiFinishedVideo,1,1000)||!txt(result.aiFinishedQaPath,1,1000))
  fail('Cannot package a missing, failed or apparently published result');
 const video=await realpath(result.aiFinishedVideo),qaPath=await realpath(result.aiFinishedQaPath);
 // Defense against a supplied result redirecting to an unrelated file or previous run.
 const originalRoot=dirname(resultFile);
 const inside=path=>{const rel=relative(originalRoot,path);
  return rel===''||rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)};
 if(!inside(video)||!inside(qaPath))fail('Video/QA must belong to the exact result directory');
 const qa=JSON.parse(await readFile(qaPath,'utf8'));validateDraftQa(qa,video);
 const actualSha=await sha256(video);
 if(actualSha.toLowerCase()!==qa.evidence.sha256.toLowerCase())
  fail('Real MP4 differs from verified QA hash');
 if(typeof caption!=='string'||caption.length>2200)fail('Invalid social caption');
 const out=resolve(outputDir);await absent(out);await mkdir(out,{recursive:false});
 const destination=join(out,'persona-reel.mp4');
 await copyFile(video,destination);
 if(await sha256(destination)!==actualSha)fail('Destination file hash differs from source');
 const manifest={version:1,kind:'persona-delivery-draft-v1',status:'AWAITING_AUTHOR_REVIEW',
  sourceResult:resultFile,video:'persona-reel.mp4',sha256:actualSha,
  caption:'caption.txt',publicationApproved:false,platformUploadPerformed:false,
  note:'Real MP4 copied and QA verified. This is NOT a social network upload. Human review and an authenticated platform connection required.'};
 await Promise.all([
  writeFile(join(out,'DELIVERY.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'}),
  writeFile(join(out,'caption.txt'),caption+'\n',{flag:'wx'}),
 ]);
 return {directory:out,video:destination,sha256:actualSha,status:manifest.status};
}
const usage=[
 'Usage:',
 '  npm run persona:flow -- prepare "<THEME>" "<NEW_DIR>" "<SERVERS.json>" [cinematic|humor|intimate|unexpected] [CATALOG_INDEX.json]',
 '  npm run persona:flow -- render "<PLAN_DIR>" "<TAKES_DIR>" "<NEW_RENDER_DIR>" "<WHISPER_CLI>" "<WHISPER_MODEL>" "<OLLAMA_MODEL>" [variation] [ffmpeg-bin]',
 '  npm run persona:flow -- package "<RESULT.json>" "<NEW_PACKAGE_DIR>" [caption text]',
].join('\n');
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [cmd,...args]=process.argv.slice(2);
 try{
  let result;
  if(cmd==='prepare'){
   const [theme,outputDir,config,style,libraryIndexPath]=args;
   const servers=JSON.parse(await readFile(resolve(config),'utf8')).servers;
   result=await preparePersonaFlow({theme,outputDir,servers,style:style??'cinematic',libraryIndexPath});
  }else if(cmd==='render'){
   const [planDir,takes,outputDir,whisperCli,whisperModel,ollamaModel,variation,ffmpegDir]=args;
   result=await renderPersonaFlow({planDir,takes,outputDir,whisperCli,whisperModel,ollamaModel,
    variation:variation??'cinematic',ffmpegDir});
  }else if(cmd==='package'){
   const [resultPath,outputDir,caption]=args;
   result=await packagePersonaFlow({resultPath,outputDir,caption});
  }else fail(usage);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(e){process.stderr.write(String(e?.message??e)+'\n'+usage+'\n');process.exitCode=1}
}
