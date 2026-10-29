#!/usr/bin/env node
/**
 * Read-only, draft-only captions for an approved Persona brief and a real
 * assembled timeline. Does NOT burn into video or claim word-level alignment.
 * No media uploads, video changes, external services, or publication.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fail=message=>{throw Error(message)};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const musicCue=shot=>/(?:после реплики|после слов|затем).{0,90}(?:музык|мелод|фортепиан|клавиш|пианино)/iu.test(String(shot?.action||''));

function safeCaptionText(text,maxChars=42){
 if(typeof text!=='string'||!text.trim())fail('Missing caption text');
 const clean=text.replace(/\s+/gu,' ').trim();
 if(/[\u0000-\u001f\u007f]/u.test(clean))fail('Unexpected control character in caption');
 const words=clean.split(' '),lines=[''];
 for(const word of words){
  if(word.length>maxChars)fail('Caption contains an unbreakable word longer than '+maxChars);
  const n=lines.length-1,next=lines[n]?(lines[n]+' '+word):word;
  if(next.length<=maxChars)lines[n]=next;
  else if(lines.length<2)lines.push(word);
  else fail('Caption exceeds two lines; revise the script before rendering');
 }
 return lines.join('\n');
}
function timecode(ms,vtt=false){
 if(!Number.isSafeInteger(ms)||ms<0)fail('Invalid subtitle timestamp');
 const hh=String(Math.floor(ms/3600000)).padStart(2,'0');
 const mm=String(Math.floor((ms%3600000)/60000)).padStart(2,'0');
 const ss=String(Math.floor((ms%60000)/1000)).padStart(2,'0');
 const milli=String(ms%1000).padStart(3,'0');
 return hh+':'+mm+':'+ss+(vtt?'.':',')+milli;
}
function timedWords(choice){
 if(!Array.isArray(choice?.captionWords)||!choice.captionWords.length)return null;
 const words=choice.captionWords.map(word=>({
  text:typeof word?.text==='string'?word.text.replace(/\s+/gu,' ').trim():'',
  startSec:word?.startSec,endSec:word?.endSec,timing:word?.timing
 }));
 if(words.some(word=>!word.text||!finite(word.startSec)||!finite(word.endSec)||word.endSec<=word.startSec))return null;
 return words;
}
function splitTimedWords(words){
 const groups=[],current=[];
 for(const word of words){
  const candidate=[...current,word];
  const pause=current.length?word.startSec-current[current.length-1].endSec:0;
  let fits=true;
  try{safeCaptionText(candidate.map(item=>item.text).join(' '));}catch{fits=false;}
  if(current.length&&(pause>=0.65||!fits)){groups.push(current.splice(0));}
  current.push(word);
 }
 if(current.length)groups.push(current);
 return groups;
}
function wordCues(words,choice,cursorSec,clipDurationSec,beat){
 const clipEnd=cursorSec+clipDurationSec;
 const groups=splitTimedWords(words);
 return groups.map((group,index)=>{
  const next=groups[index+1]?.[0];
  const startSec=cursorSec+Math.max(0,group[0].startSec-choice.startSec);
  let endSec=Math.min(clipEnd,cursorSec+Math.max(0,group[group.length-1].endSec-choice.startSec)+0.12);
  if(next){
   const nextStart=cursorSec+Math.max(0,next.startSec-choice.startSec);
   endSec=Math.min(endSec,Math.max(startSec+0.001,nextStart-0.02));
  }
  if(!(endSec>startSec))fail('Invalid Whisper caption timings at beat '+beat);
  return {beat,startMs:Math.round(startSec*1000),endMs:Math.round(endSec*1000),
   text:safeCaptionText(group.map(item=>item.text).join(' '))};
 });
}
export function buildSubtitleDraft(brief,timeline,decisions){
 if(brief?.version!==1||brief.sourceFormat!=='reel'||!Array.isArray(brief.script)||
   !Array.isArray(brief.shots)||brief.script.length!==brief.shots.length||
   !Array.isArray(timeline?.clips)||
   brief.script.length<2||brief.script.length>30)fail('Script and assembled clips must be aligned');
 if(timeline.version!==1)fail('Invalid timeline version');
 const mode=timeline.mode??'strict';
 if(!['strict','preview'].includes(mode))fail('Invalid timeline mode');
 if(mode==='strict'&&timeline.clips.length!==brief.script.length)fail('Script and assembled clips must be aligned');
 if(mode==='preview'&&(timeline.clips.length<1||timeline.clips.length>brief.script.length||!Array.isArray(timeline.missingBeats)))fail('Invalid preview timeline');
 let cursor=0;
 const cues=[],warnings=[],timingKinds=new Set();
 const choices=Array.isArray(decisions?.choices)?decisions.choices:null;
 if(choices&&mode==='strict'&&choices.length!==brief.script.length)fail('Subtitle decisions must align with script beats');
 const choicesByBeat=new Map((choices??[]).map(choice=>[choice?.beat,choice]));
 let previousBeat=0;
 for(let index=0;index<timeline.clips.length;index++){
  const clip=timeline.clips[index],beatNumber=mode==='preview'?clip?.beat:index+1;
  const script=brief.script[beatNumber-1],shot=brief.shots[beatNumber-1];
  if(!Number.isSafeInteger(beatNumber)||beatNumber<=previousBeat||beatNumber>brief.script.length||script?.order!==beatNumber||shot?.order!==beatNumber||
   !finite(clip?.durationSec)||clip.durationSec<0.25||clip.durationSec>60)
   fail('Invalid duration or scene order at beat '+beatNumber);
  previousBeat=beatNumber;
  const choice=choicesByBeat.get(beatNumber),words=timedWords(choice);
  if(words&&choice?.beat===beatNumber&&finite(choice.startSec)&&finite(choice.durationSec)){
   if(words.some(word=>word.startSec<choice.startSec-0.02||word.endSec>choice.startSec+choice.durationSec+0.02))
    fail('Whisper caption timing is outside selected clip at beat '+beatNumber);
   cues.push(...wordCues(words,choice,cursor,clip.durationSec,beatNumber));
   if(words.some(word=>word.timing!=='word')){
    timingKinds.add('segment');
    warnings.push('Beat '+beatNumber+': Whisper supplied only segment-level timing; verify every word before release.');
   }else timingKinds.add('word');
  }else if(musicCue(shot)){
   timingKinds.add('estimated');
   warnings.push('Beat '+beatNumber+': no usable Whisper timing. Subtitle end must be adjusted manually; caption omitted so it cannot remain on the post-speech music tail.');
  }else{
   timingKinds.add('estimated');
   if(choices)warnings.push('Beat '+beatNumber+': no usable Whisper timing; caption uses estimated clip boundaries and requires manual timing review.');
   const text=safeCaptionText(script.line);
   const startMs=Math.round(cursor*1000),endMs=Math.round((cursor+clip.durationSec)*1000);
   if(endMs<=startMs)fail('Non-positive caption duration');
   cues.push({beat:beatNumber,startMs,endMs,text});
  }
  cursor+=clip.durationSec;
 }
 if(!cues.length)fail('No safe subtitle cues could be created');
 for(let index=1;index<cues.length;index++)if(cues[index].startMs<cues[index-1].endMs)fail('Overlapping subtitle cues');
 const timing=timingKinds.size===1&&timingKinds.has('word')?'word-level-from-whisper-timestamps':
  timingKinds.size===1&&timingKinds.has('segment')?'segment-level-whisper-timestamps-needs-review':
  timingKinds.size===1&&timingKinds.has('estimated')?'estimated-from-assembled-shot-boundaries-not-word-level-speech':
  'mixed-whisper-and-estimated-needs-review';
 const srt=cues.map(c=>c.beat+'\n'+timecode(c.startMs)+' --> '+timecode(c.endMs)+'\n'+c.text+'\n').join('\n')+'\n';
 const vtt='WEBVTT\n\n'+cues.map(c=>timecode(c.startMs,true)+' --> '+timecode(c.endMs,true)+'\n'+c.text+'\n').join('\n')+'\n';
 return {
  srt,vtt,
  review:{version:1,kind:'persona-subtitle-draft-v1',status:'needs-human-review',
   captionTiming:timing,
   cues,totalTimelineSec:Number(cursor.toFixed(3)),missingBeats:mode==='preview'?timeline.missingBeats:[],
   warnings:[...warnings,
    'Verify exact word timing, punctuation, speaker changes, lip sync, and caption safe areas by watching the exported video.',
    'Scripted lines are NOT confirmed verbatim by these subtitles. No subtitles are burned into the MP4. No publication approval.']}
 };
}
export async function writeSubtitleDraft({briefPath,timelinePath,decisionsPath,outputDir}={}){
 if(![briefPath,timelinePath,outputDir].every(x=>typeof x==='string'&&x.trim()))fail('Provide brief, timeline, and existing new-output directory');
 const [brief,timeline,decisions]=await Promise.all([readFile(resolve(briefPath),'utf8').then(JSON.parse),readFile(resolve(timelinePath),'utf8').then(JSON.parse),decisionsPath?readFile(resolve(decisionsPath),'utf8').then(JSON.parse):null]);
 const draft=buildSubtitleDraft(brief,timeline,decisions),root=resolve(outputDir);
 const files=[['captions.draft.srt',draft.srt],['captions.draft.vtt',draft.vtt],
  ['captions.review.json',JSON.stringify(draft.review,null,2)+'\n']];
 // Never silently overwrite existing authored captions or final subtitles.
 for(const [filename,content] of files)await writeFile(join(root,filename),content,{flag:'wx'});
 return {srtPath:join(root,files[0][0]),vttPath:join(root,files[1][0]),
  reviewPath:join(root,files[2][0]),cues:draft.review.cues.length,status:'needs-human-review'};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [briefPath,timelinePath,outputDir,decisionsPath]=process.argv.slice(2);
 writeSubtitleDraft({briefPath,timelinePath,outputDir,decisionsPath}).then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(e=>{console.error('Persona caption draft:',e.message);process.exitCode=1});
}
