#!/usr/bin/env node
/** Verify a downloaded Skill against a pinned local Git HEAD, without executing it.
 * Usage: node scripts/skill-source-verify-git.mjs <git-checkout> <skill-subdir> <40-hex-commit> [report.json]
 * Requires ordinary git installed. No checkout, fetch, install, hooks, network or shell.
 * A local Git object proves matching commit bytes, not that a remote vendor is trustworthy.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectLocalSkillDirectory} from './skill-source-inspect.mjs';
const COMMIT=/^[a-f0-9]{40}$/i;
const SAFE_SUBPATH=/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const BAD_SEGMENTS=new Set(['.','..']);
function runGit(root,args){
  const result=spawnSync('git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',root,...args],{
    encoding:null,timeout:20000,maxBuffer:3_000_000,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1',GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},
  });
  if(result.error||result.status!==0)throw new Error('Git source verification failed: '+(result.error?.message??result.stderr?.toString('utf8').slice(-500)));
  return result.stdout;
}
function hashGitBlob(buffer){return createHash('sha1').update(Buffer.from('blob '+buffer.length+'\0')).update(buffer).digest('hex');}
function sourceSubpath(value){
  if(!SAFE_SUBPATH.test(value)||value.split('/').some(s=>BAD_SEGMENTS.has(s)))throw new Error('Unsafe skill subdirectory');
  return value;
}
export async function verifySkillCheckout(checkout,skillSubpath,expectedCommit){
  if(!COMMIT.test(expectedCommit))throw new Error('Expected pinned 40-character commit');
  const sub=sourceSubpath(skillSubpath);
  const root=await realpath(resolve(checkout));
  const rootStat=await lstat(root);
  if(!rootStat.isDirectory())throw new Error('Git checkout is not a directory');
  const gitRoot=(runGit(root,['rev-parse','--show-toplevel']).toString('utf8')).trim();
  if(resolve(gitRoot)!==root)throw new Error('Checkout must be a repository root');
  const head=(runGit(root,['rev-parse','--verify','HEAD^{commit}']).toString('utf8')).trim();
  if(head.toLowerCase()!==expectedCommit.toLowerCase())throw new Error('Checkout HEAD is not the pinned commit');
  const dir=join(root,...sub.split('/'));
  const scan=await inspectLocalSkillDirectory(dir);
  const manifest=new Map(scan.files.map(file=>[file.path,file]));
  const output=runGit(root,['ls-tree','-r','-z','--full-tree',expectedCommit,'--',sub+'/']);
  const tracked=new Map();
  for(const item of output.toString('utf8').split('\0').filter(Boolean)){
    const tab=item.indexOf('\t');
    if(tab===-1)throw new Error('Unexpected Git tree entry');
    const [mode,type,sha]=item.slice(0,tab).split(' ');
    const full=item.slice(tab+1);
    if(!full.startsWith(sub+'/'))throw new Error('Unexpected Git tree path');
    const filename=full.slice(sub.length+1);
    if(!filename||filename.split('/').some(s=>!s||BAD_SEGMENTS.has(s)))throw new Error('Unsafe Git tree path');
    if(type!=='blob'||!['100644','100755'].includes(mode))throw new Error('Git tree contains non-regular file: '+filename);
    if(tracked.has(filename))throw new Error('Duplicate Git tree path');
    tracked.set(filename,sha);
  }
  if(tracked.size===0)throw new Error('No files at the pinned Skill path');
  if(tracked.size!==manifest.size||!scan.inventoryComplete)throw new Error('Local source inventory differs from pinned Git tree');
  for(const [filename,gitSha] of tracked){
    const m=manifest.get(filename);
    if(!m)throw new Error('Pinned source file missing: '+filename);
    const path=join(dir,...filename.split('/'));
    const stat=await lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Non-regular source file: '+filename);
    const bytes=await readFile(path);
    if(hashGitBlob(bytes)!==gitSha)throw new Error('Git blob mismatch: '+filename);
    if(createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw new Error('Source changed while scanning: '+filename);
  }
  return {
    ...scan,
    sourceRevision:expectedCommit.toLowerCase(),
    sourceSkillPath:sub,
    revisionVerified:true,
    verificationMethod:'pinned-local-git-tree-blob',
    upstreamPublisherAuthenticated:false,
    reviewerApproved:false,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length<5||process.argv.length>6){
    console.error('Usage: node scripts/skill-source-verify-git.mjs <repo-root> <skill-subdir> <40hex> [report.json]');
    process.exitCode=2;
  }else verifySkillCheckout(process.argv[2],process.argv[3],process.argv[4]).then(async report=>{
    const json=JSON.stringify(report,null,2)+'\n';
    if(process.argv[5])await writeFile(resolve(process.argv[5]),json,{flag:'wx'});
    else process.stdout.write(json);
    if(!report.staticCheckPassed)process.exitCode=1;
  }).catch(err=>{console.error(err.message);process.exitCode=2;});
}
