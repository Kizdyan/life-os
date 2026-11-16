/** Smart Moment Detection: 2-fps evidence, real OpenRouter Vision ratings,
 * 3–5 verified emotional peaks, deterministic dramatic arc, optional Whisper.
 * Never pretends still-frame classification is measured emotion or speech.
 */
import {createHash} from 'node:crypto';
import {editPlanProvider,validateEditPlan} from './persona-quick-edit-plan.mjs';

const round=n=>Number(n.toFixed(3));
const emotions=new Set(['smile','serious','expressive','neutral','uncertain']);
const maxFrames=600; // refuse excessive paid calls; NEVER silently skip 0.5s positions
const batchSize=12;
const safeReason=x=>typeof x==='string'?x.slice(0,170).replace(/[\x00-\x1f]/g,' ').trim():'';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const strictNumber=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const asJson=raw=>{
 const val=typeof raw==='string'?JSON.parse(raw):raw;
 if(typeof val==='string')return JSON.parse(val);
 return val;
};
export function smartFrameSchedule(videos){
 if(!Array.isArray(videos)||videos.length<1||videos.length>4)throw Error('Smart Moment Detection requires 1–4 videos');
 const frames=[];
 for(const [fileIndex,video] of videos.entries()){
  if(!strictNumber(video.durationSec,8,1200)||typeof video.sha256!=='string'||!/^[a-f0-9]{64}$/.test(video.sha256))
   throw Error('Invalid probed video identity or duration');
  const count=Math.ceil(video.durationSec*2-1e-7);
  if(frames.length+count>maxFrames)throw Error('Smart Moment Detection: maximum 300 seconds of input per job at 0.5s frame spacing; split longer takes. No hidden frame skipping.');
  for(let i=0;i<count;i++)frames.push({id:'f'+fileIndex+'_'+i,fileIndex,atSec:round(i*.5),sourceSha256:video.sha256});
 }
 return frames;
}
export function validateVisionBatch(value,frames){
 const parsed=asJson(value),answer=parsed?.frames;
 if(!Array.isArray(answer)||answer.length!==frames.length)throw Error('Vision response omitted or invented frames');
 const byId=new Map(answer.map(x=>[x?.id,x]));
 if(byId.size!==frames.length)throw Error('Vision response contains repeated frame IDs');
 return frames.map(frame=>{
  const x=byId.get(frame.id);
  if(!x||typeof x.faceVisible!=='boolean'||typeof x.lookingAtCamera!=='boolean'||
   typeof x.sharpFace!=='boolean'||typeof x.transition!=='boolean'||
   !emotions.has(x.emotion)||!strictNumber(x.intensity,0,4)||!strictNumber(x.clarity,0,4))
   throw Error('Vision returned an invalid or unverified frame score');
  return {...frame,faceVisible:x.faceVisible,lookingAtCamera:x.lookingAtCamera,
   sharpFace:x.sharpFace,transition:x.transition,emotion:x.emotion,
   intensity:x.intensity,clarity:x.clarity,reason:safeReason(x.reason)};
 });
}
export async function detectVisionBatch({frames,jpegs,env=process.env,fetchImpl=fetch}){
 if(!Array.isArray(frames)||frames.length<1||frames.length>batchSize||
  !Array.isArray(jpegs)||jpegs.length!==frames.length||
  jpegs.some(x=>!Buffer.isBuffer(x)||x.length<256||x.length>160000))
  throw Error('Vision batch must contain real, bounded JPEGs for exact frame IDs');
 const provider=editPlanProvider(env);
 if(provider.provider!=='openrouter'&&env.PERSONA_SMART_ALLOW_OPENAI!=='1')
  throw Error('Smart Moment Detection requires OpenRouter Vision (OPENROUTER_API_KEY)');
 const prompt=[
  'Ты режиссёр по работе с актёром. Рассмотри ПО ПОРЯДКУ все реальные кадры одной камеры с интервалом 0.5 секунды.',
  'Найди смену выражения лица (улыбка, серьёзный взгляд), прямой взгляд в камеру, выразительную мимику.',
  'Игнорируй нерезкое лицо, отвёрнутый взгляд, закрытое или невидимое лицо.',
  'Сравни соседние кадры и ставь transition=true лишь при видимом изменении. Не приписывай актёру внутренние чувства и не выдумывай произнесённых слов.',
  'faceVisible: лицо видно; lookingAtCamera: виден прямой взгляд; sharpFace: лицо не размыто.',
  'emotion: smile|serious|expressive|neutral|uncertain; intensity и clarity — числа 0..4; reason — 1 короткая визуально подтверждённая причина.',
  'Ответ строго JSON {"frames":[{"id":"...","faceVisible":true,"lookingAtCamera":true,"sharpFace":true,"transition":false,"emotion":"smile","intensity":3,"clarity":4,"reason":"..."}]}.',
  'В ответе должен быть каждый из указанных ID ровно один раз; ничего сверх этого.'
 ].join(' ');
 const messages=[{role:'system',content:prompt},
  {role:'user',content:[
   {type:'text',text:JSON.stringify({task:'Score consecutive frames at exactly 0.5 seconds. JSON only.',frames:frames.map(f=>({id:f.id,fileIndex:f.fileIndex,atSec:f.atSec}))})},
   ...frames.flatMap((f,i)=>[
    {type:'text',text:'FRAME '+f.id+' at '+f.atSec+'s of source '+(f.fileIndex+1)},
    {type:'image_url',image_url:{url:'data:image/jpeg;base64,'+jpegs[i].toString('base64'),detail:'low'}}
   ])
  ]}];
 const req={model:provider.model,temperature:0,max_tokens:2600,response_format:{type:'json_object'},messages};
 let response;
 try{response=await fetchImpl(provider.url,{method:'POST',headers:{Authorization:'Bearer '+provider.key,'Content-Type':'application/json'},
  body:JSON.stringify(req),signal:AbortSignal.timeout(105000)})}
 catch{throw Error('OpenRouter Vision failed: no verified emotion labels returned')}
 if(!response?.ok)throw Error('OpenRouter Vision rejected smart frames (HTTP '+response?.status+')');
 const raw=await response.text();if(raw.length>100000)throw Error('Vision batch JSON exceeded limit');
 let data;
 try{data=JSON.parse(raw);data=asJson(data.choices?.[0]?.message?.content)}catch{throw Error('OpenRouter Vision returned invalid JSON')}
 return {frames:validateVisionBatch(data,frames),provider:provider.provider,model:provider.model};
}
function eligible(frame){return frame.faceVisible&&frame.lookingAtCamera&&frame.sharpFace&&frame.clarity>=2&&frame.emotion!=='uncertain'}
function frameRank(f){
 return f.intensity*1.6+f.clarity*.8+(f.transition?2.7:0)+(f.emotion==='smile'||f.emotion==='serious'?1.25:0);
}
function speechWeight(f,speech){
 const touching=speech.filter(s=>s.fileIndex===f.fileIndex&&f.atSec>=s.startSec-.4&&f.atSec<=s.endSec+.4);
 return touching.length?Math.max(...touching.map(s=>s.emphasis>=4?3:1)):0;
}
export function chooseSmartMoments(scored,{videos,speech=[]}={}){
 if(!Array.isArray(scored)||!scored.length||!Array.isArray(videos))throw Error('Missing frame evidence');
 const viable=scored.filter(eligible).map(f=>({...f,score:frameRank(f)+speechWeight(f,speech)}));
 if(viable.length<3)throw Error('Not enough sharp, camera-facing actor frames for three reliable emotional peaks');
 const selected=[],spacing=3.2;
 const apart=f=>selected.every(x=>x.fileIndex!==f.fileIndex||Math.abs(x.atSec-f.atSec)>=spacing);
 const high=pool=>pool.filter(apart).sort((a,b)=>b.score-a.score||a.fileIndex-b.fileIndex||a.atSec-b.atSec)[0];
 // Reserve the absolute strongest available peak for the FINAL shot first.
 // Otherwise choosing the hook first consumes the best frame and leaves a weaker ending.
 const final=high(viable);
 selected.push(final);
 const hook=high(viable.filter(f=>f.emotion==='smile'||f.emotion==='expressive'))||high(viable);
 if(!hook)throw Error('No independent bright opening after reserving the strongest closing peak');
 selected.push(hook);
 const turns=viable.filter(f=>f.emotion!==hook.emotion&&(f.transition||f.emotion==='serious'));
 const pivot=high(turns)||high(viable.filter(f=>f.emotion!==hook.emotion))||high(viable);
 if(!pivot)throw Error('No independent contrasting emotional turn');
 // From here on keep dramaturgical order: hook → turn → strongest finale.
 selected.splice(0,selected.length,hook,pivot,final);
 // Preserve at least one usable point of view from every submitted take, up to five.
 // A video lacking any sharp/direct-look frame is never forced into the cut.
 for(let fileIndex=0;fileIndex<videos.length&&selected.length<5;fileIndex++){
  if(selected.some(x=>x.fileIndex===fileIndex))continue;
  const alternate=high(viable.filter(f=>f.fileIndex===fileIndex));
  if(alternate)selected.push(alternate);
 }
 // Additional expressive transitions only when visually supported.
 const good=viable.filter(f=>f.transition&&f.score>=5.5);
 while(selected.length<5){const next=high(good);if(!next)break;selected.push(next)}
 const choices=selected.map((f,i)=>{
  const video=videos[f.fileIndex];
  const phrase=speech.filter(x=>x.fileIndex===f.fileIndex&&x.startSec<=f.atSec+.25&&x.endSec>=f.atSec-.25)
   .sort((a,b)=>(b.emphasis||0)-(a.emphasis||0))[0];
  let startSec=clamp(f.atSec-1.43,0,video.durationSec-3.1),durationSec=3.1;
  // If Whisper reliably timed a short phrase near this peak, use the full phrase
  // plus small handles; never knowingly amputate a word just to fit a template.
  if(phrase&&phrase.endSec-phrase.startSec<=4.2){
   const start=Math.min(startSec,Math.max(0,phrase.startSec-.22));
   const end=Math.max(startSec+durationSec,Math.min(video.durationSec,phrase.endSec+.22));
   startSec=start;durationSec=Math.min(5,video.durationSec-start,end-start);
  }
  startSec=round(clamp(startSec,0,video.durationSec-durationSec));
  durationSec=round(durationSec);
  return {id:'peak_'+i,fileIndex:f.fileIndex,startSec,durationSec,stillSec:f.atSec,
   sourceSha256:video.sha256,emotion:f.emotion,score:round(f.score),
   visualReason:f.reason,arcRole:i===0?'hook':i===1?'turn':i===2?'finale':'support',
   confidence:'model-visual-rating-not-objective-affect-measurement'};
 });
 // Order: hook, optional support, turn, optional support, finale.
 return choices.length===3?choices:[choices[0],...choices.slice(3,4),choices[1],...choices.slice(4),choices[2]];
}
export function makeSmartEditPlan({prompt,videos,scored,audio=[],visionProvider='openrouter',visionModel='unknown'}){
 const speech=audio.flatMap((a,fileIndex)=>Array.isArray(a.segments)?a.segments.map(x=>({...x,fileIndex})):[]);
 const moments=chooseSmartMoments(scored,{videos,speech});
 const candidates=moments.map((x,i)=>({id:'m'+i,fileIndex:x.fileIndex,startSec:x.startSec,durationSec:x.durationSec,
  stillSec:x.stillSec,sourceSha256:x.sourceSha256}));
 const order=(candidates.length===moments.length);
 if(!order)throw Error('Moment identity changed');
 const reason=moments.map(m=>m.arcRole+': '+m.emotion+' at '+m.stillSec+'s').join('; ');
 const choices=moments.map((m,i)=>({candidateId:candidates[i].id,role:'actor',caption:''}));
 const visual=validateEditPlan({stylePack:'Cinematic',creativeIntent:'Тихая роскошь: эмоциональный хук, смена состояния, сильный финал. '+reason.slice(0,320),choices},candidates);
 const speechStatus=audio.some(x=>x.status==='whisper-transcribed')?'whisper-transcribed':
   audio.some(x=>x.status==='whisper-unavailable')?'whisper-unavailable':
   audio.every(x=>x.status==='no-audio'||x.status==='no-speech-detected')?'no-speech-detected':'not-confirmed';
 const plan={...visual,kind:'persona-smart-moment-edit-plan',mediaEvidence:'every_half_second_vision_jpegs',
  audioUnderstanding:speechStatus,speechSegmentsUsed:speech.length,
  choices:visual.choices.map((choice,i)=>({...choice,emotion:moments[i].emotion,arcRole:moments[i].arcRole,
   score:moments[i].score,selectionReason:moments[i].visualReason,peakSec:moments[i].stillSec})),
  detection:{version:1,provider:visionProvider,model:visionModel,frameIntervalSec:.5,
   analyzedFrames:scored.length,eligibleFrames:scored.filter(eligible).length,
   manualTimecodes:false,authorPrompt:prompt,sourceVideoCount:videos.length,
   disclaimer:'Frame-level visual estimates, not measured inner emotional state; ASR is fallible.'}};
 return {plan,moments,candidates};
}
export async function runSmartVision({videos,frameAt,env=process.env,fetchImpl=fetch,batchOverride=null,onProgress=async()=>{}}){
 const schedule=smartFrameSchedule(videos),scored=[];let provider='test-only',model='test-only',requests=0;
 for(let i=0;i<schedule.length;){
  const fileIndex=schedule[i].fileIndex;
  const current=[];
  while(i<schedule.length&&schedule[i].fileIndex===fileIndex&&current.length<batchSize)current.push(schedule[i++]);
  const jpeg=[];
  for(const f of current)jpeg.push(await frameAt(f));
  const output=batchOverride
   ?{frames:validateVisionBatch(await batchOverride({frames:current,jpegs:jpeg}),current),provider:'test-injected',model:'fixture'}
   :await detectVisionBatch({frames:current,jpegs:jpeg,env,fetchImpl});
  scored.push(...output.frames);provider=output.provider;model=output.model;requests++;
  await onProgress({completedFrames:scored.length,totalFrames:schedule.length,requestCount:requests});
 }
 return {scored,provider,model,requests,frameCount:schedule.length,evidenceSha256:createHash('sha256').update(JSON.stringify(scored.map(x=>[x.id,x.sourceSha256,x.emotion,x.clarity,x.intensity]))).digest('hex')};
}
