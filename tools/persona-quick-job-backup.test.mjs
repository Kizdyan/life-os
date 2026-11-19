import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rename,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProductionJob} from './persona_orchestrator.mjs';
import {backupPersonaQuickJob,verifyPersonaQuickJobBackup,restorePersonaQuickJob} from './persona-quick-job-backup.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
async function fixture(root,{status='AWAITING_APPROVAL'}={}){
 const id=randomUUID(),quickRoot=join(root,'quick'),source=join(quickRoot,'quick-'+id);
 await mkdir(quickRoot);
 const production=await ProductionJob.create(source,{contentType:'video'});
 await production.transition('WAITING_FOR_FOOTAGE',{reason:'Real local files are staged'});
 const input=Buffer.alloc(35_000,0x31),originalHash=sha(input);
 await writeFile(join(source,'input','video-01.mp4'),input);
 if(status==='AWAITING_APPROVAL'){
  await production.transition('ANALYZING',{reason:'Source verified',
   asset:{name:'video-01.mp4',sha256:originalHash,durationSec:2}});
  await production.transition('EDITING');
  await production.transition('QUALITY_CHECK');
  await production.transition('AWAITING_APPROVAL');
 }else if(status==='ANALYZING'){
  await production.transition('ANALYZING',{reason:'Still running',
   asset:{name:'video-01.mp4',sha256:originalHash,durationSec:2}});
 }
 const final=Buffer.alloc(90_000,0x59);
 await writeFile(join(source,'output','full-ready.mp4'),final);
 await mkdir(join(source,'output','platform-package'));
 await writeFile(join(source,'output','platform-package','instagram.mp4'),Buffer.alloc(44_000,0x27));
 await writeFile(join(source,'output','RESULT-FULL.json'),JSON.stringify({
  status:'awaiting-author-review',distributionAllowed:false,sha256:sha(final),
  videoName:'full-ready.mp4',sourcePath:join(source,'input','video-01.mp4')}));
 await writeFile(join(source,'quick-state.json'),JSON.stringify({id,title:'Preserve my work',
  contentType:'video',files:[{index:0,kind:'video',name:'video-01.mp4',originalName:'source.mp4',sha256:originalHash,size:input.length}],
  uploads:[0],exportStatus:'COMPLETED'}));
 return {id,quickRoot,source,originalHash,finalHash:sha(final)};
}
test('copies a full stable job, verifies every byte, restores to new root without overwriting',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-backup-e2e-'));
 try{
  const job=await fixture(root),destination=join(root,'external','job-backup');
  // Empty folders matter for jobs later resumed with more source uploads.
  await mkdir(join(job.source,'output','empty-notes'));
  await mkdir(join(root,'external'));
  const before=await readFile(join(job.source,'input','video-01.mp4'));
  const result=await backupPersonaQuickJob({quickRoot:job.quickRoot,id:job.id,destination});
  assert.equal(result.verified,true);assert.ok(result.fileCount>=5);
  const inspected=await verifyPersonaQuickJobBackup(destination);
  assert.equal(inspected.id,job.id);assert.equal(inspected.verified,true);
  const targetRoot=join(root,'recovered-root');
  const restored=await restorePersonaQuickJob({backupDir:destination,quickRoot:targetRoot});
  assert.equal(restored.relocated,true);assert.equal(restored.rerenderVerified,false);
  assert.equal(restored.verified,true);
  const restoredJob=join(targetRoot,'quick-'+job.id);
  assert.ok((await stat(join(restoredJob,'output','empty-notes'))).isDirectory());
  assert.equal((await new ProductionJob(restoredJob).read()).status,'AWAITING_APPROVAL');
  assert.equal(sha(await readFile(join(restoredJob,'input','video-01.mp4'))),job.originalHash);
  assert.equal(sha(await readFile(join(restoredJob,'output','full-ready.mp4'))),job.finalHash);
  assert.deepEqual(await readFile(join(job.source,'input','video-01.mp4')),before);
  await assert.rejects(restorePersonaQuickJob({backupDir:destination,quickRoot:targetRoot}),
   /EEXIST|exists/,'Must never overwrite an existing Worker job');
  assert.equal(sha(await readFile(join(restoredJob,'output','full-ready.mp4'))),job.finalHash);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('rejects modified original video or corrupt backup; tampering never produces restored data',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-backup-integrity-'));
 try{
  const job=await fixture(root);
  const destination=join(root,'archive');
  const result=await backupPersonaQuickJob({quickRoot:job.quickRoot,id:job.id,destination});
  assert.equal(result.verified,true);
  await writeFile(join(destination,'files','input','video-01.mp4'),Buffer.alloc(35_000,0x32));
  await assert.rejects(verifyPersonaQuickJobBackup(destination),/integrity failed|SHA-256/);
  const other=join(root,'other');
  await assert.rejects(restorePersonaQuickJob({backupDir:destination,quickRoot:other}),/integrity failed|SHA-256/);
  await assert.rejects(stat(join(other,'quick-'+job.id)),/ENOENT/);
  await writeFile(join(job.source,'input','video-01.mp4'),Buffer.alloc(35_000,0x33));
  await assert.rejects(backupPersonaQuickJob({quickRoot:job.quickRoot,id:job.id,destination:join(root,'second')}),
   /Original media SHA-256/);
  await assert.rejects(stat(join(root,'second')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('refuses active render state, symlink payload and manifest traversal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-backup-security-'));
 try{
  const job=await fixture(root,{status:'ANALYZING'});
  await assert.rejects(backupPersonaQuickJob({quickRoot:job.quickRoot,id:job.id,
   destination:join(root,'running-backup')}),/not stable/);
  const state=JSON.parse(await readFile(join(job.source,'job.json'),'utf8'));
  state.status='FAILED';
  await writeFile(join(job.source,'job.json'),JSON.stringify(state));
  const outside=join(root,'external-secret.txt');
  await writeFile(outside,'Never archive files through a symlink');
  const link=join(job.source,'output','stray-link');
  try{
   await symlink(outside,link);
   await assert.rejects(backupPersonaQuickJob({quickRoot:job.quickRoot,id:job.id,
    destination:join(root,'symlink-backup')}),/symbolic link/);
  }catch(error){if(error?.code!=='EPERM'&&error?.code!=='EACCES')throw error}
  await rm(link,{force:true});
  const dst=join(root,'valid-backup');
  await backupPersonaQuickJob({quickRoot:job.quickRoot,id:job.id,destination:dst});
  const manifestPath=join(dst,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.files[0].path='../escape.mp4';
  await writeFile(manifestPath,JSON.stringify(manifest));
  await assert.rejects(verifyPersonaQuickJobBackup(dst),/Unsafe path|malformed/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('rejects a linked manifest or a non-directory backup payload',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-backup-manifest-links-'));
 try{
  const job=await fixture(root),destination=join(root,'archive');
  await backupPersonaQuickJob({quickRoot:job.quickRoot,id:job.id,destination});
  const manifestPath=join(destination,'manifest.json'),realManifest=join(root,'real-manifest.json');
  await rename(manifestPath,realManifest);
  let linked=false;
  try{await symlink(realManifest,manifestPath,'file');linked=true}
  catch(error){if(!['EPERM','EACCES','ENOTSUP'].includes(error?.code))throw error}
  if(linked){
   await assert.rejects(verifyPersonaQuickJobBackup(destination),/regular payload folder and manifest file/);
   await rm(manifestPath);
  }
  await rename(realManifest,manifestPath);
  await rm(join(destination,'files'),{recursive:true});
  await writeFile(join(destination,'files'),'this is not a payload folder');
  await assert.rejects(verifyPersonaQuickJobBackup(destination),/regular payload folder and manifest file/);
 }finally{await rm(root,{recursive:true,force:true})}
});
