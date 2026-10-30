import {describe,expect,it} from 'vitest';
import {createPersonaProject,loadPersonaProjects,savePersonaProject,type PersonaProjectStorage} from './personaProjectStore';
import {importPersonaProductionBrief} from '../../../packages/core/src/persona-production-pipeline';

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

 it('preserves the source URL of an author-adapted Reel through saving and reopening',()=>{
  const storage=memoryStorage();
  const project=createPersonaProject({id:'research-1',title:'Свой оригинальный сюжет',
   contentType:'reel',sourceIdea:'Показать характер героя через необычное решение',
   now:'2026-10-30T12:00:00.000Z'});
  project.sourceReferenceUrl='https://www.instagram.com/reel/ABC123/';
  project.scenarioOutline={
   premise:'Герой просит дать ему ещё одну попытку',hook:'Он появляется уже после окончания кастинга',
   protagonistGoal:'Убедить режиссёра посмотреть его пробу',obstacle:'Кастинг официально закончен',
   escalation:'Пробует играть сцену прямо в коридоре',turn:'Режиссёр выходит на шум',
   payoff:'Режиссёр неожиданно просит прислать самопробу',actingAction:'Добиться внимания',
   visualMoment:'Закрытая дверь кабинета становится частью мизансцены'
  };
  savePersonaProject(storage,project);
  const reloaded=loadPersonaProjects(storage,()=> 'unused');
  expect(reloaded.projects[0].sourceReferenceUrl).toBe(project.sourceReferenceUrl);
  expect(reloaded.projects[0].scenarioOutline).toEqual(project.scenarioOutline);
  expect(reloaded.projects[0].shootingPlan).toBeNull();
 });

 it('keeps an imported seven-shot shooting plan through a reload',()=>{
  const storage=memoryStorage();
  const brief={version:1 as const,ideaId:'external-id',sourceTitle:'Один день между театром и музыкой',sourceAngle:'Соединить две профессии одной историей',sourceFormat:'reel' as const,hook:{firstSeconds:'Я актёр.',visual:'Крупный план',delivery:'В объектив'},script:[3,4,5,5,4,6,4].map((durationSec,index)=>({order:index+1,durationSec,line:`Реплика ${index+1}`,action:'Действие'})),shots:[3,4,5,5,4,6,4].map((durationSec,index)=>({order:index+1,durationSec,framing:'medium' as const,angle:'Ракурс',cameraMovement:'Статика',lighting:'Мягкий свет',action:'Снять кадр'})),capture:{props:['Смартфон'],wardrobe:'Одежда',location:'Студия',lighting:'Мягкий свет',audio:{recording:'Близко к микрофону',processing:'Естественный голос'}},postProduction:{transitions:'Склейки',subtitles:{instruction:'Две строки',maxCharactersPerLine:42},color:'Естественный цвет'},adaptations:{reels:{aspectRatio:'9:16' as const,durationSec:31,instruction:'Reels'},shorts:{aspectRatio:'9:16' as const,durationSec:31,instruction:'Shorts'},vkClips:{aspectRatio:'9:16' as const,durationSec:31,instruction:'VK'}},factReferences:[]};
  const imported=importPersonaProductionBrief({brief,selectedIdea:{id:'project-reel',title:brief.sourceTitle,angle:brief.sourceAngle,format:'reel'}});
  const project=createPersonaProject({id:'project-reel',title:brief.sourceTitle,contentType:'reel',sourceIdea:brief.sourceAngle,now:'2026-10-29T12:00:00.000Z'});

  savePersonaProject(storage,{...project,shootingPlan:imported,stage:'final_qa',revision:2,updatedAt:'2026-10-29T12:01:00.000Z'});
  const reloaded=loadPersonaProjects(storage,()=> 'unused');
  const saved=reloaded.projects[0].shootingPlan as typeof imported;

  expect(saved.materials.shotList).toHaveLength(7);
  expect(saved.materials.productionBrief?.adaptations.reels.durationSec).toBe(31);
  expect(saved.materials.script[0].line).toBe('Реплика 1');
 });

 it('quarantines corrupt project data instead of throwing or overwriting it',()=>{
  const storage=memoryStorage({'lifeos:persona:projects:v1':'{not-json'});

  const result=loadPersonaProjects(storage,()=> 'unused');

  expect(result.projects).toEqual([]);
  expect(storage.getItem('lifeos:persona:projects:v1:corrupt')).toBe('{not-json');
  expect(storage.getItem('lifeos:persona:projects:v1')).toBeNull();
 });
});
