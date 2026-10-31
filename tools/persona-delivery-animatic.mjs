#!/usr/bin/env node
/** Offline, self-contained audio-card preview. NOT filmed footage or spoken dialogue.
 * node tools/persona-delivery-animatic.mjs <explicit-local-wav> <new-output-dir>
 */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve('docs/persona-delivery');
const ids=['A01','B01','A02','B02','A03','B03','A04'];
const locked=new Map([[0,'Я актёр. И ещё пишу музыку.'],[1,'И у нас есть проблема.'],
 [6,'Это колыбельная? Это финал триллера.']]);
const fail=msg=>{throw Error('Persona animatic: '+msg)};

export function validateAnimaticVariants(original,candidate){
 for(const [label,brief] of [['V1',original],['candidate',candidate]]){
  if(brief?.version!==1||brief.sourceFormat!=='reel'||!Array.isArray(brief.script)||
      !Array.isArray(brief.shots)||brief.script.length!==7||brief.shots.length!==7)
   fail(label+': invalid seven-scene brief');
  let seconds=0;
  for(let i=0;i<7;i++){
   const s=brief.script[i],shot=brief.shots[i];
   if(s?.order!==i+1||shot?.order!==i+1||!s.line?.trim()||!s.action?.trim()||
      !Number.isFinite(s.durationSec)||s.durationSec<=0||shot.durationSec!==s.durationSec)
    fail(label+': invalid beat/shot '+ids[i]);
   if(locked.has(i)&&s.line!==locked.get(i))fail(label+': protected '+ids[i]+' changed');
   seconds+=s.durationSec;
  }
  if(seconds!==31)fail(label+': expected 31 seconds');
 }
 if(original.ideaId!==candidate.ideaId||
    original.script.some((s,i)=>s.durationSec!==candidate.script[i].durationSec))
  fail('V1 and candidate do not describe matching scene timing and idea');
 return true;
}
export function checkWav(wav){
 if(!Buffer.isBuffer(wav)||wav.length<44||wav.length>20*1024*1024||
    wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')
  fail('explicit WAV must be RIFF/WAVE below 20 MiB');
 let fmt=null,bytes=0;
 for(let p=12;p+8<=wav.length;){
  const name=wav.toString('ascii',p,p+4),size=wav.readUInt32LE(p+4);
  if(size>wav.length-p-8)fail('corrupted WAV chunks');
  if(name==='fmt '&&size>=16)
   fmt={format:wav.readUInt16LE(p+8),channels:wav.readUInt16LE(p+10),
    rate:wav.readUInt32LE(p+12),bytesPerSecond:wav.readUInt32LE(p+16)};
  if(name==='data')bytes+=size;
  p+=8+size+(size%2);
 }
 const seconds=bytes/(fmt?.bytesPerSecond||0);
 if(!fmt||![1,3].includes(fmt.format)||!([1,2].includes(fmt.channels))||
   !Number.isFinite(seconds)||seconds<0.25||seconds>3.5)
  fail('expected PCM/float WAV with a 0.25–3.5 second original sting');
 return {durationSec:Number(seconds.toFixed(3)),channels:fmt.channels,rate:fmt.rate};
}
export function makeHtml(original,candidate,wav,seconds){
 validateAnimaticVariants(original,candidate);
 const payload={versions:[original.script,candidate.script],ids,seconds:31,musicDuration:seconds};
 const safe=JSON.stringify(payload).replaceAll('<','\\u003c').replaceAll('&','\\u0026');
 return [
 '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>Persona · Актёр и композитор · аниматик</title>',
 '<style>body{font-family:system-ui;background:#101722;color:#f3f6fc;margin:20px}main{max-width:1000px;margin:auto}',
 '.layout{display:flex;flex-wrap:wrap;gap:24px}.phone{width:min(86vw,320px);aspect-ratio:9/16;border:8px solid #354358;',
 'border-radius:24px;background:linear-gradient(140deg,#304d69,#131723);padding:25px;box-sizing:border-box;display:flex;',
 'flex-direction:column;justify-content:space-between}.phone.b{background:linear-gradient(140deg,#544566,#171321)}',
 '.line{font-size:clamp(22px,3vw,30px);font-weight:700}.detail{color:#d1d6e5;font-size:13px}.panel{flex:1;min-width:250px;',
 'background:#1b2836;padding:20px;border-radius:16px}button,select{font:inherit;padding:10px;border-radius:8px;',
 'background:#395170;color:white;border:1px solid #718399;cursor:pointer;margin:4px}',
 '.track{display:flex;height:22px;gap:3px;margin:18px 0}.seg{background:#698198;min-width:10px;padding:0;margin:0;border:0}',
 '.seg.sel{background:#f1c67c}.warning{border-left:3px solid #f1c67c;padding-left:12px;color:#d4deec}',
 '</style><main><h1>Актёр и композитор</h1>',
 '<p class="warning">Предварительная раскадровка: только текстовые карточки и локальный WAV-эскиз. ',
 '<b>НЕТ снятого видео, голосовых дублей или авторского утверждения.</b></p>',
 '<div class="layout"><div class="phone" id="phone"><span id="role">АКТЁР</span><div class="line" id="line"></div>',
 '<div class="detail" id="action"></div><span id="time"></span></div>',
 '<div class="panel"><label>Версия: <select id="version"><option value="0">Исходный V1</option>',
 '<option value="1" selected>Редакторский кандидат</option></select></label>',
 '<p><button id="start">▶ Смотреть 31 секунду</button><button id="pause">Пауза</button>',
 '<button id="reset">Сначала</button></p><div class="track" id="track"></div><p id="position"></p>',
 '<p>Музыкальная вставка — в конце B03. Встроенный WAV можно прослушать отдельно:</p>',
 '<audio id="audio" controls preload="auto" src="data:audio/wav;base64,'+wav.toString('base64')+'"></audio>',
 '<p class="warning">Речь НЕ озвучена: реальную длительность реплик и комедийную игру необходимо проверить чтением вслух.</p>',
 '</div></div><script id="payload" type="application/json">'+safe+'</script>',
 '<script>',
 '(function(){"use strict";const data=JSON.parse(document.getElementById("payload").textContent);',
 'const el=id=>document.getElementById(id),audio=el("audio");let version=1,time=0,playing=false,stamp=0,played=false;',
 'const starts=[0];for(const b of data.versions[0])starts.push(starts.at(-1)+b.durationSec);',
 'const cue=starts[5]+data.versions[0][5].durationSec-data.musicDuration-.35;',
 'const index=t=>Math.min(6,Math.max(0,starts.findIndex((s,i)=>i<7&&t>=s&&t<starts[i+1])));',
 'function paint(){const i=index(time),beat=data.versions[version][i];el("line").textContent=beat.line;',
 'el("action").textContent=beat.action;el("role").textContent=data.ids[i].startsWith("A")?"АКТЁР":"КОМПОЗИТОР";',
 'el("phone").classList.toggle("b",data.ids[i].startsWith("B"));el("time").textContent=time.toFixed(1)+" / 31.0 сек";',
 'el("position").textContent=data.ids[i]+" · "+starts[i]+"–"+starts[i+1]+" с · звуковой удар около "+cue.toFixed(2)+" с";',
 'document.querySelectorAll(".seg").forEach((x,j)=>x.classList.toggle("sel",i===j))}',
 'function stop(){playing=false;audio.pause()}',
 'function seek(t){stop();time=Math.min(30.999,Math.max(0,t));played=time>=cue+.05;paint()}',
 'function frame(now){if(!playing)return;time+=Math.min(.2,(now-stamp)/1000);stamp=now;',
 'if(time>=31){seek(30.999);return}if(time>=cue&&!played){played=true;audio.currentTime=0;',
 'audio.play().catch(()=>{el("position").textContent+=" · включите звук вручную"})}',
 'paint();requestAnimationFrame(frame)}',
 'el("start").onclick=()=>{if(playing)return;playing=true;stamp=performance.now();requestAnimationFrame(frame)};',
 'el("pause").onclick=stop;el("reset").onclick=()=>seek(0);el("version").onchange=e=>{version=Number(e.target.value);seek(0)};',
 'const track=el("track");data.ids.forEach((id,i)=>{const b=document.createElement("button");b.type="button";',
 'b.className="seg";b.style.flex=String(data.versions[0][i].durationSec);b.title=id;',
 'b.onclick=()=>seek(starts[i]);track.appendChild(b)});paint()})();',
 '</script></main></html>'
 ].join('\n');
}
export async function createAnimatic(audioPath,outDir){
 if(!audioPath||!outDir)fail('usage: node tools/persona-delivery-animatic.mjs <local-sting.wav> <new-output-dir>');
 const [oldBytes,newBytes,wav]=await Promise.all([
  readFile(join(root,'candidate-production-brief.json')),
  readFile(join(root,'editorial-candidate-production-brief.json')),
  readFile(resolve(audioPath))
 ]);
 const old=JSON.parse(oldBytes.toString('utf8')),next=JSON.parse(newBytes.toString('utf8'));
 validateAnimaticVariants(old,next);
 const meta=checkWav(wav),html=makeHtml(old,next,wav,meta.durationSec);
 const dir=resolve(outDir);
 await mkdir(dir,{recursive:false});
 await writeFile(join(dir,'animatic.html'),html,{flag:'wx'});
 const evidence={kind:'persona-audio-card-animatic-v1',status:'preview-only',durationSec:31,
  audio:{...meta,sha256:createHash('sha256').update(wav).digest('hex')},
  videoSources:0,recordedDialogue:false,publicationApproved:false,
  note:'Offline timed cards with selected local WAV. Human read-aloud, visual acting and actual Reel are not verified.'};
 await writeFile(join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 return {html:join(dir,'animatic.html'),evidence:join(dir,'evidence.json')};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 createAnimatic(process.argv[2],process.argv[3]).then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(error=>{console.error(error.message);process.exitCode=1});
