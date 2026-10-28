import {describe,expect,it} from 'vitest';
import {createPersonaProject,loadPersonaProjects,savePersonaProject,type PersonaProjectStorage} from './personaProjectStore';

function memoryStorage(seed:Record<string,string>={}):PersonaProjectStorage{
 const data=new Map(Object.entries(seed));
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},removeItem:key=>{data.delete(key)}};
}

describe('Persona project storage',()=>{
 it('migrates the previous single active draft without deleting its source keys',()=>{
  const storage=memoryStorage({
   'persona:active-idea:v1':JSON.stringify({id:'legacy-1',title:'Сцена',angle:'Одна репетиция',format:'reel',score:0}),
   'persona:active-draft:v1':JSON.stringify({title:'Черновик',slides:[],caption:'Текст',platformNotes:{instagram:'',vk:'',youtube:''}}),
   'persona:active-stage:v1':JSON.stringify('final_qa'),
  });

  const result=loadPersonaProjects(storage,()=> 'migrated-project',()=> '2026-10-28T10:00:00.000Z');

  expect(result.projects).toHaveLength(1);
  expect(result.projects[0]).toMatchObject({id:'migrated-project',title:'Сцена',contentType:'reel',sourceIdea:'Одна репетиция',stage:'final_qa',schemaVersion:1,revision:1});
  expect(result.projects[0].createdAt).toBe('2026-10-28T10:00:00.000Z');
  expect(storage.getItem('persona:active-idea:v1')).toContain('legacy-1');
 });

 it('keeps two projects independent through save and reload',()=>{
  const storage=memoryStorage();
  const first=createPersonaProject({id:'project-a',title:'Первый',contentType:'reel',sourceIdea:'Идея А',now:'2026-10-28T10:00:00.000Z'});
  const second=createPersonaProject({id:'project-b',title:'Второй',contentType:'carousel',sourceIdea:'Идея Б',now:'2026-10-28T10:01:00.000Z'});

  savePersonaProject(storage,{...first,title:'Первый — версия 2',revision:2,updatedAt:'2026-10-28T10:02:00.000Z'});
  savePersonaProject(storage,second);
  const reloaded=loadPersonaProjects(storage,()=> 'unused');

  expect(reloaded.projects).toHaveLength(2);
  expect(reloaded.projects.find(project=>project.id==='project-a')).toMatchObject({title:'Первый — версия 2',revision:2});
  expect(reloaded.projects.find(project=>project.id==='project-b')).toMatchObject({title:'Второй',sourceIdea:'Идея Б',revision:1});
 });

 it('quarantines corrupt project data instead of throwing or overwriting it',()=>{
  const storage=memoryStorage({'lifeos:persona:projects:v1':'{not-json'});

  const result=loadPersonaProjects(storage,()=> 'unused');

  expect(result.projects).toEqual([]);
  expect(storage.getItem('lifeos:persona:projects:v1:corrupt')).toBe('{not-json');
  expect(storage.getItem('lifeos:persona:projects:v1')).toBeNull();
 });
});
