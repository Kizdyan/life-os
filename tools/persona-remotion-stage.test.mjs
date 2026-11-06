import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stageRemotion} from './persona-remotion-stage.mjs';
test('stage builds isolated Remotion workspace with media copies and no render',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-stage-'));
 try{
  const input=join(dir,'timeline.json'),output=join(dir,'remotion');
  await writeFile(join(dir,'shot.mp4'),'synthetic media fixture');
  await writeFile(input,JSON.stringify({version:1,clips:[{path:'shot.mp4',startSec:0,durationSec:2}]}));
  const result=await stageRemotion({input,output});
  assert.equal(result.status,'STAGED_NOT_RENDERED');
  assert.equal(await readFile(join(output,'public','media','shot.mp4'),'utf8'),'synthetic media fixture');
  assert.equal((await stat(join(output,'PersonaVertical.jsx'))).isFile(),true);
  assert.equal(JSON.parse(await readFile(join(output,'remotion-handoff.json'),'utf8')).rendered,false);
  await assert.rejects(stageRemotion({input,output}),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
