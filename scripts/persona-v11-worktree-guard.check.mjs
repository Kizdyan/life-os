import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyPinnedWorktree} from './persona-v11-worktree-guard.mjs';

test('pinned engine guard accepts the exact clean commit and rejects tracked changes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-v11-pin-'));
 try{
  execFileSync('git',['init','-q',root]);
  execFileSync('git',['-C',root,'config','user.email','persona-test@example.invalid']);
  execFileSync('git',['-C',root,'config','user.name','Persona Test']);
  await writeFile(join(root,'engine.mjs'),'export const version=1;\n');
  execFileSync('git',['-C',root,'add','engine.mjs']);
  execFileSync('git',['-C',root,'commit','-qm','fixture']);
  const head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  await verifyPinnedWorktree(root,head);
  await writeFile(join(root,'engine.mjs'),'export const version=2;\n');
  await assert.rejects(verifyPinnedWorktree(root,head),/v11_worktree_dirty/);
 }finally{await rm(root,{recursive:true,force:true});}
});
