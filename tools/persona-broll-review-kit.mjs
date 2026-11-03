#!/usr/bin/env node
/**
 * Persona offline B-roll review: SHA-checked local clips -> real FFmpeg previews ->
 * browser author decision download -> existing verified B-roll renderer.
 * No remote services, automatic approval, changes to originals, or publication.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,lstat,mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {basename,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createBrollReviewTemplate} from './persona-approved-broll.mjs';

const fail=m=>{throw Error('Persona B-roll review: '+m)};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const ext=new Set(['.mp4','.mov','.mkv','.webm','.m4v']);
const inside=(root,file)=>{
 const r=relative(root,file);
 return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r));
};
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
})[c]);
const safeJson=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')
 .replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
async function hash(path){
 const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex');
}
const json=async path=>JSON.parse(await readFile(resolve(path),'utf8'));
async function ffmpeg(args){
 await new Promise((ok,bad)=>{
  const p=spawn(process.env.PERSONA_FFMPEG||'ffmpeg',args,{
   shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
  let err='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;p.kill();bad(Error('Preview FFmpeg timeout'))}},90000);
  p.stderr.on('data',data=>{err=(err+data).slice(-3000)});
  p.on('error',e=>{if(!done){done=true;clearTimeout(timer);bad(e)}});
  p.on('close',code=>{if(done)return;done=true;clearTimeout(timer);
   code===0?ok():bad(Error('FFmpeg failed: '+err))});
 });
}
const browserScript="\nconst data=JSON.parse(document.getElementById('persona-data').textContent);\ndocument.getElementById('save').addEventListener('click',()=>{\n const author=document.getElementById('author').value.trim();\n if(author.length<2){alert('Введи имя или подпись автора.');return;}\n if(!document.getElementById('approve-edit').checked){\n  alert('Подтверди разрешение на ЛОКАЛЬНЫЙ монтаж. Это не разрешение на публикацию.');return;\n }\n const choices=[];\n for(const scene of data.scenes){\n  const picked=document.querySelector('input[name=\"beat-'+scene.beat+'\"]:checked');\n  if(!picked){alert('Выбери или пропусти сцену '+scene.beat);return;}\n  if(picked.value==='skip')continue;\n  const c=scene.candidates.find(item=>item.id===picked.value);\n  const watched=document.getElementById('watched-'+scene.beat).checked;\n  const rights=document.getElementById('rights-'+scene.beat).checked;\n  const reason=document.getElementById('reason-'+scene.beat).value.trim();\n  if(!c||!watched||!rights||reason.length<10){\n   alert('Сцена '+scene.beat+': смотри видео, подтверди права и объясни выбор (10+ символов).');\n   return;\n  }\n  choices.push({afterBeat:scene.beat,assetId:c.assetId,\n   startSec:c.startSec,durationSec:c.durationSec,\n   authorReviewed:true,rightsConfirmed:true,editorialReason:reason,\n   framing:{mode:'contain'}});\n }\n if(!choices.length){alert('Ни один архивный кадр не выбран — монтаж не требуется.');return;}\n if(choices.length>Math.min(10,30-data.timelineClipCount)){\n  alert('Слишком много вставок для одной версии.');return;\n }\n const result={...data.template,author,reviewedAt:new Date().toISOString(),\n  approvedForEdit:true,publicationApproved:false,choices};\n const blob=new Blob([JSON.stringify(result,null,2)+'\\n'],{type:'application/json'});\n const url=URL.createObjectURL(blob),link=document.createElement('a');\n link.href=url;link.download='broll-selection.reviewed.json';link.click();\n setTimeout(()=>URL.revokeObjectURL(url),1000);\n});\n";
export function buildBrollReviewHtml(template,scenes,timelineClipCount){
 if(template?.kind!=='persona-broll-author-selection-v1'||
  template.approvedForEdit!==false||template.publicationApproved!==false||
  !Array.isArray(scenes)||!scenes.length||!Number.isInteger(timelineClipCount))
  fail('Safe unapproved template and review scenes required');
 const payload={template,timelineClipCount,scenes:scenes.map(scene=>({
  beat:scene.beat,candidates:scene.candidates.map(c=>({
   id:c.id,assetId:c.assetId,startSec:c.startSec,durationSec:c.durationSec,
  })),
 }))};
 const cards=scenes.map(scene=>{
  const picks=scene.candidates.map(c=>'<article class="take">'+
   '<label><input type="radio" name="beat-'+scene.beat+'" value="'+escapeHtml(c.id)+
   '"> Использовать этот кадр</label>'+
   '<video controls playsinline preload="metadata" src="'+escapeHtml(c.preview)+'"></video>'+
   '<small>'+escapeHtml(c.name)+' · '+c.startSec.toFixed(2)+'–'+
   (c.startSec+c.durationSec).toFixed(2)+' с</small>'+
   '<small>Источник описания: '+escapeHtml(c.evidence)+
   ' · слова: '+escapeHtml((c.matchedTerms||[]).join(', '))+'</small></article>').join('');
  return '<section><h2>После реплики '+scene.beat+'</h2>'+
   '<label class="skip"><input type="radio" name="beat-'+scene.beat+
   '" value="skip" checked> Не использовать архивный кадр</label>'+
   '<div class="clips">'+picks+'</div>'+
   '<div class="checks"><label><input type="checkbox" id="watched-'+scene.beat+
   '"> Я просмотрел(а) выбранный фрагмент</label>'+
   '<label><input type="checkbox" id="rights-'+scene.beat+
   '"> Я подтверждаю права на использование этого материала</label>'+
   '<label>Зачем эта вставка?<textarea id="reason-'+scene.beat+
   '" rows="2" placeholder="Например: этот кадр усиливает ощущение ожидания"></textarea></label>'+
   '</div></section>';
 }).join('');
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width, initial-scale=1">'+
 '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; media-src &#39;self&#39; blob:; style-src &#39;unsafe-inline&#39;; script-src &#39;unsafe-inline&#39;; connect-src &#39;none&#39;; object-src &#39;none&#39;; form-action &#39;none&#39;">'+
 '<title>Persona · Выбор B-roll</title>'+
 '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px;background:#121820;color:#edf3f7}'+
 'h1{font-size:28px}.muted,small{color:#bdc7d2}small{display:block;overflow-wrap:anywhere}'+
 'section{padding:20px 0;border-top:1px solid #3e4d5c}h2{font-size:20px}'+
 '.clips{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}'+
 '.take{background:#202a36;border:1px solid #4a5d6d;border-radius:12px;padding:12px;display:grid;gap:7px}'+
 'video{width:100%;max-height:360px;background:black;border-radius:8px}.checks{display:grid;gap:14px;margin-top:16px}'+
 '.skip{display:block;margin-bottom:16px}textarea,input[type=text]{font:inherit;color:#eee;background:#24323e;border:1px solid #8796a7;border-radius:8px;padding:10px;box-sizing:border-box;width:100%}'+
 'button{font:inherit;padding:13px 20px;border:0;border-radius:10px;background:#e6f3e9;color:#163326;cursor:pointer}'+
 '.final{display:grid;gap:16px;border-top:1px solid #4a5d6d;padding:22px 0}</style></head><body>'+
 '<h1>Persona · просмотр архивных кадров</h1>'+
 '<p class="muted">Посмотри реальные локальные видео, подтверди пригодность и права. Решение разрешает только новый монтаж, но не публикацию.</p>'+
 cards+'<div class="final"><label>Автор решения<input type="text" id="author" maxlength="100"></label>'+
 '<label><input type="checkbox" id="approve-edit"> Я разрешаю выбранные вставки ТОЛЬКО для локального монтажа, не для публикации.</label>'+
 '<button type="button" id="save">Скачать моё решение для монтажа</button>'+
 '<small>Скачанный файл broll-selection.reviewed.json передаётся в persona:broll render. Исходники не изменяются.</small></div>'+
 '<script type="application/json" id="persona-data">'+safeJson(payload)+'</script>'+
 '<script>'+browserScript+'</script></body></html>';
}
function candidateWindow(c,asset){
 if(!c||c.assetId!==asset.id||c.sourcePath!==asset.sourcePath||
  c.sha256!==asset.sha256||
  !['author_annotation','local_vision_model','filename'].includes(c.evidence))
  fail('Candidate does not belong to indexed source');
 const start=finite(c.startSec)?c.startSec:0;
 const end=finite(c.endSec)?c.endSec:asset.metadata?.durationSec;
 if(!finite(start)||!finite(end)||!finite(asset.metadata?.durationSec)||
  start<0||end<=start||end>asset.metadata.durationSec+.02)fail('Invalid candidate bounds');
 const duration=Number(Math.min(1.2,1.9,end-start).toFixed(3));
 if(duration<.25)fail('Candidate time window too short');
 return {startSec:start,durationSec:duration};
}
export async function prepareBrollReviewKit({
 timelinePath,matchesPath,catalogPath,captionsPath,outputDir,
}={}){
 if(![timelinePath,matchesPath,catalogPath,captionsPath,outputDir].every(
  x=>typeof x==='string'&&x.trim()))fail('Four JSON inputs and a NEW review directory required');
 const out=resolve(outputDir);
 await access(out).then(()=>fail('Output already exists'),e=>{
  if(e?.code!=='ENOENT')throw e;
 });
 const [timeline,matches,catalog]=await Promise.all(
  [timelinePath,matchesPath,catalogPath].map(json));
 if(!Array.isArray(timeline.clips)||timeline.clips.length<2||timeline.clips.length>29||
  matches?.kind!=='persona-brief-local-asset-matches-v1'||!Array.isArray(matches.shots)||
  matches.shots.length!==timeline.clips.length||
  catalog?.kind!=='persona-local-library-v1'||!Array.isArray(catalog.assets)||
  typeof catalog.root!=='string'||!catalog.root.trim()||
  matches.librarySnapshotAt!==catalog.generatedAt)fail('Invalid or stale inputs');
 const root=await realpath(resolve(catalog.root));
 if(inside(root,out))fail('Review directory cannot be inside source originals');
 const assets=new Map(catalog.assets.filter(x=>x.kind==='video'&&x.availability==='local')
  .map(x=>[x.id,x]));
 const scenes=[],verified=new Map();
 for(const shot of matches.shots){
  if(!Number.isInteger(shot?.order)||shot.order<1||shot.order>timeline.clips.length)
   fail('Invalid shot order');
  const choices=[];
  for(const [i,c] of (shot.candidates??[]).slice(0,4).entries()){
   const asset=assets.get(c.assetId);if(!asset)continue;
   if(typeof asset.sourcePath!=='string'||!isAbsolute(asset.sourcePath)||
    !/^[a-f0-9]{64}$/i.test(asset.sha256??'')||asset.id!=='sha256:'+asset.sha256||
    !Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>2*1024**3||
    !ext.has(extname(asset.sourcePath).toLowerCase()))fail('Invalid original file');
   const {startSec,durationSec}=candidateWindow(c,asset);
   const resolved=await realpath(asset.sourcePath),link=await lstat(asset.sourcePath),info=await stat(resolved);
   if(!inside(root,resolved)||resolved===root||link.isSymbolicLink()||!link.isFile()||
    !info.isFile()||info.size!==asset.bytes)fail('Original moved, changed, or escaped root');
   if(!verified.has(resolved))verified.set(resolved,await hash(resolved));
   if(verified.get(resolved)!==asset.sha256)fail('Original SHA changed since indexing');
   choices.push({id:'b'+shot.order+'-'+i,assetId:asset.id,source:resolved,
    startSec,durationSec,name:basename(resolved),
    evidence:c.evidence,matchedTerms:Array.isArray(c.matchedTerms)?c.matchedTerms:[],
    preview:'beat-'+String(shot.order).padStart(2,'0')+'-candidate-'+String(i+1).padStart(2,'0')+'.mp4'});
  }
  if(choices.length)scenes.push({beat:shot.order,candidates:choices});
 }
 if(!scenes.length)fail('No valid local video B-roll candidates');
 await mkdir(out,{recursive:false});
 try{
  const selectionTemplate=join(out,'selection.template.json');
  await createBrollReviewTemplate({timelinePath,matchesPath,catalogPath,captionsPath,
   outputPath:selectionTemplate});
  const template=await json(selectionTemplate);
  for(const scene of scenes)for(const c of scene.candidates){
   const preview=join(out,c.preview);
   await ffmpeg(['-hide_banner','-nostdin','-loglevel','error','-n',
    '-ss',String(c.startSec),'-i',c.source,'-t',String(c.durationSec),
    '-map','0:v:0','-map','0:a:0?',
    '-vf','scale=540:960:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1',
    '-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','96k','-movflags','+faststart',preview]);
   if((await stat(preview)).size<100)fail('Preview missing or empty');
  }
  const reviewHtml=join(out,'review.html');
  await writeFile(reviewHtml,buildBrollReviewHtml(template,scenes,timeline.clips.length),{flag:'wx'});
  const status={version:1,kind:'persona-broll-offline-review-v1',
   status:'AWAITING_AUTHOR_BROLL_SELECTION',reviewHtml,selectionTemplate,
   scenes:scenes.length,previewCount:scenes.reduce((sum,s)=>sum+s.candidates.length,0),
   originalMediaUnchanged:true,publicationApproved:false,
   note:'Only manual browser download creates edit approval. No publishing or automatic media use.'};
  await writeFile(join(out,'REVIEW-KIT.json'),JSON.stringify(status,null,2)+'\n',{flag:'wx'});
  return status;
 }catch(e){
  await writeFile(join(out,'FAILED.json'),JSON.stringify({
   status:'failed',reason:String(e?.message??e),publicationApproved:false},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw e;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [timelinePath,matchesPath,catalogPath,captionsPath,outputDir]=process.argv.slice(2);
 prepareBrollReviewKit({timelinePath,matchesPath,catalogPath,captionsPath,outputDir})
  .then(x=>process.stdout.write(JSON.stringify(x,null,2)+'\n'))
  .catch(e=>{process.stderr.write(String(e?.message??e)+'\n');process.exitCode=1});
}
