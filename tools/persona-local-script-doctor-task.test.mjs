import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildLocalDoctorTask,createLocalDoctorTaskFile} from './persona-local-script-doctor-task.mjs';
import {validateDoctorTask} from './persona-local-script-doctor.mjs';
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
 assert.deepEqual(validateDoctorTask(out).beats,out.beats);
});
test('optional author feedback survives canonical task export and subsequent validation',()=>{
 const exported=buildLocalDoctorTask(script,{target:'2,3',lock:'1',instruction:'Усилить причинность развязки'});
 assert.equal(exported.authorFeedback,null);
 assert.deepEqual(validateDoctorTask(JSON.parse(JSON.stringify(exported))),exported);
});
test('selects the correct project and refuses guessing when multiple projects exist',()=>{
 const collection={projects:[{id:'a',scenarioWorkspace:{script}},{id:'b',scenarioWorkspace:{script}}]};
 assert.throws(()=>buildLocalDoctorTask(collection,options),/project-id/);
 assert.equal(buildLocalDoctorTask(collection,{...options,projectId:'b'}).sourceRevisionId,'scene-r2');
});
test('converts a saved local Production Brief to an exact unapproved doctor task without changing its authored beats',()=>{
 const brief={version:1,ideaId:'idea-brief-01',sourceTitle:'Важная сцена',sourceAngle:'Герой скрывает опоздание от партнёра',script:[
  {order:1,line:'Я уже у входа.',action:'Скрывает тапочки за дверью.',durationSec:3},
  {order:2,line:'Назови вывеску.',action:'Пытается найти ответ в отражении.',durationSec:4},
  {order:3,line:'Открой дверь.',action:'Понимает, что партнёр уже пришёл.',durationSec:5}
 ]};
 const out=buildLocalDoctorTask(brief,{target:'2,3',instruction:'Усиль причинную развязку'});
 assert.equal(out.sourceRevisionId,'local-brief:idea-brief-01');
 assert.deepEqual(out.beats.map(beat=>beat.line),brief.script.map(beat=>beat.line));
 assert.deepEqual(out.beats.map(beat=>beat.durationSec),brief.script.map(beat=>beat.durationSec));
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
