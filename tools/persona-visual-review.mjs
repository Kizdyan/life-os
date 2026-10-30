#!/usr/bin/env node
/** Offline visual QA and author-approved framing. No uploads, AI edits, source changes or publication. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {dirname,extname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const fail=m=>{throw Error(m)};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const extensions=new Set(['.mp4','.mov','.mkv','.webm','.m4v']);
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const embedJson=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
const readJson=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
async function hash(path){const h=createHash('sha256');for await(const part of createReadStream(path))h.update(part);return h.digest('hex')}
function run(bin,args){
 return new Promise((ok,bad)=>{
  const p=spawn(bin,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stderr='',stdout='',finished=false;
  const timer=setTimeout(()=>{if(!finished){finished=true;p.kill();bad(Error('FFmpeg/FFprobe timed out'))}},90000);
  p.stdout.on('data',b=>{stdout=(stdout+b).slice(-120000)});
  p.stderr.on('data',b=>{stderr=(stderr+b).slice(-120000)});
  p.on('error',e=>{if(!finished){finished=true;clearTimeout(timer);bad(e)}});
  p.on('close',code=>{if(finished)return;finished=true;clearTimeout(timer);code===0?ok({stderr,stdout}):bad(Error('Media command failed: '+stderr.slice(-1200)))});
 });
}
function visualProvenance(timeline,timelinePath,timelineSha256,scenes){
 const projectId=typeof timeline.projectId==='string'&&timeline.projectId.trim()
  ?timeline.projectId.trim():`local-${timelineSha256.slice(0,16)}`;
 return {version:1,kind:'persona-artifact-provenance-v1',projectId,
  revisionId:`timeline-sha256:${timelineSha256}`,artifact:'timeline',
  timelinePath,timelineSha256,
  dependencies:scenes.map(scene=>({beat:scene.beat,path:scene.path,
   sourceSha256:scene.sourceSha256,startSec:scene.startSec,durationSec:scene.durationSec})),
  operation:'visual-review'};
}
export function validateTimeline(timeline){
 if(timeline?.version!==1||!Array.isArray(timeline.clips)||timeline.clips.length<1||timeline.clips.length>30)fail('Invalid timeline');
 let prev=0;
 for(let i=0;i<timeline.clips.length;i++){
  const c=timeline.clips[i],beat=c?.beat??i+1;
  if(!Number.isSafeInteger(beat)||beat<=prev||beat>30||
     typeof c.path!=='string'||!c.path.trim()||!finite(c.startSec)||
     c.startSec<0||!finite(c.durationSec)||c.durationSec<.25||c.durationSec>60)
   fail('Timeline clips are reordered or interval is invalid');
  prev=beat;
 }
 return true;
}
export function applyManualFraming(pack,selection,timeline){
 validateTimeline(timeline);
 if(pack?.version!==1||pack.kind!=='persona-visual-review-pack-v1'||
    !/^[a-f0-9]{64}$/.test(pack.timelineSha256??'')||
    !Array.isArray(pack.scenes)||pack.scenes.length!==timeline.clips.length||
    selection?.kind!=='persona-visual-framing-selection-v1'||
    selection.publicationApproved!==false||selection.approved!==undefined||
    selection.authorApproved!==undefined||!Array.isArray(selection.scenes)||
    selection.scenes.length!==pack.scenes.length||selection.timelineSha256!==pack.timelineSha256)
   fail('Invalid visual review / approval guard');
 const result=structuredClone(timeline);
 for(let i=0;i<pack.scenes.length;i++){
  const c=result.clips[i],scene=pack.scenes[i],choice=selection.scenes[i];
  if(scene.beat!==(c.beat??i+1)||scene.startSec!==c.startSec||
     scene.durationSec!==c.durationSec||scene.path!==(isAbsolute(c.path)?resolve(c.path):resolve(dirname(pack.timelinePath),c.path))||
     choice.beat!==scene.beat||choice.sourceSha256!==scene.sourceSha256||
     choice.reviewed!==true||typeof choice.reason!=='string'||
     choice.reason.trim().length<3||choice.reason.length>500)
   fail('Framing must be reviewed against the same clip and source hash');
  const mode=choice.framing?.mode,x=choice.framing?.position?.x,y=choice.framing?.position?.y;
  if(!['contain','cover'].includes(mode)||!finite(x)||!finite(y)||
     x<0||x>1||y<0||y>1)fail('Invalid crop mode or position');
  c.framing={mode,position:{x,y}};
 }
 result.visualReview={kind:'persona-manual-framing-v1',publicationApproved:false,
  reviewedBeats:pack.scenes.map(s=>s.beat),timelineSha256:pack.timelineSha256,
  projectId:pack.provenance?.projectId??null};
 result.artifactProvenance={version:1,kind:'persona-artifact-provenance-v1',
  projectId:pack.provenance?.projectId??null,
  parentTimelineSha256:pack.timelineSha256,operation:'manual-framing',
  dependencies:pack.provenance?.dependencies??[]};
 return result;
}
export function makeVisualHtml(pack){
 if(pack?.kind!=='persona-visual-review-pack-v1'||!Array.isArray(pack.scenes))fail('Invalid visual pack');
 const cards=pack.scenes.map(s=>{
  const id='beat'+s.beat;
  return '<section><h2>Сцена '+s.beat+'</h2>'+
   '<p class="muted">Исходник: '+escapeHtml(s.sourceLabel)+' · '+s.startSec.toFixed(2)+'–'+(s.startSec+s.durationSec).toFixed(2)+' c</p>'+
   '<div class="layout"><div class="phone"><img id="'+id+'img" src="'+escapeHtml(s.frames[1].file)+'" alt="Сравнение кадрирования"></div>'+
   '<div class="controls"><label>Режим <select id="'+id+'mode"><option value="contain">Вписать целиком</option><option value="cover">Заполнить 9:16</option></select></label>'+
   '<label>Горизонтальное положение <input id="'+id+'x" type="range" min="0" max="100"></label>'+
   '<label>Вертикальное положение <input id="'+id+'y" type="range" min="0" max="100"></label>'+
   '<label>Почему выбрал такое кадрирование?<textarea id="'+id+'reason" rows="2" placeholder="Лицо и клавиши хорошо видны"></textarea></label>'+
   '<p class="muted">В режиме заполнения проверь лицо, очки, руки, клавиши и место для субтитров.</p></div></div>'+
   '<div class="stills">'+s.frames.map(f=>'<img src="'+escapeHtml(f.file)+'" alt="Контрольный кадр">').join('')+'</div>'+
   '<p class="muted">Средняя яркость YAVG: '+s.frames.map(f=>f.yavg??'нет измерения').join(' · ')+
   (s.warnings.length?' · <strong>'+escapeHtml(s.warnings.join('; '))+'</strong>':'')+'</p></section>';
 }).join('');
 const browserScript=[
  'const pack=JSON.parse(document.getElementById("data").textContent);',
  'for(const s of pack.scenes){',
  'const id="beat"+s.beat,img=document.getElementById(id+"img"),mode=document.getElementById(id+"mode"),x=document.getElementById(id+"x"),y=document.getElementById(id+"y");',
  'const first=s.originalFraming||{mode:"contain",position:{x:.5,y:.5}};',
  'mode.value=first.mode;x.value=Math.round(first.position.x*100);y.value=Math.round(first.position.y*100);',
  'function update(){img.style.objectFit=mode.value==="cover"?"cover":"contain";img.style.objectPosition=x.value+"% "+y.value+"%";}',
  'for(const input of [mode,x,y])input.addEventListener("input",update);update();',
  '}',
  'document.getElementById("save").addEventListener("click",()=>{',
  'const output={version:1,kind:"persona-visual-framing-selection-v1",publicationApproved:false,timelineSha256:pack.timelineSha256,scenes:[]};',
  'for(const s of pack.scenes){const id="beat"+s.beat,reason=document.getElementById(id+"reason").value.trim();',
  'if(reason.length<3){alert("Посмотрите кадры и впишите причину для сцены "+s.beat);return;}',
  'output.scenes.push({beat:s.beat,sourceSha256:s.sourceSha256,reviewed:true,reason,framing:{mode:document.getElementById(id+"mode").value,',
  'position:{x:Number(document.getElementById(id+"x").value)/100,y:Number(document.getElementById(id+"y").value)/100}}});}',
  'const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:"application/json"}));',
  'const link=document.createElement("a");link.href=url;link.download="visual-framing.reviewed.json";link.click();',
  'setTimeout(()=>URL.revokeObjectURL(url),1000);});'
 ].join('\n');
 const continuity=(pack.continuityWarnings??[]).map(w=>
  '<li>Склейка '+w.fromBeat+' → '+w.toBeat+': средняя яркость изменилась на '+
   escapeHtml(w.yavgDelta)+' YAVG. Это сигнал для ручного просмотра, а не автоматическая ошибка.</li>').join('');
 const embedded=embedJson({timelineSha256:pack.timelineSha256,scenes:pack.scenes.map(s=>({beat:s.beat,sourceSha256:s.sourceSha256,originalFraming:s.originalFraming}))});
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Persona · визуальный контроль</title><style>'+
  'body{font:16px/1.5 system-ui,sans-serif;max-width:1050px;margin:auto;padding:24px;background:#131920;color:#f1f4f6}'+
  'h1{font-size:28px}.muted{color:#b9c2cf}section{border-top:1px solid #3f4b58;padding:20px 0}'+
  '.layout{display:grid;grid-template-columns:270px 1fr;gap:22px}.phone{aspect-ratio:9/16;width:270px;background:#000;overflow:hidden;border-radius:12px}'+
  '.phone img{width:100%;height:100%;object-fit:contain}.controls{display:grid;gap:15px;align-content:start}label{display:grid;gap:5px}'+
  'select,textarea{font:inherit;padding:10px;border-radius:7px;color:white;background:#24303a;border:1px solid #82909b}'+
  '.stills{display:flex;gap:8px;overflow:auto;margin-top:14px}.stills img{object-fit:contain;max-width:31%;max-height:200px;background:black}'+
  'button{font:inherit;padding:12px 22px;border-radius:8px} @media(max-width:600px){.layout{grid-template-columns:1fr}.phone{margin:auto}}'+
  '</style></head><body><h1>Persona · визуальная приёмка 9:16</h1>'+
  '<p class="muted">Сравни кадрирование и исходный цвет. Это только контрольные стоп-кадры, не анализ актёрской игры или резкости глаз. Никаких изменений внешности и автоматической публикации.</p>'+
  (continuity?'<h2>Возможные различия между сценами</h2><ul>'+continuity+'</ul>':'')+
  cards+'<button id="save">Сохранить ручное кадрирование</button>'+
  '<p class="muted">Экспортируется JSON для новой версии монтажа. Публикация не разрешается.</p>'+
  '<script type="application/json" id="data">'+embedded+'</script><script>'+browserScript+'</script></body></html>';
}
export async function prepareVisualReview(timelinePath,outputDir){
 const timelineFile=resolve(timelinePath),timeline=await readJson(timelineFile),timelineSha256=await hash(timelineFile);
 validateTimeline(timeline);
 const root=resolve(outputDir),ffmpeg=process.env.PERSONA_FFMPEG||'ffmpeg',ffprobe=process.env.PERSONA_FFPROBE||'ffprobe';
 const scenes=[],hashes=new Map();
 for(let i=0;i<timeline.clips.length;i++){
  const clip=timeline.clips[i],p=isAbsolute(clip.path)?resolve(clip.path):resolve(dirname(timelineFile),clip.path);
  const source=await realpath(p),file=await stat(source);
  if(!extensions.has(extname(source).toLowerCase())||!file.isFile()||file.size<=0||file.size>2*1024**3)
   fail('Invalid video source');
  if(!hashes.has(source))hashes.set(source,await hash(source));
  const info=JSON.parse((await run(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',source])).stdout);
  if(!info.streams?.some(x=>x.codec_type==='video')||!finite(Number(info.format?.duration))||
     clip.startSec+clip.durationSec>Number(info.format.duration)+0.02)fail('Clip outside recorded video duration');
  scenes.push({beat:clip.beat??i+1,path:source,sourceLabel:source.split(/[\\/]/).pop(),startSec:clip.startSec,
   durationSec:clip.durationSec,sourceSha256:hashes.get(source),
   originalFraming:clip.framing??timeline.framing??{mode:'contain',position:{x:.5,y:.5}},
   frames:[],warnings:[]});
 }
 await mkdir(root,{recursive:false});
 try{
  for(const scene of scenes){
   for(const [idx,part] of [.15,.5,.85].entries()){
    const time=Number((scene.startSec+scene.durationSec*part).toFixed(3));
    const name='beat-'+String(scene.beat).padStart(2,'0')+'-'+(idx+1)+'.jpg';
    const out=await run(ffmpeg,['-hide_banner','-nostdin','-loglevel','info','-ss',String(time),
     '-i',scene.path,'-frames:v','1','-vf','signalstats,metadata=print,scale=900:900:force_original_aspect_ratio=decrease',
     '-q:v','4',join(root,name)]);
    const match=out.stderr.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
    scene.frames.push({file:name,timeSec:time,yavg:match?Number(Number(match[1]).toFixed(1)):null});
   }
   const values=scene.frames.map(f=>f.yavg).filter(finite);
   if(values.length===3){
    if(values.some(v=>v<45))scene.warnings.push('Тёмные участки — проверь экспозицию');
    if(values.some(v=>v>220))scene.warnings.push('Светлые участки — проверь пересвет');
    if(Math.max(...values)-Math.min(...values)>55)scene.warnings.push('Сильно меняется средняя яркость');
   }
  }
  const continuityWarnings=[];
  for(let i=1;i<scenes.length;i++){
   const left=scenes[i-1].frames[1].yavg,right=scenes[i].frames[1].yavg;
   if(finite(left)&&finite(right)&&Math.abs(right-left)>40)
    continuityWarnings.push({fromBeat:scenes[i-1].beat,toBeat:scenes[i].beat,
     yavgDelta:Number((right-left).toFixed(1)),warning:'Возможный скачок яркости на склейке — проверить визуально'});
  }
  const pack={version:1,kind:'persona-visual-review-pack-v1',timelinePath:timelineFile,timelineSha256,
   scenes,continuityWarnings,publicationApproved:false,
   provenance:visualProvenance(timeline,timelineFile,timelineSha256,scenes),
   note:'Signalstats brightness is not focus, skin tone, white balance, makeup, artistic quality or visual approval.'};
  await writeFile(join(root,'visual-review-pack.json'),JSON.stringify(pack,null,2)+'\n',{flag:'wx'});
  await writeFile(join(root,'review.html'),makeVisualHtml(pack),{flag:'wx'});
  return {reviewHtml:join(root,'review.html'),packPath:join(root,'visual-review-pack.json'),
   scenes:scenes.length,sceneWarnings:scenes.filter(s=>s.warnings.length).length,
   continuityWarnings:continuityWarnings.length,status:'needs-human-review'};
 }catch(err){
  await writeFile(join(root,'FAILED.json'),JSON.stringify({status:'failed',error:String(err.message||err)},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw err;
 }
}
export async function applyVisualReview({timelinePath,packPath,selectionPath,outputPath}={}){
 if(![timelinePath,packPath,selectionPath,outputPath].every(x=>typeof x==='string'&&x.trim()))fail('Required: timeline, pack, selection, new timeline JSON');
 const timelineFile=resolve(timelinePath);
 const [timeline,pack,selection,timelineSha256]=await Promise.all([readJson(timelineFile),readJson(packPath),readJson(selectionPath),hash(timelineFile)]);
 if(pack.timelinePath!==timelineFile)fail('Visual pack is from another timeline');
 if(pack.timelineSha256!==timelineSha256)fail('Timeline revision changed after visual review');
 const output=applyManualFraming(pack,selection,timeline),hashes=new Map();
 for(const scene of pack.scenes){
  if(!hashes.has(scene.path))hashes.set(scene.path,await hash(scene.path));
  if(hashes.get(scene.path)!==scene.sourceSha256)fail('Source video changed after visual review');
 }
 await writeFile(resolve(outputPath),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 return {timeline:resolve(outputPath),scenes:output.clips.length,status:'human-framing-only-no-publication-approval'};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [operation,a,b,c,d]=process.argv.slice(2);
 const job=operation==='prepare'&&a&&b?prepareVisualReview(a,b):
   operation==='apply'&&a&&b&&c&&d?applyVisualReview({timelinePath:a,packPath:b,selectionPath:c,outputPath:d}):null;
 if(!job){console.error('Usage: prepare timeline.json NEW_DIR | apply original-timeline.json pack.json reviewed-visual.json NEW-timeline.json');process.exitCode=2;}
 else job.then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error('Persona visual QA:',e.message);process.exitCode=1});
}
