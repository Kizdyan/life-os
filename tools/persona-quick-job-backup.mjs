#!/usr/bin/env node
/**
 * Offline, per-job verified folder backup for the local Persona Quick Render Worker.
 * Copy entire stable job bytes, including source videos, project state, edit plans,
 * subtitle receipts, QC and platform exports. Never edit live project data.
 * NO cloud, no renderer changes, no publication or approval.
 */
import {constants,createReadStream} from 'node:fs';
import {copyFile,lstat,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const FORMAT='persona-quick-render-folder-backup-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_FILES=5000,MAX_BYTES=50*1024**3;
const fail=message=>{throw Error('Persona Worker backup: '+message)};
const inside=(root,file)=>{const rel=relative(root,file);return rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))};
const hash=async(file)=>{const h=createHash('sha256');for await(const data of createReadStream(file))h.update(data);return h.digest('hex')};
const sane=id=>{if(typeof id!=='string'||!UUID.test(id))fail('Provide a valid Quick Render job UUID');return id};
function safeRelative(path){
 if(typeof path!=='string'||path.length>1200||!path||path.includes('\\')||path.startsWith('/')||
    path.split('/').some(segment=>!segment||segment==='.'||segment==='..'||/[:\x00-\x1f]/.test(segment)))
  fail('Unsafe path in backup manifest');
 return path;
}
async function folderEntries(dir,prefix=''){
 const out=[],children=await readdir(dir,{withFileTypes:true});
 for(const child of children){
  const name=safeRelative(child.name),relativeName=prefix?prefix+'/'+name:name;
  const full=join(dir,child.name),info=await lstat(full);
  if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory()))
   fail('Job contains a symbolic link or unsupported file: '+relativeName);
  if(child.name.endsWith('.lock')||child.name.endsWith('.tmp'))
   fail('Found an in-progress lock/temp file. Stop the Worker first: '+relativeName);
  if(info.isDirectory())out.push(...await folderEntries(full,relativeName));
  else out.push({path:relativeName,bytes:info.size});
  if(out.length>MAX_FILES)fail('Too many files in job');
 }
 return out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
async function stableJob(folder,id){
 const [state,meta]=await Promise.all([
  readFile(join(folder,'job.json'),'utf8').then(JSON.parse),
  readFile(join(folder,'quick-state.json'),'utf8').then(JSON.parse),
 ]);
 if(meta?.id!==id||!Array.isArray(meta.files)||!Array.isArray(meta.uploads))
  fail('Quick Render metadata is missing or belongs to another job');
 if(!['AWAITING_APPROVAL','WAITING_FOR_FOOTAGE','FAILED'].includes(state?.status)||
    state?.fullRender?.status==='RENDERING'||meta?.exportStatus==='RENDERING')
  fail('Job is not stable. Stop the Worker and finish or cancel active rendering first');
 // Validate known uploaded input bytes before making the backup.
 for(const entry of meta.files){
  if(!meta.uploads.includes(entry.index))continue;
  if(typeof entry.name!=='string'||!/^[a-z]+-\d{2,3}\.[a-z0-9]+$/.test(entry.name)||
     !/^[a-f0-9]{64}$/.test(entry.sha256??''))
   fail('Uploaded media manifest is incomplete');
  if(await hash(join(folder,'input',entry.name))!==entry.sha256)
   fail('Original media SHA-256 differs from its intake receipt');
 }
 return {productionStatus:state.status,contentType:meta.contentType??'video',fileCount:meta.files.length};
}
async function scanAndHash(folder){
 const entries=await folderEntries(folder);
 if(!entries.some(x=>x.path==='job.json')||!entries.some(x=>x.path==='quick-state.json'))
  fail('Not a complete Quick Render job folder');
 const total=entries.reduce((sum,x)=>sum+x.bytes,0);
 if(total>MAX_BYTES)fail('Job exceeds the safe per-backup size limit');
 return {files:await Promise.all(entries.map(async x=>({...x,sha256:await hash(join(folder,...x.path.split('/')))}))),totalBytes:total};
}
async function verifiedContents(folder,manifest){
 const found=await folderEntries(folder);
 if(found.length!==manifest.files.length)fail('Backup contains missing or extra files');
 for(let i=0;i<found.length;i++){
  const current=found[i],expected=manifest.files[i];
  if(current.path!==expected.path||current.bytes!==expected.bytes||
     await hash(join(folder,...current.path.split('/')))!==expected.sha256)
   fail('Backup file integrity failed: '+current.path);
 }
}
function validateManifest(manifest){
 if(manifest?.kind!==FORMAT||manifest.version!==1||!UUID.test(manifest.id??'')||
    !Array.isArray(manifest.files)||manifest.files.length>MAX_FILES||!Number.isSafeInteger(manifest.totalBytes)||
    manifest.totalBytes<0||manifest.totalBytes>MAX_BYTES)
  fail('Invalid or unsupported backup manifest');
 let total=0,previous='';
 for(const file of manifest.files){
  safeRelative(file?.path);
  if(file.path<=previous||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>MAX_BYTES||
     !/^[a-f0-9]{64}$/.test(file.sha256??''))
   fail('Unsorted, duplicated or malformed backup file');
  total+=file.bytes;previous=file.path;
 }
 if(total!==manifest.totalBytes||!manifest.files.some(x=>x.path==='job.json')||
    !manifest.files.some(x=>x.path==='quick-state.json'))fail('Incomplete backup inventory');
 return manifest;
}
export async function verifyPersonaQuickJobBackup(backupDir){
 const folder=resolve(backupDir);
 if(!(await lstat(folder)).isDirectory()||(await lstat(join(folder,'files'))).isSymbolicLink())
  fail('Backup must be a real folder without linked payloads');
 const file=join(folder,'manifest.json');
 if((await stat(file)).size>2_000_000)fail('Backup manifest is too large');
 const manifest=validateManifest(JSON.parse(await readFile(file,'utf8')));
 await verifiedContents(join(folder,'files'),manifest);
 await stableJob(join(folder,'files'),manifest.id);
 return {id:manifest.id,fileCount:manifest.files.length,totalBytes:manifest.totalBytes,
  productionStatus:manifest.productionStatus,originalJobDir:manifest.originalJobDir,verified:true};
}
export async function backupPersonaQuickJob({quickRoot,id,destination}){
 sane(id);
 if(!quickRoot||!destination)fail('Specify Worker quick root and a new backup folder');
 const root=resolve(quickRoot),source=join(root,'quick-'+id),target=resolve(destination);
 if(inside(source,target)||inside(target,source)||source===target)fail('Backup path must be separate from the source project');
 const sourceInfo=await lstat(source);
 if(!sourceInfo.isDirectory()||sourceInfo.isSymbolicLink())fail('Job source is not a regular directory');
 const stable=await stableJob(source,id),snapshot=await scanAndHash(source);
 let created=false;
 try{
  await mkdir(target);created=true;
  const store=join(target,'files');
  await mkdir(store);
  for(const item of snapshot.files){
   const original=join(source,...item.path.split('/')),copy=join(store,...item.path.split('/'));
   await mkdir(dirname(copy),{recursive:true});
   await copyFile(original,copy,constants.COPYFILE_EXCL);
   if((await stat(original)).size!==item.bytes||await hash(original)!==item.sha256||
      (await stat(copy)).size!==item.bytes||await hash(copy)!==item.sha256)
    fail('Source changed while copying: '+item.path);
  }
  const inventory=await scanAndHash(source);
  if(JSON.stringify(inventory)!==JSON.stringify(snapshot))
   fail('Source changed while creating the backup. Stop the Worker and retry');
  const manifest={version:1,kind:FORMAT,id,createdAt:new Date().toISOString(),
   originalJobDir:source,productionStatus:stable.productionStatus,
   contentType:stable.contentType,files:snapshot.files,totalBytes:snapshot.totalBytes,
   publicationApproved:false,limitation:'A relocated restored job is for recovery and download; old absolute paths in edit manifests can block rerendering.'};
  await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  await verifyPersonaQuickJobBackup(target);
  return {id,destination:target,fileCount:snapshot.files.length,totalBytes:snapshot.totalBytes,verified:true};
 }catch(error){if(created)await rm(target,{recursive:true,force:true});throw error}
}
export async function restorePersonaQuickJob({backupDir,quickRoot}){
 if(!quickRoot)fail('Specify target Worker quick root');
 const verified=await verifyPersonaQuickJobBackup(backupDir);
 const original=resolve(backupDir,'files'),root=resolve(quickRoot),target=join(root,'quick-'+verified.id);
 if(inside(original,target)||inside(target,original))fail('Cannot restore over the backup itself');
 await mkdir(root,{recursive:true});
 let created=false;
 try{
  await mkdir(target);created=true;
  const manifest=validateManifest(JSON.parse(await readFile(join(resolve(backupDir),'manifest.json'),'utf8')));
  for(const item of manifest.files){
   const source=join(original,...item.path.split('/')),dest=join(target,...item.path.split('/'));
   await mkdir(dirname(dest),{recursive:true});
   await copyFile(source,dest,constants.COPYFILE_EXCL);
  }
  await verifiedContents(target,manifest);
  await stableJob(target,verified.id);
  return {id:verified.id,restoredTo:target,verified:true,files:manifest.files.length,
   relocated:target!==resolve(manifest.originalJobDir),
   rerenderVerified:false,
   note:'No existing job overwritten. Review restored projects in Worker; relocated absolute EditPlan paths require a separate migration before re-rendering.'};
 }catch(error){if(created)await rm(target,{recursive:true,force:true});throw error}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [action,...args]=process.argv.slice(2);
 const execute=action==='backup'?backupPersonaQuickJob({quickRoot:args[0],id:args[1],destination:args[2]}):
  action==='verify'?verifyPersonaQuickJobBackup(args[0]):
  action==='restore'?restorePersonaQuickJob({backupDir:args[0],quickRoot:args[1]}):
  Promise.reject(Error('Usage: backup <Worker quick root> <job UUID> <new backup folder> | verify <backup folder> | restore <backup folder> <Worker quick root>'));
 execute.then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(String(error.message||error));process.exitCode=1});
}
