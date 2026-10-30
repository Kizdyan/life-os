#!/usr/bin/env node
/**
 * One command after offline human take selection:
 * reviewed selection -> independent decisions -> FFmpeg MP4 -> timed SRT/VTT ->
 * real technical QA -> human creative review form.
 *
 * Never modifies the original draft, sources, approved decisions, or main.
 * No network/AI requests, publication or paid services.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {apply} from './persona-editorial-choices.mjs';
import {assemble} from './persona-semantic-montage.mjs';
import {writeSubtitleDraft} from './persona-subtitle-draft.mjs';
import {initReview} from './persona-creative-review.mjs';
import {validateDraftQa} from './persona-first-reel-runner.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const profileDefault=resolve(here,'../docs/persona-creative-profile-v1.json');
const fail=m=>{throw Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
async function digest(p){
 const h=createHash('sha256');
 for await(const chunk of createReadStream(p))h.update(chunk);
 return h.digest('hex');
}
function command(bin,args,binDir){
 return new Promise((ok,bad)=>{
  const key=Object.keys(process.env).find(x=>x.toLowerCase()==='path')||'PATH';
  const env={...process.env};
  if(binDir)env[key]=resolve(binDir)+(process.platform==='win32'?';':':')+(env[key]||'');
  const child=spawn(bin,args,{shell:false,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;child.kill();bad(Error('Process timeout: '+basename(bin)))}},20*60*1000);
  child.stdout.on('data',part=>{stdout=(stdout+part).slice(-10000)});
  child.stderr.on('data',part=>{stderr=(stderr+part).slice(-5000)});
  child.on('error',err=>{if(!done){done=true;clearTimeout(timer);bad(err)}});
  child.on('close',code=>{
   if(done)return;
   done=true;clearTimeout(timer);
   code===0?ok(stdout):bad(Error('Process failed ('+code+'): '+stderr));
  });
 });
}
export async function preflightReviewedRender({draftDir,selectionPath,outputDir,profilePath=profileDefault}={}){
 if(![draftDir,selectionPath,outputDir,profilePath].every(x=>typeof x==='string'&&x.trim()))
  fail('Require draft directory, reviewed selection JSON, NEW output directory, and profile');
 const draft=resolve(draftDir),output=resolve(outputDir),selection=resolve(selectionPath);
 if(draft===output)fail('Reviewed output must be separate from original draft');
 let mode='draft';
 const result=await readJson(join(draft,'RESULT.json')).catch(error=>{
  if(error?.code==='ENOENT')return null;
  throw error;
 });
 if(result!==null){
  if(result.status!=='awaiting-author-review'||result.distributionAllowed!==false||
     resolve(result.output||'')!==join(draft,'draft-reel.mp4')||
     resolve(result.qaPath||'')!==join(draft,'qa.json'))
   fail('Original draft is not an independently reviewable, unpublished Persona export');
  const qa=await readJson(join(draft,'qa.json'));
  validateDraftQa(qa,join(draft,'draft-reel.mp4'));
  if((await digest(join(draft,'draft-reel.mp4')))!==qa.evidence.sha256)
   fail('Original draft changed since the trusted technical QA report');
 }else{
  mode='recovery';
  const recovery=await readJson(join(draft,'RECOVERY-RESULT.json'));
  if(recovery?.kind!=='persona-asr-recovery-v1'||
     recovery.status!=='needs-manual-transcript-review'||
     recovery.distributionAllowed!==false||recovery.publicationApproved!==false||
     resolve(recovery.decisionsPath||'')!==join(draft,'decisions.json')||
     resolve(recovery.analysisPath||'')!==join(draft,'evidence','analysis.json')||
     resolve(recovery.reviewKit||'')!==join(draft,'editorial-review-kit'))
   fail('Missing or unsafe offline ASR recovery manifest');
  const original=await readJson(join(draft,'decisions.json'));
  if(original?.recoveryRequired!==true||original.mode!=='preview'||
     resolve(original.analysisPath||'')!==resolve(recovery.analysisPath)||
     resolve(original.briefPath||'')!==resolve(recovery.briefPath))
   fail('Missing or mismatched evidence for ASR recovery');
 }
 const kit=join(draft,'editorial-review-kit');
 const kitResult=await readJson(join(kit,'KIT.json'));
 if(kitResult?.kind!=='persona-review-kit-v1'||kitResult.publicationApproved!==false||
    kitResult.status!=='ready-for-human-selection'||
    (mode==='recovery'&&kitResult.recovery!==true))
  fail('Missing or unsafe editorial review kit');
 const packPath=join(kit,'candidate-pack.json');
 const pack=await readJson(packPath);
 if(pack?.kind!=='persona-editorial-candidate-pack-v1'||resolve(pack.decisionsPath)!==join(draft,'decisions.json'))
  fail('Candidate pack does not belong to this draft');
 const human=await readJson(selection);
 if(human?.kind!=='persona-editorial-selection-v1'||!Array.isArray(human.selections))
  fail('Expected reviewed browser selection JSON');
 if(human.selections.some(item=>item?.reviewed!==true))
  fail('Every scene must have an explicitly reviewed take');
 await stat(resolve(profilePath));
 return {draft,output,selection,kit,packPath,profilePath:resolve(profilePath),mode,
  decisionsPath:join(draft,'decisions.json')};
}
export function formatReviewedResult(report){
 if(report?.kind!=='persona-reviewed-reel-v1'||report.publicationApproved!==false||
   typeof report.output!=='string'||typeof report.qaPath!=='string')
  fail('Invalid reviewed output status');
 return [
  '# Persona · повторный монтаж выбранных дублей','',
  '**Статус:** технический черновик готов к личному просмотру. **Публикация не разрешена.**','',
  '- Первый черновик: '+(report.originalDraft??'не создан, исходный ASR не прошёл'),
  '- Новая версия: '+report.output,
  '- Проверка MP4: '+report.qaPath,
  '- Новые субтитры: '+report.subtitleDraft.srtPath,
  '- Предупреждения и таймкоды: '+report.subtitleDraft.reviewPath,
  '- Ручной контроль качества: '+report.creativeReviewTemplate,
  '- Причины выбора дублей: '+report.memoryPath,'',
  '## Что делать дальше','',
  '1. Посмотреть **весь новый MP4** и сравнить с исходным черновиком.',
  '2. Проверить взгляд, естественность пауз, цвет кожи, блики на очках и клавиши.',
  '3. Проверить синхронизацию SRT, естественный голос, границу музыки и панчлайн.',
  '4. Заполнить creative-review.json (true / false / null и конкретные замечания).',
  '5. Отдельно утвердить конечную версию — этот файл и технический QA не дают разрешение на публикацию.',''
 ].join('\n');
}
export async function renderReviewedReel({draftDir,selectionPath,outputDir,ffmpegDir,profilePath=profileDefault,
 rendererPath=join(here,'persona-timeline-render.mjs'),verifierPath=join(here,'persona-verify-render.mjs')}={}){
 const p=await preflightReviewedRender({draftDir,selectionPath,outputDir,profilePath});
 if(ffmpegDir)await stat(resolve(ffmpegDir));
 // All existing work is left untouched. New output folder must not exist.
 await mkdir(p.output,{recursive:false});
 const stage=[];
 try{
  const decisionsPath=join(p.output,'reviewed-decisions.json');
  const memoryPath=join(p.output,'decision-memory.json');
  await apply({packPath:p.packPath,selectionPath:p.selection,decisionsPath:p.decisionsPath,
   outputPath:decisionsPath,memoryPath});
  stage.push('explicit-human-choice-verified');
  const assembled=await assemble(decisionsPath,join(p.output,'reviewed-timeline.json'));
  stage.push('hash-verified-timeline-created');
  const chosen=await readJson(decisionsPath);
  const captions=await writeSubtitleDraft({briefPath:chosen.briefPath,timelinePath:assembled.project,
   decisionsPath,outputDir:p.output});
  stage.push('reviewable-captions-written');
  const mp4=join(p.output,'reviewed-reel.mp4');
  await command(process.execPath,[resolve(rendererPath),assembled.project,mp4],ffmpegDir);
  stage.push('real-ffmpeg-render-complete');
  const qaPath=join(p.output,'reviewed-qa.json');
  await command(process.execPath,[resolve(verifierPath),mp4,'persona-first-reel-reviewed','reel',qaPath],ffmpegDir);
  const qa=await readJson(qaPath);
  validateDraftQa(qa,mp4);
  stage.push('technical-qa-passed-author-approval-still-blocked');
  const creative=await initReview(p.packPath,p.profilePath,join(p.output,'creative-review.json'),p.selection);
  const report={version:1,kind:'persona-reviewed-reel-v1',
   status:'awaiting-author-review',publicationApproved:false,distributionAllowed:false,
   originalDraft:p.mode==='recovery'?null:join(p.draft,'draft-reel.mp4'),
   recoveredFromAsr:p.mode==='recovery',
   output:mp4,qaPath,decisionsPath,memoryPath,
   timelinePath:assembled.project,subtitleDraft:captions,creativeReviewTemplate:creative.reviewPath,
   steps:stage,caveat:'Selected clips were human-chosen; Creative QA still requires viewing the final MP4. No publication approval.'};
  await writeFile(join(p.output,'REVIEWED-RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await writeFile(join(p.output,'REVIEWED-RESULT.md'),formatReviewedResult(report),{flag:'wx'});
  return report;
 }catch(err){
  await writeFile(join(p.output,'FAILED.json'),JSON.stringify({version:1,status:'failed',
   steps:stage,error:String(err.message||err),
   note:'Original draft and source videos remain unchanged. Partial outputs retained for manual inspection.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw err;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [draftDir,selectionPath,outputDir,ffmpegDir]=process.argv.slice(2);
 renderReviewedReel({draftDir,selectionPath,outputDir,ffmpegDir})
 .then(x=>console.log(JSON.stringify(x,null,2)))
 .catch(e=>{console.error('Persona reviewed render:',e.message);process.exitCode=1});
}
