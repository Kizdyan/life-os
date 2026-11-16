import {createHash} from 'node:crypto';
import {createReadStream, readFileSync} from 'node:fs';
import {mkdir, readFile, readdir, realpath, stat, statfs, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {delimiter, dirname, isAbsolute, join, resolve} from 'node:path';

const sqlite=await import('node:sqlite').catch(()=>null);
const schema=readFileSync(new URL('./persona-stage-cache-schema.sql',import.meta.url),'utf8');
const fingerprints=new Map();
const entryLimit=128*1024*1024;
const localTtl=30*86400*1000;
export const fullProbeArgs=['-v','error','-show_streams','-show_format','-of','json'];

function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
const digest=value=>createHash('sha256').update(value).digest('hex');
function cachePath(env){
 if(!sqlite||env.PERSONA_STAGE_CACHE==='0')return null;
 if(env.PERSONA_STAGE_CACHE_DB)return resolve(env.PERSONA_STAGE_CACHE_DB);
 if(process.platform==='win32'&&env.LOCALAPPDATA)return join(env.LOCALAPPDATA,'LifeOS','Persona','cache','stage.sqlite3');
 return join(env.XDG_CACHE_HOME||join(homedir(),'.cache'),'persona','stage.sqlite3');
}
export const stageCacheEnabled=(env=process.env)=>Boolean(cachePath(env));
async function stamp(path){
 const info=await stat(path,{bigint:true});
 return [info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
}
export async function stageFileSha(path){
 const file=await realpath(path), before=await stamp(file), cached=fingerprints.get(file);
 if(cached?.before===before)return cached.sha;
 const sha=createHash('sha256');
 for await(const part of createReadStream(file))sha.update(part);
 if(await stamp(file)!==before)throw Error('Media or tool changed while fingerprinting');
 const value=sha.digest('hex');
 fingerprints.set(file,{before,sha:value});
 if(fingerprints.size>128)fingerprints.delete(fingerprints.keys().next().value);
 return value;
}
async function executable(binary,env){
 const variants=process.platform==='win32'&&!/\.exe$/i.test(binary)?[binary+'.exe',binary]:[binary];
 if(isAbsolute(binary)||/[\\/]/.test(binary)){
  for(const path of variants){if((await stat(path).catch(()=>null))?.isFile())return path;}
 }else{
  for(const location of (env.PATH??env.Path??'').split(delimiter).filter(Boolean)){
   for(const name of variants){
    const path=join(location.replace(/^"|"$/g,''),name);
    if((await stat(path).catch(()=>null))?.isFile())return path;
   }
  }
 }
 throw Error('Could not fingerprint executable '+binary);
}
export async function stageToolVersion(binary,env=process.env){
 return 'sha256:'+await stageFileSha(await executable(binary,env));
}
function log(env,status,operation){
 if(env.PERSONA_STAGE_CACHE_LOG==='1')console.error('stage_cache '+status+' '+operation);
}
async function withDatabase(path,fn){
 await mkdir(dirname(path),{recursive:true});
 const db=new sqlite.DatabaseSync(path);
 try{
  db.exec('PRAGMA busy_timeout=250; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA journal_size_limit=8388608;');
  db.exec(schema);
  return fn(db);
 }finally{db.close();}
}

export async function cachedStage(operation,sha,version,params,producer,{env=process.env,valid=()=>true,ttl=localTtl,skipNull=false}={}){
 const path=cachePath(env);
 if(!path)return {value:await producer(),status:'BYPASS'};
 if(!/^[a-f0-9]{64}$/.test(sha))throw Error('Stage cache requires a verified SHA-256 content digest');
 const key=digest(canonical([1,operation,sha,version,params]));
 try{
  const row=await withDatabase(path,db=>db.prepare('SELECT encoding,payload FROM stage_cache WHERE key=? AND expires_at>? AND bytes<=?')
   .get(key,Date.now(),entryLimit));
  if(row){
   const data=Buffer.from(row.payload);
   const value=row.encoding==='bytes'?data:JSON.parse(data.toString('utf8'));
   if(valid(value)){log(env,'HIT',operation);return {value,status:'HIT'};}
  }
 }catch{log(env,'READ_UNAVAILABLE',operation);}
 const value=await producer();
 if(skipNull&&value===null){log(env,'MISS',operation);return {value,status:'MISS'};}
 if(!valid(value))throw Error('Invalid result for '+operation);
 try{
  const encoding=Buffer.isBuffer(value)?'bytes':'json';
  const payload=encoding==='bytes'?value:Buffer.from(JSON.stringify(value));
  const {bavail,bsize}=await statfs(dirname(path));
  // Large artifacts share the volume with their rendered copies and SQLite's WAL.
  const reserve=payload.length>=1024*1024?64*1024*1024:16*1024*1024;
  if(bavail*bsize<reserve+3*payload.length)log(env,'WRITE_SKIPPED_LOW_DISK',operation);
  else if(payload.length<=entryLimit)await withDatabase(path,db=>{
   const now=Date.now();
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare('DELETE FROM stage_cache WHERE expires_at<=?').run(now);
    db.prepare('INSERT OR REPLACE INTO stage_cache VALUES (?,?,?,?,?,?,?)')
     .run(key,operation,encoding,payload,payload.length,now,now+ttl);
    db.prepare('DELETE FROM stage_cache WHERE key IN (SELECT key FROM (SELECT key, row_number() OVER newest AS ordinal, sum(bytes) OVER newest AS total FROM stage_cache WINDOW newest AS (ORDER BY stored_at DESC, rowid DESC)) WHERE ordinal>? OR total>?)')
     .run(2048,512*1024*1024);
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
  });
 }catch{log(env,'WRITE_UNAVAILABLE',operation);}
 log(env,'MISS',operation);
 return {value,status:'MISS'};
}

export async function cachedFileStage(path,operation,version,params,producer,options={}){
 const env=options.env??process.env;
 if(!cachePath(env))return {value:await producer(),status:'BYPASS'};
 const before=await stamp(path);
 const checked=async()=>{
  const value=await producer();
  if(await stamp(path)!==before)throw Error('Media changed during the cached stage');
  return value;
 };
 const result=await cachedStage(operation,await stageFileSha(path),version,params,checked,options);
 if(await stamp(path)!==before)throw Error('Media changed during cache lookup');
 return result;
}

export async function cachedFfprobe(path,{binary='ffprobe',args=fullProbeArgs,run,env=process.env}){
 const compute=async()=>{
  const data=await run(binary,[...args,path]);
  const raw=JSON.parse(data?.stdout??data);
  if(raw.format&&Object.hasOwn(raw.format,'filename'))raw.format.filename='';
  return raw;
 };
 const probe=cachePath(env)
  ?await cachedFileStage(path,'ffprobe',await stageToolVersion(binary,env),{args:[...args]},compute,
    {env,valid:value=>value&&typeof value==='object'&&('format' in value||'streams' in value)})
  :{value:await compute()};
 const value=probe.value;
 if(value.format&&Object.hasOwn(value.format,'filename'))value.format.filename=path;
 return value;
}

export async function cachedWhisper(audio,{binary,model,params,run,env=process.env}){
 if(!cachePath(env))return {value:await run(),status:'BYPASS'};
 const cli=await executable(binary,env);
 const libraryNames=process.platform==='win32'?(await readdir(dirname(cli)))
  .filter(name=>/^(?:whisper|ggml(?:-[a-z0-9-]+)?)\.dll$/i.test(name)).sort():[];
 const libraries=await Promise.all(libraryNames.map(name=>stageFileSha(join(dirname(cli),name))));
 const version=digest(canonical([await stageFileSha(cli),await stageFileSha(model),libraries]));
 return cachedFileStage(audio,'whisper_transcribe',version,params,run,
  {env,valid:value=>Array.isArray(value?.transcription)});
}

export async function cachedFfmpegStage(path,operation,params,producer,{env=process.env,binary='ffmpeg',...options}={}){
 if(!stageCacheEnabled(env))return {value:await producer(),status:'BYPASS'};
 return cachedFileStage(path,operation,await stageToolVersion(binary,env),params,producer,{env,...options});
}

export async function cachedMp4({path,sourceSha,params,env=process.env,binary='ffmpeg',operation='ffmpeg_music_render',render}){
 if(!stageCacheEnabled(env)){
  await render();
  return 'BYPASS';
 }
 const version=await stageToolVersion(binary,env);
 const valid=value=>Buffer.isBuffer(value)&&value.length>64&&
  value.subarray(0,64).toString('ascii')===digest(value.subarray(64));
 const result=await cachedStage(operation,sourceSha,version,params,async()=>{
  await render();
  if((await stat(path)).size>entryLimit-64)return null;
  const video=await readFile(path);
  return Buffer.concat([Buffer.from(digest(video)),video]);
 },{env,valid,skipNull:true});
 if(result.status==='HIT')await writeFile(path,result.value.subarray(64),{flag:'wx'});
 return result.status;
}
