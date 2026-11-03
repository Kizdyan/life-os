#!/usr/bin/env node
/**
 * Persona Local-First Asset Library (no cloud dependency, no source mutation).
 * scan: indexes user-provided directory and extracts REAL ffprobe metadata +
 *       FFmpeg frame thumbnails. Optional local Ollama VISION describes frames.
 * search: returns actual source paths and time-coded matches, with provenance.
 * Explicit filename / user annotations are searchable without an AI vision model,
 * but must NEVER be described as automated visual understanding.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readdir,readFile,realpath,rename,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const VIDEO=new Set(['.mp4','.mov','.mkv','.m4v','.webm']);
const IMAGE=new Set(['.jpg','.jpeg','.png','.webp']);
const AUDIO=new Set(['.mp3','.wav','.m4a','.flac','.aac']);
const INDEX='persona-assets-v1.json';
const fail=m=>{throw Error('Persona library: '+m)};
const typeOf=file=>{const ext=extname(file).toLowerCase();
 return VIDEO.has(ext)?'video':IMAGE.has(ext)?'image':AUDIO.has(ext)?'audio':null};
const safeNum=(value,min=0,max=Infinity)=>Number.isFinite(value)&&value>=min&&value<=max;
const inside=(root,file)=>{const r=relative(root,file);
 return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r))};
function command(bin,args,timeout=90000){
 return new Promise((ok,bad)=>{
  const p=spawn(bin,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;p.kill();bad(Error(bin+' timed out'))}},timeout);
  p.stdout.on('data',b=>{out+=b;if(out.length>1500000){p.kill();}});
  p.stderr.on('data',b=>{err=(err+b).slice(-2500)});
  p.on('error',e=>{if(!done){done=true;clearTimeout(timer);bad(e)}});
  p.on('close',code=>{if(done)return;done=true;clearTimeout(timer);
   code===0?ok(out):bad(Error(bin+' failed: '+err))});
 });
}
async function hash(path){const h=createHash('sha256');
 for await(const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex')}
function numFrameRate(fr){if(typeof fr!=='string')return null;
 const [a,b='1']=fr.split('/').map(Number);return a>=0&&b>0&&Number.isFinite(a/b)?a/b:null}
async function probe(path,kind,{ffprobe='ffprobe'}={}){
 const raw=JSON.parse(await command(ffprobe,['-v','error','-show_entries',
  'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate','-of','json',path]));
 const stream=raw.streams?.find(s=>s.codec_type===(kind==='audio'?'audio':'video'));
 if(!stream)fail('No valid '+kind+' stream: '+basename(path));
 const duration=Number(raw.format?.duration);
 const d=safeNum(duration,0,86400)?duration:null;
 return {durationSec:kind==='image'?null:d,codec:stream.codec_name??null,
  width:kind==='audio'?null:stream.width??null,height:kind==='audio'?null:stream.height??null,
  fps:kind==='video'?numFrameRate(stream.avg_frame_rate):null};
}
function sampleTimes(kind,duration){
 if(kind==='image')return [0];
 if(kind==='video'&&safeNum(duration,.2,86400)){
  const points=duration<1.5?[duration/2]:[duration*.12,duration*.5,duration*.88];
  return [...new Set(points.map(t=>Math.max(0,Math.min(duration-.1,t)).toFixed(2)))].map(Number);
 }
 return [];
}
async function thumbnail(path,target,time,kind,{ffmpeg='ffmpeg'}={}){
 const args=['-hide_banner','-loglevel','error','-nostdin','-y'];
 if(kind==='video')args.push('-ss',String(time));
 args.push('-i',path,'-vf','scale=480:-2','-frames:v','1',target);
 await command(ffmpeg,args,60000);
 const s=await stat(target);
 if(s.size<100)fail('Generated thumbnail is empty');
}
function noteString(value){return typeof value==='string'?value.trim().slice(0,1200):''}
function tags(value){return Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.trim())
  .slice(0,30).map(x=>x.trim().slice(0,70)):[]}
function validSegments(input,duration){
 if(!Array.isArray(input))return [];
 return input.slice(0,40).map((item)=>{
  if(!item||typeof item!=='object'||!safeNum(item.startSec,0)||!safeNum(item.endSec,item.startSec+0.01)||
   duration!==null&&item.endSec>duration+.2)fail('Invalid manual segment bounds');
  return {startSec:item.startSec,endSec:item.endSec,description:noteString(item.description),
   tags:tags(item.tags),source:'author_annotation'};
 });
}
async function manualNote(path,duration){
 try{
  const data=JSON.parse(await readFile(path+'.persona.json','utf8'));
  if(!data||typeof data!=='object'||Array.isArray(data))fail('Invalid annotation JSON');
  return {description:noteString(data.description),tags:tags(data.tags),
   segments:validSegments(data.segments,duration)};
 }catch(e){if(e?.code==='ENOENT')return {description:'',tags:[],segments:[]};throw e}
}
const origin=(url)=>{
 let parsed;try{parsed=new URL(url)}catch{fail('Invalid Ollama URL')}
 if(parsed.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||
   parsed.username||parsed.password||parsed.search||parsed.hash||
   parsed.pathname!=='/'&&parsed.pathname!=='')fail('Vision must run on local loopback HTTP');
 return parsed.origin;
};
export async function describeFrameVision(imagePath,{visionModel,ollamaUrl='http://127.0.0.1:11434',
 fetchImpl=fetch}={}){
 if(typeof visionModel!=='string'||!visionModel.trim()||visionModel.length>120)
  fail('Explicit local vision model required');
 const base=origin(ollamaUrl);
 const image=(await readFile(imagePath)).toString('base64');
 const response=await fetchImpl(base+'/api/chat',{method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({model:visionModel,stream:false,format:'json',messages:[
   {role:'system',content:'Describe only objects actually visible in this SINGLE frame, in Russian. No speculation about offscreen events, identity, mood or camera motion. Return JSON {"description":"...","tags":["..."]}. Be concise.'},
   {role:'user',content:'Что объективно видно в этом кадре?',images:[image]},
  ]}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)fail('Local vision model HTTP '+response.status);
 const data=await response.json();let result;
 try{result=JSON.parse(data?.message?.content)}catch{fail('Vision model returned invalid JSON')}
 if(!result||!noteString(result.description)||!Array.isArray(result.tags))
  fail('Vision model returned incomplete description');
 return {description:noteString(result.description),tags:tags(result.tags),
  source:'local_vision_model',model:visionModel};
}
async function walk(root,maxFiles){
 const files=[],folders=[root];let visited=0;
 while(folders.length){
  const folder=folders.pop();const entries=await readdir(folder,{withFileTypes:true});
  for(const entry of entries){
   // Never follow symlinks or junctions, and never crawl hidden/system folders.
   if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
   const path=join(folder,entry.name);
   if(entry.isDirectory()){if(++visited>2000)fail('Too many nested folders');folders.push(path)}
   else if(entry.isFile()&&typeOf(entry.name)){
    files.push(path);if(files.length>maxFiles)fail('Too many assets in one scan');
   }
  }
 }
 return files.sort((a,b)=>a.localeCompare(b,'en'));
}
function cleanEntry(record){return record&&typeof record==='object'&&
 typeof record.id==='string'&&typeof record.sourcePath==='string'&&
 typeof record.sha256==='string'&&Array.isArray(record.frames)}
export function tokenize(text){return (String(text??'').toLocaleLowerCase('ru-RU')
 .match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>1)}
export function searchCatalog(catalog,query,{limit=12}={}){
 if(!catalog||catalog.kind!=='persona-local-library-v1'||!Array.isArray(catalog.assets))
  fail('Invalid library catalog');
 const terms=tokenize(query);if(!terms.length)fail('Provide meaningful search terms');
 return catalog.assets.filter(a=>a.availability==='local').flatMap(a=>{
  const candidates=[
   {startSec:null,endSec:null,description:a.annotation?.description||'',
    tags:a.annotation?.tags||[],source:'author_annotation'},
   ...(a.annotation?.segments||[]),
   ...(a.frames||[]).filter(x=>x.description).map(f=>({
    startSec:f.timeSec,endSec:Math.min(a.metadata?.durationSec??(f.timeSec+1),f.timeSec+2),
    description:f.description,tags:f.tags,source:f.source,model:f.model,
   })),
  ];
  const filename=basename(a.sourcePath).replace(/[-_.]/g,' ');
  const rows=candidates.map(c=>{
   const annotation=tokenize([filename,c.description,...c.tags].join(' '));
   const overlaps=terms.filter(t=>annotation.some(word=>word===t||word.startsWith(t)||t.startsWith(word)&&word.length>3));
   return {...c,overlaps,score:overlaps.length};
  }).filter(x=>x.score>0);
  // Filename matches are real metadata matches, NOT visual recognitions.
  if(!rows.length&&terms.some(t=>tokenize(filename).some(w=>w.includes(t))))
   rows.push({startSec:null,endSec:null,source:'filename',score:1,overlaps:terms});
  return rows.map(({score,overlaps,...row})=>({
   assetId:a.id,sourcePath:a.sourcePath,sha256:a.sha256,kind:a.kind,
   ...row,score,matchedTerms:overlaps,
  }));
 }).sort((a,b)=>b.score-a.score||
  Number(b.startSec!==null)-Number(a.startSec!==null)||
  a.sourcePath.localeCompare(b.sourcePath)||(a.startSec??0)-(b.startSec??0))
  .slice(0,Math.max(1,Math.min(100,limit)));
}
export async function scanLibrary({
 inbox,catalogDir,visionModel,ollamaUrl,ffmpeg='ffmpeg',ffprobe='ffprobe',
 maxFiles=500,fetchImpl=fetch,
}={}){
 if(typeof inbox!=='string'||!inbox.trim()||typeof catalogDir!=='string'||!catalogDir.trim())
  fail('Select inbox and separate catalog directory');
 const root=await realpath(resolve(inbox));if(!(await stat(root)).isDirectory())fail('Inbox must be directory');
 const out=resolve(catalogDir);
 if(inside(root,out))fail('Catalog must not be inside inbox (no self-indexing)');
 if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>5000)fail('Invalid maxFiles');
 const assets=await walk(root,maxFiles);const indexPath=join(out,INDEX);
 let previous={kind:'persona-local-library-v1',assets:[]};
 try{previous=JSON.parse(await readFile(indexPath,'utf8'))}
 catch(e){if(e?.code!=='ENOENT')throw e}
 if(previous.kind!=='persona-local-library-v1'||!Array.isArray(previous.assets))fail('Invalid prior index');
 const byPath=new Map(previous.assets.filter(cleanEntry).map(a=>[a.sourcePath,a]));
 const updated=[],errors=[];
 await mkdir(join(out,'thumbnails'),{recursive:true});
 for(const file of assets){
  try{
   const truePath=await realpath(file);
   if(!inside(root,truePath))fail('Source escapes selected directory');
   const st=await stat(truePath);if(!st.isFile()||st.size>16*1024**3||st.size<1)fail('Unusable asset size');
   const old=byPath.get(truePath);
   // Watch mode must not re-hash gigabytes of footage every 30 seconds.
   const sha=old?.bytes===st.size&&old.mtimeMs===st.mtimeMs&&
    /^[a-f0-9]{64}$/i.test(old.sha256)?old.sha256:await hash(truePath);
   const kind=typeOf(truePath);
   const meta=old?.sha256===sha&&old.metadata?old.metadata:await probe(truePath,kind,{ffprobe});
   const manual=await manualNote(truePath,meta.durationSec);
   const frames=[];
   for(const [i,time] of sampleTimes(kind,meta.durationSec).entries()){
    const name=sha.slice(0,24)+'-'+kind+'-'+i+'.jpg';
    const target=join(out,'thumbnails',name);
    const prev=old?.frames?.find(f=>f.timeSec===time&&f.thumbnail===name);
    let existing=true;try{await stat(target)}catch{existing=false}
    if(!existing)await thumbnail(truePath,target,time,kind,{ffmpeg});
    let detected={description:prev?.description??'',tags:prev?.tags??[],
      source:prev?.source??'none',model:prev?.model??null};
    if(visionModel&&(!prev||prev.source!=='local_vision_model'||prev.model!==visionModel)){
     detected=await describeFrameVision(target,{visionModel,ollamaUrl,fetchImpl});
    }
    frames.push({timeSec:time,thumbnail:name,...detected});
   }
   updated.push({id:'sha256:'+sha,sourcePath:truePath,sha256:sha,kind,
    bytes:st.size,mtimeMs:st.mtimeMs,metadata:meta,annotation:manual,frames,
    availability:'local',checkedAt:new Date().toISOString()});
  }catch(e){errors.push({file:basename(file),error:String(e?.message??e).slice(0,300)});
   const old=byPath.get(file);if(old)updated.push({...old,availability:'error'});
  }
 }
 const found=new Set(updated.map(a=>a.sourcePath));
 for(const old of previous.assets.filter(cleanEntry)){
  if(!found.has(old.sourcePath))updated.push({...old,availability:'missing'});
 }
 const index={version:1,kind:'persona-local-library-v1',
  generatedAt:new Date().toISOString(),root,assets:updated,
  limitations:{visionModel:visionModel??null,
   note:'Without a local vision model, only filename and author annotations are searchable; thumbnails alone are NOT automatic image recognition.'}};
 const tmp=indexPath+'.new-'+process.pid;
 await writeFile(tmp,JSON.stringify(index,null,2)+'\n',{flag:'wx'});
 await rename(tmp,indexPath);
 return {index:indexPath,filesSeen:assets.length,available:updated.filter(a=>a.availability==='local').length,
  visualDescriptions:updated.reduce((sum,a)=>sum+a.frames.filter(f=>f.source==='local_vision_model').length,0),
  errors,visionModel:visionModel??null};
}
const usage=[
 'Usage:',
 '  npm run persona:library -- scan "<INBOX>" "<CATALOG>" [--vision-model qwen2.5vl:3b] [--ollama-url http://127.0.0.1:11434]',
 '  npm run persona:library -- search "<CATALOG>" "<QUERY>"',
 '  npm run persona:library -- watch "<INBOX>" "<CATALOG>" [--vision-model qwen2.5vl:3b] [--ollama-url http://127.0.0.1:11434]',
].join('\n');
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [cmd,...args]=process.argv.slice(2);
 try{
  if(cmd==='search'){
   if(args.length!==2)fail(usage);
   const data=JSON.parse(await readFile(join(resolve(args[0]),INDEX),'utf8'));
   process.stdout.write(JSON.stringify(searchCatalog(data,args[1]),null,2)+'\n');
  }else if(cmd==='scan'||cmd==='watch'){
   if(args.length<2)fail(usage);
   const [inbox,catalogDir,...rest]=args;const options={inbox,catalogDir};
   if(rest.length%2)fail(usage);
   for(let i=0;i<rest.length;i+=2){
    if(rest[i]==='--vision-model')options.visionModel=rest[i+1];
    else if(rest[i]==='--ollama-url')options.ollamaUrl=rest[i+1];
    else fail('Unknown argument '+rest[i]);
   }
   if(cmd==='scan')process.stdout.write(JSON.stringify(await scanLibrary(options),null,2)+'\n');
   else{
    process.stdout.write('Persona media library watching selected inbox. Stop with Ctrl+C.\n');
    let stopped=false;process.on('SIGINT',()=>{stopped=true});
    while(!stopped){
     try{process.stdout.write(JSON.stringify(await scanLibrary(options))+'\n')}
     catch(e){process.stderr.write('Scan failed: '+String(e?.message??e)+'\n')}
     await new Promise(resolveWait=>setTimeout(resolveWait,30000));
    }
   }
  }else fail(usage);
 }catch(e){process.stderr.write(String(e?.message??e)+'\n');process.exitCode=1}
}
