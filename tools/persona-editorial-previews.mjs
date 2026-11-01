#!/usr/bin/env node
/** Local candidate previews and offline review UI. Never uploads, publishes, or edits originals. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,extname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const fail=msg=>{throw Error(msg)};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeJson=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex')}
async function ffmpeg(args){
 const bin=process.env.PERSONA_FFMPEG||'ffmpeg';
 await new Promise((ok,bad)=>{
  const p=spawn(bin,args,{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
  let err='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;p.kill();bad(Error('Preview encode timeout'))}},180000);
  p.stderr.on('data',b=>{err=(err+b).slice(-3000)});
  p.on('error',e=>{if(!done){done=true;clearTimeout(timer);bad(e)}});
  p.on('close',code=>{if(!done){done=true;clearTimeout(timer);code===0?ok():bad(Error('Preview encode failed: '+err))}});
 });
}
export function verifyPreviewPack(pack,evidence){
 if(pack?.kind!=='persona-editorial-candidate-pack-v1'||!Array.isArray(pack.beats)||!pack.beats.length||
    evidence?.kind!=='persona-evidence-v1'||!Array.isArray(evidence.sources))fail('Invalid candidate pack or evidence');
 const byId=new Map(evidence.sources.map(x=>[x.id,x]));
 if(byId.size!==evidence.sources.length)fail('Duplicate source IDs');
 const seenIds=new Set();
 for(const [idx,beat] of pack.beats.entries()){
  if(beat?.beat!==idx+1||!Array.isArray(beat.candidates)||beat.candidates.length>3)
   fail('Invalid candidate scene');
  for(const c of beat.candidates){
   const src=byId.get(c.sourceId);
   if(c.beat!==idx+1||!src||typeof src.path!=='string'||
      !/^[a-f0-9]{64}$/i.test(src.sha256??'')||
      c.sourceSha256!==src.sha256||
      typeof c.candidateId!=='string'||seenIds.has(c.candidateId)||
      !finite(c.startSec)||!finite(c.durationSec)||!finite(src.durationSec)||
      c.startSec<0||c.durationSec<0.25||c.startSec+c.durationSec>src.durationSec+0.02||
      !Number.isFinite(c.confidence)||c.confidence<0.65)
    fail('Candidate does not match trusted source evidence');
   seenIds.add(c.candidateId);
  }
  if(beat.candidates.length===0){
   const recovery=beat.recovery;
   if(recovery?.status!=='needs-transcript-review'||!Array.isArray(recovery.availableSources))
    fail('Missing recovery information for unmatched scene');
   for(const item of recovery.availableSources){
    const src=byId.get(item?.sourceId);
    if(!src||item.sourceSha256!==src.sha256||!finite(item.durationSec)||item.durationSec!==src.durationSec||
       item.hasAudio!==true||src.hasAudio!==true)fail('Recovery source does not match trusted source evidence');
   }
  }
 }
 return true;
}
export function buildReviewHtml(pack,template,files){
 if(pack?.kind!=='persona-editorial-candidate-pack-v1'||
  template?.kind!=='persona-editorial-selection-v1'||!Array.isArray(template.selections)||
  template.selections.length!==pack.beats.length)fail('Invalid offline review input');
 const candidateFiles=files?.candidates??files,recoveryFiles=files?.recovery??{};
 const sections=pack.beats.map(beat=>{
  const options=beat.candidates.length?beat.candidates.map((take,i)=>{
   const key=take.candidateId,video=candidateFiles[key];
   if(typeof video!=='string'||!/^[a-z0-9-]+\.mp4$/i.test(video))fail('Missing generated candidate preview');
   return '<label class="take"><span class="flag">Вариант '+(i+1)+'</span><video controls playsinline preload="metadata" src="'+esc(video)+'"></video>'+
    '<span class="pick"><input type="radio" name="beat'+beat.beat+'" value="'+esc(key)+'"> Выбрать этот дубль</span>'+
    '<small>'+esc(take.sourceId)+' · '+take.startSec.toFixed(2)+'–'+(take.startSec+take.durationSec).toFixed(2)+' с</small>'+
    '<small>Whisper: '+esc(take.transcript)+'</small>'+
    '<small class="warning">'+esc((take.technicalWarnings??[]).join('; ')||'Нет базовых технических предупреждений')+'</small></label>';
  }).join(''):'';
  const recovery=beat.candidates.length===0?beat.recovery:null;
  const recoveryOptions=recovery?.availableSources?.map(source=>{
   const video=recoveryFiles[source.sourceId];
   if(typeof video!=='string'||!/^[a-z0-9_-]+\.mp4$/i.test(video))fail('Missing generated recovery preview');
   return '<article class="take recovery"><strong>Recovery Review · '+esc(source.sourceId)+'</strong><video controls playsinline preload="metadata" src="'+esc(video)+'"></video>'+
    '<small>Whisper: '+esc(source.asrStatus==='empty'?'речь не распознана':'нет пригодного совпадения')+'. Этот прокси только для просмотра; исходник не изменяется.</small>'+
    '<label><input type="radio" name="recovery'+beat.beat+'" value="'+esc(source.sourceId)+'"> Выбрать этот исходник для ручной разметки</label></article>';
  }).join('')??'';
  const recoveryForm=recovery?'<div class="recovery-form">'+(recovery.availableSources.length?'':'<p>Нет исходников с пригодной аудиодорожкой — требуется пересъёмка этой сцены.</p>')+'<p><strong>Recovery Review.</strong> Укажи только после просмотра: начало, длительность и услышанный текст. Это не подменяет исходный Whisper и будет помечено как ручная разметка.</p>'+recoveryOptions+
   '<label>Начало фразы, с <input id="recoveryStart'+beat.beat+'" type="number" min="0" step="0.01"></label><label>Длительность, с <input id="recoveryDuration'+beat.beat+'" type="number" min="0.25" step="0.01"></label>'+
   '<label>Текст услышанной фразы <textarea id="recoveryText'+beat.beat+'" rows="2"></textarea></label></div>':'';
  return '<section class="scene"><h2>Сцена '+beat.beat+' — '+esc(beat.scriptLine)+'</h2><div class="clips">'+options+
   recoveryForm+'</div><label class="reason">Почему выбран дубль? <textarea id="reason'+beat.beat+'" rows="2" placeholder="Например: естественная пауза, хороший взгляд"></textarea></label></section>';
 }).join('');
 const base={version:1,kind:'persona-editorial-selection-v1',status:'unreviewed',
  selections:pack.beats.map(b=>({beat:b.beat,candidateId:null,reviewed:false,reason:'',rejected:[],recovery:null})),
  recoverySources:Object.fromEntries(pack.beats.map(b=>[b.beat,b.recovery?.availableSources??[]]))};
 const script='const template=JSON.parse(document.getElementById("data").textContent);'+
  'document.getElementById("save").addEventListener("click",()=>{'+
  'const result=JSON.parse(JSON.stringify(template));'+
  'for(const item of result.selections){'+
  'const pick=document.querySelector("input[name=beat"+item.beat+"]:checked"),recoveryPick=document.querySelector("input[name=recovery"+item.beat+"]:checked");'+
  'const reason=document.getElementById("reason"+item.beat).value.trim();'+
  'if((!pick&&!recoveryPick)||reason.length<3){alert("Для каждой сцены нужно посмотреть видео, выбрать дубль или Recovery Review и объяснить выбор.");return;}'+
  'if(recoveryPick){const start=Number(document.getElementById("recoveryStart"+item.beat).value),duration=Number(document.getElementById("recoveryDuration"+item.beat).value),transcript=document.getElementById("recoveryText"+item.beat).value.trim(),source=template.recoverySources[item.beat].find(x=>x.sourceId===recoveryPick.value);'+
  'if(!source||!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<.25||transcript.length<3){alert("Для ручной разметки нужны источник, границы и текст фразы.");return;}if(start+duration>source.durationSec){alert("Границы фразы выходят за доступную длительность исходника.");return;}'+
  'item.candidateId=null;item.recovery={kind:"persona-manual-segment-v1",transcriptSource:"manual-review",sourceId:source.sourceId,sourceSha256:source.sourceSha256,startSec:start,durationSec:duration,transcript,confirmed:true,reason};'+
  '}else item.candidateId=pick.value;item.reason=reason;item.reviewed=true;}'+
  'result.status="human-reviewed-not-published";'+
  'const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+"\\n"],{type:"application/json"}));'+
  'const link=document.createElement("a");link.href=url;link.download="selection.reviewed.json";link.click();'+
  'setTimeout(()=>URL.revokeObjectURL(url),1000);'+
  '});';
 return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<title>Persona · Выбор дублей</title><style>'+
  'body{font:16px/1.5 system-ui,sans-serif;background:#12161d;color:#eee;margin:0;padding:24px;max-width:1100px;margin:auto}'+
  'h1{font-size:28px}.lead{color:#b5c0cb}.scene{padding:16px 0 24px;border-top:1px solid #333}'+
  '.clips{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:15px}.take{background:#202630;border:1px solid #424a56;border-radius:12px;padding:12px;display:grid;gap:7px}.recovery-form{border:1px dashed #8c7960;border-radius:12px;padding:12px;display:grid;gap:10px}.recovery-form>label{display:grid;gap:5px;font-weight:600}.recovery-form input[type=number]{font:inherit;color:#eee;background:#202630;border:1px solid #687485;border-radius:7px;padding:8px;min-height:40px;box-sizing:border-box}.recovery-form textarea{box-sizing:border-box;width:100%;min-height:64px}'+
  'video{width:100%;max-height:360px;background:black;border-radius:6px}small{display:block;color:#bbc6d1;overflow-wrap:anywhere}.warning{color:#e6c99d}'+
  '.pick{font-weight:600}.reason{display:grid;gap:6px;margin-top:12px}textarea{font:inherit;color:#eee;background:#202630;border:1px solid #687485;border-radius:7px;padding:10px}'+
  'button{font:inherit;background:#e8eee6;color:#171e22;border:0;border-radius:10px;padding:12px 20px;cursor:pointer}'+
  '.foot{padding:20px 0;border-top:1px solid #333;color:#c1c8ce}</style></head><body>'+
  '<h1>Persona · режиссёрский выбор дублей</h1>'+
  '<p class="lead">Сравни видео и звук. Рейтинг Whisper не измеряет харизму, эмоцию, взгляд или юмор. Файлы обрабатываются локально; никакой публикации.</p>'+
  sections+
  '<div class="foot"><button id="save" type="button">Сохранить мой выбор в JSON</button>'+
  '<p>Файл selection.reviewed.json затем передаётся в команду editorial apply. Публикация не разрешена автоматически.</p></div>'+
  '<script type="application/json" id="data">'+escapeJson(base)+'</script><script>'+script+'</script></body></html>';
}
export async function generatePreviews({packPath,evidencePath,outputDir}={}){
 if(![packPath,evidencePath,outputDir].every(x=>typeof x==='string'&&x.trim()))fail('Provide candidate pack, evidence and fresh output directory');
 const [pack,evidence]=await Promise.all([readFile(resolve(packPath),'utf8').then(JSON.parse),readFile(resolve(evidencePath),'utf8').then(JSON.parse)]);
 verifyPreviewPack(pack,evidence);
 const byId=new Map(evidence.sources.map(x=>[x.id,x])),root=resolve(outputDir);
 const paths=new Map(),verifiedSourcePaths=new Map();
 for(const beat of pack.beats)for(const take of beat.candidates){
  const src=byId.get(take.sourceId);
  let p=verifiedSourcePaths.get(take.sourceId);
  if(!p){
   p=await realpath(src.path);
   if(!['.mp4','.mov','.mkv','.webm','.m4v'].includes(extname(p).toLowerCase()))fail('Unsupported source video extension');
   const st=await stat(p);
   if(!st.isFile()||!st.size||st.size>2*1024**3||(await hash(p))!==src.sha256)
    fail('Source changed after intake; refuse to create misleading previews');
   verifiedSourcePaths.set(take.sourceId,p);
  }
  paths.set(take.candidateId,p);
 }
 await mkdir(root,{recursive:false});
 const files={},recoveryFiles={},items=[];
 try{
  for(const beat of pack.beats)for(const [index,take] of beat.candidates.entries()){
   const name='beat-'+String(beat.beat).padStart(2,'0')+'-candidate-'+String(index+1).padStart(2,'0')+'.mp4';
   const p=paths.get(take.candidateId);
   await ffmpeg(['-hide_banner','-nostdin','-loglevel','error','-ss',String(take.startSec),'-i',p,
    '-t',String(take.durationSec),'-vf','scale=540:960:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1',
    '-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-movflags','+faststart',join(root,name)]);
   files[take.candidateId]=name;
   items.push({beat:beat.beat,candidateId:take.candidateId,sourceId:take.sourceId,preview:name});
  }
  for(const beat of pack.beats.filter(x=>x.candidates.length===0))for(const item of beat.recovery.availableSources){
   if(recoveryFiles[item.sourceId])continue;
   const src=byId.get(item.sourceId),p=await realpath(src.path),name='source-'+item.sourceId+'-inspection.mp4';
   if((await hash(p))!==src.sha256)fail('Source changed after intake; refuse to create misleading recovery preview');
   await ffmpeg(['-hide_banner','-nostdin','-loglevel','error','-i',p,'-t',String(Math.min(src.durationSec,180)),
    '-vf','scale=540:960:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1',
    '-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',join(root,name)]);
   recoveryFiles[item.sourceId]=name;
  }
  const template={version:1,kind:'persona-editorial-selection-v1',selections:pack.beats.map(b=>({beat:b.beat}))};
  await writeFile(join(root,'review.html'),buildReviewHtml(pack,template,{candidates:files,recovery:recoveryFiles}),{flag:'wx'});
  await writeFile(join(root,'previews.json'),JSON.stringify({version:1,kind:'persona-editorial-previews-v1',items,
   originalSourcesUntouched:true,publicationApproved:false,notice:'Offline previews only. Re-encode may change preview compression but not source videos.'},null,2)+'\n',{flag:'wx'});
  return {reviewHtml:join(root,'review.html'),previewCount:items.length,recoveryPreviewCount:Object.keys(recoveryFiles).length,missingBeats:pack.beats.filter(b=>b.candidates.length===0).map(b=>b.beat)};
 }catch(error){
  await writeFile(join(root,'FAILED.json'),JSON.stringify({status:'failed',error:String(error.message||error),note:'Original videos are untouched.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [packPath,evidencePath,outputDir]=process.argv.slice(2);
 generatePreviews({packPath,evidencePath,outputDir}).then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(e=>{console.error('Persona offline previews:',e.message);process.exitCode=1});
}
