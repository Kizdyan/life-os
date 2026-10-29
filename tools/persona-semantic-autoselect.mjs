#!/usr/bin/env node
/**
 * Persona local speech-aware cut planner: opt-in offline whisper.cpp ASR, then
 * script-to-timed-speech matching. The existing semantic-montage assemble step
 * must still verify hashes/bounds; a human must still review the completed MP4.
 * Commands:
 *  transcribe <evidence/analysis.json> <whisper-cli binary> <model.bin>
 *  plan <evidence/analysis.json> <PersonaProductionBrief.json> <new-decisions.json>
 */
import { spawn } from 'node:child_process';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    const tokens=Array.isArray(seg.tokens)&&seg.tokens.length?seg.tokens:[seg];
    for(const token of tokens){
      if(!token?.offsets||typeof token.text!=='string')continue;
      const start=ms(token.offsets.from),end=ms(token.offsets.to);
      if(!valid(start,0,durationSec)||!valid(end,start,durationSec+0.1))fail('ASR time offsets outside source');
      const text=token.text.trim();
      if(text&&!/^\[[^\]]+\]$/.test(text)&&end>start)raw.push({startSec:start,endSec:end,text});
    }
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
      const {text,coverage,f1,score}=modelScore(line,segments,i,j);
      if(coverage<0.75||f1<0.57)continue;
      const startSec=Math.max(0,segments[i].startSec-0.16);
      const endSec=segments[j-1].endSec+0.18;
      results.push({sourceId,startSec,endSec,coverage,f1,score,transcript:text});
    }
  }
  return results.sort((a,b)=>b.score-a.score).slice(0,6);
}
function intersects(a,b){return a.sourceId===b.sourceId && Math.min(a.endSec,b.endSec)-Math.max(a.startSec,b.startSec)>0.1}
export function chooseForBrief(brief,sources){
  const choices=[],warnings=[];
  for(const [index,beat] of brief.script.entries()){
    const options=sources.flatMap(src=>rankDialogueCandidates(beat.line,src.id,src.segments)
      .filter(x=>x.endSec<=src.durationSec+0.02));
    const available=options.filter(x=>!choices.some(prev=>intersects(prev,x))).sort((a,b)=>b.score-a.score);
    if(!available.length){warnings.push('No confidently matched timed speech for beat '+(index+1)+': '+beat.line);continue}
    const pick=available[0],confidence=Number(Math.min(0.94,Math.max(0.65,pick.score)).toFixed(3));
    const startSec=Number(pick.startSec.toFixed(3));
    const durationSec=Number((pick.endSec-pick.startSec).toFixed(3));
    if(!valid(durationSec,0.25,60)||confidence<0.75){warnings.push('Ambiguous timing or confidence for beat '+(index+1));continue}
    choices.push({beat:index+1,sourceId:pick.sourceId,startSec,durationSec,
      transcript:pick.transcript,confidence,
      reason:'Offline ASR matched '+Math.round(pick.coverage*100)+'% of scripted tokens (F1='+pick.f1.toFixed(2)+'); visual and performance quality NOT assessed.'});
  }
  if(warnings.length||choices.length!==brief.script.length)fail('Manual review required: '+warnings.join('; '));
  return choices;
}
async function transcribe(analysisArg,cliArg,modelArg){
  const analysisFile=resolve(analysisArg),analysis=await readJson(analysisFile),base=dirname(analysisFile);
  if(analysis?.kind!=='persona-evidence-v1'||!Array.isArray(analysis.sources))fail('Invalid evidence packet');
  const cli=resolve(cliArg),model=resolve(modelArg);
  const st=await stat(cli),stModel=await stat(model);
  if(!st.isFile()||!stModel.isFile()||stModel.size<1024*1024)fail('Local ASR executable or model unavailable');
  const completed=[];
  for(const source of analysis.sources){
    if(!source.hasAudio||!source.audioPath)fail('Offline dialogue ASR requires original audio: '+source.id);
    if(!/^[A-Za-z0-9_-]{1,48}$/.test(source.id))fail('Invalid source ID');
    const wav=sourcePath(base,source.audioPath);const output=join(base,source.id+'-whisper');
    await access(output+'.json').then(()=>fail('Whisper output already exists: '+output+'.json'),()=>{});
    await new Promise((ok,bad)=>{
      const child=spawn(cli,['-m',model,'-f',wav,'-l','auto','-ml','1','-ojf','-of',output],
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
async function plan(analysisArg,briefArg,decisionsArg){
  const analysisPath=resolve(analysisArg),briefPath=resolve(briefArg),out=resolve(decisionsArg);
  const analysis=await readJson(analysisPath),brief=await readJson(briefPath),base=dirname(analysisPath);
  if(analysis?.kind!=='persona-evidence-v1'||analysis.version!==1||!Array.isArray(analysis.sources)||analysis.sources.length<2)fail('Invalid analysis packet');
  if(brief?.version!==1||brief.sourceFormat!=='reel'||!Array.isArray(brief.script)||!Array.isArray(brief.shots)||brief.script.length!==brief.shots.length||brief.script.length<2)fail('Invalid Persona Reel brief');
  await access(out).then(()=>fail('Decision output already exists'),()=>{});
  const sources=[];
  for(const source of analysis.sources){
    if(!/^[A-Za-z0-9_-]{1,48}$/.test(source.id)||!valid(source.durationSec,0.1,180))fail('Invalid source metadata');
    const transcriptFile=join(base,source.id+'-whisper.json');
    const transcript=await readJson(transcriptFile);
    sources.push({id:source.id,durationSec:source.durationSec,segments:parseWhisperJson(transcript,source.durationSec)});
  }
  const choices=chooseForBrief(brief,sources);
  const result={version:1,analysisPath,briefPath,choices};
  await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  return {decisions:out,choices:choices.length,totalSec:Number(choices.reduce((s,x)=>s+x.durationSec,0).toFixed(3)),review:'ASR-based cut proposal only. Acting, meaning in context, subtitles, color, sound and final author approval not verified.'};
}
export { transcribe,plan,overlap,similarity };
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  const [operation,a,b,c]=process.argv.slice(2);
  if(operation==='transcribe'&&a&&b&&c)transcribe(a,b,c).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
  else if(operation==='plan'&&a&&b&&c)plan(a,b,c).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
  else {console.error('Usage: transcribe <analysis.json> <whisper-cli> <local-model.bin> | plan <analysis.json> <brief.json> <new-decisions.json>');process.exitCode=2}
}
