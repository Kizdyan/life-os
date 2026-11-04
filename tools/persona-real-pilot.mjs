#!/usr/bin/env node
/**
 * Persona 7-scene Windows real-media pilot, NOT a synthetic creative approval.
 *
 * start: originals -> Whisper/FFmpeg -> draft OR recovery -> playable local review.
 * resume: independent reviewed selection -> new FFmpeg MP4 -> independent video QA.
 *
 * Never writes into sources, reuses an output directory, uploads data or publishes.
 */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runFirstReel} from './persona-first-reel-runner.mjs';
import {prepareReviewKit} from './persona-review-kit.mjs';
import {renderReviewedReel} from './persona-reviewed-render.mjs';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';

const home=dirname(fileURLToPath(import.meta.url));
const defaultBrief=resolve(home,'../docs/persona-first-reel-production-brief-2026-10-29.json');
const videoExt=/\.(?:mp4|mov|mkv|webm|m4v)$/i;
const fail=message=>{throw Error('Persona real pilot: '+message)};
const json=async path=>JSON.parse(await readFile(resolve(path),'utf8'));
const exists=async path=>Boolean(await stat(path).catch(()=>null));
const safePath=p=>typeof p==='string'&&p.trim()?resolve(p):fail('Missing required path');
const within=(parent,child)=>{
 const rel=relative(parent,child);
 return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));
};
async function digest(path){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return hash.digest('hex');
}
function requireUnpublished(result){
 if(result?.publicationApproved===true||result?.distributionAllowed===true)
  fail('Public release flag is forbidden in the real pilot');
}
async function sourceFiles(input){
 const path=safePath(input),info=await stat(path);
 let selected=[];
 if(info.isDirectory()){
  const entries=await readdir(path,{withFileTypes:true});
  const videos=entries.filter(item=>videoExt.test(item.name));
  // The existing named-takes intake supports up to 42 recordings (7 scenes
  // plus alternatives), but sends only 7 unreviewed defaults into the <=12
  // source engine. Hash ALL 42 originals, never lose their provenance.
  if(videos.length<2||videos.length>42||videos.some(v=>!v.isFile()))
   fail('Select 2-42 regular, explicitly named source videos; no symlinked footage');
  selected=videos.map(v=>join(path,v.name));
 }else if(info.isFile()&&videoExt.test(path))selected=[path];
 else if(info.isFile()&&extname(path).toLowerCase()==='.json'){
  const data=await json(path);
  if(data?.version!==1||!Array.isArray(data.sources)||!data.sources.length||data.sources.length>12)
   fail('Expected a v1 source manifest with 1-12 entries');
  selected=data.sources.map(s=>{
   if(typeof s?.path!=='string'||!s.path.trim())fail('Manifest source path is missing');
   return isAbsolute(s.path)?resolve(s.path):resolve(dirname(path),s.path);
  });
 }else fail('Source must be an explicit video, a selected folder, or sources.json');
 const unique=new Set(),files=[];
 for(const name of selected){
  if(!videoExt.test(name))fail('Manifest references a non-video source');
  const canonical=await realpath(name);
  const info=await stat(canonical);
  if(!info.isFile()||info.size<1024)fail('Source video missing or too small: '+basename(name));
  const key=process.platform==='win32'?canonical.toLowerCase():canonical;
  if(unique.has(key))fail('Duplicate original source video');
  unique.add(key);files.push(canonical);
 }
 return files.sort();
}
async function fingerprint(sources,brief){
 const files=await sourceFiles(sources);
 const input=resolve(sources);
 const includes=[...files,resolve(brief)];
 if(extname(input).toLowerCase()==='.json')includes.push(input);
 const result=[];
 for(const path of [...new Set(includes)].sort()){
  const details=await stat(path);
  if(!details.isFile())fail('Missing regular file: '+path);
  result.push({path,bytes:details.size,sha256:await digest(path)});
 }
 return result;
}
export function assertOriginalsUnchanged(before,after){
 if(!Array.isArray(before)||JSON.stringify(before)!==JSON.stringify(after))
  fail('Original video or Production Brief changed; stop before any review/approval');
 return true;
}
function verifyNewDestination(output,protectedDirs=[]){
 const dest=safePath(output);
 for(const path of protectedDirs){
  if(within(resolve(path),dest))
   fail('Output must be outside originals, previous draft, and other protected directories');
 }
 return dest;
}
async function assertSevenSceneBrief(path){
 const brief=await json(path);
 if(brief?.version!==1||brief.sourceFormat!=='reel'||brief.script?.length!==7||
    brief.shots?.length!==7||brief.script.some((s,i)=>s?.order!==i+1)||
    brief.shots.some((s,i)=>s?.order!==i+1))
  fail('This pilot requires the exact seven-scene Persona Reel production brief');
 // Guard against a silently substituted shorter B04 approved script.
 const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replaceAll('ё','е')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 if(normalize(brief.script[6].line)!==normalize('Это колыбельная? Это финал триллера.'))
  fail('The final approved scene must say the FULL line: Это колыбельная? Это финал триллера.');
 return brief;
}
function startReport({sources,brief,output,status,originals,reviewHtml,qaPath,video,alternateTakes=[]}){
 return {version:1,kind:'persona-seven-scene-real-pilot-v1',status,
  provenance:'LOCAL_USER_MEDIA_NOT_SYNTHETIC',sources,brief,output,originals,
  reviewHtml:reviewHtml??null,video:video??null,qaPath:qaPath??null,
  alternateTakes,allRecordedTakesCompared:alternateTakes.length===0,
  publicationApproved:false,distributionAllowed:false,
  note:'Ready only for manual selection. No claims of verified speech, acting, skin tone, audio mix or publication.'};
}
export async function startRealPilot({sources,outputDir,whisperCli,whisperModel,ffmpegDir,briefPath=defaultBrief,
 runDraft=runFirstReel,createReview=prepareReviewKit}={}){
 const input=safePath(sources),brief=safePath(briefPath),output=safePath(outputDir);
 const sourceInfo=await stat(input);
 const sourceParent=sourceInfo.isDirectory()?[await realpath(input)]:[];
 // Explicit manifests and single MOV inputs do not otherwise get the runner's
 // folder-level protection. Never create an output inside ANY source directory.
 const sourceParents=[...new Set((await sourceFiles(input)).map(path=>dirname(path)))];
 verifyNewDestination(output,[...sourceParent,...sourceParents]);
 if(within(output,input)||within(output,brief))fail('Pilot output cannot contain input sources or brief');
 if(await exists(output))fail('Pilot output already exists. Choose a NEW directory');
 await assertSevenSceneBrief(brief);
 const before=await fingerprint(input,brief);
 let result=null,kit=null,processingError=null;
 try{
  result=await runDraft({sources:input,brief,outputDir:output,whisperCli,whisperModel,
   ffmpegDir,mode:'strict'});
  requireUnpublished(result);
  if(result?.status==='awaiting-author-review'&&typeof result.output==='string'){
   kit=await createReview({draftDir:output});
  }else if(result?.status!=='needs-manual-transcript-review')
   fail('Unexpected draft status; do not claim a successful real MP4');
 }catch(error){processingError=error}
 // Provenance is checked even if a backend step fails or needs Recovery Review.
 const after=await fingerprint(input,brief);
 assertOriginalsUnchanged(before,after);
 if(processingError)throw processingError;
 const recovered=result.status==='needs-manual-transcript-review';
 const reviewHtml=recovered?result.reviewHtml:kit?.playableReviewPage;
 if(typeof reviewHtml!=='string'||!await exists(reviewHtml))
  fail('Local review page missing; no approval possible');
 // The pre-existing 7-scene folder intake chooses the lowest take number
 // for each beat, but DOES NOT pass all 42 recordings through ASR.
 // Surface the unused alternates explicitly; never imply the system evaluated
 // their acting, framing, or suitability.
 let alternateTakes=[];
 const reportPath=sourceInfo.isDirectory()?join(output,'intake','intake-report.json'):null;
 // The ASR recovery object does not carry sourceSelection metadata, so read
 // the local source intake report even when Whisper forced a recovery stop.
 if(reportPath&&await exists(reportPath)){
  const intake=await json(reportPath);
  if(Array.isArray(intake.alternateTakes))
   alternateTakes=intake.alternateTakes.map(x=>({id:x.id,file:x.file}));
 }
 const report=startReport({sources:input,brief,output,originals:before,alternateTakes,
  status:recovered?'NEEDS_MANUAL_ASR_REVIEW':'NEEDS_HUMAN_TAKE_REVIEW',
  reviewHtml,video:recovered?null:result.output,qaPath:recovered?null:result.qaPath});
 await writeFile(join(output,'PILOT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 await writeFile(join(output,'PILOT.md'),[
  '# Persona · real seven-scene pilot','',
  '**Статус:** '+report.status+'. **Публикация запрещена.**','',
  '- Исходники: '+input,
  '- Бриф: '+brief,
  '- Проверены SHA-256 исходников до и после обработки; неизменность: PASS.',
  '- Страница для просмотра и прослушивания: '+reviewHtml,
  '- MP4: '+(report.video??'НЕ СОЗДАН: требуется ручной Recovery Review'),
  '- Техническая проверка: '+(report.qaPath??'только после реального монтажа'),
  '- Не рассмотренные альтернативные дубли: '+report.alternateTakes.length,
  ...(report.alternateTakes.length?[
   'ВАЖНО: альтернативные дубли НЕ были автоматически проанализированы и НЕ участвовали в выборе.',
   'Для сравнения пересобери входной sources.json (до 12 файлов) и создай НОВЫЙ пилот;',
   'не считай самый первый дубль лучшим по игре.']:[]),'',
  'Прослушать ВСЕ семь реплик. Финал должен быть дословным: «Это колыбельная? Это финал триллера.»',
  'Проверить B03: речь, паузу и вступление собственной музыки.',
  'В браузере сохранить selection.reviewed.json только после просмотра каждого дубля.',
  'Затем выполнить команду persona:pilot resume с НОВЫМ каталогом результата.',
  'Факт сохранения JSON НЕ является проверкой качества и не разрешает публикацию.',''
 ].join('\n'),{flag:'wx'});
 return report;
}
export async function resumeRealPilot({draftDir,selectionPath,outputDir,ffmpegDir,
 renderReviewed=renderReviewedReel,analyzeQuality=analyzePersonaVideoQuality}={}){
 const draft=safePath(draftDir),selection=safePath(selectionPath),output=safePath(outputDir);
 verifyNewDestination(output,[draft]);
 if(await exists(output))fail('Reviewed output already exists; originals and drafts are immutable');
 const previous=await json(join(draft,'PILOT.json'));
 if(previous?.kind!=='persona-seven-scene-real-pilot-v1'||
  !['NEEDS_MANUAL_ASR_REVIEW','NEEDS_HUMAN_TAKE_REVIEW'].includes(previous.status)||
  previous.publicationApproved!==false||previous.distributionAllowed!==false||
  previous.output!==draft||!Array.isArray(previous.originals))
  fail('Missing or unsafe, mismatched real-media PILOT.json');
 const brief=await assertSevenSceneBrief(previous.brief);
 const sourceParents=[...new Set((await sourceFiles(previous.sources)).map(path=>dirname(path)))];
 verifyNewDestination(output,sourceParents);
 assertOriginalsUnchanged(previous.originals,await fingerprint(previous.sources,previous.brief));
 let reviewed=null,quality=null,processingError=null;
 try{
  reviewed=await renderReviewed({draftDir:draft,selectionPath:selection,outputDir:output,ffmpegDir});
  requireUnpublished(reviewed);
  if(reviewed?.kind!=='persona-reviewed-reel-v1'||reviewed.status!=='awaiting-author-review'||
   reviewed.publicationApproved!==false||reviewed.distributionAllowed!==false||
   resolve(reviewed.output||'')!==join(output,'reviewed-reel.mp4'))
   fail('Reviewed renderer did not return a locally verified unpublished MP4');
  const qualityPath=join(output,'VIDEO-QUALITY.json');
  quality=await analyzeQuality({videoPath:reviewed.output,
   subtitlePath:reviewed.subtitleDraft?.srtPath,
   expectedDurationSec:brief.script.reduce((n,s)=>n+(Number(s.durationSec)||0),0),
   outputPath:qualityPath,ffmpegDir});
  if(quality?.status!=='awaiting-author-review'||quality.publicationApproved!==false||
    quality.distributionAllowed!==false||!Array.isArray(quality.findings))
   fail('Independent technical video quality report missing or unsafe');
  if(quality.video?.sha256!==await digest(reviewed.output))
   fail('Independent QA fingerprint does not match rendered MP4');
 }catch(error){processingError=error}
 assertOriginalsUnchanged(previous.originals,await fingerprint(previous.sources,previous.brief));
 if(processingError)throw processingError;
 const warnings=quality.findings.filter(x=>x.status==='warning'||x.status==='not_measured'||
  x.status==='needs_human_review');
 const final={version:1,kind:'persona-seven-scene-reviewed-pilot-v1',
  status:'NEEDS_FULL_HUMAN_CREATIVE_REVIEW',publicationApproved:false,
  distributionAllowed:false,realMediaProvenance:previous.provenance,
  originalInputHashesVerified:true,draftDir:draft,selectionPath:selection,
  output:reviewed.output,outputSha256:quality.video.sha256,
  technicalQaPath:reviewed.qaPath,qualityReportPath:join(output,'VIDEO-QUALITY.json'),
  subtitles:reviewed.subtitleDraft?.srtPath??null,
  creativeReview:reviewed.creativeReviewTemplate??null,
  warnings: warnings.map(x=>({id:x.id,status:x.status,summary:x.detail??x.summary??x.description??null})),
  noArtisticApproval:'Must inspect 7/7 actual speech, pace, acting, color, glasses, audio, subtitles, B03 music and full final B04.'};
 await writeFile(join(output,'PILOT-REVIEWED.json'),JSON.stringify(final,null,2)+'\n',{flag:'wx'});
 await writeFile(join(output,'PILOT-REVIEWED.md'),[
  '# Persona · реально смонтированный пилот','',
  '**Статус: ПОЛНЫЙ АВТОРСКИЙ ПРОСМОТР ОБЯЗАТЕЛЕН — публикация запрещена.**','',
  '- Видео: '+final.output,
  '- SHA-256: '+final.outputSha256,
  '- FFmpeg QA: '+final.technicalQaPath,
  '- Независимые измерения цвета/яркости/звука: '+final.qualityReportPath,
  '- Черновик субтитров: '+(final.subtitles??'нет'),
  '- Творческий чек-лист: '+(final.creativeReview??'нет'),
  '- Технические предупреждения/неизмеренные пункты: '+warnings.length,'',
  'Просмотреть целиком: 7 реплик, мимику, цвет лица и белой футболки, очки, кадрирование, звук.',
  'Проверить B03 музыку и точный B04: «Это колыбельная? Это финал триллера.»',
  'Сверить субтитры с тем, что реально произнесено. Проверить безопасную зону Instagram.',
  'Никакой загрузки, публикации, автоматического художественного утверждения.',''
 ].join('\n'),{flag:'wx'});
 return final;
}
function cli(){
 const [mode,a,b,c,d,e]=process.argv.slice(2);
 if(mode==='start'&&a&&b&&c&&d)
  return startRealPilot({sources:a,outputDir:b,whisperCli:c,whisperModel:d,ffmpegDir:e});
 if(mode==='resume'&&a&&b&&c)
  return resumeRealPilot({draftDir:a,selectionPath:b,outputDir:c,ffmpegDir:d});
 fail('Usage: start <source-folder|sources.json|video.mov> <NEW_DRAFT_DIR> <whisper-cli.exe> <multilingual-ggml-model> [ffmpeg-bin-dir] | resume <DRAFT_DIR> <selection.reviewed.json> <NEW_REVIEWED_DIR> [ffmpeg-bin-dir]');
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))
 cli().then(x=>{console.log(JSON.stringify(x,null,2));if(x.status==='NEEDS_MANUAL_ASR_REVIEW')process.exitCode=2})
 .catch(error=>{console.error(error.message);process.exitCode=1});
