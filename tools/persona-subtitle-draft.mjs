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
export function buildSubtitleDraft(brief,timeline){
 if(brief?.version!==1||brief.sourceFormat!=='reel'||!Array.isArray(brief.script)||
   !Array.isArray(brief.shots)||brief.script.length!==brief.shots.length||
   !Array.isArray(timeline?.clips)||timeline.clips.length!==brief.script.length||
   brief.script.length<2||brief.script.length>30)fail('Script and assembled clips must be aligned');
 if(timeline.version!==1)fail('Invalid timeline version');
 let cursor=0;
 const cues=[],warnings=[];
 for(let index=0;index<brief.script.length;index++){
  const script=brief.script[index],shot=brief.shots[index],clip=timeline.clips[index];
  if(script?.order!==index+1||shot?.order!==index+1||
   !finite(clip?.durationSec)||clip.durationSec<0.25||clip.durationSec>60)
   fail('Invalid duration or scene order at beat '+(index+1));
  const text=safeCaptionText(script.line);
  const startMs=Math.round(cursor*1000),endMs=Math.round((cursor+clip.durationSec)*1000);
  if(endMs<=startMs)fail('Non-positive caption duration');
  cues.push({beat:index+1,startMs,endMs,text});
  if(musicCue(shot))warnings.push('Beat '+(index+1)+': music follows the spoken line. Subtitle end must be adjusted to actual speech timing before release.');
  cursor+=clip.durationSec;
 }
 const srt=cues.map(c=>c.beat+'\n'+timecode(c.startMs)+' --> '+timecode(c.endMs)+'\n'+c.text+'\n').join('\n')+'\n';
 const vtt='WEBVTT\n\n'+cues.map(c=>timecode(c.startMs,true)+' --> '+timecode(c.endMs,true)+'\n'+c.text+'\n').join('\n')+'\n';
 return {
  srt,vtt,
  review:{version:1,kind:'persona-subtitle-draft-v1',status:'needs-human-review',
   captionTiming:'estimated-from-assembled-shot-boundaries-not-word-level-speech',
   cues,totalTimelineSec:Number(cursor.toFixed(3)),
   warnings:[...warnings,
    'Verify exact word timing, punctuation, speaker changes, lip sync, and caption safe areas by watching the exported video.',
    'Scripted lines are NOT confirmed verbatim by these subtitles. No subtitles are burned into the MP4. No publication approval.']}
 };
}
export async function writeSubtitleDraft({briefPath,timelinePath,outputDir}={}){
 if(![briefPath,timelinePath,outputDir].every(x=>typeof x==='string'&&x.trim()))fail('Provide brief, timeline, and existing new-output directory');
 const [brief,timeline]=await Promise.all([readFile(resolve(briefPath),'utf8').then(JSON.parse),readFile(resolve(timelinePath),'utf8').then(JSON.parse)]);
 const draft=buildSubtitleDraft(brief,timeline),root=resolve(outputDir);
 const files=[['captions.draft.srt',draft.srt],['captions.draft.vtt',draft.vtt],
  ['captions.review.json',JSON.stringify(draft.review,null,2)+'\n']];
 // Never silently overwrite existing authored captions or final subtitles.
 for(const [filename,content] of files)await writeFile(join(root,filename),content,{flag:'wx'});
 return {srtPath:join(root,files[0][0]),vttPath:join(root,files[1][0]),
  reviewPath:join(root,files[2][0]),cues:draft.review.cues.length,status:'needs-human-review'};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [briefPath,timelinePath,outputDir]=process.argv.slice(2);
 writeSubtitleDraft({briefPath,timelinePath,outputDir}).then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(e=>{console.error('Persona caption draft:',e.message);process.exitCode=1});
}
