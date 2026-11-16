import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {coverageGate,styleGate,economicsCommand} from './persona-p3-adapter.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
test('coverage refuses unbound or unapproved material before allowing editing',async()=>{
 const root=await mkdtemp(join(tmpdir(),'p3-node-'));
 try {
  const input=join(root,'input');await mkdir(input);
  const brief=join(root,'brief.json'),bindings=join(root,'bindings.json'),output=join(root,'coverage.json');
  const data=JSON.stringify({version:1,shots:[{order:1,durationSec:1,action:'visual'}],script:[{order:1,durationSec:1,line:''}]});
  await writeFile(brief,data);await writeFile(bindings,JSON.stringify({version:1,bindings:[]}));
  const response=await coverageGate({brief,input,bindings,approvalSha256:sha(data),output});
  assert.equal(response.status,'REVIEW_REQUIRED');
  assert.equal(response.report.summary.MISSING,1);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('style gate blocks unknown intent',async()=>{
 const root=await mkdtemp(join(tmpdir(),'p3-style-'));
 try {const p=join(root,'plan.json');await writeFile(p,JSON.stringify({styleId:'independent-artist-quiet-luxury'}));
 const g=await styleGate({plan:p});assert.equal(g.status,'BLOCKED');}
 finally{await rm(root,{recursive:true,force:true})}
});
test('economics does not invent savings for an unapproved output',async()=>{
 const root=await mkdtemp(join(tmpdir(),'p3-econ-'));
 try {const database=join(root,'stats.sqlite3');await economicsCommand({database,command:'create',args:['job-z','--baseline-min','25']});
 const r=await economicsCommand({database,command:'report',args:['job-z']});assert.equal(r.minutesSaved,null);}
 finally{await rm(root,{recursive:true,force:true})}
});
