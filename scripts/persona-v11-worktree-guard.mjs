import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile);

export async function verifyPinnedWorktree(worktree,expectedCommit){
 const head=await exec('git',['-C',worktree,'rev-parse','HEAD'],{timeout:8000});
 if(head.stdout.trim()!==expectedCommit)throw Error('v11_commit_mismatch');
 const status=await exec('git',['-C',worktree,'status','--porcelain=v1','--untracked-files=no'],{timeout:8000});
 if(status.stdout.trim())throw Error('v11_worktree_dirty');
}
