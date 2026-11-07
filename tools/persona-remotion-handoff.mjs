#!/usr/bin/env node
/**
 * Persona -> Remotion handoff, opt-in and dependency-free.
 * Converts an approved local timeline into a deterministic composition contract.
 * No package installation, network, render, upload, or modification of originals.
 */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,extname,relative,isAbsolute,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const extensions=new Set(['.mp4','.mov','.mkv','.webm','.m4v']);
const number=(n,min,max,label)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('Invalid '+label);return n};
export function compileRemotionHandoff(project,{fps=30,width=1080,height=1920}={}){
 if(project?.version!==1||!Array.isArray(project.clips)||!project.clips.length||project.clips.length>200)throw Error('Invalid timeline');
 if(!Number.isInteger(fps)||fps<24||fps>60||!Number.isInteger(width)||!Number.isInteger(height)||width<320||height<320||width>4096||height>4096)throw Error('Invalid composition');
 let frame=0;
 const clips=project.clips.map((clip,index)=>{
  if(typeof clip?.path!=='string'||!clip.path.trim()||!extensions.has(extname(clip.path).toLowerCase()))throw Error('Invalid clip path');
  const start=number(clip.startSec,0,86400,'clip start');
  const duration=number(clip.durationSec,0.001,3600,'clip duration');
  const frames=Math.round(duration*fps);
  if(frames<1)throw Error('Clip too short for frame rate');
  const entry={index,source:clip.path,sourceStartFrame:Math.round(start*fps),fromFrame:frame,durationInFrames:frames};
  frame+=frames;
  return entry;
 });
 if(frame>fps*3600)throw Error('Timeline exceeds one hour');
 return {schemaVersion:1,kind:'PERSONA_REMOTION_HANDOFF',composition:{id:'PersonaVertical',fps,width,height,durationInFrames:frame},clips,
  status:'HANDOFF_ONLY',requiresMediaReview:true,requiresRightsReview:true,rendered:false,publicationApproved:false};
}
export async function exportRemotionHandoff({input,output,fps=30,width=1080,height=1920}={}){
 const source=resolve(input),out=resolve(output);
 const raw=await readFile(source,'utf8');
 if(Buffer.byteLength(raw)>1_000_000)throw Error('Oversized timeline');
 const project=JSON.parse(raw);
 const handoff=compileRemotionHandoff(project,{fps,width,height});
 const base=dirname(source);
 for(const clip of handoff.clips){
  const absolute=resolve(base,clip.source);
  const relativePath=relative(base,absolute);
  if(relativePath==='..'||relativePath.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(relativePath))throw Error('Clip outside timeline directory');
  const info=await stat(absolute);
  if(!info.isFile()||info.size===0)throw Error('Missing or empty clip');
  clip.source=relativePath.replaceAll('\\','/');
 }
 handoff.timelineSha256=createHash('sha256').update(raw).digest('hex');
 await mkdir(out);
 await writeFile(join(out,'remotion-handoff.json'),JSON.stringify(handoff,null,2)+'\n',{flag:'wx'});
 return handoff;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};
 const input=flag('--input'),output=flag('--output');
 if(!input||!output){console.error('Usage: node tools/persona-remotion-handoff.mjs --input timeline.json --output NEW_DIRECTORY');process.exitCode=2}
 else exportRemotionHandoff({input,output}).then(x=>console.log(JSON.stringify({frames:x.composition.durationInFrames,output}))).catch(e=>{console.error(e.message);process.exitCode=1});
}
