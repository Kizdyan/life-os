#!/usr/bin/env node
/**
 * Read-only Yandex Disk adapter for Persona's existing local-first library.
 * Public folder URL stays in local configuration/environment, never in Git.
 * No upload, deletion, publication or source mutation.
 * Usage: node tools/persona-yandex-library.mjs "<local-cache>" [--scan] [--vision-model MODEL]
 * Set PERSONA_YANDEX_PUBLIC_URL locally first.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, basename, extname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { scanLibrary } from './persona-local-library.mjs';

const API='https://cloud-api.yandex.net/v1/disk/public/resources';
export const FOLDERS=['Личные материалы','Банк референсов'];
const MEDIA=new Set(['.jpg','.jpeg','.png','.webp','.mp4','.mov','.mkv','.m4v','.webm','.mp3','.wav','.m4a','.flac','.aac']);
const MAX_BYTES=2*1024**3;
const MAX_FILES=10000;
function checkedKey(key){
 const u=new URL(key);
 if(u.protocol!=='https:'||!['disk.yandex.ru','yadi.sk','disk.yandex.com'].includes(u.hostname)||u.username||u.password||!u.pathname.startsWith('/d/'))throw Error('Expected a public Yandex Disk folder link');
 return u.href;
}
async function request(key,pathname,extra,fetchImpl){
 const u=new URL(API+extra.endpoint);
 u.searchParams.set('public_key',key);
 u.searchParams.set('path',pathname);
 for(const [k,v] of Object.entries(extra.params||{}))u.searchParams.set(k,String(v));
 const r=await fetchImpl(u,{signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!r.ok)throw Error('Yandex API HTTP '+r.status);
 return r.json();
}
export async function listFolder(key,folder,{fetchImpl=fetch}={}){
 key=checkedKey(key);
 if(!FOLDERS.includes(folder))throw Error('Unapproved folder');
 const files=[],skipped=[];let offset=0;
 while(true){
  const data=await request(key,'/'+folder,{endpoint:'',params:{limit:100,offset,fields:'_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.size,_embedded.items.sha256,_embedded.total'}},fetchImpl);
  const items=data?._embedded?.items,total=data?._embedded?.total;
  if(!Array.isArray(items)||!Number.isInteger(total)||total<0||total>MAX_FILES)throw Error('Invalid or oversized Yandex folder listing');
  for(const item of items){
   if(item?.type==='file'&&typeof item.name==='string'&&MEDIA.has(extname(item.name).toLowerCase())&&
      item.path==='/'+folder+'/'+item.name&&basename(item.name)===item.name&&
      !/[\\/:*?"<>|\u0000-\u001f]/.test(item.name)&&!/[. ]$/.test(item.name)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(item.name)&&
      /^[a-f0-9]{64}$/i.test(item.sha256||'')&&Number.isSafeInteger(item.size)&&item.size>0&&item.size<=MAX_BYTES){
    files.push(item);
   }else skipped.push({name:String(item?.name||'').slice(0,200),reason:'unsupported type, path, hash or size'});
  }
  offset+=items.length;
  if(offset>=total)break;
  if(!items.length||offset>MAX_FILES)throw Error('Incomplete Yandex pagination');
 }
 return {files,skipped};
}
async function shaFile(path){
 const h=createHash('sha256');
 for await(const b of createReadStream(path))h.update(b);
 return h.digest('hex');
}
function safeDownloadURL(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||!/(^|\.)(yandex\.(net|ru|com)|yadi\.sk)$/i.test(u.hostname))throw Error('Unexpected download host');
 return u;
}
async function download(key,item,target,fetchImpl){
 const data=await request(key,item.path,{endpoint:'/download'},fetchImpl);
 let url=safeDownloadURL(data.href),response;
 for(let i=0;i<5;i++){
  response=await fetchImpl(url,{signal:AbortSignal.timeout(300000),redirect:'manual'});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');
   if(!location)throw Error('Missing download redirect');
   await response.body?.cancel();
   url=safeDownloadURL(new URL(location,url).href);
   continue;
  }
  break;
 }
 if(!response?.ok||!response.body)throw Error('Download HTTP '+response?.status);
 const temp=target+'.part-'+randomUUID();
 const h=createHash('sha256');let bytes=0;
 try{
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,enc,cb){
   bytes+=chunk.length;
   if(bytes>item.size)return cb(Error('Download exceeded expected size'));
   h.update(chunk);cb(null,chunk);
  }}),createWriteStream(temp,{flags:'wx'}));
  if(bytes!==item.size||h.digest('hex')!==item.sha256.toLowerCase())throw Error('Download size or SHA-256 mismatch');
  await rename(temp,target);
 }finally{await unlink(temp).catch(()=>{});}
}
export async function syncLibrary({publicUrl,cacheDir,scan=false,visionModel,fetchImpl=fetch}={}){
 const key=checkedKey(publicUrl);
 if(!cacheDir)throw Error('Local cache directory required');
 const root=resolve(cacheDir);
 const results=[];
 for(const folder of FOLDERS){
  const inbox=join(root,'sources',folder);
  const catalogDir=join(root,'catalogs',folder);
  await mkdir(inbox,{recursive:true});
  const listing=await listFolder(key,folder,{fetchImpl});
  const report={folder,listed:listing.files.length,skipped:listing.skipped,downloaded:0,reused:0,errors:[]};
  const seen=new Set();
  for(const item of listing.files){
   const sha=item.sha256.toLowerCase();
   if(seen.has(sha)){report.reused++;continue;}
   seen.add(sha);
   const dir=join(inbox,sha),target=join(dir,item.name);
   try{
    await mkdir(dir,{recursive:true});
    let valid=false;
    try{const s=await stat(target);valid=s.isFile()&&s.size===item.size&&await shaFile(target)===sha;}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(valid)report.reused++;
    else{await download(key,item,target,fetchImpl);report.downloaded++;}
   }catch(e){report.errors.push({name:item.name,error:String(e.message).replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,200)});}
  }
  if(scan){
   if(report.errors.length)report.scanStatus='BLOCKED: incomplete downloads';
   else if(listing.files.length>5000)report.scanStatus='BLOCKED: local scanner limit';
   else {
    try{report.scan=await scanLibrary({inbox,catalogDir,visionModel,maxFiles:5000});}
    catch(e){report.scanStatus='ERROR: '+String(e.message).slice(0,200);}
   }
  }
  results.push(report);
 }
 const report={status:results.some(r=>r.errors.length||r.scanStatus||r.scan?.errors?.length)?'PARTIAL':'PASS',scanRequested:scan,visionModel:visionModel||null,folders:results,
 limitations:'Read-only sync of supported media in two flat folders. Cached historical versions are preserved. Local visual descriptions require an explicit installed vision model. This is not artistic ranking or full reference analysis.'};
 await writeFile(join(root,'yandex-sync-report.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [cacheDir,...args]=process.argv.slice(2);let scan=false,visionModel;
  for(let i=0;i<args.length;i++){
   if(args[i]==='--scan')scan=true;
   else if(args[i]==='--vision-model'&&args[i+1]){visionModel=args[++i];scan=true;}
   else throw Error('Unknown option');
  }
  const report=await syncLibrary({publicUrl:process.env.PERSONA_YANDEX_PUBLIC_URL,cacheDir,scan,visionModel});
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=1;
 }catch(e){console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL omitted]'));process.exitCode=1;}
}
