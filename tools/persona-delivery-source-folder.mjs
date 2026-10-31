#!/usr/bin/env node
/** Build a safe, exact local Persona source manifest from ONE explicitly named folder.
 * No recursive scan, no cloud, no file modification, no implicit editorial approval.
 * node tools/persona-delivery-source-folder.mjs <selected-video-folder> <new-output-folder>
 */
import {mkdir,readdir,realpath,writeFile} from 'node:fs/promises';
import {dirname,resolve,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ids=['A01','B01','A02','B02','A03','B03','A04'];
const ext=/\.(mp4|mov|mkv|webm|m4v)$/i;
const fail=message=>{throw Error('Persona folder intake: '+message)};

export function classifyFiles(filenames){
 if(!Array.isArray(filenames)||!filenames.length||filenames.length>42||
    filenames.some(x=>typeof x!=='string'||x.includes('/')||x.includes('\\')||!ext.test(x)))
  fail('expected 1–42 plainly named video files in a selected folder');
 const mapped=filenames.map(name=>{
  const match=/^(A01|B01|A02|B02|A03|B03|A04)(?:_[A-Za-z0-9_-]+)?_take([0-9]{2})\.(?:mp4|mov|mkv|webm|m4v)$/i.exec(name);
  return match?{id:match[1].toUpperCase()+'_take'+match[2],beat:match[1].toUpperCase(),file:name}:null;
 });
 if(mapped.every(Boolean)){
  const unique=new Set(mapped.map(x=>x.id));
  if(unique.size!==mapped.length)fail('ambiguous duplicate take number for the same scene');
  if(ids.some(id=>!mapped.some(item=>item.beat===id)))
   fail('missing required scene: provide seven labelled files or exactly two role recordings');
  mapped.sort((a,b)=>ids.indexOf(a.beat)-ids.indexOf(b.beat)||a.id.localeCompare(b.id));
  // Underlying Media Engine accepts at most 12 source clips. Always prepare
  // exactly 7 explicit defaults, never silently infer which take is best.
  // Other takes remain untouched, visible as alternatives in intake-report.json.
  const selected=ids.map(beat=>mapped.find(item=>item.beat===beat));
  const chosen=new Set(selected.map(item=>item.id));
  const alternatives=mapped.filter(item=>!chosen.has(item.id)).map(({id,file})=>({id,file}));
  return {layout:'scene-takes',files:selected.map(({id,file})=>({id,file})),alternatives,
    note:'The lowest-numbered take per scene is an UNREVIEWED default, not an acting-quality ranking. Alternates are listed for optional review.'};
 }
 if(filenames.length===2){
  const roles=filenames.map(name=>{
   const m=/^(actor|composer)[_-](?:long|full|all)(?:_[A-Za-z0-9_-]+)?\.(?:mp4|mov|mkv|webm|m4v)$/i.exec(name);
   return m?{id:m[1].toLowerCase()+'_long',file:name}:null;
  });
  if(roles.every(Boolean)&&new Set(roles.map(x=>x.id)).size===2){
   roles.sort((a,b)=>a.id.localeCompare(b.id));
   return {layout:'two-long-roles',files:roles,
    note:'Two long sources only: NO beat assignments. Existing local Whisper/ASR must identify all seven exact lines, or request manual review.'};
  }
 }
 fail('ambiguous names: use A01_actor_hook_take01.mp4 … A04_actor_payoff_take01.mp4, or actor_long.mp4 + composer_long.mp4');
}
export async function makeManifest({sourceFolder,outputFolder,listing=readdir}={}){
 if(typeof sourceFolder!=='string'||!sourceFolder.trim()||typeof outputFolder!=='string'||!outputFolder.trim())
  fail('usage: node tools/persona-delivery-source-folder.mjs <selected-video-folder> <new-output-folder>');
 const source=await realpath(resolve(sourceFolder)),output=resolve(outputFolder);
 const childPath=relative(source,output);
 if(childPath===''||(childPath!=='..'&&!childPath.startsWith('..'+sep)&&!isAbsolute(childPath)))
  fail('output directory must be outside the selected source folder');
 const entries=await listing(source,{withFileTypes:true});
 if(!Array.isArray(entries)||entries.length>500)fail('unexpected or oversized selected folder');
 const names=entries.filter(item=>item.isFile()&&ext.test(item.name)).map(item=>item.name);
 const mapping=classifyFiles(names);
 const manifest={version:1,sources:mapping.files.map(item=>({id:item.id,path:join(source,item.file)}))};
 // Create the parent's missing directories, never overwrite the selected output.
 await mkdir(dirname(output),{recursive:true});
 await mkdir(output,{recursive:false});
 await writeFile(join(output,'sources.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const report={kind:'persona-selected-folder-intake-v1',status:'filenames-only-unverified',
  layout:mapping.layout,sourceCount:manifest.sources.length,
  alternateTakes:mapping.alternatives??[],
  origin:'explicitly-selected-one-folder',recursiveScan:false,
  autoApproval:false,sourceOriginalsModified:false,notes:[
   mapping.note,
   'No FFprobe, speech transcription, acting analysis or creative approval was performed.',
   'Use sources.json with the existing media:first-reel:draft pipeline for local ASR and technical QA.'
  ]};
 await writeFile(join(output,'intake-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return {manifest:join(output,'sources.json'),report:join(output,'intake-report.json'),
  layout:mapping.layout};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 makeManifest({sourceFolder:process.argv[2],outputFolder:process.argv[3]})
  .then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(e=>{console.error(e.message);process.exitCode=1});
