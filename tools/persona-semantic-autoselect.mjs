#!/usr/bin/env node
/**
 * Persona local speech-aware cut planner: opt-in offline whisper.cpp ASR, then
 * script-to-timed-speech matching. The existing semantic-montage assemble step
 * must still verify hashes/bounds; a human must still review the completed MP4.
 * Commands:
 *  transcribe <evidence/analysis.json> <whisper-cli binary> <model.bin>
 *  plan <evidence/analysis.json> <PersonaProductionBrief.json> <new-decisions.json>
 */
import {validateManualSource,readTakeBindings} from '../packages/core/src/persona-manual-script.mjs';
import {createHash} from 'node:crypto';
import { spawn } from 'node:child_process';
import {MAX_PERSONA_SOURCE_SECONDS} from './persona-media-limits.mjs';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlapsBlackInterval } from './persona-take-qa.mjs';

const fail = message => {throw Error(message)};
const valid = (n,min,max) => typeof n === 'number' && Number.isFinite(n) && n>=min && n<=max;
const sourcePath=(base,p)=>isAbsolute(p)?resolve(p):resolve(base,p);
async function readJson(path){return JSON.parse(await readFile(path,'utf8'))}
function normalize(s){return String(s).normalize('NFKC').toLowerCase().replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/u).filter(Boolean)}
function unique(a){return [...new Set(a)]}
function overlap(expected,actual){const a=unique(normalize(expected)),b=new Set(normalize(actual));return a.length?a.filter(w=>b.has(w)).length/a.length:0}
function similarity(expected,actual){const a=unique(normalize(expected)),b=unique(normalize(actual)),as=new Set(a),bs=new Set(b);const common=a.filter(w=>bs.has(w)).length;return (a.length&&b.length)?(2*common)/(a.length+b.length):0}
function ms(value){if(!Number.isFinite(value)||value<0)fail('Invalid speech time');return value/1000}
/** whisper.cpp --output-json-full uses transcription[].offsets.{from,to} in milliseconds. */
export function parseWhisperJson(value,durationSec){
  if(!value || !Array.isArray(value.transcription))fail('Expected whisper.cpp transcription array');
  const raw=[];
  for(const seg of value.transcription){
    // whisper.cpp JSON-full may include tokens WITHOUT per-token timestamps.
    // Its segment still carries authoritative offsets. Do not silently drop
    // a spoken line because token timestamps were not emitted by a model.
    const tokens=Array.isArray(seg?.tokens)&&seg.tokens.length?seg.tokens:null;
    const audible=tokens?.filter(t=>typeof t?.text==='string' &&
      t.text.trim() && !/^<\|.*\|>$/.test(t.text.trim()) &&
      !/^\[[^\]]+\]$/.test(t.text.trim())) ?? [];
    // Whisper JSON-full can contain an AUDIBLE zero-duration subword, e.g.
    // " И" (300-430), " у" (430-430), " нас" (430-600).
    // Discarding " у" silently turns the real text into "И нас"; merging the
    // next subword may instead invent "Инас". Either can corrupt subtitles,
    // timing evidence and strict line matching.
    //
    // If ANY audible token lacks a positive-duration timestamp, keep the
    // authoritative complete segment text and its actual segment offsets.
    // The lost word boundary is preserved, but timing is explicitly marked
    // 'segment' (never misreported as word-accurate). Post-speech music
    // boundaries therefore still require manual Recovery Review.
    const hasBrokenTime=audible.some(t=>t.offsets &&
      Number.isFinite(t.offsets.from) && Number.isFinite(t.offsets.to) &&
      (t.offsets.from<0 || t.offsets.to<t.offsets.from ||
       t.offsets.to/1000>durationSec+0.1));
    if(hasBrokenTime)fail('ASR token time offsets outside source');
    const allTokensTimed=audible.length>0 && audible.every(t=>t.offsets &&
      Number.isFinite(t.offsets.from) && Number.isFinite(t.offsets.to) &&
      t.offsets.to>t.offsets.from);
    // Even positive token timestamps are not reliable when Whisper omitted
    // spoken text from its token list or returned non-monotonic word offsets.
    // Both cases need a truthful full-segment transcript and coarse timing.
    const tokenText=audible.map(t=>t.text).join('');
    const textDisagrees=audible.length>0 && typeof seg?.text==='string' &&
      seg.text.trim() && normalize(tokenText).join(' ')!==normalize(seg.text).join(' ');
    const ordered=allTokensTimed && audible.every((t,i)=>i===0 ||
      (t.offsets.from>=audible[i-1].offsets.from &&
       t.offsets.to>=audible[i-1].offsets.to));
    const useWordTiming=allTokensTimed && ordered && !textDisagrees;
    if(!useWordTiming && audible.length &&
       (typeof seg?.text!=='string'||!seg.text.trim()||!seg.offsets))
      fail('ASR untimed speech has no complete segment text and offsets');
    if(!useWordTiming && typeof seg?.text==='string' && seg.text.trim() && !seg.offsets)
      fail('ASR spoken segment lacks time offsets');
    const candidates=useWordTiming?audible:[seg];
    const timing=useWordTiming?'word':'segment';
    // A disagreement between segment text and token text is ambiguous speech
    // evidence, not a transcript that can be automatically selected.
    const transcriptConflict=Boolean(textDisagrees);
    const grouped=[];
    for(const token of candidates){
      if(!token?.offsets||typeof token.text!=='string')continue;
      const start=ms(token.offsets.from),end=ms(token.offsets.to);
      if(!valid(start,0,durationSec)||!valid(end,start,durationSec+0.1))fail('ASR time offsets outside source');
      const text=token.text.trim();
      if(!text || /^\[[^\]]+\]$/.test(text) || end<=start)continue;
      // Full JSON token strings often split ONE Russian word into subwords.
      // Absence of a leading space means continuation, not a new word.
      if(useWordTiming && grouped.length && !/^\s/u.test(token.text)){
        const last=grouped[grouped.length-1];
        last.text+=text;
        last.endSec=end;
      }else grouped.push({startSec:start,endSec:end,text,timing,
        ...(transcriptConflict?{transcriptConflict:true}:{})});
    }
    raw.push(...grouped);
  }
  const sorted=raw.sort((a,b)=>a.startSec-b.startSec);
  if(!sorted.length)fail('No timestamped words/phrases from offline ASR');
  return sorted;
}
function modelScore(expected,segments,start,end){
  const text=segments.slice(start,end).map(s=>s.text).join(' ').trim();
  const coverage=overlap(expected,text),f1=similarity(expected,text);
  const duration=segments[end-1].endSec-segments[start].startSec;
  const score=0.6*coverage+0.4*f1-Math.max(0,duration-8)*0.015;
  return {text,coverage,f1,score,duration};
}
export function rankDialogueCandidates(line,sourceId,segments){
  const results=[];
  for(let i=0;i<segments.length;i++){
    for(let j=i+1;j<=Math.min(segments.length,i+24);j++){
      const duration=segments[j-1].endSec-segments[i].startSec;
      if(duration>12)break;
      // Even when the segment string exactly matches the script, a conflicting
      // token transcript must go to human Recovery Review, never auto-cut.
      if(segments.slice(i,j).some(part=>part.transcriptConflict===true))continue;
      const {text,coverage,f1,score}=modelScore(line,segments,i,j);
      if(coverage<0.75||f1<0.57)continue;
      // Bag-of-words scoring alone can falsely match "Это колыбельная"
      // inside "Эта колыбельная. Это совсем другое." because both words
      // appear somewhere. Short scripted lines require exact word order and
      // adjacency before they can become even a provisional ASR candidate.
      const expectedWords=normalize(line),heardWords=normalize(text);
      if(expectedWords.length<=3 &&
         !heardWords.some((_,k)=>expectedWords.every((w,j)=>heardWords[k+j]===w)))
        continue;
      // Clamp optional handles at adjacent ASR speech, never truncate speech.
      const speechStart=segments[i].startSec,speechEnd=segments[j-1].endSec;
      const previous=segments[i-1]?.endSec,next=segments[j]?.startSec;
      const startSec=Math.max(0,speechStart-0.16,Number.isFinite(previous)&&previous<=speechStart?(previous+speechStart)/2:0);
      const endSec=Math.min(speechEnd+0.18,Number.isFinite(next)&&next>=speechEnd?(speechEnd+next)/2:Infinity);
      results.push({sourceId,startSec,endSec,speechEndSec:segments[j-1].endSec,
       speechBoundaryConfidence:segments.slice(i,j).every(segment=>segment.timing==='word')?'word':'segment',coverage,f1,score,transcript:text,
       captionWords:segments.slice(i,j).map(segment=>({text:segment.text,startSec:segment.startSec,endSec:segment.endSec,timing:segment.timing??'segment'}))});
    }
  }
  return results.sort((a,b)=>b.score-a.score).slice(0,6);
}
function intersects(a,b){return a.sourceId===b.sourceId && Math.min(a.endSec,b.endSec)-Math.max(a.startSec,b.startSec)>0.1}
function requiresPostSpeechMusic(shot){
  // Explicit shot direction, not an invented claim that the model understood music.
  return typeof shot?.action==='string' &&
    /(?:после реплики|после слов|затем).{0,85}(?:музык|мелод|фортепиан|клавиш|пианино)/iu.test(shot.action);
}
function extendForShot(candidate,shot,source){
  if(!requiresPostSpeechMusic(shot))return candidate;
  if(!valid(shot.durationSec,0.25,60))return null;
  const endSec=Math.max(candidate.endSec,candidate.startSec+shot.durationSec);
  if(endSec>source.durationSec+0.02)return null;
  return {...candidate,endSec,postSpeechMusicPreserved:true};
}
function candidateAlternative(pick,beat,index){
  const confidence=Number(Math.min(0.94,Math.max(0.65,pick.score)).toFixed(3));
  return {candidateId:'beat-'+beat+'-take-'+(index+1),sourceId:pick.sourceId,
    startSec:Number(pick.startSec.toFixed(3)),durationSec:Number((pick.endSec-pick.startSec).toFixed(3)),
    transcript:pick.transcript,confidence,coverage:Number(pick.coverage.toFixed(3)),f1:Number(pick.f1.toFixed(3)),
    captionWords:pick.captionWords,speechEndSec:Number(pick.speechEndSec.toFixed(3)),
    speechBoundaryConfidence:pick.speechBoundaryConfidence,
    postSpeechMusicPreserved:pick.postSpeechMusicPreserved===true,
    rankingReason:'Offline ASR matched '+Math.round(pick.coverage*100)+'% of scripted tokens (F1='+pick.f1.toFixed(2)+'). Technical/ASR evidence only; visual and performance quality NOT assessed.'};
}
function choiceFromAlternative(beat,alternative){
 return {beat,selectedCandidateId:alternative.candidateId,sourceId:alternative.sourceId,startSec:alternative.startSec,
  durationSec:alternative.durationSec,transcript:alternative.transcript,confidence:alternative.confidence,
  captionWords:alternative.captionWords,speechEndSec:alternative.speechEndSec,
  speechBoundaryConfidence:alternative.speechBoundaryConfidence,
  postSpeechMusicPreserved:alternative.postSpeechMusicPreserved,
  reason:alternative.rankingReason+(alternative.postSpeechMusicPreserved?' Explicit post-speech music hold preserved.':'')};
}
export function createEditorialPlan(brief,sources,{mode='strict'}={}){
  if(!Array.isArray(brief?.script)||!Array.isArray(sources))fail('Invalid script or sources');
  if(!['strict','preview'].includes(mode))fail('Unknown editorial decision mode');
  const candidatesByBeat=brief.script.map((beat,index)=>{
    const shot=brief.shots?.[index];
    const options=sources.flatMap(src=>rankDialogueCandidates(beat.line,src.id,src.segments)
      .map(x=>({...x,endSec:Math.min(x.endSec,src.durationSec)}))
      // ASR segment-level timing cannot locate the music entry precisely.
      // Leave B03 unmatched so the existing Recovery Review can request a real boundary.
      .filter(x=>!requiresPostSpeechMusic(shot)||x.speechBoundaryConfidence==='word')
      .map(x=>extendForShot(x,shot,src))
      .filter(x=>x!==null && x.endSec<=src.durationSec+0.02)
      .filter(x=>!overlapsBlackInterval(x.startSec,x.endSec,src.technicalQuality?.blackIntervals))
      .filter(x=>x.score>=0.75 && valid(x.endSec-x.startSec,0.25,60)));
    return options.sort((a,b)=>b.score-a.score).slice(0,3);
  });
  const candidates=candidatesByBeat.map((options,index)=>({beat:index+1,alternatives:options.map((pick,option)=>candidateAlternative(pick,index+1,option))}));
  const missing=candidatesByBeat.findIndex(x=>x.length===0);
  if(mode==='strict'&&missing!==-1)fail('Manual review required: No confidently matched clean speech for beat '+(missing+1)+': '+brief.script[missing].line);
  // Backtracking prevents a greedy first take from occupying the only clean
  // window available to a later line. Hard budget: never search unboundedly.
  const chosen=[];let tried=0;
  function select(index){
    if(index===candidatesByBeat.length)return true;
    for(const candidate of candidatesByBeat[index]){
      if(++tried>20000)return false;
      if(chosen.some(prev=>intersects(prev,candidate)))continue;
      chosen.push(candidate);
      if(select(index+1))return true;
      chosen.pop();
    }
    return false;
  }
  if(mode==='strict'){
   if(!select(0))fail('Manual review required: no non-overlapping confident take combination (or search budget exceeded)');
   return {mode,candidates,choices:chosen.map((pick,index)=>choiceFromAlternative(index+1,candidateAlternative(pick,index+1,candidatesByBeat[index].indexOf(pick)))),missingBeats:[]};
  }
  const previewChoices=[];
  for(let index=0;index<candidatesByBeat.length;index++){
   const pick=candidatesByBeat[index].find(candidate=>!previewChoices.some(previous=>intersects(previous,candidate)));
   if(pick)previewChoices.push({...pick,beat:index+1});
  }
  const choices=previewChoices.map(pick=>{
   const options=candidatesByBeat[pick.beat-1];
   const option=options.findIndex(candidate=>candidate.sourceId===pick.sourceId&&candidate.startSec===pick.startSec&&candidate.endSec===pick.endSec);
   return choiceFromAlternative(pick.beat,candidateAlternative(pick,pick.beat,option));
  });
  return {mode,candidates,choices,missingBeats:brief.script.map((_,index)=>index+1).filter(beat=>!choices.some(choice=>choice.beat===beat))};
}
/** Authored visual takes are explicit file assignments, not fake ASR evidence. */
export function createManualEditorialPlan(brief,sources,{takeBindings=null}={}){
 const manual=validateManualSource(brief.manualSource,brief.script);
 if(createHash('sha256').update(manual.sourceText).digest('hex')!==manual.sourceSha256)fail('Manual source SHA mismatch');
 if(sources.length===1&&sources[0].id==='master'&&manual.scenes.every(s=>s.kind==='spoken'))return createEditorialPlan(brief,sources);
 const bindings=takeBindings?readTakeBindings(brief,takeBindings,true):null;
 const candidates=[],choices=[];
 for(const [i,scene] of manual.scenes.entries()){
  const mapped=sources.filter(src=>new RegExp('^s'+String(scene.order).padStart(2,'0')+'_t\\d{2}$','i').test(src.id));
  if(mapped.length!==1)fail('Назначьте ровно один файл на кадр '+scene.order+'; альтернативы требуют явного выбора.');
  const src=mapped[0],limit=Math.min(60,Math.max(15,brief.script[i].durationSec*3));
  if(!valid(src.durationSec,.25,limit))fail('Неподходящая длительность файла кадра '+scene.order+'; допустимо до '+limit+' с');
  const binding=bindings?.find(b=>b.sceneOrder===scene.order);if(binding&&(binding.sourceId!==src.id||binding.sha256!==src.sha256))fail('Binding source SHA mismatch');
  if((binding?.kind??scene.kind)==='spoken'){
   const one=createEditorialPlan({script:[{...brief.script[i],line:binding?.expectedSpeech??brief.script[i].line,order:1}],shots:[{...brief.shots[i],order:1}]},[src]);
   const alternatives=one.candidates[0].alternatives.map((c,n)=>({...c,candidateId:'beat-'+scene.order+'-take-'+(n+1)}));
   candidates.push({beat:scene.order,alternatives});
   choices.push({...one.choices[0],beat:scene.order,selectedCandidateId:alternatives[0].candidateId});
  }else{
   if(overlapsBlackInterval(0,src.durationSec,src.technicalQuality?.blackIntervals))fail('Чёрные кадры в визуальном дубле '+scene.order+'; требуется просмотр исходника.');
   if(!/^[a-f0-9]{64}$/.test(src.sha256??''))fail('Missing visual source SHA');
   const c={candidateId:'beat-'+scene.order+'-visual',beat:scene.order,sourceId:src.id,sourceSha256:src.sha256,startSec:0,durationSec:src.durationSec,evidenceType:'author-visual-take',transcript:'',reason:'Author assigned this complete visual take to this storyboard frame; no speech or acting verification claimed.'};
   candidates.push({beat:scene.order,alternatives:[c]});choices.push(c);
  }
 }
 return {mode:'strict',...(bindings?{takeBindings:bindings}:{}),candidates,choices,missingBeats:[]};
}
export function chooseForBrief(brief,sources){
 return createEditorialPlan(brief,sources).choices;
}
export function applyManualSelection(decisions,{beat,candidateId}={}){
 if(!Number.isSafeInteger(beat)||beat<1||typeof candidateId!=='string'||!candidateId)fail('Invalid editorial selection');
 const candidate=decisions?.candidates?.find(item=>item?.beat===beat)?.alternatives?.find(item=>item?.candidateId===candidateId);
 if(!candidate)fail('Unknown editorial candidate');
 const choices=(Array.isArray(decisions.choices)?decisions.choices:[]).filter(choice=>choice?.beat!==beat);
 choices.push(choiceFromAlternative(beat,candidate));choices.sort((a,b)=>a.beat-b.beat);
 return {...decisions,choices,missingBeats:(decisions.missingBeats??[]).filter(item=>item!==beat)};
}
async function transcribe(analysisArg,cliArg,modelArg,{sourceIds=null}={}){
  const analysisFile=resolve(analysisArg),analysis=await readJson(analysisFile),base=dirname(analysisFile);
  if(analysis?.kind!=='persona-evidence-v1'||!Array.isArray(analysis.sources))fail('Invalid evidence packet');
  const cli=resolve(cliArg),model=resolve(modelArg);
  const st=await stat(cli),stModel=await stat(model);
  if(!st.isFile()||!stModel.isFile()||stModel.size<1024*1024)fail('Local ASR executable or model unavailable');
  const completed=[];
  for(const source of analysis.sources){
    if(sourceIds&&!sourceIds.includes(source.id))continue;
    if(!source.hasAudio||!source.audioPath)fail('Offline dialogue ASR requires original audio: '+source.id);
    if(!/^[A-Za-z0-9_-]{1,48}$/.test(source.id))fail('Invalid source ID');
    const wav=sourcePath(base,source.audioPath);const output=join(base,source.id+'-whisper');
    await access(output+'.json').then(()=>fail('Whisper output already exists: '+output+'.json'),()=>{});
    await new Promise((ok,bad)=>{
      const child=spawn(cli,['-m',model,'-f',wav,'-l','auto','-ml','80','-sow','-ojf','-of',output],
        {shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
      let err='',done=false;
      const timer=setTimeout(()=>{if(!done){done=true;child.kill();bad(Error('Local ASR timed out'))}},10*60*1000);
      child.stderr.on('data',b=>{err=(err+b).slice(-2000)});
      child.on('error',e=>{if(!done){done=true;clearTimeout(timer);bad(e)}});
      child.on('close',c=>{if(!done){done=true;clearTimeout(timer);c===0?ok():bad(Error('Local ASR failed: '+err))}});
    });
    const outputData=await readJson(output+'.json');
    const parsed=parseWhisperJson(outputData,source.durationSec);
    completed.push({sourceId:source.id,segments:parsed.length,transcriptPath:output+'.json'});
  }
  return {status:'offline-asr-transcripts-written',results:completed,notice:'Transcriptions are model estimates, not proven verbatim words. Review before author approval.'};
}
async function plan(analysisArg,briefArg,decisionsArg,mode='strict',{takeBindings=null}={}){
  const analysisPath=resolve(analysisArg),briefPath=resolve(briefArg),out=resolve(decisionsArg);
  const analysis=await readJson(analysisPath),brief=await readJson(briefPath),base=dirname(analysisPath);
  if(analysis?.kind!=='persona-evidence-v1'||analysis.version!==1||!Array.isArray(analysis.sources)||analysis.sources.length<1)fail('Invalid analysis packet');
  if(brief?.version!==1||brief.sourceFormat!=='reel'||!Array.isArray(brief.script)||!Array.isArray(brief.shots)||brief.script.length!==brief.shots.length||brief.script.length<2)fail('Invalid Persona Reel brief');
  await access(out).then(()=>fail('Decision output already exists'),()=>{});
  const sources=[];
  for(const source of analysis.sources){
    if(!/^[A-Za-z0-9_-]{1,48}$/.test(source.id)||!valid(source.durationSec,0.1,MAX_PERSONA_SOURCE_SECONDS))fail('Invalid source metadata or source exceeds 15 minutes');
    const transcriptFile=join(base,source.id+'-whisper.json');
    const scene=brief.manualSource?.scenes.find(s=>new RegExp('^s'+String(s.order).padStart(2,'0')+'_t','i').test(source.id));
    const kind=takeBindings?.find(b=>b.sourceId===source.id)?.kind??scene?.kind;
    const transcript=kind==='visual'?null:await readJson(transcriptFile);
    sources.push({...source,segments:transcript?parseWhisperJson(transcript,source.durationSec):[]});
  }
  const editorial=brief.manualSource?createManualEditorialPlan(brief,sources,{takeBindings}):createEditorialPlan(brief,sources,{mode});
  const result={version:1,analysisPath,briefPath,...editorial};
  await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  return {decisions:out,choices:editorial.choices.length,missingBeats:editorial.missingBeats,totalSec:Number(editorial.choices.reduce((s,x)=>s+x.durationSec,0).toFixed(3)),review:'ASR-based cut proposal only. Acting, meaning in context, subtitles, color, sound and final author approval not verified.'};
}
export { transcribe,plan,overlap,similarity };
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  const [operation,a,b,c,mode]=process.argv.slice(2);
  if(operation==='transcribe'&&a&&b&&c)transcribe(a,b,c).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
  else if(operation==='plan'&&a&&b&&c)plan(a,b,c,mode??'strict').then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
  else {console.error('Usage: transcribe <analysis.json> <whisper-cli> <local-model.bin> | plan <analysis.json> <brief.json> <new-decisions.json> [strict|preview]');process.exitCode=2}
}
