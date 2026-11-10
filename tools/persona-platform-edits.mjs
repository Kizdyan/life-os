/** Four local editorial exports, using the existing ASR candidates and renderer. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';import {createReadStream,constants as fsConstants} from 'node:fs';
import {readFile,writeFile,mkdir,rename,access,stat,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {chooseAiEditorialCuts} from './persona-ai-editorial.mjs';
import {assemble} from './persona-semantic-montage.mjs';
import {writeSubtitleDraft} from './persona-subtitle-draft.mjs';
import {renderVisualPreset,inspectVisualInput} from './persona-color-variants.mjs';
import {burnPersonaSubtitles} from './persona-subtitle-burn.mjs';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';
import {validateDraftQa} from './persona-first-reel-runner.mjs';
const home=dirname(fileURLToPath(import.meta.url));
export const platformProfiles=Object.freeze([
 {id:'shorts',label:'TikTok / Shorts',min:0,max:30,variation:'humor',preset:'Dynamic'},
 {id:'reels',label:'Instagram Reels',min:30,max:45,variation:'cinematic',preset:'Commercial'},
 {id:'vk',label:'VK Видео',min:40,max:60,variation:'intimate',preset:'Cinematic'},
 {id:'youtube',label:'YouTube · режиссёрская версия',min:0,max:600,variation:'cinematic',preset:'Commercial'},
]);
export function assessPlatformTimeline(clips,profile){
 if(!platformProfiles.some(p=>p.id===profile.id)||!Array.isArray(clips)||!clips.length||clips.some(c=>!Number.isFinite(c.durationSec)||c.durationSec<=0||!Number.isFinite(c.startSec)||c.startSec<0))throw Error('Invalid platform timeline');
 const durationSec=Number(clips.reduce((n,c)=>n+c.durationSec,0).toFixed(3));
 return {durationSec,renderAllowed:durationSec<=profile.max,warnings:[...(durationSec<profile.min?['Недостаточно подтверждённого контекста для '+profile.min+' с; материал не растянут и не повторён.']:[]),...(durationSec>profile.max?['Полные реплики превышают лимит '+profile.max+' с. Требуется отдельное авторское сокращение.']:[])]};
}
export function safeCaptionPosition(regions=[]){
 if(!Array.isArray(regions)||regions.length>100)throw Error('Invalid protected regions');
 for(const r of regions)if(r?.authorReviewed!==true||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1||r.y+r.height>1)throw Error('Protected regions require valid author-reviewed coordinates');
 const position=[.66,.38,.5].find(y=>regions.every(r=>r.x+r.width<.1||r.x>.9||r.y+r.height<y-.08||r.y>y+.08));
 if(position===undefined)throw Error('No safe subtitle position outside protected regions; author framing review required');
 return position;
}
export function assertReviewedLayoutCurrent(original,current){
 const signature=t=>JSON.stringify(t.clips.map(c=>[c.beat,c.path,c.startSec,c.durationSec]));
 if((original.overlays?.length||original.protectedRegions?.length)&&signature(original)!==signature(current))throw Error('Author-reviewed overlays/face regions belong to another cut layout; review their placement again');
}
async function sha(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex')}
async function json(path){return JSON.parse(await readFile(path,'utf8'))}
function run(bin,args,ffmpegDir){const env={...process.env},key=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';if(ffmpegDir)env[key]=resolve(ffmpegDir)+(process.platform==='win32'?';':':')+(env[key]??'');return new Promise((ok,no)=>{const c=spawn(bin,args,{env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let err='';const timer=setTimeout(()=>{c.kill();no(Error('Platform media task timed out'))},20*60*1000);c.stdout.resume();c.stderr.on('data',b=>err=(err+b).slice(-6000));c.once('error',e=>{clearTimeout(timer);no(e)});c.once('close',code=>{clearTimeout(timer);code===0?ok():no(Error('Platform render failed: '+err))})})}
/** Brief video-only dissolve from the previous real frame; audio/timing stay intact. */
export async function renderSoftTransitions({videoPath,outputPath,clips,ffmpegDir}){
 if(!Array.isArray(clips)||clips.length<2||clips.length>30||clips.some(c=>!Number.isFinite(c.durationSec)||c.durationSec<.25))throw Error('Invalid soft transition timeline');
 const duration=clips.reduce((n,c)=>n+c.durationSec,0),boundaries=[];let cursor=0;
 for(const clip of clips.slice(0,-1)){cursor+=clip.durationSec;boundaries.push(cursor)}
 const filters=['[0:v]split='+clips.length+'[base]'+boundaries.map((_,i)=>'[s'+i+']').join('')];let base='base';
 boundaries.forEach((t,i)=>{
  filters.push('[s'+i+']trim=start='+Math.max(0,t-1/30-.0001)+':end='+t+',setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.15,trim=duration=0.15,format=yuva420p,fade=t=out:st=0:d=0.12:alpha=1,setpts=PTS+'+t+'/TB[f'+i+']');
  filters.push('['+base+'][f'+i+']overlay=eof_action=pass:enable=\'gte(t,'+t+')*lt(t,'+(t+.15)+')\'[v'+i+']');base='v'+i;
 });
 await run(ffmpegDir?join(ffmpegDir,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'):'ffmpeg',['-v','error','-n','-i',videoPath,'-filter_complex',filters.join(';'),'-map','['+base+']','-map','0:a?','-t',String(duration),'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','copy',outputPath]);
 return outputPath;
}
/** Full-frame B-roll over original voice, followed by color and captions. */
export async function renderBrollLayer({videoPath,outputPath,overlays=[],durationSec,ffmpegDir}){
 if(!Array.isArray(overlays)||overlays.length>8||!overlays.length)throw Error('Provide 1–8 approved B-roll overlays');
 await inspectVisualInput(videoPath,ffmpegDir);
 const args=['-v','error','-n','-i',videoPath],filters=[];let base='0:v';
 for(const [index,o] of overlays.entries()){
  if(o.authorReviewed!==true||typeof o.path!=='string'||!Number.isFinite(o.startSec)||o.startSec<0||!Number.isFinite(o.durationSec)||o.durationSec<=0||!Number.isFinite(o.timelineStartSec)||o.timelineStartSec<0||o.timelineStartSec+o.durationSec>durationSec||!/^[a-f0-9]{64}$/.test(o.sha256??''))throw Error('Invalid author-reviewed B-roll interval');
  if(await sha(o.path)!==o.sha256)throw Error('B-roll SHA mismatch');
  const media=await inspectVisualInput(o.path,ffmpegDir);if(!Number.isFinite(Number(media.duration))||o.startSec+o.durationSec>Number(media.duration)+.01)throw Error('B-roll interval exceeds its source');
  args.push('-ss',String(o.startSec),'-t',String(o.durationSec),'-i',o.path);
  filters.push(`[${index+1}:v]setpts=PTS-STARTPTS+${o.timelineStartSec}/TB,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[b${index}]`);
  filters.push(`[${base}][b${index}]overlay=0:0:eof_action=pass:enable='gte(t,${o.timelineStartSec})*lt(t,${o.timelineStartSec+o.durationSec})'[v${index}]`);base='v'+index;
 }
 await run(ffmpegDir?join(ffmpegDir,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'):'ffmpeg',[...args,'-filter_complex',filters.join(';'),'-map','['+base+']','-map','0:a?','-t',String(durationSec),'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','copy',outputPath]);
 for(const o of overlays)if(await sha(o.path)!==o.sha256)throw Error('B-roll source changed during rendering');
 return outputPath;
}
export async function renderPlatformEdits({resultPath,outputDir,model,ffmpegDir}={}){
 const result=await json(resolve(resultPath));
 if(result.status!=='awaiting-author-review'||result.distributionAllowed!==false||!result.aiEditorial||typeof result.decisions!=='string')throw Error('Verified unpublished AI result required');
 const qa=await json(result.qaPath);validateDraftQa(qa,result.output);if(await sha(result.output)!==qa.evidence.sha256)throw Error('Source draft no longer matches QA');
 const decisions=await json(result.decisions),briefPath=resolve(dirname(result.decisions),decisions.briefPath),brief=await json(briefPath);
 if(createHash('sha256').update(JSON.stringify(brief)).digest('hex')!==result.briefFingerprintSha256)throw Error('Approved brief changed since source rendering');
 const out=resolve(outputDir);await access(out).then(()=>{throw Error('Export directory already exists')},e=>{if(e.code!=='ENOENT')throw e});await mkdir(out);
 const progress=async value=>{const temp=join(out,'progress.tmp');await writeFile(temp,JSON.stringify(value));await rename(temp,join(out,'EXPORT-PROGRESS.json'))};
 const exports=[];
 try{
  await run(process.execPath,[join(home,'persona-audio-cuts.mjs'),result.output,join(out,'AUDIO-ACCENTS.json')],ffmpegDir);
  for(const profile of platformProfiles){
   const dir=join(out,profile.id);await mkdir(dir);await progress({platform:profile.id,stage:'qwen_candidate_selection',completed:exports.length,total:4});
   const selected=brief.manualSource?decisions:await chooseAiEditorialCuts({decisions,brief,model,variation:profile.variation,platform:profile.id});
   const selectedPath=join(dir,'decisions.json');await writeFile(selectedPath,JSON.stringify(selected,null,2),{flag:'wx'});
   const assembled=await assemble(selectedPath,join(dir,'timeline.json')),timeline=await json(assembled.project),assessment=assessPlatformTimeline(timeline.clips,profile);
   if(!assessment.renderAllowed){exports.push({platform:profile.id,status:'needs-author-edit',...assessment});continue}
   const captions=await writeSubtitleDraft({briefPath,timelinePath:assembled.project,decisionsPath:selectedPath,outputDir:dir});
   await progress({platform:profile.id,stage:'ffmpeg_timeline',completed:exports.length,total:4});
   const base=join(dir,'base.mp4');await run(process.execPath,[join(home,'persona-timeline-render.mjs'),assembled.project,base],ffmpegDir);
   const originalTimeline=await json(result.renderProject),overlays=originalTimeline.overlays??[];
   assertReviewedLayoutCurrent(originalTimeline,timeline);
   const layered=overlays.length?await renderBrollLayer({videoPath:base,outputPath:join(dir,'layered.mp4'),overlays,durationSec:assessment.durationSec,ffmpegDir}):base;
   const joined=profile.id==='reels'&&timeline.clips.length>1?await renderSoftTransitions({videoPath:layered,outputPath:join(dir,'soft-joins.mp4'),clips:timeline.clips,ffmpegDir}):layered;
   const grade=await renderVisualPreset({inputPath:joined,outputPath:join(dir,'color.mp4'),presetId:profile.preset,ffmpegDir});
   const positionYRatio=safeCaptionPosition(originalTimeline.protectedRegions??[]),output=join(dir,profile.id+'.mp4');
   const burn=captions.cues?await burnPersonaSubtitles({videoPath:grade.output.path,reviewPath:captions.reviewPath,outputPath:output,presetId:profile.preset,ffmpegDir,positionYRatio}):await copyFile(grade.output.path,output,fsConstants.COPYFILE_EXCL).then(async()=>({output:{sha256:await sha(output)}}));
   await progress({platform:profile.id,stage:'final_qa',completed:exports.length,total:4});
   const qaPath=join(dir,'QA.json');await run(process.execPath,[join(home,'persona-verify-render.mjs'),output,'persona-platform-'+profile.id,'reel',qaPath],ffmpegDir);validateDraftQa(await json(qaPath),output);
   const qualityPath=join(dir,'VIDEO-QUALITY.json');await analyzePersonaVideoQuality({videoPath:output,subtitlePath:captions.cues?captions.srtPath:undefined,expectedDurationSec:assessment.durationSec,outputPath:qualityPath,ffmpegDir});
   const warnings=[...assessment.warnings,...(!captions.cues?['Автор не задал титры; субтитры не выдуманы и не вшиты.']:[]),'Точки tutti не подтверждены; склейки сохраняют полные ASR-кандидаты, синхронизация с оркестровым tutti не заявляется.',...(!overlays.length?['Дополнительный B-roll не предоставлен; новые кадры не сгенерированы.']:[]),...(!originalTimeline.protectedRegions?.length?['Лицо не обнаруживалось автоматически; положение субтитров требует просмотра.']:[])];
   exports.push({platform:profile.id,label:profile.label,status:'awaiting-author-review',videoPath:output,sha256:burn.output.sha256,qaPath,qualityPath,captions,visualPreset:profile.preset,durationSec:assessment.durationSec,aspectRatio:'9:16',transitions:profile.id==='reels'?'120ms-video-only-soft-joins-audio-unchanged':'author-cut-order',warnings,aiEditorial:selected.aiEditorial,publicationApproved:false,distributionAllowed:false});
  }
  const report={version:1,kind:'persona-platform-edits-v1',sourceResult:resolve(resultPath),sourceSha256:qa.evidence.sha256,briefFingerprintSha256:result.briefFingerprintSha256,exports,publicationApproved:false,distributionAllowed:false};
  await writeFile(join(out,'EXPORTS.json'),JSON.stringify(report,null,2),{flag:'wx'});await progress({stage:'completed',completed:exports.length,total:4});return report;
 }catch(error){await writeFile(join(out,'EXPORT-ERROR.json'),JSON.stringify({error:error.message,completed:exports.length,publicationApproved:false}),{flag:'wx'});throw error}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [resultPath,outputDir,model,ffmpegDir]=process.argv.slice(2);renderPlatformEdits({resultPath,outputDir,model,ffmpegDir}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1})}
