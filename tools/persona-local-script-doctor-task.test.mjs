import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildLocalDoctorTask,createLocalDoctorTaskFile} from './persona-local-script-doctor-task.mjs';
const script={idea:{id:'idea-letter-01',title:'Сцена с письмом',originalConflict:'Герой пытается скрыть письмо от партнёра'},currentRevisionId:'scene-r2',
 currentRevision:{id:'scene-r2',beats:[
 {purpose:'hook',line:'Письмо пришло раньше меня.',action:'Убирает конверт под книгу.',durationSec:4},
 {purpose:'development',line:'Он уже видел открытую книгу.',action:'Взглядом ищет выход.',durationSec:5},
 {purpose:'ending',line:'Это письмо было ему.',action:'Отдаёт конверт партнёру.',durationSec:4}]}};
const options={target:'2,3',lock:'1',instruction:'Сделай более интересный финал',authorFeedback:'Слишком очевидная развязка'};
test('turns human scene numbers into indexed exact-source task',()=>{
 const out=buildLocalDoctorTask(script,options);
 assert.deepEqual(out.targetIndices,[1,2]);assert.deepEqual(out.lockedIndices,[0]);
 assert.equal(out.sourceRevisionId,'scene-r2');assert.equal(out.authorFeedback,'Слишком очевидная развязка');
});
test('selects the correct project and refuses guessing when multiple projects exist',()=>{
 const collection={projects:[{id:'a',scenarioWorkspace:{script}},{id:'b',scenarioWorkspace:{script}}]};
 assert.throws(()=>buildLocalDoctorTask(collection,options),/project-id/);
 assert.equal(buildLocalDoctorTask(collection,{...options,projectId:'b'}).sourceRevisionId,'scene-r2');
});
test('disallows editing locked scenes and unparseable indices',()=>{
 assert.throws(()=>buildLocalDoctorTask(script,{...options,target:'1,3'}),/закрепил/);
 assert.throws(()=>buildLocalDoctorTask(script,{...options,target:'2;3'}),/номера кадров/);
});
test('writes offline JSON safely and refuses overwriting',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-doctor-task-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=join(dir,'project.json'),output=join(dir,'job.json');await writeFile(source,JSON.stringify({scenarioWorkspace:{script}}));
 await createLocalDoctorTaskFile(source,output,options);
 assert.equal(JSON.parse(await readFile(output,'utf8')).sourceRevisionId,'scene-r2');
 await assert.rejects(createLocalDoctorTaskFile(source,output,options),/EEXIST/);
});
