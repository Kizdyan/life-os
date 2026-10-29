#!/usr/bin/env node
/**
 * From a technically verified reviewed Reel + explicit local visual choices,
 * render NEW portrait MP4 and technical QA. Never overwrites originals,
 * retouches skin or authorizes publication.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyVisualReview} from './persona-visual-review.mjs';
import {writeSubtitleDraft} from './persona-subtitle-draft.mjs';
import {validateDraftQa} from './persona-first-reel-runner.mjs';

const home=dirname(fileURLToPath(import.meta.url));
const fail=m=>{throw Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
async function sha256(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex')}
function command(bin,args,ffmpegDir){
 return new Promise((ok,bad)=>{
  const env={...process.env},key=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
  if(ffmpegDir)env[key]=resolve(ffmpegDir)+(process.platform==='win32'?';':':')+(env[key]||'');
  const p=spawn(bin,args,{shell:false,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  let stderr='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;p.kill();bad(Error('Render/QA timed out: '+basename(bin)))}},20*60*1000);
  p.stderr.on('data',b=>{stderr=(stderr+b).slice(-10000)});
  p.stdout.on('data',()=>{});
  p.on('error',e=>{if(!done){done=true;clearTimeout(timer);bad(e)}});
  p.on('close',code=>{if(done)return;done=true;clearTimeout(timer);code===0?ok():bad(Error('Render/QA exited '+code+': '+stderr.slice(-2000)))});
 });
}
export async function preflightVisualFinalize({reviewedDir,packPath,selectionPath,outputDir}={}){
 if(![reviewedDir,packPath,selectionPath,outputDir].every(x=>typeof x==='string'&&x.trim()))
  fail('Required: reviewed directory, visual pack, author visual selection, NEW output directory');
 const reviewed=resolve(reviewedDir),output=resolve(outputDir);
 if(reviewed===output)fail('Never overwrite reviewed MP4');
 const result=await readJson(join(reviewed,'REVIEWED-RESULT.json'));
 if(result?.kind!=='persona-reviewed-reel-v1'||result.status!=='awaiting-author-review'||
    result.publicationApproved!==false||result.distributionAllowed!==false||
    resolve(result.output||'')!==join(reviewed,'reviewed-reel.mp4')||
    resolve(result.qaPath||'')!==join(reviewed,'reviewed-qa.json')||
    resolve(result.timelinePath||'')!==join(reviewed,'reviewed-timeline.json')||
    typeof result.decisionsPath!=='string')
  fail('Expected unpublished technically reviewed MP4 and immutable timeline references');
 const qa=await readJson(result.qaPath);
 validateDraftQa(qa,result.output);
 if(await sha256(result.output)!==qa.evidence.sha256)fail('Reviewed MP4 changed since last QA');
 const pack=await readJson(resolve(packPath));
 if(pack?.timelinePath!==resolve(result.timelinePath)||pack.publicationApproved!==false)
  fail('Visual pack is not from this exact reviewed timeline');
 const selection=await readJson(resolve(selectionPath));
 if(selection?.kind!=='persona-visual-framing-selection-v1'||selection.publicationApproved!==false||
    selection.approved!==undefined||selection.authorApproved!==undefined)
  fail('Missing explicit human visual review');
 return {reviewed,output,result,pack,selection};
}
export async function finalizeVisualReel({reviewedDir,packPath,selectionPath,outputDir,ffmpegDir,
 rendererPath=join(home,'persona-timeline-render.mjs'),
 verifierPath=join(home,'persona-verify-render.mjs')}={}){
 const p=await preflightVisualFinalize({reviewedDir,packPath,selectionPath,outputDir});
 if(ffmpegDir)await stat(resolve(ffmpegDir));
 await mkdir(p.output,{recursive:false});
 const steps=[];
 try{
  const timeline=join(p.output,'framed-timeline.json');
  await applyVisualReview({timelinePath:p.result.timelinePath,packPath,selectionPath,outputPath:timeline});
  steps.push('reviewed-crop-validated-against-hashes');
  const decisions=await readJson(p.result.decisionsPath);
  const captions=await writeSubtitleDraft({briefPath:decisions.briefPath,timelinePath:timeline,
    decisionsPath:p.result.decisionsPath,outputDir:p.output});
  steps.push('subtitles-retimed-for-validated-visual-timeline');
  const mp4=join(p.output,'framed-reel.mp4');
  await command(process.execPath,[resolve(rendererPath),timeline,mp4],ffmpegDir);
  steps.push('framed-video-rendered-by-existing-ffmpeg');
  const qaPath=join(p.output,'framed-qa.json');
  await command(process.execPath,[resolve(verifierPath),mp4,'persona-first-reel-framed','reel',qaPath],ffmpegDir);
  const qa=await readJson(qaPath);validateDraftQa(qa,mp4);
  steps.push('real-technical-qa-passed');
  const originalCreative=await readJson(join(p.reviewed,'creative-review.json'));
  if(originalCreative?.kind!=='persona-creative-review-v1'||!Array.isArray(originalCreative.scenes))
   fail('Missing existing creative QA template');
  // Fresh artistic review is mandatory after changing a frame. Do not carry forward approvals.
  const fresh=structuredClone(originalCreative);
  fresh.status='unreviewed';fresh.publicationApproved=false;
  for(const scene of fresh.scenes){
   for(const key of Object.keys(scene.checks??{}))scene.checks[key]=null;
   scene.remarks='';scene.issues=[];
  }
  fresh.notice='Framing was modified. Watch the entire NEW MP4. This file contains no publication approval.';
  const creativePath=join(p.output,'creative-review.json');
  await writeFile(creativePath,JSON.stringify(fresh,null,2)+'\n',{flag:'wx'});
  const visualPath=join(p.output,'visual-decisions.json');
  await writeFile(visualPath,JSON.stringify(p.selection,null,2)+'\n',{flag:'wx'});
  const output={version:1,kind:'persona-visual-final-v1',status:'awaiting-author-review',
   publicationApproved:false,distributionAllowed:false,previousReel:p.result.output,
   output:mp4,qaPath,timelinePath:timeline,visualDecisions:visualPath,
   captionDraft:captions,creativeReview:creativePath,
   brightnessWarnings:p.pack.scenes.flatMap(scene=>scene.warnings.map(w=>({beat:scene.beat,warning:w}))),
   continuityWarnings:p.pack.continuityWarnings??[],
   steps,note:'Framing author-reviewed; visual performance, skin tone, motion, captions and full MP4 still need human inspection.'};
  await writeFile(join(p.output,'VISUAL-RESULT.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  const md=[
   '# Persona · новая версия с ручным кадрированием','','**Не опубликовано. Требуется авторская приёмка.**','',
   '- Видео: '+output.output,'- Технический QA: '+qaPath,
   '- Субтитры: '+captions.srtPath,'- Новый Creative QA: '+creativePath,
   '- Настройки кадрирования: '+visualPath,'',
   'Проверь лицо, очки, кожу, руки, клавиши, место субтитров, цвет между сценами и музыкальные окончания.',
   'Технический QA не подтверждает художественный результат.',''
  ].join('\n');
  await writeFile(join(p.output,'VISUAL-RESULT.md'),md,{flag:'wx'});
  return output;
 }catch(error){
  await writeFile(join(p.output,'FAILED.json'),JSON.stringify({status:'failed',steps,
   error:String(error.message||error),note:'Original sources and previous MP4 remain unchanged.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [reviewedDir,packPath,selectionPath,outputDir,ffmpegDir]=process.argv.slice(2);
 finalizeVisualReel({reviewedDir,packPath,selectionPath,outputDir,ffmpegDir})
 .then(x=>console.log(JSON.stringify(x,null,2)))
 .catch(e=>{console.error('Persona visual finalize:',e.message);process.exitCode=1});
}
