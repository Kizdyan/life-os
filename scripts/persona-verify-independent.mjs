#!/usr/bin/env node
// Portable Persona verification: no GitHub Actions, Vercel, paid APIs or secrets required.
// Run from repository root: node scripts/persona-verify-independent.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const git = spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const gitSha = git.status === 0 ? git.stdout.trim() : null;
if (!gitSha || !/^[a-f0-9]{40}$/.test(gitSha)) {
  console.error('Refusing verification: exact Git HEAD SHA unavailable.');
  process.exit(2);
}
if (process.env.PERSONA_COMMIT_SHA && process.env.PERSONA_COMMIT_SHA !== gitSha) {
  console.error('Refusing verification: declared SHA differs from checked-out HEAD.');
  process.exit(2);
}
const tracked=spawnSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'});
if(tracked.status!==0||tracked.stdout.trim()){
 console.error('Refusing verification: tracked working tree is not clean.');
 process.exit(2);
}
if (!existsSync(join(root, 'package.json'))) {
  console.error('Run from repository root (package.json missing).');
  process.exit(2);
}
const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(join(root,'package.json'),'utf8'));
const tasks = [
  ['typecheck', 'typecheck'],
  ['api:typecheck', 'api:typecheck'],
  ['unit tests', 'test'],
  ['web build', 'web:build'],
  ['Persona core regressions', 'persona:core:test'],
  ['Persona scenario and delivery regressions', 'persona:scenario:delivery:test'],
  ['Workflow skill validation', 'skills:validate'],
  ['Persona marketing audit regressions', 'marketing:test'],
  ['Life OS task orchestration regressions', 'tasks:test'],
  ['Local artifact evidence regressions', 'evidence:test'],
  ['Local task executor regressions', 'tasks:execute:test'],
  ['Local batch executor regressions', 'tasks:batch:test'],
  ['Release evidence gate regressions', 'release:gate:test'],
  ['Task orchestration end-to-end CLI', 'tasks:e2e:test'],
  ['Persona production brief regressions', 'production:brief:test'],
  ['media integration', 'media:test'],
];
const mandatory=['typecheck','api:typecheck','test','web:build','persona:core:test','persona:scenario:delivery:test','skills:validate','marketing:test','tasks:test','evidence:test','tasks:execute:test','tasks:batch:test','release:gate:test','tasks:e2e:test','production:brief:test'];
const missing=mandatory.filter(script=>!Object.hasOwn(manifest.scripts??{},script));
if(missing.length){console.error('Refusing verification: required scripts missing: '+missing.join(', '));process.exit(2)}
const available=tasks.filter(([,script])=>Object.hasOwn(manifest.scripts??{},script));
const install = process.argv.includes('--install');
const dry = process.argv.includes('--dry-run');
const runMedia = process.argv.includes('--media');
if (runMedia && !dry) {
  for (const binary of ['ffmpeg','ffprobe']) {
    const check = spawnSync(binary,['-version'],{stdio:'ignore'});
    if (check.status !== 0) {
      console.error('Media verification requires '+binary+' on PATH.');
      process.exit(2);
    }
  }
}
const selected = available.filter(([name]) => name !== 'media integration' || runMedia);
const commands = [...(install ? [['install','npm',['ci','--no-audit','--no-fund']]] : []), ...selected.map(([name,script]) => [name,'npm',['run',script]])];
const results = [];
const startedAt = new Date().toISOString();
let failed = false;
for (const [name, bin, args] of commands) {
  console.log('> '+bin+' '+args.join(' '));
  if (dry) { results.push({name,status:'NOT_RUN_DRY_RUN'}); continue; }
  const t = Date.now();
  const result = spawnSync(process.platform === 'win32' ? bin+'.cmd' : bin,args,{cwd:root,stdio:'inherit',shell:process.platform === 'win32'});
  const status = result.error ? 'EXECUTION_ERROR' : result.status === 0 ? 'PASS' : 'FAIL';
  results.push({name,status,exitCode:result.status,error:result.error?.message,durationMs:Date.now()-t});
  if (status !== 'PASS') { failed = true; break; }
}
const report = {schemaVersion:1,startedAt,finishedAt:new Date().toISOString(),platform:process.platform,node:process.version,commit:gitSha,dryRun:dry,mediaIncluded:runMedia,results,overall:dry?'NOT_RUN':failed?'FAIL':results.length?'PASS':'NOT_RUN'};
if (!dry) {
  const dir=join(root,'artifacts','persona-verification');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'latest.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Report: artifacts/persona-verification/latest.json');
}
console.log('Persona independent verification: '+report.overall);
process.exit(failed?1:0);
