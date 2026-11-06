import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectEvidence,writeEvidence} from './persona-evidence.mjs';
import {updateBoard} from './persona-task-journal.mjs';

const task=(id,status)=>({id,status,dependsOn:[],priority:'P1',kind:'engineering',title:id,acceptance:'Evidence review'});
test('offline evidence hash matches original bytes, not an approval',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-evidence-'));
 try{
  const file=join(dir,'artifact.txt');await writeFile(file,'verified test output\n');
  const result=await inspectEvidence({input:file});
  assert.equal(result.sha256,createHash('sha256').update('verified test output\n').digest('hex'));
  assert.equal(result.qualityApproved,false);
  await writeEvidence({input:file,output:join(dir,'record')});
  const record=JSON.parse(await readFile(join(dir,'record','evidence.json'),'utf8'));
  assert.equal(record.sha256,result.sha256);
  await assert.rejects(writeEvidence({input:file,output:join(dir,'record')}),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('journal distinguishes text-only claims from file-backed evidence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-journal-evidence-'));
 try{
  const board=join(dir,'board.json'),artifact=join(dir,'proof.txt');
  await writeFile(artifact,'test report with stable content');
  await writeFile(board,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('A','RUNNING'),task('B','RUNNING')]}));
  await updateBoard({input:board,id:'A',to:'DONE',evidence:'Local test report checked',expectedRevision:0,evidenceFile:artifact});
  await updateBoard({input:board,id:'B',to:'DONE',evidence:'Manual observation only',expectedRevision:1});
  const data=JSON.parse(await readFile(board,'utf8'));
  assert.equal(data.history[0].evidenceVerification.kind,'LOCAL_FILE_HASH');
  assert.equal(data.history[0].evidenceVerification.qualityApproved,false);
  assert.equal(data.history[1].evidenceVerification.verified,false);
  assert.equal(data.history[1].evidenceVerification.kind,'USER_TEXT_ONLY');
 }finally{await rm(dir,{recursive:true,force:true})}
});
