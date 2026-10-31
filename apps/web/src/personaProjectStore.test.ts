import {describe,expect,it} from 'vitest';
import {createPersonaProject,loadPersonaProjects,resolvePersonaProjectSaveBase,savePersonaProject,validatePersonaProjectSnapshot,type PersonaProjectStorage} from './personaProjectStore';
import {importPersonaProductionBrief} from '../../../packages/core/src/persona-production-pipeline';

function memoryStorage(seed:Record<string,string>={}):PersonaProjectStorage{
 const data=new Map(Object.entries(seed));
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},removeItem:key=>{data.delete(key)}};
}

describe('Persona project storage',()=>{
 it('autosave uses the latest persisted scenario, not the older React script object',()=>{
  const storage=memoryStorage();
  const old=createPersonaProject({id:'p-reel',title:'Actor and Composer',contentType:'reel',sourceIdea:'Two roles',now:'2026-10-31T09:00:00Z'});
  savePersonaProject(storage,old);
  const savedWorkspace={version:1 as const,research:[],analyses:[],ideas:[],selectedIdeaId:'new-editorial-version'};
  const updated={...old,scenarioWorkspace:savedWorkspace,revision:2,updatedAt:'2026-10-31T09:01:00Z'};
  savePersonaProject(storage,updated);
  const base=resolvePersonaProjectSaveBase(storage,updated);
  expect(base.scenarioWorkspace).toEqual(savedWorkspace);
  const autosave={...base,lastOpenStep:'review',revision:base.revision+1};
  savePersonaProject(storage,autosave);
  expect(loadPersonaProjects(storage,()=> 'unused').projects[0].scenarioWorkspace).toEqual(savedWorkspace);
 });
 it('accepts a newer revision already written by this tab while React is behind',()=>{
  const storage=memoryStorage();
  const old=createPersonaProject({id:'same-tab',title:'First',contentType:'reel',sourceIdea:'Two roles',now:'2026-10-31T09:00:00Z'});
  savePersonaProject(storage,old);
  const ownLatest={...old,revision:2,title:'Own synchronous edit'};
  savePersonaProject(storage,ownLatest);
  const rendered={...old};
  const knownOwnRevision=ownLatest.revision;
  expect(resolvePersonaProjectSaveBase(storage,{...rendered,revision:knownOwnRevision}).title).toBe('Own synchronous edit');
  expect(()=>resolvePersonaProjectSaveBase(storage,rendered)).toThrow('persona_project_changed_since_open');
 });
 it('rejects stale React saves from another tab without rewriting the latest version',()=>{
  const storage=memoryStorage();
  const first=createPersonaProject({id:'p-reel',title:'First',contentType:'reel',sourceIdea:'Original',now:'2026-10-31T09:00:00Z'});
  savePersonaProject(storage,first);
  const oldTab={...first};
  const latest={...first,revision:2,title:'Second tab saved new text',updatedAt:'2026-10-31T09:02:00Z'};
  savePersonaProject(storage,latest);
  expect(()=>resolvePersonaProjectSaveBase(storage,oldTab)).toThrow('persona_project_changed_since_open');
  expect(loadPersonaProjects(storage,()=> 'unused').projects[0].title).toBe(latest.title);
  expect(resolvePersonaProjectSaveBase(storage,latest).revision).toBe(2);
 });
 it('refuses saves for a project deleted from storage rather than resurrecting it',()=>{
  const storage=memoryStorage();
  const removed=createPersonaProject({id:'deleted',title:'Old',contentType:'reel',sourceIdea:'Old',now:'2026-10-31T09:00:00Z'});
  expect(()=>resolvePersonaProjectSaveBase(storage,removed)).toThrow('persona_project_missing_at_save');
 });

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

 it('persists a versioned Scenario Intelligence workspace without changing media or legacy projects',()=>{
  const storage=memoryStorage();
  const project=createPersonaProject({id:'scenario-project',title:'Сценарий',contentType:'reel',sourceIdea:'Проверить сцену',now:'2026-10-30T10:00:00.000Z'});
  const workspace={
   version:1,
   research:[{id:'ref-1',url:'https://www.youtube.com/shorts/reference',platform:'youtube',observedAt:'2026-10-30T10:00:00.000Z',observationStatus:'metadata_only',evidence:{kind:'manual_link',observedFields:['url','title']}}],
   analyses:[],
   ideas:[{id:'scenario-idea-1',title:'Оригинальная идея',referenceIds:['ref-1'],originalConflict:'Конфликт без копирования чужой сцены.',actingTask:'Слушать партнёра.',ending:'Точная реакция.',productionComplexity:'low',estimatedDurationSec:25,creativeProfileFit:'Естественный голос.'}],
   selectedIdeaId:'scenario-idea-1',
   creativeProfile:{priorities:['выразительная игра','оригинальная музыка'],constraints:['не менять внешность']},
   editorialFeedback:[{revisionId:'r1',comment:'Шутка слишком предсказуемая, переписать финал',createdAt:'2026-10-30T10:00:00Z'}],
   script:{currentRevisionId:'r1',revisions:[{id:'r1',number:1,createdAt:'2026-10-30T10:00:00.000Z',beats:[],sourceFacts:[]}],approval:undefined},
  };

  savePersonaProject(storage,{...project,mediaAssets:[{id:'original-video'}],timeline:{clips:['original-video']},scenarioWorkspace:workspace,revision:2,updatedAt:'2026-10-30T10:01:00.000Z'} as any);
  const reloaded=loadPersonaProjects(storage,()=> 'unused');
  const saved=reloaded.projects[0] as any;

  expect(saved.scenarioWorkspace).toMatchObject({version:1,selectedIdeaId:'scenario-idea-1'});
  expect(saved.scenarioWorkspace.creativeProfile.priorities).toContain('оригинальная музыка');
  expect(saved.scenarioWorkspace.editorialFeedback[0].comment).toContain('финал');
  expect(saved.mediaAssets).toEqual([{id:'original-video'}]);
  expect(saved.timeline).toEqual({clips:['original-video']});
  expect(()=>validatePersonaProjectSnapshot({...project,scenarioWorkspace:{version:2}} as any)).toThrow('invalid_persona_project_snapshot');
 });

 it('loads an existing v1 project without a Scenario Intelligence workspace',()=>{
  const storage=memoryStorage();
  const project=createPersonaProject({id:'legacy-v1',title:'Старый',contentType:'photo',sourceIdea:'Идея',now:'2026-10-30T10:00:00.000Z'});
  savePersonaProject(storage,project);

  const reloaded=loadPersonaProjects(storage,()=> 'unused');

  expect((reloaded.projects[0] as any).scenarioWorkspace).toBeUndefined();
 });

 it('quarantines corrupt project data instead of throwing or overwriting it',()=>{
  const storage=memoryStorage({'lifeos:persona:projects:v1':'{not-json'});

  const result=loadPersonaProjects(storage,()=> 'unused');

  expect(result.projects).toEqual([]);
  expect(storage.getItem('lifeos:persona:projects:v1:corrupt')).toBe('{not-json');
  expect(storage.getItem('lifeos:persona:projects:v1')).toBeNull();
 });
});
